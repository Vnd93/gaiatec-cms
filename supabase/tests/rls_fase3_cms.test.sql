begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
create temp table fase3_test_results (seq integer not null, result text not null);
grant insert, select on fase3_test_results to authenticated;
insert into fase3_test_results values (0, plan(13));

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cms.super.synthetic@example.test', '', now(), '{}', '{}', now(), now()),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cms.editor.synthetic@example.test', '', now(), '{}', '{}', now(), now()),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cms.suspended.synthetic@example.test', '', now(), '{}', '{}', now(), now()),
  ('30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rdo.only.synthetic@example.test', '', now(), '{}', '{}', now(), now());

insert into public.cms_profiles (user_id, display_name, status, suspended_at)
values
  ('30000000-0000-0000-0000-000000000001', 'Super sintetico', 'active', null),
  ('30000000-0000-0000-0000-000000000002', 'Editor sintetico', 'active', null),
  ('30000000-0000-0000-0000-000000000003', 'Suspenso sintetico', 'suspended', now());

insert into public.cms_user_roles (user_id, role_key)
values
  ('30000000-0000-0000-0000-000000000001', 'super_admin'),
  ('30000000-0000-0000-0000-000000000002', 'editor'),
  ('30000000-0000-0000-0000-000000000003', 'admin');

insert into public.rdo_user_access (user_id, role, active)
values ('30000000-0000-0000-0000-000000000004', 'rdo_admin', true);

insert into public.cms_audit_log (actor_id, action, target_type, target_id)
values ('30000000-0000-0000-0000-000000000001', 'cms:users.invite', 'profile', 'synthetic');

insert into fase3_test_results
select 1, is(
  (
    select array_agg(role_key order by role_key)
    from public.cms_roles
    where role_key = any(array[
      'admin', 'auditor', 'commercial', 'designer', 'editor', 'marketing',
      'reviewer', 'site_pilot_manager', 'super_admin', 'support', 'technical'
    ])
  ),
  array[
    'admin', 'auditor', 'commercial', 'designer', 'editor', 'marketing',
    'reviewer', 'site_pilot_manager', 'super_admin', 'support', 'technical'
  ]::text[],
  'all required CMS roles are seeded'
);

insert into fase3_test_results
select 2, is(
  (select count(*)::integer from public.cms_permissions where permission_key not like 'cms:%'),
  0,
  'all permissions stay in the CMS scope'
);

set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub', '30000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'session_id', 'editor-session', 'aal', 'aal1', 'iat', extract(epoch from now())::bigint)::text, true);

insert into fase3_test_results
select 3, results_eq(
  'select count(*)::bigint from public.cms_profiles',
  array[1::bigint],
  'editor reads only the own profile'
);

insert into fase3_test_results
select 4, ok(public.cms_has_permission('cms:posts.edit'), 'editor can edit posts');

insert into fase3_test_results
select 5, isnt(public.cms_has_permission('cms:posts.publish'), true, 'editor cannot publish posts');

reset role;
insert into public.cms_session_revocations (session_id_hash, user_id, reason_code, expires_at)
values (
  encode(extensions.digest('editor-session', 'sha256'), 'hex'),
  '30000000-0000-0000-0000-000000000002',
  'security_test',
  now() + interval '1 hour'
);
set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub', '30000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'session_id', 'editor-session', 'aal', 'aal1', 'iat', extract(epoch from now())::bigint)::text, true);
insert into fase3_test_results
select 6, isnt(public.cms_current_session_is_valid(), true, 'revoked CMS session is rejected');

select set_config('request.jwt.claims', jsonb_build_object('sub', '30000000-0000-0000-0000-000000000004', 'role', 'authenticated', 'session_id', 'rdo-session', 'aal', 'aal1', 'iat', extract(epoch from now())::bigint)::text, true);
insert into fase3_test_results
select 7, results_eq(
  'select count(*)::bigint from public.cms_roles',
  array[0::bigint],
  'RDO admin receives no CMS scope'
);

select set_config('request.jwt.claims', jsonb_build_object('sub', '30000000-0000-0000-0000-000000000003', 'role', 'authenticated', 'session_id', 'suspended-session', 'aal', 'aal1', 'iat', extract(epoch from now())::bigint)::text, true);
insert into fase3_test_results
select 8, isnt(public.cms_user_is_active(), true, 'suspended CMS user is inactive');

insert into fase3_test_results
select 9, throws_ok(
  $$insert into public.cms_audit_log (actor_id, action, target_type) values (auth.uid(), 'cms:posts.edit', 'post')$$,
  '42501',
  null,
  'authenticated user cannot forge audit events'
);

select set_config('request.jwt.claims', jsonb_build_object('sub', '30000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'session_id', 'super-session', 'aal', 'aal2', 'iat', extract(epoch from now())::bigint)::text, true);
insert into fase3_test_results
select 10, results_eq(
  'select count(*)::bigint from public.cms_profiles',
  array[3::bigint],
  'super admin with MFA reads CMS profiles'
);

insert into fase3_test_results
select 11, results_eq(
  'select count(*)::bigint from public.cms_audit_log',
  array[1::bigint],
  'super admin with MFA reads immutable audit'
);

select set_config('request.jwt.claims', jsonb_build_object('sub', '30000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'session_id', 'super-session', 'aal', 'aal1', 'iat', extract(epoch from now())::bigint)::text, true);
insert into fase3_test_results
select 12, isnt(
  public.cms_has_permission('cms:users.manage'),
  true,
  'critical super admin permission requires MFA'
);

reset role;
insert into fase3_test_results
select 13, throws_ok(
  $$update public.cms_audit_log set target_id = 'mutated' where target_id = 'synthetic'$$,
  '42501',
  'CMS audit records are immutable',
  'audit rows cannot be changed even by privileged database code'
);

insert into fase3_test_results
select 14, result from finish() as result;
select result from fase3_test_results order by seq;
rollback;
