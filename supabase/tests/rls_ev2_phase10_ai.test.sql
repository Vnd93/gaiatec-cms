begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(43);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '51000000-0000-4000-8000-000000000101',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'g10.operator@example.test', '', now(), '{}', '{}', now(), now()
);
insert into public.cms_profiles (user_id, display_name, display_email, status, mfa_enrolled_at)
values (
  '51000000-0000-4000-8000-000000000101',
  'Operador G10', 'g10.operator@example.test', 'active', now()
);
insert into public.cms_user_roles (user_id, role_key)
values ('51000000-0000-4000-8000-000000000101', 'super_admin');
insert into public.cms_feature_flag_overrides (
  flag_key, environment, scope_type, scope_key, enabled, reason,
  starts_at, expires_at, created_by
) values (
  'ev2.ai_assist', 'local', 'user', '51000000-0000-4000-8000-000000000101', true,
  'Canary individual sintético G10', now() - interval '1 minute', now() + interval '29 minutes',
  '51000000-0000-4000-8000-000000000101'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '51000000-0000-4000-8000-000000000102',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'g10.reviewer@example.test', '', now(), '{}', '{}', now(), now()
);
insert into public.cms_profiles (user_id, display_name, display_email, status, mfa_enrolled_at)
values (
  '51000000-0000-4000-8000-000000000102',
  'Revisor G10', 'g10.reviewer@example.test', 'active', now()
);
insert into public.cms_user_roles (user_id, role_key)
values ('51000000-0000-4000-8000-000000000102', 'reviewer');
insert into public.cms_feature_flag_overrides (
  flag_key, environment, scope_type, scope_key, enabled, reason,
  starts_at, expires_at, created_by
) values (
  'ev2.ai_assist', 'local', 'user', '51000000-0000-4000-8000-000000000102', true,
  'Canary individual sintético G10 para revisão', now() - interval '1 minute', now() + interval '29 minutes',
  '51000000-0000-4000-8000-000000000101'
);

create function pg_temp.ai_command(
  p_action text,
  p_payload jsonb,
  p_actor_id uuid default '51000000-0000-4000-8000-000000000101',
  p_aal text default 'aal2',
  p_idempotency_key text default gen_random_uuid()::text,
  p_request_hash text default repeat('a', 64),
  p_command_id uuid default gen_random_uuid(),
  p_correlation_id uuid default gen_random_uuid()
) returns jsonb language sql as $$
  select public.cms_execute_ai_command(
    p_actor_id,
    p_action,
    p_payload,
    'local',
    'main',
    p_aal,
    'g10-operator-session',
    now() - interval '1 minute',
    p_command_id,
    p_correlation_id,
    p_idempotency_key,
    p_request_hash
  );
$$;

