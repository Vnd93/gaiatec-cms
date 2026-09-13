begin;

-- Preserve immutable provider evidence from the retired model while allowing the
-- newly approved model for future rows. The scoped writer below still rejects
-- every new call that is not the active model.
alter table public.cms_ai_provider_calls
  drop constraint cms_ai_provider_calls_model_key_check,
  add constraint cms_ai_provider_calls_model_key_check check (
    model_key in (
      'nvidia/nemotron-3.5-lightning:free',
      'inclusionai/ling-3.0-flash-vl:free'
    )
  ) not valid;
alter table public.cms_ai_provider_calls
  validate constraint cms_ai_provider_calls_model_key_check;

-- Evaluation evidence follows the same append-only transition. Historical rows
-- keep their exact model; the insert guard later in this migration pins new rows.
alter table public.cms_ai_eval_runs
  drop constraint cms_ai_eval_runs_model_key_check,
  add constraint cms_ai_eval_runs_model_key_check check (
    model_key in (
      'nvidia/nemotron-3.5-lightning:free',
      'inclusionai/ling-3.0-flash-vl:free'
    )
  ) not valid;
alter table public.cms_ai_eval_runs
  validate constraint cms_ai_eval_runs_model_key_check;

-- Provider policies are immutable evidence. Keep v1 untouched and append the
-- exact privacy-preserving successor rather than rewriting the historical row.
do $cms_ai_provider_policy_precondition$
declare
  v_policy_count integer;
  v_legacy_policy_count integer;
begin
  select count(*)::integer,
    count(*) filter (
      where policy_key='f015-openrouter'
        and site_key='main'
        and allowed_environments=array['local','staging']::text[]
        and provider='openrouter'
        and model_key='nvidia/nemotron-3.5-lightning:free'
        and policy_version='f015-v1'
        and status='approved'
        and not real_data_allowed
        and not automatic_publish_allowed
        and not direct_database_access_allowed
        and training_opt_out
    )::integer
  into v_policy_count,v_legacy_policy_count
  from public.cms_ai_provider_policy;
  if v_policy_count<>1 or v_legacy_policy_count<>1 then
    raise exception 'CMS_AI_MODEL_TRANSITION_PROVIDER_POLICY_DRIFT'
      using errcode='55000';
  end if;
end;
$cms_ai_provider_policy_precondition$;

alter table public.cms_ai_provider_policy
  drop constraint cms_ai_provider_policy_policy_key_check,
  drop constraint cms_ai_provider_policy_model_key_check;
alter table public.cms_ai_provider_policy
  add constraint cms_ai_provider_policy_model_pair_check check (
    (policy_key='f015-openrouter'
      and model_key='nvidia/nemotron-3.5-lightning:free')
    or (policy_key='f015-openrouter-v2'
      and model_key='inclusionai/ling-3.0-flash-vl:free')
  ) not valid;
alter table public.cms_ai_provider_policy
  validate constraint cms_ai_provider_policy_model_pair_check;

insert into public.cms_ai_provider_policy (
  policy_key,site_key,allowed_environments,provider,model_key,policy_version,status,
  real_data_allowed,automatic_publish_allowed,direct_database_access_allowed,
  training_opt_out
) values (
  'f015-openrouter-v2','main',array['local','staging']::text[],'openrouter',
  'inclusionai/ling-3.0-flash-vl:free','f015-v1','approved',
  false,false,false,true
);

do $cms_ai_policy_state$
declare
  v_affected integer;
begin
  update public.cms_ai_policy_versions
  set configuration=(configuration-'model')||jsonb_build_object(
    'model','inclusionai/ling-3.0-flash-vl:free',
    'previousModel','nvidia/nemotron-3.5-lightning:free',
    'providerPolicyKey','f015-openrouter-v2',
    'dataCollection','deny',
    'zeroDataRetention',true,
    'externalNetwork',true,
    'provider','openrouter',
    'serviceRoleDelegated',false,
    'automaticPublish',false
  )
  where version=1
    and provider_mode='openrouter'
    and external_provider_enabled
    and configuration->>'model'='nvidia/nemotron-3.5-lightning:free';
  get diagnostics v_affected=row_count;
  if v_affected<>1 then
    raise exception 'CMS_AI_MODEL_TRANSITION_POLICY_STATE_INVALID'
      using errcode='55000';
  end if;
end;
$cms_ai_policy_state$;

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
  new.model_key:='inclusionai/ling-3.0-flash-vl:free';
  return new;
end;
$$;

-- The dual-model CHECK preserves historical evidence. This trigger is the
-- separate write-time fence that prevents service_role from inserting retired
-- or otherwise unapproved provider evidence directly.
create or replace function public.cms_ai_provider_call_model_enforce()
returns trigger
language plpgsql
set search_path=pg_catalog,public,pg_temp
as $$
begin
  if new.provider is distinct from 'openrouter'
     or new.model_key is distinct from 'inclusionai/ling-3.0-flash-vl:free' then
    raise exception 'CMS_AI_PROVIDER_MODEL_FORBIDDEN' using errcode='42501';
  end if;
  return new;
end;
$$;

revoke all on function public.cms_ai_provider_call_model_enforce()
  from public,anon,authenticated,service_role;
drop trigger if exists cms_ai_provider_call_model_enforce
  on public.cms_ai_provider_calls;
