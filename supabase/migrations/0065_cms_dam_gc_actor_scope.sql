-- Homologacao final: isola o DAM por ator QA e torna GC/finalizacao
-- operacoes server-side actor-aware. Durante rollout, as assinaturas antigas
-- falham fechadas; nenhuma delas continua apta a remover dados.

alter table public.cms_media_assets
  add column if not exists finalization_claim_id uuid,
  add column if not exists finalization_claimed_by uuid,
  add column if not exists finalization_claimed_at timestamptz,
  add column if not exists finalization_claim_expires_at timestamptz,
  add column if not exists gc_claim_id uuid,
  add column if not exists gc_claim_job_id uuid,
  add column if not exists gc_claimed_by uuid,
  add column if not exists gc_claimed_at timestamptz,
  add column if not exists gc_claim_expires_at timestamptz;

alter table public.cms_dam_gc_jobs
  add column if not exists processing_claim_id uuid,
  add column if not exists processing_claimed_by uuid,
  add column if not exists processing_claimed_at timestamptz,
  add column if not exists processing_claim_expires_at timestamptz,
  add column if not exists prepared_asset_lock_version bigint;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.cms_media_assets'::regclass
      and conname = 'cms_media_finalization_claim_shape'
  ) then
    alter table public.cms_media_assets
      add constraint cms_media_finalization_claim_shape check (
        (
          finalization_claim_id is null
          and finalization_claimed_by is null
          and finalization_claimed_at is null
          and finalization_claim_expires_at is null
        ) or (
          finalization_claim_id is not null
          and finalization_claimed_by is not null
          and finalization_claimed_at is not null
          and finalization_claim_expires_at > finalization_claimed_at
          and finalization_claim_expires_at <= finalization_claimed_at + interval '15 minutes'
        )
      ) not valid;
    alter table public.cms_media_assets
      validate constraint cms_media_finalization_claim_shape;
  end if;
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.cms_media_assets'::regclass
      and conname = 'cms_media_gc_claim_shape'
  ) then
    alter table public.cms_media_assets
      add constraint cms_media_gc_claim_shape check (
        (
          gc_claim_id is null
          and gc_claim_job_id is null
          and gc_claimed_by is null
          and gc_claimed_at is null
          and gc_claim_expires_at is null
        ) or (
          gc_claim_id is not null
          and gc_claim_job_id is not null
          and gc_claimed_by is not null
          and gc_claimed_at is not null
          and gc_claim_expires_at > gc_claimed_at
          and gc_claim_expires_at <= gc_claimed_at + interval '15 minutes'
        )
      ) not valid;
    alter table public.cms_media_assets
      validate constraint cms_media_gc_claim_shape;
  end if;
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.cms_dam_gc_jobs'::regclass
      and conname = 'cms_dam_gc_processing_claim_shape'
  ) then
    alter table public.cms_dam_gc_jobs
      add constraint cms_dam_gc_processing_claim_shape check (
        (
          processing_claim_id is null
          and processing_claimed_by is null
          and processing_claimed_at is null
          and processing_claim_expires_at is null
          and prepared_asset_lock_version is null
        ) or (
          processing_claim_id is not null
          and processing_claimed_by is not null
          and processing_claimed_at is not null
          and processing_claim_expires_at > processing_claimed_at
          and processing_claim_expires_at <= processing_claimed_at + interval '15 minutes'
        )
      ) not valid;
    alter table public.cms_dam_gc_jobs
      validate constraint cms_dam_gc_processing_claim_shape;
  end if;
end;
$$;

create index if not exists cms_media_finalization_claim_expiry_idx
  on public.cms_media_assets (finalization_claim_expires_at, id)
  where finalization_claim_id is not null;

create unique index if not exists cms_media_gc_claim_job_uidx
  on public.cms_media_assets (gc_claim_job_id)
  where gc_claim_job_id is not null;

-- A deduplicacao respeita a mesma fronteira usada pelas leituras: conteudo
-- corporativo deduplica globalmente, enquanto cada lease QA tem espaco proprio.
drop index if exists public.cms_media_sha256_uidx;
create unique index if not exists cms_media_sha256_corporate_uidx
  on public.cms_media_assets (sha256)
  where sha256 is not null
    and archived_at is null
    and processing_status <> 'replaced'
    and source_kind <> 'synthetic_test';
create unique index if not exists cms_media_sha256_qa_actor_uidx
  on public.cms_media_assets (created_by, sha256)
  where sha256 is not null
    and archived_at is null
    and processing_status <> 'replaced'
    and source_kind = 'synthetic_test';

create index if not exists cms_dam_gc_processing_claim_expiry_idx
  on public.cms_dam_gc_jobs (processing_claim_expires_at, id)
  where processing_claim_id is not null;

-- O fence privado cobre inclusive jobs legados que ja perderam o FK para o
-- ativo. Ele impede que o mesmo UUID/path seja reservado enquanto uma remocao
-- fisica estiver pendente. Depois do sucesso ele permanece como tombstone do
-- UUID, pois um worker expirado ainda pode repetir a remocao fora do banco.
create table if not exists private.cms_dam_gc_fences (
  asset_id uuid primary key,
  job_id uuid not null unique references public.cms_dam_gc_jobs (id) on delete restrict,
  claim_id uuid,
  claimed_by uuid,
  claim_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (claim_id is null and claimed_by is null and claim_expires_at is null)
    or (claim_id is not null and claimed_by is not null and claim_expires_at is not null)
  )
);

insert into private.cms_dam_gc_fences (asset_id, job_id)
select (job.asset_snapshot ->> 'assetId')::uuid, job.id
from public.cms_dam_gc_jobs job
where job.asset_id is null
  and job.status in ('pending', 'processing', 'blocked', 'failed')
  and job.asset_snapshot ->> 'assetId'
    ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
on conflict do nothing;

