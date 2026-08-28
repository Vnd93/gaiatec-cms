-- Fase 3 / CMS-003 — resolucao server-side de sessao administrativa.
-- Nenhuma identidade e criada por esta migration.

create unique index cms_login_events_session_event_uidx
  on public.cms_login_events (user_id, event_type, session_id_hash)
  where session_id_hash is not null;

create function public.cms_resolve_session(
  p_user_id uuid,
  p_event_type text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  profile_status text;
  session_hash text;
  role_keys text[];
  permission_keys text[];
  requires_mfa boolean;
  access_granted boolean;
  activated boolean := false;
begin
  if p_user_id is null
     or p_event_type not in ('login_success', 'mfa_challenge', 'recovery', 'logout')
     or p_aal not in ('aal1', 'aal2')
     or p_session_id is null
     or char_length(p_session_id) not between 1 and 200
     or p_issued_at is null
     or p_issued_at > now() + interval '5 minutes'
     or p_correlation_id is null then
    raise exception 'CMS_SESSION_INPUT_INVALID' using errcode = '22023';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'CMS_IDENTITY_NOT_FOUND' using errcode = '42501';
  end if;

  select p.status into profile_status
  from public.cms_profiles p
  where p.user_id = p_user_id
  for update;

  if profile_status is null or profile_status = 'suspended' then
    raise exception 'CMS_PROFILE_NOT_ACTIVE' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.cms_profiles p
    where p.user_id = p_user_id and p.sessions_valid_after > p_issued_at
  ) then
    raise exception 'CMS_SESSION_EXPIRED' using errcode = '42501';
  end if;

  session_hash := encode(extensions.digest(p_session_id, 'sha256'), 'hex');
  if exists (
    select 1 from public.cms_session_revocations r
    where r.session_id_hash = session_hash and r.expires_at > now()
  ) then
    raise exception 'CMS_SESSION_REVOKED' using errcode = '42501';
  end if;

  if profile_status = 'invited' and p_event_type in ('login_success', 'recovery') then
    update public.cms_profiles
    set status = 'active',
        last_sign_in_at = now(),
        last_seen_at = now(),
        mfa_enrolled_at = case when p_aal = 'aal2' then coalesce(mfa_enrolled_at, now()) else mfa_enrolled_at end
    where user_id = p_user_id;
    profile_status := 'active';
    activated := true;

    insert into public.cms_audit_log (actor_id, action, target_type, target_id, correlation_id)
    values (p_user_id, 'cms:users.activate', 'profile', p_user_id::text, p_correlation_id);
  elsif profile_status = 'active' then
    update public.cms_profiles
    set last_seen_at = now(),
        last_sign_in_at = case when p_event_type in ('login_success', 'recovery') then now() else last_sign_in_at end,
        mfa_enrolled_at = case when p_aal = 'aal2' then coalesce(mfa_enrolled_at, now()) else mfa_enrolled_at end
    where user_id = p_user_id;
  else
    raise exception 'CMS_INVITE_NOT_ACCEPTED' using errcode = '42501';
  end if;

  select coalesce(array_agg(ur.role_key order by ur.role_key), array[]::text[])
  into role_keys
  from public.cms_user_roles ur
  where ur.user_id = p_user_id;

  select exists (
    select 1
    from public.cms_user_roles ur
    join public.cms_roles r on r.role_key = ur.role_key
    where ur.user_id = p_user_id and r.mfa_required
  ) into requires_mfa;

  access_granted := profile_status = 'active' and (not requires_mfa or p_aal = 'aal2');

  select coalesce(array_agg(distinct rp.permission_key order by rp.permission_key), array[]::text[])
  into permission_keys
  from public.cms_user_roles ur
  join public.cms_role_permissions rp on rp.role_key = ur.role_key
  where ur.user_id = p_user_id;

  insert into public.cms_login_events (
    user_id, event_type, success, reason_code, mfa_verified, session_id_hash, correlation_id
  ) values (
    p_user_id,
    p_event_type,
    access_granted or p_event_type in ('login_success', 'recovery', 'logout'),
    case when requires_mfa and p_aal <> 'aal2' then 'mfa_required' else null end,
    p_aal = 'aal2',
    session_hash,
    p_correlation_id
  ) on conflict do nothing;

  return jsonb_build_object(
    'userId', p_user_id,
    'status', profile_status,
    'roles', to_jsonb(role_keys),
    'permissions', to_jsonb(permission_keys),
    'mfaRequired', requires_mfa,
    'mfaVerified', p_aal = 'aal2',
    'accessGranted', access_granted,
    'activated', activated
  );
end;
$$;

revoke all on function public.cms_resolve_session(uuid,text,text,text,timestamptz,uuid)
from public, anon, authenticated;

grant execute on function public.cms_resolve_session(uuid,text,text,text,timestamptz,uuid)
to service_role;
