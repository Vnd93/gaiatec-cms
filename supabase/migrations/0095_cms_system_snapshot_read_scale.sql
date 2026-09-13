begin;

-- The G11 snapshot used the authoritative graph predicates correctly, but it
-- evaluated them against every historical QA fixture before rejecting rows
-- from other runs.  Staging retains those tombstones intentionally, so the
-- cost grew with every canary.  Keep the deep predicates as the final check
-- and first materialize only rows that can belong to the caller's exact
-- active lease.  Corporate callers keep the original, complete domain.
create or replace function public.cms_get_system_snapshot(
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
  v_actor_is_qa boolean := false;
  v_run_tag text;
  v_candidate_sha text;
  v_lease_environment text;
begin
  if p_correlation_id is null then
    raise exception 'CMS_SYSTEM_COMMAND_INVALID' using errcode = '22023';
  end if;
  perform private.cms_system_lock_actor_scope(p_actor_id,p_environment);
  perform private.cms_system_assert_available(
    p_actor_id, 'cms:diagnostics.read', p_environment, p_site_key,
    p_aal, p_session_id, p_issued_at
  );

  select exists (
    select 1 from private.cms_qa_actor_leases history
    where history.actor_id = p_actor_id
  ) into v_actor_is_qa;
  if v_actor_is_qa then
    select lease.run_tag, lease.candidate_sha, lease.environment
    into strict v_run_tag, v_candidate_sha, v_lease_environment
    from private.cms_qa_actor_leases lease
    where lease.actor_id = p_actor_id
      and lease.environment = p_environment
      and lease.status = 'active'
      and lease.expires_at > statement_timestamp()
      and private.cms_qa_actor_marker_is_exact(
        lease.actor_id, lease.run_tag, lease.candidate_sha, lease.environment
      );
  end if;

  if v_actor_is_qa then
    with candidates as materialized (
      select outbox.created_at, outbox.item_id
      from public.cms_publication_outbox outbox
      join public.cms_content_items item on item.id = outbox.item_id
      where outbox.status in ('pending', 'processing', 'failed')
        and (
          item.content_type in ('navigation', 'site_settings')
          or exists (
            select 1
            from private.cms_qa_actor_leases owner
            where owner.actor_id = item.created_by
              and owner.run_tag = v_run_tag
              and owner.candidate_sha = v_candidate_sha
              and owner.environment = v_lease_environment
              and owner.status = 'active'
              and owner.expires_at > statement_timestamp()
              and item.created_at between owner.created_at and owner.expires_at
          )
        )
    )
    select count(*)::integer,
           coalesce(floor(extract(epoch from statement_timestamp() - min(candidate.created_at))), 0)::bigint
    into v_publication_pending, v_publication_lag
    from candidates candidate
    where private.cms_content_item_graph_scope_allowed(
      p_actor_id, candidate.item_id, p_environment
    );

    with candidates as materialized (
      select outbox.created_at, outbox.lead_id
      from public.cms_lead_outbox outbox
      join public.cms_leads lead on lead.id = outbox.lead_id
      join private.cms_qa_actor_leases owner
        on owner.actor_id = lead.qa_actor_id
       and owner.run_tag = v_run_tag
       and owner.candidate_sha = v_candidate_sha
       and owner.environment = v_lease_environment
       and owner.status = 'active'
       and owner.expires_at > statement_timestamp()
       and lead.created_at between owner.created_at and owner.expires_at
      where outbox.status in ('pending', 'processing', 'failed')
        and lead.qa_run_tag = v_run_tag
        and lead.qa_candidate_sha = v_candidate_sha
        and lead.qa_environment = v_lease_environment
    )
    select count(*)::integer,
           coalesce(floor(extract(epoch from statement_timestamp() - min(candidate.created_at))), 0)::bigint
    into v_lead_pending, v_lead_lag
    from candidates candidate
    where private.cms_lead_scope_allowed(p_actor_id, candidate.lead_id, p_environment);

    with candidates as materialized (
      select outbox.lead_id
      from public.cms_lead_outbox outbox
      join public.cms_leads lead on lead.id = outbox.lead_id
      join private.cms_qa_actor_leases owner
        on owner.actor_id = lead.qa_actor_id
       and owner.run_tag = v_run_tag
       and owner.candidate_sha = v_candidate_sha
       and owner.environment = v_lease_environment
       and owner.status = 'active'
       and owner.expires_at > statement_timestamp()
       and lead.created_at between owner.created_at and owner.expires_at
      where outbox.status = 'dead_letter'
        and lead.qa_run_tag = v_run_tag
        and lead.qa_candidate_sha = v_candidate_sha
        and lead.qa_environment = v_lease_environment
    )
    select count(*)::integer into v_lead_dead
    from candidates candidate
    where private.cms_lead_scope_allowed(p_actor_id, candidate.lead_id, p_environment);

    with candidates as materialized (
      select outbox.created_at, outbox.task_id
      from public.cms_collaboration_outbox outbox
      join public.cms_work_tasks task on task.id = outbox.task_id
      join private.cms_qa_actor_leases owner
        on owner.actor_id = task.created_by
       and owner.run_tag = v_run_tag
       and owner.candidate_sha = v_candidate_sha
       and owner.environment = v_lease_environment
       and owner.status = 'active'
       and owner.expires_at > statement_timestamp()
       and task.created_at between owner.created_at and owner.expires_at
      where outbox.status in ('pending', 'processing', 'failed')
    )
    select count(*)::integer,
           coalesce(floor(extract(epoch from statement_timestamp() - min(candidate.created_at))), 0)::bigint
    into v_collaboration_pending, v_collaboration_lag
    from candidates candidate
    where private.cms_crb_task_scope_allowed(p_actor_id, candidate.task_id, p_environment);

    with candidates as materialized (
      select outbox.task_id
      from public.cms_collaboration_outbox outbox
      join public.cms_work_tasks task on task.id = outbox.task_id
      join private.cms_qa_actor_leases owner
        on owner.actor_id = task.created_by
       and owner.run_tag = v_run_tag
       and owner.candidate_sha = v_candidate_sha
       and owner.environment = v_lease_environment
       and owner.status = 'active'
       and owner.expires_at > statement_timestamp()
       and task.created_at between owner.created_at and owner.expires_at
      where outbox.status = 'dead_letter'
    )
    select count(*)::integer into v_collaboration_dead
    from candidates candidate
    where private.cms_crb_task_scope_allowed(p_actor_id, candidate.task_id, p_environment);

    with candidate_publications as materialized (
      select publication.item_id, publication.revision_id,
             item.workflow_status, item.content_type
      from public.cms_publications publication
      join public.cms_content_items item on item.id = publication.item_id
      where item.content_type in ('navigation', 'site_settings')
         or exists (
           select 1
           from private.cms_qa_actor_leases owner
           where owner.actor_id = item.created_by
             and owner.run_tag = v_run_tag
             and owner.candidate_sha = v_candidate_sha
             and owner.environment = v_lease_environment
             and owner.status = 'active'
             and owner.expires_at > statement_timestamp()
             and item.created_at between owner.created_at and owner.expires_at
         )
    ), candidate_projections as materialized (
      select projection.item_id, projection.revision_id,
             item.workflow_status, item.content_type
      from public.cms_published_projection projection
      join public.cms_content_items item on item.id = projection.item_id
      where item.content_type in ('navigation', 'site_settings')
         or exists (
           select 1
           from private.cms_qa_actor_leases owner
           where owner.actor_id = item.created_by
             and owner.run_tag = v_run_tag
             and owner.candidate_sha = v_candidate_sha
             and owner.environment = v_lease_environment
             and owner.status = 'active'
             and owner.expires_at > statement_timestamp()
             and item.created_at between owner.created_at and owner.expires_at
         )
    )
    select (
      (select count(*) from candidate_publications publication
       where private.cms_content_item_graph_scope_allowed(
               p_actor_id, publication.item_id, p_environment
             )
         and not exists (
           select 1 from public.cms_published_projection projection
           where projection.item_id = publication.item_id
             and projection.revision_id = publication.revision_id
         )
         and not (
           publication.workflow_status in ('archived', 'trashed')
           and publication.content_type in ('page', 'homepage', 'navigation', 'site_settings', 'placement')
         ))
      +
      (select count(*) from candidate_projections projection
       where private.cms_content_item_graph_scope_allowed(
               p_actor_id, projection.item_id, p_environment
             )
         and (
           not exists (
             select 1 from public.cms_publications publication
             where publication.item_id = projection.item_id
               and publication.revision_id = projection.revision_id
           )
           or (
             projection.workflow_status in ('archived', 'trashed')
             and projection.content_type in ('page', 'homepage', 'navigation', 'site_settings', 'placement')
           )
         ))
    )::integer into v_projection_divergence;

    with candidates as materialized (
      select lead.id
      from public.cms_leads lead
      join private.cms_qa_actor_leases owner
        on owner.actor_id = lead.qa_actor_id
       and owner.run_tag = v_run_tag
       and owner.candidate_sha = v_candidate_sha
       and owner.environment = v_lease_environment
       and owner.status = 'active'
       and owner.expires_at > statement_timestamp()
       and lead.created_at between owner.created_at and owner.expires_at
      where lead.qa_run_tag = v_run_tag
        and lead.qa_candidate_sha = v_candidate_sha
        and lead.qa_environment = v_lease_environment
    )
    select count(*)::integer into v_lead_divergence
    from candidates lead
    where private.cms_lead_scope_allowed(p_actor_id, lead.id, p_environment)
      and (
        not exists (select 1 from public.cms_lead_consents consent where consent.lead_id = lead.id)
        or not exists (select 1 from public.cms_lead_status_history history where history.lead_id = lead.id)
        or not exists (select 1 from public.cms_lead_outbox outbox where outbox.lead_id = lead.id)
      );

    with candidates as materialized (
      select audit.actor_id, audit.correlation_id
      from public.cms_audit_log audit
      join public.cms_permissions permission on permission.permission_key = audit.action
      join private.cms_qa_actor_leases owner
        on owner.actor_id = audit.actor_id
       and owner.run_tag = v_run_tag
       and owner.candidate_sha = v_candidate_sha
       and owner.environment = v_lease_environment
       and owner.status = 'active'
       and owner.expires_at > statement_timestamp()
       and audit.occurred_at between owner.created_at and owner.expires_at
      where permission.critical
        and audit.occurred_at >= statement_timestamp() - interval '24 hours'
    )
    select count(*)::integer,
           count(*) filter (where audit.correlation_id is null)::integer
    into v_critical_actions, v_untraced_actions
    from candidates audit
    where private.cms_user_audit_actor_scope_allowed(p_actor_id, audit.actor_id);
  else
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

    select count(*)::integer,
           count(*) filter (where audit.correlation_id is null)::integer
    into v_critical_actions, v_untraced_actions
    from public.cms_audit_log audit
    join public.cms_permissions permission on permission.permission_key = audit.action
    where permission.critical
      and audit.occurred_at >= statement_timestamp() - interval '24 hours'
      and (audit.actor_id is null or not private.cms_system_actor_ever_qa(audit.actor_id));
  end if;

  select count(*)::integer into v_critical_alerts
  from public.cms_operational_events event
  where event.severity = 'critical'
    and event.resolved_at is null
    and private.cms_system_operational_event_scope_allowed(
      p_actor_id, event.id, p_environment
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

-- The edge previously called /auth/v1/user and then PostgREST sequentially for
-- every measured snapshot.  PostgREST already verifies the bearer signature;
-- derive identity, MFA and session claims from that verified request and fuse
-- authentication, rate limiting and the read in one database round trip.
create or replace function public.cms_get_system_snapshot_authenticated(
  p_environment text,
  p_site_key text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, auth, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_session_id text := auth.jwt() ->> 'session_id';
  v_issued_raw text := auth.jwt() ->> 'iat';
  v_aal text := case when auth.jwt() ->> 'aal' = 'aal2' then 'aal2' else 'aal1' end;
  v_rate_limit_key_hash text;
begin
  if v_actor_id is null
     or v_session_id is null
     or char_length(v_session_id) not between 1 and 200
     or coalesce(v_issued_raw, '') !~ '^[0-9]+$' then
    raise exception 'CMS_SYSTEM_AUTH_INVALID' using errcode = '42501';
  end if;
  v_rate_limit_key_hash := encode(
    extensions.digest(convert_to(v_actor_id::text, 'UTF8'), 'sha256'), 'hex'
  );
  return public.cms_get_system_snapshot_limited(
    v_actor_id,
    p_environment,
    p_site_key,
    v_aal,
    v_session_id,
    to_timestamp(v_issued_raw::double precision),
    p_correlation_id,
    v_rate_limit_key_hash
  );
end;
$$;

revoke all on function public.cms_get_system_snapshot_authenticated(text,text,uuid)
  from public, anon, service_role;
grant execute on function public.cms_get_system_snapshot_authenticated(text,text,uuid)
  to authenticated;

revoke all on function public.cms_get_system_snapshot(uuid,text,text,text,text,timestamptz,uuid)
  from public, anon, authenticated;
grant execute on function public.cms_get_system_snapshot(uuid,text,text,text,text,timestamptz,uuid)
  to service_role;

commit;
