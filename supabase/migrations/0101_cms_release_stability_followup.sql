begin;

-- Replays that already have an immutable receipt must not reacquire the lead,
-- form and outbox mutation locks. Keep every caller, session, lease and
-- idempotency gate ahead of the fast path, and revalidate the current target
-- scope before returning the stored response.
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

  if found then
    if v_replay.requested_by<>p_actor_id
       or v_replay.event_id<>p_event_id
       or v_replay.request_hash<>p_request_hash then
      raise exception 'CMS_LEAD_DELIVERY_IDEMPOTENCY_CONFLICT' using errcode='PT409';
    end if;
    if not exists (
      select 1
      from public.cms_lead_outbox event
      where event.id=v_replay.event_id
        and event.lead_id=v_replay.lead_id
        and private.cms_lead_scope_allowed(
          p_actor_id,v_replay.lead_id,p_environment
        )
    ) then
      raise exception 'CMS_LEAD_DELIVERY_NOT_FOUND' using errcode='PT404';
    end if;
    return jsonb_build_object(
      'schemaVersion',1,
      'eventId',v_replay.event_id,
      'leadId',v_replay.lead_id,
      'status','pending',
      'replayed',true,
      'duplicate',true,
      'correlationId',v_replay.correlation_id
    );
  end if;

  v_response:=public.cms_retry_lead_delivery_scoped_core_0088(
    p_actor_id,p_event_id,p_justification,p_environment,p_site_key,p_aal,
    p_session_id,p_issued_at,p_correlation_id,p_idempotency_key,p_request_hash
  );
  perform set_config('cms.qa_mutation_actor_id',coalesce(v_previous_actor,''),true);
  return v_response;
exception when others then
  perform set_config('cms.qa_mutation_actor_id',coalesce(v_previous_actor,''),true);
  raise;
end;
$$;

revoke all on function public.cms_retry_lead_delivery_scoped(
  uuid,uuid,text,text,text,text,text,timestamptz,uuid,uuid,text
) from public,anon,authenticated,service_role;
grant execute on function public.cms_retry_lead_delivery_scoped(
  uuid,uuid,text,text,text,text,text,timestamptz,uuid,uuid,text
) to service_role;
revoke all on function public.cms_retry_lead_delivery_scoped_core_0088(
  uuid,uuid,text,text,text,text,text,timestamptz,uuid,uuid,text
) from public,anon,authenticated,service_role;

comment on function public.cms_retry_lead_delivery_scoped(
  uuid,uuid,text,text,text,text,text,timestamptz,uuid,uuid,text
) is 'Repete entrega no escopo autoritativo e retorna receipts exatos sem readquirir locks de mutacao do dominio.';

