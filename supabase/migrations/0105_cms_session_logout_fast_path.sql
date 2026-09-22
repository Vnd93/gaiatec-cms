-- O logout do CMS precisa revogar a sessao antes do signOut local do provedor,
-- mas nao precisa recalcular papeis, permissoes ou o manifesto EV2. A resolucao
-- completa pode disputar os locks globais de RBAC e ultrapassar o prazo de
-- transporte da Edge Function. Este caminho preserva as mesmas fences e a
-- mesma auditoria, com uma transacao curta e exclusivamente vinculada ao ator.

begin;

create or replace function private.cms_resolve_logout_core_0105(
  p_user_id uuid,
  p_environment text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_status text;
  v_session_hash text;
begin
  if p_user_id is null
     or p_environment is null
     or p_environment not in ('local', 'staging', 'production')
     or p_aal is null
     or p_aal not in ('aal1', 'aal2')
     or p_session_id is null
     or pg_catalog.char_length(p_session_id) not between 1 and 200
     or p_issued_at is null
     or p_issued_at > pg_catalog.now() + interval '5 minutes'
     or p_correlation_id is null then
    raise exception 'CMS_SESSION_INPUT_INVALID' using errcode = '22023';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'CMS_IDENTITY_NOT_FOUND' using errcode = '42501';
  end if;

  -- Mantem a ordem global do sistema: lease do ator antes da linha de perfil.
  -- O lock global de super admins nao participa, pois o logout nao le nem
  -- altera atribuicoes e precisa encerrar rapidamente a sessao corrente.
  perform private.cms_system_lock_actor_scope(p_user_id, p_environment);
  select profile.status into v_profile_status
  from public.cms_profiles profile
  where profile.user_id = p_user_id
  for update;

  if v_profile_status is null or v_profile_status = 'suspended' then
    raise exception 'CMS_PROFILE_NOT_ACTIVE' using errcode = '42501';
  end if;
  if v_profile_status <> 'active' then
    raise exception 'CMS_INVITE_NOT_ACCEPTED' using errcode = '42501';
  end if;
  if exists (
    select 1
    from public.cms_profiles profile
    where profile.user_id = p_user_id
      and profile.sessions_valid_after > p_issued_at
  ) then
    raise exception 'CMS_SESSION_EXPIRED' using errcode = '42501';
  end if;

  v_session_hash := pg_catalog.encode(
    extensions.digest(p_session_id, 'sha256'),
    'hex'
  );
  if exists (
    select 1
    from public.cms_session_revocations revocation
    where revocation.session_id_hash = v_session_hash
      and revocation.expires_at > pg_catalog.now()
  ) then
    raise exception 'CMS_SESSION_REVOKED' using errcode = '42501';
  end if;

  update public.cms_profiles profile
  set last_seen_at = pg_catalog.now(),
      mfa_enrolled_at = case
        when p_aal = 'aal2' then coalesce(profile.mfa_enrolled_at, pg_catalog.now())
        else profile.mfa_enrolled_at
      end
  where profile.user_id = p_user_id;

  insert into public.cms_login_events (
    user_id,
    event_type,
    success,
    reason_code,
    mfa_verified,
    session_id_hash,
    correlation_id
  ) values (
    p_user_id,
    'logout',
    true,
    null,
    p_aal = 'aal2',
    v_session_hash,
    p_correlation_id
  ) on conflict do nothing;

  insert into public.cms_session_revocations (
    session_id_hash,
    user_id,
    revoked_by,
    reason_code,
    revoked_at,
    expires_at
  ) values (
    v_session_hash,
    p_user_id,
    p_user_id,
    'self_logout',
    pg_catalog.statement_timestamp(),
    pg_catalog.statement_timestamp() + interval '100 years'
  )
  on conflict (session_id_hash) do update
    set expires_at = greatest(
      public.cms_session_revocations.expires_at,
      excluded.expires_at
    )
    where public.cms_session_revocations.user_id = excluded.user_id;

  -- O cliente valida o mesmo envelope de sessao, mas logout nunca devolve um
  -- grant reutilizavel. O marcador explicito impede que este recibo seja
  -- confundido com uma fotografia de autorizacao.
  return pg_catalog.jsonb_build_object(
    'userId', p_user_id,
    'status', v_profile_status,
    'roles', pg_catalog.to_jsonb(array[]::text[]),
    'permissions', pg_catalog.to_jsonb(array[]::text[]),
    'mfaRequired', false,
    'mfaVerified', p_aal = 'aal2',
    'accessGranted', false,
    'activated', false,
    'rbacScoped', false,
    'rbacScopeReasonCode', 'logout',
    'scope', pg_catalog.jsonb_build_object(
      'siteKey', 'main',
      'environment', p_environment,
      'effectiveUntil', null
    )
  );
end;
$$;

revoke all on function private.cms_resolve_logout_core_0105(
  uuid, text, text, text, timestamptz, uuid
) from public, anon, authenticated, service_role;

create or replace function public.cms_resolve_session_scoped(
  p_user_id uuid,
  p_event_type text,
  p_environment text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not private.cms_user_actor_context_active(p_user_id, p_environment) then
    raise exception 'CMS_SESSION_SCOPE_FORBIDDEN' using errcode = '42501';
  end if;

  if p_event_type = 'logout' then
    return private.cms_resolve_logout_core_0105(
      p_user_id,
      p_environment,
      p_aal,
      p_session_id,
      p_issued_at,
      p_correlation_id
    );
  end if;

  -- As demais acoes preservam integralmente a resolucao atomica de RBAC.
  perform private.cms_system_lock_actor_scope(p_user_id, p_environment);
  v_result := private.cms_resolve_session_core_0087(
    p_user_id,
    p_event_type,
    p_environment,
    p_aal,
    p_session_id,
    p_issued_at,
    p_correlation_id
  );
  return v_result;
end;
$$;

revoke all on function public.cms_resolve_session_scoped(
  uuid, text, text, text, text, timestamptz, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.cms_resolve_session_scoped(
  uuid, text, text, text, text, timestamptz, uuid
) to service_role;

do $probe$
declare
  v_logout_definition text;
  v_wrapper_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'private.cms_resolve_logout_core_0105(uuid,text,text,text,timestamp with time zone,uuid)'::regprocedure
  ) into v_logout_definition;
  select pg_catalog.pg_get_functiondef(
    'public.cms_resolve_session_scoped(uuid,text,text,text,text,timestamp with time zone,uuid)'::regprocedure
  ) into v_wrapper_definition;

  if pg_catalog.position('cms_system_lock_actor_scope' in v_logout_definition) = 0
     or pg_catalog.position('for update' in pg_catalog.lower(v_logout_definition)) = 0
     or pg_catalog.position('cms_login_events' in v_logout_definition) = 0
     or pg_catalog.position('cms_session_revocations' in v_logout_definition) = 0
     or pg_catalog.position('cms_rbac_scope_capability' in v_logout_definition) <> 0
     or pg_catalog.position('cms_resolve_scoped_access' in v_logout_definition) <> 0 then
    raise exception 'CMS_SESSION_LOGOUT_FAST_PATH_DRIFT' using errcode = '55000';
  end if;
  if pg_catalog.position('cms_resolve_logout_core_0105' in v_wrapper_definition) = 0
     or pg_catalog.position('cms_resolve_session_core_0087' in v_wrapper_definition) = 0 then
    raise exception 'CMS_SESSION_LOGOUT_WRAPPER_DRIFT' using errcode = '55000';
  end if;
  if pg_catalog.has_function_privilege(
       'anon',
       'public.cms_resolve_session_scoped(uuid,text,text,text,text,timestamptz,uuid)',
       'execute'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       'public.cms_resolve_session_scoped(uuid,text,text,text,text,timestamptz,uuid)',
       'execute'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.cms_resolve_session_scoped(uuid,text,text,text,text,timestamptz,uuid)',
       'execute'
     )
     or pg_catalog.has_function_privilege(
       'service_role',
       'private.cms_resolve_logout_core_0105(uuid,text,text,text,timestamptz,uuid)',
       'execute'
     ) then
    raise exception 'CMS_SESSION_LOGOUT_PRIVILEGE_DRIFT' using errcode = '55000';
  end if;
end;
$probe$;

commit;
