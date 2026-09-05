begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(29);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '42000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'ev2.draft.owner@example.test', '', now(), '{}', '{}', now(), now()
  ),
  (
    '42000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'ev2.draft.editor@example.test', '', now(), '{}', '{}', now(), now()
  );

insert into public.cms_profiles (user_id, display_name, display_email, status)
values
  ('42000000-0000-4000-8000-000000000001', 'Owner EV2 draft', 'ev2.draft.owner@example.test', 'active'),
  ('42000000-0000-4000-8000-000000000002', 'Editor EV2 draft', 'ev2.draft.editor@example.test', 'active');

insert into public.cms_user_roles (user_id, role_key)
values
  ('42000000-0000-4000-8000-000000000001', 'super_admin'),
  ('42000000-0000-4000-8000-000000000002', 'super_admin');

select is(
  (
    select count(*)::integer
    from pg_class
    where oid in (
      'public.cms_content_drafts_v2'::regclass,
      'public.cms_draft_v2_command_receipts'::regclass,
      'public.cms_draft_v2_events'::regclass
    ) and relrowsecurity
  ),
  3,
  'all EV2.2 tables enable RLS'
);

select isnt(
  has_table_privilege('anon', 'public.cms_content_drafts_v2', 'SELECT'),
  true,
  'anonymous clients cannot read progressive drafts'
);

select isnt(
  has_table_privilege('authenticated', 'public.cms_content_drafts_v2', 'SELECT'),
  true,
  'authenticated clients cannot bypass the Edge query boundary'
);

select isnt(
  has_function_privilege(
    'authenticated',
    'public.cms_execute_draft_v2_command(uuid,text,uuid,text,text,jsonb,text,bigint,text,text,text,text,timestamptz,uuid,uuid,text,uuid)',
    'EXECUTE'
  ),
  true,
  'authenticated clients cannot bypass the Edge command boundary'
);

select is(
  (
    public.cms_evaluate_feature_flag(
      '42000000-0000-4000-8000-000000000001', 'ev2.draft_v2', 'local', 'main',
      'aal2', 'ev2-draft-owner-session', now() - interval '1 minute'
    ) ->> 'enabled'
  )::boolean,
  false,
  'progressive drafts remain disabled by default'
);

select throws_ok(
  $$select public.cms_execute_draft_v2_command(
    '42000000-0000-4000-8000-000000000001', 'create', null, 'product', '', null, null, null,
    'local', 'main', 'aal2', 'ev2-draft-owner-session', now() - interval '1 minute',
    '42000000-0000-4000-8000-000000000010', '42000000-0000-4000-8000-000000000011',
    repeat('a', 64), '42000000-0000-4000-8000-000000000012'
  )$$,
  '42501',
  'CMS_DRAFT_V2_FEATURE_DISABLED',
  'a disabled feature cannot create shadow data'
);

insert into public.cms_feature_flag_overrides (
  flag_key, environment, scope_type, scope_key, enabled, reason, expires_at, created_by
) values
  (
    'ev2.draft_v2', 'local', 'user', '42000000-0000-4000-8000-000000000001', true,
    'Teste transacional local do Gate G2 para owner', now() + interval '1 hour',
    '42000000-0000-4000-8000-000000000001'
  ),
  (
    'ev2.draft_v2', 'local', 'user', '42000000-0000-4000-8000-000000000002', true,
    'Teste transacional local do Gate G2 para concorrência', now() + interval '1 hour',
    '42000000-0000-4000-8000-000000000001'
  );

select lives_ok(
  $$select public.cms_execute_draft_v2_command(
    '42000000-0000-4000-8000-000000000001', 'create', null, 'product', '', null, null, null,
    'local', 'main', 'aal2', 'ev2-draft-owner-session', now() - interval '1 minute',
    '42000000-0000-4000-8000-000000000020', '42000000-0000-4000-8000-000000000021',
    repeat('b', 64), '42000000-0000-4000-8000-000000000022'
  )$$,
  'an authorized canary creates a completely empty private draft'
);

select is(
  (select fields from public.cms_content_drafts_v2 where created_by = '42000000-0000-4000-8000-000000000001'),
  '{}'::jsonb,
  'new draft has no editorial fields'
);

