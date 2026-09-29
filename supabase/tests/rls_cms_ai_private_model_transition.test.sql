begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(50);

select has_table('public','cms_ai_provider_policy',
  'AI provider policy evidence remains present');
select is((select count(*)::integer from public.cms_ai_provider_policy),3,
  'both transitions append policies without removing historical evidence');
select is((select model_key from public.cms_ai_provider_policy
  where policy_key='f015-openrouter'),
  'nvidia/nemotron-3.5-lightning:free','the historical provider policy is preserved');
select is((select model_key from public.cms_ai_provider_policy
  where policy_key='f015-openrouter-v2'),
  'inclusionai/ling-3.0-flash-vl:free','the previous provider policy preserves Ling free');
select is((select provider from public.cms_ai_provider_policy
  where policy_key='f015-openrouter-v2'),'openrouter',
  'the previous policy keeps OpenRouter as the sole provider');
select is((select policy_version from public.cms_ai_provider_policy
  where policy_key='f015-openrouter-v2'),'f015-v1',
  'the model transition preserves the approved safety policy version');
select is((select training_opt_out from public.cms_ai_provider_policy
  where policy_key='f015-openrouter-v2'),true,'training opt-out remains mandatory');
select is((select real_data_allowed from public.cms_ai_provider_policy
  where policy_key='f015-openrouter-v2'),false,'real data remains forbidden');
select is((select automatic_publish_allowed from public.cms_ai_provider_policy
  where policy_key='f015-openrouter-v2'),false,'automatic publication remains forbidden');
select is((select direct_database_access_allowed from public.cms_ai_provider_policy
  where policy_key='f015-openrouter-v2'),false,'direct database access remains forbidden');

select is((select configuration->>'model' from public.cms_ai_policy_versions where version=1),
  'qwen/qwen3.8-27b:free','the active policy state points to Qwen free');
select is((select configuration->>'previousModel' from public.cms_ai_policy_versions where version=1),
  'inclusionai/ling-3.0-flash-vl:free','the active policy state records its predecessor');

select alike((select pg_get_constraintdef(oid) from pg_constraint
  where conrelid='public.cms_ai_provider_calls'::regclass
    and conname='cms_ai_provider_calls_model_key_check'),
  '%nvidia/nemotron-3.5-lightning:free%',
  'provider evidence accepts the immutable historical model');
select alike((select pg_get_constraintdef(oid) from pg_constraint
  where conrelid='public.cms_ai_provider_calls'::regclass
    and conname='cms_ai_provider_calls_model_key_check'),
  '%inclusionai/ling-3.0-flash-vl:free%',
  'provider evidence preserves the previous model');
select alike((select pg_get_constraintdef(oid) from pg_constraint
  where conrelid='public.cms_ai_eval_runs'::regclass
    and conname='cms_ai_eval_runs_model_key_check'),
  '%nvidia/nemotron-3.5-lightning:free%',
  'evaluation evidence accepts the immutable historical model');
select alike((select pg_get_constraintdef(oid) from pg_constraint
  where conrelid='public.cms_ai_eval_runs'::regclass
    and conname='cms_ai_eval_runs_model_key_check'),
  '%inclusionai/ling-3.0-flash-vl:free%',
  'evaluation evidence preserves the previous model');

select alike(pg_get_functiondef('public.cms_ai_eval_provider_enforce()'::regprocedure),
  '%qwen/qwen3.8-27b:free%',
  'new evaluation evidence is pinned to the active model');
select alike(pg_get_functiondef(
  'public.cms_record_ai_provider_call_scoped(uuid,uuid,text,text,text,text,timestamptz,text,text,integer,integer,text,text,uuid)'::regprocedure
), '%qwen/qwen3.8-27b:free%',
  'new provider evidence is pinned to the active model');
select alike(pg_get_functiondef(
  'public.cms_record_ai_provider_call_scoped(uuid,uuid,text,text,text,text,timestamptz,text,text,integer,integer,text,text,uuid)'::regprocedure
), '%f015-openrouter-v3%',
  'the scoped writer selects only the active provider policy');
select alike(pg_get_functiondef(
  'public.cms_record_ai_provider_call_scoped(uuid,uuid,text,text,text,text,timestamptz,text,text,integer,integer,text,text,uuid)'::regprocedure
), '%policy.training_opt_out%',
  'the scoped writer requires training opt-out');
select unalike(pg_get_functiondef(
  'public.cms_record_ai_provider_call_scoped(uuid,uuid,text,text,text,text,timestamptz,text,text,integer,integer,text,text,uuid)'::regprocedure
), '%nvidia/nemotron-3.5-lightning:free%',
  'the scoped writer rejects new calls for the historical model');

