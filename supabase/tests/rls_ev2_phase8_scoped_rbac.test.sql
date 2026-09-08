begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(52);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('48000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g8.operator@example.test', '', now(), '{}', '{}', now(), now()),
  ('48000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g8.user@example.test', '', now(), '{}', '{}', now(), now()),
  ('48000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g8.manager@example.test', '', now(), '{}', '{}', now(), now());

insert into public.cms_profiles(user_id, display_name, display_email, status)
values
  ('48000000-0000-4000-8000-000000000001', 'Operador G8', 'g8.operator@example.test', 'active'),
  ('48000000-0000-4000-8000-000000000002', 'Usuário G8', 'g8.user@example.test', 'active'),
  ('48000000-0000-4000-8000-000000000003', 'Gestor G8', 'g8.manager@example.test', 'active');

insert into public.cms_user_roles(user_id, role_key)
values
  ('48000000-0000-4000-8000-000000000001', 'super_admin'),
  ('48000000-0000-4000-8000-000000000002', 'editor'),
  ('48000000-0000-4000-8000-000000000003', 'admin');

-- A permissão temporária abaixo existe apenas dentro desta transação e permite
-- provar a proteção do último super admin por um segundo papel autorizado.
insert into public.cms_role_permissions(role_key, permission_key)
values('admin', 'cms:scopes.manage')
on conflict do nothing;

create function pg_temp.scope_command(
  p_action text,
  p_payload jsonb,
  p_actor_id uuid default '48000000-0000-4000-8000-000000000001',
  p_aal text default 'aal2',
  p_session_id text default 'g8-operator-session',
  p_command_id uuid default gen_random_uuid(),
  p_idempotency_key uuid default gen_random_uuid(),
  p_request_hash text default repeat('a', 64),
  p_correlation_id uuid default gen_random_uuid()
) returns jsonb language sql as $$
  select public.cms_execute_scope_command(
    p_actor_id, p_action, p_payload, 'local', 'main', p_aal, p_session_id,
    now() - interval '1 minute', p_command_id, p_idempotency_key,
    p_request_hash, p_correlation_id
  );
$$;

select is(
  (select count(*)::integer from pg_class where oid in (
    'public.cms_scoped_role_assignments'::regclass,
    'public.cms_policy_decisions'::regclass,
    'public.cms_scope_command_receipts'::regclass
  ) and relrowsecurity),
  3,
  'all EV2.8 tables enable RLS'
);
select isnt(has_table_privilege('anon', 'public.cms_scoped_role_assignments', 'SELECT'), true, 'anon cannot read scoped assignments');
select isnt(has_table_privilege('authenticated', 'public.cms_scoped_role_assignments', 'SELECT'), true, 'authenticated cannot directly read scoped assignments');
select isnt(has_table_privilege('authenticated', 'public.cms_scoped_role_assignments', 'INSERT'), true, 'authenticated cannot forge scoped assignments');
select isnt(
  has_function_privilege('authenticated', 'public.cms_execute_scope_command(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,uuid)', 'EXECUTE'),
  true,
  'authenticated cannot bypass the scope command boundary'
);
select isnt(
  has_function_privilege('authenticated', 'public.cms_evaluate_scoped_permission(uuid,text,text,text,text,text,timestamptz,text,text,uuid)', 'EXECUTE'),
  true,
  'authenticated cannot forge policy decisions'
);
select is(
  (select default_enabled from public.cms_feature_flags where flag_key = 'ev2.rbac_scoped'),
  false,
  'scoped RBAC remains disabled by default'
);
select is(
  public.cms_actor_authorized(
    '48000000-0000-4000-8000-000000000001', 'cms:scopes.manage', 'aal2',
    'g8-operator-session', now() - interval '1 minute'
  ),
  true,
  'legacy authorization is preserved while the flag is disabled'
);
select is(
  jsonb_array_length(public.cms_get_scoped_assignments(
    '48000000-0000-4000-8000-000000000001', 'local', 'main', 'aal2',
    'g8-operator-session', now() - interval '1 minute', null
  )->'items'),
  0,
  'a legacy super admin can bootstrap the empty scoped assignment catalog while the flag is disabled'
);

