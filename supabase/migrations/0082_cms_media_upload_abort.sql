-- Homologacao final: compensa uploads parciais e limita superfícies raster
-- antes de qualquer decode. Os paths de GC são sempre derivados no servidor.

do $$
begin
  if exists (
    select 1
    from public.cms_media_assets asset
    where (asset.width is null) <> (asset.height is null)
      or (
        asset.width is not null
        and asset.height is not null
        and (
          asset.width not between 1 and 20000
          or asset.height not between 1 and 20000
          or asset.width::bigint * asset.height::bigint > 32000000
        )
      )
  ) then
    raise exception 'CMS_MEDIA_OPERATIONAL_PIXEL_PREFLIGHT_FAILED'
      using errcode = '23514';
  end if;
end;
$$;

alter table public.cms_media_assets
  add column upload_token_expires_at timestamptz;
update public.cms_media_assets asset
set upload_token_expires_at = asset.created_at + interval '135 minutes'
where asset.upload_token_expires_at is null;
alter table public.cms_media_assets
  alter column upload_token_expires_at set default (statement_timestamp() + interval '135 minutes'),
  alter column upload_token_expires_at set not null,
  add constraint cms_media_upload_token_expiry_valid
    check (upload_token_expires_at >= created_at + interval '120 minutes');
create index cms_media_stale_upload_watchdog_idx
  on public.cms_media_assets (upload_token_expires_at, id)
  where archived_at is null
    and processing_status in ('awaiting_upload', 'processing', 'failed');

create or replace function public.cms_block_media_delete()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_claim_id uuid := nullif(current_setting('cms.dam_gc_claim_id', true), '')::uuid;
  v_incomplete_gc boolean := false;
begin
  if exists (select 1 from public.cms_media_usages where asset_id = old.id)
     or exists (
       select 1
       from public.cms_dam_replacements
       where status = 'active'
         and (source_asset_id = old.id or target_asset_id = old.id)
     ) then
    raise exception 'CMS_MEDIA_IN_USE' using errcode = '23503';
  end if;
  if current_setting('cms.dam_gc_operation', true) = 'complete'
     and v_claim_id is not null
     and old.gc_claim_id = v_claim_id
     and old.processing_status in ('failed', 'rejected')
     and old.scan_status in ('failed', 'rejected')
     and old.archived_at is not null
     and old.upload_token_expires_at <= clock_timestamp() then
    select exists (
      select 1
      from public.cms_dam_gc_jobs job
      where job.id = old.gc_claim_job_id
        and job.asset_id = old.id
        and job.status = 'processing'
        and job.processing_claim_id = v_claim_id
        and job.asset_snapshot ->> 'disposition' = 'incomplete_upload'
    ) into v_incomplete_gc;
  end if;
  if old.archived_at is not null
     and old.archived_at > statement_timestamp() - interval '30 days'
     and not v_incomplete_gc then
    raise exception 'CMS_DAM_RETENTION_ACTIVE' using errcode = '23503';
  end if;
  return old;
end;
$$;

create or replace function private.cms_validate_dam_crop_aspect()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_asset_width integer;
  v_asset_height integer;
  v_left numeric;
  v_right numeric;
begin
  select asset.width, asset.height
  into v_asset_width, v_asset_height
  from public.cms_media_assets asset
  where asset.id = new.asset_id;
  if not found or v_asset_width is null or v_asset_height is null then
    raise exception 'CMS_DAM_CROP_ASPECT_INVALID' using errcode = '23514';
  end if;
  v_left := new.crop_width * v_asset_width * new.aspect_height;
  v_right := new.crop_height * v_asset_height * new.aspect_width;
  if abs(v_left - v_right) > greatest(abs(v_left), abs(v_right)) * 0.01 then
    raise exception 'CMS_DAM_CROP_ASPECT_INVALID' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists cms_dam_crop_aspect_guard on public.cms_dam_crops;
create trigger cms_dam_crop_aspect_guard
before insert or update of asset_id,aspect_width,aspect_height,crop_width,crop_height
on public.cms_dam_crops
for each row execute function private.cms_validate_dam_crop_aspect();

create or replace function private.cms_block_dam_gc_relationship_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_asset_ids uuid[];
begin
  if tg_table_name = 'cms_media_usages' then
    v_asset_ids := array[new.asset_id];
  elsif tg_table_name = 'cms_dam_replacements' and new.status = 'active' then
    v_asset_ids := array[new.source_asset_id, new.target_asset_id];
  else
    return new;
  end if;
  if exists (
    select 1
    from public.cms_media_assets asset
    where asset.id = any(v_asset_ids)
      and asset.gc_claim_id is not null
  ) then
    raise exception 'CMS_DAM_GC_ASSET_FENCED' using errcode = '55006';
  end if;
  return new;
end;
$$;

drop trigger if exists cms_media_usage_gc_fence_guard on public.cms_media_usages;
create trigger cms_media_usage_gc_fence_guard
before insert or update of asset_id on public.cms_media_usages
for each row execute function private.cms_block_dam_gc_relationship_write();
drop trigger if exists cms_dam_replacement_gc_fence_guard on public.cms_dam_replacements;
create trigger cms_dam_replacement_gc_fence_guard
before insert or update of source_asset_id,target_asset_id,status
on public.cms_dam_replacements
for each row execute function private.cms_block_dam_gc_relationship_write();

alter table public.cms_media_assets
  add constraint cms_media_operational_pixel_limit
  check (
    (width is null and height is null)
    or (
      width is not null
      and height is not null
      and width between 1 and 20000
      and height between 1 and 20000
      and width::bigint * height::bigint <= 32000000
    )
  ) not valid;
alter table public.cms_media_assets
  validate constraint cms_media_operational_pixel_limit;

-- Todas as rotas antigas que criam jobs passam a declarar a finalidade do
-- snapshot. Rejeições de upload nunca dependem de rows de variantes que podem
-- não ter sido gravadas; arquivos arquivados normalmente mantêm a retenção.
create or replace function private.cms_classify_media_gc_job()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_asset public.cms_media_assets%rowtype;
  v_paths jsonb;
  v_has_asset boolean := false;
