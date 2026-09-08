const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA_PATTERN = /^[a-f0-9]{40}$/;
const RUN_TAG_PATTERN = /^QA-CMS-FINAL-[0-9]{8}-[0-9a-f]{8}$/;

const TERMINAL_CLASSIFICATION = Object.freeze({
  classification: "terminalArchivedTombstone",
  count: 1,
  statusCode: 410,
  destinationAbsent: true,
  itemArchived: true,
  publicationCount: 0,
  projectionCount: 0,
  actionableOutboxCount: 0,
  piiExposed: false,
});

const NO_SYNTHETIC_ROUTE_CLASSIFICATION = Object.freeze({
  classification: "terminalNoSyntheticRoute",
  count: 0,
  activeRouteRules: 0,
  identifiersOrPathsPersisted: false,
});

const ZERO_OBSERVATION_FIELDS = Object.freeze([
  "active_leases",
  "active_sessions",
  "active_credentials",
  "active_profiles",
  "active_feature_overrides",
  "active_legacy_roles",
  "active_scoped_roles",
  "active_rdo_access",
  "active_content",
  "active_publications",
  "published_projections",
  "actionable_route_rules",
  "actionable_publication_outbox",
  "active_leads",
  "actionable_lead_outbox",
  "active_forms",
  "active_ai_sessions",
  "active_ai_targets",
  "active_ai_plans",
  "active_ai_approvals",
  "active_documents",
]);

function record(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
  return value;
}

function exactTerminalClassification(value, code) {
  const candidate = record(value, code);
  if (
    JSON.stringify(Object.keys(candidate).sort()) !==
    JSON.stringify(Object.keys(TERMINAL_CLASSIFICATION).sort())
  ) {
    throw new Error(code);
  }
  for (const [key, expected] of Object.entries(TERMINAL_CLASSIFICATION)) {
    if (candidate[key] !== expected) throw new Error(code);
  }
  return candidate;
}

function exactNoSyntheticRouteClassification(value, code) {
  const candidate = record(value, code);
  if (
    JSON.stringify(Object.keys(candidate).sort()) !==
    JSON.stringify(Object.keys(NO_SYNTHETIC_ROUTE_CLASSIFICATION).sort())
  ) {
    throw new Error(code);
  }
  for (const [key, expected] of Object.entries(NO_SYNTHETIC_ROUTE_CLASSIFICATION)) {
    if (candidate[key] !== expected) throw new Error(code);
  }
  return candidate;
}

export function validateProductionTerminalInputs({
  state,
  cleanup,
  candidateSha,
  recoveryNoTombstone = false,
}) {
  if (!SHA_PATTERN.test(candidateSha)) throw new Error("G12_PRODUCTION_RESIDUE_INPUT_REFUSED");
  const privateState = record(state, "G12_PRODUCTION_RESIDUE_STATE_REFUSED");
  const stateTombstone = privateState.terminalArchivedTombstone;
  const expectedPath = `/qa-cms-final-gone-${candidateSha.slice(0, 8)}`;
  if (
    privateState.schemaVersion !== 1 ||
    privateState.status !== "cleaned" ||
    privateState.environment !== "production" ||
    privateState.expectedSha !== candidateSha ||
    !RUN_TAG_PATTERN.test(String(privateState.runTag ?? "")) ||
    !String(privateState.runTag).endsWith(`-${candidateSha.slice(0, 8)}`) ||
    !UUID_PATTERN.test(String(privateState.actorId ?? "")) ||
    !Array.isArray(privateState.itemIds) ||
    privateState.itemIds.length > 64 ||
    new Set(privateState.itemIds).size !== privateState.itemIds.length ||
    privateState.itemIds.some((itemId) => !UUID_PATTERN.test(String(itemId))) ||
    !Object.hasOwn(privateState, "terminalArchivedTombstone")
  ) {
    throw new Error("G12_PRODUCTION_RESIDUE_STATE_REFUSED");
  }
  if (recoveryNoTombstone) {
    if (stateTombstone !== null) throw new Error("G12_PRODUCTION_RESIDUE_RECOVERY_STATE_REFUSED");
  } else {
    const exactStateTombstone = record(stateTombstone, "G12_PRODUCTION_RESIDUE_STATE_REFUSED");
    if (
      JSON.stringify(Object.keys(exactStateTombstone)) !== JSON.stringify(["itemId"]) ||
      !UUID_PATTERN.test(String(exactStateTombstone.itemId ?? "")) ||
      !privateState.itemIds.includes(exactStateTombstone.itemId)
    ) {
      throw new Error("G12_PRODUCTION_RESIDUE_STATE_REFUSED");
    }
  }

  const cleanupReport = record(cleanup, "G12_PRODUCTION_RESIDUE_CLEANUP_EVIDENCE_REFUSED");
  if (
    cleanupReport.schemaVersion !== 1 ||
    cleanupReport.status !== "cleaned" ||
    cleanupReport.environment !== "production" ||
    cleanupReport.candidateSha !== candidateSha ||
    cleanupReport.runTag !== privateState.runTag ||
    cleanupReport.activeResidue !== 0 ||
    cleanupReport.auditRetained !== true
  ) {
    throw new Error("G12_PRODUCTION_RESIDUE_CLEANUP_EVIDENCE_REFUSED");
  }
  if (recoveryNoTombstone) {
    if (cleanupReport.terminalArchivedTombstone !== null) {
      throw new Error("G12_PRODUCTION_RESIDUE_RECOVERY_EVIDENCE_REFUSED");
    }
    exactNoSyntheticRouteClassification(
      cleanupReport.terminalNoSyntheticRoute,
      "G12_PRODUCTION_RESIDUE_RECOVERY_EVIDENCE_REFUSED",
    );
  } else {
    if (Object.hasOwn(cleanupReport, "terminalNoSyntheticRoute")) {
      throw new Error("G12_PRODUCTION_RESIDUE_CLEANUP_EVIDENCE_REFUSED");
    }
    exactTerminalClassification(
      cleanupReport.terminalArchivedTombstone,
      "G12_PRODUCTION_RESIDUE_CLEANUP_EVIDENCE_REFUSED",
    );
  }

  return {
    actorId: String(privateState.actorId),
    itemId: recoveryNoTombstone ? null : String(stateTombstone.itemId),
    path: recoveryNoTombstone ? null : expectedPath,
    runTag: String(privateState.runTag),
    recoveryNoTombstone,
  };
}