insert into public.cms_scoped_role_assignments(
  user_id, role_key, site_key, environment, grant_type, reason, valid_from, granted_by
) values
  ('48000000-0000-4000-8000-000000000001', 'super_admin', 'main', 'local', 'direct', 'Bootstrap sintético do operador G8', now() - interval '1 minute', '48000000-0000-4000-8000-000000000001'),
  ('48000000-0000-4000-8000-000000000003', 'admin', 'main', 'local', 'direct', 'Gestor sintético para teste de segregação G8', now() - interval '1 minute', '48000000-0000-4000-8000-000000000001');

insert into public.cms_feature_flag_overrides(
  flag_key, environment, scope_type, scope_key, enabled, reason,
  starts_at, expires_at, created_by
) values
  ('ev2.rbac_scoped', 'local', 'user', '48000000-0000-4000-8000-000000000001', true, 'Override individual do operador G8', now() - interval '1 minute', now() + interval '1 hour', '48000000-0000-4000-8000-000000000001'),
  ('ev2.rbac_scoped', 'local', 'user', '48000000-0000-4000-8000-000000000003', true, 'Override individual do gestor G8', now() - interval '1 minute', now() + interval '1 hour', '48000000-0000-4000-8000-000000000001');

select is(
  (public.cms_rbac_scope_capability(
    '48000000-0000-4000-8000-000000000001', 'local', 'main', 'aal2',
    'g8-operator-session', now() - interval '1 minute'
  )->>'enabled')::boolean,
  true,
  'the exact operator override enables scoped RBAC'
);
select is(
  (public.cms_rbac_scope_capability(
    '48000000-0000-4000-8000-000000000003', 'local', 'main', 'aal2',
    'g8-manager-session', now() - interval '1 minute'
  )->>'enabled')::boolean,
  true,
  'a second identity resolves only its own individual override'
);
select is(
  public.cms_actor_authorized(
    '48000000-0000-4000-8000-000000000001', 'cms:scopes.manage', 'aal2',
    'g8-operator-session', now() - interval '1 minute'
  ),
  true,
  'scoped super admin may manage scopes with AAL2'
);
select is(
  public.cms_actor_authorized(
    '48000000-0000-4000-8000-000000000001', 'cms:scopes.manage', 'aal1',
    'g8-operator-session', now() - interval '1 minute'
  ),
  false,
  'critical scoped permission rejects AAL1'
);
select is(
  (public.cms_rbac_scope_capability(
    '48000000-0000-4000-8000-000000000001', 'staging', 'main', 'aal2',
    'g8-operator-session', now() - interval '1 minute'
  )->>'enabled')::boolean,
  false,
  'an individual override cannot cross environments'
);

insert into public.cms_feature_flag_overrides(
  flag_key, environment, scope_type, scope_key, enabled, reason,
  starts_at, expires_at, created_by
) values (
  'ev2.rbac_scoped', 'local', 'site', 'g8-synthetic-site', true,
  'Ativação ampla sintética deve falhar fechada', now() - interval '1 minute',
  now() + interval '1 hour', '48000000-0000-4000-8000-000000000001'
);
select is(
  (public.cms_rbac_scope_capability(
    '48000000-0000-4000-8000-000000000001', 'local', 'main', 'aal2',
    'g8-operator-session', now() - interval '1 minute'
  )->>'enabled')::boolean,
  false,
  'a broad override fails closed'
);
select is(
  public.cms_actor_authorized(
    '48000000-0000-4000-8000-000000000001', 'cms:users.read', 'aal2',
    'g8-operator-session', now() - interval '1 minute'
  ),
  false,
  'central authorization also fails closed during broad activation'
);
delete from public.cms_feature_flag_overrides
where flag_key = 'ev2.rbac_scoped' and scope_type = 'site' and scope_key = 'g8-synthetic-site';
select is(
  (public.cms_rbac_scope_capability(
    '48000000-0000-4000-8000-000000000001', 'local', 'main', 'aal2',
    'g8-operator-session', now() - interval '1 minute'
  )->>'enabled')::boolean,
  true,
  'removing the unsafe override immediately restores the individual canary'
);
select is(
  public.cms_resolve_scoped_access(
    '48000000-0000-4000-8000-000000000001', 'local', 'main', 'aal2',
    'g8-operator-session', now() - interval '1 minute'
  )->'roles',
  '["super_admin"]'::jsonb,
  'session resolution returns only the effective scoped role'
);
select ok(
  jsonb_array_length(public.cms_get_scoped_assignments(
    '48000000-0000-4000-8000-000000000001', 'local', 'main', 'aal2',
    'g8-operator-session', now() - interval '1 minute', null
  )->'items') = 2
  and jsonb_array_length(public.cms_get_scoped_assignments(
    '48000000-0000-4000-8000-000000000001', 'local', 'main', 'aal2',
    'g8-operator-session', now() - interval '1 minute', null
  )->'roles') >= 9,
  'scope listing exposes assignments and the role catalog'
);

