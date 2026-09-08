-- Authoritative F-015/F-016 boundary. AI remains individually gated, main-site
-- only and fail-closed. QA visibility is derived exclusively from the immutable
-- lease ledger; corporate operators never inherit rows touched by an actor that
-- has ever held a QA lease.

create table public.cms_ai_provider_policy (
  policy_key text primary key check (policy_key = 'f015-openrouter'),
  site_key text not null check (site_key = 'main'),
  allowed_environments text[] not null
    check (allowed_environments = array['local','staging']::text[]),
  provider text not null check (provider = 'openrouter'),
  model_key text not null check (model_key = 'nvidia/nemotron-3.5-lightning:free'),
  policy_version text not null check (policy_version = 'f015-v1'),
  status text not null check (status = 'approved'),
  real_data_allowed boolean not null default false check (not real_data_allowed),
  automatic_publish_allowed boolean not null default false
    check (not automatic_publish_allowed),
  direct_database_access_allowed boolean not null default false
    check (not direct_database_access_allowed),
  training_opt_out boolean not null default true check (training_opt_out),
  created_at timestamptz not null default statement_timestamp()
);

alter table public.cms_ai_policy_versions
  drop constraint cms_ai_policy_versions_provider_mode_check,
  drop constraint cms_ai_policy_versions_external_provider_enabled_check;
update public.cms_ai_policy_versions
set provider_mode='openrouter',external_provider_enabled=true,
    configuration=configuration||jsonb_build_object(
      'externalNetwork',true,'provider','openrouter',
      'model','nvidia/nemotron-3.5-lightning:free',
      'serviceRoleDelegated',false,'automaticPublish',false
    );
alter table public.cms_ai_policy_versions
  add constraint cms_ai_policy_versions_provider_mode_check
    check (provider_mode='openrouter') not valid,
  add constraint cms_ai_policy_versions_external_provider_enabled_check
    check (external_provider_enabled) not valid;
alter table public.cms_ai_policy_versions
  validate constraint cms_ai_policy_versions_provider_mode_check;
alter table public.cms_ai_policy_versions
  validate constraint cms_ai_policy_versions_external_provider_enabled_check;

-- Normalize legacy synthetic-adapter labels before enforcing the sole approved
-- runtime provider/model. The data class remains synthetic; the provider does not.
alter table public.cms_ai_sessions
  drop constraint cms_ai_sessions_provider_mode_check;
update public.cms_ai_sessions set provider_mode='openrouter'
where provider_mode is distinct from 'openrouter';
alter table public.cms_ai_sessions
  alter column provider_mode set default 'openrouter',
  add constraint cms_ai_sessions_provider_mode_check
    check (provider_mode='openrouter') not valid;
alter table public.cms_ai_sessions
  validate constraint cms_ai_sessions_provider_mode_check;

alter table public.cms_ai_eval_runs
  drop constraint cms_ai_eval_runs_provider_mode_check,
  drop constraint cms_ai_eval_runs_model_key_check;
update public.cms_ai_eval_runs
set provider_mode='openrouter',model_key='nvidia/nemotron-3.5-lightning:free'
where provider_mode is distinct from 'openrouter'
   or model_key is distinct from 'nvidia/nemotron-3.5-lightning:free';
alter table public.cms_ai_eval_runs
  add constraint cms_ai_eval_runs_provider_mode_check
    check (provider_mode='openrouter') not valid,
  add constraint cms_ai_eval_runs_model_key_check
    check (model_key='nvidia/nemotron-3.5-lightning:free') not valid;
alter table public.cms_ai_eval_runs
  validate constraint cms_ai_eval_runs_provider_mode_check;
alter table public.cms_ai_eval_runs
  validate constraint cms_ai_eval_runs_model_key_check;

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
  new.model_key:='nvidia/nemotron-3.5-lightning:free';
  return new;
end;
$$;
drop trigger if exists cms_ai_eval_provider_enforce on public.cms_ai_eval_runs;
create trigger cms_ai_eval_provider_enforce
before insert or update on public.cms_ai_eval_runs
for each row execute function public.cms_ai_eval_provider_enforce();

insert into public.cms_ai_provider_policy (
  policy_key,site_key,allowed_environments,provider,model_key,policy_version,status
) values (
  'f015-openrouter','main',array['local','staging']::text[],
  'openrouter','nvidia/nemotron-3.5-lightning:free','f015-v1','approved'
);

