-- Conclui o rascunho livre v2 como cadastro editorial canônico em uma única
-- transação. O shadow draft deixa de ser ativo somente depois que a criação
-- canônica termina; qualquer erro reverte ambas as operações.

alter table public.cms_content_drafts_v2
  add column if not exists promoted_at timestamptz,
  add column if not exists promoted_item_id uuid references public.cms_content_items (id) on delete restrict;

-- EV2 originally kept the shadow store in local/staging. Production rollout is
-- still fail-closed, but an individually authorized AAL2 operator must be able
-- to use the same recoverable draft path instead of falling back to a second
-- implementation at the final environment.
alter table public.cms_content_drafts_v2
  drop constraint if exists cms_content_drafts_v2_environment_check;
alter table public.cms_content_drafts_v2
  add constraint cms_content_drafts_v2_environment_check
  check (environment in ('local', 'staging', 'production'));

create or replace function public.cms_draft_v2_assert_available(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_flag jsonb;
  v_individual_override_count integer;
  v_broad_override_count integer;
begin
  if p_actor_id is null
     or p_environment not in ('local', 'staging', 'production')
     or p_site_key <> 'main'
     or (p_environment = 'production' and p_aal <> 'aal2') then
    raise exception 'CMS_DRAFT_V2_COMMAND_INVALID' using errcode = '22023';
  end if;

  v_flag := public.cms_evaluate_feature_flag(
    p_actor_id,
    'ev2.draft_v2',
    p_environment,
    p_site_key,
    p_aal,
    p_session_id,
    p_issued_at
  );

  if p_environment = 'production' then
    select count(*)::integer into v_individual_override_count
    from public.cms_feature_flag_overrides override
    where override.flag_key = 'ev2.draft_v2'
      and override.environment = 'production'
      and override.scope_type = 'user'
      and override.scope_key = p_actor_id::text
      and override.enabled
      and override.starts_at <= now()
      and override.expires_at > now()
      and override.expires_at - override.starts_at <= interval '30 minutes';

    select count(*)::integer into v_broad_override_count
    from public.cms_feature_flag_overrides override
    where override.flag_key = 'ev2.draft_v2'
      and override.environment = 'production'
      and override.scope_type in ('site', 'environment', 'global')
      and override.starts_at <= now()
      and override.expires_at > now();
  end if;

  if coalesce((v_flag ->> 'enabled')::boolean, false) is not true
     or (
       p_environment = 'production'
       and (v_individual_override_count <> 1 or v_broad_override_count <> 0)
     ) then
    raise exception 'CMS_DRAFT_V2_FEATURE_DISABLED' using errcode = '42501';
  end if;
end;
$$;

alter table public.cms_content_drafts_v2
  drop constraint if exists cms_content_drafts_v2_status_check;
alter table public.cms_content_drafts_v2
  add constraint cms_content_drafts_v2_status_check
  check (status in ('active', 'discarded', 'promoted'));

alter table public.cms_content_drafts_v2
  drop constraint if exists cms_content_drafts_v2_promotion_state_check;
alter table public.cms_content_drafts_v2
  add constraint cms_content_drafts_v2_promotion_state_check check (
    (status = 'active' and discarded_at is null and promoted_at is null and promoted_item_id is null)
    or (status = 'discarded' and discarded_at is not null and promoted_at is null and promoted_item_id is null)
    or (status = 'promoted' and discarded_at is null and promoted_at is not null and promoted_item_id is not null)
  );

create unique index if not exists cms_content_drafts_v2_promoted_item_uidx
  on public.cms_content_drafts_v2 (promoted_item_id)
  where promoted_item_id is not null;

alter table public.cms_draft_v2_command_receipts
  drop constraint if exists cms_draft_v2_command_receipts_action_check;
alter table public.cms_draft_v2_command_receipts
  add constraint cms_draft_v2_command_receipts_action_check
  check (action in ('create', 'patch', 'discard', 'promote'));

alter table public.cms_draft_v2_events
  drop constraint if exists cms_draft_v2_events_event_type_check;
alter table public.cms_draft_v2_events
  add constraint cms_draft_v2_events_event_type_check
  check (event_type in ('created', 'patched', 'discarded', 'promoted'));

create or replace function public.cms_promote_draft_v2_to_content(
  p_actor_id uuid,
  p_draft_id uuid,
  p_expected_version bigint,
  p_slug text,
  p_payload jsonb,
  p_reason text,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_command_id uuid,
  p_idempotency_key uuid,
  p_request_hash text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $$
declare
  v_seed public.cms_content_drafts_v2%rowtype;
  v_draft public.cms_content_drafts_v2%rowtype;
  v_receipt public.cms_draft_v2_command_receipts%rowtype;
  v_permission text;
  v_editorial jsonb;
  v_item_id uuid;
  v_response jsonb;
begin
  if p_actor_id is null
     or p_draft_id is null
     or p_expected_version is null
     or p_slug is null
     or p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or char_length(p_slug) > 160
     or jsonb_typeof(p_payload) <> 'object'
     or char_length(coalesce(btrim(p_reason), '')) not between 3 and 500
     or p_environment not in ('local', 'staging', 'production')
     or p_site_key <> 'main'
     or p_command_id is null
     or p_idempotency_key is null
     or p_request_hash !~ '^[0-9a-f]{64}$'
     or p_correlation_id is null then
    raise exception 'CMS_DRAFT_V2_PROMOTION_INVALID' using errcode = '22023';
  end if;

  perform public.cms_draft_v2_assert_available(
    p_actor_id, p_environment, p_site_key, p_aal, p_session_id, p_issued_at
  );
  if not private.cms_content_actor_context_active(p_actor_id, p_environment) then
    raise exception 'CMS_DRAFT_V2_FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_seed from public.cms_content_drafts_v2 where id = p_draft_id;
  if not found then
    raise exception 'CMS_DRAFT_V2_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.cms_lock_active_qa_actor_leases(array[p_actor_id, v_seed.created_by, v_seed.updated_by]);
  select * into v_draft
  from public.cms_content_drafts_v2
  where id = p_draft_id
  for update;
  if not found then
    raise exception 'CMS_DRAFT_V2_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_draft.created_by is distinct from v_seed.created_by
     or v_draft.updated_by is distinct from v_seed.updated_by then
    raise exception 'CMS_DRAFT_V2_SCOPE_RACE' using errcode = '40001';
  end if;
  if v_draft.environment <> p_environment
     or v_draft.site_key <> p_site_key
     or not private.cms_content_actor_row_scope_allowed(
       p_actor_id, v_draft.created_by, v_draft.created_at, p_environment
     )
     or not private.cms_content_actor_row_scope_allowed(
       p_actor_id, v_draft.updated_by, v_draft.updated_at, p_environment
     ) then
    raise exception 'CMS_DRAFT_V2_FORBIDDEN' using errcode = '42501';
  end if;

  v_permission := public.cms_editorial_required_permission(v_draft.content_type, 'create');
  if v_permission is null
     or not public.cms_actor_authorized(
       p_actor_id, v_permission, p_aal, p_session_id, p_issued_at
     ) then
    raise exception 'CMS_DRAFT_V2_FORBIDDEN' using errcode = '42501';
  end if;

  insert into public.cms_draft_v2_command_receipts (
    actor_id, action, idempotency_key, command_id, request_hash, draft_id, correlation_id
  ) values (
    p_actor_id, 'promote', p_idempotency_key, p_command_id, p_request_hash, p_draft_id, p_correlation_id
  ) on conflict (actor_id, action, idempotency_key) do nothing;

  select * into v_receipt
  from public.cms_draft_v2_command_receipts
  where actor_id = p_actor_id and action = 'promote' and idempotency_key = p_idempotency_key
  for update;
  if v_receipt.request_hash <> p_request_hash then
    raise exception 'CMS_DRAFT_V2_IDEMPOTENCY_CONFLICT' using errcode = '23505';
  end if;
  if v_receipt.response is not null then
    return v_receipt.response || jsonb_build_object('replayed', true);
  end if;

  if v_draft.status <> 'active' or v_draft.lock_version <> p_expected_version then
    raise exception 'CMS_DRAFT_V2_CONFLICT' using errcode = '40001';
  end if;
  if p_payload ->> 'contentType' is distinct from v_draft.content_type then
    raise exception 'CMS_DRAFT_V2_PROMOTION_INVALID' using errcode = '23514';
  end if;

  perform set_config('cms.content_mutation_actor_id', p_actor_id::text, true);
  v_editorial := public.cms_execute_editorial_command(
    p_actor_id,
    'create',
    null,
    v_draft.content_type,
    p_slug,
    p_payload,
    null,
    null,
    btrim(p_reason),
    null,
    p_aal,
    p_session_id,
    p_issued_at,
    p_idempotency_key,
    p_correlation_id
  );
  v_item_id := nullif(v_editorial ->> 'itemId', '')::uuid;
  if v_item_id is null then
    raise exception 'CMS_DRAFT_V2_PROMOTION_INVALID' using errcode = '23514';
  end if;

  update public.cms_content_drafts_v2
  set status = 'promoted',
    promoted_at = clock_timestamp(),
    promoted_item_id = v_item_id,
    lock_version = lock_version + 1,
    updated_by = p_actor_id,
    correlation_id = p_correlation_id
  where id = p_draft_id and status = 'active' and lock_version = p_expected_version
  returning * into v_draft;
  if not found then
    raise exception 'CMS_DRAFT_V2_CONFLICT' using errcode = '40001';
  end if;

  insert into public.cms_draft_v2_events (
    draft_id, actor_id, event_type, from_version, to_version,
    changed_fields, fields_hash, correlation_id
  ) values (
    v_draft.id, p_actor_id, 'promoted', p_expected_version, v_draft.lock_version,
    '["status","promotedItem"]'::jsonb, v_draft.fields_hash, p_correlation_id
  );

  v_response := jsonb_build_object(
    'schemaVersion', 1,
    'commandId', p_command_id,
    'correlationId', p_correlation_id,
    'draftId', v_draft.id,
    'status', v_draft.status,
    'lockVersion', v_draft.lock_version,
    'savedAt', v_draft.updated_at,
    'itemId', v_item_id,
    'replayed', false
  );
  update public.cms_draft_v2_command_receipts
  set response = v_response, completed_at = clock_timestamp()
  where actor_id = p_actor_id and action = 'promote' and idempotency_key = p_idempotency_key;

  insert into public.cms_audit_log (
    actor_id, action, target_type, target_id, event_data, correlation_id
  ) values (
    p_actor_id,
    'cms:drafts_v2.promote',
    'content_draft_v2',
    v_draft.id::text,
    jsonb_build_object(
      'status', v_draft.status,
      'lockVersion', v_draft.lock_version,
      'fieldsHash', v_draft.fields_hash,
      'promotedItemId', v_item_id,
      'reason', btrim(p_reason)
    ),
    p_correlation_id
  );
  return v_response;
end;
$$;

revoke all on function public.cms_promote_draft_v2_to_content(
  uuid,uuid,bigint,text,jsonb,text,text,text,text,text,timestamptz,uuid,uuid,text,uuid
) from public, anon, authenticated;
grant execute on function public.cms_promote_draft_v2_to_content(
  uuid,uuid,bigint,text,jsonb,text,text,text,text,text,timestamptz,uuid,uuid,text,uuid
) to service_role;
