begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(48);

select has_table('public','cms_ai_provider_policy',
  'AI has a canonical provider policy');
select has_column('public','cms_ai_synthetic_targets','qa_actor_id',
  'execution targets persist authoritative QA provenance');
select has_function('private','cms_ai_actor_row_scope_allowed',
  array['uuid','uuid','timestamp with time zone','text'],
  'AI row scope is derived server-side');
select has_function('private','cms_ai_target_scope_allowed',array['uuid','text','text'],
  'execution target IDOR checks are server-side');
select has_function('private','cms_ai_session_scope_allowed',array['uuid','uuid','text'],
  'assistant session IDOR checks are server-side');
select has_function('private','cms_ai_plan_scope_allowed',array['uuid','uuid','text'],
  'execution plan graph checks are server-side');
select has_function('public','cms_record_ai_provider_call_scoped',array[
  'uuid','uuid','text','text','text','text','timestamp with time zone','text','text',
  'integer','integer','text','text','uuid'
],'provider evidence has a scoped writer');
select has_function('public','cms_ai_capability',
  array['uuid','text','text','text','text','timestamp with time zone'],
  'F-015 capability keeps its deployed signature');
select has_function('public','cms_get_ai_workspace',
  array['uuid','text','text','text','text','timestamp with time zone','uuid'],
  'F-015 workspace keeps its deployed signature');
select has_function('public','cms_execute_ai_command',array[
  'uuid','text','jsonb','text','text','text','text','timestamp with time zone',
  'uuid','uuid','text','text'
],'F-015 command keeps its deployed signature');
select has_function('public','cms_ai_execute_capability',
  array['uuid','text','text','text','text','timestamp with time zone'],
  'F-016 capability keeps its deployed signature');
select has_function('public','cms_get_ai_execution_workspace',
  array['uuid','text','text','text','text','timestamp with time zone','uuid'],
  'F-016 workspace keeps its deployed signature');
select has_function('public','cms_execute_ai_transaction_command',array[
  'uuid','text','jsonb','text','text','text','text','timestamp with time zone',
  'uuid','uuid','text','text'
],'F-016 command keeps its deployed signature');
select is(has_function_privilege(
  'service_role',
  'public.cms_record_ai_provider_call_scoped(uuid,uuid,text,text,text,text,timestamptz,text,text,integer,integer,text,text,uuid)',
  'EXECUTE'
),true,'only the trusted Edge boundary can record provider evidence');
select isnt(has_function_privilege(
  'authenticated',
  'public.cms_record_ai_provider_call_scoped(uuid,uuid,text,text,text,text,timestamptz,text,text,integer,integer,text,text,uuid)',
  'EXECUTE'
),true,'clients cannot forge provider evidence');
select isnt(has_function_privilege(
  'service_role',
  'public.cms_execute_ai_command_unscoped_0075(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,text)',
  'EXECUTE'
),true,'service role cannot invoke the legacy F-015 bypass');
select isnt(has_function_privilege(
  'service_role',
  'public.cms_execute_ai_transaction_command_unscoped_0075(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,text)',
  'EXECUTE'
),true,'service role cannot invoke the legacy F-016 bypass');
select isnt(has_table_privilege('authenticated','public.cms_ai_sessions','SELECT'),true,
  'clients cannot bypass scoped readers with direct session queries');
select isnt(has_table_privilege('authenticated','public.cms_ai_synthetic_targets','SELECT'),true,
  'clients cannot bypass scoped readers with direct target queries');
select is((select provider from public.cms_ai_provider_policy),'openrouter',
  'OpenRouter is the sole configured provider');
select is((select model_key from public.cms_ai_provider_policy),
  'nvidia/nemotron-3.5-lightning:free','the canonical free Nemotron model is pinned');
select is((select automatic_publish_allowed from public.cms_ai_provider_policy),false,
  'AI policy never permits automatic publication');
select is((select direct_database_access_allowed from public.cms_ai_provider_policy),false,
  'AI policy never permits direct database access');

insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
('75000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','ai75-corporate@example.test','',now(),'{}',
 '{"synthetic":false,"purpose":"ordinary-operator"}',now(),now()),
