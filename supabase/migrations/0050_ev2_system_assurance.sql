-- EV2.11 — integração operacional, resiliência e garantia sistêmica (F-017/F-018).
-- Estritamente aditiva e default-off. O candidato aceita somente local/staging,
-- overrides individuais de até 30 minutos e evidência sem dados pessoais.

insert into public.cms_permissions (permission_key, description, critical)
values
  ('cms:leads.retry_delivery', 'Reprocessar entrega de lead com justificativa e auditoria.', true),
  ('cms:diagnostics.assure', 'Registrar e revisar evidências sistêmicas do Gate G11.', true)
on conflict (permission_key) do update
set description = excluded.description,
    critical = excluded.critical;

insert into public.cms_role_permissions (role_key, permission_key)
values
  ('super_admin', 'cms:leads.retry_delivery'),
  ('super_admin', 'cms:diagnostics.assure'),
  ('admin', 'cms:leads.retry_delivery'),
  ('admin', 'cms:diagnostics.assure'),
  ('commercial', 'cms:leads.retry_delivery'),
  ('technical', 'cms:diagnostics.assure')
on conflict do nothing;

insert into public.cms_feature_flags (flag_key, description, owner_key)
values (
  'ev2.system_assurance',
  'Garantia sistêmica, reprocessamento controlado e evidências do Gate G11.',
  'tech_lead'
)
on conflict (flag_key) do nothing;

create table public.cms_lead_outbox_replays (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.cms_lead_outbox (id) on delete restrict,
  lead_id uuid not null references public.cms_leads (id) on delete restrict,
  requested_by uuid not null references public.cms_profiles (user_id) on delete restrict,
  idempotency_key uuid not null unique,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  previous_status text not null check (previous_status in ('failed', 'dead_letter')),
  previous_attempts integer not null check (previous_attempts between 0 and 20),
  previous_error_code text,
  justification text not null check (char_length(btrim(justification)) between 3 and 500),
  correlation_id uuid not null,
  created_at timestamptz not null default now()
);

create index cms_lead_outbox_replays_event_idx
  on public.cms_lead_outbox_replays (event_id, created_at desc);

create table public.cms_assurance_runs (
  id uuid primary key default gen_random_uuid(),
  suite_key text not null check (suite_key ~ '^g11-[a-z0-9-]{3,80}$'),
  environment text not null check (environment in ('local', 'staging')),
  site_key text not null default 'main' check (site_key = 'main'),
  candidate_sha text not null check (candidate_sha ~ '^[0-9a-f]{40}$'),
  status text not null check (status in ('measured', 'accepted', 'rejected', 'failed', 'aborted')),
  measurement_passed boolean not null,
  total_checks integer not null check (total_checks between 1 and 10000),
  passed_checks integer not null check (passed_checks between 0 and total_checks),
  p0_count integer not null check (p0_count between 0 and 10000),
  p1_count integer not null check (p1_count between 0 and 10000),
  accessibility_critical integer not null check (accessibility_critical between 0 and 10000),
  accessibility_serious integer not null check (accessibility_serious between 0 and 10000),
  security_status text not null check (security_status in ('passed', 'failed')),
  restore_status text not null check (restore_status in ('passed', 'failed')),
  metrics jsonb not null check (jsonb_typeof(metrics) = 'object'),
  evidence_hash text not null check (evidence_hash ~ '^[0-9a-f]{64}$'),
  synthetic_only boolean not null default true check (synthetic_only),
  real_data_used boolean not null default false check (not real_data_used),
  requested_by uuid not null references public.cms_profiles (user_id) on delete restrict,
  reviewed_by uuid references public.cms_profiles (user_id) on delete restrict,
  review_rationale text check (
    review_rationale is null or char_length(btrim(review_rationale)) between 3 and 500
  ),
  correlation_id uuid not null,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (finished_at >= started_at and finished_at <= started_at + interval '6 hours'),
  check (
    started_at >= created_at - interval '30 minutes'
    and finished_at <= created_at + interval '5 minutes'
  ),
  check (reviewed_by is null or reviewed_by <> requested_by),
  check (
    (status = 'measured' and measurement_passed and reviewed_by is null and reviewed_at is null)
    or (status = 'failed' and not measurement_passed and reviewed_by is null and reviewed_at is null)
    or (status in ('accepted', 'rejected') and reviewed_by is not null and reviewed_at is not null)
    or (status = 'aborted' and reviewed_by is null and reviewed_at is null)
  ),
  check (status not in ('accepted', 'rejected') or measurement_passed),
  check ((status in ('accepted', 'rejected')) = (review_rationale is not null))
);

