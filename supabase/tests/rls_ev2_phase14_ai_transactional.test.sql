begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(52);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '51400000-0000-4000-8000-000000000101',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'g14.operator@example.test', '', now(), '{}', '{}', now(), now()
  ),
  (
    '51400000-0000-4000-8000-000000000102',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'g14.reviewer@example.test', '', now(), '{}', '{}', now(), now()
  );

insert into public.cms_profiles (user_id, display_name, display_email, status, mfa_enrolled_at)
values
  ('51400000-0000-4000-8000-000000000101', 'Operador G14', 'g14.operator@example.test', 'active', now()),
  ('51400000-0000-4000-8000-000000000102', 'Revisor G14', 'g14.reviewer@example.test', 'active', now());
insert into public.cms_user_roles (user_id, role_key)
values
  ('51400000-0000-4000-8000-000000000101', 'super_admin'),
  ('51400000-0000-4000-8000-000000000102', 'reviewer');

insert into public.cms_feature_flag_overrides (
  flag_key, environment, scope_type, scope_key, enabled, reason,
  starts_at, expires_at, created_by
)
select flag_key, 'local', 'user', actor_id::text, true, 'Canary individual sintético G14',
       now() - interval '1 minute', now() + interval '29 minutes',
       '51400000-0000-4000-8000-000000000101'
from (values
  ('ev2.ai_assist', '51400000-0000-4000-8000-000000000101'::uuid),
  ('ev2.ai_execute', '51400000-0000-4000-8000-000000000101'::uuid),
  ('ev2.ai_assist', '51400000-0000-4000-8000-000000000102'::uuid),
  ('ev2.ai_execute', '51400000-0000-4000-8000-000000000102'::uuid)
) flags(flag_key, actor_id);

create function pg_temp.g14_command(
  p_action text,
  p_payload jsonb,
  p_actor_id uuid default '51400000-0000-4000-8000-000000000101',
  p_idempotency_key text default gen_random_uuid()::text,
  p_request_hash text default repeat('a', 64),
  p_command_id uuid default gen_random_uuid(),
  p_correlation_id uuid default gen_random_uuid()
) returns jsonb language sql as $$
  select public.cms_execute_ai_transaction_command(
    p_actor_id, p_action, p_payload, 'local', 'main', 'aal2',
    'g14-synthetic-session', now() - interval '1 minute',
    p_command_id, p_correlation_id, p_idempotency_key, p_request_hash
  );
$$;

select is(
  (select count(*)::integer from pg_class where oid in (
    'public.cms_ai_execution_tools'::regclass,
    'public.cms_ai_synthetic_targets'::regclass,
    'public.cms_ai_execution_plans'::regclass,
    'public.cms_ai_execution_approvals'::regclass,
    'public.cms_ai_execution_runs'::regclass,
    'public.cms_ai_execution_run_steps'::regclass,
    'public.cms_ai_execution_policy_decisions'::regclass
  ) and relrowsecurity),
  7,
  'all EV2.14 tables enable RLS'
);
select isnt(has_table_privilege('anon', 'public.cms_ai_execution_plans', 'SELECT'), true, 'anon cannot read plans');
select isnt(has_table_privilege('authenticated', 'public.cms_ai_synthetic_targets', 'INSERT'), true, 'authenticated cannot forge targets');
select isnt(
  has_function_privilege(
    'authenticated',
    'public.cms_execute_ai_transaction_command(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,text)',
    'EXECUTE'
  ),
  true,
  'authenticated cannot bypass the transactional gateway'
);
select is((select count(*)::integer from public.cms_ai_execution_tools where active), 5, 'five closed tools are active');
select is(
  (select count(*)::integer from public.cms_ai_execution_tools where synthetic_only and reversible),
  5,
  'every transactional tool is synthetic and reversible'
);
select is((select default_enabled from public.cms_feature_flags where flag_key = 'ev2.ai_assist'), false, 'assist remains default-off');
select is((select default_enabled from public.cms_feature_flags where flag_key = 'ev2.ai_execute'), false, 'execute remains default-off');
select is(
  (public.cms_ai_execute_capability(
    '51400000-0000-4000-8000-000000000101', 'local', 'main', 'aal2',
    'g14-operator-session', now() - interval '1 minute'
  ) ->> 'enabled')::boolean,
  true,
  'planner with both individual overrides is enabled'
);
select is(
  (public.cms_ai_execute_capability(
    '51400000-0000-4000-8000-000000000102', 'local', 'main', 'aal2',
    'g14-reviewer-session', now() - interval '1 minute'
  ) ->> 'enabled')::boolean,
  true,
  'reviewer with both individual overrides is enabled'
);
select is(
  (public.cms_ai_execute_capability(
    '51400000-0000-4000-8000-000000000101', 'production', 'main', 'aal2',
    'g14-operator-session', now() - interval '1 minute'
  ) ->> 'enabled')::boolean,
  false,
  'production fails closed'
);
select is(
  public.cms_ai_execute_capability(
    '51400000-0000-4000-8000-000000000101', 'local', 'main', 'aal2',
    'g14-operator-session', now() - interval '1 minute'
  ) ->> 'source',
  'individual_overrides',
  'capability reports the exact dual override source'
);