select is(
  (select working_title from public.cms_content_drafts_v2 where created_by = '42000000-0000-4000-8000-000000000001'),
  '',
  'new draft does not require a title'
);

select is(
  (select status from public.cms_content_drafts_v2 where created_by = '42000000-0000-4000-8000-000000000001'),
  'active',
  'new draft is active without changing editorial workflow'
);

select is(
  (
    select count(*)::integer
    from public.cms_published_projection
    where item_id = (
      select id from public.cms_content_drafts_v2 where created_by = '42000000-0000-4000-8000-000000000001'
    )
  ),
  0,
  'shadow draft is absent from the public projection'
);

select lives_ok(
  $$select public.cms_execute_draft_v2_command(
    '42000000-0000-4000-8000-000000000001', 'patch',
    (select id from public.cms_content_drafts_v2 where created_by = '42000000-0000-4000-8000-000000000001'),
    null, 'Detector em elaboração',
    '[{"operation":"set","path":["summary"],"value":"Conteúdo ainda incompleto"}]'::jsonb,
    null, 1, 'local', 'main', 'aal2', 'ev2-draft-owner-session', now() - interval '1 minute',
    '42000000-0000-4000-8000-000000000030', '42000000-0000-4000-8000-000000000031',
    repeat('c', 64), '42000000-0000-4000-8000-000000000032'
  )$$,
  'field patch accepts content that is not publishable'
);

select is(
  (select fields ->> 'summary' from public.cms_content_drafts_v2 where created_by = '42000000-0000-4000-8000-000000000001'),
  'Conteúdo ainda incompleto',
  'field patch persists the changed field'
);

select is(
  (select lock_version from public.cms_content_drafts_v2 where created_by = '42000000-0000-4000-8000-000000000001'),
  2::bigint,
  'field patch increments optimistic lock version'
);

select is(
  (
    public.cms_execute_draft_v2_command(
      '42000000-0000-4000-8000-000000000001', 'patch',
      (select id from public.cms_content_drafts_v2 where created_by = '42000000-0000-4000-8000-000000000001'),
      null, 'Detector em elaboração',
      '[{"operation":"set","path":["summary"],"value":"Conteúdo ainda incompleto"}]'::jsonb,
      null, 1, 'local', 'main', 'aal2', 'ev2-draft-owner-session', now() - interval '1 minute',
      '42000000-0000-4000-8000-000000000030', '42000000-0000-4000-8000-000000000031',
      repeat('c', 64), '42000000-0000-4000-8000-000000000032'
    ) ->> 'lockVersion'
  )::bigint,
  2::bigint,
  'identical idempotent patch returns the original receipt'
);

select throws_ok(
  $$select public.cms_execute_draft_v2_command(
    '42000000-0000-4000-8000-000000000001', 'patch',
    (select id from public.cms_content_drafts_v2 where created_by = '42000000-0000-4000-8000-000000000001'),
    null, null, '[{"operation":"remove","path":["summary"]}]'::jsonb, null, 2,
    'local', 'main', 'aal2', 'ev2-draft-owner-session', now() - interval '1 minute',
    '42000000-0000-4000-8000-000000000033', '42000000-0000-4000-8000-000000000031',
    repeat('d', 64), '42000000-0000-4000-8000-000000000034'
  )$$,
  '23505',
  'CMS_DRAFT_V2_IDEMPOTENCY_CONFLICT',
  'same idempotency key with a different request hash is rejected'
);

select lives_ok(
  $$select public.cms_execute_draft_v2_command(
    '42000000-0000-4000-8000-000000000002', 'patch',
    (select id from public.cms_content_drafts_v2 where created_by = '42000000-0000-4000-8000-000000000001'),
    null, null, '[{"operation":"set","path":["technicalNote"],"value":"Revisão concorrente"}]'::jsonb,
    null, 2, 'local', 'main', 'aal2', 'ev2-draft-editor-session', now() - interval '1 minute',
    '42000000-0000-4000-8000-000000000040', '42000000-0000-4000-8000-000000000041',
    repeat('e', 64), '42000000-0000-4000-8000-000000000042'
  )$$,
  'a second authorized editor can save the expected version'
);