begin
  if new.asset_snapshot ? 'disposition' then
    return new;
  end if;
  if new.asset_id is not null then
    select asset.* into v_asset
    from public.cms_media_assets asset
    where asset.id = new.asset_id;
    v_has_asset := found;
  end if;
  if v_has_asset
     and v_asset.processing_status in ('failed', 'rejected')
     and v_asset.archived_at is not null then
    v_paths := jsonb_build_array(
      v_asset.storage_path,
      'cms/' || v_asset.id::text || '/thumbnail.webp',
      'cms/' || v_asset.id::text || '/thumbnail.avif',
      'cms/' || v_asset.id::text || '/medium.webp',
      'cms/' || v_asset.id::text || '/medium.avif',
      'cms/' || v_asset.id::text || '/large.webp',
      'cms/' || v_asset.id::text || '/large.avif'
    );
    new.asset_snapshot := new.asset_snapshot || jsonb_build_object(
      'disposition', 'incomplete_upload', 'paths', v_paths
    );
    new.execute_after := greatest(new.execute_after, v_asset.upload_token_expires_at);
  else
    new.asset_snapshot := new.asset_snapshot || jsonb_build_object(
      'disposition', 'retained_archive'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists cms_dam_gc_job_classification_guard on public.cms_dam_gc_jobs;
create trigger cms_dam_gc_job_classification_guard
before insert or update of asset_snapshot on public.cms_dam_gc_jobs
for each row execute function private.cms_classify_media_gc_job();

do $$
declare
  v_previous_compensating text := current_setting('cms.qa_compensating', true);
begin
  perform set_config('cms.qa_compensating', 'on', true);
  update public.cms_dam_gc_jobs job
  set asset_snapshot = job.asset_snapshot
  where not (job.asset_snapshot ? 'disposition');
  perform set_config(
    'cms.qa_compensating',
    coalesce(nullif(v_previous_compensating, ''), 'off'),
    true
  );
exception when others then
  perform set_config(
    'cms.qa_compensating',
    coalesce(nullif(v_previous_compensating, ''), 'off'),
    true
  );
  raise;
end;
$$;

create or replace function public.cms_abort_dam_upload(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_asset_id uuid,
  p_reason_code text,
  p_command_id uuid,
  p_idempotency_key uuid,
  p_request_hash text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_lease_environment text;
  v_receipt public.cms_dam_command_receipts%rowtype;
  v_asset public.cms_media_assets%rowtype;
  v_response jsonb;
  v_paths jsonb;
begin
  if p_environment not in ('local', 'staging', 'production')
     or p_site_key <> 'main'
     or p_asset_id is null
     or p_reason_code not in (
       'client_upload_failed', 'client_cancelled', 'client_processing_failed'
     )
     or p_command_id is null
     or p_idempotency_key is null
     or p_request_hash !~ '^[0-9a-f]{64}$'
     or p_correlation_id is null then
    raise exception 'CMS_DAM_ABORT_INVALID' using errcode = '22023';
  end if;

  perform private.cms_assert_dam_actor_context(
    p_actor_id,
    'cms:media.upload',
    p_aal,
    p_session_id,
    p_issued_at
  );
  select lease.environment into v_lease_environment
  from private.cms_qa_actor_leases lease
  where lease.actor_id = p_actor_id;
  if found and v_lease_environment <> p_environment then
    raise exception 'CMS_DAM_SCOPE_MISMATCH' using errcode = '42501';
  end if;
  perform set_config('cms.qa_mutation_actor_id', p_actor_id::text, true);

  insert into public.cms_dam_command_receipts (
    actor_id, action, idempotency_key, command_id, request_hash, correlation_id
  ) values (
    p_actor_id, 'abort_upload', p_idempotency_key, p_command_id,
    p_request_hash, p_correlation_id
  ) on conflict (actor_id, action, idempotency_key) do nothing;
  if not found then
    select receipt.* into v_receipt
    from public.cms_dam_command_receipts receipt
    where receipt.actor_id = p_actor_id
      and receipt.action = 'abort_upload'
      and receipt.idempotency_key = p_idempotency_key;
    if v_receipt.request_hash <> p_request_hash then
      raise exception 'CMS_DAM_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    if v_receipt.response is null then
      raise exception 'CMS_DAM_COMMAND_IN_PROGRESS' using errcode = 'P0001';
    end if;
    return v_receipt.response;
  end if;

  select asset.* into v_asset
  from public.cms_media_assets asset
  where asset.id = p_asset_id
    and asset.created_by = p_actor_id
    and private.cms_dam_asset_in_actor_scope(
      p_actor_id, asset.created_by, asset.source_kind
    )
  for update;
  if not found then
    raise exception 'CMS_DAM_ASSET_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_paths := jsonb_build_array(
    v_asset.storage_path,
    'cms/' || v_asset.id::text || '/thumbnail.webp',
    'cms/' || v_asset.id::text || '/thumbnail.avif',
    'cms/' || v_asset.id::text || '/medium.webp',
    'cms/' || v_asset.id::text || '/medium.avif',
    'cms/' || v_asset.id::text || '/large.webp',
    'cms/' || v_asset.id::text || '/large.avif'
  );

  if v_asset.processing_status in ('awaiting_upload', 'failed')
     and v_asset.archived_at is null then
    update public.cms_media_assets asset
    set processing_status = 'failed',
        scan_status = 'failed',
        archived_at = statement_timestamp(),
        archived_by = p_actor_id,
        finalization_claim_id = null,
        finalization_claimed_by = null,
        finalization_claimed_at = null,
        finalization_claim_expires_at = null,
        lock_version = asset.lock_version + 1
    where asset.id = v_asset.id
      and asset.lock_version = v_asset.lock_version
    returning asset.* into v_asset;
    if not found then
      raise exception 'CMS_DAM_ABORT_CAS_CONFLICT' using errcode = 'P0001';
    end if;

    insert into public.cms_dam_gc_jobs (
      asset_id, asset_snapshot, execute_after, created_by
    ) values (
      v_asset.id,
      jsonb_build_object(
        'assetId', v_asset.id,
        'storagePath', v_asset.storage_path,
        'sha256', v_asset.sha256,
        'disposition', 'incomplete_upload',
        'paths', v_paths
      ),
      greatest(v_asset.upload_token_expires_at, statement_timestamp()),
      p_actor_id
    ) on conflict (asset_id)
      where status in ('pending', 'processing', 'blocked', 'failed')
      do nothing;
    update public.cms_dam_gc_jobs job
    set asset_snapshot = jsonb_build_object(
          'assetId', v_asset.id,
          'storagePath', v_asset.storage_path,
          'sha256', v_asset.sha256,
          'disposition', 'incomplete_upload',
          'paths', v_paths
        ),
        execute_after = greatest(
          job.execute_after,
          v_asset.upload_token_expires_at,
          statement_timestamp()
        ),
        status = case when job.attempts >= 20 then 'blocked' else 'pending' end,
        last_error = case when job.attempts >= 20 then job.last_error else null end
    where job.asset_id = v_asset.id
      and job.status in ('pending', 'failed', 'blocked')
      and job.processing_claim_id is null;

    insert into public.cms_audit_log (
      actor_id, action, target_type, target_id, event_data, correlation_id
    ) values (
      p_actor_id,
      'cms:media.upload_aborted',
      'media_asset',
      p_asset_id::text,
      jsonb_build_object('reasonCode', p_reason_code, 'gcScheduled', true),
      p_correlation_id
    );
    insert into public.cms_dam_events (
      asset_id, actor_id, event_type, event_data, correlation_id
    ) values (
      p_asset_id,
      p_actor_id,
      'abort_upload',
      jsonb_build_object('reasonCode', p_reason_code, 'gcScheduled', true),
      p_correlation_id
    );
  elsif v_asset.processing_status not in ('failed', 'rejected')
     or v_asset.archived_at is null then
    raise exception 'CMS_DAM_RESERVATION_CLOSED' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.cms_dam_gc_jobs job
    where job.asset_id = v_asset.id
      and job.status in ('pending', 'processing', 'blocked', 'failed')
      and job.asset_snapshot ->> 'disposition' = 'incomplete_upload'
      and job.asset_snapshot -> 'paths' = v_paths
      and job.execute_after >= v_asset.upload_token_expires_at
  ) then
    raise exception 'CMS_DAM_ABORT_GC_INVARIANT' using errcode = 'P0001';
  end if;

  v_response := jsonb_build_object(
    'schemaVersion', 1,
    'commandId', p_command_id,
    'correlationId', p_correlation_id,
    'assetId', v_asset.id,
    'status', v_asset.processing_status,
    'archived', true,
    'gcScheduled', true,
    'gcAfter', greatest(v_asset.upload_token_expires_at, statement_timestamp())
  );
  update public.cms_dam_command_receipts receipt
  set response = v_response,
      completed_at = statement_timestamp()
  where receipt.actor_id = p_actor_id
    and receipt.action = 'abort_upload'
    and receipt.idempotency_key = p_idempotency_key;
  return v_response;
end;
$$;

