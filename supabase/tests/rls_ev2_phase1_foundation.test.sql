begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(22);

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values (
  '41000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'ev2.foundation.super@example.test',
  '',
  now(),
  '{}',
  '{}',
  now(),
  now()
);

insert into public.cms_profiles (user_id, display_name, display_email, status)
values (
  '41000000-0000-4000-8000-000000000001',
  'Super EV2 foundation',
  'ev2.foundation.super@example.test',
  'active'
);

insert into public.cms_user_roles (user_id, role_key)
values ('41000000-0000-4000-8000-000000000001', 'super_admin');

select results_eq(
  $$
    select relname::text
    from pg_class
    where oid in (
      'public.cms_feature_flags'::regclass,
      'public.cms_feature_flag_overrides'::regclass,
      'public.cms_release_packages'::regclass,
      'public.cms_release_command_receipts'::regclass,
      'public.cms_release_events'::regclass
    ) and relrowsecurity
    order by relname
  $$,
  $$values
    ('cms_feature_flag_overrides'::text),
    ('cms_feature_flags'::text),
    ('cms_release_command_receipts'::text),
    ('cms_release_events'::text),
    ('cms_release_packages'::text)
  $$,
  'all EV2.1 tables enable RLS'
);

select is(
  (select count(*)::integer from public.cms_feature_flags where default_enabled),
  0,
  'every EV2 capability is disabled by default'
);

select is(
  (
    public.cms_evaluate_feature_flag(
      '41000000-0000-4000-8000-000000000001',
      'ev2.release_skeleton',
      'local',
      'main',
      'aal2',
      'ev2-foundation-session',
      now() - interval '1 minute'
    ) ->> 'enabled'
  )::boolean,
  false,
  'release skeleton fails closed without an override'
);

select isnt(
  has_function_privilege(
    'anon',
    'public.cms_execute_release_command(uuid,text,uuid,text,text,bigint,text,text,text,timestamptz,uuid,uuid,text,uuid)',
    'EXECUTE'
  ),
  true,
  'anonymous users cannot execute release commands'
);

select isnt(
  has_function_privilege(
    'authenticated',
    'public.cms_execute_release_command(uuid,text,uuid,text,text,bigint,text,text,text,timestamptz,uuid,uuid,text,uuid)',
    'EXECUTE'
  ),
  true,
  'authenticated clients cannot bypass the Edge command boundary'
);

insert into public.cms_feature_flag_overrides (
  flag_key,
  environment,
  scope_type,
  scope_key,
  enabled,
  reason,
  expires_at,
  created_by
) values (
  'ev2.release_skeleton',
  'local',
  'user',
  '41000000-0000-4000-8000-000000000001',
  true,
  'Teste local transacional do Gate G1',
  now() + interval '1 hour',
  '41000000-0000-4000-8000-000000000001'
);

select is(
  (
    public.cms_evaluate_feature_flag(
      '41000000-0000-4000-8000-000000000001',
      'ev2.release_skeleton',
      'local',
      'main',
      'aal2',
      'ev2-foundation-session',
      now() - interval '1 minute'
    ) ->> 'enabled'
  )::boolean,
  true,
  'user-scoped local override enables only the controlled test'
);

select throws_ok(
  $$select public.cms_execute_release_command(
    '41000000-0000-4000-8000-000000000001',
    'create',
    null,
    'local',
    'main',
    null,
    'Criar release vazio sem MFA',
    'aal1',
    'ev2-foundation-session',
    now() - interval '1 minute',
    '41000000-0000-4000-8000-000000000010',
    '41000000-0000-4000-8000-000000000011',
    repeat('a', 64),
    '41000000-0000-4000-8000-000000000012'
  )$$,
  '42501',
  'CMS_RELEASE_FORBIDDEN',
  'MFA is required for the super admin role'
);

select lives_ok(
  $$select public.cms_execute_release_command(
    '41000000-0000-4000-8000-000000000001',
    'create',
    null,
    'local',
    'main',
    null,
    'Criar release vazio do Gate G1',
    'aal2',
    'ev2-foundation-session',
    now() - interval '1 minute',
    '41000000-0000-4000-8000-000000000020',
    '41000000-0000-4000-8000-000000000021',
    repeat('b', 64),
    '41000000-0000-4000-8000-000000000022'
  )$$,
  'authorized local test creates an empty release'
);

select is(
  (
    select status
    from public.cms_release_packages
    where created_by = '41000000-0000-4000-8000-000000000001'
  ),
  'draft',
  'new empty release starts in draft'
);

select is(
  (
    select plan_hash
    from public.cms_release_packages
    where created_by = '41000000-0000-4000-8000-000000000001'
  ),
  encode(extensions.digest(convert_to('[]', 'UTF8'), 'sha256'), 'hex'),
  'empty release plan has a deterministic hash'
);

select is(
  (
    public.cms_execute_release_command(
      '41000000-0000-4000-8000-000000000001',
      'create',
      null,
      'local',
      'main',
      null,
      'Criar release vazio do Gate G1',
      'aal2',
      'ev2-foundation-session',
      now() - interval '1 minute',
      '41000000-0000-4000-8000-000000000020',
      '41000000-0000-4000-8000-000000000021',
      repeat('b', 64),
      '41000000-0000-4000-8000-000000000022'
    ) ->> 'releaseId'
  ),
  (
    select id::text
    from public.cms_release_packages
    where created_by = '41000000-0000-4000-8000-000000000001'
  ),
  'same idempotency key and hash returns the original receipt'
);