select is(
  pg_temp.scope_command(
    'grant',
    '{"targetUserId":"48000000-0000-4000-8000-000000000002","roleKey":"editor","grantType":"direct","expiresAt":null,"reason":"Concessão direta sintética G8"}'::jsonb,
    p_command_id => '48000000-0000-4000-8000-000000000101',
    p_idempotency_key => '48000000-0000-4000-8000-000000000102',
    p_request_hash => repeat('b', 64),
    p_correlation_id => '48000000-0000-4000-8000-000000000103'
  )->>'status',
  'active',
  'an authorized operator grants a direct role'
);
select is(
  (select count(*)::integer from public.cms_scoped_role_assignments
   where user_id = '48000000-0000-4000-8000-000000000002' and role_key = 'editor'),
  1,
  'the direct grant is stored once'
);
select ok(
  (select completed_at is not null and response is not null
   from public.cms_scope_command_receipts
   where command_id = '48000000-0000-4000-8000-000000000101'),
  'the command receipt is completed atomically'
);
select ok(
  (select event_data->'before' = 'null'::jsonb
      and event_data->'after'->>'role_key' = 'editor'
      and event_data->>'siteKey' = 'main'
      and event_data->>'environment' = 'local'
   from public.cms_audit_log
   where correlation_id = '48000000-0000-4000-8000-000000000103'),
  'the grant audit records before, after, actor and scope'
);
select is(
  (pg_temp.scope_command(
    'grant',
    '{"targetUserId":"48000000-0000-4000-8000-000000000002","roleKey":"editor","grantType":"direct","expiresAt":null,"reason":"Concessão direta sintética G8"}'::jsonb,
    p_command_id => '48000000-0000-4000-8000-000000000101',
    p_idempotency_key => '48000000-0000-4000-8000-000000000102',
    p_request_hash => repeat('b', 64),
    p_correlation_id => '48000000-0000-4000-8000-000000000103'
  )->>'duplicate')::boolean,
  true,
  'an identical command replays its receipt'
);
select is(
  (select count(*)::integer from public.cms_audit_log
   where correlation_id = '48000000-0000-4000-8000-000000000103'),
  1,
  'an idempotent replay never duplicates audit events'
);
select throws_ok(
  $$select pg_temp.scope_command(
    'grant',
    '{"targetUserId":"48000000-0000-4000-8000-000000000002","roleKey":"editor","grantType":"direct","expiresAt":null,"reason":"Payload divergente"}'::jsonb,
    p_idempotency_key => '48000000-0000-4000-8000-000000000102',
    p_request_hash => repeat('c', 64)
  )$$,
  'PT409', 'CMS_SCOPE_IDEMPOTENCY_CONFLICT',
  'an idempotency key cannot represent a different request'
);
select throws_ok(
  $$select pg_temp.scope_command(
    'grant',
    '{"targetUserId":"48000000-0000-4000-8000-000000000001","roleKey":"auditor","grantType":"direct","expiresAt":null,"reason":"Autoelevação sintética"}'::jsonb
  )$$,
  'PT409', 'CMS_SCOPE_SELF_ELEVATION_DENIED',
  'self elevation is denied'
);
select throws_ok(
  $$select pg_temp.scope_command(
    'grant',
    jsonb_build_object(
      'targetUserId', '48000000-0000-4000-8000-000000000002',
      'roleKey', 'super_admin', 'grantType', 'delegated',
      'expiresAt', now() + interval '1 hour', 'reason', 'Super admin temporário inválido'
    )
  )$$,
  '22023', 'CMS_SCOPE_GRANT_INVALID',
  'super admin cannot be delegated temporarily'
);
select throws_ok(
  $$select pg_temp.scope_command(
    'grant',
    jsonb_build_object(
      'targetUserId', '48000000-0000-4000-8000-000000000002',
      'roleKey', 'support', 'grantType', 'delegated',
      'expiresAt', now() + interval '31 days', 'reason', 'Delegação acima do limite'
    )
  )$$,
  '22023', 'CMS_SCOPE_GRANT_INVALID',
  'delegation cannot exceed thirty days'
);
select is(
  pg_temp.scope_command(
    'grant',
    jsonb_build_object(
      'targetUserId', '48000000-0000-4000-8000-000000000002',
      'roleKey', 'support', 'grantType', 'delegated',
      'expiresAt', now() + interval '1 hour', 'reason', 'Delegação temporária válida G8'
    ),
    p_request_hash => repeat('d', 64)
  )->>'grantType',
  'delegated',
  'a bounded temporary delegation is accepted'
);
select is(
  pg_temp.scope_command(
    'grant',
    '{"targetUserId":"48000000-0000-4000-8000-000000000002","roleKey":"auditor","grantType":"direct","expiresAt":null,"reason":"Concessão para teste de versão"}'::jsonb,
    p_request_hash => repeat('e', 64)
  )->>'status',
  'active',
  'a second direct role is independently granted'
);
select throws_ok(
  $$select pg_temp.scope_command(
    'revoke',
    '{"targetUserId":"48000000-0000-4000-8000-000000000002","roleKey":"auditor","reason":"Versão divergente","expectedVersion":99}'::jsonb,
    p_request_hash => repeat('f', 64)
  )$$,
  'PT409', 'CMS_SCOPE_CONFLICT',
  'a stale optimistic version is rejected'
);
select is(
  pg_temp.scope_command(
    'revoke',
    '{"targetUserId":"48000000-0000-4000-8000-000000000002","roleKey":"auditor","reason":"Revogação com versão correta","expectedVersion":1}'::jsonb,
    p_request_hash => repeat('1', 64)
  )->>'status',
  'revoked',
  'the current optimistic version permits revocation'
);
select throws_ok(
  $$select pg_temp.scope_command(
    'revoke',
    '{"targetUserId":"48000000-0000-4000-8000-000000000001","roleKey":"super_admin","reason":"Tentativa de remover último super","expectedVersion":1}'::jsonb,
    p_actor_id => '48000000-0000-4000-8000-000000000003',
    p_session_id => 'g8-manager-session',
    p_request_hash => repeat('2', 64)
  )$$,
  'PT409', 'CMS_SCOPE_LAST_SUPER_ADMIN',
  'the last scoped super admin is protected'
);