select is(
  (select count(*)::integer from pg_class where oid in (
    'public.cms_ai_policy_versions'::regclass,
    'public.cms_ai_tools'::regclass,
    'public.cms_ai_sessions'::regclass,
    'public.cms_ai_sources'::regclass,
    'public.cms_ai_messages'::regclass,
    'public.cms_ai_proposals'::regclass,
    'public.cms_ai_approvals'::regclass,
    'public.cms_ai_tool_calls'::regclass,
    'public.cms_ai_eval_runs'::regclass,
    'public.cms_ai_command_receipts'::regclass,
    'public.cms_ai_events'::regclass
  ) and relrowsecurity),
  11,
  'all EV2.10 tables enable RLS'
);
select isnt(has_table_privilege('anon', 'public.cms_ai_sessions', 'SELECT'), true, 'anon cannot read AI sessions');
select isnt(has_table_privilege('authenticated', 'public.cms_ai_sessions', 'SELECT'), true, 'authenticated cannot read AI sessions directly');
select isnt(has_table_privilege('authenticated', 'public.cms_ai_proposals', 'INSERT'), true, 'authenticated cannot forge proposals');
select isnt(
  has_function_privilege(
    'authenticated',
    'public.cms_execute_ai_command(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,text)',
    'EXECUTE'
  ),
  true,
  'authenticated cannot bypass the AI command boundary'
);
select is((select default_enabled from public.cms_feature_flags where flag_key = 'ev2.ai_assist'), false, 'assist flag remains off by default');
select is((select default_enabled from public.cms_feature_flags where flag_key = 'ev2.ai_execute'), false, 'execute flag remains off by default');
select is((select count(*)::integer from public.cms_ai_tools where active), 4, 'exactly four F-015 tools are active');
select is((select count(*)::integer from public.cms_ai_tools where mutates_cms), 0, 'no tool mutates the CMS');
select is((select provider_mode from public.cms_ai_policy_versions where version = 1), 'synthetic', 'provider is synthetic');
select is((select external_provider_enabled from public.cms_ai_policy_versions where version = 1), false, 'external provider is disabled');
select ok(
  to_regprocedure('private.cms_purge_expired_ai_data(integer)') is not null,
  'bounded retention purge is installed'
);
select is(
  (select count(*)::integer from cron.job where jobname = 'cms-ai-retention-every-5m'),
  1,
  'AI retention purge has exactly one five-minute schedule'
);
select is(
  (public.cms_ai_capability(
    '51000000-0000-4000-8000-000000000101', 'local', 'main', 'aal2',
    'g10-operator-session', now() - interval '1 minute'
  ) ->> 'enabled')::boolean,
  true,
  'one bounded individual override enables only the candidate'
);
select is(
  (public.cms_ai_capability(
    '51000000-0000-4000-8000-000000000101', 'production', 'main', 'aal2',
    'g10-operator-session', now() - interval '1 minute'
  ) ->> 'enabled')::boolean,
  false,
  'production capability fails closed'
);
select is(
  public.cms_ai_capability(
    '51000000-0000-4000-8000-000000000101', 'local', 'main', 'aal2',
    'g10-operator-session', now() - interval '1 minute'
  ) ->> 'providerMode',
  'synthetic',
  'capability exposes only the synthetic provider'
);
select ok(
  private.cms_ai_contains_sensitive_text('{"text":"qa@example.com"}'::jsonb),
  'database detects email before persistence'
);
select ok(
  private.cms_ai_contains_sensitive_text('{"text":"api_key: abcdefghijklmnop"}'::jsonb),
  'database detects credentials before persistence'
);
select ok(
  private.cms_ai_contains_sensitive_text('{"text":"(11) 99999-0000"}'::jsonb),
  'database detects phone numbers before persistence'
);
select ok(
  private.cms_ai_contains_sensitive_text(
    '{"text":"eyJabcdefghijk.abcdefghijklmno.abcdefghijklmnop"}'::jsonb
  ),
  'database detects JWT-like tokens before persistence'
);
select ok(
  private.cms_ai_contains_sensitive_text(
    '{"text":"-----BEGIN PRIVATE KEY----- material -----END PRIVATE KEY-----"}'::jsonb
  ),
  'database detects private-key material before persistence'
);
select isnt(
  private.cms_ai_contains_sensitive_text('{"text":"trecho totalmente sintético"}'::jsonb),
  true,
  'synthetic redacted text remains valid'
);

create temporary table g10_state (
  session_id uuid,
  proposal_id uuid,
  proposal_hash text
) on commit drop;
insert into g10_state (session_id)
select (pg_temp.ai_command(
  'start_session',
  '{"mode":"draft","title":"Sessão sintética G10","dataClass":"synthetic","tokenBudget":8000}',
  p_idempotency_key => 'g10-start-session-0001',
  p_command_id => '51000000-0000-4000-8000-000000000201'
) ->> 'sessionId')::uuid;
select is((select count(*)::integer from public.cms_ai_sessions), 1, 'session is created once');
select is(
  (
    pg_temp.ai_command(
      'start_session',
      '{"mode":"draft","title":"Sessão sintética G10","dataClass":"synthetic","tokenBudget":8000}',
      p_idempotency_key => 'g10-start-session-0001',
      p_command_id => '51000000-0000-4000-8000-000000000201'
    ) ->> 'sessionId'
  )::uuid,
  (select session_id from g10_state),
  'idempotent replay returns the original session'
);

