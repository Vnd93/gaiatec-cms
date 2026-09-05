-- EV2.11 / G11 — reconciliação da projeção pública conforme o ciclo de vida.
-- Conteúdo gerenciado retirado (archived/trashed) mantém cms_publications como
-- trilha da última publicação, mas não pode permanecer em cms_published_projection.

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
stable
security definer
set search_path = public, private, pg_temp
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
  perform private.cms_system_assert_available(
    p_actor_id, 'cms:diagnostics.read', p_environment, p_site_key,
    p_aal, p_session_id, p_issued_at
  );

  select count(*)::integer,
         coalesce(floor(extract(epoch from now() - min(created_at))), 0)::bigint
  into v_publication_pending, v_publication_lag
  from public.cms_publication_outbox
  where status in ('pending', 'processing', 'failed');

  select count(*)::integer,
         coalesce(floor(extract(epoch from now() - min(created_at))), 0)::bigint
  into v_lead_pending, v_lead_lag
  from public.cms_lead_outbox
  where status in ('pending', 'processing', 'failed');
  select count(*)::integer into v_lead_dead
  from public.cms_lead_outbox where status = 'dead_letter';

  select count(*)::integer,
         coalesce(floor(extract(epoch from now() - min(created_at))), 0)::bigint
  into v_collaboration_pending, v_collaboration_lag
  from public.cms_collaboration_outbox
  where status in ('pending', 'processing', 'failed');
  select count(*)::integer into v_collaboration_dead
  from public.cms_collaboration_outbox where status = 'dead_letter';

  select (
    (select count(*)
       from public.cms_publications publication
       join public.cms_content_items item on item.id = publication.item_id
      where not exists (
        select 1
          from public.cms_published_projection projection
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
      where not exists (
        select 1
          from public.cms_publications publication
         where publication.item_id = projection.item_id
           and publication.revision_id = projection.revision_id
      )
         or (
          item.workflow_status in ('archived', 'trashed')
          and item.content_type in ('page', 'homepage', 'navigation', 'site_settings', 'placement')
        ))
  )::integer into v_projection_divergence;

  select count(*)::integer into v_lead_divergence
  from public.cms_leads lead
  where not exists (select 1 from public.cms_lead_consents consent where consent.lead_id = lead.id)
     or not exists (select 1 from public.cms_lead_status_history history where history.lead_id = lead.id)
     or not exists (select 1 from public.cms_lead_outbox event where event.lead_id = lead.id);

  select count(*)::integer into v_critical_alerts
  from public.cms_operational_events
  where severity = 'critical' and resolved_at is null;

  select count(*)::integer,
         count(*) filter (where audit.correlation_id is null)::integer
  into v_critical_actions, v_untraced_actions
  from public.cms_audit_log audit
  join public.cms_permissions permission on permission.permission_key = audit.action
  where permission.critical and audit.occurred_at >= now() - interval '24 hours';
  if v_critical_actions > 0 then
    v_audit_coverage := round(100.0 * (v_critical_actions - v_untraced_actions) / v_critical_actions, 2);
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
    'capturedAt', now(),
    'correlationId', p_correlation_id,
    'environment', p_environment,
    'siteKey', p_site_key,
    'containsPersonalData', false,
    'gateReady', v_gate_ready,
    'gateDecision', 'non_authoritative',
    'queues', jsonb_build_array(
      jsonb_build_object('key', 'publication', 'actionable', v_publication_pending, 'deadLetter', 0, 'oldestLagSeconds', v_publication_lag),
      jsonb_build_object('key', 'lead_delivery', 'actionable', v_lead_pending, 'deadLetter', v_lead_dead, 'oldestLagSeconds', v_lead_lag),
      jsonb_build_object('key', 'collaboration', 'actionable', v_collaboration_pending, 'deadLetter', v_collaboration_dead, 'oldestLagSeconds', v_collaboration_lag)
    ),
    'metrics', jsonb_build_object(
      'outboxWorstLagSeconds', v_worst_lag,
      'projectionDivergence', v_projection_divergence,
      'leadDivergence', v_lead_divergence,
      'openCriticalAlerts', v_critical_alerts,
      'criticalActionsObserved24h', v_critical_actions,
      'criticalActionsUntraced24h', v_untraced_actions,
      'auditCoveragePercent', v_audit_coverage
    ),
    'checks', jsonb_build_array(
      jsonb_build_object('key', 'outbox_lag', 'category', 'operational', 'passed', v_worst_lag <= 60, 'observed', v_worst_lag, 'threshold', 60, 'unit', 'seconds'),
      jsonb_build_object('key', 'dead_letter', 'category', 'resilience', 'passed', v_lead_dead + v_collaboration_dead = 0, 'observed', v_lead_dead + v_collaboration_dead, 'threshold', 0, 'unit', 'events'),
      jsonb_build_object('key', 'publication_reconciliation', 'category', 'data', 'passed', v_projection_divergence = 0, 'observed', v_projection_divergence, 'threshold', 0, 'unit', 'records'),
      jsonb_build_object('key', 'lead_reconciliation', 'category', 'data', 'passed', v_lead_divergence = 0, 'observed', v_lead_divergence, 'threshold', 0, 'unit', 'records'),
      jsonb_build_object('key', 'critical_alerts', 'category', 'observability', 'passed', v_critical_alerts = 0, 'observed', v_critical_alerts, 'threshold', 0, 'unit', 'alerts'),
      jsonb_build_object('key', 'critical_audit_trace', 'category', 'security', 'passed', v_untraced_actions = 0, 'observed', v_audit_coverage, 'threshold', 100, 'unit', 'percent')
    )
  );
end;
$$;

revoke all on function public.cms_get_system_snapshot(uuid, text, text, text, text, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.cms_get_system_snapshot(uuid, text, text, text, text, timestamptz, uuid)
  to service_role;
