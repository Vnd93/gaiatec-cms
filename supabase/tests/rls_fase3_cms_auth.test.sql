begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
create temp table cms_auth_test_results (seq integer not null, result text not null);
insert into cms_auth_test_results values (0, plan(16));

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('32000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cms.auth.super@example.test', '', now(), '{}', '{}', now(), now()),
  ('32000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cms.auth.editor@example.test', '', now(), '{}', '{}', now(), now()),
  ('32000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cms.auth.suspended@example.test', '', now(), '{}', '{}', now(), now()),
  ('32000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rdo.auth.only@example.test', '', now(), '{}', '{}', now(), now());

insert into public.cms_profiles (user_id, display_name, display_email, status, suspended_at)
values
  ('32000000-0000-0000-0000-000000000001', 'Super convidado', 'cms.auth.super@example.test', 'invited', null),
  ('32000000-0000-0000-0000-000000000002', 'Editor ativo', 'cms.auth.editor@example.test', 'active', null),
  ('32000000-0000-0000-0000-000000000003', 'Usuario suspenso', 'cms.auth.suspended@example.test', 'suspended', now());

insert into public.cms_user_roles (user_id, role_key)
values
  ('32000000-0000-0000-0000-000000000001', 'super_admin'),
  ('32000000-0000-0000-0000-000000000002', 'editor'),
  ('32000000-0000-0000-0000-000000000003', 'admin');

insert into cms_auth_test_results select 1, ok(
  exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'cms_login_events_session_event_uidx'),
  'CMS login events are unique per session and event'
);

insert into cms_auth_test_results select 2, isnt(
  has_function_privilege('anon', 'public.cms_resolve_session(uuid,text,text,text,timestamptz,uuid)', 'EXECUTE'),
  true,
  'anonymous users cannot resolve CMS sessions directly'
);

insert into cms_auth_test_results select 3, isnt(
  has_function_privilege('authenticated', 'public.cms_resolve_session(uuid,text,text,text,timestamptz,uuid)', 'EXECUTE'),
  true,
  'authenticated users cannot bypass the CMS session function'
);

insert into cms_auth_test_results select 4, throws_ok(
  $$select public.cms_resolve_session('32000000-0000-0000-0000-000000000004', 'login_success', 'aal1', 'rdo-only-session', now(), gen_random_uuid())$$,
  '42501',
  'CMS_PROFILE_NOT_ACTIVE',
  'RDO-only identity receives no CMS session'
);

insert into cms_auth_test_results select 5, throws_ok(
  $$select public.cms_resolve_session('32000000-0000-0000-0000-000000000003', 'login_success', 'aal1', 'suspended-session', now(), gen_random_uuid())$$,
  '42501',
  'CMS_PROFILE_NOT_ACTIVE',
  'suspended identity receives no CMS session'
);

insert into public.cms_session_revocations (session_id_hash, user_id, reason_code, expires_at)
values (encode(extensions.digest('revoked-editor-session', 'sha256'), 'hex'), '32000000-0000-0000-0000-000000000002', 'security_test', now() + interval '1 hour');

insert into cms_auth_test_results select 6, throws_ok(
  $$select public.cms_resolve_session('32000000-0000-0000-0000-000000000002', 'login_success', 'aal1', 'revoked-editor-session', now(), gen_random_uuid())$$,
  '42501',
  'CMS_SESSION_REVOKED',
  'revoked session cannot enter the CMS'
);

insert into cms_auth_test_results select 7, lives_ok(
  $$select public.cms_resolve_session('32000000-0000-0000-0000-000000000001', 'login_success', 'aal1', 'super-first-session', now(), '32000000-0000-0000-0000-000000000101')$$,
  'invited CMS identity can accept the invitation'
);

insert into cms_auth_test_results select 8, is(
  (select status from public.cms_profiles where user_id = '32000000-0000-0000-0000-000000000001'),
  'active',
  'accepted invitation activates the profile'
);

insert into cms_auth_test_results select 9, is(
  (public.cms_resolve_session('32000000-0000-0000-0000-000000000001', 'login_success', 'aal1', 'super-first-session', now(), gen_random_uuid()) ->> 'mfaRequired'),
  'true',
  'Super Admin session requires MFA'
);

insert into cms_auth_test_results select 10, is(
  (public.cms_resolve_session('32000000-0000-0000-0000-000000000001', 'login_success', 'aal1', 'super-first-session', now(), gen_random_uuid()) ->> 'accessGranted'),
  'false',
  'Super Admin at AAL1 cannot enter the administrative shell'
);

insert into cms_auth_test_results select 11, is(
  (public.cms_resolve_session('32000000-0000-0000-0000-000000000001', 'mfa_challenge', 'aal2', 'super-first-session', now(), gen_random_uuid()) ->> 'accessGranted'),
  'true',
  'Super Admin at AAL2 can enter the administrative shell'
);

insert into cms_auth_test_results select 12, ok(
  (select mfa_enrolled_at is not null from public.cms_profiles where user_id = '32000000-0000-0000-0000-000000000001'),
  'verified MFA enrollment is recorded'
);

insert into cms_auth_test_results select 13, is(
  (select count(*)::integer from public.cms_audit_log where action = 'cms:users.activate' and actor_id = '32000000-0000-0000-0000-000000000001'),
  1,
  'invitation activation appends one immutable audit event'
);

insert into cms_auth_test_results select 14, is(
  (select count(*)::integer from public.cms_login_events where user_id = '32000000-0000-0000-0000-000000000001' and event_type = 'login_success'),
  1,
  'repeated resolution does not duplicate the session login event'
);

insert into cms_auth_test_results select 15, is(
  (public.cms_resolve_session('32000000-0000-0000-0000-000000000002', 'login_success', 'aal1', 'editor-valid-session', now(), gen_random_uuid()) ->> 'accessGranted'),
  'true',
  'active editor can enter without mandatory MFA'
);

insert into cms_auth_test_results select 16, results_eq(
  $$select value #>> '{}' from jsonb_array_elements(public.cms_resolve_session('32000000-0000-0000-0000-000000000002', 'login_success', 'aal1', 'editor-valid-session', now(), gen_random_uuid()) -> 'roles') value order by 1$$,
  array['editor'::text],
  'session snapshot contains only assigned CMS roles'
);

insert into cms_auth_test_results select 17, result from finish() as result;
select result from cms_auth_test_results order by seq;
rollback;