create or replace function public.cms_fail_dam_finalization(
  p_actor_id uuid,
  p_asset_id uuid,
  p_claim_id uuid,
  p_reason_code text,
  p_correlation_id uuid,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_asset public.cms_media_assets%rowtype;
  v_status text;
  v_archive boolean;
  v_paths jsonb;
begin
  perform private.cms_assert_dam_actor_context(
    p_actor_id,
    'cms:media.upload',
    p_aal,
    p_session_id,
    p_issued_at
  );
  if p_reason_code not in (
    'duplicate', 'invalid_media', 'incomplete_variants',
    'storage_unavailable', 'validation_failed'
  ) or p_correlation_id is null then
    raise exception 'CMS_DAM_FINALIZATION_INVALID' using errcode = '22023';
  end if;
  perform set_config('cms.qa_mutation_actor_id', p_actor_id::text, true);

  select asset.* into v_asset
  from public.cms_media_assets asset
  where asset.id = p_asset_id
  for update;
  if not found then
    raise exception 'CMS_DAM_ASSET_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_asset.created_by <> p_actor_id
     or not private.cms_dam_asset_in_actor_scope(
       p_actor_id, v_asset.created_by, v_asset.source_kind
     )
     or v_asset.processing_status <> 'processing'
     or v_asset.finalization_claim_id <> p_claim_id
     or v_asset.finalization_claimed_by <> p_actor_id then
    raise exception 'CMS_DAM_FINALIZATION_CLAIM_INVALID' using errcode = '42501';
  end if;

  v_status := case
    when p_reason_code in ('duplicate', 'invalid_media', 'validation_failed') then 'rejected'
    else 'failed'
  end;
  v_archive := p_reason_code in ('duplicate', 'invalid_media', 'validation_failed');
  update public.cms_media_assets asset
  set processing_status = v_status,
      scan_status = case when v_archive then 'rejected' else 'failed' end,
      scan_engine = 'raster-metadata-v3',
      archived_at = case when v_archive then statement_timestamp() else asset.archived_at end,
      archived_by = case when v_archive then p_actor_id else asset.archived_by end,
      finalization_claim_id = null,
      finalization_claimed_by = null,
      finalization_claimed_at = null,
      finalization_claim_expires_at = null,
      lock_version = asset.lock_version + 1
  where asset.id = v_asset.id
    and asset.lock_version = v_asset.lock_version
    and asset.processing_status = 'processing'
    and asset.finalization_claim_id = p_claim_id
  returning asset.* into v_asset;
  if not found then
    raise exception 'CMS_DAM_FINALIZATION_CAS_CONFLICT' using errcode = 'P0001';
  end if;

  if v_archive then
    v_paths := jsonb_build_array(
      v_asset.storage_path,
      'cms/' || v_asset.id::text || '/thumbnail.webp',
      'cms/' || v_asset.id::text || '/thumbnail.avif',
      'cms/' || v_asset.id::text || '/medium.webp',
      'cms/' || v_asset.id::text || '/medium.avif',
      'cms/' || v_asset.id::text || '/large.webp',
      'cms/' || v_asset.id::text || '/large.avif'
    );
    insert into public.cms_dam_gc_jobs (
      asset_id, asset_snapshot, execute_after, created_by
    ) values (
      v_asset.id,
      jsonb_build_object(
        'assetId', v_asset.id,
        'storagePath', v_asset.storage_path,
        'sha256', v_asset.sha256,
        'disposition', 'incomplete_upload',
        'paths', v_paths
      ),
      greatest(v_asset.upload_token_expires_at, statement_timestamp()),
      p_actor_id
    ) on conflict (asset_id)
      where status in ('pending', 'processing', 'blocked', 'failed')
      do nothing;
    update public.cms_dam_gc_jobs job
    set asset_snapshot = jsonb_build_object(
          'assetId', v_asset.id,
          'storagePath', v_asset.storage_path,
          'sha256', v_asset.sha256,
          'disposition', 'incomplete_upload',
          'paths', v_paths
        ),
        execute_after = greatest(
          job.execute_after,
          v_asset.upload_token_expires_at,
          statement_timestamp()
        ),
        status = case when job.attempts >= 20 then 'blocked' else 'pending' end,
        last_error = case when job.attempts >= 20 then job.last_error else null end
    where job.asset_id = v_asset.id
      and job.status in ('pending', 'failed', 'blocked')
      and job.processing_claim_id is null;
    if not exists (
      select 1
      from public.cms_dam_gc_jobs job
      where job.asset_id = v_asset.id
        and job.status in ('pending', 'processing', 'blocked', 'failed')
        and job.asset_snapshot ->> 'disposition' = 'incomplete_upload'
        and job.asset_snapshot -> 'paths' = v_paths
        and job.execute_after >= v_asset.upload_token_expires_at
    ) then
      raise exception 'CMS_DAM_FINALIZATION_GC_INVARIANT' using errcode = 'P0001';
    end if;
  end if;

  insert into public.cms_audit_log (
    actor_id, action, target_type, target_id, event_data, correlation_id
  ) values (
    p_actor_id,
    'cms:media.finalization_failed',
    'media_asset',
    p_asset_id::text,
    jsonb_build_object(
      'reasonCode', p_reason_code,
      'status', v_status,
      'gcScheduled', v_archive
    ),
    p_correlation_id
  );
  insert into public.cms_dam_events (
    asset_id, actor_id, event_type, event_data, correlation_id
  ) values (
    p_asset_id,
    p_actor_id,
    'finalization_failed',
    jsonb_build_object(
      'reasonCode', p_reason_code,
      'status', v_status,
      'gcScheduled', v_archive
    ),
    p_correlation_id
  );
  return jsonb_build_object(
    'assetId', v_asset.id,
    'status', v_asset.processing_status,
    'archived', v_asset.archived_at is not null,
    'gcScheduled', v_archive,
    'gcAfter', case when v_archive then greatest(
      v_asset.upload_token_expires_at, statement_timestamp()
    ) else null end
  );
end;
$$;

create or replace function public.cms_list_media_usages_scoped(
  p_actor_id uuid,
  p_environment text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_asset_ids uuid[]
)
returns table (
  asset_id uuid,
  item_id uuid,
  revision_id uuid,
  block_id uuid,
  usage_kind text,
  created_at timestamptz,
  content_type text,
  display_title text,
  admin_path text,
  block_label text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
begin
  if p_environment not in ('local', 'staging', 'production')
     or p_asset_ids is null
     or cardinality(p_asset_ids) not between 1 and 100
     or cardinality(p_asset_ids) <> cardinality(array(
       select distinct supplied.id from unnest(p_asset_ids) supplied(id)
     )) then
    raise exception 'CMS_DAM_USAGE_QUERY_INVALID' using errcode = '22023';
  end if;
  perform private.cms_assert_dam_actor_context(
    p_actor_id,
    'cms:media.read',
    p_aal,
    p_session_id,
    p_issued_at
  );

  return query
  select
    usage.asset_id,
    usage.item_id,
    usage.revision_id,
    usage.block_id,
    usage.usage_kind,
    usage.created_at,
    item.content_type,
    left(regexp_replace(btrim(coalesce(
      nullif(revision.payload ->> 'title', ''),
      nullif(draft.payload ->> 'title', ''),
      nullif(progressive.working_title, ''),
      replace(item.slug, '-', ' ')
    )), '[[:cntrl:]]', ' ', 'g'), 180) as display_title,
    case
      when item.content_type = 'product' then '/admin/produtos/' || item.id::text
      when item.content_type in ('service', 'industry', 'application', 'solution')
        then '/admin/descoberta/' || item.content_type || '/' || item.id::text
      when item.content_type in ('page', 'homepage') then '/admin/paginas/' || item.id::text
      when item.content_type = 'campaign'
        then '/admin/marketing/campanhas/' || item.id::text
      else '/admin/conteudo/' || item.id::text
    end as admin_path,
    case
      when usage.block_id is null then null
      else left(regexp_replace(btrim(coalesce(
        nullif(block.value ->> 'label', ''),
        nullif(block.value #>> '{data,title}', ''),
        nullif(block.value ->> 'type', ''),
        'Bloco associado'
      )), '[[:cntrl:]]', ' ', 'g'), 180)
    end as block_label
  from public.cms_media_usages usage
  join public.cms_media_assets asset on asset.id = usage.asset_id
  join public.cms_content_items item on item.id = usage.item_id
  left join public.cms_content_revisions revision
    on revision.id = usage.revision_id and revision.item_id = usage.item_id
  left join public.cms_content_drafts draft on draft.item_id = item.id
  left join public.cms_content_drafts_v2 progressive on progressive.item_id = item.id
  left join lateral (
    select candidate.value
    from jsonb_array_elements(
      case when jsonb_typeof(coalesce(revision.payload, draft.payload) -> 'blocks') = 'array'
        then coalesce(revision.payload, draft.payload) -> 'blocks'
        else '[]'::jsonb
      end
    ) with ordinality candidate(value, position)
    where usage.block_id is not null
      and candidate.value ->> 'id' = usage.block_id::text
    order by candidate.position
    limit 1
  ) block on true
  where usage.asset_id = any(p_asset_ids)
    and private.cms_dam_asset_in_actor_scope(
      p_actor_id, asset.created_by, asset.source_kind
    )
    and private.cms_content_item_graph_scope_allowed(
      p_actor_id, item.id, p_environment
    )
    and public.cms_actor_authorized(
      p_actor_id,
      public.cms_content_permission(item.content_type, 'read'),
      p_aal,
      p_session_id,
      p_issued_at
    )
  order by usage.created_at desc, usage.id;
end;
$$;

-- O total sem identificadores impede que a UI confunda "nenhum vínculo
-- visível" com "seguro para arquivar", sem revelar conteúdo fora do grafo.
create or replace function public.cms_count_media_usages_scoped(
  p_actor_id uuid,
  p_environment text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_asset_ids uuid[]
)
returns table (
  asset_id uuid,
  total_usage_count integer,
  visible_usage_count integer,
  hidden_usage_count integer
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
begin
  if p_environment not in ('local', 'staging', 'production')
     or p_asset_ids is null
     or cardinality(p_asset_ids) not between 1 and 100
     or cardinality(p_asset_ids) <> cardinality(array(
       select distinct supplied.id from unnest(p_asset_ids) supplied(id)
     )) then
    raise exception 'CMS_DAM_USAGE_QUERY_INVALID' using errcode = '22023';
  end if;
  perform private.cms_assert_dam_actor_context(
    p_actor_id, 'cms:media.read', p_aal, p_session_id, p_issued_at
  );
  return query
  with counted as (
    select
      asset.id as scoped_asset_id,
      count(usage.id)::integer as total_count,
      count(usage.id) filter (
        where item.id is not null
          and private.cms_content_item_graph_scope_allowed(
            p_actor_id, item.id, p_environment
          )
          and public.cms_actor_authorized(
            p_actor_id,
            public.cms_content_permission(item.content_type, 'read'),
            p_aal,
            p_session_id,
            p_issued_at
          )
      )::integer as visible_count
    from public.cms_media_assets asset
    left join public.cms_media_usages usage on usage.asset_id = asset.id
    left join public.cms_content_items item on item.id = usage.item_id
    where asset.id = any(p_asset_ids)
      and private.cms_dam_asset_in_actor_scope(
        p_actor_id, asset.created_by, asset.source_kind
      )
    group by asset.id
  )
  select
    counted.scoped_asset_id,
    counted.total_count,
    counted.visible_count,
    counted.total_count - counted.visible_count
  from counted;
end;
$$;

-- Compatibilidade expand-only do cliente legado: a antiga acao `delete`
-- agora arquiva de forma reversivel e conserva o mesmo contrato de sucesso.
-- A funcao e independente da flag ev2.dam, mas nao de autenticacao, AAL2,
-- permissao de gestao, escopo ou invariantes de uso/substituicao.
create or replace function public.cms_archive_legacy_media(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_asset_id uuid,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_lease_environment text;
  v_asset public.cms_media_assets%rowtype;
  v_paths jsonb;
  v_gc_after timestamptz;
begin
  if p_environment not in ('local', 'staging', 'production')
     or p_site_key <> 'main'
     or p_asset_id is null
     or p_correlation_id is null then
    raise exception 'CMS_DAM_LEGACY_ARCHIVE_INVALID' using errcode = '22023';
  end if;
  perform private.cms_assert_dam_actor_context(
    p_actor_id,
    'cms:media.manage',
    p_aal,
    p_session_id,
    p_issued_at
  );
  select lease.environment into v_lease_environment
  from private.cms_qa_actor_leases lease
  where lease.actor_id = p_actor_id;
  if found and v_lease_environment <> p_environment then
    raise exception 'CMS_DAM_SCOPE_MISMATCH' using errcode = '42501';
  end if;
  perform set_config('cms.qa_mutation_actor_id', p_actor_id::text, true);

  select asset.* into v_asset
  from public.cms_media_assets asset
  where asset.id = p_asset_id
    and private.cms_dam_asset_in_actor_scope(
      p_actor_id, asset.created_by, asset.source_kind
    )
  for update;
  if not found then
    raise exception 'CMS_DAM_ASSET_NOT_FOUND' using errcode = 'P0001';
  end if;
  lock table public.cms_dam_replacements in share row exclusive mode;
  if v_asset.finalization_claim_id is not null
     or v_asset.gc_claim_id is not null
     or exists (
       select 1 from public.cms_media_usages usage where usage.asset_id = v_asset.id
     )
     or exists (
       select 1
       from public.cms_dam_replacements replacement
       where replacement.status = 'active'
         and (
           replacement.source_asset_id = v_asset.id
           or replacement.target_asset_id = v_asset.id
         )
     ) then
    raise exception 'CMS_MEDIA_IN_USE' using errcode = 'P0001';
  end if;

  if v_asset.archived_at is null then
    if v_asset.processing_status <> 'ready' or v_asset.scan_status <> 'clean' then
      raise exception 'CMS_DAM_LEGACY_ARCHIVE_STATE_INVALID' using errcode = 'P0001';
    end if;
    update public.cms_media_assets asset
    set archived_at = statement_timestamp(),
        archived_by = p_actor_id,
        lock_version = asset.lock_version + 1
    where asset.id = v_asset.id
      and asset.lock_version = v_asset.lock_version
      and asset.archived_at is null
    returning asset.* into v_asset;
    if not found then
      raise exception 'CMS_DAM_LEGACY_ARCHIVE_CAS_CONFLICT' using errcode = 'P0001';
    end if;

    insert into public.cms_audit_log (
      actor_id, action, target_type, target_id, event_data, correlation_id
    ) values (
      p_actor_id,
      'cms:media.legacy_archive',
      'media_asset',
      p_asset_id::text,
      jsonb_build_object('retentionDays', 30, 'gcScheduled', true),
      p_correlation_id
    );
    insert into public.cms_dam_events (
      asset_id, actor_id, event_type, event_data, correlation_id
    ) values (
      p_asset_id,
      p_actor_id,
      'legacy_archive',
      jsonb_build_object('retentionDays', 30, 'gcScheduled', true),
      p_correlation_id
    );
  end if;

  v_paths := jsonb_build_array(v_asset.storage_path) || coalesce(
    (
      select jsonb_agg(variant.transform_path order by variant.transform_path)
      from public.cms_media_variants variant
      where variant.asset_id = v_asset.id
    ),
    '[]'::jsonb
  );
  v_gc_after := v_asset.archived_at + interval '30 days';
  insert into public.cms_dam_gc_jobs (
    asset_id, asset_snapshot, execute_after, created_by
  ) values (
    v_asset.id,
    jsonb_build_object(
      'assetId', v_asset.id,
      'storagePath', v_asset.storage_path,
      'sha256', v_asset.sha256,
      'disposition', 'retained_archive',
      'paths', v_paths
    ),
    v_gc_after,
    p_actor_id
  ) on conflict (asset_id)
    where status in ('pending', 'processing', 'blocked', 'failed')
    do nothing;
  if not exists (
    select 1
    from public.cms_dam_gc_jobs job
    where job.asset_id = v_asset.id
      and job.status in ('pending', 'processing', 'blocked', 'failed')
  ) then
    raise exception 'CMS_DAM_LEGACY_ARCHIVE_GC_INVARIANT' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'assetId', v_asset.id,
    'deleted', true,
    'archived', true,
    'status', 'archived',
    'gcAfter', v_gc_after
  );
end;
$$;

-- O fallback V1 também precisa conseguir desfazer o arquivamento enquanto a
-- retenção está ativa. Uploads incompletos/rejeitados nunca são restauráveis.
create or replace function public.cms_restore_legacy_media(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_asset_id uuid,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_lease_environment text;
  v_asset public.cms_media_assets%rowtype;
  v_job public.cms_dam_gc_jobs%rowtype;
begin
  if p_environment not in ('local', 'staging', 'production')
     or p_site_key <> 'main'
     or p_asset_id is null
     or p_correlation_id is null then
    raise exception 'CMS_DAM_LEGACY_RESTORE_INVALID' using errcode = '22023';
  end if;
  perform private.cms_assert_dam_actor_context(
    p_actor_id, 'cms:media.manage', p_aal, p_session_id, p_issued_at
  );
  select lease.environment into v_lease_environment
  from private.cms_qa_actor_leases lease
  where lease.actor_id = p_actor_id;
  if found and v_lease_environment <> p_environment then
    raise exception 'CMS_DAM_SCOPE_MISMATCH' using errcode = '42501';
  end if;
  perform set_config('cms.qa_mutation_actor_id', p_actor_id::text, true);

  select asset.* into v_asset
  from public.cms_media_assets asset
  where asset.id = p_asset_id
    and private.cms_dam_asset_in_actor_scope(
      p_actor_id, asset.created_by, asset.source_kind
    )
  for update;
  if not found then
    raise exception 'CMS_DAM_ASSET_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_asset.archived_at is null then
    return jsonb_build_object(
      'assetId', v_asset.id,
      'restored', true,
      'status', v_asset.processing_status,
      'replayed', true
    );
  end if;
  if v_asset.processing_status <> 'ready' or v_asset.scan_status <> 'clean' then
    raise exception 'CMS_DAM_RESTORE_WINDOW_CLOSED' using errcode = 'P0001';
  end if;
  if v_asset.gc_claim_id is not null
     or v_asset.finalization_claim_id is not null then
    raise exception 'CMS_DAM_RESTORE_BUSY' using errcode = 'P0001';
  end if;
  select job.* into v_job
  from public.cms_dam_gc_jobs job
  where job.asset_id = v_asset.id
    and job.status in ('pending', 'processing', 'blocked', 'failed')
  for update;
  if not found
     or v_job.asset_snapshot ->> 'disposition' <> 'retained_archive'
     or v_job.status = 'processing'
     or v_job.processing_claim_id is not null
     or v_job.execute_after <= statement_timestamp()
     or v_asset.archived_at <= statement_timestamp() - interval '30 days' then
    raise exception 'CMS_DAM_RESTORE_WINDOW_CLOSED' using errcode = 'P0001';
  end if;

  update public.cms_dam_gc_jobs job
  set status = 'canceled',
      completed_at = null,
      last_error = null,
      processing_claim_id = null,
      processing_claimed_by = null,
      processing_claimed_at = null,
      processing_claim_expires_at = null,
      prepared_asset_lock_version = null
  where job.id = v_job.id
    and job.status in ('pending', 'blocked', 'failed')
    and job.processing_claim_id is null;
  if not found then
    raise exception 'CMS_DAM_RESTORE_CAS_CONFLICT' using errcode = 'P0001';
  end if;
  update public.cms_media_assets asset
  set archived_at = null,
      archived_by = null,
      lock_version = asset.lock_version + 1
  where asset.id = v_asset.id
    and asset.lock_version = v_asset.lock_version
    and asset.archived_at = v_asset.archived_at
    and asset.gc_claim_id is null
  returning asset.* into v_asset;
  if not found then
    raise exception 'CMS_DAM_RESTORE_CAS_CONFLICT' using errcode = 'P0001';
  end if;
  insert into public.cms_audit_log (
    actor_id, action, target_type, target_id, event_data, correlation_id
  ) values (
    p_actor_id, 'cms:media.legacy_restore', 'media_asset', p_asset_id::text,
    jsonb_build_object('gcCanceled', true), p_correlation_id
  );
  insert into public.cms_dam_events (
    asset_id, actor_id, event_type, event_data, correlation_id
  ) values (
    p_asset_id, p_actor_id, 'legacy_restore',
    jsonb_build_object('gcCanceled', true), p_correlation_id
  );
  return jsonb_build_object(
    'assetId', v_asset.id,
    'restored', true,
    'status', v_asset.processing_status,
    'replayed', false
  );
end;
$$;

create or replace function private.cms_watchdog_stale_dam_uploads(
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_asset public.cms_media_assets%rowtype;
  v_count integer := 0;
  v_correlation_id uuid;
  v_previous_compensating text;
  v_paths jsonb;
begin
  if p_limit not between 1 and 500 then
    raise exception 'CMS_DAM_WATCHDOG_LIMIT_INVALID' using errcode = '22023';
  end if;
  v_previous_compensating := current_setting('cms.qa_compensating', true);
  perform set_config('cms.qa_compensating', 'on', true);

  for v_asset in
    select asset.*
    from public.cms_media_assets asset
    where asset.archived_at is null
      and asset.processing_status in ('awaiting_upload', 'processing', 'failed')
      and asset.upload_token_expires_at <= statement_timestamp()
      and (
        asset.finalization_claim_id is null
        or asset.finalization_claim_expires_at <= clock_timestamp()
      )
    order by asset.created_at, asset.id
    for update skip locked
    limit p_limit
  loop
    v_correlation_id := gen_random_uuid();
    v_paths := jsonb_build_array(
      v_asset.storage_path,
      'cms/' || v_asset.id::text || '/thumbnail.webp',
      'cms/' || v_asset.id::text || '/thumbnail.avif',
      'cms/' || v_asset.id::text || '/medium.webp',
      'cms/' || v_asset.id::text || '/medium.avif',
      'cms/' || v_asset.id::text || '/large.webp',
      'cms/' || v_asset.id::text || '/large.avif'
    );
    update public.cms_media_assets asset
    set processing_status = 'failed',
        scan_status = 'failed',
        archived_at = statement_timestamp(),
        archived_by = v_asset.created_by,
        finalization_claim_id = null,
        finalization_claimed_by = null,
        finalization_claimed_at = null,
        finalization_claim_expires_at = null,
        lock_version = asset.lock_version + 1
    where asset.id = v_asset.id
      and asset.lock_version = v_asset.lock_version;
    if not found then
      continue;
    end if;
    insert into public.cms_dam_gc_jobs (
      asset_id, asset_snapshot, execute_after, created_by
    ) values (
      v_asset.id,
      jsonb_build_object(
        'assetId', v_asset.id,
        'storagePath', v_asset.storage_path,
        'sha256', v_asset.sha256,
        'disposition', 'incomplete_upload',
        'paths', v_paths
      ),
      greatest(v_asset.upload_token_expires_at, statement_timestamp()),
      v_asset.created_by
    ) on conflict (asset_id)
      where status in ('pending', 'processing', 'blocked', 'failed')
      do nothing;
    update public.cms_dam_gc_jobs job
    set asset_snapshot = jsonb_build_object(
          'assetId', v_asset.id,
          'storagePath', v_asset.storage_path,
          'sha256', v_asset.sha256,
          'disposition', 'incomplete_upload',
          'paths', v_paths
        ),
        execute_after = greatest(
          job.execute_after,
          v_asset.upload_token_expires_at,
          statement_timestamp()
        ),
        status = case when job.attempts >= 20 then 'blocked' else 'pending' end,
        last_error = case when job.attempts >= 20 then job.last_error else null end
    where job.asset_id = v_asset.id
      and job.status in ('pending', 'failed', 'blocked')
      and job.processing_claim_id is null;
    if not exists (
      select 1
      from public.cms_dam_gc_jobs job
      where job.asset_id = v_asset.id
        and job.status in ('pending', 'processing', 'blocked', 'failed')
        and job.asset_snapshot ->> 'disposition' = 'incomplete_upload'
        and job.asset_snapshot -> 'paths' = v_paths
        and job.execute_after >= v_asset.upload_token_expires_at
    ) then
      raise exception 'CMS_DAM_WATCHDOG_GC_INVARIANT' using errcode = 'P0001';
    end if;
    insert into public.cms_audit_log (
      actor_id, action, target_type, target_id, event_data, correlation_id
    ) values (
      v_asset.created_by,
      'cms:media.stale_upload_archived',
      'media_asset',
      v_asset.id::text,
      jsonb_build_object('reasonCode', 'stale_upload', 'gcScheduled', true),
      v_correlation_id
    );
    insert into public.cms_dam_events (
      asset_id, actor_id, event_type, event_data, correlation_id
    ) values (
      v_asset.id,
      v_asset.created_by,
      'stale_upload_archived',
      jsonb_build_object('reasonCode', 'stale_upload', 'gcScheduled', true),
      v_correlation_id
    );
    v_count := v_count + 1;
  end loop;
  perform set_config('cms.dam_gc_operation', '', true);
  perform set_config('cms.dam_gc_claim_id', '', true);
  perform set_config(
    'cms.qa_compensating',
    coalesce(nullif(v_previous_compensating, ''), 'off'),
    true
  );
  return v_count;
exception when others then
  perform set_config('cms.dam_gc_operation', '', true);
  perform set_config('cms.dam_gc_claim_id', '', true);
  perform set_config(
    'cms.qa_compensating',
    coalesce(nullif(v_previous_compensating, ''), 'off'),
    true
  );
  raise;
end;
$$;

create or replace function public.cms_claim_incomplete_media_gc(
  p_limit integer,
  p_worker_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_candidate record;
  v_job public.cms_dam_gc_jobs%rowtype;
  v_asset public.cms_media_assets%rowtype;
  v_claim_id uuid;
  v_claim_expires_at timestamptz;
  v_verification_nonce uuid;
  v_paths jsonb;
  v_disposition text;
  v_fence_job_id uuid;
  v_claims jsonb := '[]'::jsonb;
  v_previous_compensating text;
begin
  if p_limit not between 1 and 50 or p_worker_id is null then
    raise exception 'CMS_DAM_INCOMPLETE_GC_CLAIM_INVALID' using errcode = '22023';
  end if;
  v_previous_compensating := current_setting('cms.qa_compensating', true);
  perform set_config('cms.qa_compensating', 'on', true);

  for v_candidate in
    select job.id as job_id, asset.id as asset_id
    from public.cms_dam_gc_jobs job
    join public.cms_media_assets asset on asset.id = job.asset_id
    where job.asset_snapshot ->> 'disposition' in (
        'incomplete_upload', 'retained_archive'
      )
      and job.status in ('pending', 'failed', 'processing')
      and job.execute_after <= statement_timestamp()
      and (
        job.attempts < 20
        or (
          job.attempts = 20
          and job.status in ('pending', 'processing')
          and job.asset_snapshot ? 'firstAbsenceVerifiedAt'
          and not (job.asset_snapshot ? 'completedClaimId')
        )
      )
      and (
        job.processing_claim_id is null
        or job.processing_claim_expires_at <= clock_timestamp()
      )
      and asset.archived_at is not null
      and asset.upload_token_expires_at <= statement_timestamp()
      and asset.finalization_claim_id is null
      and (
        asset.gc_claim_id is null
        or asset.gc_claim_expires_at <= clock_timestamp()
      )
      and not exists (
        select 1 from public.cms_media_usages usage where usage.asset_id = asset.id
      )
      and not exists (
        select 1
        from public.cms_dam_replacements replacement
        where replacement.status = 'active'
          and (replacement.source_asset_id = asset.id or replacement.target_asset_id = asset.id)
      )
      and (
        (
          job.asset_snapshot ->> 'disposition' = 'incomplete_upload'
          and asset.processing_status in ('failed', 'rejected')
          and asset.scan_status in ('failed', 'rejected')
        ) or (
          job.asset_snapshot ->> 'disposition' = 'retained_archive'
          and asset.archived_at <= statement_timestamp() - interval '30 days'
        )
      )
    order by job.execute_after, job.id
    for update of job, asset skip locked
    limit p_limit
  loop
    select job.* into strict v_job
    from public.cms_dam_gc_jobs job
    where job.id = v_candidate.job_id;
    select asset.* into strict v_asset
    from public.cms_media_assets asset
    where asset.id = v_candidate.asset_id;
    v_disposition := v_job.asset_snapshot ->> 'disposition';
    if v_disposition = 'incomplete_upload' then
      v_paths := jsonb_build_array(
        v_asset.storage_path,
        'cms/' || v_asset.id::text || '/thumbnail.webp',
        'cms/' || v_asset.id::text || '/thumbnail.avif',
        'cms/' || v_asset.id::text || '/medium.webp',
        'cms/' || v_asset.id::text || '/medium.avif',
        'cms/' || v_asset.id::text || '/large.webp',
        'cms/' || v_asset.id::text || '/large.avif'
      );
    else
      v_paths := jsonb_build_array(v_asset.storage_path) || coalesce(
        (
          select jsonb_agg(variant.transform_path order by variant.transform_path)
          from public.cms_media_variants variant
          where variant.asset_id = v_asset.id
        ),
        '[]'::jsonb
      );
    end if;
    if v_job.asset_snapshot ->> 'assetId' <> v_asset.id::text
       or v_job.asset_snapshot ->> 'storagePath' <> v_asset.storage_path
       or v_job.asset_snapshot -> 'paths' <> v_paths then
      update public.cms_dam_gc_jobs job
      set status = 'blocked',
          last_error = 'Snapshot de upload incompleto inválido.',
          processing_claim_id = null,
          processing_claimed_by = null,
          processing_claimed_at = null,
          processing_claim_expires_at = null,
          prepared_asset_lock_version = null
      where job.id = v_job.id;
      continue;
    end if;

    v_claim_id := gen_random_uuid();
    v_verification_nonce := gen_random_uuid();
    v_claim_expires_at := statement_timestamp() + interval '15 minutes';
    v_fence_job_id := null;
    insert into private.cms_dam_gc_fences as fence (
      asset_id, job_id, claim_id, claimed_by, claim_expires_at, updated_at
    ) values (
      v_asset.id, v_job.id, v_claim_id, p_worker_id,
      v_claim_expires_at, statement_timestamp()
    ) on conflict (asset_id) do update set
      job_id = excluded.job_id,
      claim_id = excluded.claim_id,
      claimed_by = excluded.claimed_by,
      claim_expires_at = excluded.claim_expires_at,
      updated_at = excluded.updated_at
    where fence.job_id = excluded.job_id
      and (fence.claim_id is null or fence.claim_expires_at <= clock_timestamp())
    returning fence.job_id into v_fence_job_id;
    if v_fence_job_id is distinct from v_job.id then
      continue;
    end if;

    perform set_config('cms.dam_gc_operation', 'prepare', true);
    perform set_config('cms.dam_gc_claim_id', v_claim_id::text, true);
    update public.cms_media_assets asset
    set gc_claim_id = v_claim_id,
        gc_claim_job_id = v_job.id,
        gc_claimed_by = p_worker_id,
        gc_claimed_at = statement_timestamp(),
        gc_claim_expires_at = v_claim_expires_at,
        lock_version = asset.lock_version + 1
    where asset.id = v_asset.id
      and asset.lock_version = v_asset.lock_version
      and (
        asset.gc_claim_id is null
        or asset.gc_claim_expires_at <= clock_timestamp()
      )
    returning asset.* into v_asset;
    if not found then
      raise exception 'CMS_DAM_INCOMPLETE_GC_CAS_CONFLICT' using errcode = 'P0001';
    end if;

    update public.cms_dam_gc_jobs job
    set status = 'processing',
        attempts = case
          -- A primeira prova pode consumir a 20ª tentativa. Nesse único caso
          -- o resweep obrigatório recebe um claim terminal sem ultrapassar a
          -- constraint histórica attempts <= 20; uma falha o bloqueia.
          when job.attempts = 20
            and job.status in ('pending', 'processing')
            and job.asset_snapshot ? 'firstAbsenceVerifiedAt'
            then job.attempts
          else job.attempts + 1
        end,
        completed_at = null,
        last_error = null,
        asset_snapshot = job.asset_snapshot || jsonb_build_object(
          'verificationNonce', v_verification_nonce
        ),
        processing_claim_id = v_claim_id,
        processing_claimed_by = p_worker_id,
        processing_claimed_at = statement_timestamp(),
        processing_claim_expires_at = v_claim_expires_at,
        prepared_asset_lock_version = v_asset.lock_version
    where job.id = v_job.id
      and job.status = v_job.status
      and job.attempts = v_job.attempts
    returning job.* into v_job;
    if not found then
      raise exception 'CMS_DAM_INCOMPLETE_GC_CAS_CONFLICT' using errcode = 'P0001';
    end if;
    v_claims := v_claims || jsonb_build_array(jsonb_build_object(
      'jobId', v_job.id,
      'claimId', v_claim_id,
      'verificationNonce', v_verification_nonce,
      'disposition', v_disposition,
      'paths', v_paths
    ));
  end loop;
  perform set_config('cms.dam_gc_operation', '', true);
  perform set_config('cms.dam_gc_claim_id', '', true);
  perform set_config(
    'cms.qa_compensating',
    coalesce(nullif(v_previous_compensating, ''), 'off'),
    true
  );
  return v_claims;
exception when others then
  perform set_config('cms.dam_gc_operation', '', true);
  perform set_config('cms.dam_gc_claim_id', '', true);
  perform set_config(
    'cms.qa_compensating',
    coalesce(nullif(v_previous_compensating, ''), 'off'),
    true
  );
  raise;
end;
$$;

create or replace function public.cms_finish_incomplete_media_gc(
  p_job_id uuid,
  p_claim_id uuid,
  p_worker_id uuid,
  p_succeeded boolean,
  p_error_code text,
  p_verified_paths jsonb,
  p_verification_proof text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_job public.cms_dam_gc_jobs%rowtype;
  v_asset public.cms_media_assets%rowtype;
  v_fence private.cms_dam_gc_fences%rowtype;
  v_paths jsonb;
  v_status text;
  v_disposition text;
  v_expected_proof text;
  v_path_manifest text;
  v_previous_compensating text;
  v_asset_found boolean;
begin
  if p_job_id is null
     or p_claim_id is null
     or p_worker_id is null
     or p_succeeded is null
     or p_correlation_id is null
     or jsonb_typeof(p_verified_paths) is distinct from 'array'
     or (
       p_succeeded
       and (
         p_error_code is not null
         or p_verification_proof !~ '^[0-9a-f]{64}$'
       )
     )
     or (
       not p_succeeded
       and (
         p_error_code not in (
           'storage_remove_failed', 'storage_verify_failed', 'storage_residue'
         )
         or p_verification_proof is not null
       )
     ) then
    raise exception 'CMS_DAM_INCOMPLETE_GC_COMPLETION_INVALID' using errcode = '22023';
  end if;
  v_previous_compensating := current_setting('cms.qa_compensating', true);
  perform set_config('cms.qa_compensating', 'on', true);

  select job.* into v_job
  from public.cms_dam_gc_jobs job
  where job.id = p_job_id
  for update;
  if not found
     or v_job.asset_snapshot ->> 'disposition' not in (
       'incomplete_upload', 'retained_archive'
     )
     or v_job.status <> 'processing'
     or v_job.processing_claim_id <> p_claim_id
     or v_job.processing_claimed_by <> p_worker_id then
    raise exception 'CMS_DAM_INCOMPLETE_GC_CLAIM_INVALID' using errcode = '42501';
  end if;
  select asset.* into v_asset
  from public.cms_media_assets asset
  where asset.id = v_job.asset_id
  for update;
  v_asset_found := found;
  v_disposition := v_job.asset_snapshot ->> 'disposition';
  if not v_asset_found
     or v_asset.archived_at is null
     or v_asset.upload_token_expires_at > statement_timestamp()
     or v_asset.finalization_claim_id is not null
     or v_asset.gc_claim_id <> p_claim_id
     or v_asset.gc_claim_job_id <> v_job.id
     or v_asset.gc_claimed_by <> p_worker_id
     or v_asset.lock_version <> v_job.prepared_asset_lock_version then
    raise exception 'CMS_DAM_INCOMPLETE_GC_CLAIM_INVALID' using errcode = '42501';
  end if;
  if (
       v_disposition = 'incomplete_upload'
       and (
         v_asset.processing_status not in ('failed', 'rejected')
         or v_asset.scan_status not in ('failed', 'rejected')
       )
     ) or (
       v_disposition = 'retained_archive'
       and v_asset.archived_at > statement_timestamp() - interval '30 days'
     ) then
    raise exception 'CMS_DAM_INCOMPLETE_GC_CLAIM_INVALID' using errcode = '42501';
  end if;
  lock table public.cms_dam_replacements in share row exclusive mode;
  if v_disposition = 'incomplete_upload' then
    v_paths := jsonb_build_array(
      v_asset.storage_path,
      'cms/' || v_asset.id::text || '/thumbnail.webp',
      'cms/' || v_asset.id::text || '/thumbnail.avif',
      'cms/' || v_asset.id::text || '/medium.webp',
      'cms/' || v_asset.id::text || '/medium.avif',
      'cms/' || v_asset.id::text || '/large.webp',
      'cms/' || v_asset.id::text || '/large.avif'
    );
  else
    v_paths := jsonb_build_array(v_asset.storage_path) || coalesce(
      (
        select jsonb_agg(variant.transform_path order by variant.transform_path)
        from public.cms_media_variants variant
        where variant.asset_id = v_asset.id
      ),
      '[]'::jsonb
    );
  end if;
  if v_job.asset_snapshot ->> 'assetId' <> v_asset.id::text
     or v_job.asset_snapshot ->> 'storagePath' <> v_asset.storage_path
     or v_job.asset_snapshot -> 'paths' <> v_paths
     or exists (
       select 1 from public.cms_media_usages usage where usage.asset_id = v_asset.id
     )
     or exists (
       select 1
       from public.cms_dam_replacements replacement
       where replacement.status = 'active'
         and (replacement.source_asset_id = v_asset.id or replacement.target_asset_id = v_asset.id)
     ) then
    raise exception 'CMS_DAM_INCOMPLETE_GC_SCOPE_CHANGED' using errcode = 'P0001';
  end if;
  if p_succeeded then
    if p_verified_paths <> v_paths
       or v_job.asset_snapshot ->> 'verificationNonce' is null
       or (v_job.asset_snapshot ->> 'verificationNonce')
         !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'CMS_DAM_INCOMPLETE_GC_PROOF_INVALID' using errcode = '42501';
    end if;
    select string_agg(entry.value #>> '{}', '|' order by entry.ordinality)
    into v_path_manifest
    from jsonb_array_elements(p_verified_paths) with ordinality entry(value, ordinality);
    v_expected_proof := encode(extensions.digest(convert_to(
      (v_job.asset_snapshot ->> 'verificationNonce') || ':' ||
      p_claim_id::text || ':' || v_path_manifest || ':absent',
      'UTF8'
    ), 'sha256'), 'hex');
    if p_verification_proof is distinct from v_expected_proof then
      raise exception 'CMS_DAM_INCOMPLETE_GC_PROOF_INVALID' using errcode = '42501';
    end if;
  elsif jsonb_array_length(p_verified_paths) > jsonb_array_length(v_paths)
     or exists (
       select 1
       from jsonb_array_elements(p_verified_paths) verified(path)
       where verified.path not in (select value from jsonb_array_elements(v_paths))
     ) then
    raise exception 'CMS_DAM_INCOMPLETE_GC_PROOF_INVALID' using errcode = '42501';
  end if;
  select fence.* into v_fence
  from private.cms_dam_gc_fences fence
  where fence.asset_id = v_asset.id
  for update;
  if not found
     or v_fence.job_id <> v_job.id
     or v_fence.claim_id <> p_claim_id
     or v_fence.claimed_by <> p_worker_id then
    raise exception 'CMS_DAM_INCOMPLETE_GC_CAS_CONFLICT' using errcode = 'P0001';
  end if;

  -- A primeira ausência verificada não terminaliza a geração. Mantemos o
  -- fence até o vencimento do claim e agendamos uma segunda varredura; assim,
  -- um PUT autorizado pouco antes da expiração do signed token ainda é
  -- removido pela passagem seguinte antes de a linha/tombstone ser concluída.
  if p_succeeded and not (v_job.asset_snapshot ? 'firstAbsenceVerifiedAt') then
    update public.cms_dam_gc_jobs job
    set status = 'pending',
        completed_at = null,
        last_error = null,
        execute_after = greatest(
          v_asset.gc_claim_expires_at,
          statement_timestamp() + interval '1 minute'
        ),
        asset_snapshot = job.asset_snapshot || jsonb_build_object(
          'firstAbsenceVerifiedAt', statement_timestamp(),
          'firstAbsenceClaimId', p_claim_id,
          'firstVerificationProofSha256', p_verification_proof
        ),
        processing_claim_id = null,
        processing_claimed_by = null,
        processing_claimed_at = null,
        processing_claim_expires_at = null,
        prepared_asset_lock_version = null
    where job.id = v_job.id
      and job.status = 'processing'
      and job.processing_claim_id = p_claim_id
      and job.processing_claimed_by = p_worker_id;
    if not found then
      raise exception 'CMS_DAM_INCOMPLETE_GC_CAS_CONFLICT' using errcode = 'P0001';
    end if;
    insert into public.cms_audit_log (
      actor_id, action, target_type, target_id, event_data, correlation_id
    ) values (
      v_job.created_by,
      case when v_disposition = 'incomplete_upload'
        then 'cms:media.incomplete_upload_gc_resweep_scheduled'
        else 'cms:media.retained_archive_gc_resweep_scheduled' end,
      'media_asset',
      v_asset.id::text,
      jsonb_build_object(
        'disposition', v_disposition,
        'outcome', 'absence_verified_resweep_scheduled',
        'verifiedCount', jsonb_array_length(p_verified_paths),
        'verificationProofSha256', p_verification_proof,
        'resweepAfter', greatest(
          v_asset.gc_claim_expires_at,
          statement_timestamp() + interval '1 minute'
        )
      ),
      p_correlation_id
    );
    insert into public.cms_dam_events (
      asset_id, actor_id, event_type, event_data, correlation_id
    ) values (
      v_asset.id,
      v_job.created_by,
      case when v_disposition = 'incomplete_upload'
        then 'incomplete_upload_gc_resweep_scheduled'
        else 'retained_archive_gc_resweep_scheduled' end,
      jsonb_build_object(
        'outcome', 'absence_verified_resweep_scheduled',
        'verifiedCount', jsonb_array_length(p_verified_paths)
      ),
      p_correlation_id
    );
    perform set_config(
      'cms.qa_compensating',
      coalesce(nullif(v_previous_compensating, ''), 'off'),
      true
    );
    return jsonb_build_object(
      'status', 'pending',
      'replayed', false,
      'resweepRequired', true
    );
  end if;
  if p_succeeded and (
    (v_job.asset_snapshot ->> 'firstAbsenceClaimId') is null
    or (v_job.asset_snapshot ->> 'firstAbsenceClaimId') = p_claim_id::text
    or (v_job.asset_snapshot ->> 'firstAbsenceVerifiedAt') is null
    or (v_job.asset_snapshot ->> 'firstAbsenceVerifiedAt')::timestamptz
      > statement_timestamp()
  ) then
    raise exception 'CMS_DAM_INCOMPLETE_GC_PROOF_INVALID' using errcode = '42501';
  end if;

  perform set_config('cms.dam_gc_operation', 'complete', true);
  perform set_config('cms.dam_gc_claim_id', p_claim_id::text, true);
  if p_succeeded then
    delete from public.cms_dam_collection_assets link where link.asset_id = v_asset.id;
    delete from public.cms_dam_asset_tags link where link.asset_id = v_asset.id;
    delete from public.cms_dam_crops crop where crop.asset_id = v_asset.id;
    delete from public.cms_media_assets asset
    where asset.id = v_asset.id
      and asset.lock_version = v_asset.lock_version
      and asset.gc_claim_id = p_claim_id
      and asset.gc_claim_job_id = v_job.id;
    if not found then
      raise exception 'CMS_DAM_INCOMPLETE_GC_CAS_CONFLICT' using errcode = 'P0001';
    end if;
    update public.cms_dam_gc_jobs job
    set status = 'done',
        completed_at = statement_timestamp(),
        last_error = null,
        asset_snapshot = job.asset_snapshot || jsonb_build_object(
          'completedClaimId', p_claim_id,
          'completionDisposition', 'removed',
          'verificationProofSha256', p_verification_proof
        ),
        processing_claim_id = null,
        processing_claimed_by = null,
        processing_claimed_at = null,
        processing_claim_expires_at = null,
        prepared_asset_lock_version = null
    where job.id = v_job.id
      and job.status = 'processing'
      and job.processing_claim_id = p_claim_id
      and job.processing_claimed_by = p_worker_id;
    v_status := 'done';
  else
    update public.cms_media_assets asset
    set gc_claim_id = null,
        gc_claim_job_id = null,
        gc_claimed_by = null,
        gc_claimed_at = null,
        gc_claim_expires_at = null,
        lock_version = asset.lock_version + 1
    where asset.id = v_asset.id
      and asset.lock_version = v_asset.lock_version
      and asset.gc_claim_id = p_claim_id
      and asset.gc_claim_job_id = v_job.id;
    if not found then
      raise exception 'CMS_DAM_INCOMPLETE_GC_CAS_CONFLICT' using errcode = 'P0001';
    end if;
    v_status := case when v_job.attempts >= 20 then 'blocked' else 'failed' end;
    update public.cms_dam_gc_jobs job
    set status = v_status,
        completed_at = null,
        last_error = 'Falha verificada ao remover upload incompleto: ' || p_error_code,
        execute_after = statement_timestamp() + interval '5 minutes',
        processing_claim_id = null,
        processing_claimed_by = null,
        processing_claimed_at = null,
        processing_claim_expires_at = null,
        prepared_asset_lock_version = null
    where job.id = v_job.id
      and job.status = 'processing'
      and job.processing_claim_id = p_claim_id
      and job.processing_claimed_by = p_worker_id;
  end if;
  if not found then
    raise exception 'CMS_DAM_INCOMPLETE_GC_CAS_CONFLICT' using errcode = 'P0001';
  end if;

  update private.cms_dam_gc_fences fence
  set claim_id = null,
      claimed_by = null,
      claim_expires_at = null,
      updated_at = statement_timestamp()
  where fence.asset_id = v_asset.id
    and fence.job_id = v_job.id
    and fence.claim_id = p_claim_id
    and fence.claimed_by = p_worker_id;
  if not found then
    raise exception 'CMS_DAM_INCOMPLETE_GC_CAS_CONFLICT' using errcode = 'P0001';
  end if;

  insert into public.cms_audit_log (
    actor_id, action, target_type, target_id, event_data, correlation_id
  ) values (
    v_job.created_by,
    case
      when p_succeeded and v_disposition = 'incomplete_upload'
        then 'cms:media.incomplete_upload_gc_succeeded'
      when p_succeeded then 'cms:media.retained_archive_gc_succeeded'
      when v_disposition = 'incomplete_upload'
        then 'cms:media.incomplete_upload_gc_failed'
      else 'cms:media.retained_archive_gc_failed'
    end,
    'media_asset',
    v_asset.id::text,
    jsonb_build_object(
      'disposition', v_disposition,
      'outcome', case when p_succeeded then 'removed' else 'retry_scheduled' end,
      'errorCode', p_error_code,
      'verifiedCount', jsonb_array_length(p_verified_paths),
      'verificationProofSha256', p_verification_proof
    ),
    p_correlation_id
  );
  insert into public.cms_dam_events (
    asset_id, actor_id, event_type, event_data, correlation_id
  ) values (
    v_asset.id,
    v_job.created_by,
    case
      when p_succeeded and v_disposition = 'incomplete_upload'
        then 'incomplete_upload_removed'
      when p_succeeded then 'retained_archive_removed'
      when v_disposition = 'incomplete_upload'
        then 'incomplete_upload_gc_failed'
      else 'retained_archive_gc_failed'
    end,
    jsonb_build_object(
      'outcome', case when p_succeeded then 'removed' else 'retry_scheduled' end,
      'errorCode', p_error_code,
      'verifiedCount', jsonb_array_length(p_verified_paths),
      'verificationProofSha256', p_verification_proof
    ),
    p_correlation_id
  );
  perform set_config('cms.dam_gc_operation', '', true);
  perform set_config('cms.dam_gc_claim_id', '', true);
  perform set_config(
    'cms.qa_compensating',
    coalesce(nullif(v_previous_compensating, ''), 'off'),
    true
  );
  return jsonb_build_object('status', v_status, 'replayed', false);
exception when others then
  perform set_config('cms.dam_gc_operation', '', true);
  perform set_config('cms.dam_gc_claim_id', '', true);
  perform set_config(
    'cms.qa_compensating',
    coalesce(nullif(v_previous_compensating, ''), 'off'),
    true
  );
  raise;
end;
$$;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'cms-dam-stale-upload-watchdog-v1'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
  perform cron.schedule(
    'cms-dam-stale-upload-watchdog-v1',
    '*/15 * * * *',
    $watchdog$select private.cms_watchdog_stale_dam_uploads(100);$watchdog$
  );
end;
$$;

revoke all on function public.cms_abort_dam_upload(
  uuid,text,text,text,text,timestamptz,uuid,text,uuid,uuid,text,uuid
) from public, anon, authenticated;
grant execute on function public.cms_abort_dam_upload(
  uuid,text,text,text,text,timestamptz,uuid,text,uuid,uuid,text,uuid
) to service_role;
revoke all on function public.cms_fail_dam_finalization(
  uuid,uuid,uuid,text,uuid,text,text,timestamptz
) from public, anon, authenticated;
grant execute on function public.cms_fail_dam_finalization(
  uuid,uuid,uuid,text,uuid,text,text,timestamptz
) to service_role;
revoke all on function public.cms_list_media_usages_scoped(
  uuid,text,text,text,timestamptz,uuid[]
) from public, anon, authenticated;
grant execute on function public.cms_list_media_usages_scoped(
  uuid,text,text,text,timestamptz,uuid[]
) to service_role;
revoke all on function public.cms_count_media_usages_scoped(
  uuid,text,text,text,timestamptz,uuid[]
) from public, anon, authenticated;
grant execute on function public.cms_count_media_usages_scoped(
  uuid,text,text,text,timestamptz,uuid[]
) to service_role;
revoke all on function public.cms_archive_legacy_media(
  uuid,text,text,text,text,timestamptz,uuid,uuid
) from public, anon, authenticated;
grant execute on function public.cms_archive_legacy_media(
  uuid,text,text,text,text,timestamptz,uuid,uuid
) to service_role;
revoke all on function public.cms_restore_legacy_media(
  uuid,text,text,text,text,timestamptz,uuid,uuid
) from public, anon, authenticated;
grant execute on function public.cms_restore_legacy_media(
  uuid,text,text,text,text,timestamptz,uuid,uuid
) to service_role;
revoke all on function public.cms_claim_incomplete_media_gc(integer,uuid)
  from public, anon, authenticated;
grant execute on function public.cms_claim_incomplete_media_gc(integer,uuid)
  to service_role;
revoke all on function public.cms_finish_incomplete_media_gc(
  uuid,uuid,uuid,boolean,text,jsonb,text,uuid
) from public, anon, authenticated;
grant execute on function public.cms_finish_incomplete_media_gc(
  uuid,uuid,uuid,boolean,text,jsonb,text,uuid
) to service_role;
revoke all on function public.cms_block_media_delete()
  from public, anon, authenticated, service_role;
revoke all on function private.cms_watchdog_stale_dam_uploads(integer)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_validate_dam_crop_aspect()
  from public, anon, authenticated, service_role;
revoke all on function private.cms_block_dam_gc_relationship_write()
  from public, anon, authenticated, service_role;
revoke all on function private.cms_classify_media_gc_job()
  from public, anon, authenticated, service_role;

comment on function public.cms_abort_dam_upload(
  uuid,text,text,text,text,timestamptz,uuid,text,uuid,uuid,text,uuid
) is 'Aborta idempotentemente somente a reserva do próprio ator, arquiva-a e agenda os sete paths derivados para GC físico após o horizonte do signed-upload.';
comment on function public.cms_list_media_usages_scoped(
  uuid,text,text,text,timestamptz,uuid[]
) is 'Mapa de usos operador-safe: devolve apenas conteúdo no grafo autorizado, com título, rota administrativa e rótulo de bloco.';
comment on function public.cms_count_media_usages_scoped(
  uuid,text,text,text,timestamptz,uuid[]
) is 'Totais de uso por ativo, incluindo apenas contagens não identificáveis para vínculos ocultos ao operador.';
comment on function public.cms_archive_legacy_media(
  uuid,text,text,text,text,timestamptz,uuid,uuid
) is 'Compatibilidade V1: converte delete em arquivamento reversível, escopado e retido por 30 dias, sem depender da flag EV2.';
comment on function public.cms_restore_legacy_media(
  uuid,text,text,text,text,timestamptz,uuid,uuid
) is 'Compatibilidade V1: restaura arquivo durante a retenção e cancela atomicamente o GC ainda não reclamado.';
comment on function private.cms_watchdog_stale_dam_uploads(integer)
is 'Arquiva reservas incompletas somente após a validade conservadora do signed-upload e agenda os paths exatos; o outbox worker remove e verifica com claim/fence.';
comment on function public.cms_claim_incomplete_media_gc(integer,uuid)
is 'Claim service-only para GC automático de uploads incompletos e arquivos com retenção vencida, limitado ao snapshot exato e sem usos ou substituições.';
comment on function public.cms_finish_incomplete_media_gc(uuid,uuid,uuid,boolean,text,jsonb,text,uuid)
is 'Conclui service-only um claim de GC automático mediante CAS e dois atestados SHA-256 integrais em claims distintos, fechando a corrida de PUT tardio.';