select has_function('public','cms_ai_provider_call_model_enforce',array[]::text[],
  'a write-time provider model fence exists');
select has_trigger('public','cms_ai_provider_calls','cms_ai_provider_call_model_enforce',
  'every direct provider evidence insert crosses the active-model fence');
select unalike(pg_get_functiondef(
  'public.cms_ai_provider_call_model_enforce()'::regprocedure
), '%nvidia/nemotron-3.5-lightning:free%',
  'the write-time provider fence never authorizes the historical model');
select throws_ok(
  $$insert into public.cms_ai_provider_calls(
      actor_id,session_id,provider,model_key,input_tokens,output_tokens,status,correlation_id
    ) values (
      gen_random_uuid(),gen_random_uuid(),'openrouter','nvidia/nemotron-3.5-lightning:free',
      1,1,'succeeded',gen_random_uuid()
    )$$,
  '42501','CMS_AI_PROVIDER_MODEL_FORBIDDEN',
  'direct inserts cannot create new evidence for the historical model');

select alike(pg_get_functiondef(
  'public.cms_get_ai_workspace(uuid,text,text,text,text,timestamptz,uuid)'::regprocedure
), '%historical_call.model_key%',
  'the workspace reports the exact model used by historical sessions');
select alike(pg_get_functiondef(
  'public.cms_get_ai_workspace(uuid,text,text,text,text,timestamptz,uuid)'::regprocedure
), '%qwen/qwen3.8-27b:free%',
  'sessions without evidence use the active model');
select alike(pg_get_functiondef(
  'public.cms_execute_ai_command(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,text)'::regprocedure
), '%CMS_AI_MFA_REQUIRED%',
  'the post-0088 MFA wrapper is preserved');
select alike(pg_get_functiondef(
  'public.cms_execute_ai_command(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,text)'::regprocedure
), '%qwen/qwen3.8-27b:free%',
  'the command wrapper requires the active model');

select is((select count(*)::integer from pg_trigger
  where tgrelid='public.cms_ai_provider_policy'::regclass
    and tgname='cms_ai_provider_policy_immutable' and not tgisinternal),1,
  'provider policy evidence remains immutable');
select throws_ok(
  $$update public.cms_ai_provider_policy set status='approved'
    where policy_key='f015-openrouter'$$,
  '42501','CMS audit records are immutable',
  'the historical provider policy cannot be rewritten');
select is(has_function_privilege(
  'service_role',
  'public.cms_record_ai_provider_call_scoped(uuid,uuid,text,text,text,text,timestamptz,text,text,integer,integer,text,text,uuid)',
  'EXECUTE'
),true,'the trusted Edge boundary keeps the scoped writer');
select isnt(has_function_privilege(
  'authenticated',
  'public.cms_record_ai_provider_call_scoped(uuid,uuid,text,text,text,text,timestamptz,text,text,integer,integer,text,text,uuid)',
  'EXECUTE'
),true,'clients still cannot forge provider evidence');

select is((
  select count(*)::integer
  from unnest(array[
    'public.cms_record_ai_provider_call_scoped(uuid,uuid,text,text,text,text,timestamptz,text,text,integer,integer,text,text,uuid)'::regprocedure,
    'public.cms_ai_capability(uuid,text,text,text,text,timestamptz)'::regprocedure,
    'public.cms_ai_execute_capability(uuid,text,text,text,text,timestamptz)'::regprocedure,
    'public.cms_get_ai_workspace(uuid,text,text,text,text,timestamptz,uuid)'::regprocedure,
    'public.cms_get_ai_execution_workspace(uuid,text,text,text,text,timestamptz,uuid)'::regprocedure,
    'public.cms_execute_ai_command(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,text)'::regprocedure,
    'public.cms_execute_ai_transaction_command(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,text)'::regprocedure
  ]) as function_oid
  where has_function_privilege('service_role',function_oid,'EXECUTE')
),7,'service_role retains all seven authoritative Edge wrappers');
select is((
  select count(*)::integer
  from unnest(array['anon','authenticated']) as caller(role_name)
  cross join unnest(array[
    'public.cms_record_ai_provider_call_scoped(uuid,uuid,text,text,text,text,timestamptz,text,text,integer,integer,text,text,uuid)'::regprocedure,
    'public.cms_ai_capability(uuid,text,text,text,text,timestamptz)'::regprocedure,
    'public.cms_ai_execute_capability(uuid,text,text,text,text,timestamptz)'::regprocedure,
    'public.cms_get_ai_workspace(uuid,text,text,text,text,timestamptz,uuid)'::regprocedure,
    'public.cms_get_ai_execution_workspace(uuid,text,text,text,text,timestamptz,uuid)'::regprocedure,
    'public.cms_execute_ai_command(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,text)'::regprocedure,
    'public.cms_execute_ai_transaction_command(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,text)'::regprocedure
  ]) as function_oid
  where has_function_privilege(caller.role_name,function_oid,'EXECUTE')
),0,'anon and authenticated cannot execute any authoritative Edge wrapper');