update g10_state
set proposal_id = generated.proposal_id,
    proposal_hash = generated.proposal_hash
from (
  select
    (result ->> 'proposalId')::uuid as proposal_id,
    result ->> 'proposalHash' as proposal_hash
  from (
    select pg_temp.ai_command(
      'generate_proposal',
      jsonb_build_object(
        'sessionId', (select session_id from g10_state),
        'prompt', 'Extraia a faixa sintética.',
        'promptHash', repeat('b', 64),
        'risk', 'safe',
        'redactionCategories', '[]'::jsonb,
        'sourceKind', 'synthetic_document',
        'sourceRef', 'g10x-pgtap-source',
        'sourceTitle', 'Ficha sintética',
        'sourceVersion', 'v1',
        'sourceLocator', 'faixa',
        'sourcePage', 2,
        'sourceExcerpt', 'A faixa sintética vai de zero a cem unidades.',
        'sourceExcerptHash', repeat('c', 64),
        'proposalKind', 'draft_patch',
        'targetRef', 'g10x-pgtap-draft',
        'summary', 'Proposta sintética apoiada na fonte.',
        'fields', jsonb_build_array(jsonb_build_object(
          'path', 'draft.summary',
          'label', 'Resumo',
          'value', 'A faixa sintética vai de zero a cem unidades.',
          'sourceTitle', 'Ficha sintética',
          'sourceVersion', 'v1',
          'locator', 'faixa',
          'page', 2,
          'excerpt', 'A faixa sintética vai de zero a cem unidades.',
          'confidence', 0.98
        )),
        'diff', '{"before":"","after":"A faixa sintética vai de zero a cem unidades."}'::jsonb,
        'confidence', 0.98,
        'proposalHash', repeat('d', 64),
        'inputTokens', 20,
        'outputTokens', 15
      ),
      p_idempotency_key => 'g10-generate-proposal-0001',
      p_request_hash => repeat('e', 64),
      p_command_id => '51000000-0000-4000-8000-000000000202'
    ) as result
  ) command
) generated;
select is((select count(*)::integer from public.cms_ai_proposals), 1, 'one proposal is persisted');
select is((select cardinality(source_ids) from public.cms_ai_proposals), 1, 'proposal has an immutable source reference');
select is(
  (select fields -> 0 ->> 'status' from public.cms_ai_proposals),
  'supported',
  'high-confidence field is supported'
);
select is(
  (select fields -> 0 ->> 'sourceTitle' from public.cms_ai_proposals),
  'Ficha sintética',
  'field keeps source title and version metadata'
);
select is(
  (
    public.cms_get_ai_workspace(
      '51000000-0000-4000-8000-000000000101', 'local', 'main', 'aal2',
      'g10-operator-session', now() - interval '1 minute', gen_random_uuid()
    ) -> 'sessions' -> 0 ->> 'owned'
  )::boolean,
  true,
  'the author sees the session as owned and cannot use the review lane'
);
select is(
  (
    public.cms_get_ai_workspace(
      '51000000-0000-4000-8000-000000000102', 'local', 'main', 'aal2',
      'g10-reviewer-session', now() - interval '1 minute', gen_random_uuid()
    ) -> 'sessions' -> 0 ->> 'reviewable'
  )::boolean,
  true,
  'a segregated reviewer sees the proposal in the scoped review queue'
);
select throws_ok(
  $$select pg_temp.ai_command(
    'decide_proposal',
    jsonb_build_object(
      'proposalId', (select proposal_id from g10_state),
      'expectedProposalHash', (select proposal_hash from g10_state),
      'decision', 'accepted',
      'rationale', 'Tentativa de autoaprovação sintética.'
    ),
    p_idempotency_key => 'g10-self-review-000001',
    p_request_hash => repeat('1', 64),
    p_command_id => '51000000-0000-4000-8000-000000000204'
  )$$,
  'PT409',
  'CMS_AI_REVIEWER_SEPARATION_REQUIRED',
  'proposal authors cannot approve their own output'
);
select is(
  (pg_temp.ai_command(
    'decide_proposal',
    jsonb_build_object(
      'proposalId', (select proposal_id from g10_state),
      'expectedProposalHash', (select proposal_hash from g10_state),
      'decision', 'accepted',
      'rationale', 'Fonte sintética conferida manualmente.'
    ),
    p_actor_id => '51000000-0000-4000-8000-000000000102',
    p_idempotency_key => 'g10-decide-proposal-0001',
    p_request_hash => repeat('f', 64),
    p_command_id => '51000000-0000-4000-8000-000000000203'
  ) ->> 'applied')::boolean,
  false,
  'human decision never applies content'
);
select is((select applied from public.cms_ai_approvals), false, 'approval record is explicitly non-applied');
select is((select count(*)::integer from public.cms_ai_messages), 2, 'request and response are both audited');
select is((select status from public.cms_ai_tool_calls), 'succeeded', 'allowlisted tool call is reconciled');
select is((select cost_micros from public.cms_ai_tool_calls), 0::bigint, 'synthetic tool cost is zero');
select throws_ok(
  $$select pg_temp.ai_command(
    'start_session',
    '{"mode":"read","title":"qa@example.com","dataClass":"synthetic","tokenBudget":100}',
    p_idempotency_key => 'g10-sensitive-input-0001'
  )$$,
  '22023',
  'CMS_AI_UNREDACTED_DATA',
  'unredacted personal data fails at the database boundary'
);
select throws_ok(
  $$select pg_temp.ai_command(
    'start_session',
    '{"mode":"read","title":"Sessão sem MFA","dataClass":"synthetic","tokenBudget":100}',
    p_aal => 'aal1',
    p_idempotency_key => 'g10-no-mfa-00000001'
  )$$,
  '42501',
  'CMS_AI_MFA_REQUIRED',
  'all AI mutations require MFA'
);

