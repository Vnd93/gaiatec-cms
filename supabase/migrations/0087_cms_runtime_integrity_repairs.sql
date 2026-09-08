begin;

-- The original session resolver writes the immutable login event.  Compute the
-- complete MFA requirement there so the scoped wrapper never needs to mutate
-- audit evidence after insertion.
create or replace function private.cms_resolve_session_core_0087(
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
set search_path = pg_catalog, public, private, extensions, pg_temp
as $$
declare
  profile_status text;
  session_hash text;
  role_keys text[];
  permission_keys text[];
  requires_mfa boolean;
  access_granted boolean;
  activated boolean := false;
  scope_capability jsonb;
  scoped_access jsonb;
begin
  if p_user_id is null
     or p_event_type is null
     or p_event_type not in ('login_success', 'mfa_challenge', 'recovery', 'logout')
     or p_aal is null
     or p_aal not in ('aal1', 'aal2')
     or p_environment is null
     or p_environment not in ('local', 'staging', 'production')
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

  -- The global QA lock order is leases for the complete run before profile or
  -- scoped-assignment rows.  This also makes the owner-only compatibility path
  -- safe against concurrent terminal cleanup.
  perform private.cms_system_lock_actor_scope(p_user_id, p_environment);
  perform pg_advisory_xact_lock(hashtextextended(
    'cms:scoped-super:' || 'main' || ':' || p_environment, 0
  ));
  select profile.status into profile_status
  from public.cms_profiles profile
  where profile.user_id = p_user_id
  for update;

  if profile_status is null or profile_status = 'suspended' then
    raise exception 'CMS_PROFILE_NOT_ACTIVE' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.cms_profiles profile
    where profile.user_id = p_user_id and profile.sessions_valid_after > p_issued_at
  ) then
    raise exception 'CMS_SESSION_EXPIRED' using errcode = '42501';
  end if;

  session_hash := encode(extensions.digest(p_session_id, 'sha256'), 'hex');
  if exists (
    select 1 from public.cms_session_revocations revocation
    where revocation.session_id_hash = session_hash and revocation.expires_at > now()
  ) then
    raise exception 'CMS_SESSION_REVOKED' using errcode = '42501';
  end if;

  if profile_status = 'invited' and p_event_type in ('login_success', 'recovery') then
    update public.cms_profiles
    set status = 'active',
        last_sign_in_at = now(),
        last_seen_at = now(),
        mfa_enrolled_at = case
          when p_aal = 'aal2' then coalesce(mfa_enrolled_at, now())
          else mfa_enrolled_at
        end
    where user_id = p_user_id;
    profile_status := 'active';
    activated := true;

    insert into public.cms_audit_log (
      actor_id, action, target_type, target_id, correlation_id
    ) values (
      p_user_id, 'cms:users.activate', 'profile', p_user_id::text, p_correlation_id
    );
  elsif profile_status = 'active' then
    update public.cms_profiles
    set last_seen_at = now(),
        last_sign_in_at = case
          when p_event_type in ('login_success', 'recovery') then now()
          else last_sign_in_at
        end,
        mfa_enrolled_at = case
          when p_aal = 'aal2' then coalesce(mfa_enrolled_at, now())
          else mfa_enrolled_at
        end
    where user_id = p_user_id;
  else
    raise exception 'CMS_INVITE_NOT_ACCEPTED' using errcode = '42501';
  end if;

  scope_capability := public.cms_rbac_scope_capability(
    p_user_id, p_environment, 'main', p_aal, p_session_id, p_issued_at
  );
  if coalesce((scope_capability ->> 'enabled')::boolean, false) then
    -- Resolve the effective scoped grant before writing the sole immutable
    -- login event.  A later Edge merge must never be the first place that a
    -- scoped critical permission is seen.
    scoped_access := public.cms_resolve_scoped_access(
      p_user_id, p_environment, 'main', p_aal, p_session_id, p_issued_at
    );
    select coalesce(array_agg(entry.value order by entry.value), array[]::text[])
    into role_keys
    from jsonb_array_elements_text(
      coalesce(scoped_access -> 'roles', '[]'::jsonb)
    ) entry(value);
    select coalesce(array_agg(entry.value order by entry.value), array[]::text[])
    into permission_keys
    from jsonb_array_elements_text(
      coalesce(scoped_access -> 'permissions', '[]'::jsonb)
    ) entry(value);
    requires_mfa := coalesce(
      (scoped_access ->> 'mfaRequired')::boolean, false
    );
    access_granted := profile_status = 'active'
      and coalesce((scoped_access ->> 'accessGranted')::boolean, false);
  elsif scope_capability ->> 'reasonCode' = 'feature_disabled' then
    select coalesce(array_agg(role.role_key order by role.role_key), array[]::text[])
    into role_keys
    from public.cms_user_roles role
    where role.user_id = p_user_id;

    select exists (
      select 1
      from public.cms_user_roles assignment
      join public.cms_roles role on role.role_key = assignment.role_key
      where assignment.user_id = p_user_id and role.mfa_required
    ) or exists (
      select 1
      from public.cms_user_roles assignment
      join public.cms_role_permissions role_permission
        on role_permission.role_key = assignment.role_key
      join public.cms_permissions permission
        on permission.permission_key = role_permission.permission_key
      where assignment.user_id = p_user_id and permission.critical
    ) into requires_mfa;

    select coalesce(
      array_agg(distinct role_permission.permission_key order by role_permission.permission_key),
      array[]::text[]
    )
    into permission_keys
    from public.cms_user_roles assignment
    join public.cms_role_permissions role_permission
      on role_permission.role_key = assignment.role_key
    where assignment.user_id = p_user_id;

    access_granted := profile_status = 'active'
      and cardinality(role_keys) > 0
      and (not requires_mfa or p_aal = 'aal2');
  else
    -- Ambiguous, mismatched, or invalid scoped state is fail-closed.  The Edge
    -- boundary returns its generic policy error without contradicting the
    -- immutable database evidence.
    role_keys := array[]::text[];
    permission_keys := array[]::text[];
    requires_mfa := false;
    access_granted := false;
  end if;

  insert into public.cms_login_events (
    user_id, event_type, success, reason_code, mfa_verified,
    session_id_hash, correlation_id
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
    'activated', activated,
    'rbacScoped', coalesce(
      (scope_capability ->> 'enabled')::boolean, false
    ),
    'rbacScopeReasonCode', coalesce(
      scope_capability ->> 'reasonCode', 'session_or_scope_invalid'
    ),
    'scope', case
      when coalesce((scope_capability ->> 'enabled')::boolean, false)
        then scoped_access -> 'scope'
      else jsonb_build_object(
        'siteKey', 'main',
        'environment', p_environment,
        'effectiveUntil', null
      )
    end
  );
