-- Fase 3 / CMS-002 — comandos server-side de usuarios administrativos.
-- Nenhum usuario real e criado por esta migration.

alter table public.cms_profiles
  add column sessions_valid_after timestamptz not null default '1970-01-01 00:00:00+00';

create table public.cms_command_receipts (
  actor_id uuid not null references auth.users (id) on delete restrict,
  action text not null check (action in ('invite', 'resend_invite', 'set_roles', 'suspend', 'reactivate', 'revoke_sessions')),
  idempotency_key uuid not null,
  target_user_id uuid references auth.users (id) on delete restrict,
  correlation_id uuid not null,
  response jsonb,
  created_at timestamptz not null default now(),
  primary key (actor_id, action, idempotency_key)
);

alter table public.cms_command_receipts enable row level security;

create or replace function public.cms_current_session_is_valid()
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select
    auth.jwt() ->> 'session_id' is not null
    and coalesce(auth.jwt() ->> 'iat', '') ~ '^[0-9]+$'
    and not exists (
      select 1
      from public.cms_profiles p
      where p.user_id = auth.uid()
        and p.sessions_valid_after > to_timestamp((auth.jwt() ->> 'iat')::double precision)
    )
    and not exists (
      select 1
      from public.cms_session_revocations r
      where r.session_id_hash = encode(extensions.digest(auth.jwt() ->> 'session_id', 'sha256'), 'hex')
        and r.expires_at > now()
    );
$$;

