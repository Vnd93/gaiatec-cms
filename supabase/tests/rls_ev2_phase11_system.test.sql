begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(48);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '51100000-0000-4000-8000-000000000101',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'g11.operator@example.test', '', now(), '{}', '{}', now(), now()
  ),
  (
    '51100000-0000-4000-8000-000000000102',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'g11.reviewer@example.test', '', now(), '{}', '{}', now(), now()
  );
insert into public.cms_profiles (user_id, display_name, display_email, status, mfa_enrolled_at)
values
  ('51100000-0000-4000-8000-000000000101', 'Operador G11', 'g11.operator@example.test', 'active', now()),
  ('51100000-0000-4000-8000-000000000102', 'Revisor G11', 'g11.reviewer@example.test', 'active', now());
insert into public.cms_user_roles (user_id, role_key)
values
  ('51100000-0000-4000-8000-000000000101', 'super_admin'),
  ('51100000-0000-4000-8000-000000000102', 'technical');
insert into public.cms_feature_flag_overrides (
  flag_key, environment, scope_type, scope_key, enabled, reason,
  starts_at, expires_at, created_by
) values
  (
    'ev2.system_assurance', 'local', 'user', '51100000-0000-4000-8000-000000000101', true,
    'Canary individual sintético G11', now() - interval '1 minute', now() + interval '29 minutes',
    '51100000-0000-4000-8000-000000000101'
  ),
  (
    'ev2.system_assurance', 'local', 'user', '51100000-0000-4000-8000-000000000102', true,
    'Revisão individual sintética G11', now() - interval '1 minute', now() + interval '29 minutes',
    '51100000-0000-4000-8000-000000000101'
  );

select is(
  (select count(*)::integer from public.cms_permissions
    where permission_key in ('cms:leads.retry_delivery', 'cms:diagnostics.assure')),
  2,
  'both EV2.11 permissions exist'
);
select is(
  (select count(*)::integer from public.cms_permissions
    where permission_key in ('cms:leads.retry_delivery', 'cms:diagnostics.assure') and critical),
  2,
  'both EV2.11 mutations are critical and require MFA'
);
select is(
  (select default_enabled from public.cms_feature_flags where flag_key = 'ev2.system_assurance'),
  false,
  'system assurance remains off by default'
);
select is(
  (select count(*)::integer from pg_class where oid in (
    'public.cms_lead_outbox_replays'::regclass,
    'public.cms_assurance_runs'::regclass,
    'public.cms_assurance_events'::regclass,
    'public.cms_system_command_receipts'::regclass
  ) and relrowsecurity),
  4,
  'all EV2.11 tables enable RLS'
);
select isnt(
  has_table_privilege('anon', 'public.cms_lead_outbox_replays', 'SELECT'),
  true,
  'anonymous users cannot read delivery replay records'
);
select is(
  has_table_privilege('authenticated', 'public.cms_lead_outbox_replays', 'SELECT'),
  true,
  'authenticated lead readers use the RLS-protected replay projection'
);
select isnt(
  has_table_privilege('authenticated', 'public.cms_assurance_runs', 'SELECT'),
  true,
  'authenticated users cannot read assurance evidence directly'
);
select isnt(
  has_function_privilege(
    'authenticated',
    'public.cms_retry_lead_delivery(uuid,uuid,text,text,text,text,text,timestamp with time zone,uuid,uuid,text)',
    'EXECUTE'
  ),
  true,
  'authenticated users cannot bypass the lead retry API boundary'
);
select isnt(
  has_function_privilege(
    'authenticated',
    'public.cms_execute_system_command(uuid,text,jsonb,text,text,text,text,timestamp with time zone,uuid,uuid,uuid,text)',
    'EXECUTE'
  ),
  true,
  'authenticated users cannot bypass the system command boundary'
);
select ok(
  private.cms_system_metrics_safe(
    '{"availabilityPercent":99.9,"adminReadP95Ms":500,"commandP95Ms":800,"outboxLagP95Ms":60000,"auditCoveragePercent":100,"restoreRpoMinutes":0,"restoreRtoMinutes":15}'::jsonb
  ),
  'numeric system metrics are safe to persist'
);
select isnt(
  private.cms_system_metrics_safe(
    '{"availabilityPercent":99.9,"adminReadP95Ms":500,"commandP95Ms":800,"outboxLagP95Ms":60000,"auditCoveragePercent":100,"restoreRpoMinutes":0,"restoreRtoMinutes":"contato@example.test"}'::jsonb
  ),
  true,
  'free text and personal data cannot enter system metrics'
);
select is(
  (public.cms_system_capability(
    '51100000-0000-4000-8000-000000000101', 'local', 'main', 'aal2',
    'g11-operator-session', now() - interval '1 minute'
  ) ->> 'enabled')::boolean,
  true,
  'bounded individual override enables the candidate for the operator'
);
select is(
  public.cms_system_capability(
    '51100000-0000-4000-8000-000000000101', 'local', 'main', 'aal2',
    'g11-operator-session', now() - interval '1 minute'
  ) ->> 'source',
  'individual_override',
  'capability exposes the individual source'
);
select is(
  (public.cms_system_capability(
    '51100000-0000-4000-8000-000000000101', 'production', 'main', 'aal2',
    'g11-operator-session', now() - interval '1 minute'
  ) ->> 'enabled')::boolean,
  false,
  'production capability fails closed'
);