('75000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','ai75-qa-one@example.test','',now(),'{}',
 '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-aaaaaaaa","candidateSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","environment":"staging"}',now(),now()),
('75000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','ai75-qa-peer@example.test','',now(),'{}',
 '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-aaaaaaaa","candidateSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","environment":"staging"}',now(),now()),
('75000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','ai75-qa-other@example.test','',now(),'{}',
 '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-bbbbbbbb","candidateSha":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","environment":"staging"}',now(),now());

insert into public.cms_profiles(user_id,display_name,status) values
('75000000-0000-4000-8000-000000000001','AI 75 corporate','active'),
('75000000-0000-4000-8000-000000000002','AI 75 QA one','active'),
('75000000-0000-4000-8000-000000000003','AI 75 QA peer','active'),
('75000000-0000-4000-8000-000000000004','AI 75 QA other','active');
insert into public.cms_user_roles(user_id,role_key) values
('75000000-0000-4000-8000-000000000001','super_admin'),
('75000000-0000-4000-8000-000000000002','super_admin'),
('75000000-0000-4000-8000-000000000003','super_admin'),
('75000000-0000-4000-8000-000000000004','super_admin');
insert into private.cms_qa_actor_leases(
  actor_id,run_tag,candidate_sha,environment,status,created_at,expires_at
) values
('75000000-0000-4000-8000-000000000002','QA-CMS-FINAL-20260907-aaaaaaaa',
 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','staging','active',
 transaction_timestamp()-interval '1 minute',statement_timestamp()+interval '90 minutes'),
('75000000-0000-4000-8000-000000000003','QA-CMS-FINAL-20260907-aaaaaaaa',
 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','staging','active',
 transaction_timestamp()-interval '1 minute',statement_timestamp()+interval '90 minutes'),
('75000000-0000-4000-8000-000000000004','QA-CMS-FINAL-20260907-bbbbbbbb',
 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','staging','active',
 transaction_timestamp()-interval '1 minute',statement_timestamp()+interval '90 minutes');

select set_config('cms.qa_mutation_actor_id','75000000-0000-4000-8000-000000000001',true);
insert into public.cms_ai_synthetic_targets(
  target_ref,title,environment,site_key,payload,created_by,updated_by
) values (
  'g14x-ai75-corporate','AI 75 corporate target','staging','main','{"summary":"corporate"}',
  '75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000001'
);
select set_config('cms.qa_mutation_actor_id','75000000-0000-4000-8000-000000000002',true);
insert into public.cms_ai_synthetic_targets(
  target_ref,title,environment,site_key,payload,created_by,updated_by
) values (
  'g14x-ai75-qa-one','AI 75 same-run target','staging','main','{"summary":"qa-one"}',
  '75000000-0000-4000-8000-000000000002','75000000-0000-4000-8000-000000000002'
);
select set_config('cms.qa_mutation_actor_id','75000000-0000-4000-8000-000000000003',true);
insert into public.cms_ai_synthetic_targets(
  target_ref,title,environment,site_key,payload,created_by,updated_by
) values (
  'g14x-ai75-qa-peer','AI 75 peer target','staging','main','{"summary":"qa-peer"}',
  '75000000-0000-4000-8000-000000000003','75000000-0000-4000-8000-000000000003'
);
select set_config('cms.qa_mutation_actor_id','75000000-0000-4000-8000-000000000004',true);
insert into public.cms_ai_synthetic_targets(
  target_ref,title,environment,site_key,payload,created_by,updated_by
) values (
  'g14x-ai75-qa-other','AI 75 other-run target','staging','main','{"summary":"qa-other"}',
  '75000000-0000-4000-8000-000000000004','75000000-0000-4000-8000-000000000004'
);

select is((select qa_actor_id from public.cms_ai_synthetic_targets
  where target_ref='g14x-ai75-qa-one'),
  '75000000-0000-4000-8000-000000000002'::uuid,
  'target QA actor is derived from the lease');
select is((select qa_run_tag from public.cms_ai_synthetic_targets
  where target_ref='g14x-ai75-qa-one'),
  'QA-CMS-FINAL-20260907-aaaaaaaa','target run is derived from the lease');