select is((select model_key from public.cms_ai_provider_policy
  where policy_key='f015-openrouter-v3'),'qwen/qwen3.8-27b:free',
  'the successor pins the exact new free model');
select is((select allowed_environments from public.cms_ai_provider_policy
  where policy_key='f015-openrouter-v3'),array['local','staging']::text[],
  'the successor never authorizes production');
select ok((select provider='openrouter' and policy_version='f015-v1'
  and status='approved' and training_opt_out and not real_data_allowed
  and not automatic_publish_allowed and not direct_database_access_allowed
  from public.cms_ai_provider_policy where policy_key='f015-openrouter-v3'),
  'the successor retains every approved safety restriction');
select is((select configuration->'maxPrice' from public.cms_ai_policy_versions where version=1),
  '{"prompt":0,"completion":0,"request":0}'::jsonb,'every provider price ceiling is zero');
select is((select configuration->>'dataCollection' from public.cms_ai_policy_versions where version=1),
  'deny','collection stays forbidden');
select is((select configuration->'zeroDataRetention' from public.cms_ai_policy_versions where version=1),
  'true'::jsonb,'ZDR stays mandatory');
select is((select configuration->>'providerPolicyKey' from public.cms_ai_policy_versions where version=1),
  'f015-openrouter-v3','configuration selects only the successor policy');
select alike((select pg_get_constraintdef(oid) from pg_constraint
  where conrelid='public.cms_ai_provider_calls'::regclass
    and conname='cms_ai_provider_calls_model_key_check'),
  '%qwen/qwen3.8-27b:free%','provider evidence supports the new model');
select alike((select pg_get_constraintdef(oid) from pg_constraint
  where conrelid='public.cms_ai_eval_runs'::regclass
    and conname='cms_ai_eval_runs_model_key_check'),
  '%qwen/qwen3.8-27b:free%','evaluation evidence supports the new model');
select throws_ok(
  $$insert into public.cms_ai_provider_calls(
    actor_id,session_id,provider,model_key,input_tokens,output_tokens,status,correlation_id
  ) values (gen_random_uuid(),gen_random_uuid(),'openrouter','inclusionai/ling-3.0-flash-vl:free',
    1,1,'succeeded',gen_random_uuid())$$,
  '42501','CMS_AI_PROVIDER_MODEL_FORBIDDEN','new Ling calls are refused even through direct inserts');
select throws_ok(
  $$insert into public.cms_ai_provider_calls(
    actor_id,session_id,provider,model_key,input_tokens,output_tokens,status,correlation_id
  ) values (gen_random_uuid(),gen_random_uuid(),'openrouter','qwen/qwen3.8-27b',
    1,1,'succeeded',gen_random_uuid())$$,
  '42501','CMS_AI_PROVIDER_MODEL_FORBIDDEN','the paid sibling is forbidden');
select throws_ok(
  $$insert into public.cms_ai_provider_calls(
    actor_id,session_id,provider,model_key,input_tokens,output_tokens,status,correlation_id
  ) values (gen_random_uuid(),gen_random_uuid(),'openrouter','openrouter/auto',
    1,1,'succeeded',gen_random_uuid())$$,
  '42501','CMS_AI_PROVIDER_MODEL_FORBIDDEN','automatic model routing is forbidden');
select throws_ok($$update public.cms_ai_provider_policy set status='approved'
  where policy_key='f015-openrouter-v2'$$,'42501','CMS audit records are immutable',
  'the Ling policy remains immutable');
select throws_ok($$update public.cms_ai_provider_policy set status='approved'
  where policy_key='f015-openrouter-v3'$$,'42501','CMS audit records are immutable',
  'the Qwen policy is immutable');
select is((select count(*)::integer from pg_class where oid in (
  'public.cms_ai_provider_policy'::regclass,'public.cms_ai_provider_calls'::regclass,
  'public.cms_ai_eval_runs'::regclass) and relrowsecurity),3,
  'RLS remains enabled on policy, calls and evaluation evidence');

select * from finish();
rollback;
