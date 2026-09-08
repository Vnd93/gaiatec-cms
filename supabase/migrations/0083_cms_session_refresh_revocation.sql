-- A revogacao administrativa do CMS precisa sobreviver a rotacoes do JWT.
-- O Supabase preserva session_id ao renovar um refresh token; por isso, alem
-- do corte por iat, registramos atomicamente os session_id ja vistos no CMS e
-- todos os session_id correntes em auth.sessions. Uma sessao Auth realmente
-- nova recebe outro session_id e continua apta a passar por uma nova
-- autenticacao, sem banir ou apagar a identidade compartilhada com o RDO.

create or replace function public.cms_apply_user_command_scoped(
  p_actor_id uuid,
  p_action text,
  p_target_user_id uuid,
  p_display_name text,
  p_display_email text,
  p_role_keys text[],
  p_environment text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_idempotency_key uuid,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_target_is_super boolean;
  v_other_active_supers integer;
  v_normalized_roles text[];
  v_receipt_target uuid;
  v_result jsonb;
  v_result_user_text text;
begin
  if p_target_user_id is null
     or not private.cms_user_actor_context_active(p_actor_id,p_environment) then
    raise exception 'CMS_USERS_SCOPE_FORBIDDEN' using errcode='42501';
  end if;

  perform private.cms_lock_active_qa_actor_leases(
    array_remove(array[p_actor_id,p_target_user_id],null)
  );
  if not private.cms_user_actor_target_scope_allowed(
    p_actor_id,p_target_user_id,p_environment
  ) then
    raise exception 'CMS_USER_TARGET_FORBIDDEN' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('cms-users:last-super',0));

  select receipt.target_user_id into v_receipt_target
  from public.cms_command_receipts receipt
  where receipt.actor_id=p_actor_id
    and receipt.action=p_action
    and receipt.idempotency_key=p_idempotency_key;
  if found and v_receipt_target is not null
     and v_receipt_target<>p_target_user_id then
    raise exception 'CMS_COMMAND_IDEMPOTENCY_MISMATCH' using errcode='40001';
  end if;
  perform 1 from public.cms_profiles profile
  where profile.user_id=p_target_user_id for update;

  v_normalized_roles:=array(
    select distinct entry.role_key
    from unnest(coalesce(p_role_keys,'{}'::text[])) entry(role_key)
    order by entry.role_key
  );
  select exists(
    select 1 from public.cms_user_roles role
    where role.user_id=p_target_user_id and role.role_key='super_admin'
  ) into v_target_is_super;

  if p_actor_id<>p_target_user_id and v_target_is_super and (
    p_action='suspend'
    or (p_action='set_roles' and not ('super_admin'=any(v_normalized_roles)))
  ) then
    select count(*) into v_other_active_supers
    from public.cms_profiles profile
    join public.cms_user_roles role
      on role.user_id=profile.user_id and role.role_key='super_admin'
    where profile.status='active'
      and profile.user_id<>p_target_user_id
      and private.cms_user_actor_target_scope_allowed(
        p_actor_id,profile.user_id,p_environment
      );
    if v_other_active_supers=0 then
      raise exception 'CMS_LAST_SUPER_ADMIN' using errcode='42501';
    end if;
  end if;

  v_result:=public.cms_apply_user_command_unscoped_0070(
    p_actor_id,p_action,p_target_user_id,p_display_name,p_display_email,
    p_role_keys,p_aal,p_session_id,p_issued_at,p_idempotency_key,p_correlation_id
  );
  v_result_user_text:=v_result->>'userId';
  if v_result_user_text is null
     or v_result_user_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'CMS_COMMAND_RECEIPT_INVALID' using errcode='55000';
  end if;
  if v_result_user_text::uuid<>p_target_user_id then
    raise exception 'CMS_COMMAND_IDEMPOTENCY_MISMATCH' using errcode='40001';
  end if;

  -- A repeticao da mesma chave retorna a resposta persistida pelo comando
  -- original e nao pode ampliar a revogacao para sessoes Auth criadas depois.
  if p_action in ('revoke_sessions','suspend','reactivate')
     and coalesce((v_result->>'duplicate')::boolean,false) is false then
    insert into public.cms_session_revocations(
      session_id_hash,user_id,revoked_by,reason_code,revoked_at,expires_at
    )
    select distinct
      captured.session_id_hash,
      p_target_user_id,
      p_actor_id,
      'admin_command',
      statement_timestamp(),
      statement_timestamp()+interval '100 years'
    from (
      select event.session_id_hash
      from public.cms_login_events event
      where event.user_id=p_target_user_id
        and event.session_id_hash is not null
      union
      select encode(extensions.digest(auth_session.id::text,'sha256'),'hex')
      from auth.sessions auth_session
      where auth_session.user_id=p_target_user_id
        and (
          auth_session.not_after is null
          or auth_session.not_after>statement_timestamp()
        )
    ) captured(session_id_hash)
    on conflict(session_id_hash) do update
      set revoked_by=excluded.revoked_by,
          reason_code=excluded.reason_code,
          revoked_at=excluded.revoked_at,
          expires_at=greatest(
            public.cms_session_revocations.expires_at,
            excluded.expires_at
          )
      where public.cms_session_revocations.user_id=excluded.user_id;
  end if;

  return v_result;
