begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(28);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '92000000-0000-4000-8000-000000000010',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'form.lifecycle@example.test', '', now(), '{}', '{}', now(), now()
);
insert into public.cms_profiles (
  user_id, display_name, display_email, status, mfa_enrolled_at
) values (
  '92000000-0000-4000-8000-000000000010',
  'Operador de formulários', 'form.lifecycle@example.test', 'active', now()
);
insert into public.cms_user_roles (user_id, role_key)
values ('92000000-0000-4000-8000-000000000010', 'super_admin');

select set_config(
  'cms.qa_mutation_actor_id',
  '92000000-0000-4000-8000-000000000010',
  true
);
insert into public.cms_form_definitions (
  id, form_key, title, purpose, created_by, updated_by
) values (
  '92000000-0000-4000-8000-000000000001', 'qa-form-lifecycle',
  'Formulário sintético', 'Validar retirada e restauração governadas.',
  '92000000-0000-4000-8000-000000000010',
  '92000000-0000-4000-8000-000000000010'
);
insert into public.cms_form_versions (
  id, form_id, version, definition, consent_text, consent_version,
  privacy_path, sla_minutes, retention_days, status, reason, created_by, published_at
) values (
  '92000000-0000-4000-8000-000000000002',
  '92000000-0000-4000-8000-000000000001', 1,
  '{"fields":[{"id":"92000000-0000-4000-8000-000000000003","key":"email","label":"E-mail","type":"email","required":true,"maxLength":254,"options":[],"personalData":true,"order":0}],"successMessage":"Recebido.","submitLabel":"Enviar"}'::jsonb,
  'Aceito o tratamento dos dados sintéticos.', 'qa-v1',
  '/politica-de-privacidade', 60, 30, 'published',
  'Publicação sintética', '92000000-0000-4000-8000-000000000010', now()
);
update public.cms_form_definitions
set status = 'published', active_version_id = '92000000-0000-4000-8000-000000000002'
where id = '92000000-0000-4000-8000-000000000001';

create function pg_temp.form_lifecycle(
  p_action text,
  p_source_version_id uuid default null,
  p_expected_lock_version bigint default 2,
  p_reason text default 'Homologação sintética do ciclo',
  p_aal text default 'aal2',
  p_idempotency_key uuid default gen_random_uuid(),
  p_request_hash text default repeat('a', 64)
) returns jsonb language sql as $$
  select public.cms_execute_form_lifecycle_command(
    '92000000-0000-4000-8000-000000000010', p_action,
    '92000000-0000-4000-8000-000000000001', p_source_version_id,
    p_expected_lock_version, p_reason, p_aal, 'form-lifecycle-session',
    now() - interval '1 minute', p_idempotency_key, p_request_hash, gen_random_uuid()
  );
$$;