select throws_ok(
  $$select public.cms_execute_release_command(
    '41000000-0000-4000-8000-000000000001',
    'create',
    null,
    'local',
    'main',
    null,
    'Tentar reutilizar chave com payload diferente',
    'aal2',
    'ev2-foundation-session',
    now() - interval '1 minute',
    '41000000-0000-4000-8000-000000000020',
    '41000000-0000-4000-8000-000000000021',
    repeat('c', 64),
    '41000000-0000-4000-8000-000000000022'
  )$$,
  '23505',
  'CMS_RELEASE_IDEMPOTENCY_CONFLICT',
  'same idempotency key with a different hash is rejected'
);

select throws_ok(
  $$select public.cms_execute_release_command(
    '41000000-0000-4000-8000-000000000001',
    'rollback',
    (select id from public.cms_release_packages where created_by = '41000000-0000-4000-8000-000000000001'),
    'local',
    'main',
    2,
    'Tentar rollback com versão obsoleta',
    'aal2',
    'ev2-foundation-session',
    now() - interval '1 minute',
    '41000000-0000-4000-8000-000000000030',
    '41000000-0000-4000-8000-000000000031',
    repeat('d', 64),
    '41000000-0000-4000-8000-000000000032'
  )$$,
  '40001',
  'CMS_RELEASE_CONFLICT',
  'optimistic concurrency rejects a stale release version'
);

select throws_ok(
  $$select public.cms_execute_release_command(
    '41000000-0000-4000-8000-000000000001',
    'rollback',
    (select id from public.cms_release_packages where created_by = '41000000-0000-4000-8000-000000000001'),
    'local',
    'main',
    1,
    'Tentar rollback sem MFA',
    'aal1',
    'ev2-foundation-session',
    now() - interval '1 minute',
    '41000000-0000-4000-8000-000000000040',
    '41000000-0000-4000-8000-000000000041',
    repeat('e', 64),
    '41000000-0000-4000-8000-000000000042'
  )$$,
  '42501',
  'CMS_RELEASE_FORBIDDEN',
  'rollback requires MFA'
);

select lives_ok(
  $$select public.cms_execute_release_command(
    '41000000-0000-4000-8000-000000000001',
    'rollback',
    (select id from public.cms_release_packages where created_by = '41000000-0000-4000-8000-000000000001'),
    'local',
    'main',
    1,
    'Reverter release vazio do Gate G1',
    'aal2',
    'ev2-foundation-session',
    now() - interval '1 minute',
    '41000000-0000-4000-8000-000000000050',
    '41000000-0000-4000-8000-000000000051',
    repeat('f', 64),
    '41000000-0000-4000-8000-000000000052'
  )$$,
  'empty release rollback succeeds with the expected version and MFA'
);

select is(
  (
    select status
    from public.cms_release_packages
    where created_by = '41000000-0000-4000-8000-000000000001'
  ),
  'rolled_back',
  'rollback moves the package to rolled_back'
);

select is(
  (
    select lock_version
    from public.cms_release_packages
    where created_by = '41000000-0000-4000-8000-000000000001'
  ),
  2::bigint,
  'rollback increments the optimistic lock version'
);

select is(
  (
    select count(*)::integer
    from public.cms_release_events
    where actor_id = '41000000-0000-4000-8000-000000000001'
  ),
  2,
  'create and rollback append release events'
);

select is(
  (
    select count(*)::integer
    from public.cms_audit_log
    where actor_id = '41000000-0000-4000-8000-000000000001'
      and action like 'cms:releases.%'
  ),
  2,
  'create and rollback append immutable CMS audit events'
);

select throws_ok(
  $$delete from public.cms_release_events
    where actor_id = '41000000-0000-4000-8000-000000000001'$$,
  '42501',
  'CMS audit records are immutable',
  'release events cannot be deleted'
);

update public.cms_feature_flags
set kill_switch = true,
  updated_by = '41000000-0000-4000-8000-000000000001'
where flag_key = 'ev2.release_skeleton';

select is(
  (
    public.cms_evaluate_feature_flag(
      '41000000-0000-4000-8000-000000000001',
      'ev2.release_skeleton',
      'local',
      'main',
      'aal2',
      'ev2-foundation-session',
      now() - interval '1 minute'
    ) ->> 'enabled'
  )::boolean,
  false,
  'kill switch overrides an active user rollout'
);

select throws_ok(
  $$select public.cms_execute_release_command(
    '41000000-0000-4000-8000-000000000001',
    'create',
    null,
    'production',
    'main',
    null,
    'Produção não permitida no Gate G1',
    'aal2',
    'ev2-foundation-session',
    now() - interval '1 minute',
    '41000000-0000-4000-8000-000000000060',
    '41000000-0000-4000-8000-000000000061',
    repeat('1', 64),
    '41000000-0000-4000-8000-000000000062'
  )$$,
  '22023',
  'CMS_RELEASE_COMMAND_INVALID',
  'EV2.1 refuses production release creation'
);

select * from finish();
rollback;
