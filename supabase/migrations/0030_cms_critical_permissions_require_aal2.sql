-- Critical CMS commands must always use a session elevated by MFA.
-- Role-level MFA remains enforced as an additional control.

create or replace function public.cms_actor_authorized(
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
      p_aal = 'aal2'
      or (
        not exists (
          select 1
          from public.cms_user_roles ur
          join public.cms_roles r on r.role_key = ur.role_key
          where ur.user_id = p_actor_id
            and r.mfa_required
        )
        and not exists (
          select 1
          from public.cms_permissions permission
          where permission.permission_key = p_permission
            and permission.critical
        )
      )
    )
    and exists (
      select 1
      from public.cms_user_roles ur
      join public.cms_role_permissions rp on rp.role_key = ur.role_key
      where ur.user_id = p_actor_id
        and rp.permission_key = p_permission
    );
$$;

revoke all on function public.cms_actor_authorized(uuid, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.cms_actor_authorized(uuid, text, text, text, timestamptz)
  to service_role;