create or replace function private.cms_assert_dam_actor_context(
  p_actor_id uuid,
  p_permission text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $$
declare
  v_lease private.cms_qa_actor_leases%rowtype;
begin
  if p_permission not in ('cms:media.read', 'cms:media.upload', 'cms:media.manage')
     or not public.cms_actor_authorized(
       p_actor_id,
       p_permission,
       p_aal,
       p_session_id,
       p_issued_at
     ) then
    raise exception 'CMS_DAM_FORBIDDEN' using errcode = '42501';
  end if;

  select lease.* into v_lease
  from private.cms_qa_actor_leases lease
  where lease.actor_id = p_actor_id
  for share;

  if found then
    if v_lease.status <> 'active'
       or v_lease.expires_at <= clock_timestamp()
       or not private.cms_qa_actor_marker_is_exact(
         v_lease.actor_id,
         v_lease.run_tag,
         v_lease.candidate_sha,
         v_lease.environment
       ) then
      raise exception 'CMS_QA_ACTOR_LEASE_EXPIRED' using errcode = '42501';
    end if;
  end if;
end;
$$;

create or replace function private.cms_dam_actor_is_qa(p_actor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, pg_temp
as $$
  select exists (
    select 1
    from private.cms_qa_actor_leases lease
    where lease.actor_id = p_actor_id
  );
$$;

create or replace function private.cms_dam_asset_in_actor_scope(
  p_actor_id uuid,
  p_asset_created_by uuid,
  p_source_kind text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, pg_temp
as $$
  select case
    when private.cms_dam_actor_is_qa(p_actor_id) then
      p_asset_created_by = p_actor_id and p_source_kind = 'synthetic_test'
    else
      p_source_kind <> 'synthetic_test'
      and not private.cms_dam_actor_is_qa(p_asset_created_by)
  end;
$$;

-- RLS cannot trust a caller-supplied actor id. Direct PostgREST reads derive
-- the actor from the verified JWT and require the same immutable QA lease
-- boundary used by the Edge RPCs. An identity that ever had a QA lease never
-- falls back to corporate visibility after expiry or cleanup.
create or replace function private.cms_dam_asset_session_scope_allowed(
  p_actor_id uuid,
  p_asset_created_by uuid,
  p_asset_created_at timestamptz,
  p_source_kind text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, auth, pg_temp
as $$
  select case
    when p_actor_id is null
      or p_asset_created_by is null
      or p_asset_created_at is null
      or p_source_kind is null
      or not exists (
        select 1 from auth.users actor where actor.id = p_actor_id
      ) then false
    when exists (
      select 1
      from private.cms_qa_actor_leases actor_history
      where actor_history.actor_id = p_actor_id
    ) then
      p_asset_created_by = p_actor_id
      and p_source_kind = 'synthetic_test'
      and exists (
        select 1
        from private.cms_qa_actor_leases lease
        where lease.actor_id = p_actor_id
          and lease.status = 'active'
          and lease.expires_at > statement_timestamp()
          and p_asset_created_at >= lease.created_at
          and p_asset_created_at <= lease.expires_at
          and private.cms_qa_actor_marker_is_exact(
            lease.actor_id,
            lease.run_tag,
            lease.candidate_sha,
            lease.environment
          )
      )
    else
      p_source_kind <> 'synthetic_test'
      and not exists (
        select 1
        from private.cms_qa_actor_leases creator_history
        where creator_history.actor_id = p_asset_created_by
      )
  end;
$$;

create or replace function public.cms_dam_asset_session_read_allowed(
  p_asset_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $$
  select public.cms_has_permission('cms:media.read')
    and exists (
      select 1
      from public.cms_media_assets asset
      where asset.id = p_asset_id
        and private.cms_dam_asset_session_scope_allowed(
          auth.uid(), asset.created_by, asset.created_at, asset.source_kind
        )
    );
$$;

create or replace function public.cms_dam_usage_session_read_allowed(
  p_asset_id uuid,
  p_item_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $$
declare
  v_content_type text;
  v_item_allowed boolean;
begin
  if not public.cms_dam_asset_session_read_allowed(p_asset_id) then
    return false;
  end if;

  select item.content_type into v_content_type
  from public.cms_content_items item
  where item.id = p_item_id;

  if not found or not public.cms_can_read_content(v_content_type) then
    return false;
  end if;

  -- 0069 installs the authoritative content-graph predicate after this
  -- migration. Dynamic resolution keeps a fresh 0065 rollout valid while
  -- enforcing the stronger graph boundary as soon as 0069 is present.
  if to_regprocedure('public.cms_content_item_session_read_allowed(uuid)') is null then
    return true;
  end if;

  execute 'select public.cms_content_item_session_read_allowed($1)'
    into v_item_allowed
    using p_item_id;
  return coalesce(v_item_allowed, false);
end;
$$;

create or replace function public.cms_dam_actor_scope(
  p_actor_id uuid,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
begin
  if public.cms_actor_authorized(
       p_actor_id, 'cms:media.read', p_aal, p_session_id, p_issued_at
     ) then
    perform private.cms_assert_dam_actor_context(
      p_actor_id, 'cms:media.read', p_aal, p_session_id, p_issued_at
    );
  elsif public.cms_actor_authorized(
       p_actor_id, 'cms:media.upload', p_aal, p_session_id, p_issued_at
     ) then
    perform private.cms_assert_dam_actor_context(
      p_actor_id, 'cms:media.upload', p_aal, p_session_id, p_issued_at
    );
  elsif public.cms_actor_authorized(
       p_actor_id, 'cms:media.manage', p_aal, p_session_id, p_issued_at
     ) then
    perform private.cms_assert_dam_actor_context(
      p_actor_id, 'cms:media.manage', p_aal, p_session_id, p_issued_at
    );
  else
    raise exception 'CMS_DAM_FORBIDDEN' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'schemaVersion', 1,
    'mode', case when private.cms_dam_actor_is_qa(p_actor_id) then 'qa' else 'corporate' end,
    'actorId', case when private.cms_dam_actor_is_qa(p_actor_id) then p_actor_id else null end
  );
end;
$$;

create or replace function public.cms_list_dam_taxonomies_scoped(
  p_actor_id uuid,
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
  v_collections jsonb;
  v_tags jsonb;
  v_actor_is_qa boolean;
begin
  perform private.cms_assert_dam_actor_context(
    p_actor_id,
    'cms:media.read',
    p_aal,
    p_session_id,
    p_issued_at
  );
  v_actor_is_qa := private.cms_dam_actor_is_qa(p_actor_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', scoped.id,
    'name', scoped.name,
    'description', scoped.description,
    'assetCount', scoped.asset_count
  ) order by scoped.name, scoped.id), '[]'::jsonb)
  into v_collections
  from (
    select
      collection.id,
      collection.name,
      collection.description,
      count(asset.id)::integer as asset_count
    from public.cms_dam_collections collection
    left join public.cms_dam_collection_assets link
      on link.collection_id = collection.id
    left join public.cms_media_assets asset
      on asset.id = link.asset_id
      and private.cms_dam_asset_in_actor_scope(
        p_actor_id, asset.created_by, asset.source_kind
      )
    where collection.status = 'active'
      and (
        (v_actor_is_qa and collection.created_by = p_actor_id)
        or (
          not v_actor_is_qa
          and not private.cms_dam_actor_is_qa(collection.created_by)
        )
      )
    group by collection.id, collection.name, collection.description
  ) scoped;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', scoped.id,
    'name', scoped.name,
    'assetCount', scoped.asset_count
  ) order by scoped.name, scoped.id), '[]'::jsonb)
  into v_tags
  from (
    select
      tag.id,
      tag.name,
      count(asset.id)::integer as asset_count
    from public.cms_dam_tags tag
    left join public.cms_dam_asset_tags link
      on link.tag_id = tag.id
    left join public.cms_media_assets asset
      on asset.id = link.asset_id
      and private.cms_dam_asset_in_actor_scope(
        p_actor_id, asset.created_by, asset.source_kind
      )
    where (
      (v_actor_is_qa and tag.created_by = p_actor_id)
      or (
        not v_actor_is_qa
        and not private.cms_dam_actor_is_qa(tag.created_by)
      )
    )
    group by tag.id, tag.name
  ) scoped;

  return jsonb_build_object('collections', v_collections, 'tags', v_tags);
end;
$$;

create or replace function private.cms_guard_dam_asset_actor_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private, pg_temp
as $$
declare
  v_bound_actor_id uuid;
begin
  if current_setting('cms.qa_compensating', true) = 'on' then
    return new;
  end if;
  v_bound_actor_id := nullif(current_setting('cms.qa_mutation_actor_id', true), '')::uuid;
  if private.cms_dam_actor_is_qa(new.created_by)
     and new.source_kind <> 'synthetic_test' then
    raise exception 'CMS_DAM_QA_SOURCE_KIND_INVALID' using errcode = '42501';
  end if;
  if v_bound_actor_id is not null
     and not private.cms_dam_asset_in_actor_scope(
       v_bound_actor_id, new.created_by, new.source_kind
     ) then
    raise exception 'CMS_DAM_ACTOR_SCOPE_FORBIDDEN' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function private.cms_guard_dam_asset_gc_fence()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private, pg_temp
as $$
declare
  v_operation text := current_setting('cms.dam_gc_operation', true);
  v_claim_id uuid := nullif(current_setting('cms.dam_gc_claim_id', true), '')::uuid;
begin
  if tg_op = 'INSERT' then
    if new.gc_claim_id is not null
       or exists (
         select 1
         from private.cms_dam_gc_fences fence
         where fence.asset_id = new.id
       ) then
      raise exception 'CMS_DAM_GC_ASSET_FENCED' using errcode = 'P0001';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.gc_claim_id is null then
      return old;
    end if;
    if v_operation = 'complete'
       and v_claim_id is not null
       and old.gc_claim_id = v_claim_id then
      return old;
    end if;
    raise exception 'CMS_DAM_GC_ASSET_FENCED' using errcode = 'P0001';
  end if;

  if old.gc_claim_id is null and new.gc_claim_id is null then
    return new;
  end if;
  if v_operation = 'prepare'
     and v_claim_id is not null
     and new.gc_claim_id = v_claim_id
     and new.gc_claim_job_id is not null
     and new.gc_claimed_by is not null
     and new.gc_claimed_at is not null
     and new.gc_claim_expires_at > new.gc_claimed_at
     and (
       old.gc_claim_id is null
       or old.gc_claim_id = v_claim_id
       or old.gc_claim_expires_at <= clock_timestamp()
     ) then
    return new;
  end if;
  if v_operation = 'complete'
     and v_claim_id is not null
     and old.gc_claim_id = v_claim_id
     and new.gc_claim_id is null
     and new.gc_claim_job_id is null
     and new.gc_claimed_by is null
     and new.gc_claimed_at is null
     and new.gc_claim_expires_at is null then
    return new;
  end if;
  raise exception 'CMS_DAM_GC_ASSET_FENCED' using errcode = 'P0001';
end;
$$;

create or replace function private.cms_assert_dam_gc_context(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_flag jsonb;
  v_lease_environment text;
begin
  if p_environment not in ('local', 'staging', 'production')
     or p_site_key <> 'main' then
    raise exception 'CMS_DAM_SCOPE_MISMATCH' using errcode = '42501';
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

  v_flag := public.cms_evaluate_feature_flag(
    p_actor_id,
    'ev2.dam',
    p_environment,
    p_site_key,
    p_aal,
    p_session_id,
    p_issued_at
  );
  if coalesce((v_flag ->> 'enabled')::boolean, false) is not true then
    raise exception 'CMS_DAM_FEATURE_DISABLED' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.cms_dam_gc_scope_allowed(
  p_actor_id uuid,
  p_job_created_by uuid,
  p_asset_id uuid,
  p_asset_created_by uuid,
  p_asset_source_kind text
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, private, pg_temp
as $$
declare
  v_actor_is_qa boolean := private.cms_dam_actor_is_qa(p_actor_id);
  v_job_is_qa boolean := private.cms_dam_actor_is_qa(p_job_created_by);
  v_asset_is_qa boolean := p_asset_id is not null
    and private.cms_dam_actor_is_qa(p_asset_created_by);
begin
  if p_actor_id is null or p_job_created_by is null then
    return false;
  end if;
  if p_asset_id is not null and p_asset_created_by is null then
    return false;
  end if;
  if p_asset_id is not null and p_asset_source_kind is null then
    return false;
  end if;

  if v_actor_is_qa then
    return p_job_created_by = p_actor_id
      and (
        p_asset_id is null
        or (
          p_asset_created_by = p_actor_id
          and p_asset_source_kind = 'synthetic_test'
        )
      );
  end if;

  -- Um operador corporativo nunca atravessa uma lease QA ativa. Depois que o
  -- watchdog a terminaliza, ele pode concluir o GC retido, mas apenas quando
  -- job e ativo pertencem ao mesmo ator sintetico original.
  if exists (
    select 1
    from private.cms_qa_actor_leases lease
    where lease.actor_id in (p_job_created_by, p_asset_created_by)
      and lease.status = 'active'
  ) then
    return false;
  end if;
  if v_job_is_qa or v_asset_is_qa then
    return v_job_is_qa
      and (
        p_asset_id is null
        or (
          v_asset_is_qa
          and p_asset_created_by = p_job_created_by
          and p_asset_source_kind = 'synthetic_test'
        )
      );
  end if;
  return p_asset_id is null or p_asset_source_kind <> 'synthetic_test';
end;
$$;

create or replace function private.cms_lock_dam_gc_scope(
  p_actor_id uuid,
  p_job_created_by uuid,
  p_asset_created_by uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, private, pg_temp
as $$
declare
  v_active_actor_ids uuid[];
begin
  select coalesce(array_agg(lease.actor_id order by lease.actor_id), '{}'::uuid[])
  into v_active_actor_ids
  from private.cms_qa_actor_leases lease
  where lease.actor_id = any(array[p_actor_id, p_job_created_by, p_asset_created_by])
    and lease.status = 'active';
  perform private.cms_lock_active_qa_actor_leases(v_active_actor_ids);
end;
$$;

create or replace function public.cms_list_dam_gc_candidates(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_job_id uuid default null,
  p_limit integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_candidates jsonb;
begin
  perform private.cms_assert_dam_gc_context(
    p_actor_id, p_environment, p_site_key, p_aal, p_session_id, p_issued_at
  );
  if p_limit not between 1 and 50 then
    raise exception 'CMS_DAM_GC_LIMIT_INVALID' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(to_jsonb(candidate) order by candidate.execute_after, candidate.id), '[]'::jsonb)
  into v_candidates
  from (
    select
      job.id,
      job.asset_id,
      job.asset_snapshot,
      job.execute_after,
      job.status,
      job.attempts,
      job.updated_at
    from public.cms_dam_gc_jobs job
    left join public.cms_media_assets asset on asset.id = job.asset_id
    where job.status in ('pending', 'failed', 'processing', 'blocked')
      and job.execute_after <= statement_timestamp()
      and (
        job.status <> 'processing'
        or job.processing_claim_id is null
        or job.processing_claim_expires_at <= clock_timestamp()
      )
      and (p_job_id is null or job.id = p_job_id)
      and private.cms_dam_gc_scope_allowed(
        p_actor_id,
        job.created_by,
        job.asset_id,
        asset.created_by,
        asset.source_kind
      )
    order by job.execute_after, job.id
    limit p_limit
  ) candidate;
  return v_candidates;
end;
$$;

create or replace function public.cms_prepare_dam_gc(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_job_id uuid,
  p_claim_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_job_seed public.cms_dam_gc_jobs%rowtype;
  v_job public.cms_dam_gc_jobs%rowtype;
  v_asset_seed public.cms_media_assets%rowtype;
  v_asset public.cms_media_assets%rowtype;
  v_snapshot jsonb;
  v_snapshot_asset_id uuid;
  v_path jsonb;
  v_path_text text;
  v_terminal_qa_target boolean := false;
  v_claim_expires_at timestamptz;
  v_fence_job_id uuid;
begin
  perform private.cms_assert_dam_gc_context(
    p_actor_id, p_environment, p_site_key, p_aal, p_session_id, p_issued_at
  );
  if p_job_id is null or p_claim_id is null then
    raise exception 'CMS_DAM_GC_CLAIM_INVALID' using errcode = '22023';
  end if;
  perform set_config('cms.qa_mutation_actor_id', p_actor_id::text, true);

  select job.* into v_job_seed
  from public.cms_dam_gc_jobs job
  where job.id = p_job_id;
  if not found then
    raise exception 'CMS_DAM_GC_JOB_INVALID' using errcode = 'P0001';
  end if;
  if v_job_seed.asset_id is not null then
    select asset.* into v_asset_seed
    from public.cms_media_assets asset
    where asset.id = v_job_seed.asset_id;
    if not found then
      raise exception 'CMS_DAM_GC_SCOPE_CHANGED' using errcode = 'P0001';
    end if;
  end if;
  if private.cms_dam_actor_is_qa(p_actor_id)
     and (
       v_job_seed.created_by <> p_actor_id
       or (
         v_job_seed.asset_id is not null
         and v_asset_seed.created_by <> p_actor_id
       )
     ) then
    raise exception 'CMS_DAM_GC_ACTOR_SCOPE_FORBIDDEN' using errcode = '42501';
  end if;

  -- Lease primeiro, recursos depois: mesma ordem usada pelo watchdog.
  perform private.cms_lock_dam_gc_scope(
    p_actor_id,
    v_job_seed.created_by,
    v_asset_seed.created_by
  );

  select job.* into v_job
  from public.cms_dam_gc_jobs job
  where job.id = p_job_id
  for update;
  if not found
     or v_job.created_by is distinct from v_job_seed.created_by
     or v_job.asset_id is distinct from v_job_seed.asset_id
     or v_job.status is distinct from v_job_seed.status
     or v_job.attempts is distinct from v_job_seed.attempts
     or v_job.processing_claim_id is distinct from v_job_seed.processing_claim_id
     or v_job.updated_at is distinct from v_job_seed.updated_at then
    raise exception 'CMS_DAM_GC_SCOPE_CHANGED' using errcode = 'P0001';
  end if;
  if v_job.status not in ('pending', 'failed', 'processing', 'blocked')
     or v_job.execute_after > statement_timestamp()
     or v_job.attempts >= 20 then
    raise exception 'CMS_DAM_GC_JOB_INVALID' using errcode = 'P0001';
  end if;

  if v_job.asset_id is not null then
    select asset.* into v_asset
    from public.cms_media_assets asset
    where asset.id = v_job.asset_id
    for update;
    if not found
       or v_asset.created_by is distinct from v_asset_seed.created_by
       or v_asset.lock_version is distinct from v_asset_seed.lock_version
       or v_asset.updated_at is distinct from v_asset_seed.updated_at then
      raise exception 'CMS_DAM_GC_SCOPE_CHANGED' using errcode = 'P0001';
    end if;
    lock table public.cms_dam_replacements in share row exclusive mode;
  end if;

  if not private.cms_dam_gc_scope_allowed(
    p_actor_id,
    v_job.created_by,
    v_job.asset_id,
    v_asset.created_by,
    v_asset.source_kind
  ) then
    raise exception 'CMS_DAM_GC_ACTOR_SCOPE_FORBIDDEN' using errcode = '42501';
  end if;

  select exists (
    select 1
    from private.cms_qa_actor_leases lease
    where lease.actor_id in (v_job.created_by, v_asset.created_by)
      and lease.status in ('cleaned', 'expired')
  ) and not private.cms_dam_actor_is_qa(p_actor_id)
  into v_terminal_qa_target;
  if v_terminal_qa_target then
    -- Escopo terminal ja foi validado acima. O bypass e local a esta transacao
    -- e permite que a retencao sintetica seja fisicamente concluida.
    perform set_config('cms.qa_compensating', 'on', true);
  end if;

  if v_job.asset_id is null then
    v_snapshot := v_job.asset_snapshot;
    if v_snapshot ->> 'assetId' is null
       or (v_snapshot ->> 'assetId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or jsonb_typeof(v_snapshot -> 'paths') is distinct from 'array'
       or jsonb_array_length(v_snapshot -> 'paths') = 0 then
      raise exception 'CMS_DAM_GC_SNAPSHOT_INVALID' using errcode = '22023';
    end if;
    v_snapshot_asset_id := (v_snapshot ->> 'assetId')::uuid;
    for v_path in select value from jsonb_array_elements(v_snapshot -> 'paths') loop
      if jsonb_typeof(v_path) <> 'string' then
        raise exception 'CMS_DAM_GC_SNAPSHOT_INVALID' using errcode = '22023';
      end if;
      v_path_text := v_path #>> '{}';
      if left(v_path_text, char_length('cms/' || v_snapshot_asset_id::text || '/'))
           <> 'cms/' || v_snapshot_asset_id::text || '/'
         or v_path_text !~ '^cms/[0-9a-f-]{36}/(original\.(png|jpg|webp|avif)|(thumbnail|medium|large)\.(webp|avif))$' then
        raise exception 'CMS_DAM_GC_SNAPSHOT_INVALID' using errcode = '22023';
      end if;
    end loop;
    if exists (
      select 1
      from public.cms_media_assets asset
      where asset.id = v_snapshot_asset_id
    ) then
      -- O FK nulo identifica uma preparacao legada. Se o UUID reapareceu,
      -- trata-se de outra geracao e os paths antigos jamais podem ser tocados.
      raise exception 'CMS_DAM_GC_GENERATION_CONFLICT' using errcode = 'P0001';
    end if;
  else
    if v_asset.archived_at is null
       or v_asset.archived_at > statement_timestamp() - interval '30 days'
       or v_asset.finalization_claim_id is not null
       or exists (select 1 from public.cms_media_usages usage where usage.asset_id = v_asset.id)
       or exists (
         select 1 from public.cms_dam_replacements replacement
         where replacement.status = 'active'
           and (replacement.source_asset_id = v_asset.id or replacement.target_asset_id = v_asset.id)
       ) then
      raise exception 'CMS_DAM_GC_ASSET_BLOCKED' using errcode = 'P0001';
    end if;
    v_snapshot := v_job.asset_snapshot || jsonb_build_object(
      'assetId', v_asset.id,
      'storagePath', v_asset.storage_path,
      'sha256', v_asset.sha256,
      'paths', jsonb_build_array(v_asset.storage_path) || coalesce(
        (
          select jsonb_agg(variant.transform_path order by variant.transform_path)
          from public.cms_media_variants variant
          where variant.asset_id = v_asset.id
        ),
        '[]'::jsonb
      )
    );
    v_snapshot_asset_id := v_asset.id;
  end if;

  -- Nunca entregue a Edge um path fora da geracao cercada, mesmo que dados
  -- historicos tenham sido inseridos antes dos validadores atuais.
  if jsonb_typeof(v_snapshot -> 'paths') is distinct from 'array'
     or jsonb_array_length(v_snapshot -> 'paths') = 0 then
    raise exception 'CMS_DAM_GC_SNAPSHOT_INVALID' using errcode = '22023';
  end if;
  for v_path in select value from jsonb_array_elements(v_snapshot -> 'paths') loop
    if jsonb_typeof(v_path) <> 'string' then
      raise exception 'CMS_DAM_GC_SNAPSHOT_INVALID' using errcode = '22023';
    end if;
    v_path_text := v_path #>> '{}';
    if left(v_path_text, char_length('cms/' || v_snapshot_asset_id::text || '/'))
         <> 'cms/' || v_snapshot_asset_id::text || '/'
       or v_path_text
         !~ '^cms/[0-9a-f-]{36}/(original\.(png|jpg|webp|avif)|(thumbnail|medium|large)\.(webp|avif))$' then
      raise exception 'CMS_DAM_GC_SNAPSHOT_INVALID' using errcode = '22023';
    end if;
  end loop;

  if v_job.processing_claim_id is not null
     and v_job.processing_claim_expires_at > clock_timestamp() then
    if v_job.status = 'processing'
       and v_job.processing_claim_id = p_claim_id
       and v_job.processing_claimed_by = p_actor_id
       and exists (
         select 1
         from private.cms_dam_gc_fences fence
         where fence.asset_id = v_snapshot_asset_id
           and fence.job_id = v_job.id
           and fence.claim_id = p_claim_id
           and fence.claimed_by = p_actor_id
       )
       and (
         v_job.asset_id is null
         or (
           v_asset.gc_claim_id = p_claim_id
           and v_asset.gc_claim_job_id = v_job.id
           and v_asset.gc_claimed_by = p_actor_id
           and v_asset.lock_version = v_job.prepared_asset_lock_version
         )
       ) then
      return v_job.asset_snapshot || jsonb_build_object(
        'claimId', p_claim_id,
        'claimExpiresAt', v_job.processing_claim_expires_at,
        'replayed', true
      );
    end if;
    raise exception 'CMS_DAM_GC_BUSY' using errcode = 'P0001';
  end if;

  v_claim_expires_at := statement_timestamp() + interval '15 minutes';
  insert into private.cms_dam_gc_fences as fence (
    asset_id, job_id, claim_id, claimed_by, claim_expires_at, updated_at
  ) values (
    v_snapshot_asset_id, v_job.id, p_claim_id, p_actor_id,
    v_claim_expires_at, statement_timestamp()
  )
  on conflict (asset_id) do update set
    job_id = excluded.job_id,
    claim_id = excluded.claim_id,
    claimed_by = excluded.claimed_by,
    claim_expires_at = excluded.claim_expires_at,
    updated_at = excluded.updated_at
  where fence.job_id = excluded.job_id
     or exists (
       select 1
       from public.cms_dam_gc_jobs incumbent
       where incumbent.id = fence.job_id
         and incumbent.status = 'canceled'
     )
  returning fence.job_id into v_fence_job_id;
  if v_fence_job_id is distinct from v_job.id then
    raise exception 'CMS_DAM_GC_GENERATION_CONFLICT' using errcode = 'P0001';
  end if;

  if v_asset.id is not null then
    perform set_config('cms.dam_gc_operation', 'prepare', true);
    perform set_config('cms.dam_gc_claim_id', p_claim_id::text, true);
    update public.cms_media_assets asset
    set gc_claim_id = p_claim_id,
        gc_claim_job_id = v_job.id,
        gc_claimed_by = p_actor_id,
        gc_claimed_at = statement_timestamp(),
        gc_claim_expires_at = v_claim_expires_at,
        lock_version = asset.lock_version + 1
    where asset.id = v_asset.id
      and asset.lock_version = v_asset.lock_version
      and asset.updated_at = v_asset.updated_at
      and (
        asset.gc_claim_id is null
        or asset.gc_claim_id = p_claim_id
        or asset.gc_claim_expires_at <= clock_timestamp()
      )
    returning asset.* into v_asset;
    if not found then
      raise exception 'CMS_DAM_GC_CAS_CONFLICT' using errcode = 'P0001';
    end if;
  end if;

  update public.cms_dam_gc_jobs job
  set status = 'processing',
      attempts = job.attempts + 1,
      completed_at = null,
      last_error = null,
      asset_snapshot = v_snapshot,
      processing_claim_id = p_claim_id,
      processing_claimed_by = p_actor_id,
      processing_claimed_at = statement_timestamp(),
      processing_claim_expires_at = v_claim_expires_at,
      prepared_asset_lock_version = case
        when v_asset.id is null then null
        else v_asset.lock_version
      end
  where job.id = v_job.id
    and job.status = v_job.status
    and job.attempts = v_job.attempts
    and job.processing_claim_id is not distinct from v_job.processing_claim_id
    and job.updated_at = v_job.updated_at
  returning job.* into v_job;
  if not found then
    raise exception 'CMS_DAM_GC_CAS_CONFLICT' using errcode = 'P0001';
  end if;

  return v_snapshot || jsonb_build_object(
    'claimId', p_claim_id,
    'claimExpiresAt', v_claim_expires_at,
    'replayed', false
  );
end;
$$;

create or replace function public.cms_complete_dam_gc(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_job_id uuid,
  p_claim_id uuid,
  p_succeeded boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_job_seed public.cms_dam_gc_jobs%rowtype;
  v_job public.cms_dam_gc_jobs%rowtype;
  v_asset_seed public.cms_media_assets%rowtype;
  v_asset public.cms_media_assets%rowtype;
  v_fence private.cms_dam_gc_fences%rowtype;
  v_snapshot_asset_id uuid;
  v_terminal_qa_target boolean := false;
begin
  perform private.cms_assert_dam_gc_context(
    p_actor_id, p_environment, p_site_key, p_aal, p_session_id, p_issued_at
  );
  if p_job_id is null or p_claim_id is null or p_succeeded is null then
    raise exception 'CMS_DAM_GC_CLAIM_INVALID' using errcode = '22023';
  end if;
  perform set_config('cms.qa_mutation_actor_id', p_actor_id::text, true);

  select job.* into v_job_seed
  from public.cms_dam_gc_jobs job
  where job.id = p_job_id;
  if not found then
    raise exception 'CMS_DAM_GC_JOB_INVALID' using errcode = 'P0001';
  end if;
  if v_job_seed.asset_snapshot ->> 'assetId' is null
     or (v_job_seed.asset_snapshot ->> 'assetId')
       !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'CMS_DAM_GC_SNAPSHOT_INVALID' using errcode = '22023';
  end if;
  v_snapshot_asset_id := (v_job_seed.asset_snapshot ->> 'assetId')::uuid;
  if v_job_seed.asset_id is not null then
    select asset.* into v_asset_seed
    from public.cms_media_assets asset
    where asset.id = v_job_seed.asset_id;
    if not found then
      raise exception 'CMS_DAM_GC_SCOPE_CHANGED' using errcode = 'P0001';
    end if;
  end if;
  if private.cms_dam_actor_is_qa(p_actor_id)
     and (
       v_job_seed.created_by <> p_actor_id
       or (
         v_job_seed.asset_id is not null
         and (
           v_asset_seed.created_by <> p_actor_id
           or v_asset_seed.source_kind <> 'synthetic_test'
         )
       )
     ) then
    raise exception 'CMS_DAM_GC_ACTOR_SCOPE_FORBIDDEN' using errcode = '42501';
  end if;
  perform private.cms_lock_dam_gc_scope(
    p_actor_id, v_job_seed.created_by, v_asset_seed.created_by
  );
  select job.* into v_job
  from public.cms_dam_gc_jobs job
  where job.id = p_job_id
  for update;
  if not found
     or v_job.created_by is distinct from v_job_seed.created_by
     or v_job.asset_id is distinct from v_job_seed.asset_id
     or v_job.status is distinct from v_job_seed.status
     or v_job.attempts is distinct from v_job_seed.attempts
     or v_job.processing_claim_id is distinct from v_job_seed.processing_claim_id
     or v_job.updated_at is distinct from v_job_seed.updated_at then
    raise exception 'CMS_DAM_GC_SCOPE_CHANGED' using errcode = 'P0001';
  end if;

  if v_job.asset_id is not null then
    select asset.* into v_asset
    from public.cms_media_assets asset
    where asset.id = v_job.asset_id
    for update;
    if not found
       or v_asset.created_by is distinct from v_asset_seed.created_by
       or v_asset.lock_version is distinct from v_asset_seed.lock_version
       or v_asset.updated_at is distinct from v_asset_seed.updated_at then
      raise exception 'CMS_DAM_GC_SCOPE_CHANGED' using errcode = 'P0001';
    end if;
    lock table public.cms_dam_replacements in share row exclusive mode;
  elsif exists (
    select 1
    from public.cms_media_assets asset
    where asset.id = v_snapshot_asset_id
  ) then
    raise exception 'CMS_DAM_GC_GENERATION_CONFLICT' using errcode = 'P0001';
  end if;

  if not private.cms_dam_gc_scope_allowed(
    p_actor_id,
    v_job.created_by,
    v_job.asset_id,
    v_asset.created_by,
    v_asset.source_kind
  ) then
    raise exception 'CMS_DAM_GC_ACTOR_SCOPE_FORBIDDEN' using errcode = '42501';
  end if;

  if v_job.status = 'done'
     and v_job.asset_snapshot ->> 'completedClaimId' = p_claim_id::text
     and v_job.asset_snapshot ->> 'completedBy' = p_actor_id::text then
    return jsonb_build_object(
      'jobId', v_job.id,
      'status', v_job.status,
      'attempts', v_job.attempts,
      'completedAt', v_job.completed_at,
      'replayed', true
    );
  end if;
  if v_job.status <> 'processing'
     or v_job.processing_claim_id <> p_claim_id
     or v_job.processing_claimed_by <> p_actor_id then
    raise exception 'CMS_DAM_GC_CLAIM_INVALID' using errcode = '42501';
  end if;

  select fence.* into v_fence
  from private.cms_dam_gc_fences fence
  where fence.asset_id = v_snapshot_asset_id
  for update;
  if not found
     or v_fence.job_id <> v_job.id
     or v_fence.claim_id <> p_claim_id
     or v_fence.claimed_by <> p_actor_id then
    raise exception 'CMS_DAM_GC_CAS_CONFLICT' using errcode = 'P0001';
  end if;

  select exists (
    select 1
    from private.cms_qa_actor_leases lease
    where lease.actor_id in (v_job.created_by, v_asset.created_by)
      and lease.status in ('cleaned', 'expired')
  ) and not private.cms_dam_actor_is_qa(p_actor_id)
  into v_terminal_qa_target;
  if v_terminal_qa_target then
    perform set_config('cms.qa_compensating', 'on', true);
  end if;

  perform set_config('cms.dam_gc_operation', 'complete', true);
  perform set_config('cms.dam_gc_claim_id', p_claim_id::text, true);

  if p_succeeded then
    if v_asset.id is not null then
      if v_asset.gc_claim_id <> p_claim_id
         or v_asset.gc_claim_job_id <> v_job.id
         or v_asset.gc_claimed_by <> p_actor_id
         or v_asset.lock_version <> v_job.prepared_asset_lock_version
         or v_asset.archived_at is null
         or v_asset.archived_at > statement_timestamp() - interval '30 days'
         or v_asset.finalization_claim_id is not null
         or exists (
           select 1 from public.cms_media_usages usage
           where usage.asset_id = v_asset.id
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
        raise exception 'CMS_DAM_GC_ASSET_BLOCKED' using errcode = 'P0001';
      end if;

      delete from public.cms_dam_collection_assets link
      where link.asset_id = v_asset.id;
      delete from public.cms_dam_asset_tags link
      where link.asset_id = v_asset.id;
      delete from public.cms_dam_crops crop
      where crop.asset_id = v_asset.id;
      delete from public.cms_media_assets asset
      where asset.id = v_asset.id
        and asset.lock_version = v_asset.lock_version
        and asset.gc_claim_id = p_claim_id
        and asset.gc_claim_job_id = v_job.id;
      if not found then
        raise exception 'CMS_DAM_GC_CAS_CONFLICT' using errcode = 'P0001';
      end if;
    end if;

    update public.cms_dam_gc_jobs job
    set status = 'done',
        completed_at = statement_timestamp(),
        last_error = null,
        asset_snapshot = job.asset_snapshot || jsonb_build_object(
          'completedClaimId', p_claim_id,
          'completedBy', p_actor_id
        ),
        processing_claim_id = null,
        processing_claimed_by = null,
        processing_claimed_at = null,
        processing_claim_expires_at = null,
        prepared_asset_lock_version = null
    where job.id = v_job.id
      and job.status = 'processing'
      and job.processing_claim_id = p_claim_id
      and job.processing_claimed_by = p_actor_id
      and job.attempts = v_job.attempts
    returning job.* into v_job;
    if not found then
      raise exception 'CMS_DAM_GC_CAS_CONFLICT' using errcode = 'P0001';
    end if;

    -- O UUID fica tombstonado mesmo depois do sucesso. Um worker cujo claim
    -- expirou pode acordar tarde e repetir Storage.remove; impedir reuso
    -- permanente do path elimina essa ultima janela ABA.
    update private.cms_dam_gc_fences fence
    set claim_id = null,
        claimed_by = null,
        claim_expires_at = null,
        updated_at = statement_timestamp()
    where fence.asset_id = v_snapshot_asset_id
      and fence.job_id = v_job.id
      and fence.claim_id = p_claim_id
      and fence.claimed_by = p_actor_id;
    if not found then
      raise exception 'CMS_DAM_GC_CAS_CONFLICT' using errcode = 'P0001';
    end if;
  else
    -- Uma resposta de Storage com erro pode representar remocao parcial. O
    -- ativo continua arquivado e fenced; outro worker so pode reassumir a
    -- geracao depois da expiracao do claim, nunca restaura-la como integra.
    update public.cms_dam_gc_jobs job
    set status = 'failed',
        completed_at = null,
        last_error = 'Falha ao remover objetos privados.',
        processing_claim_id = null,
        processing_claimed_by = null,
        processing_claimed_at = null,
        processing_claim_expires_at = null,
        prepared_asset_lock_version = null
    where job.id = v_job.id
      and job.status = 'processing'
      and job.processing_claim_id = p_claim_id
      and job.processing_claimed_by = p_actor_id
      and job.attempts = v_job.attempts
    returning job.* into v_job;
    if not found then
      raise exception 'CMS_DAM_GC_CAS_CONFLICT' using errcode = 'P0001';
    end if;

    update private.cms_dam_gc_fences fence
    set claim_id = null,
        claimed_by = null,
        claim_expires_at = null,
        updated_at = statement_timestamp()
    where fence.asset_id = v_snapshot_asset_id
      and fence.job_id = v_job.id
      and fence.claim_id = p_claim_id
      and fence.claimed_by = p_actor_id;
    if not found then
      raise exception 'CMS_DAM_GC_CAS_CONFLICT' using errcode = 'P0001';
    end if;
  end if;
  return jsonb_build_object(
    'jobId', v_job.id,
    'status', v_job.status,
    'attempts', v_job.attempts,
    'completedAt', v_job.completed_at,
    'replayed', false
  );
end;
$$;

create or replace function public.cms_claim_dam_finalization(
  p_actor_id uuid,
  p_asset_id uuid,
  p_claim_id uuid,
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
  v_seed public.cms_media_assets%rowtype;
  v_asset public.cms_media_assets%rowtype;
  v_active_actor_ids uuid[];
  v_variant_count integer;
begin
  perform private.cms_assert_dam_actor_context(
    p_actor_id,
    'cms:media.upload',
    p_aal,
    p_session_id,
    p_issued_at
  );
  if p_asset_id is null or p_claim_id is null then
    raise exception 'CMS_DAM_FINALIZATION_INVALID' using errcode = '22023';
  end if;
  perform set_config('cms.qa_mutation_actor_id', p_actor_id::text, true);

  select asset.* into v_seed
  from public.cms_media_assets asset
  where asset.id = p_asset_id;
  if not found then
    raise exception 'CMS_DAM_ASSET_NOT_FOUND' using errcode = 'P0001';
  end if;
  if private.cms_dam_actor_is_qa(p_actor_id)
     and v_seed.created_by <> p_actor_id then
    raise exception 'CMS_DAM_FINALIZATION_OWNER_INVALID' using errcode = '42501';
  end if;
  select coalesce(array_agg(lease.actor_id order by lease.actor_id), '{}'::uuid[])
  into v_active_actor_ids
  from private.cms_qa_actor_leases lease
  where lease.actor_id = any(array[p_actor_id, v_seed.created_by])
    and lease.status = 'active';
  perform private.cms_lock_active_qa_actor_leases(v_active_actor_ids);

  select asset.* into v_asset
  from public.cms_media_assets asset
  where asset.id = p_asset_id
  for update;
  if not found
     or v_asset.created_by is distinct from v_seed.created_by
     or v_asset.source_kind is distinct from v_seed.source_kind then
    raise exception 'CMS_DAM_FINALIZATION_SCOPE_CHANGED' using errcode = 'P0001';
  end if;
  if v_asset.created_by <> p_actor_id
     or not private.cms_dam_asset_in_actor_scope(
       p_actor_id, v_asset.created_by, v_asset.source_kind
     ) then
    raise exception 'CMS_DAM_FINALIZATION_OWNER_INVALID' using errcode = '42501';
  end if;

  if v_asset.processing_status = 'ready' then
    select count(*)::integer into v_variant_count
    from public.cms_media_variants variant
    where variant.asset_id = v_asset.id;
    return jsonb_build_object(
      'assetId', v_asset.id,
      'status', 'ready',
      'sha256', v_asset.sha256,
      'width', v_asset.width,
      'height', v_asset.height,
      'variants', v_variant_count,
      'replayed', true
    );
  end if;
  if v_asset.processing_status not in ('awaiting_upload', 'processing', 'failed') then
    raise exception 'CMS_DAM_FINALIZATION_CLOSED' using errcode = 'P0001';
  end if;
  if v_asset.finalization_claim_id is not null
     and v_asset.finalization_claim_expires_at > clock_timestamp()
     and (
       v_asset.finalization_claim_id <> p_claim_id
       or v_asset.finalization_claimed_by <> p_actor_id
     ) then
    raise exception 'CMS_DAM_FINALIZATION_BUSY' using errcode = 'P0001';
  end if;

  if v_asset.finalization_claim_id = p_claim_id
     and v_asset.finalization_claimed_by = p_actor_id
     and v_asset.finalization_claim_expires_at > clock_timestamp() then
    return jsonb_build_object(
      'assetId', v_asset.id,
      'status', 'processing',
      'declaredMime', v_asset.declared_mime,
      'storagePath', v_asset.storage_path,
      'lockVersion', v_asset.lock_version,
      'claimId', v_asset.finalization_claim_id,
      'claimExpiresAt', v_asset.finalization_claim_expires_at,
      'replayed', true
    );
  end if;

  update public.cms_media_assets asset
  set processing_status = 'processing',
      finalization_claim_id = p_claim_id,
      finalization_claimed_by = p_actor_id,
      finalization_claimed_at = statement_timestamp(),
      finalization_claim_expires_at = statement_timestamp() + interval '15 minutes',
      lock_version = asset.lock_version + 1
  where asset.id = v_asset.id
    and asset.lock_version = v_asset.lock_version
    and asset.processing_status = v_asset.processing_status
    and asset.finalization_claim_id is not distinct from v_asset.finalization_claim_id
  returning asset.* into v_asset;
  if not found then
    raise exception 'CMS_DAM_FINALIZATION_CAS_CONFLICT' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'assetId', v_asset.id,
    'status', v_asset.processing_status,
    'declaredMime', v_asset.declared_mime,
    'storagePath', v_asset.storage_path,
    'lockVersion', v_asset.lock_version,
    'claimId', v_asset.finalization_claim_id,
    'claimExpiresAt', v_asset.finalization_claim_expires_at,
    'replayed', false
  );
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
      scan_status = case when v_status = 'rejected' then 'rejected' else asset.scan_status end,
      scan_engine = case when v_status = 'rejected' then 'raster-signature-v2' else asset.scan_engine end,
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
    insert into public.cms_dam_gc_jobs (
      asset_id, asset_snapshot, execute_after, created_by
    ) values (
      v_asset.id,
      jsonb_build_object(
        'assetId', v_asset.id,
        'storagePath', v_asset.storage_path,
        'sha256', v_asset.sha256,
        'paths', jsonb_build_array(v_asset.storage_path) || coalesce(
          (
            select jsonb_agg(variant.transform_path order by variant.transform_path)
            from public.cms_media_variants variant
            where variant.asset_id = v_asset.id
          ),
          '[]'::jsonb
        )
      ),
      statement_timestamp() + interval '30 days',
      p_actor_id
    ) on conflict (asset_id) where status in ('pending', 'processing', 'blocked', 'failed')
      do nothing;
  end if;

  insert into public.cms_audit_log (
    actor_id, action, target_type, target_id, event_data, correlation_id
  ) values (
    p_actor_id,
    'cms:media.finalization_failed',
    'media_asset',
    p_asset_id::text,
    jsonb_build_object('reasonCode', p_reason_code, 'status', v_status),
    p_correlation_id
  );
  insert into public.cms_dam_events (
    asset_id, actor_id, event_type, event_data, correlation_id
  ) values (
    p_asset_id,
    p_actor_id,
    'finalization_failed',
    jsonb_build_object('reasonCode', p_reason_code, 'status', v_status),
    p_correlation_id
  );
  return jsonb_build_object(
    'assetId', v_asset.id,
    'status', v_asset.processing_status,
    'archived', v_asset.archived_at is not null
  );
end;
$$;

create or replace function public.cms_finalize_dam_asset(
  p_actor_id uuid,
  p_asset_id uuid,
  p_claim_id uuid,
  p_detected_mime text,
  p_byte_size bigint,
  p_sha256 text,
  p_width integer,
  p_height integer,
  p_variants jsonb,
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
  v_variant_count integer;
begin
  perform private.cms_assert_dam_actor_context(
    p_actor_id,
    'cms:media.upload',
    p_aal,
    p_session_id,
    p_issued_at
  );
  perform set_config('cms.qa_mutation_actor_id', p_actor_id::text, true);
  if p_claim_id is null
     or p_correlation_id is null
     or p_detected_mime not in ('image/png', 'image/jpeg', 'image/webp', 'image/avif')
     or p_byte_size not between 1 and 20971520
     or p_sha256 !~ '^[0-9a-f]{64}$'
     or p_width not between 1 and 20000
     or p_height not between 1 and 20000
     or p_width::bigint * p_height::bigint > 80000000
     or jsonb_typeof(p_variants) <> 'array'
     or jsonb_array_length(p_variants) <> 6 then
    raise exception 'CMS_DAM_FINALIZATION_INVALID' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_variants) as variant(
      variant_key text, format text, width integer, height integer, transform_path text
    )
    where variant.variant_key not in ('thumbnail', 'medium', 'large')
       or variant.format not in ('webp', 'avif')
       or variant.width not between 1 and p_width
       or variant.height not between 1 and p_height
       or variant.width::bigint * variant.height::bigint > 80000000
       or variant.transform_path <>
         'cms/' || p_asset_id::text || '/' || variant.variant_key || '.' || variant.format
  ) or (
    select count(*) <> 6
    from (
      select distinct variant.variant_key, variant.format
      from jsonb_to_recordset(p_variants) as variant(
        variant_key text, format text, width integer, height integer, transform_path text
      )
    ) unique_variant
  ) then
    raise exception 'CMS_DAM_VARIANT_INVALID' using errcode = '22023';
  end if;

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
     or v_asset.finalization_claimed_by <> p_actor_id
     or v_asset.finalization_claim_expires_at <= clock_timestamp() then
    raise exception 'CMS_DAM_FINALIZATION_CLAIM_INVALID' using errcode = '42501';
  end if;
  if v_asset.declared_mime <> p_detected_mime then
    raise exception 'CMS_DAM_FINALIZATION_INVALID' using errcode = '22023';
  end if;
  if exists (
    select 1
    from public.cms_media_assets duplicate
    where duplicate.sha256 = p_sha256
      and duplicate.id <> p_asset_id
      and duplicate.archived_at is null
      and private.cms_dam_asset_in_actor_scope(
        p_actor_id, duplicate.created_by, duplicate.source_kind
      )
  ) then
    raise exception 'CMS_DAM_DUPLICATE' using errcode = '23505';
  end if;

  insert into public.cms_media_variants (
    asset_id, variant_key, format, width, height, transform_path
  )
  select
    p_asset_id,
    variant.variant_key,
    variant.format,
    variant.width,
    variant.height,
    variant.transform_path
  from jsonb_to_recordset(p_variants) as variant(
    variant_key text, format text, width integer, height integer, transform_path text
  )
  on conflict (asset_id, variant_key, format) do update set
    width = excluded.width,
    height = excluded.height,
    transform_path = excluded.transform_path;
  select count(*)::integer into v_variant_count
  from public.cms_media_variants variant
  where variant.asset_id = p_asset_id;
  if v_variant_count <> 6 then
    raise exception 'CMS_DAM_VARIANT_SET_INCOMPLETE' using errcode = '23514';
  end if;

  update public.cms_media_assets asset
  set detected_mime = p_detected_mime,
      byte_size = p_byte_size,
      sha256 = p_sha256,
      width = p_width,
      height = p_height,
      processing_status = 'ready',
      scan_status = 'clean',
      scan_engine = 'raster-signature-v2',
      processed_at = statement_timestamp(),
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

  insert into public.cms_audit_log (
    actor_id, action, target_type, target_id, event_data, correlation_id
  ) values (
    p_actor_id,
    'cms:media.finalize',
    'media_asset',
    p_asset_id::text,
    jsonb_build_object('sha256', p_sha256, 'variants', v_variant_count),
    p_correlation_id
  );
  insert into public.cms_dam_events (
    asset_id, actor_id, event_type, event_data, correlation_id
  ) values (
    p_asset_id,
    p_actor_id,
    'finalize_upload',
    jsonb_build_object('sha256', p_sha256, 'variants', v_variant_count),
    p_correlation_id
  );
  return jsonb_build_object(
    'assetId', v_asset.id,
    'status', 'ready',
    'sha256', v_asset.sha256,
    'width', v_asset.width,
    'height', v_asset.height,
    'variants', v_variant_count,
    'replayed', false
  );
end;
$$;

-- A assinatura antiga tambem e mantida como tombstone de rollout. Ela nao
-- possui claim e, portanto, nao pode mais finalizar reservas.
create or replace function public.cms_finalize_dam_asset(
  p_actor_id uuid,
  p_asset_id uuid,
  p_detected_mime text,
  p_byte_size bigint,
  p_sha256 text,
  p_width integer,
  p_height integer,
  p_variants jsonb,
  p_correlation_id uuid,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  raise exception 'CMS_DAM_FINALIZATION_CLAIM_REQUIRED' using errcode = '42501';
end;
$$;

-- Tombstones das assinaturas actor-aware sem claim. Uma Edge em rollout nao
-- pode iniciar/rematar remocao externa sem carregar o mesmo fence UUID.
create or replace function public.cms_prepare_dam_gc(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_job_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  raise exception 'CMS_DAM_GC_CLAIM_REQUIRED' using errcode = '42501';
end;
$$;

create or replace function public.cms_complete_dam_gc(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_job_id uuid,
  p_succeeded boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  raise exception 'CMS_DAM_GC_CLAIM_REQUIRED' using errcode = '42501';
end;
$$;

-- A assinatura historica nao conhece o ator. Ela permanece apenas como
-- tombstone de rollout para que uma Edge antiga falhe sem remover nada.
create or replace function public.cms_prepare_dam_gc(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  raise exception 'CMS_DAM_GC_ACTOR_CONTEXT_REQUIRED' using errcode = '42501';
end;
$$;

drop trigger if exists cms_qa_media_asset_delete_lease_guard on public.cms_media_assets;
create trigger cms_qa_media_asset_delete_lease_guard
before delete on public.cms_media_assets
for each row execute function private.cms_qa_domain_parent_lease_guard();

drop trigger if exists cms_qa_media_variant_delete_lease_guard on public.cms_media_variants;
create trigger cms_qa_media_variant_delete_lease_guard
before delete on public.cms_media_variants
for each row execute function private.cms_qa_domain_parent_lease_guard();

drop trigger if exists cms_qa_media_usage_delete_lease_guard on public.cms_media_usages;
create trigger cms_qa_media_usage_delete_lease_guard
before delete on public.cms_media_usages
for each row execute function private.cms_qa_domain_parent_lease_guard();

drop trigger if exists cms_qa_dam_gc_job_mutation_lease_guard on public.cms_dam_gc_jobs;
create trigger cms_qa_dam_gc_job_mutation_lease_guard
before update or delete on public.cms_dam_gc_jobs
for each row execute function private.cms_qa_domain_parent_lease_guard();

drop trigger if exists cms_dam_asset_actor_scope_guard on public.cms_media_assets;
create trigger cms_dam_asset_actor_scope_guard
before insert or update on public.cms_media_assets
for each row execute function private.cms_guard_dam_asset_actor_scope();

drop trigger if exists cms_dam_asset_gc_fence_guard on public.cms_media_assets;
create trigger cms_dam_asset_gc_fence_guard
before insert or update or delete on public.cms_media_assets
for each row execute function private.cms_guard_dam_asset_gc_fence();

-- Close the direct PostgREST path as well as the Edge path. Variants inherit
-- the parent asset boundary. Usages require both an in-scope asset and, once
-- the authoritative 0069 predicate is installed, an in-scope content graph.
drop policy if exists cms_media_authorized_read on public.cms_media_assets;
create policy cms_media_authorized_read on public.cms_media_assets
for select to authenticated using (
  public.cms_dam_asset_session_read_allowed(id)
);

drop policy if exists cms_media_variants_authorized_read on public.cms_media_variants;
create policy cms_media_variants_authorized_read on public.cms_media_variants
for select to authenticated using (
  public.cms_dam_asset_session_read_allowed(asset_id)
);

drop policy if exists cms_media_usages_authorized_read on public.cms_media_usages;
create policy cms_media_usages_authorized_read on public.cms_media_usages
for select to authenticated using (
  public.cms_dam_usage_session_read_allowed(asset_id, item_id)
);

revoke all on table private.cms_dam_gc_fences
  from public, anon, authenticated, service_role;

revoke all on function private.cms_assert_dam_actor_context(uuid,text,text,text,timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_dam_actor_is_qa(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_dam_asset_in_actor_scope(uuid,uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_dam_asset_session_scope_allowed(uuid,uuid,timestamptz,text)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_guard_dam_asset_actor_scope()
  from public, anon, authenticated, service_role;
revoke all on function private.cms_guard_dam_asset_gc_fence()
  from public, anon, authenticated, service_role;
revoke all on function private.cms_assert_dam_gc_context(uuid,text,text,text,text,timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_dam_gc_scope_allowed(uuid,uuid,uuid,uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_lock_dam_gc_scope(uuid,uuid,uuid)
  from public, anon, authenticated, service_role;

revoke all on function public.cms_dam_actor_scope(uuid,text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.cms_dam_actor_scope(uuid,text,text,timestamptz)
  to service_role;
revoke all on function public.cms_dam_asset_session_read_allowed(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.cms_dam_asset_session_read_allowed(uuid)
  to authenticated;
revoke all on function public.cms_dam_usage_session_read_allowed(uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.cms_dam_usage_session_read_allowed(uuid,uuid)
  to authenticated;
revoke all on function public.cms_list_dam_taxonomies_scoped(uuid,text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.cms_list_dam_taxonomies_scoped(uuid,text,text,timestamptz)
  to service_role;
revoke all on function public.cms_list_dam_gc_candidates(uuid,text,text,text,text,timestamptz,uuid,integer)
  from public, anon, authenticated;
grant execute on function public.cms_list_dam_gc_candidates(uuid,text,text,text,text,timestamptz,uuid,integer)
  to service_role;
revoke all on function public.cms_prepare_dam_gc(uuid,text,text,text,text,timestamptz,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.cms_prepare_dam_gc(uuid,text,text,text,text,timestamptz,uuid,uuid)
  to service_role;
revoke all on function public.cms_complete_dam_gc(uuid,text,text,text,text,timestamptz,uuid,uuid,boolean)
  from public, anon, authenticated;
grant execute on function public.cms_complete_dam_gc(uuid,text,text,text,text,timestamptz,uuid,uuid,boolean)
  to service_role;
revoke all on function public.cms_claim_dam_finalization(uuid,uuid,uuid,text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.cms_claim_dam_finalization(uuid,uuid,uuid,text,text,timestamptz)
  to service_role;
revoke all on function public.cms_fail_dam_finalization(uuid,uuid,uuid,text,uuid,text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.cms_fail_dam_finalization(uuid,uuid,uuid,text,uuid,text,text,timestamptz)
  to service_role;
revoke all on function public.cms_finalize_dam_asset(uuid,uuid,uuid,text,bigint,text,integer,integer,jsonb,uuid,text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.cms_finalize_dam_asset(uuid,uuid,uuid,text,bigint,text,integer,integer,jsonb,uuid,text,text,timestamptz)
  to service_role;
revoke all on function public.cms_finalize_dam_asset(uuid,uuid,text,bigint,text,integer,integer,jsonb,uuid,text,text,timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.cms_prepare_dam_gc(uuid,text,text,text,text,timestamptz,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.cms_complete_dam_gc(uuid,text,text,text,text,timestamptz,uuid,boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.cms_prepare_dam_gc(uuid)
  from public, anon, authenticated, service_role;

comment on function public.cms_list_dam_gc_candidates(uuid,text,text,text,text,timestamptz,uuid,integer)
is 'Lista jobs DAM vencidos somente dentro do escopo do ator autenticado; atores QA veem exclusivamente o proprio run.';
comment on function public.cms_prepare_dam_gc(uuid,text,text,text,text,timestamptz,uuid,uuid)
is 'Adquire claim/fence DAM com RBAC/MFA, lease QA e CAS; preserva o ativo ate a confirmacao da remocao fisica.';
comment on function public.cms_complete_dam_gc(uuid,text,text,text,text,timestamptz,uuid,uuid,boolean)
is 'Finaliza o mesmo claim GC por CAS; somente sucesso remove o ativo depois do Storage e falha preserva dados.';
comment on function public.cms_claim_dam_finalization(uuid,uuid,uuid,text,text,timestamptz)
is 'Adquire claim curto, actor-aware e exclusivo antes de qualquer leitura ou mutacao de objetos Storage.';
comment on function public.cms_finalize_dam_asset(uuid,uuid,uuid,text,bigint,text,integer,integer,jsonb,uuid,text,text,timestamptz)
is 'Finaliza uma reserva DAM somente com claim vigente, ownership estrito, escopo QA/corporativo e CAS.';