select has_column(
  'public', 'cms_form_definitions', 'lock_version',
  'form definitions expose an optimistic lock'
);
select isnt(
  has_table_privilege('anon', 'public.cms_form_definitions', 'SELECT'), true,
  'anonymous users cannot enumerate form definitions'
);
select isnt(
  has_function_privilege(
    'authenticated',
    'public.cms_execute_form_lifecycle_command(uuid,text,uuid,uuid,bigint,text,text,text,timestamp with time zone,uuid,text,uuid)',
    'EXECUTE'
  ),
  true,
  'authenticated users cannot bypass the Edge command boundary'
);
select is(
  (select critical from public.cms_permissions where permission_key = 'cms:forms.publish'),
  true,
  'form lifecycle mutations remain critical'
);
select throws_ok(
  $$select pg_temp.form_lifecycle('archive_form', p_aal => 'aal1')$$,
  '42501', 'CMS_FORMS_SCOPE_FORBIDDEN',
  'an AAL1 archival request fails closed at the scoped authorization boundary'
);
select lives_ok(
  $$select pg_temp.form_lifecycle(
    'archive_form',
    p_idempotency_key => '92000000-0000-4000-8000-000000000020',
    p_request_hash => repeat('b', 64)
  )$$,
  'an AAL2 publisher archives the form'
);
select is(
  (select status from public.cms_form_definitions where id = '92000000-0000-4000-8000-000000000001'),
  'retired', 'the definition is retired rather than deleted'
);
select is(
  (select active_version_id from public.cms_form_definitions where id = '92000000-0000-4000-8000-000000000001'),
  null::uuid, 'archival clears the public active version'
);
select is(
  (select status from public.cms_form_versions where id = '92000000-0000-4000-8000-000000000002'),
  'retired', 'the formerly public immutable version is retired'
);
select is(
  (select lock_version from public.cms_form_definitions where id = '92000000-0000-4000-8000-000000000001'),
  3::bigint, 'archival advances the optimistic lock once'
);
select is(
  (select count(*)::integer from public.cms_audit_log where action = 'cms:form.archive'),
  1, 'archival appends one central audit event'
);
select throws_ok(
  $$select public.cms_capture_lead(
    '92000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000002', gen_random_uuid(),
    '{"email":"synthetic@example.test"}'::jsonb,
    '{"path":"/qa-form-lifecycle","source":"website"}'::jsonb,
    '{"accepted":true,"text":"Aceito o tratamento dos dados sintéticos.","version":"qa-v1"}'::jsonb,
    '{"synthetic":true}'::jsonb, gen_random_uuid()
  )$$,
  '42501', 'CMS_LEAD_ORIGIN_SCOPE_FORBIDDEN',
  'a retired form fails closed at the authoritative public-origin boundary'
);
select is(
  (pg_temp.form_lifecycle(
    'archive_form',
    p_idempotency_key => '92000000-0000-4000-8000-000000000020',
    p_request_hash => repeat('b', 64)
  ) ->> 'replayed')::boolean,
  true, 'an identical retry replays its completed receipt'
);
select is(
  (select count(*)::integer from public.cms_ev2_command_receipts where domain = 'forms'),
  1, 'an idempotent retry does not create a second receipt'
);
select throws_ok(
  $$select pg_temp.form_lifecycle(
    'archive_form',
    p_idempotency_key => '92000000-0000-4000-8000-000000000020',
    p_request_hash => repeat('c', 64)
  )$$,
  '23505', 'CMS_FORM_IDEMPOTENCY_CONFLICT',
  'an idempotency key cannot represent a different request'
);
select throws_ok(
  $$select pg_temp.form_lifecycle(
    'restore_form', '92000000-0000-4000-8000-000000000002', 2,
    p_idempotency_key => '92000000-0000-4000-8000-000000000021'
  )$$,
  'P0001', 'CMS_FORM_VERSION_CONFLICT:3',
  'a stale restore is rejected with the current lock version'
);
select throws_ok(
  $$select pg_temp.form_lifecycle(
    'restore_form', '92000000-0000-4000-8000-000000000002', 3,
    p_aal => 'aal1'
  )$$,
  '42501', 'CMS_FORMS_SCOPE_FORBIDDEN',
  'an AAL1 restoration request fails closed at the scoped authorization boundary'
);
select lives_ok(
  $$select pg_temp.form_lifecycle(
    'restore_form', '92000000-0000-4000-8000-000000000002', 3,
    p_idempotency_key => '92000000-0000-4000-8000-000000000022',
    p_request_hash => repeat('d', 64)
  )$$,
  'an AAL2 publisher restores the selected historical version'
);
select is(
  (select status from public.cms_form_definitions where id = '92000000-0000-4000-8000-000000000001'),
  'published', 'restoration republishes a previously public form'
);
select is(
  (select active_version_id from public.cms_form_definitions where id = '92000000-0000-4000-8000-000000000001'),
  '92000000-0000-4000-8000-000000000002'::uuid,
  'restoration reestablishes the selected active version'
);
select is(
  (select status from public.cms_form_versions where id = '92000000-0000-4000-8000-000000000002'),
  'published', 'the selected historical version is public again'
);
select is(
  (select lock_version from public.cms_form_definitions where id = '92000000-0000-4000-8000-000000000001'),
  4::bigint, 'restoration advances the optimistic lock once'
);
select is(
  (select count(*)::integer from public.cms_audit_log where action = 'cms:form.restore'),
  1, 'restoration appends one central audit event'
);
select lives_ok(
  $$select public.cms_capture_lead(
    '92000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000002',
    '92000000-0000-4000-8000-000000000030',
    '{"email":"synthetic@example.test"}'::jsonb,
    '{"path":"/qa-form-lifecycle","source":"website"}'::jsonb,
    '{"accepted":true,"text":"Aceito o tratamento dos dados sintéticos.","version":"qa-v1"}'::jsonb,
    '{"synthetic":true}'::jsonb, gen_random_uuid()
  )$$,
  'the restored form accepts a controlled synthetic lead'
);
select is(
  (select count(*)::integer from public.cms_leads where form_id = '92000000-0000-4000-8000-000000000001'),
  1, 'the positive public path persisted exactly one synthetic lead'
);
select is(
  (select count(*)::integer from public.cms_audit_log where action in ('cms:form.archive', 'cms:form.restore')),
  2, 'the full lifecycle preserves both audit events'
);
select is(
  (select definition from public.cms_form_versions where id = '92000000-0000-4000-8000-000000000002'),
  '{"fields":[{"id":"92000000-0000-4000-8000-000000000003","key":"email","label":"E-mail","type":"email","required":true,"maxLength":254,"options":[],"personalData":true,"order":0}],"successMessage":"Recebido.","submitLabel":"Enviar"}'::jsonb,
  'archive and restore never mutate the frozen form definition'
);
select throws_ok(
  $$delete from public.cms_form_versions where id = '92000000-0000-4000-8000-000000000002'$$,
  '55000', 'CMS_IMMUTABLE_RECORD',
  'historical form versions remain undeletable'
);

select * from finish();
rollback;
