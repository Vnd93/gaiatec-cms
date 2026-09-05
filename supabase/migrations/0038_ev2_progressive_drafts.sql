-- EV2.2 — rascunhos progressivos em shadow storage, desligados por padrão.
-- Não há projeção pública, publicação, dual-write ou alteração das tabelas editoriais v1.

create table public.cms_content_drafts_v2 (
  id uuid primary key default gen_random_uuid(),
  site_key text not null default 'main' check (site_key = 'main'),
  environment text not null check (environment in ('local', 'staging')),
  content_type text not null check (
    content_type in (
      'product', 'service', 'industry', 'application', 'solution', 'post',
      'page', 'homepage', 'navigation', 'site_settings', 'placement', 'campaign'
    )
  ),
  schema_version integer not null default 2 check (schema_version = 2),
  working_title text not null default '' check (char_length(working_title) <= 180),
  fields jsonb not null default '{}'::jsonb check (jsonb_typeof(fields) = 'object'),
  fields_hash text not null default encode(extensions.digest(convert_to('{}', 'UTF8'), 'sha256'), 'hex')
    check (fields_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'active' check (status in ('active', 'discarded')),
  lock_version bigint not null default 1 check (lock_version > 0),
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  discarded_at timestamptz,
  check ((status = 'discarded') = (discarded_at is not null)),
  check (octet_length(fields::text) <= 1048576)
);

create table public.cms_draft_v2_command_receipts (
  actor_id uuid not null references auth.users (id) on delete restrict,
  action text not null check (action in ('create', 'patch', 'discard')),
  idempotency_key uuid not null,
  command_id uuid not null unique,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  draft_id uuid references public.cms_content_drafts_v2 (id) on delete restrict,
  correlation_id uuid not null,
  response jsonb check (response is null or jsonb_typeof(response) = 'object'),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (actor_id, action, idempotency_key)
);

create table public.cms_draft_v2_events (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.cms_content_drafts_v2 (id) on delete restrict,
  actor_id uuid references auth.users (id) on delete set null,
  event_type text not null check (event_type in ('created', 'patched', 'discarded')),
  from_version bigint,
  to_version bigint not null check (to_version > 0),
  changed_fields jsonb not null default '[]'::jsonb check (jsonb_typeof(changed_fields) = 'array'),
  fields_hash text not null check (fields_hash ~ '^[0-9a-f]{64}$'),
  correlation_id uuid not null,
  occurred_at timestamptz not null default now()
);

create index cms_content_drafts_v2_resume_idx
  on public.cms_content_drafts_v2 (created_by, environment, site_key, content_type, status, updated_at desc);
create index cms_draft_v2_events_draft_idx
  on public.cms_draft_v2_events (draft_id, occurred_at desc);

create trigger cms_content_drafts_v2_touch_updated_at
before update on public.cms_content_drafts_v2
for each row execute function public.cms_touch_updated_at();

create trigger cms_draft_v2_events_immutable
before update or delete on public.cms_draft_v2_events
for each row execute function public.cms_reject_immutable_mutation();

alter table public.cms_content_drafts_v2 enable row level security;
alter table public.cms_draft_v2_command_receipts enable row level security;
alter table public.cms_draft_v2_events enable row level security;

revoke all on table public.cms_content_drafts_v2 from public, anon, authenticated;
revoke all on table public.cms_draft_v2_command_receipts from public, anon, authenticated;
revoke all on table public.cms_draft_v2_events from public, anon, authenticated;

create function public.cms_draft_v2_assert_available(
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
set search_path = public, pg_temp
as $$
declare
  v_flag jsonb;
begin
  if p_environment not in ('local', 'staging') or p_site_key <> 'main' then
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
  if coalesce((v_flag ->> 'enabled')::boolean, false) is not true then
    raise exception 'CMS_DRAFT_V2_FEATURE_DISABLED' using errcode = '42501';
  end if;
end;
$$;

create function public.cms_execute_draft_v2_command(
  p_actor_id uuid,
  p_action text,
  p_draft_id uuid,
  p_content_type text,
  p_working_title text,
  p_patch jsonb,
  p_reason text,
  p_expected_version bigint,
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
set search_path = public, extensions, pg_temp
as $$
declare
  v_draft public.cms_content_drafts_v2%rowtype;
  v_receipt public.cms_draft_v2_command_receipts%rowtype;
  v_permission text;
  v_operation jsonb;
  v_key text;
  v_fields jsonb;
  v_fields_hash text;
  v_changed_fields jsonb := '[]'::jsonb;
  v_response jsonb;
  v_from_version bigint;
begin
  if p_actor_id is null
     or p_action is null
     or p_action not in ('create', 'patch', 'discard')
     or p_command_id is null
     or p_idempotency_key is null
     or p_correlation_id is null
     or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'CMS_DRAFT_V2_COMMAND_INVALID' using errcode = '22023';
  end if;

  perform public.cms_draft_v2_assert_available(
    p_actor_id, p_environment, p_site_key, p_aal, p_session_id, p_issued_at
  );

  if p_action = 'create' then
    if p_draft_id is not null
       or p_content_type is null
       or p_content_type not in (
         'product', 'service', 'industry', 'application', 'solution', 'post',
         'page', 'homepage', 'navigation', 'site_settings', 'placement', 'campaign'
       )
       or p_patch is not null
       or p_expected_version is not null then
      raise exception 'CMS_DRAFT_V2_COMMAND_INVALID' using errcode = '22023';
    end if;
    v_permission := public.cms_editorial_required_permission(p_content_type, 'create');
  else
    select * into v_draft
    from public.cms_content_drafts_v2
    where id = p_draft_id and environment = p_environment and site_key = p_site_key
    for update;
    if not found then
      raise exception 'CMS_DRAFT_V2_NOT_FOUND' using errcode = 'P0002';
    end if;
    v_permission := public.cms_editorial_required_permission(v_draft.content_type, 'save');
  end if;

  if v_permission is null
     or not public.cms_actor_authorized(
       p_actor_id, v_permission, p_aal, p_session_id, p_issued_at
     ) then
    raise exception 'CMS_DRAFT_V2_FORBIDDEN' using errcode = '42501';
  end if;

  insert into public.cms_draft_v2_command_receipts (
    actor_id,
    action,
    idempotency_key,
    command_id,
    request_hash,
    draft_id,
    correlation_id
  ) values (
    p_actor_id,
    p_action,
    p_idempotency_key,
    p_command_id,
    p_request_hash,
    p_draft_id,
    p_correlation_id
  ) on conflict (actor_id, action, idempotency_key) do nothing;

  select * into v_receipt
  from public.cms_draft_v2_command_receipts
  where actor_id = p_actor_id and action = p_action and idempotency_key = p_idempotency_key
  for update;

  if v_receipt.request_hash <> p_request_hash then
    raise exception 'CMS_DRAFT_V2_IDEMPOTENCY_CONFLICT' using errcode = '23505';
  end if;
  if v_receipt.response is not null then
    return v_receipt.response || jsonb_build_object('replayed', true);
  end if;

  if p_action = 'create' then
    insert into public.cms_content_drafts_v2 (
      site_key,
      environment,
      content_type,
      working_title,
      created_by,
      updated_by,
      correlation_id
    ) values (
      p_site_key,
      p_environment,
      p_content_type,
      coalesce(btrim(p_working_title), ''),
      p_actor_id,
      p_actor_id,
      p_correlation_id
    ) returning * into v_draft;
    v_changed_fields := '["workingTitle"]'::jsonb;
    v_from_version := null;
  elsif p_action = 'patch' then
    if v_draft.status <> 'active'
       or p_expected_version is null
       or v_draft.lock_version <> p_expected_version then
      raise exception 'CMS_DRAFT_V2_CONFLICT' using errcode = '40001';
    end if;
    if jsonb_typeof(p_patch) <> 'array'
       or jsonb_array_length(p_patch) > 100
       or (jsonb_array_length(p_patch) = 0 and p_working_title is null) then
      raise exception 'CMS_DRAFT_V2_PATCH_INVALID' using errcode = '22023';
    end if;
    v_from_version := v_draft.lock_version;
    v_fields := v_draft.fields;
    for v_operation in select value from jsonb_array_elements(p_patch)
    loop
      if jsonb_typeof(v_operation) <> 'object'
         or jsonb_typeof(v_operation -> 'path') <> 'array'
         or jsonb_array_length(v_operation -> 'path') <> 1 then
        raise exception 'CMS_DRAFT_V2_PATCH_INVALID' using errcode = '22023';
      end if;
      v_key := v_operation #>> '{path,0}';
      if v_key !~ '^[a-zA-Z][a-zA-Z0-9_-]{0,79}$'
         or v_key in ('__proto__', 'constructor', 'prototype') then
        raise exception 'CMS_DRAFT_V2_PATCH_INVALID' using errcode = '22023';
      end if;
      if v_operation ->> 'operation' = 'set' and v_operation ? 'value' then
        v_fields := jsonb_set(v_fields, array[v_key], v_operation -> 'value', true);
      elsif v_operation ->> 'operation' = 'remove' and not (v_operation ? 'value') then
        v_fields := v_fields #- array[v_key];
      else
        raise exception 'CMS_DRAFT_V2_PATCH_INVALID' using errcode = '22023';
      end if;
      v_changed_fields := v_changed_fields || jsonb_build_array(v_key);
    end loop;
    if p_working_title is not null and btrim(p_working_title) is distinct from v_draft.working_title then
      v_changed_fields := v_changed_fields || jsonb_build_array('workingTitle');
    end if;
    if octet_length(v_fields::text) > 1048576 then
      raise exception 'CMS_DRAFT_V2_TOO_LARGE' using errcode = '22001';
    end if;
    v_fields_hash := encode(extensions.digest(convert_to(v_fields::text, 'UTF8'), 'sha256'), 'hex');
    update public.cms_content_drafts_v2
    set fields = v_fields,
      fields_hash = v_fields_hash,
      working_title = coalesce(btrim(p_working_title), working_title),
      lock_version = lock_version + 1,
      updated_by = p_actor_id,
      correlation_id = p_correlation_id
    where id = v_draft.id and lock_version = p_expected_version
    returning * into v_draft;
    if not found then
      raise exception 'CMS_DRAFT_V2_CONFLICT' using errcode = '40001';
    end if;
  else
    if v_draft.status <> 'active'
       or p_expected_version is null
       or v_draft.lock_version <> p_expected_version then
      raise exception 'CMS_DRAFT_V2_CONFLICT' using errcode = '40001';
    end if;
    if char_length(coalesce(btrim(p_reason), '')) not between 3 and 500 then
      raise exception 'CMS_DRAFT_V2_COMMAND_INVALID' using errcode = '22023';
    end if;
    v_from_version := v_draft.lock_version;
    update public.cms_content_drafts_v2
    set status = 'discarded',
      discarded_at = now(),
      lock_version = lock_version + 1,
      updated_by = p_actor_id,
      correlation_id = p_correlation_id
    where id = v_draft.id and lock_version = p_expected_version
    returning * into v_draft;
    v_changed_fields := '["status"]'::jsonb;
  end if;

  insert into public.cms_draft_v2_events (
    draft_id,
    actor_id,
    event_type,
    from_version,
    to_version,
    changed_fields,
    fields_hash,
    correlation_id
  ) values (
    v_draft.id,
    p_actor_id,
    case p_action when 'create' then 'created' when 'patch' then 'patched' else 'discarded' end,
    v_from_version,
    v_draft.lock_version,
    v_changed_fields,
    v_draft.fields_hash,
    p_correlation_id
  );

  v_response := jsonb_build_object(
    'schemaVersion', 1,
    'commandId', p_command_id,
    'correlationId', p_correlation_id,
    'draftId', v_draft.id,
    'status', v_draft.status,
    'lockVersion', v_draft.lock_version,
    'savedAt', v_draft.updated_at,
    'replayed', false
  );

  update public.cms_draft_v2_command_receipts
  set draft_id = v_draft.id,
    response = v_response,
    completed_at = now()
  where actor_id = p_actor_id and action = p_action and idempotency_key = p_idempotency_key;

  insert into public.cms_audit_log (
    actor_id, action, target_type, target_id, event_data, correlation_id
  ) values (
    p_actor_id,
    'cms:drafts_v2.' || p_action,
    'content_draft_v2',
    v_draft.id::text,
    jsonb_build_object(
      'status', v_draft.status,
      'lockVersion', v_draft.lock_version,
      'changedFields', v_changed_fields,
      'fieldsHash', v_draft.fields_hash,
      'reason', case when p_action = 'discard' then btrim(p_reason) else null end
    ),
    p_correlation_id
  );

  return v_response;
end;
$$;

create function public.cms_get_draft_v2(
  p_actor_id uuid,
  p_draft_id uuid,
  p_content_type text,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_draft public.cms_content_drafts_v2%rowtype;
  v_permission text;
begin
  perform public.cms_draft_v2_assert_available(
    p_actor_id, p_environment, p_site_key, p_aal, p_session_id, p_issued_at
  );
  if p_draft_id is not null then
    select * into v_draft
    from public.cms_content_drafts_v2
    where id = p_draft_id and environment = p_environment and site_key = p_site_key;
  elsif p_content_type is not null then
    select * into v_draft
    from public.cms_content_drafts_v2
    where created_by = p_actor_id
      and content_type = p_content_type
      and environment = p_environment
      and site_key = p_site_key
      and status = 'active'
    order by updated_at desc
    limit 1;
  else
    raise exception 'CMS_DRAFT_V2_COMMAND_INVALID' using errcode = '22023';
  end if;
  if not found then
    if p_draft_id is null then return null; end if;
    raise exception 'CMS_DRAFT_V2_NOT_FOUND' using errcode = 'P0002';
  end if;
  v_permission := public.cms_editorial_required_permission(v_draft.content_type, 'save');
  if v_permission is null
     or not public.cms_actor_authorized(
       p_actor_id, v_permission, p_aal, p_session_id, p_issued_at
     ) then
    raise exception 'CMS_DRAFT_V2_FORBIDDEN' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'schemaVersion', 2,
    'draftId', v_draft.id,
    'contentType', v_draft.content_type,
    'workingTitle', v_draft.working_title,
    'fields', v_draft.fields,
    'fieldsHash', v_draft.fields_hash,
    'status', v_draft.status,
    'lockVersion', v_draft.lock_version,
    'createdAt', v_draft.created_at,
    'updatedAt', v_draft.updated_at
  );
end;
$$;

revoke all on function public.cms_draft_v2_assert_available(uuid,text,text,text,text,timestamptz)
  from public, anon, authenticated;
revoke all on function public.cms_execute_draft_v2_command(
  uuid,text,uuid,text,text,jsonb,text,bigint,text,text,text,text,timestamptz,uuid,uuid,text,uuid
) from public, anon, authenticated;
revoke all on function public.cms_get_draft_v2(uuid,uuid,text,text,text,text,text,timestamptz)
  from public, anon, authenticated;

grant execute on function public.cms_draft_v2_assert_available(uuid,text,text,text,text,timestamptz)
  to service_role;
grant execute on function public.cms_execute_draft_v2_command(
  uuid,text,uuid,text,text,jsonb,text,bigint,text,text,text,text,timestamptz,uuid,uuid,text,uuid
) to service_role;
grant execute on function public.cms_get_draft_v2(uuid,uuid,text,text,text,text,text,timestamptz)
  to service_role;