select throws_ok($call$
  insert into public.cms_ai_synthetic_targets(
    target_ref,title,environment,site_key,created_by,updated_by,
    qa_actor_id,qa_run_tag,qa_candidate_sha,qa_environment
  ) values (
    'g14x-ai75-forged','AI 75 forged target','staging','main',
    '75000000-0000-4000-8000-000000000002','75000000-0000-4000-8000-000000000002',
    '75000000-0000-4000-8000-000000000004','QA-CMS-FINAL-20260907-bbbbbbbb',
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','staging'
  )
$call$,'42501','CMS_AI_EXECUTE_PROVENANCE_INVALID',
  'payload cannot forge a different QA run marker');
select is(private.cms_ai_target_scope_allowed(
  '75000000-0000-4000-8000-000000000002','g14x-ai75-qa-one','staging'
),true,'QA can read its exact-run target');
select is(private.cms_ai_target_scope_allowed(
  '75000000-0000-4000-8000-000000000002','g14x-ai75-qa-peer','staging'
),true,'QA can read a same-run peer target');
select is(private.cms_ai_target_scope_allowed(
  '75000000-0000-4000-8000-000000000002','g14x-ai75-qa-other','staging'
),false,'QA cannot read another run target by ID');
select is(private.cms_ai_target_scope_allowed(
  '75000000-0000-4000-8000-000000000002','g14x-ai75-corporate','staging'
),false,'QA cannot read a corporate target by ID');
select is(private.cms_ai_target_scope_allowed(
  '75000000-0000-4000-8000-000000000001','g14x-ai75-qa-one','staging'
),false,'corporate cannot read an ever-QA target by ID');
select is(private.cms_ai_target_scope_allowed(
  '75000000-0000-4000-8000-000000000001','g14x-ai75-corporate','staging'
),true,'corporate retains its ordinary target access');
select is(private.cms_ai_target_scope_allowed(
  '75000000-0000-4000-8000-000000000002','g14x-ai75-qa-one','production'
),false,'a staging lease cannot be replayed in production');

select set_config('cms.qa_mutation_actor_id','75000000-0000-4000-8000-000000000001',true);
insert into public.cms_ai_sessions(
  id,actor_id,environment,site_key,mode,title,policy_version,token_budget,
  correlation_id,expires_at,retention_until
) values (
  '75000000-0000-4000-8000-000000000101','75000000-0000-4000-8000-000000000001',
  'staging','main','read','AI 75 corporate session',1,8000,
  '75000000-0000-4000-8000-000000000111',statement_timestamp()+interval '20 minutes',
  statement_timestamp()+interval '23 hours'
);
select set_config('cms.qa_mutation_actor_id','75000000-0000-4000-8000-000000000002',true);
insert into public.cms_ai_sessions(
  id,actor_id,environment,site_key,mode,title,policy_version,token_budget,
  correlation_id,expires_at,retention_until
) values (
  '75000000-0000-4000-8000-000000000102','75000000-0000-4000-8000-000000000002',
  'staging','main','draft','AI 75 QA session',1,8000,
  '75000000-0000-4000-8000-000000000112',statement_timestamp()+interval '20 minutes',
  statement_timestamp()+interval '23 hours'
);
select set_config('cms.qa_mutation_actor_id','75000000-0000-4000-8000-000000000004',true);
insert into public.cms_ai_sessions(
  id,actor_id,environment,site_key,mode,title,policy_version,token_budget,
  correlation_id,expires_at,retention_until
) values (
  '75000000-0000-4000-8000-000000000104','75000000-0000-4000-8000-000000000004',
  'staging','main','draft','AI 75 other run session',1,8000,
  '75000000-0000-4000-8000-000000000114',statement_timestamp()+interval '20 minutes',
  statement_timestamp()+interval '23 hours'
);

select is((select provider_mode from public.cms_ai_sessions
  where id='75000000-0000-4000-8000-000000000102'),
  'openrouter','new sessions persist only the canonical provider');
