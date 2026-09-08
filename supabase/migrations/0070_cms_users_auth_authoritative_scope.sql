-- Homologacao final: fronteira autoritativa de identidades administrativas.
-- Identidades que alguma vez receberam uma lease QA nunca voltam a ser
-- classificadas como corporativas. Operadores QA somente enxergam e gerem
-- identidades da mesma run/candidate/environment enquanto ambas as leases
-- permanecem ativas e com o marcador Auth exato.

create or replace function private.cms_user_actor_context_active(
  p_actor_id uuid,
  p_environment text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, auth, pg_temp
as $$
  select case
    when p_actor_id is null
      or p_environment not in ('local','staging','production')
      or not exists(select 1 from auth.users actor where actor.id=p_actor_id)
      then false
    when exists(
      select 1 from private.cms_qa_actor_leases history
      where history.actor_id=p_actor_id
    ) then exists(
      select 1 from private.cms_qa_actor_leases lease
      where lease.actor_id=p_actor_id
        and lease.environment=p_environment
        and lease.status='active'
        and lease.expires_at>statement_timestamp()
        and private.cms_qa_actor_marker_is_exact(
          lease.actor_id,lease.run_tag,lease.candidate_sha,lease.environment
        )
    )
    else true
  end;
$$;

create or replace function private.cms_user_actor_target_scope_allowed(
  p_actor_id uuid,
  p_target_user_id uuid,
  p_environment text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, auth, pg_temp
as $$
  select case
    when p_actor_id is null
      or p_target_user_id is null
      or p_environment not in ('local','staging','production')
      or not exists(select 1 from auth.users actor where actor.id=p_actor_id)
      or not exists(select 1 from auth.users target where target.id=p_target_user_id)
      then false
    when exists(
      select 1 from private.cms_qa_actor_leases history
      where history.actor_id=p_actor_id
    ) then exists(
      select 1
      from private.cms_qa_actor_leases caller
      join private.cms_qa_actor_leases target
        on target.run_tag=caller.run_tag
       and target.candidate_sha=caller.candidate_sha
       and target.environment=caller.environment
      where caller.actor_id=p_actor_id
        and target.actor_id=p_target_user_id
        and caller.environment=p_environment
        and caller.status='active'
        and target.status='active'
        and caller.expires_at>statement_timestamp()
        and target.expires_at>statement_timestamp()
        and private.cms_qa_actor_marker_is_exact(
          caller.actor_id,caller.run_tag,caller.candidate_sha,caller.environment
        )
        and private.cms_qa_actor_marker_is_exact(
          target.actor_id,target.run_tag,target.candidate_sha,target.environment
        )
    )
    else not exists(
      select 1 from private.cms_qa_actor_leases target_history
      where target_history.actor_id=p_target_user_id
    )
  end;
$$;

create or replace function private.cms_user_actor_environment(p_actor_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, private, pg_temp
as $$
  select coalesce(
    (select lease.environment from private.cms_qa_actor_leases lease
     where lease.actor_id=p_actor_id),
    'local'
  );
$$;

-- Corporate auditors retain the complete immutable QA trail. QA auditors are
-- restricted to themselves and identities in the same currently active run.
create or replace function private.cms_user_audit_actor_scope_allowed(
  p_actor_id uuid,
  p_event_actor_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, auth, pg_temp
as $$
  select case
    when p_actor_id is null
      or not exists(select 1 from auth.users actor where actor.id=p_actor_id)
      then false
    when not exists(
      select 1 from private.cms_qa_actor_leases history
      where history.actor_id=p_actor_id
    ) then true
    when p_event_actor_id is null then false
    else private.cms_user_actor_target_scope_allowed(
      p_actor_id,
      p_event_actor_id,
      private.cms_user_actor_environment(p_actor_id)
    )
  end;
$$;

create or replace function public.cms_user_target_read_allowed(
  p_actor_id uuid,
  p_target_user_id uuid,
  p_environment text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, pg_temp
as $$
  select private.cms_user_actor_target_scope_allowed(
    p_actor_id,p_target_user_id,p_environment
  );
$$;

create or replace function public.cms_user_target_session_read_allowed(
  p_target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, pg_temp
as $$
  select private.cms_user_actor_target_scope_allowed(
    auth.uid(),
    p_target_user_id,
    private.cms_user_actor_environment(auth.uid())
  );
$$;

create or replace function public.cms_user_audit_session_read_allowed(
  p_event_actor_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, pg_temp
as $$
  select private.cms_user_audit_actor_scope_allowed(auth.uid(),p_event_actor_id);
$$;

create or replace function public.cms_users_list_scoped(
  p_actor_id uuid,
  p_environment text,
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
  v_users jsonb;
begin
  if not private.cms_user_actor_context_active(p_actor_id,p_environment)
     or not public.cms_actor_authorized(
       p_actor_id,'cms:users.read',p_aal,p_session_id,p_issued_at
     ) then
    raise exception 'CMS_USERS_SCOPE_FORBIDDEN' using errcode='42501';
  end if;

  perform private.cms_lock_active_qa_actor_leases(array[p_actor_id]);

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'user_id',profile.user_id,
      'display_name',profile.display_name,
      'display_email',profile.display_email,
      'status',profile.status,
      'mfa_enrolled_at',profile.mfa_enrolled_at,
      'last_sign_in_at',profile.last_sign_in_at,
      'last_seen_at',profile.last_seen_at,
      'invited_at',profile.invited_at,
      'suspended_at',profile.suspended_at,
      'sessions_valid_after',profile.sessions_valid_after,
      'roles',coalesce((
        select jsonb_agg(role.role_key order by role.role_key)
        from public.cms_user_roles role where role.user_id=profile.user_id
      ),'[]'::jsonb),
      'is_self',profile.user_id=p_actor_id
    ) order by profile.display_name,profile.user_id
  ),'[]'::jsonb) into v_users
  from public.cms_profiles profile
  where private.cms_user_actor_target_scope_allowed(
    p_actor_id,profile.user_id,p_environment
  );

  return jsonb_build_object('users',v_users);
end;
$$;

create or replace function public.cms_user_profile_scoped(
  p_actor_id uuid,
  p_target_user_id uuid,
  p_environment text,
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
  v_profile public.cms_profiles%rowtype;
begin
  if not private.cms_user_actor_context_active(p_actor_id,p_environment)
     or not public.cms_actor_authorized(
       p_actor_id,'cms:users.invite',p_aal,p_session_id,p_issued_at
     ) then
    raise exception 'CMS_USERS_SCOPE_FORBIDDEN' using errcode='42501';
  end if;

  perform private.cms_lock_active_qa_actor_leases(
    array[p_actor_id,p_target_user_id]
  );
  if not private.cms_user_actor_target_scope_allowed(
    p_actor_id,p_target_user_id,p_environment
  ) then
    raise exception 'CMS_USER_TARGET_FORBIDDEN' using errcode='42501';
  end if;

  select * into v_profile from public.cms_profiles profile
  where profile.user_id=p_target_user_id;
  if not found then return null; end if;

  return jsonb_build_object(
    'userId',v_profile.user_id,
    'displayEmail',v_profile.display_email,
    'displayName',v_profile.display_name,
    'status',v_profile.status
  );
end;
$$;

-- The Auth invitation marker is emitted only by this trusted RPC. The browser
-- payload never controls synthetic/run/candidate/environment classification.
create or replace function public.cms_user_invite_context_scoped(
  p_actor_id uuid,
  p_environment text,
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
  v_lease private.cms_qa_actor_leases%rowtype;
begin
  if not private.cms_user_actor_context_active(p_actor_id,p_environment)
     or not public.cms_actor_authorized(
       p_actor_id,'cms:users.invite',p_aal,p_session_id,p_issued_at
     ) then
    raise exception 'CMS_USERS_SCOPE_FORBIDDEN' using errcode='42501';
  end if;

  perform private.cms_lock_active_qa_actor_leases(array[p_actor_id]);
  select * into v_lease from private.cms_qa_actor_leases lease
  where lease.actor_id=p_actor_id;

  if not found then
    return jsonb_build_object('schemaVersion',1,'isQaActor',false,'marker','{}'::jsonb);
  end if;

  return jsonb_build_object(
    'schemaVersion',1,
    'isQaActor',true,
    'marker',jsonb_build_object(
      'synthetic',true,
      'purpose','qa-cms-browser',
      'runTag',v_lease.run_tag,
      'candidateSha',v_lease.candidate_sha,
      'environment',v_lease.environment
    )
  );
end;
$$;

-- Retire the globally-scoped service RPCs. The renamed definitions remain an
-- implementation detail so their established validation/audit behavior is
-- preserved behind the new actor boundary.
alter function public.cms_reserve_user_command(
  uuid,text,uuid,text,text,timestamptz,uuid,uuid
) rename to cms_reserve_user_command_unscoped_0070;
alter function public.cms_apply_user_command(
  uuid,text,uuid,text,text,text[],text,text,timestamptz,uuid,uuid
) rename to cms_apply_user_command_unscoped_0070;
alter function public.cms_resolve_session(
  uuid,text,text,text,timestamptz,uuid
) rename to cms_resolve_session_unscoped_0070;

revoke all on function public.cms_reserve_user_command_unscoped_0070(
  uuid,text,uuid,text,text,timestamptz,uuid,uuid
) from public,anon,authenticated,service_role;
revoke all on function public.cms_apply_user_command_unscoped_0070(
  uuid,text,uuid,text,text,text[],text,text,timestamptz,uuid,uuid
) from public,anon,authenticated,service_role;
revoke all on function public.cms_resolve_session_unscoped_0070(
  uuid,text,text,text,timestamptz,uuid
) from public,anon,authenticated,service_role;

create or replace function public.cms_reserve_user_command_scoped(
  p_actor_id uuid,
  p_action text,
  p_target_user_id uuid,
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
  v_result jsonb;
  v_result_user_text text;
  v_result_user_id uuid;
begin
  if not private.cms_user_actor_context_active(p_actor_id,p_environment) then
    raise exception 'CMS_USERS_SCOPE_FORBIDDEN' using errcode='42501';
  end if;
  perform private.cms_lock_active_qa_actor_leases(
    array_remove(array[p_actor_id,p_target_user_id],null)
  );
  if p_target_user_id is not null and not private.cms_user_actor_target_scope_allowed(
    p_actor_id,p_target_user_id,p_environment
  ) then
    raise exception 'CMS_USER_TARGET_FORBIDDEN' using errcode='42501';
  end if;

  v_result:=public.cms_reserve_user_command_unscoped_0070(
    p_actor_id,p_action,p_target_user_id,p_aal,p_session_id,p_issued_at,
    p_idempotency_key,p_correlation_id
  );
  v_result_user_text:=v_result->>'userId';
  if v_result_user_text is not null then
    if v_result_user_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'CMS_COMMAND_RECEIPT_INVALID' using errcode='55000';
    end if;
    v_result_user_id:=v_result_user_text::uuid;
    perform private.cms_lock_active_qa_actor_leases(
      array[p_actor_id,v_result_user_id]
    );
    if not private.cms_user_actor_target_scope_allowed(
      p_actor_id,v_result_user_id,p_environment
    ) then
      raise exception 'CMS_COMMAND_RECEIPT_SCOPE_FORBIDDEN' using errcode='42501';
    end if;
  end if;
  return v_result;
end;
$$;

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

  -- Global order for this domain: all active lease rows, the user-command
  -- advisory fence, then the profile/roles. This closes lease-terminal and
  -- concurrent last-super TOCTOU windows.
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
begin
  if not private.cms_user_actor_context_active(p_user_id,p_environment) then
    raise exception 'CMS_SESSION_SCOPE_FORBIDDEN' using errcode='42501';
  end if;
  perform private.cms_lock_active_qa_actor_leases(array[p_user_id]);
  return public.cms_resolve_session_unscoped_0070(
    p_user_id,p_event_type,p_aal,p_session_id,p_issued_at,p_correlation_id
  );
end;
$$;

-- Owner-only compatibility entry points keep the historical pgTAP suites and
-- emergency SQL diagnostics valid. They derive the server-side environment and
-- delegate to the scoped boundary, but are not executable by any API role.
create or replace function public.cms_reserve_user_command(
  p_actor_id uuid,p_action text,p_target_user_id uuid,p_aal text,
  p_session_id text,p_issued_at timestamptz,p_idempotency_key uuid,
  p_correlation_id uuid
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select public.cms_reserve_user_command_scoped(
    p_actor_id,p_action,p_target_user_id,
    private.cms_user_actor_environment(p_actor_id),p_aal,p_session_id,
    p_issued_at,p_idempotency_key,p_correlation_id
  );
$$;

create or replace function public.cms_apply_user_command(
  p_actor_id uuid,p_action text,p_target_user_id uuid,p_display_name text,
  p_display_email text,p_role_keys text[],p_aal text,p_session_id text,
  p_issued_at timestamptz,p_idempotency_key uuid,p_correlation_id uuid
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select public.cms_apply_user_command_scoped(
    p_actor_id,p_action,p_target_user_id,p_display_name,p_display_email,
    p_role_keys,private.cms_user_actor_environment(p_actor_id),p_aal,
    p_session_id,p_issued_at,p_idempotency_key,p_correlation_id
  );
$$;

create or replace function public.cms_resolve_session(
  p_user_id uuid,p_event_type text,p_aal text,p_session_id text,
  p_issued_at timestamptz,p_correlation_id uuid
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select public.cms_resolve_session_scoped(
    p_user_id,p_event_type,private.cms_user_actor_environment(p_user_id),
    p_aal,p_session_id,p_issued_at,p_correlation_id
  );
$$;

-- If Auth accepted a fresh synthetic invitation but the transactional CMS
-- profile command failed, retain the immutable identity/lease evidence while
-- immediately banning the unusable identity. Never delete through the lease FK.
create or replace function public.cms_abandon_qa_invite_scoped(
  p_actor_id uuid,
  p_target_user_id uuid,
  p_environment text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $$
declare
  v_target private.cms_qa_actor_leases%rowtype;
begin
  if p_actor_id=p_target_user_id
     or not private.cms_user_actor_context_active(p_actor_id,p_environment)
     or not public.cms_actor_authorized(
       p_actor_id,'cms:users.invite',p_aal,p_session_id,p_issued_at
     ) then
    raise exception 'CMS_QA_INVITE_ABANDON_FORBIDDEN' using errcode='42501';
  end if;

  perform private.cms_lock_active_qa_actor_leases(
    array[p_actor_id,p_target_user_id]
  );
  if not private.cms_user_actor_target_scope_allowed(
    p_actor_id,p_target_user_id,p_environment
  ) then
    raise exception 'CMS_QA_INVITE_ABANDON_FORBIDDEN' using errcode='42501';
  end if;

  select * into v_target from private.cms_qa_actor_leases lease
  where lease.actor_id=p_target_user_id for update;
  if not found
     or v_target.created_at<statement_timestamp()-interval '10 minutes'
     or exists(select 1 from public.cms_profiles profile where profile.user_id=p_target_user_id)
     or exists(select 1 from public.cms_user_roles role where role.user_id=p_target_user_id)
     or exists(select 1 from public.cms_scoped_role_assignments role where role.user_id=p_target_user_id) then
    raise exception 'CMS_QA_INVITE_ABANDON_UNSAFE' using errcode='42501';
  end if;

  delete from auth.sessions session where session.user_id=p_target_user_id;
  update auth.users identity
  set banned_until=greatest(
        coalesce(identity.banned_until,'-infinity'::timestamptz),
        clock_timestamp()+interval '100 years'
      ),
      updated_at=clock_timestamp()
  where identity.id=p_target_user_id;

  update private.cms_qa_actor_leases lease
  set status='expired',swept_at=clock_timestamp(),last_attempt_at=clock_timestamp(),
      last_error_code='invite_apply_failed'
  where lease.actor_id=p_target_user_id and lease.status='active';
  if not found then
    raise exception 'CMS_QA_INVITE_ABANDON_RACE' using errcode='40001';
  end if;

  insert into public.cms_audit_log(
    actor_id,action,target_type,target_id,event_data,correlation_id
  ) values(
    p_actor_id,'cms:qa.invite_abandoned','qa_actor',p_target_user_id::text,
    jsonb_build_object(
      'schemaVersion',1,'syntheticOnly',true,'environment',p_environment,
      'runTag',v_target.run_tag,'candidateSha',v_target.candidate_sha
    ),p_correlation_id
  );
  return jsonb_build_object('ok',true,'status','expired','userId',p_target_user_id);
end;
$$;

-- Direct PostgREST reads use the identical identity predicate. Corporate
-- audit visibility intentionally remains global for governance.
drop policy if exists cms_profiles_self_or_users_read on public.cms_profiles;
create policy cms_profiles_self_or_users_read on public.cms_profiles
for select to authenticated using(
  public.cms_user_target_session_read_allowed(user_id)
  and (user_id=auth.uid() or public.cms_has_permission('cms:users.read'))
);

drop policy if exists cms_user_roles_self_or_users_read on public.cms_user_roles;
create policy cms_user_roles_self_or_users_read on public.cms_user_roles
for select to authenticated using(
  public.cms_user_target_session_read_allowed(user_id)
  and (user_id=auth.uid() or public.cms_has_permission('cms:users.read'))
);

drop policy if exists cms_session_revocations_self_or_users_read on public.cms_session_revocations;
create policy cms_session_revocations_self_or_users_read on public.cms_session_revocations
for select to authenticated using(
  public.cms_user_target_session_read_allowed(user_id)
  and (user_id=auth.uid() or public.cms_has_permission('cms:users.read'))
);

drop policy if exists cms_login_events_self_or_audit_read on public.cms_login_events;
create policy cms_login_events_self_or_audit_read on public.cms_login_events
for select to authenticated using(
  public.cms_user_audit_session_read_allowed(user_id)
  and (user_id=auth.uid() or public.cms_has_permission('cms:audit.read'))
);

drop policy if exists cms_audit_authorized_read on public.cms_audit_log;
create policy cms_audit_authorized_read on public.cms_audit_log
for select to authenticated using(
  public.cms_has_permission('cms:audit.read')
  and public.cms_user_audit_session_read_allowed(actor_id)
);

-- Private primitives are never exposed through PostgREST.
revoke all on function private.cms_user_actor_context_active(uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_user_actor_target_scope_allowed(uuid,uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_user_actor_environment(uuid)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_user_audit_actor_scope_allowed(uuid,uuid)
  from public,anon,authenticated,service_role;

revoke all on function public.cms_user_target_session_read_allowed(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.cms_user_target_session_read_allowed(uuid)
  to authenticated;
revoke all on function public.cms_user_audit_session_read_allowed(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.cms_user_audit_session_read_allowed(uuid)
  to authenticated;

revoke all on function public.cms_user_target_read_allowed(uuid,uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function public.cms_users_list_scoped(uuid,text,text,text,timestamptz)
  from public,anon,authenticated,service_role;
revoke all on function public.cms_user_profile_scoped(uuid,uuid,text,text,text,timestamptz)
  from public,anon,authenticated,service_role;
revoke all on function public.cms_user_invite_context_scoped(uuid,text,text,text,timestamptz)
  from public,anon,authenticated,service_role;
revoke all on function public.cms_reserve_user_command_scoped(
  uuid,text,uuid,text,text,text,timestamptz,uuid,uuid
) from public,anon,authenticated,service_role;
revoke all on function public.cms_apply_user_command_scoped(
  uuid,text,uuid,text,text,text[],text,text,text,timestamptz,uuid,uuid
) from public,anon,authenticated,service_role;
revoke all on function public.cms_resolve_session_scoped(
  uuid,text,text,text,text,timestamptz,uuid
) from public,anon,authenticated,service_role;
revoke all on function public.cms_abandon_qa_invite_scoped(
  uuid,uuid,text,text,text,timestamptz,uuid
) from public,anon,authenticated,service_role;
revoke all on function public.cms_reserve_user_command(
  uuid,text,uuid,text,text,timestamptz,uuid,uuid
) from public,anon,authenticated,service_role;
revoke all on function public.cms_apply_user_command(
  uuid,text,uuid,text,text,text[],text,text,timestamptz,uuid,uuid
) from public,anon,authenticated,service_role;
revoke all on function public.cms_resolve_session(
  uuid,text,text,text,timestamptz,uuid
) from public,anon,authenticated,service_role;

grant execute on function public.cms_user_target_read_allowed(uuid,uuid,text)
  to service_role;
grant execute on function public.cms_users_list_scoped(uuid,text,text,text,timestamptz)
  to service_role;
grant execute on function public.cms_user_profile_scoped(uuid,uuid,text,text,text,timestamptz)
  to service_role;
grant execute on function public.cms_user_invite_context_scoped(uuid,text,text,text,timestamptz)
  to service_role;
grant execute on function public.cms_reserve_user_command_scoped(
  uuid,text,uuid,text,text,text,timestamptz,uuid,uuid
) to service_role;
grant execute on function public.cms_apply_user_command_scoped(
  uuid,text,uuid,text,text,text[],text,text,text,timestamptz,uuid,uuid
) to service_role;
grant execute on function public.cms_resolve_session_scoped(
  uuid,text,text,text,text,timestamptz,uuid
) to service_role;
grant execute on function public.cms_abandon_qa_invite_scoped(
  uuid,uuid,text,text,text,timestamptz,uuid
) to service_role;

-- Deployment probe: abort if any global command/session implementation remains
-- callable by the service role or if scoped wrappers lost their lease fences.
do $probe$
declare
  v_definition text;
begin
  if has_function_privilege('service_role',
       'public.cms_reserve_user_command_unscoped_0070(uuid,text,uuid,text,text,timestamp with time zone,uuid,uuid)',
       'EXECUTE')
     or has_function_privilege('service_role',
       'public.cms_apply_user_command_unscoped_0070(uuid,text,uuid,text,text,text[],text,text,timestamp with time zone,uuid,uuid)',
       'EXECUTE')
     or has_function_privilege('service_role',
       'public.cms_resolve_session_unscoped_0070(uuid,text,text,text,timestamp with time zone,uuid)',
       'EXECUTE') then
    raise exception 'CMS_USERS_UNSCOPED_RPC_EXPOSED' using errcode='55000';
  end if;
  if has_function_privilege('service_role',
       'public.cms_reserve_user_command(uuid,text,uuid,text,text,timestamp with time zone,uuid,uuid)',
       'EXECUTE')
     or has_function_privilege('service_role',
       'public.cms_apply_user_command(uuid,text,uuid,text,text,text[],text,text,timestamp with time zone,uuid,uuid)',
       'EXECUTE')
     or has_function_privilege('service_role',
       'public.cms_resolve_session(uuid,text,text,text,timestamp with time zone,uuid)',
       'EXECUTE') then
    raise exception 'CMS_USERS_COMPAT_RPC_EXPOSED' using errcode='55000';
  end if;

  select pg_get_functiondef(
    'public.cms_apply_user_command_scoped(uuid,text,uuid,text,text,text[],text,text,text,timestamp with time zone,uuid,uuid)'::regprocedure
  ) into v_definition;
  if position('cms_lock_active_qa_actor_leases' in v_definition)=0
     or position('cms_user_actor_target_scope_allowed' in v_definition)=0
     or position('cms-users:last-super' in v_definition)=0 then
    raise exception 'CMS_USERS_SCOPED_RPC_DRIFT' using errcode='55000';
  end if;

  select pg_get_functiondef(
    'public.cms_resolve_session_scoped(uuid,text,text,text,text,timestamp with time zone,uuid)'::regprocedure
  ) into v_definition;
  if position('cms_user_actor_context_active' in v_definition)=0
     or position('cms_lock_active_qa_actor_leases' in v_definition)=0 then
    raise exception 'CMS_SESSION_SCOPED_RPC_DRIFT' using errcode='55000';
  end if;
end;
$probe$;