select is(
  (select lock_version from public.cms_content_drafts_v2 where created_by = '42000000-0000-4000-8000-000000000001'),
  3::bigint,
  'second editor advances the shared version'
);

select throws_ok(
  $$select public.cms_execute_draft_v2_command(
    '42000000-0000-4000-8000-000000000001', 'patch',
    (select id from public.cms_content_drafts_v2 where created_by = '42000000-0000-4000-8000-000000000001'),
    null, null, '[{"operation":"set","path":["summary"],"value":"Versão obsoleta"}]'::jsonb,
    null, 2, 'local', 'main', 'aal2', 'ev2-draft-owner-session', now() - interval '1 minute',
    '42000000-0000-4000-8000-000000000050', '42000000-0000-4000-8000-000000000051',
    repeat('f', 64), '42000000-0000-4000-8000-000000000052'
  )$$,
  'P0001',
  'CMS_DRAFT_V2_CONFLICT',
  'a stale editor never overwrites the newer draft'
);

select is(
  (select count(*)::integer from public.cms_draft_v2_events),
  3,
  'create and both successful patches append immutable events'
);

select is(
  (
    select count(*)::integer
    from public.cms_audit_log
    where action like 'cms:drafts_v2.%'
  ),
  3,
  'every successful draft mutation is audited'
);

select throws_ok(
  $$delete from public.cms_draft_v2_events$$,
  '42501',
  'CMS audit records are immutable',
  'draft events cannot be deleted'
);

select lives_ok(
  $$select public.cms_execute_draft_v2_command(
    '42000000-0000-4000-8000-000000000001', 'discard',
    (select id from public.cms_content_drafts_v2 where created_by = '42000000-0000-4000-8000-000000000001'),
    null, null, null, 'Descartar somente após confirmação do operador', 3,
    'local', 'main', 'aal2', 'ev2-draft-owner-session', now() - interval '1 minute',
    '42000000-0000-4000-8000-000000000060', '42000000-0000-4000-8000-000000000061',
    repeat('1', 64), '42000000-0000-4000-8000-000000000062'
  )$$,
  'discard is explicit and versioned'
);

select is(
  (select status from public.cms_content_drafts_v2 where created_by = '42000000-0000-4000-8000-000000000001'),
  'discarded',
  'discard keeps the shadow record instead of deleting it'
);

select is(
  (select lock_version from public.cms_content_drafts_v2 where created_by = '42000000-0000-4000-8000-000000000001'),
  4::bigint,
  'discard increments the optimistic lock version'
);

select is(
  public.cms_get_draft_v2(
    '42000000-0000-4000-8000-000000000001', null, 'product', 'local', 'main',
    'aal2', 'ev2-draft-owner-session', now() - interval '1 minute'
  ) is null,
  true,
  'resume does not reopen a discarded draft implicitly'
);

select throws_ok(
  $$select public.cms_get_draft_v2(
    '42000000-0000-4000-8000-000000000001', null, 'product', 'production', 'main',
    'aal2', 'ev2-draft-owner-session', now() - interval '1 minute'
  )$$,
  '22023',
  'CMS_DRAFT_V2_COMMAND_INVALID',
  'EV2.2 refuses production reads and writes'
);

update public.cms_feature_flags
set kill_switch = true,
  updated_by = '42000000-0000-4000-8000-000000000001'
where flag_key = 'ev2.draft_v2';

select is(
  (
    public.cms_evaluate_feature_flag(
      '42000000-0000-4000-8000-000000000001', 'ev2.draft_v2', 'local', 'main',
      'aal2', 'ev2-draft-owner-session', now() - interval '1 minute'
    ) ->> 'enabled'
  )::boolean,
  false,
  'kill switch overrides both user canaries'
);

select throws_ok(
  $$select public.cms_get_draft_v2(
    '42000000-0000-4000-8000-000000000001',
    (select id from public.cms_content_drafts_v2 where created_by = '42000000-0000-4000-8000-000000000001'),
    null, 'local', 'main', 'aal2', 'ev2-draft-owner-session', now() - interval '1 minute'
  )$$,
  '42501',
  'CMS_DRAFT_V2_FEATURE_DISABLED',
  'kill switch fails closed without erasing recoverable data'
);

select * from finish();
rollback;