-- A terminal lease may retain the UUID of a synthetic controlled option only
-- in its own archived product history. This predicate deliberately uses the
-- immutable lease window instead of requiring the lease to still be live.
create or replace function private.cms_qa_archived_product_reference_exact_0101(
  p_actor_id uuid,
  p_run_tag text,
  p_candidate_sha text,
  p_environment text,
  p_item_id uuid,
  p_reference_actor_id uuid,
  p_reference_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,private,auth,pg_temp
as $$
  select exists (
    select 1
    from private.cms_qa_actor_leases lease
    join public.cms_content_items item on item.id=p_item_id
    where lease.actor_id=p_actor_id
      and lease.run_tag=p_run_tag
      and lease.candidate_sha=p_candidate_sha
      and lease.environment=p_environment
      and private.cms_qa_actor_marker_is_exact(
        lease.actor_id,lease.run_tag,lease.candidate_sha,lease.environment
      )
      and item.content_type='product'
      and item.workflow_status='archived'
      and item.archived_at is not null
      and item.created_by=p_actor_id
      and item.created_at between lease.created_at and lease.expires_at
      and p_reference_actor_id=p_actor_id
      and p_reference_at between lease.created_at and lease.expires_at
  );
$$;

revoke all on function private.cms_qa_archived_product_reference_exact_0101(
  uuid,text,text,text,uuid,uuid,timestamptz
) from public,anon,authenticated,service_role;

create or replace function private.cms_cleanup_terminal_product_shared_options_0078()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $$
declare
  v_option_ids uuid[];
  v_removed integer := 0;
  v_claims_sha text;
  v_previous_compensating text;
  v_previous_mutation_actor text;
begin
  if old.status <> 'active'
     or new.status not in ('cleaned', 'expired')
     or new.status = old.status then
    return new;
  end if;

  select coalesce(array_agg(option.id order by option.id), '{}'::uuid[])
  into v_option_ids
  from public.cms_controlled_options option
  join public.cms_controlled_lists list on list.id = option.list_id
  where option.created_by = old.actor_id
    and option.updated_by = old.actor_id
    and list.list_key in (
      'product.category',
      'product.application_magnitude',
      'product.technology',
      'product.installation_operation',
      'product.monitored_element'
    )
    and list.entity_type = 'product'
    and not exists (
      select 1 from private.cms_qa_actor_leases creator_history
      where creator_history.actor_id = list.created_by
    )
    and not exists (
      select 1 from private.cms_qa_actor_leases updater_history
      where updater_history.actor_id = list.updated_by
    );

  if cardinality(v_option_ids) = 0 then return new; end if;

  perform 1
  from public.cms_controlled_options option
  where option.id = any(v_option_ids)
  order by option.id
  for update;

  -- A live projection always blocks removal. Drafts and immutable revisions
  -- may retain the UUID only when their item and reference provenance are
  -- exactly bound to this lease. lower() makes textual UUID detection
  -- canonical even when JSON contains uppercase hexadecimal characters.
  if exists (
       select 1
       from public.cms_published_projection projection
       where exists (
         select 1 from unnest(v_option_ids) option_id
         where strpos(lower(projection.payload::text),option_id::text)>0
       )
     )
     or exists (
       select 1
       from (
         select
           draft.item_id,
           draft.payload,
           draft.updated_by as reference_actor_id,
           draft.updated_at as reference_at
         from public.cms_content_drafts draft
         union all
         select
           revision.item_id,
           revision.payload,
           revision.created_by as reference_actor_id,
           revision.created_at as reference_at
         from public.cms_content_revisions revision
       ) reference
       where exists (
         select 1 from unnest(v_option_ids) option_id
         where strpos(lower(reference.payload::text),option_id::text)>0
       )
         and not private.cms_qa_archived_product_reference_exact_0101(
           old.actor_id,
           old.run_tag,
           old.candidate_sha,
           old.environment,
           reference.item_id,
           reference.reference_actor_id,
           reference.reference_at
         )
     ) then
    raise exception 'CMS_QA_PRODUCT_OPTION_REFERENCE_ACTIVE' using errcode = '40001';
  end if;

  select encode(
    extensions.digest(
      convert_to(
        coalesce(string_agg(option.id::text, ':' order by option.id), ''),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ) into v_claims_sha
  from public.cms_controlled_options option
  where option.id = any(v_option_ids);

  v_previous_compensating := current_setting('cms.qa_compensating', true);
  v_previous_mutation_actor := current_setting('cms.qa_mutation_actor_id', true);
  perform set_config('cms.qa_compensating', 'on', true);
  perform set_config('cms.qa_mutation_actor_id', old.actor_id::text, true);
  begin
    delete from public.cms_controlled_options option
    where option.id = any(v_option_ids)
      and option.created_by = old.actor_id
      and option.updated_by = old.actor_id;
    get diagnostics v_removed = row_count;
  exception when others then
    perform set_config(
      'cms.qa_compensating', coalesce(nullif(v_previous_compensating, ''), 'off'), true
    );
    perform set_config(
      'cms.qa_mutation_actor_id', coalesce(v_previous_mutation_actor, ''), true
    );
    raise;
  end;
  perform set_config(
    'cms.qa_compensating', coalesce(nullif(v_previous_compensating, ''), 'off'), true
  );
  perform set_config(
    'cms.qa_mutation_actor_id', coalesce(v_previous_mutation_actor, ''), true
  );

  if v_removed <> cardinality(v_option_ids)
     or exists (
       select 1 from public.cms_controlled_options option
       where option.id = any(v_option_ids)
     ) then
    raise exception 'CMS_QA_PRODUCT_OPTION_CLEANUP_INCOMPLETE' using errcode = '55000';
  end if;

  insert into public.cms_audit_log (
    actor_id, action, target_type, target_id, event_data, correlation_id
  ) values (
    old.actor_id,
    'cms:qa.product_controlled_options.compensated',
    'qa_fixture',
    old.run_tag,
    jsonb_build_object(
      'schemaVersion', 1,
      'syntheticOnly', true,
      'optionsRemoved', v_removed,
      'claimsSha256', v_claims_sha,
      'environment', old.environment,
      'candidateSha', old.candidate_sha,
      'terminalStatus', new.status
    ),
    gen_random_uuid()
  );
  return new;
end;
$$;

revoke all on function private.cms_cleanup_terminal_product_shared_options_0078()
  from public,anon,authenticated,service_role;

-- The previous cleanup evaluated the full scope predicate for every
-- operational event. Materialize direct actor provenance first and retain the
-- unchanged authoritative predicate as the final delete gate.
create or replace function private.cms_system_rbac_terminal_cleanup()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_previous_cleanup_actor text := current_setting('cms.qa_system_cleanup_actor',true);
begin
  if old.status<>'active' or new.status='active' then return new; end if;
  perform set_config('cms.qa_system_cleanup_actor',old.actor_id::text,true);
  perform pg_advisory_xact_lock(
    hashtextextended('cms:scoped-super:main:'||old.environment,0)
  );

  -- Match the command lock order (receipt before assignment), and touch only
  -- rows controlled by the lease being terminalized. Active peers survive.
  delete from public.cms_scope_command_receipts receipt
  where receipt.actor_id=old.actor_id
     or receipt.target_user_id=old.actor_id
     or exists(
       select 1 from public.cms_scoped_role_assignments assignment
       where assignment.id=receipt.assignment_id
         and (assignment.user_id=old.actor_id or assignment.granted_by=old.actor_id)
     );
  update public.cms_scoped_role_assignments assignment
  set revoked_at=coalesce(assignment.revoked_at,statement_timestamp()),
      revoked_by=case when assignment.revoked_at is null then old.actor_id else assignment.revoked_by end,
      revocation_reason=case when assignment.revoked_at is null then 'qa_run_terminal_cleanup' else assignment.revocation_reason end,
      lock_version=case when assignment.revoked_at is null then assignment.lock_version+1 else assignment.lock_version end,
      updated_at=statement_timestamp()
  where (assignment.user_id=old.actor_id or assignment.granted_by=old.actor_id)
    and assignment.environment=old.environment
    and assignment.revoked_at is null;

  -- System commands lock their receipt before the assurance row as well.
  delete from public.cms_system_command_receipts receipt
  where receipt.actor_id=old.actor_id;

  update public.cms_assurance_runs run
  set status='aborted',reviewed_by=null,review_rationale=null,reviewed_at=null,
      updated_at=statement_timestamp()
  where run.environment=old.environment
    and run.candidate_sha=old.candidate_sha
    and run.requested_by=old.actor_id
    and run.status in ('measured','failed');

  with candidate_correlations(correlation_id) as materialized (
    select audit.correlation_id
    from public.cms_audit_log audit
    where audit.actor_id=old.actor_id
    union
    select decision.correlation_id
    from public.cms_policy_decisions decision
    where decision.actor_id=old.actor_id
    union
    select run.correlation_id
    from public.cms_assurance_runs run
    where run.requested_by=old.actor_id or run.reviewed_by=old.actor_id
    union
    select assurance_event.correlation_id
    from public.cms_assurance_events assurance_event
    where assurance_event.actor_id=old.actor_id
    union
    select replay.correlation_id
    from public.cms_lead_outbox_replays replay
    where replay.requested_by=old.actor_id
    union
    select outbox.correlation_id
    from public.cms_lead_outbox outbox
    join public.cms_leads lead on lead.id=outbox.lead_id
    where lead.qa_actor_id=old.actor_id
    union
    select outbox.correlation_id
    from public.cms_collaboration_outbox outbox
    where outbox.recipient_id=old.actor_id
  ),
  candidate_event_ids(id) as materialized (
    select event.id
    from public.cms_operational_events event
    join public.cms_content_items item on item.id=event.item_id
    where item.created_by=old.actor_id
    union
    select event.id
    from public.cms_operational_events event
    join candidate_correlations candidate
      on candidate.correlation_id=event.correlation_id
  ),
  allowed_event_ids(id) as materialized (
    select candidate.id
    from candidate_event_ids candidate
    where private.cms_system_operational_event_scope_allowed(
      old.actor_id,candidate.id,old.environment
    )
  )
  delete from public.cms_operational_events event
  using allowed_event_ids allowed
  where event.id=allowed.id;
  perform set_config(
    'cms.qa_system_cleanup_actor',coalesce(v_previous_cleanup_actor,''),true
  );
  return new;
exception when others then
  perform set_config(
    'cms.qa_system_cleanup_actor',coalesce(v_previous_cleanup_actor,''),true
  );
  raise;
end;
$$;

revoke all on function private.cms_system_rbac_terminal_cleanup()
  from public,anon,authenticated,service_role;

-- Abort atomically if a security boundary or either terminal trigger drifted.
do $release_stability_probe$
declare
  v_retry regprocedure := to_regprocedure(
    'public.cms_retry_lead_delivery_scoped(uuid,uuid,text,text,text,text,text,timestamp with time zone,uuid,uuid,text)'
  );
  v_retry_core regprocedure := to_regprocedure(
    'public.cms_retry_lead_delivery_scoped_core_0088(uuid,uuid,text,text,text,text,text,timestamp with time zone,uuid,uuid,text)'
  );
  v_reference regprocedure := to_regprocedure(
    'private.cms_qa_archived_product_reference_exact_0101(uuid,text,text,text,uuid,uuid,timestamp with time zone)'
  );
  v_product_cleanup regprocedure := to_regprocedure(
    'private.cms_cleanup_terminal_product_shared_options_0078()'
  );
  v_rbac_cleanup regprocedure := to_regprocedure(
    'private.cms_system_rbac_terminal_cleanup()'
  );
  v_retry_definition text;
  v_reference_definition text;
  v_product_definition text;
  v_rbac_definition text;
begin
  if v_retry is null or v_retry_core is null or v_reference is null
     or v_product_cleanup is null or v_rbac_cleanup is null then
    raise exception 'CMS_RELEASE_STABILITY_FUNCTION_MISSING' using errcode='55000';
  end if;

  select regexp_replace(lower(pg_get_functiondef(v_retry::oid)), '[[:space:]]+', '', 'g')
  into v_retry_definition;
  select regexp_replace(lower(pg_get_functiondef(v_reference::oid)), '[[:space:]]+', '', 'g')
  into v_reference_definition;
  select regexp_replace(lower(pg_get_functiondef(v_product_cleanup::oid)), '[[:space:]]+', '', 'g')
  into v_product_definition;
  select regexp_replace(lower(pg_get_functiondef(v_rbac_cleanup::oid)), '[[:space:]]+', '', 'g')
  into v_rbac_definition;

  if position('cms_system_assert_available' in v_retry_definition)=0
     or position('cms_lock_active_qa_actor_leases' in v_retry_definition)=0
     or position('pg_advisory_xact_lock' in v_retry_definition)=0
     or position('forupdate' in v_retry_definition)=0
     or position('cms_lead_scope_allowed' in v_retry_definition)=0
     or position('''duplicate'',true' in v_retry_definition)=0
     or position('cms_retry_lead_delivery_scoped_core_0088' in v_retry_definition)=0
     or position('cms_system_assert_available' in v_retry_definition)
          > position('''duplicate'',true' in v_retry_definition)
     or position('cms_lead_scope_allowed' in v_retry_definition)
          > position('''duplicate'',true' in v_retry_definition)
     or position('''duplicate'',true' in v_retry_definition)
          > position('cms_retry_lead_delivery_scoped_core_0088' in v_retry_definition) then
    raise exception 'CMS_RELEASE_STABILITY_RETRY_INVALID' using errcode='55000';
  end if;

  if position('cms_qa_actor_marker_is_exact' in v_reference_definition)=0
     or position('item.content_type=''product''' in v_reference_definition)=0
     or position('item.workflow_status=''archived''' in v_reference_definition)=0
     or position('item.created_by=p_actor_id' in v_reference_definition)=0
     or position('item.created_atbetweenlease.created_atandlease.expires_at' in v_reference_definition)=0
     or position('p_reference_actor_id=p_actor_id' in v_reference_definition)=0
     or position('p_reference_atbetweenlease.created_atandlease.expires_at' in v_reference_definition)=0
     or position('lease.status=''active''' in v_reference_definition)>0
     or position('lease.expires_at>' in v_reference_definition)>0 then
    raise exception 'CMS_RELEASE_STABILITY_REFERENCE_SCOPE_INVALID' using errcode='55000';
  end if;

  if position('strpos(lower(projection.payload::text),option_id::text)>0' in v_product_definition)=0
     or position('strpos(lower(reference.payload::text),option_id::text)>0' in v_product_definition)=0
     or position('cms_qa_archived_product_reference_exact_0101' in v_product_definition)=0
     or position('cms_qa_product_option_reference_active' in v_product_definition)=0 then
    raise exception 'CMS_RELEASE_STABILITY_PRODUCT_CLEANUP_INVALID' using errcode='55000';
  end if;

  if position('candidate_correlations' in v_rbac_definition)=0
     or position('asmaterialized' in v_rbac_definition)=0
     or position('candidate_event_ids' in v_rbac_definition)=0
     or position('allowed_event_ids' in v_rbac_definition)=0
     or position('cms_system_operational_event_scope_allowed' in v_rbac_definition)=0
     or position('usingallowed_event_ids' in v_rbac_definition)=0
     or position('v_previous_cleanup_actor' in v_rbac_definition)=0
     or position('exceptionwhenothersthen' in v_rbac_definition)=0
     or position('coalesce(v_previous_cleanup_actor,'''')' in v_rbac_definition)=0 then
    raise exception 'CMS_RELEASE_STABILITY_RBAC_CLEANUP_INVALID' using errcode='55000';
  end if;

  if not has_function_privilege('service_role',v_retry,'EXECUTE')
     or has_function_privilege('anon',v_retry,'EXECUTE')
     or has_function_privilege('authenticated',v_retry,'EXECUTE')
     or has_function_privilege('service_role',v_retry_core,'EXECUTE')
     or has_function_privilege('anon',v_reference,'EXECUTE')
     or has_function_privilege('authenticated',v_reference,'EXECUTE')
     or has_function_privilege('service_role',v_reference,'EXECUTE')
     or has_function_privilege('anon',v_product_cleanup,'EXECUTE')
     or has_function_privilege('authenticated',v_product_cleanup,'EXECUTE')
     or has_function_privilege('service_role',v_product_cleanup,'EXECUTE')
     or has_function_privilege('anon',v_rbac_cleanup,'EXECUTE')
     or has_function_privilege('authenticated',v_rbac_cleanup,'EXECUTE')
     or has_function_privilege('service_role',v_rbac_cleanup,'EXECUTE') then
    raise exception 'CMS_RELEASE_STABILITY_ACL_INVALID' using errcode='55000';
  end if;

  if not exists (
       select 1
       from pg_catalog.pg_trigger trigger
       where trigger.tgrelid='private.cms_qa_actor_leases'::regclass
         and trigger.tgname='cms_prepare_qa_actor_terminal_product_shared_vocab_cleanup'
         and trigger.tgfoid=v_product_cleanup::oid
         and trigger.tgenabled='O'
         and not trigger.tgisinternal
     )
     or not exists (
       select 1
       from pg_catalog.pg_trigger trigger
       where trigger.tgrelid='private.cms_qa_actor_leases'::regclass
         and trigger.tgname='zzzz_cms_system_rbac_terminal_cleanup'
         and trigger.tgfoid=v_rbac_cleanup::oid
         and trigger.tgenabled='O'
         and not trigger.tgisinternal
     ) then
    raise exception 'CMS_RELEASE_STABILITY_TRIGGER_INVALID' using errcode='55000';
  end if;
end;
$release_stability_probe$;

commit;
