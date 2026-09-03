-- EV2.8 — RBAC escopado, delegação temporária e decisões de política.
-- A migration é aditiva. O RBAC legado permanece ativo enquanto ev2.rbac_scoped
-- estiver desligada; nenhuma identidade, concessão ou ativação real é criada.

insert into public.cms_permissions (permission_key, description, critical)
values
  ('cms:scopes.read', 'Consultar papéis e concessões dentro do site e ambiente autorizados.', false),
  ('cms:scopes.manage', 'Conceder ou revogar papéis escopados.', true),
  ('cms:policy_decisions.read', 'Consultar decisões de autorização escopadas.', true)
on conflict (permission_key) do nothing;

insert into public.cms_roles (role_key, name, description, mfa_required, system_role)
values
  ('auditor', 'Auditor', 'Leitura de acessos, decisões de política e trilhas imutáveis.', true, true),
  ('support', 'Suporte', 'Consulta de usuários e resposta controlada a incidentes de sessão.', true, true)
on conflict (role_key) do nothing;

insert into public.cms_role_permissions (role_key, permission_key)
values
  ('super_admin', 'cms:scopes.read'),
  ('super_admin', 'cms:scopes.manage'),
  ('super_admin', 'cms:policy_decisions.read'),
  ('admin', 'cms:scopes.read'),
  ('auditor', 'cms:users.read'),
  ('auditor', 'cms:roles.read'),
  ('auditor', 'cms:scopes.read'),
  ('auditor', 'cms:audit.read'),
  ('auditor', 'cms:policy_decisions.read'),
  ('auditor', 'cms:flags.read'),
  ('support', 'cms:users.read'),
  ('support', 'cms:roles.read'),
  ('support', 'cms:scopes.read'),
  ('support', 'cms:sessions.revoke'),
  ('support', 'cms:flags.read')
on conflict do nothing;

create table public.cms_scoped_role_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.cms_profiles (user_id) on delete restrict,
  role_key text not null references public.cms_roles (role_key) on delete restrict,
  site_key text not null default 'main' check (site_key = 'main'),
  environment text not null check (environment in ('local', 'staging', 'production')),
  grant_type text not null check (grant_type in ('direct', 'delegated')),
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  valid_from timestamptz not null default now(),
  expires_at timestamptz,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null,
  revocation_reason text check (
    revocation_reason is null or char_length(btrim(revocation_reason)) between 3 and 500
  ),
  lock_version bigint not null default 1 check (lock_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, role_key, site_key, environment),
  check (
    (grant_type = 'direct' and expires_at is null)
    or (
      grant_type = 'delegated'
      and expires_at is not null
      and expires_at > valid_from
      and expires_at <= granted_at + interval '30 days'
    )
  ),
  check (
    (revoked_at is null and revoked_by is null and revocation_reason is null)
    or (revoked_at is not null and revoked_by is not null and revocation_reason is not null)
  )
);