end;
$$;

-- Retain the owner-only historical symbol for SQL diagnostics.  Operational
-- callers use the scoped boundary below, which supplies the exact environment.
create or replace function public.cms_resolve_session_unscoped_0070(
  p_user_id uuid,
  p_event_type text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_correlation_id uuid
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select private.cms_resolve_session_core_0087(
    p_user_id,
    p_event_type,
    private.cms_user_actor_environment(p_user_id),
    p_aal,
    p_session_id,
    p_issued_at,
    p_correlation_id
  );
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
set search_path = pg_catalog, public, private, extensions, pg_temp
as $$
declare
  v_result jsonb;
begin
  if not private.cms_user_actor_context_active(p_user_id, p_environment) then
    raise exception 'CMS_SESSION_SCOPE_FORBIDDEN' using errcode = '42501';
  end if;
  perform private.cms_system_lock_actor_scope(p_user_id, p_environment);
  v_result := private.cms_resolve_session_core_0087(
    p_user_id, p_event_type, p_environment, p_aal, p_session_id,
    p_issued_at, p_correlation_id
  );

  -- Revoke CMS reuse before the provider sign-out result is known.  Audit rows
  -- remain append-only; this table is the dedicated revocation ledger.
  if p_event_type = 'logout' then
    insert into public.cms_session_revocations (
      session_id_hash, user_id, revoked_by, reason_code, revoked_at, expires_at
    ) values (
      encode(extensions.digest(p_session_id, 'sha256'), 'hex'),
      p_user_id,
      p_user_id,
      'self_logout',
      statement_timestamp(),
      statement_timestamp() + interval '100 years'
    )
    on conflict (session_id_hash) do update
      set expires_at = greatest(
        public.cms_session_revocations.expires_at,
        excluded.expires_at
      )
      where public.cms_session_revocations.user_id = excluded.user_id;
  end if;

  return v_result;
end;
$$;

-- Resolve roles, permissions, and MFA from one fenced assignment snapshot. The
-- Edge Function calls this RPC independently after session resolution, so it
-- must uphold the same evidence-grade consistency on its own.
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
  perform private.cms_system_lock_actor_scope(p_actor_id, p_environment);
  perform pg_advisory_xact_lock(hashtextextended(
    'cms:scoped-super:' || p_site_key || ':' || p_environment, 0
  ));
  v_capability := public.cms_rbac_scope_capability(
    p_actor_id, p_environment, p_site_key, p_aal, p_session_id, p_issued_at
  );
  if coalesce((v_capability ->> 'enabled')::boolean, false) is not true then
    raise exception 'CMS_RBAC_SCOPED_DISABLED' using errcode = '42501';
  end if;

  with effective_assignment as materialized (
    select assignment.id, assignment.role_key, assignment.expires_at
    from public.cms_scoped_role_assignments assignment
    where assignment.user_id = p_actor_id
      and assignment.site_key = p_site_key
      and assignment.environment = p_environment
      and assignment.revoked_at is null
      and assignment.valid_from <= statement_timestamp()
      and (
        assignment.expires_at is null
        or assignment.expires_at > statement_timestamp()
      )
      and private.cms_system_assignment_scope_allowed(
        p_actor_id, assignment.id, p_environment
      )
  )
  select
    coalesce((
      select array_agg(effective.role_key order by effective.role_key)
      from effective_assignment effective
    ), array[]::text[]),
    coalesce((
      select array_agg(distinct role_permission.permission_key
                       order by role_permission.permission_key)
      from effective_assignment effective
      join public.cms_role_permissions role_permission
        on role_permission.role_key = effective.role_key
    ), array[]::text[]),
    coalesce((
      select bool_or(role.mfa_required)
      from effective_assignment effective
      join public.cms_roles role on role.role_key = effective.role_key
    ), false) or coalesce((
      select bool_or(permission.critical)
      from effective_assignment effective
      join public.cms_role_permissions role_permission
        on role_permission.role_key = effective.role_key
      join public.cms_permissions permission
        on permission.permission_key = role_permission.permission_key
    ), false),
    (
      select min(effective.expires_at)
      from effective_assignment effective
      where effective.expires_at is not null
    )
  into v_roles, v_permissions, v_requires_mfa, v_effective_until;

  return jsonb_build_object(
    'rbacScoped', true,
    'roles', to_jsonb(v_roles),
    'permissions', to_jsonb(v_permissions),
    'mfaRequired', v_requires_mfa,
    'mfaVerified', p_aal = 'aal2',
    'accessGranted', cardinality(v_roles) > 0
      and (not v_requires_mfa or p_aal = 'aal2'),
    'scope', jsonb_build_object(
      'siteKey', p_site_key,
      'environment', p_environment,
      'effectiveUntil', v_effective_until
    )
  );
end;
$$;

-- The authoritative visual wrappers must retain the original command boundary:
-- validate non-sensitive shape, then require AAL2, then resolve feature scope.
create or replace function public.cms_execute_visual_command(
  p_actor_id uuid,
  p_action text,
  p_branch_id uuid,
  p_item_id uuid,
  p_payload jsonb,
  p_expected_version bigint,
  p_expected_draft_version bigint,
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
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_permission text;
  v_previous_actor text := current_setting('cms.qa_mutation_actor_id', true);
  v_result jsonb;
begin
  if p_actor_id is null
     or p_action is null
     or p_action not in (
       'create_branch', 'save_document', 'snapshot',
       'create_symbol', 'apply_to_draft', 'abandon'
     )
     or p_environment is null
     or p_environment not in ('local', 'staging')
     or p_site_key is distinct from 'main'
     or p_command_id is null
     or p_idempotency_key is null
     or p_correlation_id is null
     or coalesce(p_request_hash, '') !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) is distinct from 'object' then
    raise exception 'CMS_VISUAL_COMMAND_INVALID' using errcode = '22023';
  end if;
  if p_aal is distinct from 'aal2' then
    raise exception 'CMS_VISUAL_MFA_REQUIRED' using errcode = '42501';
  end if;

  v_permission := case p_action
    when 'create_branch' then 'cms:visual.branch'
    when 'save_document' then 'cms:visual.edit'
    when 'snapshot' then 'cms:visual.snapshot'
    when 'create_symbol' then 'cms:visual.symbols'
    when 'apply_to_draft' then 'cms:visual.apply'
    when 'abandon' then 'cms:visual.branch'
  end;
  perform private.cms_visual_assert_available(
    p_actor_id, v_permission, p_environment, p_site_key,
    p_aal, p_session_id, p_issued_at
  );
  perform private.cms_visual_guard_command(
    p_actor_id, p_action, p_branch_id, p_item_id, p_payload,
    p_environment, p_site_key
  );
  perform set_config('cms.qa_mutation_actor_id', p_actor_id::text, true);
  v_result := public.cms_execute_visual_command_unscoped_0074(
    p_actor_id, p_action, p_branch_id, p_item_id, p_payload,
    p_expected_version, p_expected_draft_version, p_environment, p_site_key,
    p_aal, p_session_id, p_issued_at, p_command_id, p_idempotency_key,
    p_request_hash, p_correlation_id
  );
  perform set_config(
    'cms.qa_mutation_actor_id', coalesce(v_previous_actor, ''), true
  );
  return v_result;
exception when others then
  perform set_config(
    'cms.qa_mutation_actor_id', coalesce(v_previous_actor, ''), true
  );
  raise;
end;
$$;

create or replace function public.cms_execute_site_command(
  p_actor_id uuid,
  p_action text,
  p_target_site_key text,
  p_payload jsonb,
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
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_previous_actor text := current_setting('cms.qa_mutation_actor_id', true);
  v_result jsonb;
begin
  if p_actor_id is null
     or p_action is null
     or p_action not in (
       'create_candidate', 'add_domain', 'update_tokens', 'suspend_candidate'
     )
     or p_environment is null
     or p_environment not in ('local', 'staging')
     or p_site_key is distinct from 'main'
     or coalesce(p_target_site_key, '') !~ '^g9x-[a-z0-9]+(?:-[a-z0-9]+)*$'
     or p_command_id is null
     or p_idempotency_key is null
     or p_correlation_id is null
     or coalesce(p_request_hash, '') !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) is distinct from 'object' then
    raise exception 'CMS_SITES_COMMAND_INVALID' using errcode = '22023';
  end if;
  if p_aal is distinct from 'aal2' then
    raise exception 'CMS_SITES_MFA_REQUIRED' using errcode = '42501';
  end if;

  perform private.cms_sites_assert_available(
    p_actor_id, 'cms:sites.manage', p_environment, p_site_key,
    p_aal, p_session_id, p_issued_at
  );
  perform private.cms_visual_guard_site_command(
    p_actor_id, p_action, p_target_site_key, p_environment, p_site_key
  );
  perform set_config('cms.qa_mutation_actor_id', p_actor_id::text, true);
  v_result := public.cms_execute_site_command_unscoped_0074(
    p_actor_id, p_action, p_target_site_key, p_payload, p_expected_version,
    p_environment, p_site_key, p_aal, p_session_id, p_issued_at,
    p_command_id, p_idempotency_key, p_request_hash, p_correlation_id
  );
  perform set_config(
    'cms.qa_mutation_actor_id', coalesce(v_previous_actor, ''), true
  );
  return v_result;
exception when others then
  perform set_config(
    'cms.qa_mutation_actor_id', coalesce(v_previous_actor, ''), true
  );
  raise;
end;
$$;

-- Collaboration/release/bulk cleanup is a trigger nested inside the lease
-- transition.  Restore the caller's mutation context on both success and error
-- so a terminalized actor cannot taint later work in the same transaction.
do $repair$
declare
  v_definition text;
  v_after text;
  v_source text;
  v_after_source text;
  v_security_definer boolean;
  v_language text;
  v_config text[];
  v_declaration_target text := $target$  v_rows integer := 0;
begin$target$;
  v_declaration_replacement text := $replacement$  v_rows integer := 0;
  v_previous_actor text := current_setting('cms.qa_mutation_actor_id', true);
begin$replacement$;
  v_return_target text := $target$  return new;
end;$target$;
  v_return_replacement text := $replacement$  perform set_config(
    'cms.qa_mutation_actor_id', coalesce(v_previous_actor, ''), true
  );
  return new;
exception when others then
  perform set_config(
    'cms.qa_mutation_actor_id', coalesce(v_previous_actor, ''), true
  );
  raise;
end;$replacement$;
begin
  select replace(replace(
           pg_get_functiondef(proc_row.oid), E'\r\n', E'\n'
         ), E'\r', E'\n'),
         replace(replace(proc_row.prosrc, E'\r\n', E'\n'), E'\r', E'\n'),
         proc_row.prosecdef, lang_row.lanname, proc_row.proconfig
  into v_definition, v_source, v_security_definer, v_language, v_config
  from pg_proc proc_row
  join pg_language lang_row on lang_row.oid = proc_row.prolang
  where proc_row.oid = 'private.cms_crb_terminalize_qa_graph()'::regprocedure;

  if not v_security_definer
     or v_language <> 'plpgsql'
     or not coalesce(
       'search_path=pg_catalog, public, private, pg_temp' = any(v_config), false
     ) then
    raise exception 'CMS_QA_CRB_CONTEXT_ATTRIBUTES_DRIFT' using errcode = 'P0001';
  end if;
  if encode(extensions.digest(convert_to(v_source, 'UTF8'), 'sha256'), 'hex')
       <> '42cf04573ac27b48140b96b7dd4706b1ceee61838dc44983ebe7089e6d0afc4d' then
    raise exception 'CMS_QA_CRB_CONTEXT_SOURCE_DRIFT' using errcode = 'P0001';
  end if;
  if (length(v_definition) - length(replace(
       v_definition, v_declaration_target, ''
     ))) / length(v_declaration_target) <> 1 then
    raise exception 'CMS_QA_CRB_CONTEXT_DECLARATION_DRIFT' using errcode = 'P0001';
  end if;
  if (length(v_definition) - length(replace(
       v_definition, v_return_target, ''
     ))) / length(v_return_target) <> 1 then
    raise exception 'CMS_QA_CRB_CONTEXT_RESTORE_DRIFT' using errcode = 'P0001';
  end if;

  v_definition := replace(
    v_definition, v_declaration_target, v_declaration_replacement
  );
  v_definition := replace(
    v_definition, v_return_target, v_return_replacement
  );
  if (length(v_definition) - length(replace(
       v_definition, v_return_replacement, ''
     ))) / length(v_return_replacement) <> 1 then
    raise exception 'CMS_QA_CRB_CONTEXT_POSTCONDITION_FAILED' using errcode = 'P0001';
  end if;
  execute v_definition;

  select replace(replace(
           pg_get_functiondef(proc_row.oid), E'\r\n', E'\n'
         ), E'\r', E'\n'),
         replace(replace(proc_row.prosrc, E'\r\n', E'\n'), E'\r', E'\n'),
         proc_row.prosecdef, lang_row.lanname, proc_row.proconfig
  into v_after, v_after_source, v_security_definer, v_language, v_config
  from pg_proc proc_row
  join pg_language lang_row on lang_row.oid = proc_row.prolang
  where proc_row.oid = 'private.cms_crb_terminalize_qa_graph()'::regprocedure;
  if (length(v_after) - length(replace(
       v_after, v_return_replacement, ''
     ))) / length(v_return_replacement) <> 1
     or not v_security_definer
     or v_language <> 'plpgsql'
     or not coalesce(
       'search_path=pg_catalog, public, private, pg_temp' = any(v_config), false
     )
     or encode(extensions.digest(
       convert_to(v_after_source, 'UTF8'), 'sha256'
     ), 'hex')
       <> 'fbe2c71fb695023b953a871c5f132e2dcf6b65a78265eb27441bda8cf1ef038f' then
    raise exception 'CMS_QA_CRB_CONTEXT_POSTCONDITION_FAILED' using errcode = 'P0001';
  end if;
end;
$repair$;

revoke all on function private.cms_resolve_session_core_0087(
  uuid, text, text, text, text, timestamptz, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.cms_resolve_session_unscoped_0070(
  uuid, text, text, text, timestamptz, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.cms_resolve_session_scoped(
  uuid, text, text, text, text, timestamptz, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.cms_resolve_session_scoped(
  uuid, text, text, text, text, timestamptz, uuid
) to service_role;
revoke all on function public.cms_resolve_scoped_access(
  uuid, text, text, text, text, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.cms_resolve_scoped_access(
  uuid, text, text, text, text, timestamptz
) to service_role;

revoke all on function public.cms_execute_visual_command(
  uuid, text, uuid, uuid, jsonb, bigint, bigint, text, text, text, text,
  timestamptz, uuid, uuid, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.cms_execute_visual_command(
  uuid, text, uuid, uuid, jsonb, bigint, bigint, text, text, text, text,
  timestamptz, uuid, uuid, text, uuid
) to service_role;

revoke all on function public.cms_execute_site_command(
  uuid, text, text, jsonb, bigint, text, text, text, text, timestamptz,
  uuid, uuid, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.cms_execute_site_command(
  uuid, text, text, jsonb, bigint, text, text, text, text, timestamptz,
  uuid, uuid, text, uuid
) to service_role;

revoke all on function private.cms_crb_terminalize_qa_graph()
  from public, anon, authenticated, service_role;

commit;
