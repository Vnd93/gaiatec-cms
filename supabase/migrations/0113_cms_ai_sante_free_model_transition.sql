begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

-- Append a local/staging successor without rewriting immutable historical rows.
do $cms_ai_sante_precondition$
begin
  if (select count(*) from public.cms_ai_provider_policy)<>3
     or (select count(*) from public.cms_ai_provider_policy
       where ((policy_key='f015-openrouter'
                 and model_key='nvidia/nemotron-3.5-lightning:free')
           or (policy_key='f015-openrouter-v2'
                 and model_key='inclusionai/ling-3.0-flash-vl:free')
           or (policy_key='f015-openrouter-v3'
                 and model_key='qwen/qwen3.8-27b:free'))
         and site_key='main'
         and allowed_environments=array['local','staging']::text[]
         and provider='openrouter' and policy_version='f015-v1'
         and status='approved' and not real_data_allowed
         and not automatic_publish_allowed and not direct_database_access_allowed
         and training_opt_out)<>3 then
    raise exception 'CMS_AI_SANTE_PROVIDER_POLICY_DRIFT' using errcode='55000';
  end if;
end;
$cms_ai_sante_precondition$;

alter table public.cms_ai_provider_calls
  drop constraint cms_ai_provider_calls_model_key_check,
  add constraint cms_ai_provider_calls_model_key_check check (
    model_key in ('nvidia/nemotron-3.5-lightning:free',
      'inclusionai/ling-3.0-flash-vl:free','qwen/qwen3.8-27b:free',
      'inclusionai/ling-3.0-flash-sante:free')
  ) not valid;
alter table public.cms_ai_provider_calls
  validate constraint cms_ai_provider_calls_model_key_check;
alter table public.cms_ai_eval_runs
  drop constraint cms_ai_eval_runs_model_key_check,
  add constraint cms_ai_eval_runs_model_key_check check (
    model_key in ('nvidia/nemotron-3.5-lightning:free',
      'inclusionai/ling-3.0-flash-vl:free','qwen/qwen3.8-27b:free',
      'inclusionai/ling-3.0-flash-sante:free')
  ) not valid;
alter table public.cms_ai_eval_runs
  validate constraint cms_ai_eval_runs_model_key_check;
alter table public.cms_ai_provider_policy
  drop constraint cms_ai_provider_policy_model_pair_check,
  add constraint cms_ai_provider_policy_model_pair_check check (
    (policy_key='f015-openrouter' and model_key='nvidia/nemotron-3.5-lightning:free')
    or (policy_key='f015-openrouter-v2' and model_key='inclusionai/ling-3.0-flash-vl:free')
    or (policy_key='f015-openrouter-v3' and model_key='qwen/qwen3.8-27b:free')
    or (policy_key='f015-openrouter-v4' and model_key='inclusionai/ling-3.0-flash-sante:free')
  ) not valid;
alter table public.cms_ai_provider_policy
  validate constraint cms_ai_provider_policy_model_pair_check;

insert into public.cms_ai_provider_policy (
  policy_key,site_key,allowed_environments,provider,model_key,policy_version,status,
  real_data_allowed,automatic_publish_allowed,direct_database_access_allowed,
  training_opt_out
) values (
  'f015-openrouter-v4','main',array['local','staging']::text[],'openrouter',
  'inclusionai/ling-3.0-flash-sante:free','f015-v1','approved',false,false,false,true
);

do $cms_ai_sante_policy_state$
declare
  v_affected integer;
begin
  update public.cms_ai_policy_versions
  set configuration=configuration||jsonb_build_object(
    'model','inclusionai/ling-3.0-flash-sante:free',
    'previousModel','qwen/qwen3.8-27b:free',
    'providerPolicyKey','f015-openrouter-v4',
    'maxPrice',jsonb_build_object('prompt',0,'completion',0,'request',0)
  )
  where version=1 and provider_mode='openrouter' and external_provider_enabled
    and configuration->>'model'='qwen/qwen3.8-27b:free'
    and configuration->>'providerPolicyKey'='f015-openrouter-v3'
    and configuration->'maxPrice'='{"prompt":0,"completion":0,"request":0}'::jsonb
    and configuration->>'dataCollection'='deny'
    and configuration->'zeroDataRetention'='true'::jsonb
    and configuration->'serviceRoleDelegated'='false'::jsonb
    and configuration->'automaticPublish'='false'::jsonb;
  get diagnostics v_affected=row_count;
  if v_affected<>1 then
    raise exception 'CMS_AI_SANTE_POLICY_STATE_INVALID' using errcode='55000';
  end if;
end;
$cms_ai_sante_policy_state$;

create or replace function public.cms_ai_eval_provider_enforce()
returns trigger
language plpgsql
set search_path=pg_catalog,public,pg_temp
as $$
begin
  if tg_op='UPDATE' then
    raise exception 'CMS_AI_EVIDENCE_IMMUTABLE' using errcode='55000';
  end if;
  new.provider_mode:='openrouter';
  new.model_key:='inclusionai/ling-3.0-flash-sante:free';
  return new;
end;
$$;