insert into public.cms_feature_flag_overrides (
  flag_key, environment, scope_type, scope_key, enabled, reason,
  starts_at, expires_at, created_by
) values (
  'ev2.ai_execute', 'local', 'environment', 'local', true,
  'Teste transacional fail-closed G14', now() - interval '1 minute',
  now() + interval '5 minutes', '51400000-0000-4000-8000-000000000101'
);
select is(
  (public.cms_ai_execute_capability(
    '51400000-0000-4000-8000-000000000101', 'local', 'main', 'aal2',
    'g14-operator-session', now() - interval '1 minute'
  ) ->> 'enabled')::boolean,
  false,
  'an active broad override fails closed'
);
select is(
  public.cms_ai_execute_capability(
    '51400000-0000-4000-8000-000000000101', 'local', 'main', 'aal2',
    'g14-operator-session', now() - interval '1 minute'
  ) ->> 'source',
  'broad_activation_not_supported',
  'capability reports that broad activation is unsupported'
);
delete from public.cms_feature_flag_overrides
where flag_key = 'ev2.ai_execute' and scope_type = 'environment' and scope_key = 'local';

update public.cms_feature_flag_overrides set enabled = false
where flag_key = 'ev2.ai_execute' and scope_key = '51400000-0000-4000-8000-000000000101';
select is(
  (public.cms_ai_execute_capability(
    '51400000-0000-4000-8000-000000000101', 'local', 'main', 'aal2',
    'g14-operator-session', now() - interval '1 minute'
  ) ->> 'enabled')::boolean,
  false,
  'execute override is independently required'
);
update public.cms_feature_flag_overrides set enabled = true
where flag_key = 'ev2.ai_execute' and scope_key = '51400000-0000-4000-8000-000000000101';
select is(
  (public.cms_ai_execute_capability(
    '51400000-0000-4000-8000-000000000101', 'local', 'main', 'aal2',
    'g14-operator-session', now() - interval '1 minute'
  ) ->> 'enabled')::boolean,
  true,
  'restoring the bounded override restores eligibility'
);
select is(
  pg_temp.g14_command(
    'record_denial',
    '{"reasonCode":"CMS_AI_EXECUTE_PLAN_CONFLICT","categories":["database_policy_denial"]}'
  ) ->> 'status',
  'denied',
  'gateway can persist a sanitized database denial in a separate transaction'
);
select is(
  (select count(*)::integer from public.cms_ai_execution_policy_decisions
   where actor_id = '51400000-0000-4000-8000-000000000101'
     and decision = 'deny' and reason_code = 'CMS_AI_EXECUTE_PLAN_CONFLICT'),
  1,
  'sanitized denial reason is auditable'
);

create temporary table g14_state (
  target_ref text,
  plan_id uuid,
  plan_hash text,
  run_id uuid,
  second_plan_id uuid,
  second_plan_hash text
) on commit drop;

insert into g14_state (target_ref)
values ('g14x-pgtap-target');
select is(
  pg_temp.g14_command(
    'create_target',
    '{"targetRef":"g14x-pgtap-target","title":"Alvo sintético pgTAP","payload":{"summary":"Estado sintético inicial"}}'
  ) ->> 'status',
  'draft',
  'target creation is explicit and synthetic'
);
select is((select data_class from public.cms_ai_synthetic_targets where target_ref = 'g14x-pgtap-target'), 'synthetic', 'target is synthetic');
select is((select version from public.cms_ai_synthetic_targets where target_ref = 'g14x-pgtap-target'), 1::bigint, 'target starts at version one');

update g14_state set
  plan_id = (result ->> 'planId')::uuid,
  plan_hash = result ->> 'planHash'
