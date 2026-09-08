-- Final QA/corporate boundary for scoped RBAC, policy decisions, system
-- assurance and operational diagnostics. Historical entry points are retained
-- under private service-only names so rollback remains possible, while every
-- deployed name below derives its scope from the authoritative QA lease.

create or replace function private.cms_system_actor_ever_qa(p_actor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, pg_temp
as $$
  select p_actor_id is not null and exists (
    select 1 from private.cms_qa_actor_leases lease where lease.actor_id = p_actor_id
  );
$$;

create or replace function private.cms_system_actor_reference_allowed(
  p_actor_id uuid,
  p_referenced_actor_id uuid,
  p_environment text,
  p_allow_null boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, pg_temp
as $$
  select case
    when p_referenced_actor_id is null then p_allow_null
    else private.cms_user_actor_target_scope_allowed(
      p_actor_id, p_referenced_actor_id, p_environment
    )
  end;
$$;

create or replace function private.cms_system_cleanup_actor_controls(
  p_cleanup_actor_id uuid,
  p_target_actor_id uuid,
  p_environment text,
  p_candidate_sha text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, pg_temp
as $$
  select exists (
    select 1
    from private.cms_qa_actor_leases controller
    join private.cms_qa_actor_leases target
      on target.run_tag=controller.run_tag
     and target.candidate_sha=controller.candidate_sha
     and target.environment=controller.environment
    where controller.actor_id=p_cleanup_actor_id
      and target.actor_id=p_target_actor_id
      and controller.environment=p_environment
      and controller.candidate_sha=p_candidate_sha
  );
$$;

create or replace function private.cms_system_lock_actor_scope(
  p_actor_id uuid,
  p_environment text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, private, pg_temp
as $$
declare
  v_actor_ids uuid[];
begin
  if not private.cms_system_actor_ever_qa(p_actor_id) then return; end if;
  select coalesce(array_agg(peer.actor_id order by peer.actor_id),'{}'::uuid[])
  into v_actor_ids
  from private.cms_qa_actor_leases caller
  join private.cms_qa_actor_leases peer
    on peer.run_tag=caller.run_tag
   and peer.candidate_sha=caller.candidate_sha
   and peer.environment=caller.environment
  where caller.actor_id=p_actor_id
    and caller.environment=p_environment
    and caller.status='active'
    and peer.status='active'
    and caller.expires_at>statement_timestamp()
    and peer.expires_at>statement_timestamp()
    and private.cms_qa_actor_marker_is_exact(
      caller.actor_id,caller.run_tag,caller.candidate_sha,caller.environment
    )
    and private.cms_qa_actor_marker_is_exact(
      peer.actor_id,peer.run_tag,peer.candidate_sha,peer.environment
    );
  perform private.cms_lock_active_qa_actor_leases(v_actor_ids);
  if not private.cms_user_actor_context_active(p_actor_id,p_environment) then
    raise exception 'CMS_QA_ACTOR_LEASE_EXPIRED' using errcode='42501';
  end if;
end;
$$;

create or replace function private.cms_system_assignment_scope_allowed(
  p_actor_id uuid,
  p_assignment_id uuid,
  p_environment text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select exists (
    select 1
    from public.cms_scoped_role_assignments assignment
    where assignment.id = p_assignment_id
      and assignment.site_key = 'main'
      and assignment.environment = p_environment
      and private.cms_user_actor_context_active(p_actor_id, p_environment)
      and private.cms_system_actor_reference_allowed(
        p_actor_id, assignment.user_id, p_environment, false
      )
      and (
        (assignment.granted_by is null and not private.cms_system_actor_ever_qa(p_actor_id))
        or private.cms_system_actor_reference_allowed(
          p_actor_id, assignment.granted_by, p_environment, false
        )
      )
      and (
        assignment.revoked_by is null
        or private.cms_system_actor_reference_allowed(
          p_actor_id, assignment.revoked_by, p_environment, false
        )
      )
  );
$$;

create or replace function private.cms_system_permission_lineage_allowed(
  p_actor_id uuid,
  p_permission text,
  p_environment text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select private.cms_user_actor_context_active(p_actor_id, p_environment)
    and (
      exists (
        select 1
        from public.cms_scoped_role_assignments assignment
        join public.cms_role_permissions permission
          on permission.role_key = assignment.role_key
        where assignment.user_id = p_actor_id
          and permission.permission_key = p_permission
          and assignment.site_key = 'main'
          and assignment.environment = p_environment
          and assignment.revoked_at is null
          and assignment.valid_from <= statement_timestamp()
          and (assignment.expires_at is null or assignment.expires_at > statement_timestamp())
          and private.cms_system_assignment_scope_allowed(
            p_actor_id, assignment.id, p_environment
          )
      )
      or exists (
        select 1
        from public.cms_user_roles user_role
        join public.cms_role_permissions permission
          on permission.role_key = user_role.role_key
        where user_role.user_id = p_actor_id
          and permission.permission_key = p_permission
          and private.cms_system_actor_reference_allowed(
            p_actor_id, user_role.user_id, p_environment, false
          )
          and (
            private.cms_system_actor_reference_allowed(
              p_actor_id,user_role.granted_by,p_environment,false
            )
            or (
              user_role.granted_by is null
              and (
                not private.cms_system_actor_ever_qa(p_actor_id)
                or exists(
                  select 1 from private.cms_qa_actor_leases lease
                  where lease.actor_id=p_actor_id
                    and lease.environment=p_environment
                    and lease.status='active'
                    and lease.expires_at>statement_timestamp()
                    and user_role.granted_at between lease.created_at and lease.expires_at
                    and private.cms_qa_actor_marker_is_exact(
                      lease.actor_id,lease.run_tag,lease.candidate_sha,lease.environment
                    )
                )
              )
            )
          )
      )
    );
$$;

create or replace function private.cms_system_policy_decision_scope_allowed(
  p_actor_id uuid,
  p_decision_actor_id uuid,
  p_environment text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, pg_temp
as $$
  -- Corporate policy auditors retain the immutable QA trail. QA can only see
  -- identities from its own currently-active run.
  select private.cms_user_actor_context_active(p_actor_id, p_environment)
    and case
      when private.cms_system_actor_ever_qa(p_actor_id) then
        private.cms_system_actor_reference_allowed(
          p_actor_id, p_decision_actor_id, p_environment, false
        )
      else true
    end;
$$;

create or replace function private.cms_system_assurance_run_scope_allowed(
  p_actor_id uuid,
  p_run_id uuid,
  p_environment text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select exists (
    select 1
    from public.cms_assurance_runs run
    where run.id = p_run_id
      and run.site_key = 'main'
      and run.environment = p_environment
      and private.cms_user_actor_context_active(p_actor_id, p_environment)
      and private.cms_system_actor_reference_allowed(
        p_actor_id, run.requested_by, p_environment, false
      )
      and (
        run.reviewed_by is null
        or private.cms_system_actor_reference_allowed(
          p_actor_id, run.reviewed_by, p_environment, false
        )
      )
      and (
        not private.cms_system_actor_ever_qa(p_actor_id)
        or exists (
          select 1
          from private.cms_qa_actor_leases caller
          join private.cms_qa_actor_leases owner
            on owner.actor_id = run.requested_by
           and owner.run_tag = caller.run_tag
           and owner.candidate_sha = caller.candidate_sha
           and owner.environment = caller.environment
          where caller.actor_id = p_actor_id
            and caller.environment = p_environment
            and caller.status = 'active'
            and owner.status = 'active'
            and caller.expires_at > statement_timestamp()
            and owner.expires_at > statement_timestamp()
            and run.candidate_sha = caller.candidate_sha
            and run.created_at between owner.created_at and owner.expires_at
            and private.cms_qa_actor_marker_is_exact(
              caller.actor_id, caller.run_tag, caller.candidate_sha, caller.environment
            )
            and private.cms_qa_actor_marker_is_exact(
              owner.actor_id, owner.run_tag, owner.candidate_sha, owner.environment
            )
        )
      )
  );
$$;

create or replace function private.cms_system_scope_receipt_scope_allowed(
  p_actor_id uuid,
  p_receipt_actor_id uuid,
  p_target_user_id uuid,
  p_assignment_id uuid,
  p_environment text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, pg_temp
as $$
  select private.cms_user_actor_context_active(p_actor_id, p_environment)
    and private.cms_system_actor_reference_allowed(
      p_actor_id, p_receipt_actor_id, p_environment, false
    )
    and (
      (p_target_user_id is null and not private.cms_system_actor_ever_qa(p_actor_id))
      or private.cms_system_actor_reference_allowed(
        p_actor_id, p_target_user_id, p_environment, false
      )
    )
    and (
      p_assignment_id is null
      or private.cms_system_assignment_scope_allowed(
        p_actor_id, p_assignment_id, p_environment
      )
    );
$$;

create or replace function private.cms_system_command_receipt_scope_allowed(
  p_actor_id uuid,
  p_receipt_actor_id uuid,
  p_response jsonb,
  p_environment text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, private, pg_temp
as $$
declare
  v_run_id uuid;
begin
  if not private.cms_user_actor_context_active(p_actor_id, p_environment)
     or not private.cms_system_actor_reference_allowed(
       p_actor_id, p_receipt_actor_id, p_environment, false
     ) then
    return false;
  end if;
  if p_response is null then return true; end if;
  if coalesce(p_response ->> 'runId', '')
     !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  v_run_id := (p_response ->> 'runId')::uuid;
  return private.cms_system_assurance_run_scope_allowed(
    p_actor_id, v_run_id, p_environment
  );
exception when others then
  return false;
end;
$$;

create or replace function private.cms_system_policy_target_scope_allowed(
  p_actor_id uuid,
  p_target_type text,
  p_target_id text,
  p_environment text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_id uuid;
begin
  if not private.cms_user_actor_context_active(p_actor_id, p_environment) then
    return false;
  end if;
  -- Corporate auditors retain the complete immutable record. Deployed policy
  -- writes are sanitized separately below; legacy unsafe targets are redacted
  -- by the RPC projection rather than deleting or hiding the audit row.
  if not private.cms_system_actor_ever_qa(p_actor_id) then return true; end if;
  if p_target_type is null and p_target_id is null then return true; end if;
  if p_target_type is null or p_target_id is null
     or p_target_id !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$' then
    return false;
  end if;
  if p_target_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  v_id := p_target_id::uuid;
  return case p_target_type
    when 'profile' then private.cms_user_actor_target_scope_allowed(
      p_actor_id, v_id, p_environment
    )
    when 'scoped_role_assignment' then private.cms_system_assignment_scope_allowed(
      p_actor_id, v_id, p_environment
    )
    when 'assurance_run' then private.cms_system_assurance_run_scope_allowed(
      p_actor_id, v_id, p_environment
    )
    when 'content_item' then private.cms_content_item_graph_scope_allowed(
      p_actor_id, v_id, p_environment
    )
    when 'work_task' then private.cms_crb_task_scope_allowed(
      p_actor_id, v_id, p_environment
    )
    when 'lead' then private.cms_lead_scope_allowed(
      p_actor_id, v_id, p_environment
    )
    else false
  end;
exception when others then
  return false;
end;
$$;

create or replace function private.cms_system_operational_event_scope_allowed(
  p_actor_id uuid,
  p_event_id uuid,
  p_environment text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_event public.cms_operational_events%rowtype;
  v_actor_ids uuid[] := '{}'::uuid[];
  v_id uuid;
  v_actor_is_qa boolean;
begin
  if not private.cms_user_actor_context_active(p_actor_id, p_environment) then return false; end if;
  select * into v_event from public.cms_operational_events event where event.id = p_event_id;
  if not found then return false; end if;
  if v_event.item_id is not null then
    return private.cms_content_item_graph_scope_allowed(
      p_actor_id, v_event.item_id, p_environment
    );
  end if;

  v_actor_is_qa:=private.cms_system_actor_ever_qa(p_actor_id);
  if v_actor_is_qa and (
    exists (
      select 1 from public.cms_audit_log audit
      where audit.correlation_id=v_event.correlation_id
        and (
          audit.actor_id is null
          or not private.cms_system_actor_reference_allowed(
            p_actor_id,audit.actor_id,p_environment,false
          )
        )
    )
    or exists (
      select 1 from public.cms_policy_decisions decision
      where decision.correlation_id=v_event.correlation_id
        and (
          decision.actor_id is null
          or not private.cms_system_actor_reference_allowed(
            p_actor_id,decision.actor_id,p_environment,false
          )
          or not private.cms_system_policy_target_scope_allowed(
            p_actor_id,decision.target_type,decision.target_id,p_environment
          )
        )
    )
    or exists (
      select 1
      from public.cms_lead_outbox outbox
      where outbox.correlation_id=v_event.correlation_id
        and not private.cms_lead_scope_allowed(
          p_actor_id,outbox.lead_id,p_environment
        )
    )
    or exists (
      select 1
      from public.cms_collaboration_outbox outbox
      where outbox.correlation_id=v_event.correlation_id
        and not private.cms_crb_task_scope_allowed(
          p_actor_id,outbox.task_id,p_environment
        )
    )
    or exists (
      select 1
      from public.cms_publication_outbox outbox
      where outbox.correlation_id=v_event.correlation_id
        and not private.cms_content_item_graph_scope_allowed(
          p_actor_id,outbox.item_id,p_environment
        )
    )
    or exists (
      select 1
      from public.cms_assurance_runs run
      where run.correlation_id=v_event.correlation_id
        and not private.cms_system_assurance_run_scope_allowed(
          p_actor_id,run.id,p_environment
        )
    )
  ) then return false; end if;

  select coalesce(array_agg(distinct actor_id), '{}'::uuid[]) into v_actor_ids
  from (
    select audit.actor_id
    from public.cms_audit_log audit
    where audit.correlation_id = v_event.correlation_id
    union all
    select decision.actor_id
    from public.cms_policy_decisions decision
    where decision.correlation_id = v_event.correlation_id
    union all
    select run.requested_by
    from public.cms_assurance_runs run
    where run.correlation_id = v_event.correlation_id
    union all
    select run.reviewed_by
    from public.cms_assurance_runs run
    where run.correlation_id = v_event.correlation_id
    union all
    select assurance_event.actor_id
    from public.cms_assurance_events assurance_event
    where assurance_event.correlation_id = v_event.correlation_id
    union all
    select replay.requested_by
    from public.cms_lead_outbox_replays replay
    where replay.correlation_id = v_event.correlation_id
    union all
    select lead.qa_actor_id
    from public.cms_lead_outbox outbox
    join public.cms_leads lead on lead.id = outbox.lead_id
    where outbox.correlation_id = v_event.correlation_id
    union all
    select recipient_id
    from public.cms_collaboration_outbox outbox
    where outbox.correlation_id = v_event.correlation_id
  ) provenance
  where actor_id is not null;

  if cardinality(v_actor_ids) = 0 then
    -- Unattributed platform health events are corporate-only. This avoids both
    -- a QA aggregate side channel and accidental hiding of real incidents.
    return not v_actor_is_qa;
  end if;
  foreach v_id in array v_actor_ids loop
    if not private.cms_system_actor_reference_allowed(
      p_actor_id, v_id, p_environment, false
    ) then return false; end if;
  end loop;
  return true;
end;
$$;

create or replace function public.cms_system_assignment_session_read_allowed(
  p_assignment_id uuid,
  p_environment text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, pg_temp
as $$
  select private.cms_system_assignment_scope_allowed(
    auth.uid(), p_assignment_id, p_environment
  );
$$;

create or replace function public.cms_system_policy_session_read_allowed(
  p_actor_id uuid,
  p_target_type text,
  p_target_id text,
  p_environment text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, pg_temp
as $$
  select private.cms_system_policy_decision_scope_allowed(
      auth.uid(),p_actor_id,p_environment
    )
    and private.cms_system_policy_target_scope_allowed(
      auth.uid(),p_target_type,p_target_id,p_environment
    );
$$;

create or replace function public.cms_system_assurance_session_read_allowed(
  p_run_id uuid,
  p_environment text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, pg_temp
as $$
  select private.cms_system_assurance_run_scope_allowed(
    auth.uid(), p_run_id, p_environment
  );
$$;

create or replace function public.cms_system_operational_session_read_allowed(
  p_event_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, pg_temp
as $$
  select private.cms_system_permission_lineage_allowed(
      auth.uid(),'cms:diagnostics.read',private.cms_user_actor_environment(auth.uid())
    )
    and public.cms_has_permission('cms:diagnostics.read')
    and private.cms_system_operational_event_scope_allowed(
      auth.uid(),p_event_id,private.cms_user_actor_environment(auth.uid())
    );
$$;

create or replace function public.cms_system_scope_receipt_session_read_allowed(
  p_receipt_actor_id uuid,
  p_target_user_id uuid,
  p_assignment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select exists (
    select 1
    from public.cms_scoped_role_assignments assignment
    where assignment.id=p_assignment_id
      and private.cms_system_scope_receipt_scope_allowed(
        auth.uid(),p_receipt_actor_id,p_target_user_id,p_assignment_id,
        assignment.environment
      )
      and private.cms_system_permission_lineage_allowed(
        auth.uid(),'cms:scopes.read',assignment.environment
      )
      and public.cms_has_permission('cms:scopes.read')
  );
$$;

create or replace function public.cms_system_command_receipt_session_read_allowed(
  p_receipt_actor_id uuid,
  p_response jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_run_id uuid;
  v_environment text;
begin
  if coalesce(p_response->>'runId','')
     !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  v_run_id:=(p_response->>'runId')::uuid;
  select run.environment into v_environment
  from public.cms_assurance_runs run where run.id=v_run_id;
  if not found then return false; end if;
  return private.cms_system_command_receipt_scope_allowed(
      auth.uid(),p_receipt_actor_id,p_response,v_environment
    )
    and private.cms_system_permission_lineage_allowed(
      auth.uid(),'cms:diagnostics.read',v_environment
    )
    and public.cms_has_permission('cms:diagnostics.read');
exception when others then
  return false;
end;
$$;

create or replace function public.cms_system_session_permission_allowed(
  p_permission text,
  p_environment text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select public.cms_has_permission(p_permission)
    and private.cms_system_permission_lineage_allowed(
      auth.uid(),p_permission,p_environment
    );
$$;

-- Preserve the historical implementations as rollback-only code. No API role
-- can execute them after this migration.
alter function public.cms_rbac_scope_capability(
  uuid,text,text,text,text,timestamptz
) rename to cms_rbac_scope_capability_unscoped_0076;
alter function public.cms_resolve_scoped_access(
  uuid,text,text,text,text,timestamptz
) rename to cms_resolve_scoped_access_unscoped_0076;
alter function public.cms_evaluate_scoped_permission(
  uuid,text,text,text,text,text,timestamptz,text,text,uuid
) rename to cms_evaluate_scoped_permission_unscoped_0076;
alter function public.cms_get_scoped_assignments(
  uuid,text,text,text,text,timestamptz,uuid
) rename to cms_get_scoped_assignments_unscoped_0076;
alter function public.cms_get_policy_decisions(
  uuid,text,text,text,text,timestamptz,integer
) rename to cms_get_policy_decisions_unscoped_0076;
alter function public.cms_execute_scope_command(
  uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,uuid
) rename to cms_execute_scope_command_unscoped_0076;

revoke all on function public.cms_rbac_scope_capability_unscoped_0076(
  uuid,text,text,text,text,timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.cms_resolve_scoped_access_unscoped_0076(
  uuid,text,text,text,text,timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.cms_evaluate_scoped_permission_unscoped_0076(
  uuid,text,text,text,text,text,timestamptz,text,text,uuid
) from public, anon, authenticated, service_role;
revoke all on function public.cms_get_scoped_assignments_unscoped_0076(
  uuid,text,text,text,text,timestamptz,uuid
) from public, anon, authenticated, service_role;
revoke all on function public.cms_get_policy_decisions_unscoped_0076(
  uuid,text,text,text,text,timestamptz,integer
) from public, anon, authenticated, service_role;
revoke all on function public.cms_execute_scope_command_unscoped_0076(
  uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,uuid
) from public, anon, authenticated, service_role;

create function public.cms_rbac_scope_capability(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
begin
  if p_site_key is distinct from 'main'
     or not private.cms_user_actor_context_active(p_actor_id,p_environment) then
    return jsonb_build_object(
      'schemaVersion',1,'key','ev2.rbac_scoped','enabled',false,
      'source','unavailable','reasonCode','session_or_scope_invalid',
      'evaluatedAt',statement_timestamp()
    );
  end if;
  perform private.cms_system_lock_actor_scope(p_actor_id,p_environment);
  return public.cms_rbac_scope_capability_unscoped_0076(
    p_actor_id,p_environment,p_site_key,p_aal,p_session_id,p_issued_at
  );
end;
$$;

create function public.cms_resolve_scoped_access(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_capability jsonb;
  v_roles text[];
  v_permissions text[];
  v_requires_mfa boolean := false;
  v_effective_until timestamptz;
begin
  perform private.cms_system_lock_actor_scope(p_actor_id,p_environment);
  v_capability:=public.cms_rbac_scope_capability(
    p_actor_id,p_environment,p_site_key,p_aal,p_session_id,p_issued_at
  );
  if coalesce((v_capability->>'enabled')::boolean,false) is not true then
    raise exception 'CMS_RBAC_SCOPED_DISABLED' using errcode='42501';
  end if;

  select
    coalesce(array_agg(assignment.role_key order by assignment.role_key),'{}'::text[]),
    min(assignment.expires_at) filter(where assignment.expires_at is not null)
  into v_roles,v_effective_until
  from public.cms_scoped_role_assignments assignment
  where assignment.user_id=p_actor_id
    and assignment.site_key=p_site_key
    and assignment.environment=p_environment
    and assignment.revoked_at is null
    and assignment.valid_from<=statement_timestamp()
    and (assignment.expires_at is null or assignment.expires_at>statement_timestamp())
    and private.cms_system_assignment_scope_allowed(
      p_actor_id,assignment.id,p_environment
    );

  select coalesce(array_agg(distinct permission.permission_key order by permission.permission_key),'{}'::text[])
  into v_permissions
  from public.cms_scoped_role_assignments assignment
  join public.cms_role_permissions permission on permission.role_key=assignment.role_key
  where assignment.user_id=p_actor_id
    and assignment.site_key=p_site_key
    and assignment.environment=p_environment
    and assignment.revoked_at is null
    and assignment.valid_from<=statement_timestamp()
    and (assignment.expires_at is null or assignment.expires_at>statement_timestamp())
    and private.cms_system_assignment_scope_allowed(
      p_actor_id,assignment.id,p_environment
    );

  select exists(
    select 1
    from public.cms_scoped_role_assignments assignment
    join public.cms_roles role on role.role_key=assignment.role_key
    where assignment.user_id=p_actor_id
      and assignment.site_key=p_site_key
      and assignment.environment=p_environment
      and assignment.revoked_at is null
      and assignment.valid_from<=statement_timestamp()
      and (assignment.expires_at is null or assignment.expires_at>statement_timestamp())
      and role.mfa_required
      and private.cms_system_assignment_scope_allowed(
        p_actor_id,assignment.id,p_environment
      )
  ) into v_requires_mfa;

  return jsonb_build_object(
    'rbacScoped',true,'roles',to_jsonb(v_roles),'permissions',to_jsonb(v_permissions),
    'mfaRequired',v_requires_mfa,'mfaVerified',p_aal='aal2',
    'accessGranted',cardinality(v_roles)>0 and (not v_requires_mfa or p_aal='aal2'),
    'scope',jsonb_build_object(
      'siteKey',p_site_key,'environment',p_environment,'effectiveUntil',v_effective_until
    )
  );
end;
$$;

create function public.cms_evaluate_scoped_permission(
  p_actor_id uuid,
  p_permission text,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_target_type text,
  p_target_id text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
begin
  if p_site_key is distinct from 'main'
     or not private.cms_user_actor_context_active(p_actor_id, p_environment) then
    raise exception 'CMS_POLICY_FORBIDDEN' using errcode = '42501';
  end if;
  if (p_target_type is null)<>(p_target_id is null)
     or (
       p_target_id is not null
       and p_target_id !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$'
     ) then
    raise exception 'CMS_POLICY_INPUT_INVALID' using errcode='22023';
  end if;
  perform private.cms_system_lock_actor_scope(p_actor_id,p_environment);
  if not private.cms_system_policy_target_scope_allowed(
       p_actor_id, p_target_type, p_target_id, p_environment
     ) then
    raise exception 'CMS_POLICY_TARGET_FORBIDDEN' using errcode = '42501';
  end if;
  return public.cms_evaluate_scoped_permission_unscoped_0076(
    p_actor_id, p_permission, p_environment, p_site_key, p_aal, p_session_id,
    p_issued_at, p_target_type, p_target_id, p_correlation_id
  );
end;
$$;

create function public.cms_get_scoped_assignments(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_target_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_authorization jsonb;
  v_items jsonb;
  v_roles jsonb;
begin
  if p_site_key is distinct from 'main'
     or not private.cms_user_actor_context_active(p_actor_id, p_environment)
     or not private.cms_system_permission_lineage_allowed(
       p_actor_id, 'cms:scopes.read', p_environment
     ) then
    raise exception 'CMS_SCOPE_FORBIDDEN' using errcode = '42501';
  end if;
  perform private.cms_system_lock_actor_scope(p_actor_id,p_environment);
  if p_target_user_id is not null and not private.cms_user_actor_target_scope_allowed(
       p_actor_id, p_target_user_id, p_environment
     ) then
    raise exception 'CMS_SCOPE_TARGET_FORBIDDEN' using errcode = '42501';
  end if;
  v_authorization := private.cms_actor_authorization_result(
    p_actor_id, 'cms:scopes.read', p_aal, p_session_id, p_issued_at
  );
  if coalesce((v_authorization ->> 'allowed')::boolean, false) is not true
     or (
       v_authorization ->> 'scopeSource' <> 'legacy'
       and (
         v_authorization ->> 'environment' is distinct from p_environment
         or v_authorization ->> 'siteKey' is distinct from p_site_key
       )
     ) then
    raise exception 'CMS_SCOPE_FORBIDDEN' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', assignment.id,
    'userId', assignment.user_id,
    'displayName', profile.display_name,
    'roleKey', assignment.role_key,
    'siteKey', assignment.site_key,
    'environment', assignment.environment,
    'grantType', assignment.grant_type,
    'reason', assignment.reason,
    'validFrom', assignment.valid_from,
    'expiresAt', assignment.expires_at,
    'revokedAt', assignment.revoked_at,
    'revocationReason', assignment.revocation_reason,
    'lockVersion', assignment.lock_version,
    'effective', profile.status = 'active'
      and assignment.revoked_at is null
      and assignment.valid_from <= statement_timestamp()
      and (assignment.expires_at is null or assignment.expires_at > statement_timestamp()),
    'updatedAt', assignment.updated_at
  ) order by profile.display_name, assignment.role_key), '[]'::jsonb)
  into v_items
  from public.cms_scoped_role_assignments assignment
  join public.cms_profiles profile on profile.user_id = assignment.user_id
  where assignment.site_key = p_site_key
    and assignment.environment = p_environment
    and (p_target_user_id is null or assignment.user_id = p_target_user_id)
    and private.cms_system_assignment_scope_allowed(
      p_actor_id, assignment.id, p_environment
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'roleKey', role.role_key,
    'name', role.name,
    'description', role.description,
    'mfaRequired', role.mfa_required,
    'permissions', coalesce((
      select jsonb_agg(permission.permission_key order by permission.permission_key)
      from public.cms_role_permissions permission
      where permission.role_key = role.role_key
    ), '[]'::jsonb)
  ) order by role.name), '[]'::jsonb)
  into v_roles
  from public.cms_roles role;

  return jsonb_build_object(
    'schemaVersion', 1, 'items', v_items, 'roles', v_roles,
    'environment', p_environment, 'siteKey', p_site_key
  );
end;
$$;

create function public.cms_get_policy_decisions(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_authorization jsonb;
  v_items jsonb;
begin
  if p_limit not between 1 and 100
     or p_site_key is distinct from 'main'
     or not private.cms_user_actor_context_active(p_actor_id, p_environment)
     or not private.cms_system_permission_lineage_allowed(
       p_actor_id, 'cms:policy_decisions.read', p_environment
     ) then
    raise exception 'CMS_POLICY_FORBIDDEN' using errcode = '42501';
  end if;
  perform private.cms_system_lock_actor_scope(p_actor_id,p_environment);
  v_authorization := private.cms_actor_authorization_result(
    p_actor_id, 'cms:policy_decisions.read', p_aal, p_session_id, p_issued_at
  );
  if coalesce((v_authorization ->> 'allowed')::boolean, false) is not true then
    raise exception 'CMS_POLICY_FORBIDDEN' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(entry.value order by entry.occurred_at desc), '[]'::jsonb)
  into v_items
  from (
    select decision.occurred_at, jsonb_build_object(
      'id', decision.id,
      'actorId', decision.actor_id,
      'permissionKey', decision.permission_key,
      'decision', decision.decision,
      'reasonCode', decision.reason_code,
      'roleKey', decision.matched_role_key,
      'scopeSource', decision.scope_source,
      'aal', decision.aal,
      'targetType', decision.target_type,
      'targetId', case
        when decision.target_id is null
          or decision.target_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$'
          then decision.target_id
        else '[redacted]'
      end,
      'correlationId', decision.correlation_id,
      'occurredAt', decision.occurred_at
    ) as value
    from public.cms_policy_decisions decision
    where decision.site_key = p_site_key
      and decision.environment = p_environment
      and private.cms_system_policy_decision_scope_allowed(
        p_actor_id, decision.actor_id, p_environment
      )
      and private.cms_system_policy_target_scope_allowed(
        p_actor_id,decision.target_type,decision.target_id,p_environment
      )
    order by decision.occurred_at desc
    limit p_limit
  ) entry;
  return jsonb_build_object(
    'schemaVersion', 1, 'items', v_items,
    'environment', p_environment, 'siteKey', p_site_key
  );
end;
$$;

create function public.cms_execute_scope_command(
  p_actor_id uuid,
  p_action text,
  p_payload jsonb,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_command_id uuid,
  p_idempotency_key uuid,
  p_request_hash text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_target_user_id uuid;
  v_role_key text;
  v_assignment public.cms_scoped_role_assignments%rowtype;
  v_receipt public.cms_scope_command_receipts%rowtype;
  v_other_supers integer;
  v_response jsonb;
  v_response_assignment uuid;
  v_response_user uuid;
begin
  if p_action not in ('grant', 'revoke')
     or jsonb_typeof(p_payload) is distinct from 'object'
     or p_site_key is distinct from 'main'
     or p_environment not in ('local', 'staging')
     or p_command_id is null
     or p_idempotency_key is null
     or p_correlation_id is null
     or p_request_hash is null
     or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'CMS_SCOPE_COMMAND_INVALID' using errcode = '22023';
  end if;
  begin
    v_target_user_id := nullif(p_payload ->> 'targetUserId', '')::uuid;
  exception when others then
    raise exception 'CMS_SCOPE_COMMAND_INVALID' using errcode = '22023';
  end;
  v_role_key := nullif(btrim(p_payload ->> 'roleKey'), '');
  if v_target_user_id is null or v_role_key is null
     or not private.cms_user_actor_context_active(p_actor_id, p_environment)
     or not private.cms_system_permission_lineage_allowed(
       p_actor_id, 'cms:scopes.manage', p_environment
     ) then
    raise exception 'CMS_SCOPE_FORBIDDEN' using errcode = '42501';
  end if;

  -- Required lock order: all actor leases, role-domain advisory fence, then
  -- receipt/assignment rows. Terminal cleanup therefore cannot race a command.
  perform private.cms_system_lock_actor_scope(p_actor_id,p_environment);
  if not private.cms_user_actor_target_scope_allowed(
       p_actor_id, v_target_user_id, p_environment
     ) then
    raise exception 'CMS_SCOPE_TARGET_FORBIDDEN' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('cms:scoped-super:' || p_site_key || ':' || p_environment, 0)
  );

  select * into v_receipt
  from public.cms_scope_command_receipts receipt
  where receipt.actor_id = p_actor_id
    and receipt.action = p_action
    and receipt.idempotency_key = p_idempotency_key
  for update;
  if found and (
    v_receipt.request_hash <> p_request_hash
    or v_receipt.target_user_id is distinct from v_target_user_id
    or not private.cms_system_scope_receipt_scope_allowed(
      p_actor_id, v_receipt.actor_id, v_receipt.target_user_id,
      v_receipt.assignment_id, p_environment
    )
  ) then
    raise exception 'CMS_SCOPE_IDEMPOTENCY_CONFLICT' using errcode = 'PT409';
  end if;

  select * into v_assignment
  from public.cms_scoped_role_assignments assignment
  where assignment.user_id = v_target_user_id
    and assignment.role_key = v_role_key
    and assignment.site_key = p_site_key
    and assignment.environment = p_environment
  for update;
  if found and not private.cms_system_assignment_scope_allowed(
       p_actor_id, v_assignment.id, p_environment
     ) then
    raise exception 'CMS_SCOPE_TARGET_FORBIDDEN' using errcode = '42501';
  end if;

  if p_action = 'revoke' and found and v_assignment.role_key = 'super_admin'
     and v_assignment.revoked_at is null
     and v_assignment.valid_from <= statement_timestamp()
     and (v_assignment.expires_at is null or v_assignment.expires_at > statement_timestamp()) then
    select count(*) into v_other_supers
    from public.cms_scoped_role_assignments assignment
    join public.cms_profiles profile on profile.user_id = assignment.user_id
    where assignment.site_key = p_site_key
      and assignment.environment = p_environment
      and assignment.role_key = 'super_admin'
      and assignment.user_id <> v_target_user_id
      and assignment.revoked_at is null
      and assignment.valid_from <= statement_timestamp()
      and (assignment.expires_at is null or assignment.expires_at > statement_timestamp())
      and profile.status = 'active'
      and private.cms_system_assignment_scope_allowed(
        p_actor_id, assignment.id, p_environment
      );
    if v_other_supers = 0 then
      raise exception 'CMS_SCOPE_LAST_SUPER_ADMIN' using errcode = 'PT409';
    end if;
  end if;

  v_response := public.cms_execute_scope_command_unscoped_0076(
    p_actor_id, p_action, p_payload, p_environment, p_site_key, p_aal,
    p_session_id, p_issued_at, p_command_id, p_idempotency_key,
    p_request_hash, p_correlation_id
  );
  begin
    v_response_assignment := (v_response ->> 'assignmentId')::uuid;
    v_response_user := (v_response ->> 'userId')::uuid;
  exception when others then
    raise exception 'CMS_SCOPE_RECEIPT_INVALID' using errcode = '55000';
  end;
  if v_response_user <> v_target_user_id
     or not private.cms_system_assignment_scope_allowed(
       p_actor_id, v_response_assignment, p_environment
     ) then
    raise exception 'CMS_SCOPE_IDEMPOTENCY_CONFLICT' using errcode = 'PT409';
  end if;
  return v_response;
end;
$$;

-- Strengthen the shared assertion used by both the historical system command
-- implementation and the new scoped entry points.
create or replace function private.cms_system_assert_available(
  p_actor_id uuid,
  p_permission text,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_context jsonb;
begin
  if p_environment not in ('local', 'staging')
     or p_site_key is distinct from 'main'
     or p_permission !~ '^cms:(diagnostics|leads)\.[a-z_]+$'
     or not private.cms_user_actor_context_active(p_actor_id, p_environment) then
    raise exception 'CMS_SYSTEM_FORBIDDEN' using errcode = '42501';
  end if;
  v_context := private.cms_system_individual_flag_context(p_actor_id, p_environment);
  if coalesce((v_context ->> 'enabled')::boolean, false) is not true then
    raise exception 'CMS_SYSTEM_FEATURE_DISABLED' using errcode = '42501';
  end if;
  if not private.cms_system_permission_lineage_allowed(
       p_actor_id, p_permission, p_environment
     ) or not private.cms_ev2_actor_authorized_for_scope(
       p_actor_id, p_permission, p_environment, p_site_key,
       p_aal, p_session_id, p_issued_at
     ) then
    raise exception 'CMS_SYSTEM_FORBIDDEN' using errcode = '42501';
  end if;
end;
$$;

alter function public.cms_system_capability(
  uuid,text,text,text,text,timestamptz
) rename to cms_system_capability_unscoped_0076;
alter function public.cms_get_system_snapshot(
  uuid,text,text,text,text,timestamptz,uuid
) rename to cms_get_system_snapshot_unscoped_0076;
alter function public.cms_execute_system_command(
  uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,uuid,text
) rename to cms_execute_system_command_unscoped_0076;

revoke all on function public.cms_system_capability_unscoped_0076(
  uuid,text,text,text,text,timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.cms_get_system_snapshot_unscoped_0076(
  uuid,text,text,text,text,timestamptz,uuid
) from public, anon, authenticated, service_role;
revoke all on function public.cms_execute_system_command_unscoped_0076(
  uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,uuid,text
) from public, anon, authenticated, service_role;

create function public.cms_system_capability(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
begin
  if p_site_key is distinct from 'main'
     or not private.cms_user_actor_context_active(p_actor_id, p_environment) then
    return jsonb_build_object(
      'schemaVersion', 1, 'enabled', false, 'source', 'scope_invalid',
      'environment', p_environment, 'siteKey', p_site_key,
      'realDataAllowed', false, 'syntheticOnly', true,
      'requiresIndependentReview', true
    );
  end if;
  perform private.cms_system_lock_actor_scope(p_actor_id,p_environment);
  if not private.cms_system_permission_lineage_allowed(
       p_actor_id, 'cms:diagnostics.read', p_environment
     ) then
    return jsonb_build_object(
      'schemaVersion', 1, 'enabled', false, 'source', 'forbidden',
      'environment', p_environment, 'siteKey', p_site_key,
      'realDataAllowed', false, 'syntheticOnly', true,
      'requiresIndependentReview', true
    );
  end if;
  return public.cms_system_capability_unscoped_0076(
    p_actor_id, p_environment, p_site_key, p_aal, p_session_id, p_issued_at
  );
end;
$$;

create function public.cms_get_system_snapshot(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_publication_pending integer := 0;
  v_publication_lag bigint := 0;
  v_lead_pending integer := 0;
  v_lead_dead integer := 0;
  v_lead_lag bigint := 0;
  v_collaboration_pending integer := 0;
  v_collaboration_dead integer := 0;
  v_collaboration_lag bigint := 0;
  v_projection_divergence integer := 0;
  v_lead_divergence integer := 0;
  v_critical_alerts integer := 0;
  v_critical_actions integer := 0;
  v_untraced_actions integer := 0;
  v_audit_coverage numeric := 100;
  v_worst_lag bigint := 0;
  v_gate_ready boolean := false;
begin
  if p_correlation_id is null then
    raise exception 'CMS_SYSTEM_COMMAND_INVALID' using errcode = '22023';
  end if;
  perform private.cms_system_lock_actor_scope(p_actor_id,p_environment);
  perform private.cms_system_assert_available(
    p_actor_id, 'cms:diagnostics.read', p_environment, p_site_key,
    p_aal, p_session_id, p_issued_at
  );

  select count(*)::integer,
         coalesce(floor(extract(epoch from statement_timestamp() - min(outbox.created_at))), 0)::bigint
  into v_publication_pending, v_publication_lag
  from public.cms_publication_outbox outbox
  where outbox.status in ('pending', 'processing', 'failed')
    and private.cms_content_item_graph_scope_allowed(
      p_actor_id, outbox.item_id, p_environment
    );

  select count(*)::integer,
         coalesce(floor(extract(epoch from statement_timestamp() - min(outbox.created_at))), 0)::bigint
  into v_lead_pending, v_lead_lag
  from public.cms_lead_outbox outbox
  where outbox.status in ('pending', 'processing', 'failed')
    and private.cms_lead_scope_allowed(p_actor_id, outbox.lead_id, p_environment);
  select count(*)::integer into v_lead_dead
  from public.cms_lead_outbox outbox
  where outbox.status = 'dead_letter'
    and private.cms_lead_scope_allowed(p_actor_id, outbox.lead_id, p_environment);

  select count(*)::integer,
         coalesce(floor(extract(epoch from statement_timestamp() - min(outbox.created_at))), 0)::bigint
  into v_collaboration_pending, v_collaboration_lag
  from public.cms_collaboration_outbox outbox
  where outbox.status in ('pending', 'processing', 'failed')
    and private.cms_crb_task_scope_allowed(p_actor_id, outbox.task_id, p_environment);
  select count(*)::integer into v_collaboration_dead
  from public.cms_collaboration_outbox outbox
  where outbox.status = 'dead_letter'
    and private.cms_crb_task_scope_allowed(p_actor_id, outbox.task_id, p_environment);

  select (
    (select count(*)
       from public.cms_publications publication
       join public.cms_content_items item on item.id = publication.item_id
      where private.cms_content_item_graph_scope_allowed(
              p_actor_id, item.id, p_environment
            )
        and not exists (
          select 1 from public.cms_published_projection projection
          where projection.item_id = publication.item_id
            and projection.revision_id = publication.revision_id
        )
        and not (
          item.workflow_status in ('archived', 'trashed')
          and item.content_type in ('page', 'homepage', 'navigation', 'site_settings', 'placement')
        ))
    +
    (select count(*)
       from public.cms_published_projection projection
       join public.cms_content_items item on item.id = projection.item_id
      where private.cms_content_item_graph_scope_allowed(
              p_actor_id, item.id, p_environment
            )
        and (
          not exists (
            select 1 from public.cms_publications publication
            where publication.item_id = projection.item_id
              and publication.revision_id = projection.revision_id
          )
          or (
            item.workflow_status in ('archived', 'trashed')
            and item.content_type in ('page', 'homepage', 'navigation', 'site_settings', 'placement')
          )
        ))
  )::integer into v_projection_divergence;

  select count(*)::integer into v_lead_divergence
  from public.cms_leads lead
  where private.cms_lead_scope_allowed(p_actor_id, lead.id, p_environment)
    and (
      not exists (select 1 from public.cms_lead_consents consent where consent.lead_id = lead.id)
      or not exists (select 1 from public.cms_lead_status_history history where history.lead_id = lead.id)
      or not exists (select 1 from public.cms_lead_outbox outbox where outbox.lead_id = lead.id)
    );

  select count(*)::integer into v_critical_alerts
  from public.cms_operational_events event
  where event.severity = 'critical'
    and event.resolved_at is null
    and private.cms_system_operational_event_scope_allowed(
      p_actor_id, event.id, p_environment
    );

  select count(*)::integer,
         count(*) filter (where audit.correlation_id is null)::integer
  into v_critical_actions, v_untraced_actions
  from public.cms_audit_log audit
  join public.cms_permissions permission on permission.permission_key = audit.action
  where permission.critical
    and audit.occurred_at >= statement_timestamp() - interval '24 hours'
    and (
      case when private.cms_system_actor_ever_qa(p_actor_id)
        then private.cms_user_audit_actor_scope_allowed(p_actor_id, audit.actor_id)
        else audit.actor_id is null or not private.cms_system_actor_ever_qa(audit.actor_id)
      end
    );
  if v_critical_actions > 0 then
    v_audit_coverage := round(
      100.0 * (v_critical_actions - v_untraced_actions) / v_critical_actions, 2
    );
  end if;

  v_worst_lag := greatest(v_publication_lag, v_lead_lag, v_collaboration_lag);
  v_gate_ready := v_worst_lag <= 60
    and v_lead_dead = 0
    and v_collaboration_dead = 0
    and v_projection_divergence = 0
    and v_lead_divergence = 0
    and v_critical_alerts = 0
    and v_untraced_actions = 0;

  return jsonb_build_object(
    'schemaVersion', 1,
    'capturedAt', statement_timestamp(),
    'correlationId', p_correlation_id,
    'environment', p_environment,
    'siteKey', p_site_key,
    'containsPersonalData', false,
    'gateReady', v_gate_ready,
    'gateDecision', 'non_authoritative',
    'queues', jsonb_build_array(
      jsonb_build_object('key','publication','actionable',v_publication_pending,'deadLetter',0,'oldestLagSeconds',v_publication_lag),
      jsonb_build_object('key','lead_delivery','actionable',v_lead_pending,'deadLetter',v_lead_dead,'oldestLagSeconds',v_lead_lag),
      jsonb_build_object('key','collaboration','actionable',v_collaboration_pending,'deadLetter',v_collaboration_dead,'oldestLagSeconds',v_collaboration_lag)
    ),
    'metrics', jsonb_build_object(
      'outboxWorstLagSeconds',v_worst_lag,
      'projectionDivergence',v_projection_divergence,
      'leadDivergence',v_lead_divergence,
      'openCriticalAlerts',v_critical_alerts,
      'criticalActionsObserved24h',v_critical_actions,
      'criticalActionsUntraced24h',v_untraced_actions,
      'auditCoveragePercent',v_audit_coverage
    ),
    'checks', jsonb_build_array(
      jsonb_build_object('key','outbox_lag','category','operational','passed',v_worst_lag<=60,'observed',v_worst_lag,'threshold',60,'unit','seconds'),
      jsonb_build_object('key','dead_letter','category','resilience','passed',v_lead_dead+v_collaboration_dead=0,'observed',v_lead_dead+v_collaboration_dead,'threshold',0,'unit','events'),
      jsonb_build_object('key','publication_reconciliation','category','data','passed',v_projection_divergence=0,'observed',v_projection_divergence,'threshold',0,'unit','records'),
      jsonb_build_object('key','lead_reconciliation','category','data','passed',v_lead_divergence=0,'observed',v_lead_divergence,'threshold',0,'unit','records'),
      jsonb_build_object('key','critical_alerts','category','observability','passed',v_critical_alerts=0,'observed',v_critical_alerts,'threshold',0,'unit','alerts'),
      jsonb_build_object('key','critical_audit_trace','category','security','passed',v_untraced_actions=0,'observed',v_audit_coverage,'threshold',100,'unit','percent')
    )
  );
end;
$$;

create function public.cms_execute_system_command(
  p_actor_id uuid,
  p_action text,
  p_payload jsonb,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_command_id uuid,
  p_correlation_id uuid,
  p_idempotency_key uuid,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_run_id uuid;
  v_run public.cms_assurance_runs%rowtype;
  v_receipt public.cms_system_command_receipts%rowtype;
  v_response jsonb;
  v_response_run_id uuid;
begin
  if p_action not in ('record_run', 'review_run')
     or jsonb_typeof(p_payload) is distinct from 'object'
     or p_environment not in ('local', 'staging')
     or p_site_key is distinct from 'main'
     or p_command_id is null
     or p_correlation_id is null
     or p_idempotency_key is null
     or p_request_hash is null
     or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'CMS_SYSTEM_COMMAND_INVALID' using errcode = '22023';
  end if;
  if p_action = 'review_run' then
    begin
      v_run_id := nullif(p_payload ->> 'runId', '')::uuid;
    exception when others then
      raise exception 'CMS_SYSTEM_REVIEW_INVALID' using errcode = '22023';
    end;
    -- requested_by/candidate/environment are immutable. Read them without a
    -- row lock solely to acquire every lease once, in canonical actor order.
    select * into v_run from public.cms_assurance_runs run
    where run.id=v_run_id;
    if not found then raise exception 'CMS_SYSTEM_RUN_NOT_FOUND' using errcode='PT404'; end if;
    perform private.cms_lock_active_qa_actor_leases(
      array_remove(array[p_actor_id,v_run.requested_by,v_run.reviewed_by],null)
    );
  else
    perform private.cms_lock_active_qa_actor_leases(array[p_actor_id]);
  end if;

  perform private.cms_system_assert_available(
    p_actor_id, 'cms:diagnostics.assure', p_environment, p_site_key,
    p_aal, p_session_id, p_issued_at
  );
  if p_action = 'record_run'
     and private.cms_system_actor_ever_qa(p_actor_id)
     and not exists (
       select 1 from private.cms_qa_actor_leases lease
       where lease.actor_id = p_actor_id
         and lease.environment = p_environment
         and lease.status = 'active'
         and lease.expires_at > statement_timestamp()
         and lease.candidate_sha = p_payload ->> 'candidateSha'
         and private.cms_qa_actor_marker_is_exact(
           lease.actor_id, lease.run_tag, lease.candidate_sha, lease.environment
         )
     ) then
    raise exception 'CMS_SYSTEM_CANDIDATE_FORBIDDEN' using errcode = '42501';
  end if;

  if v_run_id is not null then
    select * into v_run from public.cms_assurance_runs run
    where run.id = v_run_id for update;
    if not found then raise exception 'CMS_SYSTEM_RUN_NOT_FOUND' using errcode = 'PT404'; end if;
    if not private.cms_system_assurance_run_scope_allowed(
         p_actor_id, v_run.id, p_environment
       ) then
      raise exception 'CMS_SYSTEM_RUN_NOT_FOUND' using errcode = 'PT404';
    end if;
  end if;

  select * into v_receipt
  from public.cms_system_command_receipts receipt
  where receipt.actor_id = p_actor_id
    and receipt.idempotency_key = p_idempotency_key
  for update;
  if found and (
    v_receipt.action <> p_action
    or v_receipt.request_hash <> p_request_hash
    or not private.cms_system_command_receipt_scope_allowed(
      p_actor_id, v_receipt.actor_id, v_receipt.response, p_environment
    )
  ) then
    raise exception 'CMS_SYSTEM_IDEMPOTENCY_CONFLICT' using errcode = 'PT409';
  end if;

  v_response := public.cms_execute_system_command_unscoped_0076(
    p_actor_id, p_action, p_payload, p_environment, p_site_key, p_aal,
    p_session_id, p_issued_at, p_command_id, p_correlation_id,
    p_idempotency_key, p_request_hash
  );
  begin
    v_response_run_id := (v_response ->> 'runId')::uuid;
  exception when others then
    raise exception 'CMS_SYSTEM_RECEIPT_INVALID' using errcode = '55000';
  end;
  if not private.cms_system_assurance_run_scope_allowed(
       p_actor_id, v_response_run_id, p_environment
     ) then
    raise exception 'CMS_SYSTEM_IDEMPOTENCY_CONFLICT' using errcode = 'PT409';
  end if;
  return v_response;
end;
$$;

-- Existing rate-limited functions are redefined so their stored plans resolve
-- only the new scoped entry points after the historical functions were renamed.
create or replace function public.cms_system_capability_limited(
  p_actor_id uuid,p_environment text,p_site_key text,p_aal text,
  p_session_id text,p_issued_at timestamptz,p_rate_limit_key_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
begin
  if p_rate_limit_key_hash is null or p_rate_limit_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'CMS_RATE_LIMIT_KEY_INVALID' using errcode='22023';
  end if;
  if public.consume_rate_limit(p_rate_limit_key_hash,'cms_system_capability',120,900) is not true then
    raise exception 'CMS_RATE_LIMIT_EXCEEDED' using errcode='PT429';
  end if;
  return public.cms_system_capability(
    p_actor_id,p_environment,p_site_key,p_aal,p_session_id,p_issued_at
  );
end;
$$;

create or replace function public.cms_get_system_snapshot_limited(
  p_actor_id uuid,p_environment text,p_site_key text,p_aal text,
  p_session_id text,p_issued_at timestamptz,p_correlation_id uuid,
  p_rate_limit_key_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
begin
  if p_rate_limit_key_hash is null or p_rate_limit_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'CMS_RATE_LIMIT_KEY_INVALID' using errcode='22023';
  end if;
  if public.consume_rate_limit(p_rate_limit_key_hash,'cms_system_snapshot',120,900) is not true then
    raise exception 'CMS_RATE_LIMIT_EXCEEDED' using errcode='PT429';
  end if;
  return public.cms_get_system_snapshot(
    p_actor_id,p_environment,p_site_key,p_aal,p_session_id,p_issued_at,p_correlation_id
  );
end;
$$;

create or replace function public.cms_execute_system_command_limited(
  p_actor_id uuid,p_action text,p_payload jsonb,p_environment text,p_site_key text,
  p_aal text,p_session_id text,p_issued_at timestamptz,p_command_id uuid,
  p_correlation_id uuid,p_idempotency_key uuid,p_request_hash text,
  p_rate_limit_key_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
begin
  if p_action not in ('record_run','review_run') then
    raise exception 'CMS_SYSTEM_COMMAND_INVALID' using errcode='22023';
  end if;
  if p_rate_limit_key_hash is null or p_rate_limit_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'CMS_RATE_LIMIT_KEY_INVALID' using errcode='22023';
  end if;
  if public.consume_rate_limit(p_rate_limit_key_hash,'cms_system_'||p_action,20,900) is not true then
    raise exception 'CMS_RATE_LIMIT_EXCEEDED' using errcode='PT429';
  end if;
  return public.cms_execute_system_command(
    p_actor_id,p_action,p_payload,p_environment,p_site_key,p_aal,p_session_id,
    p_issued_at,p_command_id,p_correlation_id,p_idempotency_key,p_request_hash
  );
end;
$$;

-- Defense in depth for accidental direct PostgREST grants. Sensitive policy
-- hashes remain unavailable because the table itself is not granted.
drop policy if exists cms_scoped_role_assignments_authoritative_read on public.cms_scoped_role_assignments;
create policy cms_scoped_role_assignments_authoritative_read
on public.cms_scoped_role_assignments for select to authenticated
using (
  public.cms_system_session_permission_allowed('cms:scopes.read',environment)
  and public.cms_system_assignment_session_read_allowed(id,environment)
);

drop policy if exists cms_policy_decisions_authoritative_read on public.cms_policy_decisions;
create policy cms_policy_decisions_authoritative_read
on public.cms_policy_decisions for select to authenticated
using (
  public.cms_system_session_permission_allowed('cms:policy_decisions.read',environment)
  and public.cms_system_policy_session_read_allowed(
    actor_id,target_type,target_id,environment
  )
);

drop policy if exists cms_scope_receipts_authoritative_read on public.cms_scope_command_receipts;
create policy cms_scope_receipts_authoritative_read
on public.cms_scope_command_receipts for select to authenticated
using (
  public.cms_system_scope_receipt_session_read_allowed(
    actor_id,target_user_id,assignment_id
  )
);

drop policy if exists cms_assurance_runs_authoritative_read on public.cms_assurance_runs;
create policy cms_assurance_runs_authoritative_read
on public.cms_assurance_runs for select to authenticated
using (
  public.cms_system_session_permission_allowed('cms:diagnostics.read',environment)
  and public.cms_system_assurance_session_read_allowed(id,environment)
);

drop policy if exists cms_assurance_events_authoritative_read on public.cms_assurance_events;
create policy cms_assurance_events_authoritative_read
on public.cms_assurance_events for select to authenticated
using (
  exists (
    select 1 from public.cms_assurance_runs run
    where run.id=cms_assurance_events.run_id
      and public.cms_system_session_permission_allowed(
        'cms:diagnostics.read',run.environment
      )
      and public.cms_system_assurance_session_read_allowed(run.id,run.environment)
  )
);

drop policy if exists cms_system_receipts_authoritative_read on public.cms_system_command_receipts;
create policy cms_system_receipts_authoritative_read
on public.cms_system_command_receipts for select to authenticated
using (
  public.cms_system_command_receipt_session_read_allowed(actor_id,response)
);

drop policy if exists cms_events_diagnostics_read on public.cms_operational_events;
drop policy if exists cms_operational_events_authoritative_read on public.cms_operational_events;
create policy cms_operational_events_authoritative_read
on public.cms_operational_events for select to authenticated
using (
  public.cms_system_operational_session_read_allowed(id)
);

-- Operational error codes are identifiers, never provider messages. Scrub
-- historical free-form values before enforcing the same rule for new rows.
update public.cms_operational_events
set error_code='redacted'
where error_code is not null
  and error_code !~ '^[a-z][a-z0-9_]{1,63}$';
alter table public.cms_operational_events
  drop constraint if exists cms_operational_events_error_code_safe;
alter table public.cms_operational_events
  add constraint cms_operational_events_error_code_safe
  check(error_code is null or error_code ~ '^[a-z][a-z0-9_]{1,63}$');

-- Terminal cleanup may abort ephemeral QA assurance state and remove mutable
-- command receipts. Immutable policy/audit/assurance events are never deleted.
create or replace function public.cms_assurance_run_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if current_setting('cms.qa_system_cleanup_actor',true)<>'' then
    if not private.cms_system_cleanup_actor_controls(
      current_setting('cms.qa_system_cleanup_actor',true)::uuid,
      old.requested_by,old.environment,old.candidate_sha
    ) then
      raise exception 'CMS_ASSURANCE_RUN_IMMUTABLE' using errcode='55000';
    end if;
    if tg_op='DELETE' then
      raise exception 'CMS_ASSURANCE_RUN_IMMUTABLE' using errcode='55000';
    end if;
    if (to_jsonb(old)-array['status','reviewed_by','review_rationale','reviewed_at','updated_at'])
       is distinct from
       (to_jsonb(new)-array['status','reviewed_by','review_rationale','reviewed_at','updated_at'])
       or old.status not in ('measured','failed')
       or new.status<>'aborted'
       or new.reviewed_by is not null
       or new.review_rationale is not null
       or new.reviewed_at is not null then
      raise exception 'CMS_ASSURANCE_RUN_IMMUTABLE' using errcode='55000';
    end if;
    return new;
  end if;
  if tg_op='DELETE' then
    raise exception 'CMS_ASSURANCE_RUN_IMMUTABLE' using errcode='55000';
  end if;
  if (to_jsonb(old)-array['status','reviewed_by','review_rationale','reviewed_at','updated_at'])
     is distinct from
     (to_jsonb(new)-array['status','reviewed_by','review_rationale','reviewed_at','updated_at'])
     or old.status<>'measured'
     or old.reviewed_by is not null
     or new.status not in ('accepted','rejected')
     or new.reviewed_by is null
     or new.review_rationale is null
     or new.reviewed_at is null then
    raise exception 'CMS_ASSURANCE_RUN_IMMUTABLE' using errcode='55000';
  end if;
  return new;
end;
$$;

create or replace function public.cms_system_receipt_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if tg_op='DELETE' then
    if current_setting('cms.qa_system_cleanup_actor',true)<>''
       and private.cms_system_cleanup_actor_controls(
         current_setting('cms.qa_system_cleanup_actor',true)::uuid,
         old.actor_id,
         (select lease.environment from private.cms_qa_actor_leases lease
          where lease.actor_id=old.actor_id),
         (select lease.candidate_sha from private.cms_qa_actor_leases lease
          where lease.actor_id=old.actor_id)
       ) then return old; end if;
    raise exception 'CMS_SYSTEM_RECEIPT_IMMUTABLE' using errcode='55000';
  end if;
  if (to_jsonb(old)-array['response','completed_at']) is distinct from
     (to_jsonb(new)-array['response','completed_at'])
     or old.completed_at is not null
     or new.completed_at is null
     or new.response is null then
    raise exception 'CMS_SYSTEM_RECEIPT_IMMUTABLE' using errcode='55000';
  end if;
  return new;
end;
$$;

create or replace function private.cms_system_rbac_terminal_cleanup()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
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

  -- A correlation UUID alone is never ownership. The event must be wholly
  -- inside this active actor scope and have direct provenance from this actor.
  delete from public.cms_operational_events event
  where private.cms_system_operational_event_scope_allowed(
      old.actor_id,event.id,old.environment
    )
    and (
      exists(
        select 1 from public.cms_content_items item
        where item.id=event.item_id and item.created_by=old.actor_id
      )
      or exists(
        select 1 from public.cms_audit_log audit
        where audit.correlation_id=event.correlation_id
          and audit.actor_id=old.actor_id
      )
      or exists(
        select 1 from public.cms_policy_decisions decision
        where decision.correlation_id=event.correlation_id
          and decision.actor_id=old.actor_id
      )
      or exists(
        select 1 from public.cms_assurance_runs run
        where run.correlation_id=event.correlation_id
          and (run.requested_by=old.actor_id or run.reviewed_by=old.actor_id)
      )
      or exists(
        select 1 from public.cms_assurance_events assurance_event
        where assurance_event.correlation_id=event.correlation_id
          and assurance_event.actor_id=old.actor_id
      )
      or exists(
        select 1 from public.cms_lead_outbox_replays replay
        where replay.correlation_id=event.correlation_id
          and replay.requested_by=old.actor_id
      )
      or exists(
        select 1
        from public.cms_lead_outbox outbox
        join public.cms_leads lead on lead.id=outbox.lead_id
        where outbox.correlation_id=event.correlation_id
          and lead.qa_actor_id=old.actor_id
      )
      or exists(
        select 1 from public.cms_collaboration_outbox outbox
        where outbox.correlation_id=event.correlation_id
          and outbox.recipient_id=old.actor_id
      )
    );
  return new;
end;
$$;

drop trigger if exists zzzz_cms_system_rbac_terminal_cleanup
on private.cms_qa_actor_leases;
create trigger zzzz_cms_system_rbac_terminal_cleanup
before update of status on private.cms_qa_actor_leases
for each row execute function private.cms_system_rbac_terminal_cleanup();

revoke all on function private.cms_system_actor_ever_qa(uuid)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_system_actor_reference_allowed(uuid,uuid,text,boolean)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_system_cleanup_actor_controls(uuid,uuid,text,text)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_system_lock_actor_scope(uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_system_assignment_scope_allowed(uuid,uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_system_permission_lineage_allowed(uuid,text,text)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_system_policy_decision_scope_allowed(uuid,uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_system_assurance_run_scope_allowed(uuid,uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_system_scope_receipt_scope_allowed(uuid,uuid,uuid,uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_system_command_receipt_scope_allowed(uuid,uuid,jsonb,text)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_system_policy_target_scope_allowed(uuid,text,text,text)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_system_operational_event_scope_allowed(uuid,uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_system_rbac_terminal_cleanup()
  from public,anon,authenticated,service_role;

revoke all on function public.cms_system_assignment_session_read_allowed(uuid,text)
  from public,anon,authenticated;
grant execute on function public.cms_system_assignment_session_read_allowed(uuid,text)
  to authenticated;
revoke all on function public.cms_system_policy_session_read_allowed(uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function public.cms_system_policy_session_read_allowed(uuid,text,text,text)
  to authenticated;
revoke all on function public.cms_system_assurance_session_read_allowed(uuid,text)
  from public,anon,authenticated;
grant execute on function public.cms_system_assurance_session_read_allowed(uuid,text)
  to authenticated;
revoke all on function public.cms_system_operational_session_read_allowed(uuid)
  from public,anon,authenticated;
grant execute on function public.cms_system_operational_session_read_allowed(uuid)
  to authenticated;
revoke all on function public.cms_system_scope_receipt_session_read_allowed(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.cms_system_scope_receipt_session_read_allowed(uuid,uuid,uuid)
  to authenticated;
revoke all on function public.cms_system_command_receipt_session_read_allowed(uuid,jsonb)
  from public,anon,authenticated;
grant execute on function public.cms_system_command_receipt_session_read_allowed(uuid,jsonb)
  to authenticated;
revoke all on function public.cms_system_session_permission_allowed(text,text)
  from public,anon,authenticated;
grant execute on function public.cms_system_session_permission_allowed(text,text)
  to authenticated;

revoke all on function public.cms_evaluate_scoped_permission(
  uuid,text,text,text,text,text,timestamptz,text,text,uuid
) from public,anon,authenticated;
revoke all on function public.cms_rbac_scope_capability(
  uuid,text,text,text,text,timestamptz
) from public,anon,authenticated;
grant execute on function public.cms_rbac_scope_capability(
  uuid,text,text,text,text,timestamptz
) to service_role;
revoke all on function public.cms_resolve_scoped_access(
  uuid,text,text,text,text,timestamptz
) from public,anon,authenticated;
grant execute on function public.cms_resolve_scoped_access(
  uuid,text,text,text,text,timestamptz
) to service_role;
grant execute on function public.cms_evaluate_scoped_permission(
  uuid,text,text,text,text,text,timestamptz,text,text,uuid
) to service_role;
revoke all on function public.cms_get_scoped_assignments(
  uuid,text,text,text,text,timestamptz,uuid
) from public,anon,authenticated;
grant execute on function public.cms_get_scoped_assignments(
  uuid,text,text,text,text,timestamptz,uuid
) to service_role;
revoke all on function public.cms_get_policy_decisions(
  uuid,text,text,text,text,timestamptz,integer
) from public,anon,authenticated;
grant execute on function public.cms_get_policy_decisions(
  uuid,text,text,text,text,timestamptz,integer
) to service_role;
revoke all on function public.cms_execute_scope_command(
  uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,uuid
) from public,anon,authenticated;
grant execute on function public.cms_execute_scope_command(
  uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,uuid
) to service_role;

revoke all on function public.cms_system_capability(uuid,text,text,text,text,timestamptz)
  from public,anon,authenticated;
grant execute on function public.cms_system_capability(uuid,text,text,text,text,timestamptz)
  to service_role;
revoke all on function public.cms_get_system_snapshot(uuid,text,text,text,text,timestamptz,uuid)
  from public,anon,authenticated;
grant execute on function public.cms_get_system_snapshot(uuid,text,text,text,text,timestamptz,uuid)
  to service_role;
revoke all on function public.cms_execute_system_command(
  uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,uuid,text
) from public,anon,authenticated;
grant execute on function public.cms_execute_system_command(
  uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,uuid,text
) to service_role;