insert into public.cms_feature_flag_overrides (
  flag_key, environment, scope_type, scope_key, enabled, reason,
  starts_at, expires_at, created_by
) values (
  'ev2.ai_assist', 'local', 'environment', 'local', true,
  'Teste negativo de ativação ampla G10', now() - interval '1 minute', now() + interval '5 minutes',
  '51000000-0000-4000-8000-000000000101'
);
select is(
  public.cms_ai_capability(
    '51000000-0000-4000-8000-000000000101', 'local', 'main', 'aal2',
    'g10-operator-session', now() - interval '1 minute'
  ) ->> 'source',
  'broad_activation_not_supported',
  'any broad override makes the candidate fail closed'
);
select is((select count(*)::integer from public.cms_ai_events), 3, 'every successful mutation has one event');
select is((select count(*)::integer from public.cms_ai_command_receipts where completed_at is not null), 3, 'receipts reconcile successful mutations');

update public.cms_ai_sessions
set created_at = now() - interval '25 hours',
    updated_at = now() - interval '25 hours',
    expires_at = now() - interval '24 hours 45 minutes',
    retention_until = now() - interval '1 hour';
select is(
  (private.cms_purge_expired_ai_data(100) ->> 'expiredSessionsSelected')::integer,
  1,
  'retention purge selects the expired session'
);
select is(
  (
    (select count(*) from public.cms_ai_sessions) +
    (select count(*) from public.cms_ai_sources) +
    (select count(*) from public.cms_ai_messages) +
    (select count(*) from public.cms_ai_proposals) +
    (select count(*) from public.cms_ai_approvals) +
    (select count(*) from public.cms_ai_tool_calls) +
    (select count(*) from public.cms_ai_events)
  )::integer,
  0,
  'retention purge removes the complete session graph in referential order'
);

select * from finish();
rollback;