create function public.cms_actor_authorized(
  p_actor_id uuid,
  p_permission text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select
    p_actor_id is not null
    and p_session_id is not null
    and p_issued_at is not null
    and exists (
      select 1
      from public.cms_profiles p
      where p.user_id = p_actor_id
        and p.status = 'active'
        and p_issued_at >= p.sessions_valid_after
    )
    and not exists (
      select 1
      from public.cms_session_revocations r
      where r.session_id_hash = encode(extensions.digest(p_session_id, 'sha256'), 'hex')
        and r.expires_at > now()
    )
    and (
      not exists (
        select 1
        from public.cms_user_roles ur
        join public.cms_roles r on r.role_key = ur.role_key
        where ur.user_id = p_actor_id and r.mfa_required
      )
      or p_aal = 'aal2'
    )
    and exists (
      select 1
      from public.cms_user_roles ur
      join public.cms_role_permissions rp on rp.role_key = ur.role_key
      where ur.user_id = p_actor_id
        and rp.permission_key = p_permission
    );
$$;

create function public.cms_reserve_user_command(
  p_actor_id uuid,
  p_action text,
  p_target_user_id uuid,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_idempotency_key uuid,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  required_permission text;
  inserted integer;
  existing public.cms_command_receipts%rowtype;
begin
  required_permission := case p_action
    when 'invite' then 'cms:users.invite'
    when 'resend_invite' then 'cms:users.invite'
    when 'set_roles' then 'cms:users.manage'
    when 'suspend' then 'cms:users.suspend'
    when 'reactivate' then 'cms:users.suspend'
    when 'revoke_sessions' then 'cms:sessions.revoke'
    else null
  end;

  if required_permission is null then raise exception 'CMS_COMMAND_INVALID' using errcode = '22023'; end if;
  if not public.cms_actor_authorized(p_actor_id, required_permission, p_aal, p_session_id, p_issued_at) then
    raise exception 'CMS_COMMAND_FORBIDDEN' using errcode = '42501';
  end if;

  insert into public.cms_command_receipts (actor_id, action, idempotency_key, target_user_id, correlation_id)
  values (p_actor_id, p_action, p_idempotency_key, p_target_user_id, p_correlation_id)
  on conflict do nothing;
  get diagnostics inserted = row_count;

  if inserted = 1 then return jsonb_build_object('reserved', true); end if;

  select * into existing from public.cms_command_receipts
  where actor_id = p_actor_id and action = p_action and idempotency_key = p_idempotency_key;
  if existing.response is not null then return existing.response || jsonb_build_object('duplicate', true); end if;
  return jsonb_build_object('reserved', false, 'inProgress', true);
end;
$$;

create function public.cms_apply_user_command(
  p_actor_id uuid,
  p_action text,
  p_target_user_id uuid,
  p_display_name text,
  p_display_email text,
  p_role_keys text[],
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_idempotency_key uuid,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  required_permission text;
  receipt_inserted integer;
  existing_response jsonb;
  result jsonb;
  normalized_roles text[];
  target_is_super boolean;
  other_active_supers integer;
begin
  required_permission := case p_action
    when 'invite' then 'cms:users.invite'
    when 'resend_invite' then 'cms:users.invite'
    when 'set_roles' then 'cms:users.manage'
    when 'suspend' then 'cms:users.suspend'
    when 'reactivate' then 'cms:users.suspend'
    when 'revoke_sessions' then 'cms:sessions.revoke'
    else null
  end;

  if required_permission is null then
    raise exception 'CMS_COMMAND_INVALID' using errcode = '22023';
  end if;

  if not public.cms_actor_authorized(p_actor_id, required_permission, p_aal, p_session_id, p_issued_at) then
    raise exception 'CMS_COMMAND_FORBIDDEN' using errcode = '42501';
  end if;

  insert into public.cms_command_receipts (actor_id, action, idempotency_key, target_user_id, correlation_id)
  values (p_actor_id, p_action, p_idempotency_key, p_target_user_id, p_correlation_id)
  on conflict do nothing;
  get diagnostics receipt_inserted = row_count;

  if receipt_inserted = 0 then
    select response into existing_response
    from public.cms_command_receipts
    where actor_id = p_actor_id and action = p_action and idempotency_key = p_idempotency_key;

    if existing_response is not null then return existing_response || jsonb_build_object('duplicate', true); end if;
    if not exists (
      select 1 from public.cms_command_receipts
      where actor_id = p_actor_id and action = p_action and idempotency_key = p_idempotency_key and correlation_id = p_correlation_id
    ) then raise exception 'CMS_COMMAND_IN_PROGRESS' using errcode = '40001'; end if;
  end if;

  if p_target_user_id is null then
    raise exception 'CMS_TARGET_REQUIRED' using errcode = '22023';
  end if;

  normalized_roles := array(
    select distinct keys.role_key
    from unnest(coalesce(p_role_keys, array[]::text[])) as keys(role_key)
    order by keys.role_key
  );

  if p_action in ('invite', 'set_roles') then
    if cardinality(normalized_roles) = 0
       or exists (select 1 from unnest(normalized_roles) as keys(role_key) where not exists (select 1 from public.cms_roles r where r.role_key = keys.role_key)) then
      raise exception 'CMS_ROLES_INVALID' using errcode = '22023';
    end if;
  end if;

  select exists (
    select 1 from public.cms_user_roles
    where user_id = p_target_user_id and role_key = 'super_admin'
  ) into target_is_super;

  select count(*) into other_active_supers
  from public.cms_profiles p
  join public.cms_user_roles ur on ur.user_id = p.user_id and ur.role_key = 'super_admin'
  where p.status = 'active' and p.user_id <> p_target_user_id;

  if p_action = 'invite' then
    if p_display_name is null or char_length(btrim(p_display_name)) not between 1 and 120
       or p_display_email is null or char_length(btrim(p_display_email)) not between 3 and 320 then
      raise exception 'CMS_PROFILE_INVALID' using errcode = '22023';
    end if;
    if exists (select 1 from public.cms_profiles where user_id = p_target_user_id) then
      raise exception 'CMS_PROFILE_EXISTS' using errcode = '23505';
    end if;

    insert into public.cms_profiles (user_id, display_name, display_email, status, invited_by)
    values (p_target_user_id, btrim(p_display_name), lower(btrim(p_display_email)), 'invited', p_actor_id);

    insert into public.cms_user_roles (user_id, role_key, granted_by)
    select p_target_user_id, keys.role_key, p_actor_id from unnest(normalized_roles) as keys(role_key);

    result := jsonb_build_object('ok', true, 'status', 'invited', 'userId', p_target_user_id, 'roles', to_jsonb(normalized_roles));
  elsif p_action = 'resend_invite' then
    if not exists (select 1 from public.cms_profiles where user_id = p_target_user_id and status = 'invited') then
      raise exception 'CMS_INVITE_NOT_PENDING' using errcode = '22023';
    end if;
    result := jsonb_build_object('ok', true, 'status', 'invited', 'userId', p_target_user_id);
  elsif p_action = 'set_roles' then
    if p_target_user_id = p_actor_id then
      raise exception 'CMS_SELF_ROLE_CHANGE_DENIED' using errcode = '42501';
    end if;
    if target_is_super and not ('super_admin' = any(normalized_roles)) and other_active_supers = 0 then
      raise exception 'CMS_LAST_SUPER_ADMIN' using errcode = '42501';
    end if;
    if not exists (select 1 from public.cms_profiles where user_id = p_target_user_id) then
      raise exception 'CMS_PROFILE_NOT_FOUND' using errcode = 'P0002';
    end if;

    delete from public.cms_user_roles where user_id = p_target_user_id;
    insert into public.cms_user_roles (user_id, role_key, granted_by)
    select p_target_user_id, keys.role_key, p_actor_id from unnest(normalized_roles) as keys(role_key);
    result := jsonb_build_object('ok', true, 'userId', p_target_user_id, 'roles', to_jsonb(normalized_roles));
  elsif p_action = 'suspend' then
    if p_target_user_id = p_actor_id then
      raise exception 'CMS_SELF_SUSPEND_DENIED' using errcode = '42501';
    end if;
    if target_is_super and other_active_supers = 0 then
      raise exception 'CMS_LAST_SUPER_ADMIN' using errcode = '42501';
    end if;
    update public.cms_profiles
    set status = 'suspended', suspended_at = now(), suspended_by = p_actor_id, sessions_valid_after = now()
    where user_id = p_target_user_id;
    if not found then raise exception 'CMS_PROFILE_NOT_FOUND' using errcode = 'P0002'; end if;
    result := jsonb_build_object('ok', true, 'status', 'suspended', 'userId', p_target_user_id);
  elsif p_action = 'reactivate' then
    update public.cms_profiles
    set status = 'active', suspended_at = null, suspended_by = null
    where user_id = p_target_user_id;
    if not found then raise exception 'CMS_PROFILE_NOT_FOUND' using errcode = 'P0002'; end if;
    result := jsonb_build_object('ok', true, 'status', 'active', 'userId', p_target_user_id);
  elsif p_action = 'revoke_sessions' then
    if p_target_user_id = p_actor_id then
      raise exception 'CMS_SELF_REVOCATION_DENIED' using errcode = '42501';
    end if;
    update public.cms_profiles set sessions_valid_after = clock_timestamp() where user_id = p_target_user_id;
    if not found then raise exception 'CMS_PROFILE_NOT_FOUND' using errcode = 'P0002'; end if;
    insert into public.cms_login_events (user_id, event_type, success, reason_code, correlation_id)
    values (p_target_user_id, 'session_revoked', true, 'admin_command', p_correlation_id);
    result := jsonb_build_object('ok', true, 'status', 'sessions_revoked', 'userId', p_target_user_id);
  end if;

  insert into public.cms_audit_log (actor_id, action, target_type, target_id, event_data, correlation_id)
  values (
    p_actor_id,
    required_permission,
    'profile',
    p_target_user_id::text,
    jsonb_build_object('command', p_action, 'roles', case when p_action in ('invite', 'set_roles') then to_jsonb(normalized_roles) else null end),
    p_correlation_id
  );

  update public.cms_command_receipts
  set response = result, target_user_id = p_target_user_id
  where actor_id = p_actor_id and action = p_action and idempotency_key = p_idempotency_key;

  return result;
end;
$$;

revoke all on table public.cms_command_receipts from public, anon, authenticated;
grant all on table public.cms_command_receipts to service_role;

revoke all on function public.cms_actor_authorized(uuid, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.cms_reserve_user_command(uuid, text, uuid, text, text, timestamptz, uuid, uuid) from public, anon, authenticated;
revoke all on function public.cms_apply_user_command(uuid, text, uuid, text, text, text[], text, text, timestamptz, uuid, uuid) from public, anon, authenticated;
grant execute on function public.cms_actor_authorized(uuid, text, text, text, timestamptz) to service_role;
grant execute on function public.cms_reserve_user_command(uuid, text, uuid, text, text, timestamptz, uuid, uuid) to service_role;
grant execute on function public.cms_apply_user_command(uuid, text, uuid, text, text, text[], text, text, timestamptz, uuid, uuid) to service_role;