create table public.cms_policy_decisions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  permission_key text not null check (
    permission_key ~ '^cms:[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
  ),
  site_key text not null check (site_key = 'main'),
  environment text not null check (environment in ('local', 'staging', 'production')),
  decision text not null check (decision in ('allow', 'deny')),
  reason_code text not null check (reason_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  matched_role_key text references public.cms_roles (role_key) on delete set null,
  scope_source text not null check (scope_source in ('direct', 'delegated', 'legacy', 'none')),
  aal text not null check (aal in ('aal1', 'aal2')),
  session_id_hash text not null check (session_id_hash ~ '^[0-9a-f]{64}$'),
  target_type text check (target_type is null or target_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  target_id text check (target_id is null or char_length(target_id) between 1 and 200),
  correlation_id uuid not null,
  occurred_at timestamptz not null default now()
);

create table public.cms_scope_command_receipts (
  actor_id uuid not null references auth.users (id) on delete restrict,
  action text not null check (action in ('grant', 'revoke')),
  idempotency_key uuid not null,
  command_id uuid not null unique,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  target_user_id uuid references auth.users (id) on delete restrict,
  assignment_id uuid references public.cms_scoped_role_assignments (id) on delete restrict,
  correlation_id uuid not null,
  response jsonb check (response is null or jsonb_typeof(response) = 'object'),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (actor_id, action, idempotency_key)
);

create index cms_scoped_roles_effective_idx
  on public.cms_scoped_role_assignments (
    user_id,
    site_key,
    environment,
    revoked_at,
    valid_from,
    expires_at
  );
create index cms_scoped_roles_scope_idx
  on public.cms_scoped_role_assignments (site_key, environment, role_key, user_id);
create index cms_policy_decisions_actor_time_idx
  on public.cms_policy_decisions (actor_id, occurred_at desc);
create index cms_policy_decisions_scope_time_idx
  on public.cms_policy_decisions (site_key, environment, occurred_at desc);
create index cms_policy_decisions_denied_idx
  on public.cms_policy_decisions (occurred_at desc)
  where decision = 'deny';

create trigger cms_scoped_role_assignments_touch_updated_at
before update on public.cms_scoped_role_assignments
for each row execute function public.cms_touch_updated_at();

create trigger cms_policy_decisions_immutable
before update or delete on public.cms_policy_decisions
for each row execute function public.cms_reject_immutable_mutation();

create or replace function private.cms_rbac_scope_context(p_actor_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_flag public.cms_feature_flags%rowtype;
  v_user_count integer := 0;
  v_user_environment text;
  v_user_enabled boolean;
  v_broad_enabled boolean := false;
begin
  select * into v_flag
  from public.cms_feature_flags
  where flag_key = 'ev2.rbac_scoped'
    and (expires_at is null or expires_at > now());

  if not found or v_flag.kill_switch then
    return jsonb_build_object('mode', 'legacy', 'source', case when found then 'kill_switch' else 'unavailable' end);
  end if;

  select count(*), min(environment), bool_or(enabled)
  into v_user_count, v_user_environment, v_user_enabled
  from public.cms_feature_flag_overrides
  where flag_key = 'ev2.rbac_scoped'
    and scope_type = 'user'
    and scope_key = p_actor_id::text
    and starts_at <= now()
    and expires_at > now();

  select exists (
    select 1
    from public.cms_feature_flag_overrides
    where flag_key = 'ev2.rbac_scoped'
      and scope_type <> 'user'
      and enabled
      and starts_at <= now()
      and expires_at > now()
  ) into v_broad_enabled;

  if v_user_count > 1 then
    return jsonb_build_object('mode', 'deny', 'source', 'ambiguous_user_overrides');
  end if;

  if v_broad_enabled then
    return jsonb_build_object('mode', 'deny', 'source', 'broad_activation_not_supported');
  end if;

  if v_user_count = 1 and v_user_enabled and v_user_environment = 'production' then
    return jsonb_build_object('mode', 'deny', 'source', 'production_not_available');
  end if;

  if v_user_count = 1 and v_user_enabled then
    return jsonb_build_object(
      'mode', 'scoped',
      'source', 'user_override',
      'environment', v_user_environment,
      'siteKey', 'main'
    );
  end if;

  if v_flag.default_enabled then
    return jsonb_build_object('mode', 'deny', 'source', 'broad_activation_not_supported');
  end if;

  return jsonb_build_object('mode', 'legacy', 'source', case when v_user_count = 1 then 'user_override_off' else 'default' end);
end;
$$;

create or replace function private.cms_actor_session_valid(
  p_actor_id uuid,
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
    and char_length(p_session_id) between 1 and 200
    and p_issued_at is not null
    and p_issued_at <= now() + interval '5 minutes'
    and exists (
      select 1
      from public.cms_profiles profile
      where profile.user_id = p_actor_id
        and profile.status = 'active'
        and p_issued_at >= profile.sessions_valid_after
    )
    and not exists (
      select 1
      from public.cms_session_revocations revocation
      where revocation.session_id_hash = encode(extensions.digest(p_session_id, 'sha256'), 'hex')
        and revocation.expires_at > now()
    );
$$;

create or replace function private.cms_actor_authorization_result(
  p_actor_id uuid,
  p_permission text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_context jsonb;
  v_mode text;
  v_environment text;
  v_permission_critical boolean;
  v_role_key text;
  v_grant_type text;
  v_requires_mfa boolean := false;
begin
  if p_aal is null
     or p_aal not in ('aal1', 'aal2')
     or not private.cms_actor_session_valid(p_actor_id, p_session_id, p_issued_at) then
    return jsonb_build_object('allowed', false, 'reasonCode', 'session_invalid', 'scopeSource', 'none');
  end if;

  select permission.critical into v_permission_critical
  from public.cms_permissions permission
  where permission.permission_key = p_permission;
  if not found then
    return jsonb_build_object('allowed', false, 'reasonCode', 'permission_unknown', 'scopeSource', 'none');
  end if;

  v_context := private.cms_rbac_scope_context(p_actor_id);
  v_mode := v_context ->> 'mode';

  if v_mode = 'deny' then
    return jsonb_build_object('allowed', false, 'reasonCode', 'scope_context_ambiguous', 'scopeSource', 'none');
  end if;

  if v_mode = 'legacy' then
    select assignment.role_key into v_role_key
    from public.cms_user_roles assignment
    join public.cms_role_permissions role_permission on role_permission.role_key = assignment.role_key
    where assignment.user_id = p_actor_id
      and role_permission.permission_key = p_permission
    order by assignment.role_key
    limit 1;

    if v_role_key is null then
      return jsonb_build_object('allowed', false, 'reasonCode', 'permission_missing', 'scopeSource', 'legacy');
    end if;

    select v_permission_critical or exists (
      select 1
      from public.cms_user_roles assignment
      join public.cms_roles role on role.role_key = assignment.role_key
      where assignment.user_id = p_actor_id and role.mfa_required
    ) into v_requires_mfa;

    if v_requires_mfa and p_aal <> 'aal2' then
      return jsonb_build_object(
        'allowed', false,
        'reasonCode', 'mfa_required',
        'scopeSource', 'legacy',
        'roleKey', v_role_key
      );
    end if;

    return jsonb_build_object(
      'allowed', true,
      'reasonCode', 'allowed',
      'scopeSource', 'legacy',
      'roleKey', v_role_key
    );
  end if;

  v_environment := v_context ->> 'environment';
  select assignment.role_key, assignment.grant_type
  into v_role_key, v_grant_type
  from public.cms_scoped_role_assignments assignment
  join public.cms_role_permissions role_permission on role_permission.role_key = assignment.role_key
  where assignment.user_id = p_actor_id
    and assignment.site_key = 'main'
    and assignment.environment = v_environment
    and assignment.revoked_at is null
    and assignment.valid_from <= now()
    and (assignment.expires_at is null or assignment.expires_at > now())
    and role_permission.permission_key = p_permission
  order by case assignment.grant_type when 'direct' then 0 else 1 end, assignment.role_key
  limit 1;

  if v_role_key is null then
    if exists (
      select 1
      from public.cms_scoped_role_assignments assignment
      where assignment.user_id = p_actor_id
        and assignment.site_key = 'main'
        and assignment.environment = v_environment
        and assignment.revoked_at is null
        and assignment.valid_from <= now()
        and (assignment.expires_at is null or assignment.expires_at > now())
    ) then
      return jsonb_build_object(
        'allowed', false,
        'reasonCode', 'permission_missing',
        'scopeSource', 'none',
        'environment', v_environment,
        'siteKey', 'main'
      );
    end if;
    return jsonb_build_object(
      'allowed', false,
      'reasonCode', 'scope_missing',
      'scopeSource', 'none',
      'environment', v_environment,
      'siteKey', 'main'
    );
  end if;

  select v_permission_critical or exists (
    select 1
    from public.cms_scoped_role_assignments assignment
    join public.cms_roles role on role.role_key = assignment.role_key
    where assignment.user_id = p_actor_id
      and assignment.site_key = 'main'
      and assignment.environment = v_environment
      and assignment.revoked_at is null
      and assignment.valid_from <= now()
      and (assignment.expires_at is null or assignment.expires_at > now())
      and role.mfa_required
  ) into v_requires_mfa;

  if v_requires_mfa and p_aal <> 'aal2' then
    return jsonb_build_object(
      'allowed', false,
      'reasonCode', 'mfa_required',
      'scopeSource', v_grant_type,
      'roleKey', v_role_key,
      'environment', v_environment,
      'siteKey', 'main'
    );
  end if;

  return jsonb_build_object(
    'allowed', true,
    'reasonCode', 'allowed',
    'scopeSource', v_grant_type,
    'roleKey', v_role_key,
    'environment', v_environment,
    'siteKey', 'main'
  );
end;
$$;

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
set search_path = private, pg_temp
as $$
  select coalesce(
    (private.cms_actor_authorization_result(
      p_actor_id,
      p_permission,
      p_aal,
      p_session_id,
      p_issued_at
    ) ->> 'allowed')::boolean,
    false
  );
$$;

create or replace function private.cms_has_permission(requested_permission text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_session_id text := auth.jwt() ->> 'session_id';
  v_issued_raw text := auth.jwt() ->> 'iat';
  v_result jsonb;
begin
  if auth.uid() is null
     or v_session_id is null
     or coalesce(v_issued_raw, '') !~ '^[0-9]+$' then
    return false;
  end if;
  v_result := private.cms_actor_authorization_result(
    auth.uid(),
    requested_permission,
    case when auth.jwt() ->> 'aal' = 'aal2' then 'aal2' else 'aal1' end,
    v_session_id,
    to_timestamp(v_issued_raw::double precision)
  );
  return coalesce((v_result ->> 'allowed')::boolean, false);
end;
$$;

create function public.cms_rbac_scope_capability(
  p_actor_id uuid,
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
set search_path = public, private, pg_temp
as $$
declare
  v_context jsonb;
  v_enabled boolean := false;
  v_reason text;
begin
  if p_environment is null
     or p_environment not in ('local', 'staging', 'production')
     or p_site_key is distinct from 'main'
     or p_aal is null
     or p_aal not in ('aal1', 'aal2')
     or not private.cms_actor_session_valid(p_actor_id, p_session_id, p_issued_at) then
    return jsonb_build_object(
      'schemaVersion', 1,
      'key', 'ev2.rbac_scoped',
      'enabled', false,
      'source', 'unavailable',
      'reasonCode', 'session_or_scope_invalid',
      'evaluatedAt', now()
    );
  end if;

  v_context := private.cms_rbac_scope_context(p_actor_id);
  v_enabled := v_context ->> 'mode' = 'scoped'
    and v_context ->> 'environment' = p_environment
    and p_site_key = 'main';
  v_reason := case
    when v_enabled then 'enabled'
    when v_context ->> 'mode' = 'deny' then 'scope_context_ambiguous'
    when v_context ->> 'mode' = 'scoped' then 'scope_environment_mismatch'
    else 'feature_disabled'
  end;

  return jsonb_build_object(
    'schemaVersion', 1,
    'key', 'ev2.rbac_scoped',
    'enabled', v_enabled,
    'source', coalesce(v_context ->> 'source', 'unavailable'),
    'reasonCode', v_reason,
    'environment', p_environment,
    'siteKey', p_site_key,
    'evaluatedAt', now()
  );
end;
$$;

create function public.cms_resolve_scoped_access(
  p_actor_id uuid,
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
set search_path = public, private, pg_temp
as $$
declare
  v_capability jsonb;
  v_roles text[];
  v_permissions text[];
  v_requires_mfa boolean := false;
  v_effective_until timestamptz;
begin
  v_capability := public.cms_rbac_scope_capability(
    p_actor_id, p_environment, p_site_key, p_aal, p_session_id, p_issued_at
  );
  if coalesce((v_capability ->> 'enabled')::boolean, false) is not true then
    raise exception 'CMS_RBAC_SCOPED_DISABLED' using errcode = '42501';
  end if;

  select
    coalesce(array_agg(assignment.role_key order by assignment.role_key), array[]::text[]),
    min(assignment.expires_at) filter (where assignment.expires_at is not null)
  into v_roles, v_effective_until
  from public.cms_scoped_role_assignments assignment
  where assignment.user_id = p_actor_id
    and assignment.site_key = p_site_key
    and assignment.environment = p_environment
    and assignment.revoked_at is null
    and assignment.valid_from <= now()
    and (assignment.expires_at is null or assignment.expires_at > now());

  select coalesce(array_agg(distinct role_permission.permission_key order by role_permission.permission_key), array[]::text[])
  into v_permissions
  from public.cms_scoped_role_assignments assignment
  join public.cms_role_permissions role_permission on role_permission.role_key = assignment.role_key
  where assignment.user_id = p_actor_id
    and assignment.site_key = p_site_key
    and assignment.environment = p_environment
    and assignment.revoked_at is null
    and assignment.valid_from <= now()
    and (assignment.expires_at is null or assignment.expires_at > now());

  select exists (
    select 1
    from public.cms_scoped_role_assignments assignment
    join public.cms_roles role on role.role_key = assignment.role_key
    where assignment.user_id = p_actor_id
      and assignment.site_key = p_site_key
      and assignment.environment = p_environment
      and assignment.revoked_at is null
      and assignment.valid_from <= now()
      and (assignment.expires_at is null or assignment.expires_at > now())
      and role.mfa_required
  ) into v_requires_mfa;

  return jsonb_build_object(
    'rbacScoped', true,
    'roles', to_jsonb(v_roles),
    'permissions', to_jsonb(v_permissions),
    'mfaRequired', v_requires_mfa,
    'mfaVerified', p_aal = 'aal2',
    'accessGranted', cardinality(v_roles) > 0 and (not v_requires_mfa or p_aal = 'aal2'),
    'scope', jsonb_build_object(
      'siteKey', p_site_key,
      'environment', p_environment,
      'effectiveUntil', v_effective_until
    )
  );
end;
$$;

create function public.cms_evaluate_scoped_permission(
  p_actor_id uuid,
  p_permission text,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_target_type text,
  p_target_id text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_context jsonb;
  v_result jsonb;
  v_decision_id uuid;
  v_reason text;
  v_source text;
  v_allowed boolean;
begin
  if p_actor_id is null
     or p_environment is null
     or p_environment not in ('local', 'staging', 'production')
     or p_site_key is distinct from 'main'
     or p_permission is null
     or p_permission !~ '^cms:[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
     or p_aal is null
     or p_aal not in ('aal1', 'aal2')
     or p_session_id is null
     or char_length(p_session_id) not between 1 and 200
     or p_issued_at is null
     or p_correlation_id is null
     or (p_target_type is not null and p_target_type !~ '^[a-z][a-z0-9_]{1,63}$')
     or (p_target_id is not null and char_length(p_target_id) not between 1 and 200) then
    raise exception 'CMS_POLICY_INPUT_INVALID' using errcode = '22023';
  end if;

  v_context := private.cms_rbac_scope_context(p_actor_id);
  if v_context ->> 'mode' <> 'scoped' then
    v_result := jsonb_build_object(
      'allowed', false,
      'reasonCode', case when v_context ->> 'mode' = 'deny' then 'scope_context_ambiguous' else 'feature_disabled' end,
      'scopeSource', 'none'
    );
  elsif v_context ->> 'environment' <> p_environment then
    v_result := jsonb_build_object('allowed', false, 'reasonCode', 'scope_environment_mismatch', 'scopeSource', 'none');
  else
    v_result := private.cms_actor_authorization_result(
      p_actor_id, p_permission, p_aal, p_session_id, p_issued_at
    );
  end if;

  v_allowed := coalesce((v_result ->> 'allowed')::boolean, false);
  v_reason := coalesce(v_result ->> 'reasonCode', 'policy_unavailable');
  v_source := coalesce(v_result ->> 'scopeSource', 'none');

  insert into public.cms_policy_decisions (
    actor_id,
    permission_key,
    site_key,
    environment,
    decision,
    reason_code,
    matched_role_key,
    scope_source,
    aal,
    session_id_hash,
    target_type,
    target_id,
    correlation_id
  ) values (
    p_actor_id,
    p_permission,
    p_site_key,
    p_environment,
    case when v_allowed then 'allow' else 'deny' end,
    v_reason,
    nullif(v_result ->> 'roleKey', ''),
    case when v_source in ('direct', 'delegated', 'legacy') then v_source else 'none' end,
    p_aal,
    encode(extensions.digest(p_session_id, 'sha256'), 'hex'),
    p_target_type,
    p_target_id,
    p_correlation_id
  ) returning id into v_decision_id;

  return jsonb_build_object(
    'schemaVersion', 1,
    'decisionId', v_decision_id,
    'allowed', v_allowed,
    'reasonCode', v_reason,
    'roleKey', v_result ->> 'roleKey',
    'scopeSource', v_source,
    'environment', p_environment,
    'siteKey', p_site_key,
    'correlationId', p_correlation_id,
    'evaluatedAt', now()
  );
end;
$$;

create function public.cms_get_scoped_assignments(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_target_user_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_authorization jsonb;
  v_items jsonb;
  v_roles jsonb;
begin
  v_authorization := private.cms_actor_authorization_result(
    p_actor_id, 'cms:scopes.read', p_aal, p_session_id, p_issued_at
  );
  if coalesce((v_authorization ->> 'allowed')::boolean, false) is not true
     or coalesce(v_authorization ->> 'environment', '') is distinct from p_environment
     or coalesce(v_authorization ->> 'siteKey', '') is distinct from p_site_key
     or p_site_key is distinct from 'main' then
    raise exception 'CMS_SCOPE_FORBIDDEN' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', assignment.id,
    'userId', assignment.user_id,
    'displayName', profile.display_name,
    'roleKey', assignment.role_key,
    'siteKey', assignment.site_key,
    'environment', assignment.environment,
    'grantType', assignment.grant_type,
    'reason', assignment.reason,
    'validFrom', assignment.valid_from,
    'expiresAt', assignment.expires_at,
    'revokedAt', assignment.revoked_at,
    'revocationReason', assignment.revocation_reason,
    'lockVersion', assignment.lock_version,
    'effective', profile.status = 'active'
      and assignment.revoked_at is null
      and assignment.valid_from <= now()
      and (assignment.expires_at is null or assignment.expires_at > now()),
    'updatedAt', assignment.updated_at
  ) order by profile.display_name, assignment.role_key), '[]'::jsonb)
  into v_items
  from public.cms_scoped_role_assignments assignment
  join public.cms_profiles profile on profile.user_id = assignment.user_id
  where assignment.site_key = p_site_key
    and assignment.environment = p_environment
    and (p_target_user_id is null or assignment.user_id = p_target_user_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'roleKey', role.role_key,
    'name', role.name,
    'description', role.description,
    'mfaRequired', role.mfa_required,
    'permissions', coalesce((
      select jsonb_agg(role_permission.permission_key order by role_permission.permission_key)
      from public.cms_role_permissions role_permission
      where role_permission.role_key = role.role_key
    ), '[]'::jsonb)
  ) order by role.name), '[]'::jsonb)
  into v_roles
  from public.cms_roles role;

  return jsonb_build_object(
    'schemaVersion', 1,
    'items', v_items,
    'roles', v_roles,
    'environment', p_environment,
    'siteKey', p_site_key
  );
end;
$$;

create function public.cms_get_policy_decisions(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_authorization jsonb;
  v_items jsonb;
begin
  if p_limit not between 1 and 100 then
    raise exception 'CMS_POLICY_INPUT_INVALID' using errcode = '22023';
  end if;
  v_authorization := private.cms_actor_authorization_result(
    p_actor_id, 'cms:policy_decisions.read', p_aal, p_session_id, p_issued_at
  );
  if coalesce((v_authorization ->> 'allowed')::boolean, false) is not true
     or coalesce(v_authorization ->> 'environment', '') is distinct from p_environment
     or coalesce(v_authorization ->> 'siteKey', '') is distinct from p_site_key
     or p_site_key is distinct from 'main' then
    raise exception 'CMS_POLICY_FORBIDDEN' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(item.value order by item.occurred_at desc), '[]'::jsonb)
  into v_items
  from (
    select decision.occurred_at, jsonb_build_object(
      'id', decision.id,
      'actorId', decision.actor_id,
      'permissionKey', decision.permission_key,
      'decision', decision.decision,
      'reasonCode', decision.reason_code,
      'roleKey', decision.matched_role_key,
      'scopeSource', decision.scope_source,
      'aal', decision.aal,
      'targetType', decision.target_type,
      'targetId', decision.target_id,
      'correlationId', decision.correlation_id,
      'occurredAt', decision.occurred_at
    ) as value
    from public.cms_policy_decisions decision
    where decision.site_key = p_site_key
      and decision.environment = p_environment
    order by decision.occurred_at desc
    limit p_limit
  ) item;

  return jsonb_build_object(
    'schemaVersion', 1,
    'items', v_items,
    'environment', p_environment,
    'siteKey', p_site_key
  );
end;
$$;

create function public.cms_execute_scope_command(
  p_actor_id uuid,
  p_action text,
  p_payload jsonb,
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
set search_path = public, private, pg_temp
as $$
declare
  v_authorization jsonb;
  v_receipt public.cms_scope_command_receipts%rowtype;
  v_assignment public.cms_scoped_role_assignments%rowtype;
  v_target_user_id uuid;
  v_role_key text;
  v_grant_type text;
  v_reason text;
  v_expires_at timestamptz;
  v_expected_version bigint;
  v_before jsonb;
  v_response jsonb;
  v_other_supers integer;
begin
  if p_action is null
     or p_action not in ('grant', 'revoke')
     or p_environment is null
     or p_environment not in ('local', 'staging')
     or p_site_key is distinct from 'main'
     or p_command_id is null
     or p_idempotency_key is null
     or p_correlation_id is null
     or p_request_hash is null
     or p_request_hash !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'CMS_SCOPE_COMMAND_INVALID' using errcode = '22023';
  end if;

  v_authorization := private.cms_actor_authorization_result(
    p_actor_id, 'cms:scopes.manage', p_aal, p_session_id, p_issued_at
  );
  if coalesce((v_authorization ->> 'allowed')::boolean, false) is not true
     or coalesce(v_authorization ->> 'environment', '') is distinct from p_environment
     or coalesce(v_authorization ->> 'siteKey', '') is distinct from p_site_key then
    raise exception 'CMS_SCOPE_FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_receipt
  from public.cms_scope_command_receipts
  where actor_id = p_actor_id
    and action = p_action
    and idempotency_key = p_idempotency_key
  for update;
  if found then
    if v_receipt.request_hash <> p_request_hash then
      raise exception 'CMS_SCOPE_IDEMPOTENCY_CONFLICT' using errcode = 'PT409';
    end if;
    if v_receipt.response is null then
      raise exception 'CMS_SCOPE_COMMAND_IN_PROGRESS' using errcode = 'PT409';
    end if;
    return v_receipt.response || jsonb_build_object('duplicate', true);
  end if;

  begin
    v_target_user_id := (p_payload ->> 'targetUserId')::uuid;
    v_expected_version := nullif(p_payload ->> 'expectedVersion', '')::bigint;
    v_expires_at := nullif(p_payload ->> 'expiresAt', '')::timestamptz;
  exception when others then
    raise exception 'CMS_SCOPE_COMMAND_INVALID' using errcode = '22023';
  end;
  v_role_key := nullif(btrim(p_payload ->> 'roleKey'), '');
  v_grant_type := nullif(btrim(p_payload ->> 'grantType'), '');
  v_reason := nullif(btrim(p_payload ->> 'reason'), '');

  if v_target_user_id is null
     or v_role_key is null
     or v_reason is null
     or char_length(v_reason) not between 3 and 500
     or not exists (select 1 from public.cms_roles role where role.role_key = v_role_key)
     or not exists (
       select 1 from public.cms_profiles profile
       where profile.user_id = v_target_user_id and profile.status in ('invited', 'active')
     ) then
    raise exception 'CMS_SCOPE_COMMAND_INVALID' using errcode = '22023';
  end if;
  if v_target_user_id = p_actor_id then
    raise exception 'CMS_SCOPE_SELF_ELEVATION_DENIED' using errcode = 'PT409';
  end if;

  if v_role_key = 'super_admin' then
    perform pg_advisory_xact_lock(
      hashtextextended('cms:scoped-super:' || p_site_key || ':' || p_environment, 0)
    );
  end if;

  insert into public.cms_scope_command_receipts (
    actor_id,
    action,
    idempotency_key,
    command_id,
    request_hash,
    target_user_id,
    correlation_id
  ) values (
    p_actor_id,
    p_action,
    p_idempotency_key,
    p_command_id,
    p_request_hash,
    v_target_user_id,
    p_correlation_id
  ) on conflict do nothing;

  if not found then
    select * into v_receipt
    from public.cms_scope_command_receipts
    where actor_id = p_actor_id
      and action = p_action
      and idempotency_key = p_idempotency_key
    for update;
    if not found then
      raise exception 'CMS_SCOPE_COMMAND_CONFLICT' using errcode = 'PT409';
    end if;
    if v_receipt.request_hash <> p_request_hash then
      raise exception 'CMS_SCOPE_IDEMPOTENCY_CONFLICT' using errcode = 'PT409';
    end if;
    if v_receipt.response is null then
      raise exception 'CMS_SCOPE_COMMAND_IN_PROGRESS' using errcode = 'PT409';
    end if;
    return v_receipt.response || jsonb_build_object('duplicate', true);
  end if;

  select * into v_assignment
  from public.cms_scoped_role_assignments assignment
  where assignment.user_id = v_target_user_id
    and assignment.role_key = v_role_key
    and assignment.site_key = p_site_key
    and assignment.environment = p_environment
  for update;

  if p_action = 'grant' then
    if v_grant_type not in ('direct', 'delegated')
       or (v_grant_type = 'direct' and v_expires_at is not null)
       or (
         v_grant_type = 'delegated'
         and (
           v_role_key = 'super_admin'
           or v_expires_at is null
           or v_expires_at <= now()
           or v_expires_at > now() + interval '30 days'
         )
       ) then
      raise exception 'CMS_SCOPE_GRANT_INVALID' using errcode = '22023';
    end if;

    if found then
      v_before := to_jsonb(v_assignment);
      if v_assignment.revoked_at is null
         and v_assignment.valid_from <= now()
         and (v_assignment.expires_at is null or v_assignment.expires_at > now()) then
        raise exception 'CMS_SCOPE_ALREADY_ACTIVE' using errcode = 'PT409';
      end if;
      if v_expected_version is null or v_expected_version <> v_assignment.lock_version then
        raise exception 'CMS_SCOPE_CONFLICT' using errcode = 'PT409';
      end if;
      update public.cms_scoped_role_assignments
      set grant_type = v_grant_type,
        reason = v_reason,
        valid_from = now(),
        expires_at = v_expires_at,
        granted_by = p_actor_id,
        granted_at = now(),
        revoked_at = null,
        revoked_by = null,
        revocation_reason = null,
        lock_version = lock_version + 1
      where id = v_assignment.id
      returning * into v_assignment;
    else
      if v_expected_version is not null then
        raise exception 'CMS_SCOPE_CONFLICT' using errcode = 'PT409';
      end if;
      insert into public.cms_scoped_role_assignments (
        user_id,
        role_key,
        site_key,
        environment,
        grant_type,
        reason,
        valid_from,
        expires_at,
        granted_by
      ) values (
        v_target_user_id,
        v_role_key,
        p_site_key,
        p_environment,
        v_grant_type,
        v_reason,
        now(),
        v_expires_at,
        p_actor_id
      ) returning * into v_assignment;
    end if;
  else
    if not found
       or v_assignment.revoked_at is not null
       or v_assignment.valid_from > now()
       or (v_assignment.expires_at is not null and v_assignment.expires_at <= now()) then
      raise exception 'CMS_SCOPE_NOT_ACTIVE' using errcode = 'P0002';
    end if;
    if v_expected_version is null or v_expected_version <> v_assignment.lock_version then
      raise exception 'CMS_SCOPE_CONFLICT' using errcode = 'PT409';
    end if;
    v_before := to_jsonb(v_assignment);
    if v_assignment.role_key = 'super_admin' then
      select count(*) into v_other_supers
      from public.cms_scoped_role_assignments assignment
      join public.cms_profiles profile on profile.user_id = assignment.user_id
      where assignment.site_key = p_site_key
        and assignment.environment = p_environment
        and assignment.role_key = 'super_admin'
        and assignment.user_id <> v_target_user_id
        and assignment.revoked_at is null
        and assignment.valid_from <= now()
        and (assignment.expires_at is null or assignment.expires_at > now())
        and profile.status = 'active';
      if v_other_supers = 0 then
        raise exception 'CMS_SCOPE_LAST_SUPER_ADMIN' using errcode = 'PT409';
      end if;
    end if;
    update public.cms_scoped_role_assignments
    set revoked_at = now(),
      revoked_by = p_actor_id,
      revocation_reason = v_reason,
      lock_version = lock_version + 1
    where id = v_assignment.id
    returning * into v_assignment;
  end if;

  v_response := jsonb_build_object(
    'schemaVersion', 1,
    'commandId', p_command_id,
    'correlationId', p_correlation_id,
    'assignmentId', v_assignment.id,
    'userId', v_assignment.user_id,
    'roleKey', v_assignment.role_key,
    'siteKey', v_assignment.site_key,
    'environment', v_assignment.environment,
    'grantType', v_assignment.grant_type,
    'status', case when v_assignment.revoked_at is null then 'active' else 'revoked' end,
    'expiresAt', v_assignment.expires_at,
    'lockVersion', v_assignment.lock_version,
    'duplicate', false
  );

  update public.cms_scope_command_receipts
  set assignment_id = v_assignment.id,
    response = v_response,
    completed_at = now()
  where actor_id = p_actor_id
    and action = p_action
    and idempotency_key = p_idempotency_key;

  insert into public.cms_audit_log (
    actor_id,
    action,
    target_type,
    target_id,
    event_data,
    correlation_id
  ) values (
    p_actor_id,
    'cms:scopes.' || p_action,
    'scoped_role_assignment',
    v_assignment.id::text,
    jsonb_build_object(
      'siteKey', p_site_key,
      'environment', p_environment,
      'reason', v_reason,
      'before', v_before,
      'after', to_jsonb(v_assignment)
    ),
    p_correlation_id
  );

  return v_response;
end;
$$;

alter table public.cms_scoped_role_assignments enable row level security;
alter table public.cms_policy_decisions enable row level security;
alter table public.cms_scope_command_receipts enable row level security;

-- Sem policies para authenticated: leitura e escrita passam exclusivamente
-- pelas RPCs service-role, que aplicam escopo, sessão, MFA e trilha de decisão.
revoke all on table
  public.cms_scoped_role_assignments,
  public.cms_policy_decisions,
  public.cms_scope_command_receipts
from public, anon, authenticated;

grant all on table
  public.cms_scoped_role_assignments,
  public.cms_policy_decisions,
  public.cms_scope_command_receipts
to service_role;

revoke all on function private.cms_rbac_scope_context(uuid) from public, anon, authenticated;
revoke all on function private.cms_actor_session_valid(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function private.cms_actor_authorization_result(uuid, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function private.cms_has_permission(text) from public, anon;

revoke all on function public.cms_actor_authorized(uuid, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.cms_rbac_scope_capability(uuid, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.cms_resolve_scoped_access(uuid, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.cms_evaluate_scoped_permission(uuid, text, text, text, text, text, timestamptz, text, text, uuid) from public, anon, authenticated;
revoke all on function public.cms_get_scoped_assignments(uuid, text, text, text, text, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.cms_get_policy_decisions(uuid, text, text, text, text, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.cms_execute_scope_command(uuid, text, jsonb, text, text, text, text, timestamptz, uuid, uuid, text, uuid) from public, anon, authenticated;

grant execute on function public.cms_actor_authorized(uuid, text, text, text, timestamptz) to service_role;
grant execute on function public.cms_rbac_scope_capability(uuid, text, text, text, text, timestamptz) to service_role;
grant execute on function public.cms_resolve_scoped_access(uuid, text, text, text, text, timestamptz) to service_role;
grant execute on function public.cms_evaluate_scoped_permission(uuid, text, text, text, text, text, timestamptz, text, text, uuid) to service_role;
grant execute on function public.cms_get_scoped_assignments(uuid, text, text, text, text, timestamptz, uuid) to service_role;
grant execute on function public.cms_get_policy_decisions(uuid, text, text, text, text, timestamptz, integer) to service_role;
grant execute on function public.cms_execute_scope_command(uuid, text, jsonb, text, text, text, text, timestamptz, uuid, uuid, text, uuid) to service_role;