alter table public.cms_ai_provider_calls
  add column cost_micros bigint not null default 0 check (cost_micros = 0),
  add column error_code text
    check (error_code is null or error_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  add constraint cms_ai_provider_calls_status_shape check (
    (status='succeeded' and error_code is null)
    or (status='failed' and error_code is not null)
  ) not valid;

-- Existing successful calls predate error_code. There are no historical failed
-- provider calls with an authoritative normalized reason, so mark them safely.
update public.cms_ai_provider_calls
set error_code='provider_unavailable'
where status='failed' and error_code is null;
alter table public.cms_ai_provider_calls
  validate constraint cms_ai_provider_calls_status_shape;

-- Provider/event evidence survives business-retention cleanup. References are
-- detached by the FK itself while actor, provider/model, cost and correlation
-- metadata remain available for the immutable audit trail.
alter table public.cms_ai_provider_calls
  drop constraint cms_ai_provider_calls_session_id_fkey,
  alter column session_id drop not null,
  add constraint cms_ai_provider_calls_session_id_fkey
    foreign key(session_id) references public.cms_ai_sessions(id) on delete set null;
alter table public.cms_ai_events
  drop constraint cms_ai_events_session_id_fkey,
  drop constraint cms_ai_events_proposal_id_fkey,
  add constraint cms_ai_events_session_id_fkey
    foreign key(session_id) references public.cms_ai_sessions(id) on delete set null,
  add constraint cms_ai_events_proposal_id_fkey
    foreign key(proposal_id) references public.cms_ai_proposals(id) on delete set null;

alter table public.cms_ai_synthetic_targets
  add column qa_actor_id uuid references auth.users(id) on delete restrict,
  add column qa_run_tag text,
  add column qa_candidate_sha text,
  add column qa_environment text;

update public.cms_ai_synthetic_targets target
set qa_actor_id=lease.actor_id,
    qa_run_tag=lease.run_tag,
    qa_candidate_sha=lease.candidate_sha,
    qa_environment=lease.environment
from private.cms_qa_actor_leases lease
where lease.actor_id=target.created_by
  and lease.environment=target.environment
  and target.created_at between lease.created_at and lease.expires_at
  and private.cms_qa_actor_marker_is_exact(
    lease.actor_id,lease.run_tag,lease.candidate_sha,lease.environment
  );

alter table public.cms_ai_synthetic_targets
  add constraint cms_ai_target_qa_provenance_shape check (
    (
      qa_actor_id is null and qa_run_tag is null
      and qa_candidate_sha is null and qa_environment is null
    ) or (
      qa_actor_id is not null
      and qa_actor_id=created_by
      and qa_run_tag ~ '^QA-CMS-FINAL-[0-9]{8}-[0-9a-f]{8}$'
      and qa_candidate_sha ~ '^[0-9a-f]{40}$'
      and right(qa_run_tag,9)='-'||left(qa_candidate_sha,8)
      and qa_environment=environment
    )
  );

create or replace function private.cms_ai_actor_ever_qa(p_actor_id uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,private,pg_temp
as $$
  select p_actor_id is not null and exists(
    select 1 from private.cms_qa_actor_leases lease
    where lease.actor_id=p_actor_id
  );
$$;

create or replace function private.cms_ai_actor_row_scope_allowed(
  p_actor_id uuid,
  p_row_actor_id uuid,
  p_row_at timestamptz,
  p_environment text
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,private,auth,pg_temp
as $$
  select p_actor_id is not null
    and p_row_actor_id is not null
    and p_row_at is not null
    and private.cms_user_actor_context_active(p_actor_id,p_environment)
    and private.cms_user_actor_target_scope_allowed(
      p_actor_id,p_row_actor_id,p_environment
    )
    and (
      not private.cms_ai_actor_ever_qa(p_row_actor_id)
      or exists(
        select 1 from private.cms_qa_actor_leases lease
        where lease.actor_id=p_row_actor_id
          and lease.environment=p_environment
          and p_row_at between lease.created_at and lease.expires_at
          and private.cms_qa_actor_marker_is_exact(
            lease.actor_id,lease.run_tag,lease.candidate_sha,lease.environment
          )
      )
    );
$$;

create or replace function private.cms_ai_target_scope_allowed(
  p_actor_id uuid,
  p_target_ref text,
  p_environment text
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,private,pg_temp
as $$
  select exists(
    select 1 from public.cms_ai_synthetic_targets target
    where target.target_ref=p_target_ref
      and target.site_key='main'
      and target.environment=p_environment
      and target.data_class='synthetic'
      and private.cms_ai_actor_row_scope_allowed(
        p_actor_id,target.created_by,target.created_at,p_environment
      )
      and (
        (not private.cms_ai_actor_ever_qa(target.created_by)
          and target.qa_actor_id is null
          and target.qa_run_tag is null
          and target.qa_candidate_sha is null
          and target.qa_environment is null)
        or exists(
          select 1 from private.cms_qa_actor_leases lease
          where lease.actor_id=target.created_by
            and row(
              target.qa_actor_id,target.qa_run_tag,
              target.qa_candidate_sha,target.qa_environment
            )=row(
              lease.actor_id,lease.run_tag,lease.candidate_sha,lease.environment
            )
        )
      )
  );
$$;

create or replace function private.cms_ai_session_scope_allowed(
  p_actor_id uuid,
  p_ai_session_id uuid,
  p_environment text
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,private,pg_temp
as $$
  select exists(
    select 1 from public.cms_ai_sessions session
    where session.id=p_ai_session_id
      and session.site_key='main'
      and session.environment=p_environment
      and private.cms_ai_actor_row_scope_allowed(
        p_actor_id,session.actor_id,session.created_at,p_environment
      )
  );
$$;

create or replace function private.cms_ai_proposal_scope_allowed(
  p_actor_id uuid,
  p_proposal_id uuid,
  p_environment text
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,private,pg_temp
as $$
  select exists(
    select 1 from public.cms_ai_proposals proposal
    join public.cms_ai_sessions session on session.id=proposal.session_id
    where proposal.id=p_proposal_id
      and private.cms_ai_session_scope_allowed(
        p_actor_id,session.id,p_environment
      )
      and private.cms_ai_actor_row_scope_allowed(
        p_actor_id,proposal.actor_id,proposal.created_at,p_environment
      )
  );
$$;

create or replace function private.cms_ai_plan_scope_allowed(
  p_actor_id uuid,
  p_plan_id uuid,
  p_environment text
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,private,pg_temp
as $$
  select exists(
    select 1 from public.cms_ai_execution_plans plan
    where plan.id=p_plan_id
      and plan.site_key='main'
      and plan.environment=p_environment
      and plan.data_class='synthetic'
      and private.cms_ai_actor_row_scope_allowed(
        p_actor_id,plan.created_by,plan.created_at,p_environment
      )
      and not exists(
        select 1 from jsonb_array_elements(plan.steps) step
        where not private.cms_ai_target_scope_allowed(
          p_actor_id,step->>'targetRef',p_environment
        )
      )
  );
$$;

create or replace function private.cms_ai_run_scope_allowed(
  p_actor_id uuid,
  p_run_id uuid,
  p_environment text
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,private,pg_temp
as $$
  select exists(
    select 1
    from public.cms_ai_execution_runs run
    join public.cms_ai_execution_approvals approval on approval.id=run.approval_id
    where run.id=p_run_id
      and private.cms_ai_plan_scope_allowed(p_actor_id,run.plan_id,p_environment)
      and private.cms_ai_actor_row_scope_allowed(
        p_actor_id,approval.approved_by,approval.created_at,p_environment
      )
      and private.cms_ai_actor_row_scope_allowed(
        p_actor_id,run.executed_by,run.created_at,p_environment
      )
      and (
        run.compensated_by is null
        or private.cms_user_actor_target_scope_allowed(
          p_actor_id,run.compensated_by,p_environment
        )
      )
  );
$$;

create or replace function public.cms_ai_target_provenance_guard()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private,pg_temp
as $$
declare
  v_lease private.cms_qa_actor_leases%rowtype;
  v_marker_eligible boolean:=false;
begin
  if tg_op='UPDATE' and (
    new.created_by is distinct from old.created_by
    or row(new.qa_actor_id,new.qa_run_tag,new.qa_candidate_sha,new.qa_environment)
      is distinct from
      row(old.qa_actor_id,old.qa_run_tag,old.qa_candidate_sha,old.qa_environment)
  ) then
    raise exception 'CMS_AI_EXECUTE_PROVENANCE_IMMUTABLE' using errcode='55000';
  end if;

  select * into v_lease from private.cms_qa_actor_leases lease
  where lease.actor_id=new.created_by;
  if found then
    v_marker_eligible:=new.environment=v_lease.environment
      and new.created_at between v_lease.created_at and v_lease.expires_at
      and private.cms_qa_actor_marker_is_exact(
        v_lease.actor_id,v_lease.run_tag,v_lease.candidate_sha,v_lease.environment
      );
    if not v_marker_eligible then
      if tg_op='UPDATE'
         and current_setting('cms.ai_terminal_cleanup',true)='on'
         and new.qa_actor_id is null and new.qa_run_tag is null
         and new.qa_candidate_sha is null and new.qa_environment is null then
        return new;
      end if;
      raise exception 'CMS_AI_EXECUTE_PROVENANCE_INVALID' using errcode='42501';
    end if;
    if new.qa_actor_id is null and new.qa_run_tag is null
       and new.qa_candidate_sha is null and new.qa_environment is null then
      new.qa_actor_id:=v_lease.actor_id;
      new.qa_run_tag:=v_lease.run_tag;
      new.qa_candidate_sha:=v_lease.candidate_sha;
      new.qa_environment:=v_lease.environment;
    end if;
    if row(new.qa_actor_id,new.qa_run_tag,new.qa_candidate_sha,new.qa_environment)
       is distinct from
       row(v_lease.actor_id,v_lease.run_tag,v_lease.candidate_sha,v_lease.environment) then
      raise exception 'CMS_AI_EXECUTE_PROVENANCE_INVALID' using errcode='42501';
    end if;
  elsif new.qa_actor_id is not null or new.qa_run_tag is not null
     or new.qa_candidate_sha is not null or new.qa_environment is not null then
    raise exception 'CMS_AI_EXECUTE_PROVENANCE_INVALID' using errcode='42501';
  end if;
  return new;
end;
$$;

drop trigger if exists cms_ai_target_provenance_guard
on public.cms_ai_synthetic_targets;
create trigger cms_ai_target_provenance_guard
before insert or update on public.cms_ai_synthetic_targets
for each row execute function public.cms_ai_target_provenance_guard();

create or replace function public.cms_record_ai_provider_call_scoped(
  p_actor_id uuid,
  p_ai_session_id uuid,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_jwt_session_id text,
  p_issued_at timestamptz,
  p_provider text,
  p_model_key text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_status text,
  p_error_code text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,pg_temp
as $$
declare
  v_session public.cms_ai_sessions%rowtype;
  v_existing public.cms_ai_provider_calls%rowtype;
  v_call public.cms_ai_provider_calls%rowtype;
begin
  if p_site_key is distinct from 'main'
     or p_environment not in ('local','staging')
     or p_aal is distinct from 'aal2'
     or p_provider is distinct from 'openrouter'
     or p_model_key is distinct from 'nvidia/nemotron-3.5-lightning:free'
     or p_input_tokens not between 1 and 4000
     or p_output_tokens not between 1 and 1000
     or p_status not in ('succeeded','failed')
     or (p_status='succeeded' and p_error_code is not null)
     or (p_status='failed' and coalesce(p_error_code,'') !~ '^[a-z][a-z0-9_]{1,63}$')
     or p_correlation_id is null
     or not private.cms_user_actor_context_active(p_actor_id,p_environment)
     or not private.cms_ev2_actor_authorized_for_scope(
       p_actor_id,'cms:ai.read',p_environment,p_site_key,
       p_aal,p_jwt_session_id,p_issued_at
     ) then
    raise exception 'CMS_AI_PROVIDER_CALL_FORBIDDEN' using errcode='42501';
  end if;
  if not exists(
    select 1 from public.cms_ai_provider_policy policy
    where policy.policy_key='f015-openrouter'
      and policy.site_key=p_site_key
      and p_environment=any(policy.allowed_environments)
      and policy.provider=p_provider
      and policy.model_key=p_model_key
      and policy.status='approved'
      and not policy.real_data_allowed
      and not policy.automatic_publish_allowed
      and not policy.direct_database_access_allowed
  ) then
    raise exception 'CMS_AI_PROVIDER_POLICY_FORBIDDEN' using errcode='42501';
  end if;

  select * into v_session from public.cms_ai_sessions session
  where session.id=p_ai_session_id and session.actor_id=p_actor_id
    and session.environment=p_environment and session.site_key=p_site_key;
  if not found or not private.cms_ai_session_scope_allowed(
    p_actor_id,v_session.id,p_environment
  ) then
    raise exception 'CMS_AI_SESSION_NOT_FOUND' using errcode='PT404';
  end if;

  perform private.cms_lock_active_qa_actor_leases(array[p_actor_id]);
  perform pg_advisory_xact_lock(
    hashtextextended('cms:ai-provider:'||p_actor_id::text||':'||p_correlation_id::text,0)
  );
  select * into v_existing from public.cms_ai_provider_calls provider_call
  where provider_call.actor_id=p_actor_id
    and provider_call.session_id=p_ai_session_id
    and provider_call.correlation_id=p_correlation_id
  order by provider_call.created_at,provider_call.id limit 1 for update;
  if found then
    if v_existing.provider<>p_provider
       or v_existing.model_key<>p_model_key
       or v_existing.input_tokens<>p_input_tokens
       or v_existing.output_tokens<>p_output_tokens
       or v_existing.status<>p_status
       or v_existing.error_code is distinct from p_error_code then
      raise exception 'CMS_AI_PROVIDER_CALL_CONFLICT' using errcode='PT409';
    end if;
    return jsonb_build_object(
      'schemaVersion',1,'callId',v_existing.id,'duplicate',true,
      'status',v_existing.status,'provider',v_existing.provider,
      'model',v_existing.model_key,'costMicros',v_existing.cost_micros,
      'correlationId',v_existing.correlation_id
    );
  end if;

  insert into public.cms_ai_provider_calls(
    actor_id,session_id,provider,model_key,input_tokens,output_tokens,
    status,correlation_id,cost_micros,error_code
  ) values (
    p_actor_id,p_ai_session_id,p_provider,p_model_key,p_input_tokens,p_output_tokens,
    p_status,p_correlation_id,0,p_error_code
  ) returning * into v_call;
  return jsonb_build_object(
    'schemaVersion',1,'callId',v_call.id,'duplicate',false,
    'status',v_call.status,'provider',v_call.provider,
    'model',v_call.model_key,'costMicros',v_call.cost_micros,
    'correlationId',v_call.correlation_id
  );
end;
$$;

-- Keep historical code available only as an implementation detail. All deployed
-- API names below validate authoritative scope before and after invoking it.
alter function public.cms_ai_capability(
  uuid,text,text,text,text,timestamptz
) rename to cms_ai_capability_unscoped_0075;
alter function public.cms_get_ai_workspace(
  uuid,text,text,text,text,timestamptz,uuid
) rename to cms_get_ai_workspace_unscoped_0075;
alter function public.cms_execute_ai_command(
  uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,text
) rename to cms_execute_ai_command_unscoped_0075;
alter function public.cms_ai_execute_capability(
  uuid,text,text,text,text,timestamptz
) rename to cms_ai_execute_capability_unscoped_0075;
alter function public.cms_get_ai_execution_workspace(
  uuid,text,text,text,text,timestamptz,uuid
) rename to cms_get_ai_execution_workspace_unscoped_0075;
alter function public.cms_execute_ai_transaction_command(
  uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,text
) rename to cms_execute_ai_transaction_command_unscoped_0075;

revoke all on function public.cms_ai_capability_unscoped_0075(
  uuid,text,text,text,text,timestamptz
) from public,anon,authenticated,service_role;
revoke all on function public.cms_get_ai_workspace_unscoped_0075(
  uuid,text,text,text,text,timestamptz,uuid
) from public,anon,authenticated,service_role;
revoke all on function public.cms_execute_ai_command_unscoped_0075(
  uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,text
) from public,anon,authenticated,service_role;
revoke all on function public.cms_ai_execute_capability_unscoped_0075(
  uuid,text,text,text,text,timestamptz
) from public,anon,authenticated,service_role;
revoke all on function public.cms_get_ai_execution_workspace_unscoped_0075(
  uuid,text,text,text,text,timestamptz,uuid
) from public,anon,authenticated,service_role;
revoke all on function public.cms_execute_ai_transaction_command_unscoped_0075(
  uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,text
) from public,anon,authenticated,service_role;

create function public.cms_ai_capability(
  p_actor_id uuid,p_environment text,p_site_key text,p_aal text,
  p_session_id text,p_issued_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,pg_temp
as $$
declare
  v_capability jsonb;
begin
  if p_site_key is distinct from 'main'
     or p_environment not in ('local','staging')
     or not private.cms_user_actor_context_active(p_actor_id,p_environment) then
    return jsonb_build_object(
      'schemaVersion',1,'enabled',false,'source','scope_invalid',
      'environment',p_environment,'siteKey',p_site_key,'providerMode','openrouter',
      'allowedProvider','openrouter',
      'allowedModel','nvidia/nemotron-3.5-lightning:free',
      'providerModel','nvidia/nemotron-3.5-lightning:free',
      'externalProviderEnabled',true,'externalProviderReady',false,
      'realDataAllowed',false,'aiExecute',false,
      'decisionKey','EV2-D04','decisionStatus','approved',
      'policyVersion',1,'toolCatalogVersion',1,'retentionHours',24,
      'maxSessionMinutes',30,'maxSessionTokens',8000,'manualFallback',true
    );
  end if;
  perform private.cms_lock_active_qa_actor_leases(array[p_actor_id]);
  v_capability:=public.cms_ai_capability_unscoped_0075(
    p_actor_id,p_environment,p_site_key,p_aal,p_session_id,p_issued_at
  );
  return v_capability||jsonb_build_object(
    'providerMode','openrouter','allowedProvider','openrouter',
    'allowedModel','nvidia/nemotron-3.5-lightning:free',
    'providerModel','nvidia/nemotron-3.5-lightning:free',
    'externalProviderEnabled',true,'externalProviderReady',false,
    'realDataAllowed',false,'decisionStatus','approved','manualFallback',true
  );
end;
$$;

create function public.cms_ai_execute_capability(
  p_actor_id uuid,p_environment text,p_site_key text,p_aal text,
  p_session_id text,p_issued_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,pg_temp
as $$
declare
  v_capability jsonb;
begin
  if p_site_key is distinct from 'main'
     or p_environment not in ('local','staging')
     or not private.cms_user_actor_context_active(p_actor_id,p_environment) then
    return jsonb_build_object(
      'schemaVersion',1,'enabled',false,'source','scope_invalid',
      'environment',p_environment,'siteKey',p_site_key,
      'providerMode','openrouter','providerModel','nvidia/nemotron-3.5-lightning:free',
      'externalProviderEnabled',true,'externalProviderReady',false,
      'realDataAllowed',false,'syntheticOnly',true,
      'requiresAiAssist',true,'planHashRequired',true,
      'reviewerSeparationRequired',true,'compensationRequired',true,
      'maxPlanSteps',20,'approvalMinutes',10,'manualFallback',true
    );
  end if;
  perform private.cms_lock_active_qa_actor_leases(array[p_actor_id]);
  v_capability:=public.cms_ai_execute_capability_unscoped_0075(
    p_actor_id,p_environment,p_site_key,p_aal,p_session_id,p_issued_at
  );
  return v_capability||jsonb_build_object(
    'providerMode','openrouter','allowedProvider','openrouter',
    'allowedModel','nvidia/nemotron-3.5-lightning:free',
    'providerModel','nvidia/nemotron-3.5-lightning:free',
    'externalProviderEnabled',true,'externalProviderReady',false,
    'realDataAllowed',false,
    'syntheticOnly',true,'manualFallback',true
  );
end;
$$;

create function public.cms_get_ai_workspace(
  p_actor_id uuid,p_environment text,p_site_key text,p_aal text,
  p_session_id text,p_issued_at timestamptz,p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,pg_temp
as $$
declare
  v_sessions jsonb;
  v_tools jsonb;
  v_can_review boolean:=false;
begin
  if p_correlation_id is null
     or p_site_key is distinct from 'main'
     or p_environment not in ('local','staging')
     or not private.cms_user_actor_context_active(p_actor_id,p_environment) then
    raise exception 'CMS_AI_FORBIDDEN' using errcode='42501';
  end if;
  perform private.cms_lock_active_qa_actor_leases(array[p_actor_id]);
  perform private.cms_ai_assert_available(
    p_actor_id,'cms:ai.read',p_environment,p_site_key,
    p_aal,p_session_id,p_issued_at
  );
  v_can_review:=private.cms_ev2_actor_authorized_for_scope(
    p_actor_id,'cms:ai.review',p_environment,p_site_key,
    p_aal,p_session_id,p_issued_at
  );

  select coalesce(jsonb_agg(jsonb_build_object(
    'key',tool.tool_key,'name',tool.display_name,'mode',tool.mode,
    'permission',tool.permission_key,'syntheticOnly',tool.synthetic_only,
    'mutatesCms',tool.mutates_cms
  ) order by tool.tool_key),'[]'::jsonb)
  into v_tools from public.cms_ai_tools tool where tool.active;

  select coalesce(jsonb_agg(visible.payload order by visible.created_at desc),'[]'::jsonb)
  into v_sessions
  from (
    select session.created_at,jsonb_build_object(
      'id',session.id,'title',session.title,'mode',session.mode,'status',session.status,
      'actorId',session.actor_id,'owned',session.actor_id=p_actor_id,
      'reviewable',v_can_review and session.actor_id<>p_actor_id,
      'providerMode','openrouter',
      'providerModel','nvidia/nemotron-3.5-lightning:free',
      'providerStatus',(
        select provider_call.status
        from public.cms_ai_provider_calls provider_call
        where provider_call.session_id=session.id
          and private.cms_ai_actor_row_scope_allowed(
            p_actor_id,provider_call.actor_id,provider_call.created_at,p_environment
          )
        order by provider_call.created_at desc,provider_call.id desc limit 1
      ),
      'tokensUsed',session.tokens_used,'tokenBudget',session.token_budget,
      'costUsedMicros',coalesce((
        select sum(provider_call.cost_micros)
        from public.cms_ai_provider_calls provider_call
        where provider_call.session_id=session.id
          and private.cms_ai_actor_row_scope_allowed(
            p_actor_id,provider_call.actor_id,provider_call.created_at,p_environment
          )
      ),0),'expiresAt',session.expires_at,
      'proposals',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',proposal.id,'kind',proposal.proposal_kind,'status',proposal.status,
          'summary',proposal.summary,'targetRef',proposal.target_ref,
          'fields',proposal.fields,'diff',proposal.diff,'sourceIds',proposal.source_ids,
          'confidence',proposal.confidence,'hasPendingFields',proposal.has_pending_fields,
          'proposalHash',proposal.proposal_hash,'lockVersion',proposal.lock_version,
          'createdAt',proposal.created_at
        ) order by proposal.created_at desc)
        from public.cms_ai_proposals proposal
        where proposal.session_id=session.id
          and private.cms_ai_proposal_scope_allowed(
            p_actor_id,proposal.id,p_environment
          )
      ),'[]'::jsonb),
      'sources',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',source.id,'kind',source.source_kind,'reference',source.source_ref,
          'title',source.title,'version',source.version_label,'locator',source.locator,
          'page',source.page_number,'excerpt',source.excerpt_redacted,
          'authorized',source.authorized
        ) order by source.created_at)
        from public.cms_ai_sources source
        where source.session_id=session.id
          and private.cms_ai_actor_row_scope_allowed(
            p_actor_id,source.actor_id,source.created_at,p_environment
          )
      ),'[]'::jsonb)
    ) payload
    from public.cms_ai_sessions session
    where session.environment=p_environment and session.site_key=p_site_key
      and session.retention_until>statement_timestamp()
      and (session.actor_id=p_actor_id or v_can_review)
      and private.cms_ai_session_scope_allowed(
        p_actor_id,session.id,p_environment
      )
    order by session.created_at desc limit 20
  ) visible;

  return jsonb_build_object(
    'schemaVersion',1,'correlationId',p_correlation_id,
    'policy',jsonb_build_object(
      'decisionKey','EV2-D04','status','approved','providerMode','openrouter',
      'providerModel','nvidia/nemotron-3.5-lightning:free',
      'externalProviderEnabled',true,'externalProviderReady',false,
      'allowedDataClasses',jsonb_build_array('synthetic'),
      'retentionHours',24,'aiExecute',false,'realDataAllowed',false,
      'automaticPublishAllowed',false,'manualFallback',true
    ),
    'tools',v_tools,'sessions',v_sessions
  );
end;
$$;

create function public.cms_get_ai_execution_workspace(
  p_actor_id uuid,p_environment text,p_site_key text,p_aal text,
  p_session_id text,p_issued_at timestamptz,p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,pg_temp
as $$
declare
  v_tools jsonb;
  v_targets jsonb;
  v_plans jsonb;
  v_can_plan boolean;
  v_can_approve boolean;
  v_can_execute boolean;
  v_can_compensate boolean;
begin
  if p_correlation_id is null
     or p_site_key is distinct from 'main'
     or p_environment not in ('local','staging')
     or not private.cms_user_actor_context_active(p_actor_id,p_environment) then
    raise exception 'CMS_AI_EXECUTE_FORBIDDEN' using errcode='42501';
  end if;
  perform private.cms_lock_active_qa_actor_leases(array[p_actor_id]);
  perform private.cms_ai_execute_assert_available(
    p_actor_id,'cms:ai.read',p_environment,p_site_key,
    p_aal,p_session_id,p_issued_at
  );
  v_can_plan:=private.cms_ev2_actor_authorized_for_scope(
    p_actor_id,'cms:ai.plan',p_environment,p_site_key,p_aal,p_session_id,p_issued_at
  );
  v_can_approve:=private.cms_ev2_actor_authorized_for_scope(
    p_actor_id,'cms:ai.approve',p_environment,p_site_key,p_aal,p_session_id,p_issued_at
  );
  v_can_execute:=private.cms_ev2_actor_authorized_for_scope(
    p_actor_id,'cms:ai.execute',p_environment,p_site_key,p_aal,p_session_id,p_issued_at
  );
  v_can_compensate:=private.cms_ev2_actor_authorized_for_scope(
    p_actor_id,'cms:ai.compensate',p_environment,p_site_key,p_aal,p_session_id,p_issued_at
  );

  select coalesce(jsonb_agg(jsonb_build_object(
    'key',tool.tool_key,'name',tool.display_name,'risk',tool.risk_class,
    'permission',tool.permission_key,'syntheticOnly',tool.synthetic_only,
    'reversible',tool.reversible,'active',tool.active
  ) order by tool.tool_key),'[]'::jsonb)
  into v_tools from public.cms_ai_execution_tools tool where tool.active;

  select coalesce(jsonb_agg(jsonb_build_object(
    'reference',target.target_ref,'title',target.title,'lifecycle',target.lifecycle,
    'payload',target.payload,'version',target.version,'owned',target.created_by=p_actor_id,
    'updatedAt',target.updated_at
  ) order by target.updated_at desc),'[]'::jsonb)
  into v_targets
  from (
    select candidate.* from public.cms_ai_synthetic_targets candidate
    where candidate.environment=p_environment and candidate.site_key=p_site_key
      and private.cms_ai_target_scope_allowed(
        p_actor_id,candidate.target_ref,p_environment
      )
    order by candidate.updated_at desc limit 30
  ) target;

  select coalesce(jsonb_agg(visible.payload order by visible.created_at desc),'[]'::jsonb)
  into v_plans
  from (
    select plan.created_at,jsonb_build_object(
      'id',plan.id,'title',plan.title,
      'status',case when plan.status in ('ready','approved')
        and plan.expires_at<=statement_timestamp() then 'expired' else plan.status end,
      'risk',plan.risk_class,'planVersion',plan.plan_version,'planHash',plan.plan_hash,
      'steps',plan.steps,'dryRun',plan.dry_run,'createdBy',plan.created_by,
      'owned',plan.created_by=p_actor_id,
      'approvable',v_can_approve and plan.created_by<>p_actor_id
        and plan.status='ready' and plan.expires_at>statement_timestamp(),
      'executable',v_can_execute and plan.status='approved'
        and plan.expires_at>statement_timestamp()
        and exists(
          select 1 from public.cms_ai_execution_approvals approval
          where approval.plan_id=plan.id and approval.purpose='execute'
            and approval.decision='approved' and approval.status='active'
            and approval.plan_hash=plan.plan_hash
            and approval.plan_version=plan.plan_version
            and approval.expires_at>statement_timestamp()
            and private.cms_ai_actor_row_scope_allowed(
              p_actor_id,approval.approved_by,approval.created_at,p_environment
            )
        ),
      'compensatable',v_can_compensate and plan.status='executed'
        and exists(
          select 1 from public.cms_ai_execution_approvals approval
          where approval.plan_id=plan.id and approval.purpose='compensate'
            and approval.decision='approved' and approval.status='active'
            and approval.plan_hash=plan.plan_hash
            and approval.expires_at>statement_timestamp()
            and private.cms_ai_actor_row_scope_allowed(
              p_actor_id,approval.approved_by,approval.created_at,p_environment
            )
        ),
      'expiresAt',plan.expires_at,'createdAt',plan.created_at,
      'approvals',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',approval.id,'purpose',approval.purpose,'decision',approval.decision,
          'status',case when approval.status='active'
            and approval.expires_at<=statement_timestamp() then 'expired' else approval.status end,
          'planHash',approval.plan_hash,'approvedBy',approval.approved_by,
          'expiresAt',approval.expires_at,'createdAt',approval.created_at
        ) order by approval.created_at desc)
        from public.cms_ai_execution_approvals approval
        where approval.plan_id=plan.id
          and private.cms_ai_actor_row_scope_allowed(
            p_actor_id,approval.approved_by,approval.created_at,p_environment
          )
      ),'[]'::jsonb),
      'runs',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',run.id,'status',run.status,'executedBy',run.executed_by,
          'stepCount',run.step_count,'result',run.result,
          'compensationApproved',exists(
            select 1 from public.cms_ai_execution_approvals approval
            where approval.plan_id=plan.id and approval.purpose='compensate'
              and approval.decision='approved' and approval.status='active'
              and approval.expires_at>statement_timestamp()
              and private.cms_ai_actor_row_scope_allowed(
                p_actor_id,approval.approved_by,approval.created_at,p_environment
              )
          ),
          'createdAt',run.created_at,'completedAt',run.completed_at
        ) order by run.created_at desc)
        from public.cms_ai_execution_runs run
        where run.plan_id=plan.id
          and private.cms_ai_run_scope_allowed(p_actor_id,run.id,p_environment)
      ),'[]'::jsonb)
    ) payload
    from public.cms_ai_execution_plans plan
    where plan.environment=p_environment and plan.site_key=p_site_key
      and private.cms_ai_plan_scope_allowed(p_actor_id,plan.id,p_environment)
    order by plan.created_at desc limit 30
  ) visible;

  return jsonb_build_object(
    'schemaVersion',1,'correlationId',p_correlation_id,
    'policy',jsonb_build_object(
      'gate','G14','dataClass','synthetic','productionAllowed',false,
      'providerMode','openrouter','providerModel','nvidia/nemotron-3.5-lightning:free',
      'externalProviderEnabled',true,'externalProviderReady',false,
      'maxPlanSteps',20,'approvalMinutes',10,
      'reviewerSeparationRequired',true,'compensationRequired',true,
      'sameRunRequired',private.cms_ai_actor_ever_qa(p_actor_id),
      'automaticPublishAllowed',false,'manualFallback',true
    ),
    'permissions',jsonb_build_object(
      'canPlan',v_can_plan,'canApprove',v_can_approve,
      'canExecute',v_can_execute,'canCompensate',v_can_compensate
    ),
    'tools',v_tools,'targets',v_targets,'plans',v_plans
  );
