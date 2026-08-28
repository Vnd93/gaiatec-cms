begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
create temp table cms_command_test_results (seq integer not null, result text not null);
insert into cms_command_test_results values (0, plan(17));

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('31000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cms.command.super@example.test', '', now(), '{}', '{}', now(), now()),
  ('31000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cms.command.editor@example.test', '', now(), '{}', '{}', now(), now()),
  ('31000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cms.command.target@example.test', '', now(), '{}', '{}', now(), now());

insert into public.cms_profiles (user_id, display_name, display_email, status)
values
  ('31000000-0000-0000-0000-000000000001', 'Super comando', 'cms.command.super@example.test', 'active'),
  ('31000000-0000-0000-0000-000000000002', 'Editor comando', 'cms.command.editor@example.test', 'active');

insert into public.cms_user_roles (user_id, role_key)
values
  ('31000000-0000-0000-0000-000000000001', 'super_admin'),
  ('31000000-0000-0000-0000-000000000002', 'editor');

insert into cms_command_test_results select 1, ok(
  (select relrowsecurity from pg_class where oid = 'public.cms_command_receipts'::regclass),
  'CMS command receipts have RLS enabled'
);

insert into cms_command_test_results select 2, isnt(
  has_function_privilege('anon', 'public.cms_apply_user_command(uuid,text,uuid,text,text,text[],text,text,timestamptz,uuid,uuid)', 'EXECUTE'),
  true,
  'anonymous users cannot execute CMS commands'
);

insert into cms_command_test_results select 3, isnt(
  has_function_privilege('authenticated', 'public.cms_apply_user_command(uuid,text,uuid,text,text,text[],text,text,timestamptz,uuid,uuid)', 'EXECUTE'),
  true,
  'authenticated users cannot execute CMS commands directly'
);

insert into cms_command_test_results select 4, throws_ok(
  $$select public.cms_apply_user_command(
    '31000000-0000-0000-0000-000000000002', 'invite', '31000000-0000-0000-0000-000000000003',
    'Alvo comando', 'cms.command.target@example.test', array['editor'], 'aal1', 'editor-session', now() - interval '1 minute',
    '31000000-0000-0000-0000-000000000101', '31000000-0000-0000-0000-000000000201'
  )$$,
  '42501',
  'CMS_COMMAND_FORBIDDEN',
  'editor cannot invite CMS users'
);

insert into cms_command_test_results select 5, throws_ok(
  $$select public.cms_apply_user_command(
    '31000000-0000-0000-0000-000000000001', 'invite', '31000000-0000-0000-0000-000000000003',
    'Alvo comando', 'cms.command.target@example.test', array['editor'], 'aal1', 'super-session', now() - interval '1 minute',
    '31000000-0000-0000-0000-000000000102', '31000000-0000-0000-0000-000000000202'
  )$$,
  '42501',
  'CMS_COMMAND_FORBIDDEN',
  'critical CMS command requires MFA'
);

insert into cms_command_test_results select 6, lives_ok(
  $$select public.cms_apply_user_command(
    '31000000-0000-0000-0000-000000000001', 'invite', '31000000-0000-0000-0000-000000000003',
    'Alvo comando', 'cms.command.target@example.test', array['editor'], 'aal2', 'super-session', now() - interval '1 minute',
    '31000000-0000-0000-0000-000000000103', '31000000-0000-0000-0000-000000000203'
  )$$,
  'super admin with MFA can apply a closed invite'
);

insert into cms_command_test_results select 7, is(
  (select status from public.cms_profiles where user_id = '31000000-0000-0000-0000-000000000003'),
  'invited',
  'closed invite creates an invited CMS profile'
);

insert into cms_command_test_results select 8, results_eq(
  $$select role_key from public.cms_user_roles where user_id = '31000000-0000-0000-0000-000000000003' order by role_key$$,
  array['editor'::text],
  'closed invite assigns only requested roles'
);

insert into cms_command_test_results select 9, is(
  (public.cms_apply_user_command(
    '31000000-0000-0000-0000-000000000001', 'invite', '31000000-0000-0000-0000-000000000003',
    'Alvo comando', 'cms.command.target@example.test', array['editor'], 'aal2', 'super-session', now() - interval '1 minute',
    '31000000-0000-0000-0000-000000000103', '31000000-0000-0000-0000-000000000203'
  ) ->> 'duplicate'),
  'true',
  'duplicate CMS command returns its stored response'
);

insert into cms_command_test_results select 10, throws_ok(
  $$select public.cms_apply_user_command(
    '31000000-0000-0000-0000-000000000001', 'set_roles', '31000000-0000-0000-0000-000000000001',
    null, null, array['admin'], 'aal2', 'super-session', now() - interval '1 minute',
    '31000000-0000-0000-0000-000000000104', '31000000-0000-0000-0000-000000000204'
  )$$,
  '42501',
  'CMS_SELF_ROLE_CHANGE_DENIED',
  'administrator cannot change own roles'
);

insert into cms_command_test_results select 11, lives_ok(
  $$select public.cms_apply_user_command(
    '31000000-0000-0000-0000-000000000001', 'suspend', '31000000-0000-0000-0000-000000000003',
    null, null, array[]::text[], 'aal2', 'super-session', now() - interval '1 minute',
    '31000000-0000-0000-0000-000000000105', '31000000-0000-0000-0000-000000000205'
  )$$,
  'super admin can suspend another CMS user'
);

insert into cms_command_test_results select 12, is(
  (select status from public.cms_profiles where user_id = '31000000-0000-0000-0000-000000000003'),
  'suspended',
  'suspension is persisted in the CMS profile'
);

insert into cms_command_test_results select 13, lives_ok(
  $$select public.cms_apply_user_command(
    '31000000-0000-0000-0000-000000000001', 'reactivate', '31000000-0000-0000-0000-000000000003',
    null, null, array[]::text[], 'aal2', 'super-session', now() - interval '1 minute',
    '31000000-0000-0000-0000-000000000106', '31000000-0000-0000-0000-000000000206'
  )$$,
  'super admin can reactivate another CMS user'
);

insert into cms_command_test_results select 14, lives_ok(
  $$select public.cms_apply_user_command(
    '31000000-0000-0000-0000-000000000001', 'revoke_sessions', '31000000-0000-0000-0000-000000000003',
    null, null, array[]::text[], 'aal2', 'super-session', now() - interval '1 minute',
    '31000000-0000-0000-0000-000000000107', '31000000-0000-0000-0000-000000000207'
  )$$,
  'super admin can revoke another CMS user sessions'
);

insert into cms_command_test_results select 15, isnt(
  public.cms_actor_authorized(
    '31000000-0000-0000-0000-000000000003', 'cms:posts.edit', 'aal1', 'old-target-session', now() - interval '1 day'
  ),
  true,
  'session issued before the revocation cutoff is denied'
);

insert into cms_command_test_results select 16, is(
  (select count(*)::integer from public.cms_audit_log where actor_id = '31000000-0000-0000-0000-000000000001'),
  4,
  'successful CMS commands append immutable audit events'
);

insert into cms_command_test_results select 17, is(
  (select count(*)::integer from public.cms_command_receipts where actor_id = '31000000-0000-0000-0000-000000000001'),
  4,
  'successful CMS commands keep one receipt per idempotency key'
);

insert into cms_command_test_results select 18, result from finish() as result;
select result from cms_command_test_results order by seq;
rollback;