insert into public.cms_feature_flag_overrides(
  flag_key, environment, scope_type, scope_key, enabled, reason,
  starts_at, expires_at, created_by
) values (
  'ev2.rbac_scoped', 'local', 'user', '48000000-0000-4000-8000-000000000002', true,
  'Override individual do usuário G8', now() - interval '1 minute', now() + interval '1 hour',
  '48000000-0000-4000-8000-000000000001'
);
select is(
  public.cms_actor_authorized(
    '48000000-0000-4000-8000-000000000002', 'cms:products.edit', 'aal2',
    'g8-user-session', now() - interval '1 minute'
  ),
  true,
  'the scoped editor keeps its intended edit permission'
);
select is(
  public.cms_actor_authorized(
    '48000000-0000-4000-8000-000000000002', 'cms:products.publish', 'aal2',
    'g8-user-session', now() - interval '1 minute'
  ),
  false,
  'the scoped editor cannot publish by direct API'
);
select is(
  public.cms_actor_authorized(
    '48000000-0000-4000-8000-000000000002', 'cms:sessions.revoke', 'aal2',
    'g8-user-session', now() - interval '1 minute'
  ),
  true,
  'the active support delegation contributes its permission'
);
select is(
  public.cms_actor_authorized(
    '48000000-0000-4000-8000-000000000002', 'cms:sessions.revoke', 'aal1',
    'g8-user-session', now() - interval '1 minute'
  ),
  false,
  'a delegated critical permission still requires AAL2'
);