end;
$$;

create or replace function private.cms_ai_plan_actor_ids(p_plan_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path=pg_catalog,public,pg_temp
as $$
  select coalesce(array_agg(distinct actor_id order by actor_id),'{}'::uuid[])
  from (
    select plan.created_by actor_id
    from public.cms_ai_execution_plans plan where plan.id=p_plan_id
    union all
    select target.created_by
    from public.cms_ai_execution_plans plan
    cross join lateral jsonb_array_elements(plan.steps) step
    join public.cms_ai_synthetic_targets target
      on target.target_ref=step->>'targetRef'
    where plan.id=p_plan_id
    union all
    select approval.approved_by
    from public.cms_ai_execution_approvals approval where approval.plan_id=p_plan_id
    union all
    select run.executed_by
    from public.cms_ai_execution_runs run where run.plan_id=p_plan_id
    union all
    select run.compensated_by
    from public.cms_ai_execution_runs run where run.plan_id=p_plan_id
  ) actors
  where actor_id is not null;
$$;

create function public.cms_execute_ai_command(
  p_actor_id uuid,p_action text,p_payload jsonb,p_environment text,p_site_key text,
  p_aal text,p_session_id text,p_issued_at timestamptz,p_command_id uuid,
  p_correlation_id uuid,p_idempotency_key text,p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,pg_temp
as $$
declare
  v_ai_session_id uuid;
  v_proposal_id uuid;
  v_owner_id uuid;
  v_response jsonb;
  v_response_id uuid;
begin
  if p_action not in (
       'start_session','generate_proposal','decide_proposal',
       'close_session','record_eval','record_denial'
     )
     or jsonb_typeof(p_payload) is distinct from 'object'
     or p_site_key is distinct from 'main'
     or p_environment not in ('local','staging')
     or p_aal is distinct from 'aal2'
     or not private.cms_user_actor_context_active(p_actor_id,p_environment) then
    raise exception 'CMS_AI_FORBIDDEN' using errcode='42501';
  end if;

  if p_action in ('generate_proposal','close_session') then
    begin
      v_ai_session_id:=nullif(p_payload->>'sessionId','')::uuid;
    exception when others then
      raise exception 'CMS_AI_COMMAND_INVALID' using errcode='22023';
    end;
    select session.actor_id into v_owner_id
    from public.cms_ai_sessions session where session.id=v_ai_session_id;
    if not found then raise exception 'CMS_AI_SESSION_NOT_FOUND' using errcode='PT404'; end if;
  elsif p_action='decide_proposal' then
    begin
      v_proposal_id:=nullif(p_payload->>'proposalId','')::uuid;
    exception when others then
      raise exception 'CMS_AI_COMMAND_INVALID' using errcode='22023';
    end;
    select session.id,session.actor_id into v_ai_session_id,v_owner_id
    from public.cms_ai_proposals proposal
    join public.cms_ai_sessions session on session.id=proposal.session_id
    where proposal.id=v_proposal_id;
    if not found then raise exception 'CMS_AI_PROPOSAL_NOT_FOUND' using errcode='PT404'; end if;
  end if;

  perform private.cms_lock_active_qa_actor_leases(
    array_remove(array[p_actor_id,v_owner_id],null)
  );
  if v_ai_session_id is not null and (
       not private.cms_ai_session_scope_allowed(
         p_actor_id,v_ai_session_id,p_environment
       )
       or (p_action in ('generate_proposal','close_session') and v_owner_id<>p_actor_id)
     ) then
    raise exception 'CMS_AI_SESSION_NOT_FOUND' using errcode='PT404';
  end if;
  if v_proposal_id is not null and not private.cms_ai_proposal_scope_allowed(
       p_actor_id,v_proposal_id,p_environment
     ) then
    raise exception 'CMS_AI_PROPOSAL_NOT_FOUND' using errcode='PT404';
  end if;
  if p_action='generate_proposal' and (
       p_payload->>'providerMode' is distinct from 'openrouter'
       or p_payload->>'providerModel' is distinct from 'nvidia/nemotron-3.5-lightning:free'
       or coalesce((p_payload->>'externalProviderEnabled')::boolean,false) is not true
       or p_payload->>'policyVersion' is distinct from 'f015-v1'
     ) then
    raise exception 'CMS_AI_PROVIDER_POLICY_FORBIDDEN' using errcode='42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('cms:ai-assist:'||p_environment||':'||p_site_key,0)
  );
  v_response:=public.cms_execute_ai_command_unscoped_0075(
    p_actor_id,p_action,p_payload,p_environment,p_site_key,p_aal,p_session_id,
    p_issued_at,p_command_id,p_correlation_id,p_idempotency_key,p_request_hash
  );

  begin
    if p_action='start_session' then
      v_response_id:=(v_response->>'sessionId')::uuid;
      if not private.cms_ai_session_scope_allowed(
           p_actor_id,v_response_id,p_environment
         ) then raise exception 'CMS_AI_RECEIPT_INVALID'; end if;
    elsif p_action='generate_proposal' then
      v_response_id:=(v_response->>'proposalId')::uuid;
      if not private.cms_ai_proposal_scope_allowed(
           p_actor_id,v_response_id,p_environment
         ) then raise exception 'CMS_AI_RECEIPT_INVALID'; end if;
    elsif p_action='decide_proposal' then
      v_response_id:=(v_response->>'proposalId')::uuid;
      if not private.cms_ai_proposal_scope_allowed(
           p_actor_id,v_response_id,p_environment
         ) then raise exception 'CMS_AI_RECEIPT_INVALID'; end if;
    elsif p_action='close_session' then
      v_response_id:=(v_response->>'sessionId')::uuid;
      if not private.cms_ai_session_scope_allowed(
           p_actor_id,v_response_id,p_environment
         ) then raise exception 'CMS_AI_RECEIPT_INVALID'; end if;
    end if;
  exception when others then
    raise exception 'CMS_AI_RECEIPT_INVALID' using errcode='55000';
  end;
  if p_action='generate_proposal' then
    v_response:=v_response||jsonb_build_object(
      'providerMode','openrouter','providerModel','nvidia/nemotron-3.5-lightning:free',
      'externalProviderEnabled',true,'applied',false,'published',false,'costMicros',0
    );
  elsif p_action='start_session' then
    v_response:=v_response||jsonb_build_object(
      'providerMode','openrouter','providerModel','nvidia/nemotron-3.5-lightning:free',
      'externalProviderEnabled',true
    );
  end if;
  update public.cms_ai_command_receipts receipt
  set response=v_response
  where receipt.actor_id=p_actor_id
    and receipt.idempotency_key=p_idempotency_key;
  return v_response;
end;
$$;

create function public.cms_execute_ai_transaction_command(
  p_actor_id uuid,p_action text,p_payload jsonb,p_environment text,p_site_key text,
  p_aal text,p_session_id text,p_issued_at timestamptz,p_command_id uuid,
  p_correlation_id uuid,p_idempotency_key text,p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,pg_temp
as $$
declare
  v_plan_id uuid;
  v_run_id uuid;
  v_target_ref text;
  v_actor_ids uuid[]:=array[p_actor_id];
  v_response jsonb;
  v_response_plan_id uuid;
  v_response_run_id uuid;
begin
  if p_action not in (
       'create_target','create_plan','revise_plan','approve_plan','execute_plan',
       'approve_compensation','compensate_run','cancel_plan','record_denial'
     )
     or jsonb_typeof(p_payload) is distinct from 'object'
     or p_site_key is distinct from 'main'
     or p_environment not in ('local','staging')
     or p_aal is distinct from 'aal2'
     or not private.cms_user_actor_context_active(p_actor_id,p_environment) then
    raise exception 'CMS_AI_EXECUTE_FORBIDDEN' using errcode='42501';
  end if;

  if p_action in ('revise_plan','approve_plan','execute_plan','cancel_plan') then
    begin
      v_plan_id:=nullif(p_payload->>'planId','')::uuid;
    exception when others then
      raise exception 'CMS_AI_EXECUTE_COMMAND_INVALID' using errcode='22023';
    end;
    if not exists(select 1 from public.cms_ai_execution_plans plan where plan.id=v_plan_id) then
      raise exception 'CMS_AI_EXECUTE_PLAN_NOT_FOUND' using errcode='PT404';
    end if;
    v_actor_ids:=array_cat(v_actor_ids,private.cms_ai_plan_actor_ids(v_plan_id));
  elsif p_action in ('approve_compensation','compensate_run') then
    begin
      v_run_id:=nullif(p_payload->>'runId','')::uuid;
    exception when others then
      raise exception 'CMS_AI_EXECUTE_COMMAND_INVALID' using errcode='22023';
    end;
    select run.plan_id into v_plan_id
    from public.cms_ai_execution_runs run where run.id=v_run_id;
    if not found then raise exception 'CMS_AI_EXECUTE_RUN_NOT_FOUND' using errcode='PT404'; end if;
    v_actor_ids:=array_cat(v_actor_ids,private.cms_ai_plan_actor_ids(v_plan_id));
  end if;

  if p_action in ('create_plan','revise_plan') then
    if jsonb_typeof(p_payload->'steps') is distinct from 'array' then
      raise exception 'CMS_AI_EXECUTE_PLAN_INVALID' using errcode='22023';
    end if;
    v_actor_ids:=array_cat(v_actor_ids,coalesce((
      select array_agg(distinct target.created_by order by target.created_by)
      from jsonb_array_elements(p_payload->'steps') step
      join public.cms_ai_synthetic_targets target
        on target.target_ref=step->>'targetRef'
    ),'{}'::uuid[]));
  end if;

  perform private.cms_lock_active_qa_actor_leases(v_actor_ids);
  if v_plan_id is not null and not private.cms_ai_plan_scope_allowed(
       p_actor_id,v_plan_id,p_environment
     ) then
    raise exception 'CMS_AI_EXECUTE_PLAN_NOT_FOUND' using errcode='PT404';
  end if;
  if v_run_id is not null and not private.cms_ai_run_scope_allowed(
       p_actor_id,v_run_id,p_environment
     ) then
    raise exception 'CMS_AI_EXECUTE_RUN_NOT_FOUND' using errcode='PT404';
  end if;
  if p_action in ('create_plan','revise_plan') and exists(
    select 1 from jsonb_array_elements(p_payload->'steps') step
    where not private.cms_ai_target_scope_allowed(
      p_actor_id,step->>'targetRef',p_environment
    )
  ) then
    raise exception 'CMS_AI_EXECUTE_TARGET_NOT_FOUND' using errcode='PT404';
  end if;
  if p_action='create_target' then
    v_target_ref:=p_payload->>'targetRef';
    if coalesce(v_target_ref,'') !~ '^g14x-[a-z0-9-]{3,100}$' then
      raise exception 'CMS_AI_EXECUTE_TARGET_INVALID' using errcode='22023';
    end if;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('cms:ai-execution:'||p_environment||':'||p_site_key,0)
  );
  -- The graph was discovered before the site-wide execution fence. A command
  -- that waited here must not proceed if the preceding command introduced a
  -- reviewer, executor, compensator or target owner whose lease was not locked.
  if v_plan_id is not null
     and not private.cms_ai_plan_actor_ids(v_plan_id) <@ v_actor_ids then
    raise exception 'CMS_AI_EXECUTE_GRAPH_CONFLICT' using errcode='PT409';
  end if;
  v_response:=public.cms_execute_ai_transaction_command_unscoped_0075(
    p_actor_id,p_action,p_payload,p_environment,p_site_key,p_aal,p_session_id,
    p_issued_at,p_command_id,p_correlation_id,p_idempotency_key,p_request_hash
  );

  begin
    if p_action='create_target' then
      v_target_ref:=v_response->>'targetRef';
      if not private.cms_ai_target_scope_allowed(
           p_actor_id,v_target_ref,p_environment
         ) then raise exception 'CMS_AI_EXECUTE_RECEIPT_INVALID'; end if;
    elsif p_action not in ('record_denial') then
      v_response_plan_id:=nullif(v_response->>'planId','')::uuid;
      if not private.cms_ai_plan_scope_allowed(
           p_actor_id,v_response_plan_id,p_environment
         ) then raise exception 'CMS_AI_EXECUTE_RECEIPT_INVALID'; end if;
      if v_response->>'runId' is not null then
        v_response_run_id:=(v_response->>'runId')::uuid;
        if not private.cms_ai_run_scope_allowed(
             p_actor_id,v_response_run_id,p_environment
           ) then raise exception 'CMS_AI_EXECUTE_RECEIPT_INVALID'; end if;
      end if;
    end if;
  exception when others then
    raise exception 'CMS_AI_EXECUTE_RECEIPT_INVALID' using errcode='55000';
  end;
  v_response:=v_response||jsonb_build_object(
    'providerMode','openrouter','providerModel','nvidia/nemotron-3.5-lightning:free',
    'realDataAllowed',false,'syntheticOnly',true
  );
  update public.cms_ai_command_receipts receipt
  set response=v_response
  where receipt.actor_id=p_actor_id
    and receipt.idempotency_key=p_idempotency_key;
  return v_response;
end;
$$;

create or replace function public.cms_ai_evidence_guard()
returns trigger
language plpgsql
set search_path=pg_catalog,public,pg_temp
as $$
begin
  if tg_op='DELETE' then
    raise exception 'CMS_AI_EVIDENCE_IMMUTABLE' using errcode='55000';
  end if;
  if current_setting('cms.ai_retention_cleanup',true)='on' then
    if tg_table_name='cms_ai_provider_calls'
       and (to_jsonb(old)-'session_id')=(to_jsonb(new)-'session_id')
       and old.session_id is not null and new.session_id is null then
      return new;
    end if;
    if tg_table_name='cms_ai_events'
       and (to_jsonb(old)-array['session_id','proposal_id'])
         =(to_jsonb(new)-array['session_id','proposal_id'])
       and (new.session_id is null or new.session_id=old.session_id)
       and (new.proposal_id is null or new.proposal_id=old.proposal_id) then
      return new;
    end if;
  end if;
  raise exception 'CMS_AI_EVIDENCE_IMMUTABLE' using errcode='55000';
end;
$$;

drop trigger if exists cms_ai_provider_calls_immutable
on public.cms_ai_provider_calls;
create trigger cms_ai_provider_calls_immutable
before update or delete on public.cms_ai_provider_calls
for each row execute function public.cms_ai_evidence_guard();
drop trigger if exists cms_ai_events_immutable on public.cms_ai_events;
create trigger cms_ai_events_immutable
before update or delete on public.cms_ai_events
for each row execute function public.cms_ai_evidence_guard();
drop trigger if exists cms_ai_execution_policy_decisions_immutable
on public.cms_ai_execution_policy_decisions;
create trigger cms_ai_execution_policy_decisions_immutable
before update or delete on public.cms_ai_execution_policy_decisions
for each row execute function public.cms_reject_immutable_mutation();
drop trigger if exists cms_ai_provider_policy_immutable
on public.cms_ai_provider_policy;
create trigger cms_ai_provider_policy_immutable
before update or delete on public.cms_ai_provider_policy
for each row execute function public.cms_reject_immutable_mutation();

create or replace function private.cms_purge_expired_ai_data(p_limit integer default 1000)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,pg_temp
as $$
declare
  v_session_ids uuid[]:='{}'::uuid[];
  v_affected integer:=0;
  v_deleted integer:=0;
  v_preserved_provider integer:=0;
  v_preserved_events integer:=0;
  v_cutoff timestamptz:=statement_timestamp()-interval '23 hours 55 minutes';
begin
  if p_limit is null or p_limit not between 1 and 5000 then
    raise exception 'CMS_AI_RETENTION_LIMIT_INVALID' using errcode='22023';
  end if;
  select coalesce(array_agg(due.id order by due.id),'{}'::uuid[])
  into v_session_ids
  from (
    select session.id from public.cms_ai_sessions session
    where session.retention_until<=statement_timestamp()
    order by session.retention_until,session.id
    for update skip locked limit p_limit
  ) due;

  select count(*) into v_preserved_provider
  from public.cms_ai_provider_calls provider_call
  where provider_call.session_id=any(v_session_ids);
  select count(*) into v_preserved_events
  from public.cms_ai_events event
  where event.session_id=any(v_session_ids)
     or exists(
       select 1 from public.cms_ai_proposals proposal
       where proposal.id=event.proposal_id and proposal.session_id=any(v_session_ids)
     );
  perform set_config('cms.ai_retention_cleanup','on',true);

  delete from public.cms_ai_command_receipts receipt
  where receipt.created_at<=v_cutoff;
  get diagnostics v_affected=row_count;
  v_deleted:=v_deleted+v_affected;
  delete from public.cms_ai_tool_calls tool_call
  where tool_call.session_id=any(v_session_ids)
     or (tool_call.session_id is null and tool_call.created_at<=v_cutoff);
  get diagnostics v_affected=row_count;
  v_deleted:=v_deleted+v_affected;
  delete from public.cms_ai_eval_runs eval
  where eval.created_at<=v_cutoff;
  get diagnostics v_affected=row_count;
  v_deleted:=v_deleted+v_affected;
  delete from public.cms_ai_approvals approval
  where exists(
    select 1 from public.cms_ai_proposals proposal
    where proposal.id=approval.proposal_id
      and proposal.session_id=any(v_session_ids)
  );
  get diagnostics v_affected=row_count;
  v_deleted:=v_deleted+v_affected;
  delete from public.cms_ai_proposals proposal
  where proposal.session_id=any(v_session_ids);
  get diagnostics v_affected=row_count;
  v_deleted:=v_deleted+v_affected;
  delete from public.cms_ai_messages message
  where message.session_id=any(v_session_ids);
  get diagnostics v_affected=row_count;
  v_deleted:=v_deleted+v_affected;
  delete from public.cms_ai_sources source
  where source.session_id=any(v_session_ids);
  get diagnostics v_affected=row_count;
  v_deleted:=v_deleted+v_affected;
  delete from public.cms_ai_sessions session
  where session.id=any(v_session_ids);
  get diagnostics v_affected=row_count;
  v_deleted:=v_deleted+v_affected;
  perform set_config('cms.ai_retention_cleanup','off',true);
  return jsonb_build_object(
    'schemaVersion',1,'expiredSessionsSelected',cardinality(v_session_ids),
    'deletedRows',v_deleted,'providerMode','openrouter',
    'providerEvidencePreserved',v_preserved_provider,
    'eventEvidencePreserved',v_preserved_events
  );
exception when others then
  perform set_config('cms.ai_retention_cleanup','off',true);
  raise;
end;
$$;

create or replace function private.cms_ai_terminalize_qa_actor_graph()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private,pg_temp
as $$
declare
  v_plan_ids uuid[];
  v_session_ids uuid[];
  v_sessions integer:=0;
  v_targets integer:=0;
  v_plans integer:=0;
  v_approvals integer:=0;
  v_affected integer:=0;
  v_business_rows_removed integer:=0;
begin
  if old.status<>'active' or new.status='active' then return new; end if;
  perform set_config('cms.ai_terminal_cleanup','on',true);
  perform pg_advisory_xact_lock(
    hashtextextended('cms:ai-assist:'||old.environment||':main',0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended('cms:ai-execution:'||old.environment||':main',0)
  );
  select coalesce(array_agg(distinct affected.plan_id order by affected.plan_id),'{}'::uuid[])
  into v_plan_ids
  from (
    select plan.id plan_id from public.cms_ai_execution_plans plan
    where plan.created_by=old.actor_id
    union all
    select approval.plan_id from public.cms_ai_execution_approvals approval
    where approval.approved_by=old.actor_id
    union all
    select plan.id
    from public.cms_ai_execution_plans plan
    cross join lateral jsonb_array_elements(plan.steps) step
    join public.cms_ai_synthetic_targets target
      on target.target_ref=step->>'targetRef'
    where target.created_by=old.actor_id
    union all
    select run.plan_id from public.cms_ai_execution_runs run
    where run.executed_by=old.actor_id or run.compensated_by=old.actor_id
  ) affected;
  select coalesce(array_agg(session.id order by session.id),'{}'::uuid[])
  into v_session_ids from public.cms_ai_sessions session
  where session.actor_id=old.actor_id;

  -- Resource order matches command order after the already-held lease:
  -- receipts (read fence), sessions/plans, approvals, then targets.
  perform 1 from public.cms_ai_command_receipts receipt
  where receipt.actor_id=old.actor_id order by receipt.id for update;
  perform 1 from public.cms_ai_sessions session
  where session.actor_id=old.actor_id order by session.id for update;
  perform 1 from public.cms_ai_execution_plans plan
  where plan.id=any(v_plan_ids) order by plan.id for update;
  perform 1 from public.cms_ai_execution_approvals approval
  where approval.plan_id=any(v_plan_ids) or approval.approved_by=old.actor_id
  order by approval.id for update;
  perform 1 from public.cms_ai_synthetic_targets target
  where target.created_by=old.actor_id order by target.target_ref for update;

  update public.cms_ai_sessions session
  set status='closed',closed_at=coalesce(session.closed_at,statement_timestamp()),
      updated_at=statement_timestamp()
  where session.actor_id=old.actor_id and session.status='active';
  get diagnostics v_sessions=row_count;
  update public.cms_ai_execution_approvals approval
  set status='expired'
  where approval.status='active'
    and (approval.plan_id=any(v_plan_ids) or approval.approved_by=old.actor_id);
  get diagnostics v_approvals=row_count;
  update public.cms_ai_execution_plans plan
  set status='canceled',updated_at=statement_timestamp()
  where plan.id=any(v_plan_ids)
    and plan.status in ('ready','approved','rejected','executing');
  get diagnostics v_plans=row_count;
  update public.cms_ai_synthetic_targets target
  set lifecycle='retired',title='QA terminal target',payload='{}'::jsonb,
      updated_by=old.actor_id,updated_at=statement_timestamp()
  where target.created_by=old.actor_id;
  get diagnostics v_targets=row_count;

  -- Remove prompt/proposal/source business material immediately. Provider calls
  -- and AI events detach their foreign keys and remain immutable evidence.
  perform set_config('cms.ai_retention_cleanup','on',true);
  delete from public.cms_ai_tool_calls tool_call
  where tool_call.session_id=any(v_session_ids);
  get diagnostics v_affected=row_count;
  v_business_rows_removed:=v_business_rows_removed+v_affected;
  delete from public.cms_ai_eval_runs eval where eval.actor_id=old.actor_id;
  get diagnostics v_affected=row_count;
  v_business_rows_removed:=v_business_rows_removed+v_affected;
  delete from public.cms_ai_approvals approval where exists(
    select 1 from public.cms_ai_proposals proposal
    where proposal.id=approval.proposal_id
      and proposal.session_id=any(v_session_ids)
  );
  get diagnostics v_affected=row_count;
  v_business_rows_removed:=v_business_rows_removed+v_affected;
  delete from public.cms_ai_proposals proposal
  where proposal.session_id=any(v_session_ids);
  get diagnostics v_affected=row_count;
  v_business_rows_removed:=v_business_rows_removed+v_affected;
  delete from public.cms_ai_messages message
  where message.session_id=any(v_session_ids);
  get diagnostics v_affected=row_count;
  v_business_rows_removed:=v_business_rows_removed+v_affected;
  delete from public.cms_ai_sources source
  where source.session_id=any(v_session_ids);
  get diagnostics v_affected=row_count;
  v_business_rows_removed:=v_business_rows_removed+v_affected;
  delete from public.cms_ai_sessions session
  where session.id=any(v_session_ids);
  get diagnostics v_affected=row_count;
  v_business_rows_removed:=v_business_rows_removed+v_affected;
  perform set_config('cms.ai_retention_cleanup','off',true);

  -- Retain the relational execution evidence but strip all free-form residue.
  update public.cms_ai_execution_approvals approval
  set rationale='QA terminalized'
  where approval.plan_id=any(v_plan_ids) or approval.approved_by=old.actor_id;
  update public.cms_ai_execution_runs run
  set result=jsonb_build_object('terminal',true)
  where run.plan_id=any(v_plan_ids);
  update public.cms_ai_execution_run_steps run_step
  set before_snapshot='{}'::jsonb,after_snapshot='{}'::jsonb
  where exists(
    select 1 from public.cms_ai_execution_runs run
    where run.id=run_step.run_id and run.plan_id=any(v_plan_ids)
  );
  update public.cms_ai_execution_plans plan
  set title='QA terminal plan',
      steps=jsonb_build_array(jsonb_build_object('terminal',true)),
      dry_run=jsonb_build_object('valid',true,'reversible',true,'terminal',true),
      updated_at=statement_timestamp()
  where plan.id=any(v_plan_ids);

  insert into public.cms_ai_events(
    actor_id,event_type,correlation_id,details
  ) values (
    old.actor_id,'ai_qa_scope_terminal',old.correlation_id,
    jsonb_build_object(
      'runTag',old.run_tag,'candidateSha',old.candidate_sha,
      'environment',old.environment,'terminalStatus',new.status,
      'sessionsClosed',v_sessions,'plansCanceled',v_plans,
      'approvalsExpired',v_approvals,'targetsRetired',v_targets,
      'businessRowsRemoved',v_business_rows_removed,
      'businessResidueActive',false
    )
  );
  insert into public.cms_audit_log(
    actor_id,action,target_type,target_id,event_data,correlation_id
  ) values (
    old.actor_id,'cms:qa.ai.cleanup','qa_actor_lease',old.actor_id::text,
    jsonb_build_object(
      'runTag',old.run_tag,'environment',old.environment,
      'terminalStatus',new.status,'sessionsClosed',v_sessions,
      'plansCanceled',v_plans,'approvalsExpired',v_approvals,
      'targetsRetired',v_targets,'businessRowsRemoved',v_business_rows_removed
    ),old.correlation_id
  );
  perform set_config('cms.ai_terminal_cleanup','off',true);
  return new;
exception when others then
  perform set_config('cms.ai_retention_cleanup','off',true);
  perform set_config('cms.ai_terminal_cleanup','off',true);
  raise;
end;
$$;

drop trigger if exists zzzz_cms_ai_terminal_cleanup
on private.cms_qa_actor_leases;
create trigger zzzz_cms_ai_terminal_cleanup
before update of status on private.cms_qa_actor_leases
for each row execute function private.cms_ai_terminalize_qa_actor_graph();

create or replace function public.cms_ai_actor_session_read_allowed(
  p_row_actor_id uuid,p_row_at timestamptz,p_environment text default null
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,private,pg_temp
as $$
  select private.cms_ai_actor_row_scope_allowed(
    auth.uid(),p_row_actor_id,p_row_at,
    coalesce(p_environment,private.cms_user_actor_environment(auth.uid()))
  );
$$;
create or replace function public.cms_ai_session_session_read_allowed(
  p_ai_session_id uuid,p_environment text
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,private,pg_temp
as $$
  select private.cms_ai_session_scope_allowed(
    auth.uid(),p_ai_session_id,p_environment
  );
$$;
create or replace function public.cms_ai_proposal_session_read_allowed(
  p_proposal_id uuid,p_environment text
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,private,pg_temp
as $$
  select private.cms_ai_proposal_scope_allowed(
    auth.uid(),p_proposal_id,p_environment
  );
$$;
create or replace function public.cms_ai_target_session_read_allowed(
  p_target_ref text,p_environment text
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,private,pg_temp
as $$
  select private.cms_ai_target_scope_allowed(
    auth.uid(),p_target_ref,p_environment
  );
$$;
create or replace function public.cms_ai_plan_session_read_allowed(
  p_plan_id uuid,p_environment text
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,private,pg_temp
as $$
  select private.cms_ai_plan_scope_allowed(auth.uid(),p_plan_id,p_environment);
$$;
create or replace function public.cms_ai_run_session_read_allowed(
  p_run_id uuid,p_environment text
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,private,pg_temp
as $$
  select private.cms_ai_run_scope_allowed(auth.uid(),p_run_id,p_environment);
$$;

drop policy if exists cms_ai_sessions_authoritative_read on public.cms_ai_sessions;
create policy cms_ai_sessions_authoritative_read on public.cms_ai_sessions
for select to authenticated using(
  public.cms_has_permission('cms:ai.read')
  and public.cms_ai_session_session_read_allowed(id,environment)
);
drop policy if exists cms_ai_sources_authoritative_read on public.cms_ai_sources;
create policy cms_ai_sources_authoritative_read on public.cms_ai_sources
for select to authenticated using(
  public.cms_has_permission('cms:ai.read') and exists(
    select 1 from public.cms_ai_sessions session
    where session.id=cms_ai_sources.session_id
      and public.cms_ai_session_session_read_allowed(session.id,session.environment)
      and public.cms_ai_actor_session_read_allowed(
        cms_ai_sources.actor_id,cms_ai_sources.created_at,session.environment
      )
  )
);
drop policy if exists cms_ai_messages_authoritative_read on public.cms_ai_messages;
create policy cms_ai_messages_authoritative_read on public.cms_ai_messages
for select to authenticated using(
  public.cms_has_permission('cms:ai.read') and exists(
    select 1 from public.cms_ai_sessions session
    where session.id=cms_ai_messages.session_id
      and public.cms_ai_session_session_read_allowed(session.id,session.environment)
      and public.cms_ai_actor_session_read_allowed(
        cms_ai_messages.actor_id,cms_ai_messages.created_at,session.environment
      )
  )
);
drop policy if exists cms_ai_proposals_authoritative_read on public.cms_ai_proposals;
create policy cms_ai_proposals_authoritative_read on public.cms_ai_proposals
for select to authenticated using(
  public.cms_has_permission('cms:ai.read') and exists(
    select 1 from public.cms_ai_sessions session
    where session.id=cms_ai_proposals.session_id
      and public.cms_ai_proposal_session_read_allowed(
        cms_ai_proposals.id,session.environment
      )
  )
);
drop policy if exists cms_ai_approvals_authoritative_read on public.cms_ai_approvals;
create policy cms_ai_approvals_authoritative_read on public.cms_ai_approvals
for select to authenticated using(
  public.cms_has_permission('cms:ai.read') and exists(
    select 1
    from public.cms_ai_proposals proposal
    join public.cms_ai_sessions session on session.id=proposal.session_id
    where proposal.id=cms_ai_approvals.proposal_id
      and public.cms_ai_proposal_session_read_allowed(proposal.id,session.environment)
      and public.cms_ai_actor_session_read_allowed(
        cms_ai_approvals.decided_by,cms_ai_approvals.created_at,session.environment
      )
  )
);
drop policy if exists cms_ai_tool_calls_authoritative_read on public.cms_ai_tool_calls;
create policy cms_ai_tool_calls_authoritative_read on public.cms_ai_tool_calls
for select to authenticated using(
  public.cms_has_permission('cms:ai.read')
  and public.cms_ai_actor_session_read_allowed(
    cms_ai_tool_calls.actor_id,cms_ai_tool_calls.created_at
  )
  and (
    cms_ai_tool_calls.session_id is null or exists(
      select 1 from public.cms_ai_sessions session
      where session.id=cms_ai_tool_calls.session_id
        and public.cms_ai_session_session_read_allowed(session.id,session.environment)
    )
  )
);
drop policy if exists cms_ai_eval_runs_authoritative_read on public.cms_ai_eval_runs;
create policy cms_ai_eval_runs_authoritative_read on public.cms_ai_eval_runs
for select to authenticated using(
  public.cms_has_permission('cms:ai.read')
  and public.cms_ai_actor_session_read_allowed(
    cms_ai_eval_runs.actor_id,cms_ai_eval_runs.created_at,cms_ai_eval_runs.environment
  )
);
drop policy if exists cms_ai_receipts_authoritative_read on public.cms_ai_command_receipts;
create policy cms_ai_receipts_authoritative_read on public.cms_ai_command_receipts
for select to authenticated using(
  public.cms_has_permission('cms:ai.read')
  and public.cms_ai_actor_session_read_allowed(
    cms_ai_command_receipts.actor_id,cms_ai_command_receipts.created_at
  )
);
drop policy if exists cms_ai_events_authoritative_read on public.cms_ai_events;
create policy cms_ai_events_authoritative_read on public.cms_ai_events
for select to authenticated using(
  public.cms_has_permission('cms:ai.read')
  and public.cms_ai_actor_session_read_allowed(
    cms_ai_events.actor_id,cms_ai_events.created_at
  )
  and (
    cms_ai_events.session_id is null or exists(
      select 1 from public.cms_ai_sessions session
      where session.id=cms_ai_events.session_id
        and public.cms_ai_session_session_read_allowed(session.id,session.environment)
    )
  )
);
drop policy if exists cms_ai_provider_calls_authoritative_read on public.cms_ai_provider_calls;
create policy cms_ai_provider_calls_authoritative_read on public.cms_ai_provider_calls
for select to authenticated using(
  public.cms_has_permission('cms:ai.read')
  and public.cms_ai_actor_session_read_allowed(
    cms_ai_provider_calls.actor_id,cms_ai_provider_calls.created_at
  )
  and (
    cms_ai_provider_calls.session_id is null or exists(
      select 1 from public.cms_ai_sessions session
      where session.id=cms_ai_provider_calls.session_id
        and public.cms_ai_session_session_read_allowed(session.id,session.environment)
    )
  )
);

drop policy if exists cms_ai_targets_authoritative_read on public.cms_ai_synthetic_targets;
create policy cms_ai_targets_authoritative_read on public.cms_ai_synthetic_targets
for select to authenticated using(
  public.cms_has_permission('cms:ai.read')
  and public.cms_ai_target_session_read_allowed(target_ref,environment)
);
drop policy if exists cms_ai_plans_authoritative_read on public.cms_ai_execution_plans;
create policy cms_ai_plans_authoritative_read on public.cms_ai_execution_plans
for select to authenticated using(
  public.cms_has_permission('cms:ai.read')
  and public.cms_ai_plan_session_read_allowed(id,environment)
);
drop policy if exists cms_ai_execution_approvals_authoritative_read
on public.cms_ai_execution_approvals;
create policy cms_ai_execution_approvals_authoritative_read
on public.cms_ai_execution_approvals for select to authenticated using(
  public.cms_has_permission('cms:ai.read') and exists(
    select 1 from public.cms_ai_execution_plans plan
    where plan.id=cms_ai_execution_approvals.plan_id
      and public.cms_ai_plan_session_read_allowed(plan.id,plan.environment)
      and public.cms_ai_actor_session_read_allowed(
        cms_ai_execution_approvals.approved_by,
        cms_ai_execution_approvals.created_at,plan.environment
      )
  )
);
drop policy if exists cms_ai_runs_authoritative_read on public.cms_ai_execution_runs;
create policy cms_ai_runs_authoritative_read on public.cms_ai_execution_runs
for select to authenticated using(
  public.cms_has_permission('cms:ai.read') and exists(
    select 1 from public.cms_ai_execution_plans plan
    where plan.id=cms_ai_execution_runs.plan_id
      and public.cms_ai_run_session_read_allowed(
        cms_ai_execution_runs.id,plan.environment
      )
  )
);
drop policy if exists cms_ai_run_steps_authoritative_read
on public.cms_ai_execution_run_steps;
create policy cms_ai_run_steps_authoritative_read
on public.cms_ai_execution_run_steps for select to authenticated using(
  public.cms_has_permission('cms:ai.read') and exists(
    select 1
    from public.cms_ai_execution_runs run
    join public.cms_ai_execution_plans plan on plan.id=run.plan_id
    where run.id=cms_ai_execution_run_steps.run_id
      and public.cms_ai_run_session_read_allowed(run.id,plan.environment)
      and public.cms_ai_target_session_read_allowed(
        cms_ai_execution_run_steps.target_ref,plan.environment
      )
  )
);
drop policy if exists cms_ai_execution_decisions_authoritative_read
on public.cms_ai_execution_policy_decisions;
create policy cms_ai_execution_decisions_authoritative_read
on public.cms_ai_execution_policy_decisions for select to authenticated using(
  public.cms_has_permission('cms:ai.read')
  and public.cms_ai_actor_session_read_allowed(
    cms_ai_execution_policy_decisions.actor_id,
    cms_ai_execution_policy_decisions.created_at,
    cms_ai_execution_policy_decisions.environment
  )
  and (
    cms_ai_execution_policy_decisions.plan_id is null
    or public.cms_ai_plan_session_read_allowed(
      cms_ai_execution_policy_decisions.plan_id,
      cms_ai_execution_policy_decisions.environment
    )
  )
  and (
    cms_ai_execution_policy_decisions.run_id is null
    or public.cms_ai_run_session_read_allowed(
      cms_ai_execution_policy_decisions.run_id,
      cms_ai_execution_policy_decisions.environment
    )
  )
);

alter table public.cms_ai_provider_policy enable row level security;
revoke all on table
  public.cms_ai_provider_policy,
  public.cms_ai_provider_calls,
  public.cms_ai_sessions,
  public.cms_ai_sources,
  public.cms_ai_messages,
  public.cms_ai_proposals,
  public.cms_ai_approvals,
  public.cms_ai_tool_calls,
  public.cms_ai_eval_runs,
  public.cms_ai_command_receipts,
  public.cms_ai_events,
  public.cms_ai_synthetic_targets,
  public.cms_ai_execution_plans,
  public.cms_ai_execution_approvals,
  public.cms_ai_execution_runs,
  public.cms_ai_execution_run_steps,
  public.cms_ai_execution_policy_decisions
from public,anon,authenticated;
grant all on table public.cms_ai_provider_policy to service_role;

revoke all on function private.cms_ai_actor_ever_qa(uuid)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_ai_actor_row_scope_allowed(uuid,uuid,timestamptz,text)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_ai_target_scope_allowed(uuid,text,text)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_ai_session_scope_allowed(uuid,uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_ai_proposal_scope_allowed(uuid,uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_ai_plan_scope_allowed(uuid,uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_ai_run_scope_allowed(uuid,uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_ai_plan_actor_ids(uuid)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_ai_terminalize_qa_actor_graph()
  from public,anon,authenticated,service_role;
revoke all on function private.cms_purge_expired_ai_data(integer)
  from public,anon,authenticated,service_role;
revoke all on function public.cms_ai_target_provenance_guard()
  from public,anon,authenticated,service_role;
revoke all on function public.cms_ai_evidence_guard()
  from public,anon,authenticated,service_role;

revoke all on function public.cms_ai_actor_session_read_allowed(uuid,timestamptz,text)
  from public,anon,authenticated;
grant execute on function public.cms_ai_actor_session_read_allowed(uuid,timestamptz,text)
  to authenticated;
revoke all on function public.cms_ai_session_session_read_allowed(uuid,text)
  from public,anon,authenticated;
grant execute on function public.cms_ai_session_session_read_allowed(uuid,text)
  to authenticated;
revoke all on function public.cms_ai_proposal_session_read_allowed(uuid,text)
  from public,anon,authenticated;
grant execute on function public.cms_ai_proposal_session_read_allowed(uuid,text)
  to authenticated;
revoke all on function public.cms_ai_target_session_read_allowed(text,text)
  from public,anon,authenticated;
grant execute on function public.cms_ai_target_session_read_allowed(text,text)
  to authenticated;
revoke all on function public.cms_ai_plan_session_read_allowed(uuid,text)
  from public,anon,authenticated;
grant execute on function public.cms_ai_plan_session_read_allowed(uuid,text)
  to authenticated;
revoke all on function public.cms_ai_run_session_read_allowed(uuid,text)
  from public,anon,authenticated;
grant execute on function public.cms_ai_run_session_read_allowed(uuid,text)
  to authenticated;

revoke all on function public.cms_ai_capability(uuid,text,text,text,text,timestamptz)
  from public,anon,authenticated;
grant execute on function public.cms_ai_capability(uuid,text,text,text,text,timestamptz)
  to service_role;
revoke all on function public.cms_get_ai_workspace(
  uuid,text,text,text,text,timestamptz,uuid
) from public,anon,authenticated;
grant execute on function public.cms_get_ai_workspace(
  uuid,text,text,text,text,timestamptz,uuid
) to service_role;
revoke all on function public.cms_execute_ai_command(
  uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,text
) from public,anon,authenticated;
grant execute on function public.cms_execute_ai_command(
  uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,text
) to service_role;
revoke all on function public.cms_ai_execute_capability(
  uuid,text,text,text,text,timestamptz
) from public,anon,authenticated;
grant execute on function public.cms_ai_execute_capability(
  uuid,text,text,text,text,timestamptz
) to service_role;
revoke all on function public.cms_get_ai_execution_workspace(
  uuid,text,text,text,text,timestamptz,uuid
) from public,anon,authenticated;
grant execute on function public.cms_get_ai_execution_workspace(
  uuid,text,text,text,text,timestamptz,uuid
) to service_role;
revoke all on function public.cms_execute_ai_transaction_command(
  uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,text
) from public,anon,authenticated;
grant execute on function public.cms_execute_ai_transaction_command(
  uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,text
) to service_role;
revoke all on function public.cms_record_ai_provider_call_scoped(
  uuid,uuid,text,text,text,text,timestamptz,text,text,integer,integer,text,text,uuid
) from public,anon,authenticated;
grant execute on function public.cms_record_ai_provider_call_scoped(
  uuid,uuid,text,text,text,text,timestamptz,text,text,integer,integer,text,text,uuid
) to service_role;