from (
  select pg_temp.g14_command(
    'create_plan',
    '{
      "title":"Plano crítico sintético G14",
      "steps":[
        {"stepKey":"step-patch","toolKey":"draft.apply_patch","targetRef":"g14x-pgtap-target","expectedVersion":1,"arguments":{"patch":{"summary":"Estado sintético revisado"}}},
        {"stepKey":"step-submit","toolKey":"workflow.submit","targetRef":"g14x-pgtap-target","expectedVersion":2,"arguments":{}},
        {"stepKey":"step-publish","toolKey":"release.publish","targetRef":"g14x-pgtap-target","expectedVersion":3,"arguments":{}}
      ]
    }'
  ) result
) created;
select is((select status from public.cms_ai_execution_plans where id = (select plan_id from g14_state)), 'ready', 'plan is ready after dry-run');
select matches((select plan_hash from g14_state), '^[0-9a-f]{64}$', 'plan receives immutable hash');
select is((select dry_run ->> 'risk' from public.cms_ai_execution_plans where id = (select plan_id from g14_state)), 'critical', 'dry-run raises risk to critical');
select is((select (dry_run ->> 'stepCount')::integer from public.cms_ai_execution_plans where id = (select plan_id from g14_state)), 3, 'dry-run records every step');

select throws_ok(
  $$select pg_temp.g14_command(
    'approve_plan',
    jsonb_build_object('planId',(select plan_id from g14_state),'expectedPlanHash',(select plan_hash from g14_state),'decision','approved','rationale','Autoaprovação proibida')
  )$$,
  'PT409', 'CMS_AI_EXECUTE_REVIEWER_SEPARATION_REQUIRED',
  'planner cannot approve the own plan'
);
select throws_ok(
  $$select pg_temp.g14_command(
    'approve_plan',
    jsonb_build_object('planId',(select plan_id from g14_state),'expectedPlanHash',repeat('f',64),'decision','approved','rationale','Hash incorreto'),
    '51400000-0000-4000-8000-000000000102'
  )$$,
  'PT409', 'CMS_AI_EXECUTE_PLAN_CONFLICT',
  'reviewer cannot approve a changed hash'
);
select is(
  pg_temp.g14_command(
    'approve_plan',
    jsonb_build_object('planId',(select plan_id from g14_state),'expectedPlanHash',(select plan_hash from g14_state),'decision','approved','rationale','Dry-run crítico conferido'),
    '51400000-0000-4000-8000-000000000102'
  ) ->> 'status',
  'approved',
  'distinct reviewer approves the exact hash'
);
select is((select count(*)::integer from public.cms_ai_execution_approvals where plan_id = (select plan_id from g14_state) and status = 'active'), 1, 'one bounded execution approval exists');
select is(
  (select (item ->> 'executable')::boolean
   from jsonb_array_elements(public.cms_get_ai_execution_workspace(
     '51400000-0000-4000-8000-000000000101', 'local', 'main', 'aal2',
     'g14-operator-session', now() - interval '1 minute', gen_random_uuid()
   ) -> 'plans') item
   where item ->> 'id' = (select plan_id::text from g14_state)),
  true,
  'workspace exposes execution only while the exact approval is active'
);

update g14_state set run_id = (result ->> 'runId')::uuid
from (
  select pg_temp.g14_command(
    'execute_plan',
    jsonb_build_object('planId',(select plan_id from g14_state),'expectedPlanHash',(select plan_hash from g14_state)),
    '51400000-0000-4000-8000-000000000101',
    'g14-pgtap-execute',
    repeat('5',64),
    '51400000-0000-4000-8000-000000000301',
    '51400000-0000-4000-8000-000000000401'
  ) result
) executed;
select is(
  (pg_temp.g14_command(
    'execute_plan',
    jsonb_build_object('planId',(select plan_id from g14_state),'expectedPlanHash',(select plan_hash from g14_state)),
    '51400000-0000-4000-8000-000000000101',
    'g14-pgtap-execute',
    repeat('5',64),
    '51400000-0000-4000-8000-000000000301',
    '51400000-0000-4000-8000-000000000401'
  ) ->> 'runId')::uuid,
  (select run_id from g14_state),
  'identical replay returns the original run'
);
select is((select result ->> 'applied' from public.cms_ai_execution_runs where id = (select run_id from g14_state)), 'true', 'execution applies the synthetic plan');
select is((select result ->> 'published' from public.cms_ai_execution_runs where id = (select run_id from g14_state)), 'true', 'publication marker is synthetic and explicit');
select is((select lifecycle from public.cms_ai_synthetic_targets where target_ref = 'g14x-pgtap-target'), 'published', 'target reaches synthetic published state');
select is((select version from public.cms_ai_synthetic_targets where target_ref = 'g14x-pgtap-target'), 4::bigint, 'version advances once per step');
select is((select status from public.cms_ai_execution_runs where id = (select run_id from g14_state)), 'succeeded', 'run succeeds atomically');
select is((select status from public.cms_ai_execution_approvals where plan_id = (select plan_id from g14_state) and purpose = 'execute'), 'consumed', 'execution consumes its approval');

