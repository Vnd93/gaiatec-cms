begin;

-- The usage RPC shipped with the progressive draft rollout still joined the
-- retired item_id column. Patch the deployed definition in place so all other
-- filtering, RBAC and redaction semantics remain byte-for-byte equivalent.
do $media_usage_patch$
declare
  v_function regprocedure := to_regprocedure(
    'public.cms_list_media_usages_scoped(uuid,text,text,text,timestamp with time zone,uuid[])'
  );
  v_definition text;
begin
  if v_function is null then
    raise exception 'CMS_RUNTIME_FOLLOWUP_MEDIA_USAGE_RPC_MISSING'
      using errcode = '55000';
  end if;
  select pg_get_functiondef(v_function::oid) into v_definition;
  if position('progressive.item_id = item.id' in v_definition) = 0 then
    raise exception 'CMS_RUNTIME_FOLLOWUP_MEDIA_USAGE_PATCH_POINT_MISSING'
      using errcode = '55000';
  end if;
  execute replace(
    v_definition,
    'progressive.item_id = item.id',
    'progressive.promoted_item_id = item.id'
  );
end;
$media_usage_patch$;

-- Preserve the public AI contract: an otherwise valid AAL1 request must tell
-- the operator to complete MFA, while malformed or out-of-scope calls remain
-- opaque. The historical core still performs its own authorization checks.
create or replace function public.cms_execute_ai_command(
  p_actor_id uuid,p_action text,p_payload jsonb,p_environment text,p_site_key text,
  p_aal text,p_session_id text,p_issued_at timestamptz,p_command_id uuid,
  p_correlation_id uuid,p_idempotency_key text,p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,private,pg_temp
as $$
declare
  v_ai_session_id uuid;
  v_proposal_id uuid;
  v_owner_id uuid;
  v_response jsonb;
  v_response_id uuid;
begin
  if p_action is null
     or p_action not in (
       'start_session','generate_proposal','decide_proposal',
       'close_session','record_eval','record_denial'
     )
     or jsonb_typeof(p_payload) is distinct from 'object'
     or p_site_key is distinct from 'main'
     or p_environment is null
     or p_environment not in ('local','staging') then
    raise exception 'CMS_AI_FORBIDDEN' using errcode='42501';
  end if;
  if p_aal is distinct from 'aal2' then
    raise exception 'CMS_AI_MFA_REQUIRED' using errcode='42501';
  end if;
  if not private.cms_user_actor_context_active(p_actor_id,p_environment) then
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

-- Clone each deployed implementation before replacing its body. CREATE OR
-- REPLACE below preserves the public RPC OID, so any stored dependency keeps
-- crossing the hardened wrapper instead of following a renamed implementation.
do $runtime_followup_clone_cores$
declare
  v_index integer;
  v_source regprocedure;
  v_definition text;
  v_core_definition text;
  v_source_names constant text[]:=array[
    'cms_prepare_dam_gc',
    'cms_complete_dam_gc',
    'cms_retry_lead_delivery_scoped',
    'cms_execute_dam_command'
  ];
  v_core_names constant text[]:=array[
    'cms_prepare_dam_gc_core_0088',
    'cms_complete_dam_gc_core_0088',
    'cms_retry_lead_delivery_scoped_core_0088',
    'cms_execute_dam_command_core_0088'
  ];
  v_source_signatures constant text[]:=array[
    'public.cms_prepare_dam_gc(uuid,text,text,text,text,timestamp with time zone,uuid,uuid)',
    'public.cms_complete_dam_gc(uuid,text,text,text,text,timestamp with time zone,uuid,uuid,boolean)',
    'public.cms_retry_lead_delivery_scoped(uuid,uuid,text,text,text,text,text,timestamp with time zone,uuid,uuid,text)',
    'public.cms_execute_dam_command(uuid,text,text,text,text,timestamp with time zone,text,jsonb,uuid,uuid,text,uuid)'
  ];
  v_core_signatures constant text[]:=array[
    'public.cms_prepare_dam_gc_core_0088(uuid,text,text,text,text,timestamp with time zone,uuid,uuid)',
    'public.cms_complete_dam_gc_core_0088(uuid,text,text,text,text,timestamp with time zone,uuid,uuid,boolean)',
    'public.cms_retry_lead_delivery_scoped_core_0088(uuid,uuid,text,text,text,text,text,timestamp with time zone,uuid,uuid,text)',
    'public.cms_execute_dam_command_core_0088(uuid,text,text,text,text,timestamp with time zone,text,jsonb,uuid,uuid,text,uuid)'
  ];
begin
  for v_index in 1..array_length(v_source_names,1) loop
    v_source:=to_regprocedure(v_source_signatures[v_index]);
    if v_source is null then
      raise exception 'CMS_RUNTIME_FOLLOWUP_CORE_SOURCE_MISSING:%',v_source_names[v_index]
        using errcode='55000';
    end if;
    if to_regprocedure(v_core_signatures[v_index]) is not null then
      raise exception 'CMS_RUNTIME_FOLLOWUP_CORE_ALREADY_EXISTS:%',v_core_names[v_index]
        using errcode='55000';
    end if;
    perform set_config(
      'cms.runtime_followup.public_oid_'||v_index::text,
      v_source::oid::text,
      true
    );
    v_definition:=pg_get_functiondef(v_source::oid);
    v_core_definition:=replace(
      v_definition,
      'CREATE OR REPLACE FUNCTION public.'||v_source_names[v_index]||'(',
      'CREATE FUNCTION public.'||v_core_names[v_index]||'('
    );
    if v_core_definition is not distinct from v_definition then
      raise exception 'CMS_RUNTIME_FOLLOWUP_CORE_CLONE_POINT_MISSING:%',v_source_names[v_index]
        using errcode='55000';
    end if;
    execute v_core_definition;
  end loop;
end;
$runtime_followup_clone_cores$;

-- A GC capability is valid only during the fenced mutation itself. The cloned
-- 0065 implementations are owner-only; public wrappers restore every
-- transaction-local capability on success and on failure.

revoke all on function public.cms_prepare_dam_gc_core_0088(
  uuid,text,text,text,text,timestamptz,uuid,uuid
) from public,anon,authenticated,service_role;
revoke all on function public.cms_complete_dam_gc_core_0088(
  uuid,text,text,text,text,timestamptz,uuid,uuid,boolean
) from public,anon,authenticated,service_role;

create or replace function public.cms_prepare_dam_gc(
  p_actor_id uuid,p_environment text,p_site_key text,p_aal text,
  p_session_id text,p_issued_at timestamptz,p_job_id uuid,p_claim_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,private,pg_temp
as $$
declare
  v_previous_actor text := current_setting('cms.qa_mutation_actor_id',true);
  v_previous_compensating text := current_setting('cms.qa_compensating',true);
  v_previous_operation text := current_setting('cms.dam_gc_operation',true);
  v_previous_claim text := current_setting('cms.dam_gc_claim_id',true);
  v_response jsonb;
begin
  v_response:=public.cms_prepare_dam_gc_core_0088(
    p_actor_id,p_environment,p_site_key,p_aal,p_session_id,p_issued_at,p_job_id,p_claim_id
  );
  perform set_config('cms.qa_mutation_actor_id',coalesce(v_previous_actor,''),true);
  perform set_config('cms.qa_compensating',coalesce(v_previous_compensating,''),true);
  perform set_config('cms.dam_gc_operation',coalesce(v_previous_operation,''),true);
  perform set_config('cms.dam_gc_claim_id',coalesce(v_previous_claim,''),true);
  return v_response;
exception when others then
  perform set_config('cms.qa_mutation_actor_id',coalesce(v_previous_actor,''),true);
  perform set_config('cms.qa_compensating',coalesce(v_previous_compensating,''),true);
  perform set_config('cms.dam_gc_operation',coalesce(v_previous_operation,''),true);
  perform set_config('cms.dam_gc_claim_id',coalesce(v_previous_claim,''),true);
  raise;
end;
$$;

create or replace function public.cms_complete_dam_gc(
  p_actor_id uuid,p_environment text,p_site_key text,p_aal text,
  p_session_id text,p_issued_at timestamptz,p_job_id uuid,p_claim_id uuid,
  p_succeeded boolean
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,private,pg_temp
as $$
declare
  v_previous_actor text := current_setting('cms.qa_mutation_actor_id',true);
  v_previous_compensating text := current_setting('cms.qa_compensating',true);
  v_previous_operation text := current_setting('cms.dam_gc_operation',true);
  v_previous_claim text := current_setting('cms.dam_gc_claim_id',true);
  v_response jsonb;
begin
  v_response:=public.cms_complete_dam_gc_core_0088(
    p_actor_id,p_environment,p_site_key,p_aal,p_session_id,p_issued_at,
    p_job_id,p_claim_id,p_succeeded
  );
  perform set_config('cms.qa_mutation_actor_id',coalesce(v_previous_actor,''),true);
  perform set_config('cms.qa_compensating',coalesce(v_previous_compensating,''),true);
  perform set_config('cms.dam_gc_operation',coalesce(v_previous_operation,''),true);
  perform set_config('cms.dam_gc_claim_id',coalesce(v_previous_claim,''),true);
  return v_response;
exception when others then
  perform set_config('cms.qa_mutation_actor_id',coalesce(v_previous_actor,''),true);
  perform set_config('cms.qa_compensating',coalesce(v_previous_compensating,''),true);
  perform set_config('cms.dam_gc_operation',coalesce(v_previous_operation,''),true);
  perform set_config('cms.dam_gc_claim_id',coalesce(v_previous_claim,''),true);
  raise;
end;
$$;

-- Even if a trusted worker entered with stale settings, a prepare/complete
-- capability can modify only the five claim columns and concurrency metadata.
create or replace function private.cms_guard_dam_asset_gc_fence()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private, pg_temp
as $$
declare
  v_operation text := current_setting('cms.dam_gc_operation', true);
  v_claim_id uuid := nullif(current_setting('cms.dam_gc_claim_id', true), '')::uuid;
  v_mutation_is_claim_only boolean;
begin
  if tg_op = 'INSERT' then
    if new.gc_claim_id is not null
       or exists (
         select 1 from private.cms_dam_gc_fences fence where fence.asset_id = new.id
       ) then
      raise exception 'CMS_DAM_GC_ASSET_FENCED' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.gc_claim_id is null then return old; end if;
    if v_operation = 'complete'
       and v_claim_id is not null
       and old.gc_claim_id = v_claim_id
       and exists (
         select 1
         from private.cms_dam_gc_fences fence
         join public.cms_dam_gc_jobs job on job.id=fence.job_id
         where fence.asset_id=old.id
           and fence.job_id=old.gc_claim_job_id
           and fence.claim_id=v_claim_id
           and fence.claimed_by=old.gc_claimed_by
           and job.status='processing'
           and job.processing_claim_id=v_claim_id
           and job.processing_claimed_by=old.gc_claimed_by
       ) then
      return old;
    end if;
    raise exception 'CMS_DAM_GC_ASSET_FENCED' using errcode = 'P0001';
  end if;

  if old.gc_claim_id is null and new.gc_claim_id is null then return new; end if;
  v_mutation_is_claim_only :=
    (to_jsonb(new) - array[
      'gc_claim_id','gc_claim_job_id','gc_claimed_by','gc_claimed_at',
      'gc_claim_expires_at','lock_version','updated_at'
    ]::text[])
    is not distinct from
    (to_jsonb(old) - array[
      'gc_claim_id','gc_claim_job_id','gc_claimed_by','gc_claimed_at',
      'gc_claim_expires_at','lock_version','updated_at'
    ]::text[]);
  if v_operation = 'prepare'
     and v_mutation_is_claim_only
     and new.lock_version=old.lock_version+1
     and new.updated_at is not distinct from old.updated_at
     and v_claim_id is not null
     and new.gc_claim_id = v_claim_id
     and new.gc_claim_job_id is not null
     and new.gc_claimed_by is not null
     and new.gc_claimed_at is not null
     and new.gc_claim_expires_at > new.gc_claimed_at
     and exists (
       select 1 from private.cms_dam_gc_fences fence
       where fence.asset_id=new.id
         and fence.job_id=new.gc_claim_job_id
         and fence.claim_id=v_claim_id
         and fence.claimed_by=new.gc_claimed_by
         and fence.claim_expires_at=new.gc_claim_expires_at
     )
     and (
       old.gc_claim_id is null
       or old.gc_claim_id = v_claim_id
       or old.gc_claim_expires_at <= clock_timestamp()
     ) then
    return new;
  end if;
  if v_operation = 'complete'
     and v_mutation_is_claim_only
     and new.lock_version=old.lock_version+1
     and new.updated_at is not distinct from old.updated_at
     and v_claim_id is not null
     and old.gc_claim_id = v_claim_id
     and new.gc_claim_id is null
     and new.gc_claim_job_id is null
     and new.gc_claimed_by is null
     and new.gc_claimed_at is null
     and new.gc_claim_expires_at is null
     and exists (
       select 1
       from private.cms_dam_gc_fences fence
       join public.cms_dam_gc_jobs job on job.id=fence.job_id
       where fence.asset_id=old.id
         and fence.job_id=old.gc_claim_job_id
         and fence.claim_id=v_claim_id
         and fence.claimed_by=old.gc_claimed_by
         and job.status='processing'
         and job.processing_claim_id=v_claim_id
         and job.processing_claimed_by=old.gc_claimed_by
     ) then
    return new;
  end if;
  raise exception 'CMS_DAM_GC_ASSET_FENCED' using errcode = 'P0001';
end;
$$;

-- Normalize lead-delivery idempotency before resolving a caller-supplied
-- event UUID. This closes both the error-order regression and the concurrent
-- unique-key race without weakening the target-scope checks in the 0072 core.
revoke all on function public.cms_retry_lead_delivery_scoped_core_0088(
  uuid,uuid,text,text,text,text,text,timestamptz,uuid,uuid,text
) from public,anon,authenticated,service_role;

create or replace function public.cms_retry_lead_delivery_scoped(
  p_actor_id uuid,p_event_id uuid,p_justification text,p_environment text,
  p_site_key text,p_aal text,p_session_id text,p_issued_at timestamptz,
  p_correlation_id uuid,p_idempotency_key uuid,p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,private,pg_temp
as $$
declare
  v_replay public.cms_lead_outbox_replays%rowtype;
  v_previous_actor text := current_setting('cms.qa_mutation_actor_id',true);
  v_response jsonb;
begin
  if p_event_id is null
     or p_correlation_id is null
     or p_idempotency_key is null
     or p_justification is null
     or char_length(btrim(p_justification)) not between 3 and 500
     or p_request_hash is null
     or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'CMS_LEAD_DELIVERY_RETRY_INVALID' using errcode='22023';
  end if;
  perform private.cms_system_assert_available(
    p_actor_id,'cms:leads.retry_delivery',p_environment,p_site_key,
    p_aal,p_session_id,p_issued_at
  );
  perform private.cms_lock_active_qa_actor_leases(array[p_actor_id]);
  perform pg_advisory_xact_lock(hashtextextended(
    'cms:lead-delivery-idempotency:'||p_idempotency_key::text,0
  ));
  select replay.* into v_replay
  from public.cms_lead_outbox_replays replay
  where replay.idempotency_key=p_idempotency_key
  for update;
  if found and (
       v_replay.requested_by<>p_actor_id
       or v_replay.event_id<>p_event_id
       or v_replay.request_hash<>p_request_hash
     ) then
    raise exception 'CMS_LEAD_DELIVERY_IDEMPOTENCY_CONFLICT' using errcode='PT409';
  end if;
  v_response:=public.cms_retry_lead_delivery_scoped_core_0088(
    p_actor_id,p_event_id,p_justification,p_environment,p_site_key,p_aal,p_session_id,
    p_issued_at,p_correlation_id,p_idempotency_key,p_request_hash
  );
  perform set_config('cms.qa_mutation_actor_id',coalesce(v_previous_actor,''),true);
  return v_response;
exception when others then
  perform set_config('cms.qa_mutation_actor_id',coalesce(v_previous_actor,''),true);
  raise;
end;
$$;

-- The general DAM command also binds an actor internally (0066). Preserve that
-- enforcement while preventing the capability from leaking into a composed
-- service transaction and requiring an exact active QA environment.
create or replace function private.cms_assert_dam_actor_context(
  p_actor_id uuid,
  p_permission text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz
)
returns void
language plpgsql
security definer
set search_path=pg_catalog,private,pg_temp
as $$
declare
  v_lease private.cms_qa_actor_leases%rowtype;
begin
  if p_permission not in (
       'cms:media.read','cms:media.upload','cms:media.edit','cms:media.manage'
     )
     or not public.cms_actor_authorized(
       p_actor_id,p_permission,p_aal,p_session_id,p_issued_at
     ) then
    raise exception 'CMS_DAM_FORBIDDEN' using errcode='42501';
  end if;
  select lease.* into v_lease
  from private.cms_qa_actor_leases lease
  where lease.actor_id=p_actor_id
  for share;
  if found and (
       v_lease.status<>'active'
       or v_lease.expires_at<=clock_timestamp()
       or not private.cms_qa_actor_marker_is_exact(
         v_lease.actor_id,v_lease.run_tag,v_lease.candidate_sha,v_lease.environment
       )
     ) then
    raise exception 'CMS_QA_ACTOR_LEASE_EXPIRED' using errcode='42501';
  end if;
end;
$$;

revoke all on function public.cms_execute_dam_command_core_0088(
  uuid,text,text,text,text,timestamptz,text,jsonb,uuid,uuid,text,uuid
) from public,anon,authenticated,service_role;

create or replace function public.cms_execute_dam_command(
  p_actor_id uuid,p_environment text,p_site_key text,p_aal text,p_session_id text,
  p_issued_at timestamptz,p_action text,p_payload jsonb,p_command_id uuid,
  p_idempotency_key uuid,p_request_hash text,p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,private,pg_temp
as $$
declare
  v_permission text;
  v_lease_environment text;
  v_previous_actor text := current_setting('cms.qa_mutation_actor_id',true);
  v_response jsonb;
begin
  if p_action is null
     or p_action not in (
       'update_metadata','upsert_collection','archive_collection','set_organization',
       'save_crop','archive_asset','restore_asset','activate_replacement','rollback_replacement'
     ) or jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'CMS_DAM_COMMAND_INVALID' using errcode='22023';
  end if;
  if p_environment='production' then
    raise exception 'CMS_DAM_PRODUCTION_GATED' using errcode='42501';
  end if;
  if p_environment is null
     or p_environment not in ('local','staging')
     or p_site_key is distinct from 'main' then
    raise exception 'CMS_DAM_SCOPE_MISMATCH' using errcode='42501';
  end if;
  v_permission:=case
    when p_action in (
      'archive_collection','archive_asset','restore_asset',
      'activate_replacement','rollback_replacement'
    ) then 'cms:media.manage'
    else 'cms:media.edit'
  end;
  if not public.cms_actor_authorized(
       p_actor_id,v_permission,p_aal,p_session_id,p_issued_at
     ) then
    raise exception 'CMS_DAM_FORBIDDEN' using errcode='42501';
  end if;
  select lease.environment into v_lease_environment
  from private.cms_qa_actor_leases lease
  where lease.actor_id=p_actor_id
  for share;
  if found then
    perform private.cms_assert_dam_actor_context(
      p_actor_id,v_permission,p_aal,p_session_id,p_issued_at
    );
    if v_lease_environment is distinct from p_environment then
      raise exception 'CMS_DAM_SCOPE_MISMATCH' using errcode='42501';
    end if;
  end if;
  perform set_config('cms.qa_mutation_actor_id', p_actor_id::text, true);
  v_response:=public.cms_execute_dam_command_core_0088(
    p_actor_id,p_environment,p_site_key,p_aal,p_session_id,p_issued_at,p_action,
    p_payload,p_command_id,p_idempotency_key,p_request_hash,p_correlation_id
  );
  perform set_config('cms.qa_mutation_actor_id',coalesce(v_previous_actor,''),true);
  return v_response;
exception when others then
  perform set_config('cms.qa_mutation_actor_id',coalesce(v_previous_actor,''),true);
  raise;
end;
$$;

revoke all on function public.cms_execute_ai_command(
  uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,text
) from public,anon,authenticated;
grant execute on function public.cms_execute_ai_command(
  uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,text
) to service_role;
revoke all on function public.cms_prepare_dam_gc(
  uuid,text,text,text,text,timestamptz,uuid,uuid
) from public,anon,authenticated;
grant execute on function public.cms_prepare_dam_gc(
  uuid,text,text,text,text,timestamptz,uuid,uuid
) to service_role;
revoke all on function public.cms_complete_dam_gc(
  uuid,text,text,text,text,timestamptz,uuid,uuid,boolean
) from public,anon,authenticated;
grant execute on function public.cms_complete_dam_gc(
  uuid,text,text,text,text,timestamptz,uuid,uuid,boolean
) to service_role;
revoke all on function public.cms_retry_lead_delivery_scoped(
  uuid,uuid,text,text,text,text,text,timestamptz,uuid,uuid,text
) from public,anon,authenticated;
grant execute on function public.cms_retry_lead_delivery_scoped(
  uuid,uuid,text,text,text,text,text,timestamptz,uuid,uuid,text
) to service_role;
revoke all on function public.cms_execute_dam_command(
  uuid,text,text,text,text,timestamptz,text,jsonb,uuid,uuid,text,uuid
) from public,anon,authenticated;
grant execute on function public.cms_execute_dam_command(
  uuid,text,text,text,text,timestamptz,text,jsonb,uuid,uuid,text,uuid
) to service_role;
revoke all on function private.cms_guard_dam_asset_gc_fence()
  from public,anon,authenticated,service_role;
revoke all on function private.cms_assert_dam_actor_context(
  uuid,text,text,text,timestamptz
) from public,anon,authenticated,service_role;

-- All SECURITY DEFINER paths above resolve built-ins before application
-- schemas. Authenticated API roles must never be able to create an overload in
-- public, and no historical explicit grant may survive outside the exact RPC
-- allowlist.
revoke create on schema public from public,anon,authenticated,service_role;
alter function public.cms_prepare_dam_gc_core_0088(
  uuid,text,text,text,text,timestamptz,uuid,uuid
) set search_path=pg_catalog,private,pg_temp;
alter function public.cms_complete_dam_gc_core_0088(
  uuid,text,text,text,text,timestamptz,uuid,uuid,boolean
) set search_path=pg_catalog,private,pg_temp;
alter function public.cms_retry_lead_delivery_scoped_core_0088(
  uuid,uuid,text,text,text,text,text,timestamptz,uuid,uuid,text
) set search_path=pg_catalog,private,pg_temp;
alter function public.cms_execute_dam_command_core_0088(
  uuid,text,text,text,text,timestamptz,text,jsonb,uuid,uuid,text,uuid
) set search_path=pg_catalog,private,pg_temp;

do $runtime_followup_acl_scrub$
declare
  v_signature text;
  v_function regprocedure;
  v_grantee text;
begin
  foreach v_signature in array array[
    'public.cms_list_media_usages_scoped(uuid,text,text,text,timestamp with time zone,uuid[])',
    'public.cms_execute_ai_command(uuid,text,jsonb,text,text,text,text,timestamp with time zone,uuid,uuid,text,text)',
    'public.cms_prepare_dam_gc(uuid,text,text,text,text,timestamp with time zone,uuid,uuid)',
    'public.cms_complete_dam_gc(uuid,text,text,text,text,timestamp with time zone,uuid,uuid,boolean)',
    'public.cms_retry_lead_delivery_scoped(uuid,uuid,text,text,text,text,text,timestamp with time zone,uuid,uuid,text)',
    'public.cms_execute_dam_command(uuid,text,text,text,text,timestamp with time zone,text,jsonb,uuid,uuid,text,uuid)'
  ] loop
    v_function:=v_signature::regprocedure;
    for v_grantee in
      select role.rolname
      from pg_catalog.pg_proc proc
      cross join lateral pg_catalog.aclexplode(
        coalesce(proc.proacl,pg_catalog.acldefault('f',proc.proowner))
      ) privilege
      join pg_catalog.pg_roles role on role.oid=privilege.grantee
      where proc.oid=v_function::oid
        and privilege.privilege_type='EXECUTE'
        and privilege.grantee<>proc.proowner
        and role.rolname<>'service_role'
    loop
      execute format(
        'revoke execute on function %s from %I',v_signature,v_grantee
      );
    end loop;
  end loop;
  foreach v_signature in array array[
    'public.cms_prepare_dam_gc_core_0088(uuid,text,text,text,text,timestamp with time zone,uuid,uuid)',
    'public.cms_complete_dam_gc_core_0088(uuid,text,text,text,text,timestamp with time zone,uuid,uuid,boolean)',
    'public.cms_retry_lead_delivery_scoped_core_0088(uuid,uuid,text,text,text,text,text,timestamp with time zone,uuid,uuid,text)',
    'public.cms_execute_dam_command_core_0088(uuid,text,text,text,text,timestamp with time zone,text,jsonb,uuid,uuid,text,uuid)'
  ] loop
    v_function:=v_signature::regprocedure;
    for v_grantee in
      select role.rolname
      from pg_catalog.pg_proc proc
      cross join lateral pg_catalog.aclexplode(
        coalesce(proc.proacl,pg_catalog.acldefault('f',proc.proowner))
      ) privilege
      join pg_catalog.pg_roles role on role.oid=privilege.grantee
      where proc.oid=v_function::oid
        and privilege.privilege_type='EXECUTE'
        and privilege.grantee<>proc.proowner
    loop
      execute format(
        'revoke execute on function %s from %I',v_signature,v_grantee
      );
    end loop;
  end loop;
end;
$runtime_followup_acl_scrub$;

comment on function public.cms_prepare_dam_gc(
  uuid,text,text,text,text,timestamptz,uuid,uuid
) is 'Adquire claim DAM com escopo autoritativo e restaura todas as capacidades locais antes de retornar.';
comment on function public.cms_complete_dam_gc(
  uuid,text,text,text,text,timestamptz,uuid,uuid,boolean
) is 'Finaliza claim DAM por CAS e restaura todas as capacidades locais em sucesso ou erro.';
comment on function public.cms_retry_lead_delivery_scoped(
  uuid,uuid,text,text,text,text,text,timestamptz,uuid,uuid,text
) is 'Repete entrega no escopo autoritativo com idempotencia serializada antes de resolver o UUID alvo.';
comment on function public.cms_execute_dam_command(
  uuid,text,text,text,text,timestamptz,text,jsonb,uuid,uuid,text,uuid
) is 'Executa mutacao DAM com ator/lease vinculados e restaura o contexto local antes de retornar.';

-- Fail the migration atomically if any repair or ACL boundary drifted.
do $runtime_followup_probe$
declare
  v_signature text;
  v_function regprocedure;
  v_expected_oid text;
  v_unexpected_grantee text;
begin
  if has_schema_privilege('anon','public','CREATE')
     or has_schema_privilege('authenticated','public','CREATE')
     or has_schema_privilege('service_role','public','CREATE') then
    raise exception 'CMS_RUNTIME_FOLLOWUP_PUBLIC_SCHEMA_CREATE_INVALID'
      using errcode='55000';
  end if;
  if position(
       'progressive.promoted_item_id = item.id'
       in pg_get_functiondef(
         'public.cms_list_media_usages_scoped(uuid,text,text,text,timestamp with time zone,uuid[])'::regprocedure
       )
     )=0
     or position(
       'progressive.item_id = item.id'
       in pg_get_functiondef(
         'public.cms_list_media_usages_scoped(uuid,text,text,text,timestamp with time zone,uuid[])'::regprocedure
       )
     )>0 then
    raise exception 'CMS_RUNTIME_FOLLOWUP_MEDIA_USAGE_REPAIR_NOT_INSTALLED'
      using errcode='55000';
  end if;
  if position(
       'CMS_AI_MFA_REQUIRED'
       in pg_get_functiondef(
         'public.cms_execute_ai_command(uuid,text,jsonb,text,text,text,text,timestamp with time zone,uuid,uuid,text,text)'::regprocedure
       )
     )=0 then
    raise exception 'CMS_RUNTIME_FOLLOWUP_AI_MFA_REPAIR_NOT_INSTALLED'
      using errcode='55000';
  end if;
  foreach v_signature in array array[
    'public.cms_list_media_usages_scoped(uuid,text,text,text,timestamp with time zone,uuid[])',
    'public.cms_execute_ai_command(uuid,text,jsonb,text,text,text,text,timestamp with time zone,uuid,uuid,text,text)',
    'public.cms_prepare_dam_gc(uuid,text,text,text,text,timestamp with time zone,uuid,uuid)',
    'public.cms_complete_dam_gc(uuid,text,text,text,text,timestamp with time zone,uuid,uuid,boolean)',
    'public.cms_retry_lead_delivery_scoped(uuid,uuid,text,text,text,text,text,timestamp with time zone,uuid,uuid,text)',
    'public.cms_execute_dam_command(uuid,text,text,text,text,timestamp with time zone,text,jsonb,uuid,uuid,text,uuid)'
  ] loop
    v_function:=to_regprocedure(v_signature);
    v_expected_oid:=case v_signature
      when 'public.cms_prepare_dam_gc(uuid,text,text,text,text,timestamp with time zone,uuid,uuid)'
        then current_setting('cms.runtime_followup.public_oid_1',true)
      when 'public.cms_complete_dam_gc(uuid,text,text,text,text,timestamp with time zone,uuid,uuid,boolean)'
        then current_setting('cms.runtime_followup.public_oid_2',true)
      when 'public.cms_retry_lead_delivery_scoped(uuid,uuid,text,text,text,text,text,timestamp with time zone,uuid,uuid,text)'
        then current_setting('cms.runtime_followup.public_oid_3',true)
      when 'public.cms_execute_dam_command(uuid,text,text,text,text,timestamp with time zone,text,jsonb,uuid,uuid,text,uuid)'
        then current_setting('cms.runtime_followup.public_oid_4',true)
      else null
    end;
    select coalesce(role.rolname,'PUBLIC') into v_unexpected_grantee
    from pg_catalog.pg_proc proc
    cross join lateral pg_catalog.aclexplode(
      coalesce(proc.proacl,pg_catalog.acldefault('f',proc.proowner))
    ) privilege
    left join pg_catalog.pg_roles role on role.oid=privilege.grantee
    where proc.oid=v_function::oid
      and privilege.privilege_type='EXECUTE'
      and privilege.grantee<>proc.proowner
      and coalesce(role.rolname,'PUBLIC')<>'service_role'
    limit 1;
    if v_function is null
       or has_function_privilege('anon',v_function,'EXECUTE')
       or has_function_privilege('authenticated',v_function,'EXECUTE')
       or not has_function_privilege('service_role',v_function,'EXECUTE')
       or v_unexpected_grantee is not null
       or (
         v_expected_oid is not null
         and v_function::oid::text is distinct from v_expected_oid
       ) then
      raise exception 'CMS_RUNTIME_FOLLOWUP_RPC_ACL_INVALID:%',v_signature
        using errcode='55000';
    end if;
  end loop;
  foreach v_signature in array array[
    'public.cms_prepare_dam_gc_core_0088(uuid,text,text,text,text,timestamp with time zone,uuid,uuid)',
    'public.cms_complete_dam_gc_core_0088(uuid,text,text,text,text,timestamp with time zone,uuid,uuid,boolean)',
    'public.cms_retry_lead_delivery_scoped_core_0088(uuid,uuid,text,text,text,text,text,timestamp with time zone,uuid,uuid,text)',
    'public.cms_execute_dam_command_core_0088(uuid,text,text,text,text,timestamp with time zone,text,jsonb,uuid,uuid,text,uuid)'
  ] loop
    v_function:=to_regprocedure(v_signature);
    select coalesce(role.rolname,'PUBLIC') into v_unexpected_grantee
    from pg_catalog.pg_proc proc
    cross join lateral pg_catalog.aclexplode(
      coalesce(proc.proacl,pg_catalog.acldefault('f',proc.proowner))
    ) privilege
    left join pg_catalog.pg_roles role on role.oid=privilege.grantee
    where proc.oid=v_function::oid
      and privilege.privilege_type='EXECUTE'
      and privilege.grantee<>proc.proowner
    limit 1;
    if v_function is null
       or has_function_privilege('anon',v_function,'EXECUTE')
       or has_function_privilege('authenticated',v_function,'EXECUTE')
       or has_function_privilege('service_role',v_function,'EXECUTE')
       or v_unexpected_grantee is not null then
      raise exception 'CMS_RUNTIME_FOLLOWUP_CORE_ACL_INVALID:%',v_signature
        using errcode='55000';
    end if;
  end loop;
end;
$runtime_followup_probe$;

commit;