end;
$$;

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
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_result jsonb;
  v_requires_mfa boolean;
  v_access_granted boolean;
  v_session_hash text;
begin
  if not private.cms_user_actor_context_active(p_user_id,p_environment) then
    raise exception 'CMS_SESSION_SCOPE_FORBIDDEN' using errcode='42501';
  end if;
  perform private.cms_lock_active_qa_actor_leases(array[p_user_id]);
  v_result:=public.cms_resolve_session_unscoped_0070(
    p_user_id,p_event_type,p_aal,p_session_id,p_issued_at,p_correlation_id
  );

  -- MFA e exigida tanto pelo papel quanto pela posse de qualquer permissao
  -- critica. Assim, um admin AAL1 recebe um caminho real de matricula/desafio
  -- antes de tentar uma operacao que o autorizador necessariamente recusaria.
  select exists(
    select 1
    from public.cms_user_roles assignment
    join public.cms_roles role on role.role_key=assignment.role_key
    where assignment.user_id=p_user_id and role.mfa_required
  ) or exists(
    select 1
    from public.cms_user_roles assignment
    join public.cms_role_permissions role_permission
      on role_permission.role_key=assignment.role_key
    join public.cms_permissions permission
      on permission.permission_key=role_permission.permission_key
    where assignment.user_id=p_user_id and permission.critical
  ) into v_requires_mfa;

  v_access_granted:=
    v_result->>'status'='active'
    and jsonb_array_length(coalesce(v_result->'roles','[]'::jsonb))>0
    and (not v_requires_mfa or p_aal='aal2');
  v_result:=v_result || jsonb_build_object(
    'mfaRequired',v_requires_mfa,
    'mfaVerified',p_aal='aal2',
    'accessGranted',v_access_granted
  );

  if v_requires_mfa and p_aal<>'aal2' then
    v_session_hash:=encode(extensions.digest(p_session_id,'sha256'),'hex');
    update public.cms_login_events event
    set success=v_access_granted or p_event_type in ('login_success','recovery','logout'),
        reason_code='mfa_required',
        mfa_verified=false
    where event.user_id=p_user_id
      and event.event_type=p_event_type
      and event.session_id_hash=v_session_hash;
  end if;

  -- O logout do CMS nao depende do sucesso posterior do signOut do provedor.
  -- O mesmo refresh token Auth pode continuar valido para o RDO, mas seu
  -- session_id fica definitivamente inelegivel para voltar ao CMS.
  if p_event_type='logout' then
    insert into public.cms_session_revocations(
      session_id_hash,user_id,revoked_by,reason_code,revoked_at,expires_at
    ) values(
      encode(extensions.digest(p_session_id,'sha256'),'hex'),
      p_user_id,
      p_user_id,
      'self_logout',
      statement_timestamp(),
      statement_timestamp()+interval '100 years'
    )
    on conflict(session_id_hash) do update
      set expires_at=greatest(
        public.cms_session_revocations.expires_at,
        excluded.expires_at
      )
      where public.cms_session_revocations.user_id=excluded.user_id;
  end if;

  return v_result;
end;
$$;