function literal(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function buildProductionTerminalResidueQuery(binding, candidateSha) {
  const actorId = literal(binding.actorId);
  const runTag = literal(binding.runTag);
  const sha = literal(candidateSha);
  const terminalSelection = binding.recoveryNoTombstone
    ? "false"
    : `route.item_id = ${literal(binding.itemId)}::uuid
        and route.source_path = ${literal(binding.path)}
        and private.cms_qa_terminal_archived_tombstone_is_exact(
          route.id, ${actorId}::uuid, ${runTag}, ${sha}, 'production'
        )`;
  return `with qa_actors as materialized (
      select actor.id, actor.banned_until
      from auth.users actor
      where actor.raw_user_meta_data -> 'synthetic' = 'true'::jsonb
        and actor.raw_user_meta_data ->> 'purpose' = 'qa-cms-browser'
        and actor.raw_user_meta_data ->> 'runTag' = ${runTag}
        and actor.raw_user_meta_data ->> 'candidateSha' = ${sha}
        and actor.raw_user_meta_data ->> 'environment' = 'production'
    ), qa_items as materialized (
      select item.id
      from public.cms_content_items item
      where item.created_by in (select id from qa_actors)
    ), qa_forms as materialized (
      select form.id
      from public.cms_form_definitions form
      where form.created_by in (select id from qa_actors)
        and form.form_key like ('qa-ops-' || lower(${runTag}) || '-%')
        and form.title = ${runTag} || ' Formulário operacional'
    ), terminal as materialized (
      select route.id
      from public.cms_route_rules route
      where ${terminalSelection}
    ) select
      (select count(*)::integer from qa_actors) as qa_actor_count,
      (select count(*)::integer from terminal) as terminal_tombstone_count,
      (select count(*)::integer from private.cms_qa_actor_leases lease
        where lease.candidate_sha = ${sha} and lease.environment = 'production'
          and lease.status = 'active') as active_leases,
      (select count(*)::integer from auth.sessions session
        where session.user_id in (select id from qa_actors)) as active_sessions,
      (select count(*)::integer from qa_actors actor
        where actor.banned_until is null or actor.banned_until <= clock_timestamp()) as active_credentials,
      (select count(*)::integer from public.cms_profiles profile
        where profile.user_id in (select id from qa_actors) and profile.status <> 'suspended') as active_profiles,
      (select count(*)::integer from public.cms_feature_flag_overrides override
        where override.scope_type = 'user' and override.scope_key in
          (select id::text from qa_actors)) as active_feature_overrides,
      (select count(*)::integer from public.cms_user_roles role
        where role.user_id in (select id from qa_actors)) as active_legacy_roles,
      (select count(*)::integer from public.cms_scoped_role_assignments role
        where (role.user_id in (select id from qa_actors)
          or role.granted_by in (select id from qa_actors)) and role.revoked_at is null) as active_scoped_roles,
      (select count(*)::integer from public.rdo_user_access access
        where access.user_id in (select id from qa_actors) and access.active) as active_rdo_access,
      (select count(*)::integer from public.cms_content_items item
        where item.id in (select id from qa_items) and item.workflow_status <> 'archived') as active_content,
      (select count(*)::integer from public.cms_publications publication
        where publication.item_id in (select id from qa_items)) as active_publications,
      (select count(*)::integer from public.cms_published_projection projection
        where projection.item_id in (select id from qa_items)) as published_projections,
      (select count(*)::integer from public.cms_route_rules route
        where route.item_id in (select id from qa_items) and route.active
          and route.id not in (select id from terminal)) as actionable_route_rules,
      (select count(*)::integer from public.cms_publication_outbox outbox
        where outbox.item_id in (select id from qa_items) and outbox.status <> 'completed')
        as actionable_publication_outbox,
      (select count(*)::integer from public.cms_leads lead
        where lead.form_id in (select id from qa_forms) and lead.anonymized_at is null) as active_leads,
      (select count(*)::integer from public.cms_lead_outbox outbox
        join public.cms_leads lead on lead.id = outbox.lead_id
        where lead.form_id in (select id from qa_forms)
          and outbox.status in ('pending','processing','failed','dead_letter')) as actionable_lead_outbox,
      (select count(*)::integer from public.cms_form_definitions form
        where form.id in (select id from qa_forms) and form.status <> 'retired') as active_forms,
      (select count(*)::integer from public.cms_ai_sessions session
        where session.actor_id in (select id from qa_actors) and session.status = 'active') as active_ai_sessions,
      (select count(*)::integer from public.cms_ai_synthetic_targets target
        where target.created_by in (select id from qa_actors) and target.lifecycle <> 'retired') as active_ai_targets,
      (select count(*)::integer from public.cms_ai_execution_plans plan
        where plan.created_by in (select id from qa_actors)
          and plan.status in ('ready','approved','executing')) as active_ai_plans,
      (select count(*)::integer from public.cms_ai_execution_approvals approval
        join public.cms_ai_execution_plans plan on plan.id = approval.plan_id
        where plan.created_by in (select id from qa_actors) and approval.status = 'active')
        as active_ai_approvals,
      (select count(*)::integer from public.cms_document_assets document
        where document.created_by in (select id from qa_actors)
          and document.source_kind = 'synthetic_test'
          and document.source_reference = ${runTag}
          and (document.processing_status <> 'neutralized'
            or document.blob_disposition = 'available'
            or document.upload_disposition not in ('guarded','removed'))) as active_documents,
      (select count(*)::integer from public.cms_audit_log audit
        where audit.target_type = 'qa_fixture' and audit.target_id = ${runTag}
          and audit.action in ('cms:qa.fixture_cleanup','cms:qa.fixture_lease_cleaned',
            'cms:qa.fixture_expired_cleanup')) as retained_cleanup_audits`;
}

export function assertProductionTerminalObservation(observation, { recoveryNoTombstone = false } = {}) {
  const value = record(observation, "G12_PRODUCTION_RESIDUE_REMOTE_CHECK_FAILED");
  if (
    !Number.isInteger(Number(value.qa_actor_count)) ||
    Number(value.qa_actor_count) < 1 ||
    Number(value.terminal_tombstone_count) !== (recoveryNoTombstone ? 0 : 1) ||
    Number(value.retained_cleanup_audits) < 1 ||
    ZERO_OBSERVATION_FIELDS.some((field) => Number(value[field]) !== 0)
  ) {
    throw new Error("G12_PRODUCTION_RESIDUE_REMOTE_CHECK_FAILED");
  }
  return {
    qaActorCount: Number(value.qa_actor_count),
    zeroCounts: Object.fromEntries(ZERO_OBSERVATION_FIELDS.map((field) => [field, 0])),
  };
}

export function createProductionTerminalResidueReport({
  candidateSha,
  runTag,
  observation,
  recoveryNoTombstone = false,
}) {
  if (
    !RUN_TAG_PATTERN.test(String(runTag ?? "")) ||
    !String(runTag).endsWith(`-${candidateSha.slice(0, 8)}`)
  ) {
    throw new Error("G12_PRODUCTION_RESIDUE_REPORT_BINDING_REFUSED");
  }
  const verified = assertProductionTerminalObservation(observation, { recoveryNoTombstone });
  return {
    schemaVersion: 1,
    event: "g12.production.synthetic_residue.verified",
    status: "passed",
    environment: "production",
    candidateSha,
    runTag,
    activeResidue: 0,
    activeLeases: 0,
    activeSessions: 0,
    actionableRouteRules: 0,
    actionablePublicationOutbox: 0,
    terminalArchivedTombstone: recoveryNoTombstone ? null : { ...TERMINAL_CLASSIFICATION },
    ...(recoveryNoTombstone ? { terminalNoSyntheticRoute: { ...NO_SYNTHETIC_ROUTE_CLASSIFICATION } } : {}),
    syntheticActorCount: verified.qaActorCount,
    auditRetained: true,
    identifiersOrPathsPersisted: false,
    verifiedAt: new Date().toISOString(),
  };
}

export { NO_SYNTHETIC_ROUTE_CLASSIFICATION, TERMINAL_CLASSIFICATION, ZERO_OBSERVATION_FIELDS };