create trigger cms_ai_provider_call_model_enforce
before insert on public.cms_ai_provider_calls
for each row execute function public.cms_ai_provider_call_model_enforce();

-- Patch the deployed wrappers in place so their OIDs, ACLs, search paths and all
-- post-0075 integrity fixes remain authoritative. Every source shape is checked
-- before execution; an unexpected deployed definition fails the migration closed.
do $cms_ai_model_transition$
declare
  v_old constant text:='nvidia/nemotron-3.5-lightning:free';
  v_new constant text:='inclusionai/ling-3.0-flash-vl:free';
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
  v_old_count integer;
  v_policy_count integer;
  v_training_marker_count integer;
  v_workspace_marker constant text:=$marker$'providerModel','nvidia/nemotron-3.5-lightning:free',
      'providerStatus',($marker$;
  v_workspace_replacement constant text:=$replacement$'providerModel',coalesce((
        select historical_call.model_key
        from public.cms_ai_provider_calls historical_call
        where historical_call.session_id=session.id
          and private.cms_ai_actor_row_scope_allowed(
            p_actor_id,historical_call.actor_id,historical_call.created_at,p_environment
          )
        order by historical_call.created_at desc,historical_call.id desc limit 1
      ),'nvidia/nemotron-3.5-lightning:free'),
      'providerStatus',($replacement$;
begin
  for v_index in 1..array_length(v_signatures,1) loop
    v_function:=to_regprocedure(v_signatures[v_index]);
    if v_function is null then
      raise exception 'CMS_AI_MODEL_TRANSITION_FUNCTION_MISSING:%',v_index
        using errcode='55000';
    end if;
    v_definition:=pg_get_functiondef(v_function::oid);
    v_old_count:=(length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old);
    if v_old_count<>v_expected_old_counts[v_index]
       or position(v_new in v_definition)>0 then
      raise exception 'CMS_AI_MODEL_TRANSITION_SOURCE_DRIFT:%:%',v_index,v_old_count
        using errcode='55000';
    end if;
    if v_index=6 and (
      position('CMS_AI_MFA_REQUIRED' in v_definition)=0
      or position('cms_execute_ai_command_unscoped_0075' in v_definition)=0
      or not exists(
        select 1 from pg_catalog.pg_proc procedure_row
        where procedure_row.oid=v_function::oid
          and procedure_row.prosecdef
          and 'search_path=pg_catalog, private, pg_temp'=any(procedure_row.proconfig)
      )
    ) then
      raise exception 'CMS_AI_MODEL_TRANSITION_MFA_WRAPPER_INVALID'
        using errcode='55000';
    end if;

    if v_index=4 then
      if (length(v_definition)-length(replace(v_definition,v_workspace_marker,'')))
           / length(v_workspace_marker)<>1 then
        raise exception 'CMS_AI_MODEL_TRANSITION_WORKSPACE_MARKER_INVALID'
          using errcode='55000';
      end if;
      v_definition:=replace(v_definition,v_workspace_marker,v_workspace_replacement);
    elsif v_index=1 then
      v_policy_count:=(length(v_definition)-length(replace(
        v_definition,'''f015-openrouter''',''
      )))/length('''f015-openrouter''');
      if v_policy_count<>1 then
        raise exception 'CMS_AI_MODEL_TRANSITION_WRITER_POLICY_DRIFT'
          using errcode='55000';
      end if;
      v_training_marker_count:=(length(v_definition)-length(replace(
        v_definition,'and not policy.direct_database_access_allowed',''
      )))/length('and not policy.direct_database_access_allowed');
      if v_training_marker_count<>1 then
        raise exception 'CMS_AI_MODEL_TRANSITION_TRAINING_GUARD_DRIFT'
          using errcode='55000';
      end if;
      v_definition:=replace(
        v_definition,'''f015-openrouter''','''f015-openrouter-v2'''
      );
      v_definition:=replace(
        v_definition,
        'and not policy.direct_database_access_allowed',
        'and not policy.direct_database_access_allowed'||E'\n       and policy.training_opt_out'
      );
    end if;

    v_definition:=replace(v_definition,v_old,v_new);
    if position(v_old in v_definition)>0 or position(v_new in v_definition)=0 then
      raise exception 'CMS_AI_MODEL_TRANSITION_REWRITE_INVALID:%',v_index
        using errcode='55000';
    end if;
    execute v_definition;
    v_definition:=pg_get_functiondef(v_function::oid);
    if position(v_old in v_definition)>0
       or position(v_new in v_definition)=0
       or (v_index=1 and (
         position('''f015-openrouter-v2''' in v_definition)=0
         or position('policy.training_opt_out' in v_definition)=0
       ))
       or (v_index=6 and (
         position('CMS_AI_MFA_REQUIRED' in v_definition)=0
         or position('cms_execute_ai_command_unscoped_0075' in v_definition)=0
       )) then
      raise exception 'CMS_AI_MODEL_TRANSITION_POSTCONDITION_FAILED:%',v_index
        using errcode='55000';
    end if;
  end loop;
end;
$cms_ai_model_transition$;

comment on table public.cms_ai_provider_policy is
  'Append-only OpenRouter policy evidence; f015-openrouter-v2 is active and retains the v1 decision semantics.';

commit;