create or replace function public.cms_resolve_scoped_access(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
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
  v_capability jsonb;
  v_roles text[];
  v_permissions text[];
  v_requires_mfa boolean := false;
  v_effective_until timestamptz;
begin
  perform private.cms_system_lock_actor_scope(p_actor_id,p_environment);
  v_capability:=public.cms_rbac_scope_capability(
    p_actor_id,p_environment,p_site_key,p_aal,p_session_id,p_issued_at
  );
  if coalesce((v_capability->>'enabled')::boolean,false) is not true then
    raise exception 'CMS_RBAC_SCOPED_DISABLED' using errcode='42501';
  end if;

  select
    coalesce(array_agg(assignment.role_key order by assignment.role_key),'{}'::text[]),
    min(assignment.expires_at) filter(where assignment.expires_at is not null)
  into v_roles,v_effective_until
  from public.cms_scoped_role_assignments assignment
  where assignment.user_id=p_actor_id
    and assignment.site_key=p_site_key
    and assignment.environment=p_environment
    and assignment.revoked_at is null
    and assignment.valid_from<=statement_timestamp()
    and (assignment.expires_at is null or assignment.expires_at>statement_timestamp())
    and private.cms_system_assignment_scope_allowed(
      p_actor_id,assignment.id,p_environment
    );

  select coalesce(array_agg(distinct permission.permission_key order by permission.permission_key),'{}'::text[])
  into v_permissions
  from public.cms_scoped_role_assignments assignment
  join public.cms_role_permissions permission on permission.role_key=assignment.role_key
  where assignment.user_id=p_actor_id
    and assignment.site_key=p_site_key
    and assignment.environment=p_environment
    and assignment.revoked_at is null
    and assignment.valid_from<=statement_timestamp()
    and (assignment.expires_at is null or assignment.expires_at>statement_timestamp())
    and private.cms_system_assignment_scope_allowed(
      p_actor_id,assignment.id,p_environment
    );

  select exists(
    select 1
    from public.cms_scoped_role_assignments assignment
    join public.cms_roles role on role.role_key=assignment.role_key
    where assignment.user_id=p_actor_id
      and assignment.site_key=p_site_key
      and assignment.environment=p_environment
      and assignment.revoked_at is null
      and assignment.valid_from<=statement_timestamp()
      and (assignment.expires_at is null or assignment.expires_at>statement_timestamp())
      and role.mfa_required
      and private.cms_system_assignment_scope_allowed(
        p_actor_id,assignment.id,p_environment
      )
  ) or exists(
    select 1
    from public.cms_permissions permission
    where permission.permission_key=any(v_permissions)
      and permission.critical
  ) into v_requires_mfa;

  return jsonb_build_object(
    'rbacScoped',true,'roles',to_jsonb(v_roles),'permissions',to_jsonb(v_permissions),
    'mfaRequired',v_requires_mfa,'mfaVerified',p_aal='aal2',
    'accessGranted',cardinality(v_roles)>0 and (not v_requires_mfa or p_aal='aal2'),
    'scope',jsonb_build_object(
      'siteKey',p_site_key,'environment',p_environment,'effectiveUntil',v_effective_until
    )
  );
end;
$$;

revoke all on function public.cms_apply_user_command_scoped(
  uuid,text,uuid,text,text,text[],text,text,text,timestamptz,uuid,uuid
) from public,anon,authenticated,service_role;
grant execute on function public.cms_apply_user_command_scoped(
  uuid,text,uuid,text,text,text[],text,text,text,timestamptz,uuid,uuid
) to service_role;
revoke all on function public.cms_resolve_session_scoped(
  uuid,text,text,text,text,timestamptz,uuid
) from public,anon,authenticated,service_role;
grant execute on function public.cms_resolve_session_scoped(
  uuid,text,text,text,text,timestamptz,uuid
) to service_role;
revoke all on function public.cms_resolve_scoped_access(
  uuid,text,text,text,text,timestamptz
) from public,anon,authenticated,service_role;
grant execute on function public.cms_resolve_scoped_access(
  uuid,text,text,text,text,timestamptz
) to service_role;

do $$
begin
  if has_function_privilege(
    'anon',
    'public.cms_apply_user_command_scoped(uuid,text,uuid,text,text,text[],text,text,text,timestamptz,uuid,uuid)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.cms_apply_user_command_scoped(uuid,text,uuid,text,text,text[],text,text,text,timestamptz,uuid,uuid)',
    'execute'
  ) then
    raise exception 'CMS_USERS_SCOPED_RPC_EXPOSED';
  end if;
  if has_function_privilege(
    'anon',
    'public.cms_resolve_session_scoped(uuid,text,text,text,text,timestamptz,uuid)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.cms_resolve_session_scoped(uuid,text,text,text,text,timestamptz,uuid)',
    'execute'
  ) or has_function_privilege(
    'anon',
    'public.cms_resolve_scoped_access(uuid,text,text,text,text,timestamptz)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.cms_resolve_scoped_access(uuid,text,text,text,text,timestamptz)',
    'execute'
  ) then
    raise exception 'CMS_SESSION_SCOPED_RPC_EXPOSED';
  end if;
end;
$$;