create index cms_assurance_runs_candidate_idx
  on public.cms_assurance_runs (environment, candidate_sha, created_at desc);

create table public.cms_assurance_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.cms_assurance_runs (id) on delete restrict,
  actor_id uuid not null references public.cms_profiles (user_id) on delete restrict,
  event_type text not null check (event_type in ('measured', 'measurement_failed', 'accepted', 'rejected')),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  correlation_id uuid not null,
  created_at timestamptz not null default now()
);

create index cms_assurance_events_run_idx
  on public.cms_assurance_events (run_id, created_at);

create table public.cms_system_command_receipts (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.cms_profiles (user_id) on delete restrict,
  action text not null check (action in ('record_run', 'review_run')),
  idempotency_key uuid not null,
  command_id uuid not null unique,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  correlation_id uuid not null,
  response jsonb check (response is null or jsonb_typeof(response) = 'object'),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (actor_id, idempotency_key),
  check ((response is null) = (completed_at is null))
);

create function private.cms_system_individual_flag_context(
  p_actor_id uuid,
  p_environment text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_flag public.cms_feature_flags%rowtype;
  v_user_count integer := 0;
  v_matching_count integer := 0;
  v_broad_count integer := 0;
  v_enabled boolean := false;
  v_starts_at timestamptz;
  v_expires_at timestamptz;
begin
  if p_actor_id is null or p_environment is null or p_environment not in ('local', 'staging') then
    return jsonb_build_object('enabled', false, 'source', 'scope_invalid');
  end if;
  select * into v_flag from public.cms_feature_flags
  where flag_key = 'ev2.system_assurance' and (expires_at is null or expires_at > now());
  if not found then return jsonb_build_object('enabled', false, 'source', 'flag_unavailable'); end if;
  if v_flag.kill_switch then return jsonb_build_object('enabled', false, 'source', 'kill_switch'); end if;
  if v_flag.default_enabled then
    return jsonb_build_object('enabled', false, 'source', 'broad_activation_not_supported');
  end if;
  select count(*) into v_broad_count
  from public.cms_feature_flag_overrides
  where flag_key = 'ev2.system_assurance' and scope_type <> 'user' and enabled
    and starts_at <= now() and expires_at > now();
  if v_broad_count > 0 then
    return jsonb_build_object('enabled', false, 'source', 'broad_activation_not_supported');
  end if;
  select count(*), count(*) filter (where environment = p_environment),
         bool_or(enabled) filter (where environment = p_environment),
         min(starts_at) filter (where environment = p_environment),
         min(expires_at) filter (where environment = p_environment)
  into v_user_count, v_matching_count, v_enabled, v_starts_at, v_expires_at
  from public.cms_feature_flag_overrides
  where flag_key = 'ev2.system_assurance' and scope_type = 'user'
    and scope_key = p_actor_id::text and starts_at <= now() and expires_at > now();
  if v_user_count <> 1 or v_matching_count <> 1 then
    return jsonb_build_object(
      'enabled', false,
      'source', case when v_user_count > 1 then 'ambiguous_user_overrides' else 'individual_override_required' end
    );
  end if;
  if not coalesce(v_enabled, false) then
    return jsonb_build_object('enabled', false, 'source', 'user_override_off');
  end if;
  if v_expires_at > v_starts_at + interval '30 minutes'
     or v_expires_at > now() + interval '30 minutes' then
    return jsonb_build_object('enabled', false, 'source', 'override_window_invalid');
  end if;
  return jsonb_build_object(
    'enabled', true,
    'source', 'individual_override',
    'environment', p_environment,
    'expiresAt', v_expires_at
  );
end;
$$;

create function private.cms_system_metrics_safe(p_metrics jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when jsonb_typeof(p_metrics) <> 'object' then false
    else (select count(*) from jsonb_each(p_metrics)) between 7 and 100
      and not exists (
        select 1 from jsonb_each(p_metrics) metric
        where metric.key !~ '^[a-z][a-zA-Z0-9]{1,79}$'
           or jsonb_typeof(metric.value) not in ('number', 'boolean', 'null')
      )
  end;
$$;

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
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_context jsonb;
  v_authorized boolean := false;
begin
  v_context := private.cms_system_individual_flag_context(p_actor_id, p_environment);
  if p_site_key = 'main' and coalesce((v_context ->> 'enabled')::boolean, false) then
    v_authorized := private.cms_ev2_actor_authorized_for_scope(
      p_actor_id, 'cms:diagnostics.read', p_environment, p_site_key,
      p_aal, p_session_id, p_issued_at
    );
  end if;
  return jsonb_build_object(
    'schemaVersion', 1,
    'enabled', v_authorized,
    'source', case when v_authorized then 'individual_override' else coalesce(v_context ->> 'source', 'forbidden') end,
    'environment', p_environment,
    'siteKey', p_site_key,
    'realDataAllowed', false,
    'syntheticOnly', true,
    'maxOverrideMinutes', 30,
    'requiresIndependentReview', true,
    'baselines', jsonb_build_object(
      'availabilityPercent', 99.9,
      'adminReadP95Ms', 500,
      'commandP95Ms', 800,
      'outboxLagP95Ms', 60000,
      'restoreRpoMinutes', 0,
      'restoreRtoMinutes', 15,
      'accessibilityCritical', 0,
      'accessibilitySerious', 0,
      'auditCoveragePercent', 100
    )
  );
end;
$$;

create function private.cms_system_assert_available(
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
set search_path = public, private, pg_temp
as $$
declare
  v_context jsonb;
begin
  v_context := private.cms_system_individual_flag_context(p_actor_id, p_environment);
  if p_site_key <> 'main' or coalesce((v_context ->> 'enabled')::boolean, false) is not true then
    raise exception 'CMS_SYSTEM_FEATURE_DISABLED' using errcode = '42501';
  end if;
  if p_permission !~ '^cms:(diagnostics|leads)\.[a-z_]+$'
     or not private.cms_ev2_actor_authorized_for_scope(
       p_actor_id, p_permission, p_environment, p_site_key,
       p_aal, p_session_id, p_issued_at
     ) then
    raise exception 'CMS_SYSTEM_FORBIDDEN' using errcode = '42501';
  end if;
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
    (select count(*) from public.cms_publications publication
      where not exists (
        select 1 from public.cms_published_projection projection
        where projection.item_id = publication.item_id
          and projection.revision_id = publication.revision_id
      ))
    +
    (select count(*) from public.cms_published_projection projection
      where not exists (
        select 1 from public.cms_publications publication
        where publication.item_id = projection.item_id
          and publication.revision_id = projection.revision_id
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

create function public.cms_retry_lead_delivery(
  p_actor_id uuid,
  p_event_id uuid,
  p_justification text,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_correlation_id uuid,
  p_idempotency_key uuid,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_event public.cms_lead_outbox%rowtype;
  v_replay public.cms_lead_outbox_replays%rowtype;
begin
  perform private.cms_system_assert_available(
    p_actor_id, 'cms:leads.retry_delivery', p_environment, p_site_key,
    p_aal, p_session_id, p_issued_at
  );
  if p_event_id is null
     or p_correlation_id is null
     or p_idempotency_key is null
     or p_justification is null
     or char_length(btrim(p_justification)) not between 3 and 500
     or p_request_hash is null
     or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'CMS_LEAD_DELIVERY_RETRY_INVALID' using errcode = '22023';
  end if;

  select * into v_replay from public.cms_lead_outbox_replays
  where idempotency_key = p_idempotency_key;
  if found then
    if v_replay.requested_by <> p_actor_id
       or v_replay.event_id <> p_event_id
       or v_replay.request_hash <> p_request_hash then
      raise exception 'CMS_LEAD_DELIVERY_IDEMPOTENCY_CONFLICT' using errcode = 'PT409';
    end if;
    return jsonb_build_object(
      'schemaVersion', 1, 'eventId', v_replay.event_id, 'leadId', v_replay.lead_id,
      'status', 'pending', 'replayed', true, 'duplicate', true,
      'correlationId', v_replay.correlation_id
    );
  end if;

  select event.* into v_event
  from public.cms_lead_outbox event
  join public.cms_leads lead on lead.id = event.lead_id and lead.anonymized_at is null
  where event.id = p_event_id
  for update of event;
  if not found then raise exception 'CMS_LEAD_DELIVERY_NOT_FOUND' using errcode = 'PT404'; end if;
  if v_event.status not in ('failed', 'dead_letter') then
    raise exception 'CMS_LEAD_DELIVERY_NOT_RETRYABLE' using errcode = 'PT409';
  end if;

  if v_event.status = 'dead_letter' then
    update public.cms_operational_events
    set resolved_at = now()
    where event_type = 'cms.leads.delivery_dead_letter'
      and correlation_id = v_event.correlation_id
      and resolved_at is null;
  end if;

  insert into public.cms_lead_outbox_replays (
    event_id, lead_id, requested_by, idempotency_key, request_hash,
    previous_status, previous_attempts, previous_error_code, justification, correlation_id
  ) values (
    v_event.id, v_event.lead_id, p_actor_id, p_idempotency_key, p_request_hash,
    v_event.status, v_event.attempts, v_event.last_error_code, btrim(p_justification), p_correlation_id
  );
  update public.cms_lead_outbox set
    status = 'pending', attempts = 0, available_at = now(), locked_at = null,
    completed_at = null, last_error_code = null, correlation_id = p_correlation_id
  where id = v_event.id;
  insert into public.cms_audit_log (
    actor_id, action, target_type, target_id, event_data, correlation_id
  ) values (
    p_actor_id, 'cms:leads.retry_delivery', 'lead_outbox', v_event.id::text,
    jsonb_build_object(
      'leadId', v_event.lead_id, 'previousStatus', v_event.status,
      'previousAttempts', v_event.attempts, 'justification', btrim(p_justification)
    ), p_correlation_id
  );
  insert into public.cms_operational_events (
    severity, event_type, correlation_id, error_code, resolved_at
  ) values ('info', 'cms.leads.delivery_requeued', p_correlation_id, 'manual_retry', now());

  return jsonb_build_object(
    'schemaVersion', 1, 'eventId', v_event.id, 'leadId', v_event.lead_id,
    'status', 'pending', 'replayed', true, 'duplicate', false,
    'correlationId', p_correlation_id
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
set search_path = public, private, pg_temp
as $$
declare
  v_receipt public.cms_system_command_receipts%rowtype;
  v_run public.cms_assurance_runs%rowtype;
  v_response jsonb;
  v_passed boolean := false;
  v_accept boolean;
  v_status text;
begin
  if p_action is null
     or p_action not in ('record_run', 'review_run')
     or p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
     or p_command_id is null
     or p_correlation_id is null
     or p_idempotency_key is null
     or p_request_hash is null
     or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'CMS_SYSTEM_COMMAND_INVALID' using errcode = '22023';
  end if;
  perform private.cms_system_assert_available(
    p_actor_id, 'cms:diagnostics.assure', p_environment, p_site_key,
    p_aal, p_session_id, p_issued_at
  );

  insert into public.cms_system_command_receipts (
    actor_id, action, idempotency_key, command_id, request_hash, correlation_id
  ) values (
    p_actor_id, p_action, p_idempotency_key, p_command_id, p_request_hash, p_correlation_id
  ) on conflict (actor_id, idempotency_key) do nothing;
  select * into v_receipt from public.cms_system_command_receipts
  where actor_id = p_actor_id and idempotency_key = p_idempotency_key
  for update;
  if v_receipt.action <> p_action or v_receipt.request_hash <> p_request_hash then
    raise exception 'CMS_SYSTEM_IDEMPOTENCY_CONFLICT' using errcode = 'PT409';
  end if;
  if v_receipt.completed_at is not null then return v_receipt.response; end if;

  if p_action = 'record_run' then
    if p_payload ->> 'suiteKey' !~ '^g11-[a-z0-9-]{3,80}$'
       or p_payload ->> 'candidateSha' !~ '^[0-9a-f]{40}$'
       or p_payload ->> 'evidenceHash' !~ '^[0-9a-f]{64}$'
       or coalesce((p_payload ->> 'syntheticOnly')::boolean, false) is not true
       or coalesce((p_payload ->> 'realDataUsed')::boolean, true) is not false
       or not private.cms_system_metrics_safe(p_payload -> 'metrics') then
      raise exception 'CMS_SYSTEM_REPORT_INVALID' using errcode = '22023';
    end if;
    v_passed := coalesce((p_payload ->> 'totalChecks')::integer, 0) > 0
      and (p_payload ->> 'passedChecks')::integer = (p_payload ->> 'totalChecks')::integer
      and coalesce((p_payload ->> 'p0Count')::integer, -1) = 0
      and coalesce((p_payload ->> 'p1Count')::integer, -1) = 0
      and coalesce((p_payload ->> 'accessibilityCritical')::integer, -1) = 0
      and coalesce((p_payload ->> 'accessibilitySerious')::integer, -1) = 0
      and p_payload ->> 'securityStatus' = 'passed'
      and p_payload ->> 'restoreStatus' = 'passed'
      and coalesce((p_payload #>> '{metrics,availabilityPercent}')::numeric >= 99.9, false)
      and coalesce((p_payload #>> '{metrics,adminReadP95Ms}')::numeric <= 500, false)
      and coalesce((p_payload #>> '{metrics,commandP95Ms}')::numeric <= 800, false)
      and coalesce((p_payload #>> '{metrics,outboxLagP95Ms}')::numeric <= 60000, false)
      and coalesce((p_payload #>> '{metrics,auditCoveragePercent}')::numeric >= 100, false)
      and coalesce((p_payload #>> '{metrics,restoreRpoMinutes}')::numeric = 0, false)
      and coalesce((p_payload #>> '{metrics,restoreRtoMinutes}')::numeric <= 15, false);

    insert into public.cms_assurance_runs (
      suite_key, environment, site_key, candidate_sha, status, measurement_passed,
      total_checks, passed_checks, p0_count, p1_count,
      accessibility_critical, accessibility_serious, security_status, restore_status,
      metrics, evidence_hash, synthetic_only, real_data_used, requested_by,
      correlation_id, started_at, finished_at
    ) values (
      p_payload ->> 'suiteKey', p_environment, p_site_key, p_payload ->> 'candidateSha',
      case when v_passed then 'measured' else 'failed' end, v_passed,
      (p_payload ->> 'totalChecks')::integer, (p_payload ->> 'passedChecks')::integer,
      (p_payload ->> 'p0Count')::integer, (p_payload ->> 'p1Count')::integer,
      (p_payload ->> 'accessibilityCritical')::integer,
      (p_payload ->> 'accessibilitySerious')::integer,
      p_payload ->> 'securityStatus', p_payload ->> 'restoreStatus',
      p_payload -> 'metrics', p_payload ->> 'evidenceHash', true, false, p_actor_id,
      p_correlation_id, (p_payload ->> 'startedAt')::timestamptz,
      (p_payload ->> 'finishedAt')::timestamptz
    ) returning * into v_run;
    insert into public.cms_assurance_events (
      run_id, actor_id, event_type, details, correlation_id
    ) values (
      v_run.id, p_actor_id, case when v_passed then 'measured' else 'measurement_failed' end,
      jsonb_build_object('totalChecks', v_run.total_checks, 'passedChecks', v_run.passed_checks),
      p_correlation_id
    );
    insert into public.cms_audit_log (
      actor_id, action, target_type, target_id, event_data, correlation_id
    ) values (
      p_actor_id, 'cms:diagnostics.assure', 'assurance_run', v_run.id::text,
      jsonb_build_object('event', 'measured', 'passed', v_passed, 'candidateSha', v_run.candidate_sha),
      p_correlation_id
    );
    v_response := jsonb_build_object(
      'schemaVersion', 1, 'runId', v_run.id, 'status', v_run.status,
      'measurementPassed', v_passed, 'requiresIndependentReview', v_passed,
      'correlationId', p_correlation_id
    );
  else
    if p_payload ->> 'runId' is null
       or p_payload ->> 'rationale' is null
       or char_length(btrim(p_payload ->> 'rationale')) not between 3 and 500
       or jsonb_typeof(p_payload -> 'accept') is distinct from 'boolean' then
      raise exception 'CMS_SYSTEM_REVIEW_INVALID' using errcode = '22023';
    end if;
    select * into v_run from public.cms_assurance_runs
    where id = (p_payload ->> 'runId')::uuid
      and environment = p_environment and site_key = p_site_key
    for update;
    if not found then raise exception 'CMS_SYSTEM_RUN_NOT_FOUND' using errcode = 'PT404'; end if;
    if v_run.requested_by = p_actor_id then
      raise exception 'CMS_SYSTEM_REVIEWER_SEPARATION_REQUIRED' using errcode = 'PT409';
    end if;
    if v_run.status <> 'measured'
       or not v_run.measurement_passed
       or v_run.finished_at < now() - interval '30 minutes' then
      raise exception 'CMS_SYSTEM_RUN_NOT_REVIEWABLE' using errcode = 'PT409';
    end if;
    v_accept := (p_payload ->> 'accept')::boolean;
    v_status := case when v_accept then 'accepted' else 'rejected' end;
    update public.cms_assurance_runs set
      status = v_status, reviewed_by = p_actor_id,
      review_rationale = btrim(p_payload ->> 'rationale'),
      reviewed_at = now(), updated_at = now()
    where id = v_run.id returning * into v_run;
    insert into public.cms_assurance_events (
      run_id, actor_id, event_type, details, correlation_id
    ) values (
      v_run.id, p_actor_id, v_status,
      jsonb_build_object('measurementPassed', v_run.measurement_passed), p_correlation_id
    );
    insert into public.cms_audit_log (
      actor_id, action, target_type, target_id, event_data, correlation_id
    ) values (
      p_actor_id, 'cms:diagnostics.assure', 'assurance_run', v_run.id::text,
      jsonb_build_object('event', v_status, 'candidateSha', v_run.candidate_sha), p_correlation_id
    );
    v_response := jsonb_build_object(
      'schemaVersion', 1, 'runId', v_run.id, 'status', v_status,
      'measurementPassed', true, 'requiresIndependentReview', false,
      'correlationId', p_correlation_id
    );
  end if;

  update public.cms_system_command_receipts
  set response = v_response, completed_at = now()
  where id = v_receipt.id;
  return v_response;
end;
$$;

create function public.cms_assurance_run_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'CMS_ASSURANCE_RUN_IMMUTABLE' using errcode = '55000';
  end if;
  if (to_jsonb(old) - array['status', 'reviewed_by', 'review_rationale', 'reviewed_at', 'updated_at'])
     is distinct from
     (to_jsonb(new) - array['status', 'reviewed_by', 'review_rationale', 'reviewed_at', 'updated_at'])
     or old.status <> 'measured'
     or old.reviewed_by is not null
     or new.status not in ('accepted', 'rejected')
     or new.reviewed_by is null
     or new.review_rationale is null
     or new.reviewed_at is null then
    raise exception 'CMS_ASSURANCE_RUN_IMMUTABLE' using errcode = '55000';
  end if;
  return new;
end;
$$;

create function public.cms_system_receipt_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'CMS_SYSTEM_RECEIPT_IMMUTABLE' using errcode = '55000';
  end if;
  if (to_jsonb(old) - array['response', 'completed_at'])
     is distinct from
     (to_jsonb(new) - array['response', 'completed_at'])
     or old.completed_at is not null
     or new.completed_at is null
     or new.response is null then
    raise exception 'CMS_SYSTEM_RECEIPT_IMMUTABLE' using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function public.cms_finish_lead_outbox(
  p_id uuid,
  p_success boolean,
  p_error_code text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.cms_lead_outbox%rowtype;
begin
  update public.cms_lead_outbox set
    status = case when p_success then 'completed' when attempts >= 20 then 'dead_letter' else 'failed' end,
    locked_at = null,
    completed_at = case when p_success then now() else null end,
    last_error_code = case when p_success then null else p_error_code end,
    available_at = case when p_success then available_at else now() + make_interval(mins => least(attempts * 2, 60)) end
  where id = p_id and status = 'processing'
  returning * into v_event;
  if not found then raise exception 'CMS_LEAD_OUTBOX_NOT_CLAIMED' using errcode = '40001'; end if;
  if v_event.status = 'dead_letter' then
    insert into public.cms_operational_events (
      severity, event_type, correlation_id, error_code
    ) values (
      'critical', 'cms.leads.delivery_dead_letter', v_event.correlation_id,
      coalesce(v_event.last_error_code, 'lead_notification_failed')
    );
  end if;
end;
$$;

create trigger cms_lead_outbox_replays_immutable
before update or delete on public.cms_lead_outbox_replays
for each row execute function public.cms_reject_immutable_mutation();

create trigger cms_assurance_runs_touch_updated_at
before update on public.cms_assurance_runs
for each row execute function public.cms_touch_updated_at();

create trigger cms_assurance_runs_guard
before update or delete on public.cms_assurance_runs
for each row execute function public.cms_assurance_run_guard();

create trigger cms_assurance_events_immutable
before update or delete on public.cms_assurance_events
for each row execute function public.cms_reject_immutable_mutation();

create trigger cms_system_command_receipts_guard
before update or delete on public.cms_system_command_receipts
for each row execute function public.cms_system_receipt_guard();

alter table public.cms_lead_outbox_replays enable row level security;
alter table public.cms_assurance_runs enable row level security;
alter table public.cms_assurance_events enable row level security;
alter table public.cms_system_command_receipts enable row level security;

create policy cms_lead_outbox_replays_read on public.cms_lead_outbox_replays
for select to authenticated using (public.cms_has_permission('cms:leads.read'));

revoke all on table
  public.cms_lead_outbox_replays,
  public.cms_assurance_runs,
  public.cms_assurance_events,
  public.cms_system_command_receipts
from public, anon, authenticated;

grant select on table public.cms_lead_outbox_replays to authenticated;

grant all on table
  public.cms_lead_outbox_replays,
  public.cms_assurance_runs,
  public.cms_assurance_events,
  public.cms_system_command_receipts
to service_role;

revoke all on function private.cms_system_individual_flag_context(uuid, text)
  from public, anon, authenticated;
revoke all on function private.cms_system_metrics_safe(jsonb)
  from public, anon, authenticated;
revoke all on function private.cms_system_assert_available(uuid, text, text, text, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.cms_system_capability(uuid, text, text, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.cms_get_system_snapshot(uuid, text, text, text, text, timestamptz, uuid)
  from public, anon, authenticated;
revoke all on function public.cms_retry_lead_delivery(
  uuid, uuid, text, text, text, text, text, timestamptz, uuid, uuid, text
) from public, anon, authenticated;
revoke all on function public.cms_execute_system_command(
  uuid, text, jsonb, text, text, text, text, timestamptz, uuid, uuid, uuid, text
) from public, anon, authenticated;
revoke all on function public.cms_assurance_run_guard()
  from public, anon, authenticated;
revoke all on function public.cms_system_receipt_guard()
  from public, anon, authenticated;
revoke all on function public.cms_finish_lead_outbox(uuid, boolean, text)
  from public, anon, authenticated;

grant execute on function public.cms_system_capability(uuid, text, text, text, text, timestamptz)
  to service_role;
grant execute on function public.cms_get_system_snapshot(uuid, text, text, text, text, timestamptz, uuid)
  to service_role;
grant execute on function public.cms_retry_lead_delivery(
  uuid, uuid, text, text, text, text, text, timestamptz, uuid, uuid, text
) to service_role;
grant execute on function public.cms_execute_system_command(
  uuid, text, jsonb, text, text, text, text, timestamptz, uuid, uuid, uuid, text
) to service_role;
grant execute on function public.cms_finish_lead_outbox(uuid, boolean, text)
  to service_role;