insert into public.cms_scoped_role_assignments(
  user_id, role_key, site_key, environment, grant_type, reason,
  valid_from, expires_at, granted_by, granted_at
) values (
  '48000000-0000-4000-8000-000000000002', 'technical', 'main', 'local', 'delegated',
  'Delegação sintética já expirada', now() - interval '2 days', now() - interval '1 day',
  '48000000-0000-4000-8000-000000000001', now() - interval '2 days'
);
select is(
  public.cms_actor_authorized(
    '48000000-0000-4000-8000-000000000002', 'cms:products.technical', 'aal2',
    'g8-user-session', now() - interval '1 minute'
  ),
  false,
  'an expired delegation contributes no permission'
);
select ok(
  (public.cms_resolve_scoped_access(
    '48000000-0000-4000-8000-000000000002', 'local', 'main', 'aal2',
    'g8-user-session', now() - interval '1 minute'
  )->'roles') ?& array['editor', 'support']
  and not (public.cms_resolve_scoped_access(
    '48000000-0000-4000-8000-000000000002', 'local', 'main', 'aal2',
    'g8-user-session', now() - interval '1 minute'
  )->'roles') ?| array['technical', 'auditor'],
  'session resolution excludes expired and revoked roles'
);

select is(
  (public.cms_evaluate_scoped_permission(
    '48000000-0000-4000-8000-000000000002', 'cms:synthetic_unknown.execute',
    'local', 'main', 'aal2', 'g8-user-session', now() - interval '1 minute',
    'administrative_screen', 'g8-negative', '48000000-0000-4000-8000-000000000201'
  )->>'reasonCode'),
  'permission_unknown',
  'an unknown permission is denied explicitly'
);
select is(
  (public.cms_evaluate_scoped_permission(
    '48000000-0000-4000-8000-000000000002', 'cms:products.publish',
    'local', 'main', 'aal2', 'g8-user-session', now() - interval '1 minute',
    'product', 'synthetic-g8', '48000000-0000-4000-8000-000000000202'
  )->>'decisionId') is not null,
  true,
  'a denied known permission produces a policy decision'
);
select is(
  (select count(*)::integer from public.cms_policy_decisions
   where actor_id = '48000000-0000-4000-8000-000000000002'),
  2,
  'every explicit evaluation is persisted once'
);
select ok(
  (select bool_and(session_id_hash <> 'g8-user-session' and session_id_hash ~ '^[0-9a-f]{64}$')
   from public.cms_policy_decisions
   where actor_id = '48000000-0000-4000-8000-000000000002'),
  'policy decisions store only the session hash'
);
select throws_ok(
  $$update public.cms_policy_decisions set reason_code = 'mutated' where actor_id = '48000000-0000-4000-8000-000000000002'$$,
  '42501', 'CMS audit records are immutable',
  'policy decisions are immutable'
);
select is(
  (select count(*)::integer from public.cms_audit_log
   where actor_id = '48000000-0000-4000-8000-000000000001'
     and action in ('cms:scopes.grant', 'cms:scopes.revoke')),
  4,
  'all four successful scope mutations have one audit event each'
);

do $$
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', '48000000-0000-4000-8000-000000000002',
      'role', 'authenticated',
      'session_id', 'g8-user-session',
      'aal', 'aal2',
      'iat', extract(epoch from now())::bigint
    )::text,
    true
  );
end;
$$;
set local role authenticated;
select is(public.cms_has_permission('cms:products.edit'), true, 'the public RLS helper resolves scoped permissions');
select is(public.cms_has_permission('cms:products.publish'), false, 'the public RLS helper denies missing scoped permissions');
select throws_ok(
  $$select * from public.cms_scoped_role_assignments$$,
  '42501', null,
  'authenticated SQL cannot read the private scope table directly'
);
select throws_ok(
  $$insert into public.cms_scoped_role_assignments(
      user_id, role_key, site_key, environment, grant_type, reason
    ) values (
      '48000000-0000-4000-8000-000000000002', 'reviewer', 'main', 'local', 'direct', 'Forjada'
    )$$,
  '42501', null,
  'authenticated SQL cannot insert a forged scope'
);
reset role;

insert into public.cms_session_revocations(session_id_hash, user_id, reason_code, expires_at)
values(
  encode(extensions.digest('g8-user-session', 'sha256'), 'hex'),
  '48000000-0000-4000-8000-000000000002', 'g8_security_test', now() + interval '1 hour'
);
select is(
  public.cms_actor_authorized(
    '48000000-0000-4000-8000-000000000002', 'cms:products.edit', 'aal2',
    'g8-user-session', now() - interval '1 minute'
  ),
  false,
  'a revoked session loses scoped authorization immediately'
);
select is(
  (select default_enabled from public.cms_feature_flags where flag_key = 'ev2.rbac_scoped'),
  false,
  'the complete test leaves the global flag default-off'
);

select * from finish();
rollback;