select throws_ok(
  $$select pg_temp.g14_command(
    'approve_compensation',
    jsonb_build_object('runId',(select run_id from g14_state),'expectedPlanHash',(select plan_hash from g14_state),'rationale','Operador não pode aprovar a própria compensação')
  )$$,
  'PT409', 'CMS_AI_EXECUTE_REVIEWER_SEPARATION_REQUIRED',
  'executor cannot approve compensation for the own run'
);
select is(
  pg_temp.g14_command(
    'approve_compensation',
    jsonb_build_object('runId',(select run_id from g14_state),'expectedPlanHash',(select plan_hash from g14_state),'rationale','Restauração sintética conferida'),
    '51400000-0000-4000-8000-000000000102'
  ) ->> 'status',
  'compensation_approved',
  'distinct reviewer approves compensation'
);
select is(
  (select (item ->> 'compensatable')::boolean
   from jsonb_array_elements(public.cms_get_ai_execution_workspace(
     '51400000-0000-4000-8000-000000000101', 'local', 'main', 'aal2',
     'g14-operator-session', now() - interval '1 minute', gen_random_uuid()
   ) -> 'plans') item
   where item ->> 'id' = (select plan_id::text from g14_state)),
  true,
  'workspace exposes compensation only after an exact active approval'
);
select is(
  pg_temp.g14_command(
    'compensate_run',
    jsonb_build_object('runId',(select run_id from g14_state),'expectedPlanHash',(select plan_hash from g14_state))
  ) ->> 'status',
  'compensated',
  'operator executes the approved compensation'
);
select is((select lifecycle from public.cms_ai_synthetic_targets where target_ref = 'g14x-pgtap-target'), 'draft', 'compensation restores lifecycle');
select is((select payload ->> 'summary' from public.cms_ai_synthetic_targets where target_ref = 'g14x-pgtap-target'), 'Estado sintético inicial', 'compensation restores payload');
select is((select version from public.cms_ai_synthetic_targets where target_ref = 'g14x-pgtap-target'), 5::bigint, 'compensation preserves monotonic versioning');
select is((select count(*)::integer from public.cms_ai_execution_run_steps where run_id = (select run_id from g14_state) and status = 'compensated'), 3, 'all executed steps are marked compensated');

select throws_ok(
  $$select pg_temp.g14_command(
    'create_target',
    '{"targetRef":"g14x-sensitive","title":"Alvo sintético sensível","payload":{"summary":"Contato qa@example.com"}}'
  )$$,
  '22023', 'CMS_AI_EXECUTE_SYNTHETIC_DATA_REQUIRED',
  'database rejects residual personal data'
);

update g14_state set
  second_plan_id = (result ->> 'planId')::uuid,
  second_plan_hash = result ->> 'planHash'
from (
  select pg_temp.g14_command(
    'create_plan',
    '{"title":"Plano revisável G14","steps":[{"stepKey":"step-second","toolKey":"draft.apply_patch","targetRef":"g14x-pgtap-target","expectedVersion":5,"arguments":{"patch":{"summary":"Segunda versão sintética"}}}]}'
  ) result
) created;
select lives_ok(
  $$select pg_temp.g14_command(
    'approve_plan',
    jsonb_build_object('planId',(select second_plan_id from g14_state),'expectedPlanHash',(select second_plan_hash from g14_state),'decision','approved','rationale','Primeira versão aprovada'),
    '51400000-0000-4000-8000-000000000102'
  )$$,
  'approval setup for revision succeeds'
);
select isnt(
  pg_temp.g14_command(
    'revise_plan',
    jsonb_build_object(
      'planId',(select second_plan_id from g14_state),
      'expectedPlanHash',(select second_plan_hash from g14_state),
      'title','Plano revisável G14',
      'steps','[{"stepKey":"step-second","toolKey":"draft.apply_patch","targetRef":"g14x-pgtap-target","expectedVersion":5,"arguments":{"patch":{"summary":"Versão sintética alterada"}}}]'::jsonb
    )
  ) ->> 'planHash',
  (select second_plan_hash from g14_state),
  'revision changes the immutable plan hash'
);
select is((select status from public.cms_ai_execution_plans where id = (select second_plan_id from g14_state)), 'ready', 'revised plan returns to review');
select is((select status from public.cms_ai_execution_approvals where plan_id = (select second_plan_id from g14_state) and purpose = 'execute'), 'expired', 'revision expires the old approval');
select throws_ok(
  $$select pg_temp.g14_command(
    'execute_plan',
    jsonb_build_object('planId',(select second_plan_id from g14_state),'expectedPlanHash',(select plan_hash from public.cms_ai_execution_plans where id = (select second_plan_id from g14_state)))
  )$$,
  'PT409', 'CMS_AI_EXECUTE_PLAN_CONFLICT',
  'revised plan cannot execute without a new approval'
);
select is((select count(*)::integer from public.cms_ai_synthetic_targets where environment = 'production'), 0, 'no production target can exist');

select * from finish();
rollback;