select is(private.cms_ai_session_scope_allowed(
  '75000000-0000-4000-8000-000000000002','75000000-0000-4000-8000-000000000102','staging'
),true,'QA can read its session');
select is(private.cms_ai_session_scope_allowed(
  '75000000-0000-4000-8000-000000000003','75000000-0000-4000-8000-000000000102','staging'
),true,'same-run QA reviewer can read the session');
select is(private.cms_ai_session_scope_allowed(
  '75000000-0000-4000-8000-000000000004','75000000-0000-4000-8000-000000000102','staging'
),false,'cross-run QA cannot read the session by UUID');
select is(private.cms_ai_session_scope_allowed(
  '75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000102','staging'
),false,'corporate cannot read a QA session by UUID');
select is(private.cms_ai_session_scope_allowed(
  '75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000101','staging'
),true,'corporate can read its ordinary session');

select set_config('cms.qa_mutation_actor_id','75000000-0000-4000-8000-000000000002',true);
insert into public.cms_ai_execution_plans(
  id,title,environment,site_key,status,risk_class,plan_hash,steps,dry_run,
  created_by,correlation_id,expires_at
) values (
  '75000000-0000-4000-8000-000000000201','AI 75 same-run plan','staging','main',
  'ready','draft',repeat('c',64),
  '[{"stepKey":"step-ai75-peer","toolKey":"draft.apply_patch","targetRef":"g14x-ai75-qa-peer","expectedVersion":1,"arguments":{"patch":{"summary":"same run"}}}]',
  '{"valid":true,"reversible":true,"stepCount":1,"targetCount":1,"risk":"draft"}',
  '75000000-0000-4000-8000-000000000002','75000000-0000-4000-8000-000000000211',
  statement_timestamp()+interval '20 minutes'
);
select set_config('cms.qa_mutation_actor_id','75000000-0000-4000-8000-000000000001',true);
insert into public.cms_ai_execution_plans(
  id,title,environment,site_key,status,risk_class,plan_hash,steps,dry_run,
  created_by,correlation_id,expires_at
) values (
  '75000000-0000-4000-8000-000000000202','AI 75 corporate plan','staging','main',
  'ready','draft',repeat('d',64),
  '[{"stepKey":"step-ai75-corp","toolKey":"draft.apply_patch","targetRef":"g14x-ai75-corporate","expectedVersion":1,"arguments":{"patch":{"summary":"corporate"}}}]',
  '{"valid":true,"reversible":true,"stepCount":1,"targetCount":1,"risk":"draft"}',
  '75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000212',
  statement_timestamp()+interval '20 minutes'
);

select is(private.cms_ai_plan_scope_allowed(
  '75000000-0000-4000-8000-000000000002','75000000-0000-4000-8000-000000000201','staging'
),true,'QA can read a plan whose target belongs to a same-run peer');
select is(private.cms_ai_plan_scope_allowed(
  '75000000-0000-4000-8000-000000000004','75000000-0000-4000-8000-000000000201','staging'
),false,'cross-run QA cannot read the plan by UUID');
select is(private.cms_ai_plan_scope_allowed(
  '75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000201','staging'
),false,'corporate cannot read a QA plan by UUID');
select is(private.cms_ai_plan_scope_allowed(
  '75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000202','staging'
),true,'corporate can read its ordinary plan');
select ok(private.cms_ai_plan_actor_ids('75000000-0000-4000-8000-000000000201')
  @> array[
    '75000000-0000-4000-8000-000000000002'::uuid,
    '75000000-0000-4000-8000-000000000003'::uuid
  ],'lease lock graph includes both planner and target owner');

select has_policy('public','cms_ai_sessions','cms_ai_sessions_authoritative_read',
  'sessions have an authoritative RLS policy');
select has_policy('public','cms_ai_synthetic_targets','cms_ai_targets_authoritative_read',
  'targets have an authoritative RLS policy');
select has_policy('public','cms_ai_execution_plans','cms_ai_plans_authoritative_read',
  'plans have an authoritative RLS policy');
select has_policy('public','cms_ai_provider_calls','cms_ai_provider_calls_authoritative_read',
  'provider evidence has an authoritative RLS policy');

select * from finish();
rollback;