-- Four-model historical CHECKs do not permit new writes with retired models.
create or replace function public.cms_ai_provider_call_model_enforce()
returns trigger
language plpgsql
set search_path=pg_catalog,public,pg_temp
as $$
begin
  if new.provider is distinct from 'openrouter'
     or new.model_key is distinct from 'inclusionai/ling-3.0-flash-sante:free' then
    raise exception 'CMS_AI_PROVIDER_MODEL_FORBIDDEN' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function public.cms_ai_provider_call_model_enforce()
  from public,anon,authenticated,service_role;

-- Preserve the 0088 MFA wrapper, the 0097 historical-response bridge, function
-- OIDs and all existing security attributes. Unexpected source fails closed.
do $cms_ai_sante_wrappers$
declare
  v_old constant text:='qwen/qwen3.8-27b:free';
  v_new constant text:='inclusionai/ling-3.0-flash-sante:free';
  v_signatures constant text[]:=array[
    'public.cms_record_ai_provider_call_scoped(uuid,uuid,text,text,text,text,timestamp with time zone,text,text,integer,integer,text,text,uuid)',
    'public.cms_ai_capability(uuid,text,text,text,text,timestamp with time zone)',
    'public.cms_ai_execute_capability(uuid,text,text,text,text,timestamp with time zone)',
    'public.cms_get_ai_workspace(uuid,text,text,text,text,timestamp with time zone,uuid)',
    'public.cms_get_ai_execution_workspace(uuid,text,text,text,text,timestamp with time zone,uuid)',
    'public.cms_execute_ai_command(uuid,text,jsonb,text,text,text,text,timestamp with time zone,uuid,uuid,text,text)',
    'public.cms_execute_ai_transaction_command(uuid,text,jsonb,text,text,text,text,timestamp with time zone,uuid,uuid,text,text)'
  ];
  v_expected_old_counts constant integer[]:=array[1,4,3,2,1,3,1];
  v_index integer;
  v_function regprocedure;
  v_definition text;
  v_security_before jsonb;
  v_security_after jsonb;
begin
  for v_index in 1..array_length(v_signatures,1) loop
    v_function:=to_regprocedure(v_signatures[v_index]);
    if v_function is null then
      raise exception 'CMS_AI_SANTE_FUNCTION_MISSING:%',v_index using errcode='55000';
    end if;
    v_definition:=pg_get_functiondef(v_function::oid);
    if (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old)
         <>v_expected_old_counts[v_index]
       or position(v_new in v_definition)>0 then
      raise exception 'CMS_AI_SANTE_SOURCE_DRIFT:%',v_index using errcode='55000';
    end if;
    select jsonb_build_object('oid',oid,'owner',proowner,'acl',proacl,
      'securityDefiner',prosecdef,'configuration',proconfig)
    into v_security_before from pg_catalog.pg_proc where oid=v_function::oid;
    if v_index=6 and (
      position('CMS_AI_MFA_REQUIRED' in v_definition)=0
      or position('cms_execute_ai_command_unscoped_0075' in v_definition)=0
      or not exists(select 1 from pg_catalog.pg_proc procedure_row
        where procedure_row.oid=v_function::oid and procedure_row.prosecdef
          and 'search_path=pg_catalog, private, pg_temp'=any(procedure_row.proconfig))
    ) then
      raise exception 'CMS_AI_SANTE_MFA_WRAPPER_INVALID' using errcode='55000';
    end if;
    if v_index=4 and position('historical_call.model_key' in v_definition)=0 then
      raise exception 'CMS_AI_SANTE_HISTORY_BRIDGE_INVALID' using errcode='55000';
    end if;
    if v_index=1 then
      if (length(v_definition)-length(replace(v_definition,'''f015-openrouter-v3''','')))
           /length('''f015-openrouter-v3''')<>1
         or position('policy.training_opt_out' in v_definition)=0 then
        raise exception 'CMS_AI_SANTE_WRITER_POLICY_DRIFT' using errcode='55000';
      end if;
      v_definition:=replace(v_definition,'''f015-openrouter-v3''','''f015-openrouter-v4''');
    end if;
    v_definition:=replace(v_definition,v_old,v_new);
    execute v_definition;
    select jsonb_build_object('oid',oid,'owner',proowner,'acl',proacl,
      'securityDefiner',prosecdef,'configuration',proconfig)
    into v_security_after from pg_catalog.pg_proc
    where oid=to_regprocedure(v_signatures[v_index])::oid;
    v_definition:=pg_get_functiondef(v_function::oid);
    if v_security_after is distinct from v_security_before
       or position(v_old in v_definition)>0 or position(v_new in v_definition)=0
       or (v_index=1 and (position('''f015-openrouter-v4''' in v_definition)=0
         or position('policy.training_opt_out' in v_definition)=0))
       or (v_index=4 and position('historical_call.model_key' in v_definition)=0)
       or (v_index=6 and position('CMS_AI_MFA_REQUIRED' in v_definition)=0) then
      raise exception 'CMS_AI_SANTE_POSTCONDITION_FAILED:%',v_index using errcode='55000';
    end if;
  end loop;
end;
$cms_ai_sante_wrappers$;

comment on table public.cms_ai_provider_policy is
  'Append-only OpenRouter evidence; v4 is the local/staging-only free ZDR successor. Historical v1/v2/v3 remain immutable.';
commit;