insert into public.cms_content_items (
  id, content_type, slug, workflow_status, created_by, updated_by, archived_at
) values (
  '51100000-0000-4000-8000-000000000221', 'page', 'g11-retired-page', 'archived',
  '51100000-0000-4000-8000-000000000101', '51100000-0000-4000-8000-000000000101', now()
);
insert into public.cms_content_revisions (
  id, item_id, revision_number, schema_version, payload, seo, provenance,
  source_draft_version, reason, created_by
) values (
  '51100000-0000-4000-8000-000000000222', '51100000-0000-4000-8000-000000000221',
  1, 1, '{}'::jsonb, '{}'::jsonb,
  '[{"sourceKind":"synthetic_test","rightsConfirmed":true}]'::jsonb,
  1, 'Página sintética retirada',
  '51100000-0000-4000-8000-000000000101'
);
insert into public.cms_publications (item_id, revision_id, cache_tag, published_by)
values (
  '51100000-0000-4000-8000-000000000221', '51100000-0000-4000-8000-000000000222',
  'cms:page:51100000-0000-4000-8000-000000000221',
  '51100000-0000-4000-8000-000000000101'
);

create temporary table g11_snapshot as
select public.cms_get_system_snapshot(
  '51100000-0000-4000-8000-000000000101', 'local', 'main', 'aal2',
  'g11-operator-session', now() - interval '1 minute', gen_random_uuid()
) as payload;
select is((select (payload ->> 'gateReady')::boolean from g11_snapshot), true, 'snapshot accepts an intentionally retired managed page');
select is(
  (select (payload #>> '{metrics,projectionDivergence}')::integer from g11_snapshot),
  0,
  'retired managed content preserves publication history without requiring a public projection'
);
select is((select jsonb_array_length(payload -> 'queues') from g11_snapshot), 3, 'snapshot reconciles all three queues');
select is((select jsonb_array_length(payload -> 'checks') from g11_snapshot), 6, 'snapshot exposes six database checks');
select is((select (payload ->> 'containsPersonalData')::boolean from g11_snapshot), false, 'snapshot never exposes personal data');

update public.cms_content_items
set workflow_status = 'draft', archived_at = null
where id = '51100000-0000-4000-8000-000000000221';
select is(
  (public.cms_get_system_snapshot(
    '51100000-0000-4000-8000-000000000101', 'local', 'main', 'aal2',
    'g11-operator-session', now() - interval '1 minute', gen_random_uuid()
  ) #>> '{metrics,projectionDivergence}')::integer,
  1,
  'an active publication without its public projection remains a real divergence'
);
update public.cms_content_items
set workflow_status = 'archived', archived_at = now()
where id = '51100000-0000-4000-8000-000000000221';

insert into public.cms_form_definitions (
  id, form_key, title, purpose, created_by, updated_by
) values (
  '51100000-0000-4000-8000-000000000201', 'g11-form', 'Formulário G11',
  'Validar durabilidade sintética', '51100000-0000-4000-8000-000000000101',
  '51100000-0000-4000-8000-000000000101'
);
insert into public.cms_form_versions (
  id, form_id, version, definition, consent_text, consent_version, privacy_path,
  sla_minutes, retention_days, status, reason, created_by, published_at
) values (
  '51100000-0000-4000-8000-000000000202', '51100000-0000-4000-8000-000000000201', 1,
  '{"fields":[{"key":"synthetic","type":"text"}]}'::jsonb,
  'Consentimento exclusivamente sintético.', 'g11-v1', '/privacidade', 30, 30,
  'published', 'Canary local G11', '51100000-0000-4000-8000-000000000101', now()
);
update public.cms_form_definitions set
  status = 'published', active_version_id = '51100000-0000-4000-8000-000000000202'
where id = '51100000-0000-4000-8000-000000000201';
insert into public.cms_leads (
  id, reference_code, form_id, form_version_id, idempotency_key, payload,
  origin_path, origin_source, sla_due_at, retention_until
) values (
  '51100000-0000-4000-8000-000000000203', 'LD-G11-SYNTHETIC',
  '51100000-0000-4000-8000-000000000201', '51100000-0000-4000-8000-000000000202',
  '51100000-0000-4000-8000-000000000204', '{"synthetic":true}'::jsonb,
  '/g11-synthetic', 'g11_test', now() + interval '30 minutes', now() + interval '30 days'
);
insert into public.cms_lead_consents (
  lead_id, accepted, consent_text, consent_version, policy_path, evidence_hash, technical_evidence
) values (
  '51100000-0000-4000-8000-000000000203', true, 'Consentimento exclusivamente sintético.',
  'g11-v1', '/privacidade', repeat('c', 64), '{"synthetic":true}'::jsonb
);
insert into public.cms_lead_status_history (lead_id, to_status, reason)
values ('51100000-0000-4000-8000-000000000203', 'new', 'Lead sintético persistido antes da entrega');
insert into public.cms_lead_outbox (
  id, lead_id, event_type, status, idempotency_key, attempts, available_at,
  last_error_code, correlation_id
) values (
  '51100000-0000-4000-8000-000000000205', '51100000-0000-4000-8000-000000000203',
  'lead_received', 'failed', '51100000-0000-4000-8000-000000000206', 3, now(),
  'synthetic_provider_failure', '51100000-0000-4000-8000-000000000207'
);

select is(
  public.cms_retry_lead_delivery(
    '51100000-0000-4000-8000-000000000101', '51100000-0000-4000-8000-000000000205',
    'Dependência sintética recuperada', 'local', 'main', 'aal2', 'g11-operator-session',
    now() - interval '1 minute', '51100000-0000-4000-8000-000000000208',
    '51100000-0000-4000-8000-000000000209', repeat('d', 64)
  ) ->> 'status',
  'pending',
  'failed lead delivery can be requeued explicitly'
);
select ok(
  (select status = 'pending' and attempts = 0 and last_error_code is null
   from public.cms_lead_outbox where id = '51100000-0000-4000-8000-000000000205'),
  'manual replay resets only delivery state and preserves the lead'
);
select is((select count(*)::integer from public.cms_lead_outbox_replays), 1, 'one immutable replay record is stored');
select is(
  (select count(*)::integer from public.cms_audit_log where action = 'cms:leads.retry_delivery'),
  1,
  'lead replay is audited as a critical action'
);
select is(
  (public.cms_retry_lead_delivery(
    '51100000-0000-4000-8000-000000000101', '51100000-0000-4000-8000-000000000205',
    'Dependência sintética recuperada', 'local', 'main', 'aal2', 'g11-operator-session',
    now() - interval '1 minute', gen_random_uuid(),
    '51100000-0000-4000-8000-000000000209', repeat('d', 64)
  ) ->> 'duplicate')::boolean,
  true,
  'idempotent replay returns the original result'
);
select is((select count(*)::integer from public.cms_lead_outbox_replays), 1, 'idempotent replay creates no duplicate record');
select throws_ok(
  $$select public.cms_retry_lead_delivery(
    '51100000-0000-4000-8000-000000000101', gen_random_uuid(),
    'Tentativa conflitante', 'local', 'main', 'aal2', 'g11-operator-session',
    now() - interval '1 minute', gen_random_uuid(),
    '51100000-0000-4000-8000-000000000209', repeat('d', 64)
  )$$,
  'PT409',
  'CMS_LEAD_DELIVERY_IDEMPOTENCY_CONFLICT',
  'idempotency key cannot be reused for another event'
);
select throws_ok(
  $$select public.cms_retry_lead_delivery(
    '51100000-0000-4000-8000-000000000101', '51100000-0000-4000-8000-000000000205',
    'Evento já pendente', 'local', 'main', 'aal2', 'g11-operator-session',
    now() - interval '1 minute', gen_random_uuid(), gen_random_uuid(), repeat('e', 64)
  )$$,
  'PT409',
  'CMS_LEAD_DELIVERY_NOT_RETRYABLE',
  'pending delivery cannot be replayed again'
);
select throws_ok(
  $$select public.cms_retry_lead_delivery(
    '51100000-0000-4000-8000-000000000101', '51100000-0000-4000-8000-000000000205',
    'Tentativa sem MFA', 'local', 'main', 'aal1', 'g11-operator-session',
    now() - interval '1 minute', gen_random_uuid(), gen_random_uuid(), repeat('f', 64)
  )$$,
  '42501',
  'CMS_SYSTEM_FORBIDDEN',
  'lead replay requires MFA'
);
select throws_ok(
  $$update public.cms_lead_outbox_replays set justification = 'Mutação indevida'$$,
  '42501',
  'CMS audit records are immutable',
  'lead replay evidence is immutable'
);
update public.cms_lead_outbox set status = 'processing', attempts = 20, locked_at = now()
where id = '51100000-0000-4000-8000-000000000205';
select public.cms_finish_lead_outbox(
  '51100000-0000-4000-8000-000000000205', false, 'synthetic_provider_failure'
);
select is(
  (select status from public.cms_lead_outbox where id = '51100000-0000-4000-8000-000000000205'),
  'dead_letter',
  'exhausted delivery moves to dead-letter without deleting the lead'
);
select is(
  (select count(*)::integer from public.cms_operational_events
   where event_type = 'cms.leads.delivery_dead_letter' and severity = 'critical'),
  1,
  'dead-letter transition raises one critical operational alert'
);
select is(
  public.cms_retry_lead_delivery(
    '51100000-0000-4000-8000-000000000101', '51100000-0000-4000-8000-000000000205',
    'Dependência do dead-letter sintético recuperada', 'local', 'main', 'aal2',
    'g11-operator-session', now() - interval '1 minute',
    '51100000-0000-4000-8000-000000000210', '51100000-0000-4000-8000-000000000211',
    repeat('a', 64)
  ) ->> 'status',
  'pending',
  'dead-letter delivery can be explicitly requeued'
);
select is(
  (select count(*)::integer from public.cms_operational_events
   where event_type = 'cms.leads.delivery_dead_letter' and resolved_at is null),
  0,
  'requeue resolves the matching dead-letter alert'
);

create function pg_temp.good_report(p_availability numeric default 99.9)
returns jsonb language sql as $$
  select jsonb_build_object(
    'suiteKey', 'g11-local-system',
    'candidateSha', repeat('a', 40),
    'startedAt', now() - interval '2 minutes',
    'finishedAt', now() - interval '1 minute',
    'totalChecks', 120,
    'passedChecks', 120,
    'p0Count', 0,
    'p1Count', 0,
    'accessibilityCritical', 0,
    'accessibilitySerious', 0,
    'securityStatus', 'passed',
    'restoreStatus', 'passed',
    'metrics', jsonb_build_object(
      'availabilityPercent', p_availability,
      'adminReadP95Ms', 500,
      'commandP95Ms', 800,
      'outboxLagP95Ms', 60000,
      'auditCoveragePercent', 100,
      'restoreRpoMinutes', 0,
      'restoreRtoMinutes', 15
    ),
    'evidenceHash', repeat('b', 64),
    'syntheticOnly', true,
    'realDataUsed', false
  );
$$;

create temporary table g11_run (id uuid) on commit drop;
insert into g11_run
select (public.cms_execute_system_command(
  '51100000-0000-4000-8000-000000000101', 'record_run', pg_temp.good_report(),
  'local', 'main', 'aal2', 'g11-operator-session', now() - interval '1 minute',
  '51100000-0000-4000-8000-000000000301', '51100000-0000-4000-8000-000000000302',
  '51100000-0000-4000-8000-000000000303', repeat('1', 64)
) ->> 'runId')::uuid;
select is((select status from public.cms_assurance_runs where id = (select id from g11_run)), 'measured', 'passing measurement awaits independent review');
select ok((select measurement_passed from public.cms_assurance_runs where id = (select id from g11_run)), 'all mandatory G11 thresholds pass at their boundary');
select is(
  (public.cms_execute_system_command(
    '51100000-0000-4000-8000-000000000101', 'record_run', pg_temp.good_report(),
    'local', 'main', 'aal2', 'g11-operator-session', now() - interval '1 minute',
    gen_random_uuid(), gen_random_uuid(), '51100000-0000-4000-8000-000000000303', repeat('1', 64)
  ) ->> 'runId')::uuid,
  (select id from g11_run),
  'system measurement is idempotent'
);
select throws_ok(
  $$select public.cms_execute_system_command(
    '51100000-0000-4000-8000-000000000101', 'review_run',
    jsonb_build_object('runId', (select id from g11_run), 'accept', true, 'rationale', 'Autoaprovação indevida'),
    'local', 'main', 'aal2', 'g11-operator-session', now() - interval '1 minute',
    gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), repeat('2', 64)
  )$$,
  'PT409',
  'CMS_SYSTEM_REVIEWER_SEPARATION_REQUIRED',
  'measurement operator cannot approve the same run'
);
select is(
  public.cms_execute_system_command(
    '51100000-0000-4000-8000-000000000102', 'review_run',
    jsonb_build_object('runId', (select id from g11_run), 'accept', true, 'rationale', 'Evidência sintética G11 conferida'),
    'local', 'main', 'aal2', 'g11-reviewer-session', now() - interval '1 minute',
    '51100000-0000-4000-8000-000000000304', '51100000-0000-4000-8000-000000000305',
    '51100000-0000-4000-8000-000000000306', repeat('3', 64)
  ) ->> 'status',
  'accepted',
  'segregated reviewer can accept a passing measurement'
);
select is(
  (select reviewed_by from public.cms_assurance_runs where id = (select id from g11_run)),
  '51100000-0000-4000-8000-000000000102'::uuid,
  'accepted run identifies a different reviewer'
);
select is(
  (select count(*)::integer from public.cms_assurance_events where run_id = (select id from g11_run)),
  2,
  'measurement and acceptance form an immutable event trail'
);
select is(
  (select count(*)::integer from public.cms_system_command_receipts where completed_at is not null),
  2,
  'successful record and review commands reconcile receipts'
);
select throws_ok(
  $$update public.cms_assurance_runs
    set metrics = jsonb_set(metrics, '{commandP95Ms}', '1'::jsonb)
    where id = (select id from g11_run)$$,
  '55000',
  'CMS_ASSURANCE_RUN_IMMUTABLE',
  'measured evidence cannot be rewritten after independent review'
);
select throws_ok(
  $$update public.cms_system_command_receipts
    set response = jsonb_set(response, '{status}', '"rejected"'::jsonb)
    where completed_at is not null$$,
  '55000',
  'CMS_SYSTEM_RECEIPT_IMMUTABLE',
  'completed command receipts cannot be rewritten'
);
select is(
  (select count(*)::integer from public.cms_audit_log where action in ('cms:leads.retry_delivery', 'cms:diagnostics.assure')),
  4,
  'all successful EV2.11 critical actions carry audit evidence'
);

create temporary table g11_failed_run (id uuid) on commit drop;
insert into g11_failed_run
select (public.cms_execute_system_command(
  '51100000-0000-4000-8000-000000000101', 'record_run', pg_temp.good_report(99.8),
  'local', 'main', 'aal2', 'g11-operator-session', now() - interval '1 minute',
  gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), repeat('4', 64)
) ->> 'runId')::uuid;
select is((select status from public.cms_assurance_runs where id = (select id from g11_failed_run)), 'failed', 'one SLO breach fails the measurement');
select throws_ok(
  $$select public.cms_execute_system_command(
    '51100000-0000-4000-8000-000000000102', 'review_run',
    jsonb_build_object('runId', (select id from g11_failed_run), 'accept', true, 'rationale', 'Tentativa indevida'),
    'local', 'main', 'aal2', 'g11-reviewer-session', now() - interval '1 minute',
    gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), repeat('5', 64)
  )$$,
  'PT409',
  'CMS_SYSTEM_RUN_NOT_REVIEWABLE',
  'failed measurement cannot be accepted'
);

insert into public.cms_feature_flag_overrides (
  flag_key, environment, scope_type, scope_key, enabled, reason,
  starts_at, expires_at, created_by
) values (
  'ev2.system_assurance', 'local', 'environment', 'local', true,
  'Teste negativo de ativação ampla G11', now() - interval '1 minute', now() + interval '5 minutes',
  '51100000-0000-4000-8000-000000000101'
);
select is(
  public.cms_system_capability(
    '51100000-0000-4000-8000-000000000101', 'local', 'main', 'aal2',
    'g11-operator-session', now() - interval '1 minute'
  ) ->> 'source',
  'broad_activation_not_supported',
  'any broad override makes EV2.11 fail closed'
);

select * from finish();
rollback;
