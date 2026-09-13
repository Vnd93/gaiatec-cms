begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(35);

select has_table('public','cms_ai_provider_policy',
  'AI provider policy evidence remains present');
select is((select count(*)::integer from public.cms_ai_provider_policy),2,
  'the model transition appends exactly one provider policy');
select is((select model_key from public.cms_ai_provider_policy
  where policy_key='f015-openrouter'),
  'nvidia/nemotron-3.5-lightning:free','the historical provider policy is preserved');
select is((select model_key from public.cms_ai_provider_policy
  where policy_key='f015-openrouter-v2'),
  'inclusionai/ling-3.0-flash-vl:free','the active provider policy pins Ling free');
select is((select provider from public.cms_ai_provider_policy
  where policy_key='f015-openrouter-v2'),'openrouter',
  'the active policy keeps OpenRouter as the sole provider');
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
  'inclusionai/ling-3.0-flash-vl:free','the active policy state points to Ling free');
select is((select configuration->>'previousModel' from public.cms_ai_policy_versions where version=1),
  'nvidia/nemotron-3.5-lightning:free','the active policy state records its predecessor');

select alike((select pg_get_constraintdef(oid) from pg_constraint
  where conrelid='public.cms_ai_provider_calls'::regclass
    and conname='cms_ai_provider_calls_model_key_check'),
  '%nvidia/nemotron-3.5-lightning:free%',
  'provider evidence accepts the immutable historical model');
select alike((select pg_get_constraintdef(oid) from pg_constraint
  where conrelid='public.cms_ai_provider_calls'::regclass
    and conname='cms_ai_provider_calls_model_key_check'),
  '%inclusionai/ling-3.0-flash-vl:free%',
  'provider evidence accepts the active model');
select alike((select pg_get_constraintdef(oid) from pg_constraint
  where conrelid='public.cms_ai_eval_runs'::regclass
    and conname='cms_ai_eval_runs_model_key_check'),
  '%nvidia/nemotron-3.5-lightning:free%',
  'evaluation evidence accepts the immutable historical model');
select alike((select pg_get_constraintdef(oid) from pg_constraint
  where conrelid='public.cms_ai_eval_runs'::regclass
    and conname='cms_ai_eval_runs_model_key_check'),
  '%inclusionai/ling-3.0-flash-vl:free%',
  'evaluation evidence accepts the active model');

select alike(pg_get_functiondef('public.cms_ai_eval_provider_enforce()'::regprocedure),
  '%inclusionai/ling-3.0-flash-vl:free%',
  'new evaluation evidence is pinned to the active model');
select alike(pg_get_functiondef(
  'public.cms_record_ai_provider_call_scoped(uuid,uuid,text,text,text,text,timestamptz,text,text,integer,integer,text,text,uuid)'::regprocedure
), '%inclusionai/ling-3.0-flash-vl:free%',
  'new provider evidence is pinned to the active model');
select alike(pg_get_functiondef(
  'public.cms_record_ai_provider_call_scoped(uuid,uuid,text,text,text,text,timestamptz,text,text,integer,integer,text,text,uuid)'::regprocedure
), '%f015-openrouter-v2%',
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
), '%inclusionai/ling-3.0-flash-vl:free%',
  'sessions without evidence use the active model');
select alike(pg_get_functiondef(
  'public.cms_execute_ai_command(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,text)'::regprocedure
), '%CMS_AI_MFA_REQUIRED%',
  'the post-0088 MFA wrapper is preserved');
select alike(pg_get_functiondef(
  'public.cms_execute_ai_command(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,text)'::regprocedure
), '%inclusionai/ling-3.0-flash-vl:free%',
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

select * from finish();
rollback;
