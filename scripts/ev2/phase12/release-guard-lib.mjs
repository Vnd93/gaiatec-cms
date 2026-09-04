export const FULL_SHA_PATTERN = /^[a-f0-9]{40}$/;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const G12_BUDGETS = Object.freeze({
  availabilityPercent: 99.9,
  http5xxRatePercent: 0.1,
  publicP95Ms: 1500,
  adminReadP95Ms: 500,
  commandP95Ms: 800,
  outboxLagP95Ms: 60_000,
});

export const ROLLOUT_STAGES = Object.freeze([
  "staging-canary",
  "production-shell",
  "production-1",
  "production-5",
  "production-25",
  "production-50",
  "production-100",
]);

const OWNER_ROLES = Object.freeze([
  "changeOwner",
  "technicalReviewer",
  "securityPrivacyOwner",
  "businessOwner",
]);

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const isIsoDate = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
const isMeaningful = (value) =>
  typeof value === "string" && value.trim().length >= 3 && !/^(pending|todo|placeholder|n\/a)$/i.test(value);

export function isFullSha(value) {
  return typeof value === "string" && FULL_SHA_PATTERN.test(value);
}

export function percentile(values, percentileValue) {
  if (!Array.isArray(values) || values.length === 0) return Number.NaN;
  const sorted = values.filter(isFiniteNumber).toSorted((left, right) => left - right);
  if (sorted.length === 0) return Number.NaN;
  const rank = Math.max(1, Math.ceil((percentileValue / 100) * sorted.length));
  return sorted[Math.min(rank - 1, sorted.length - 1)];
}

export function evaluateProbeWindow(evidence) {
  const violations = [];
  if (!isFullSha(evidence?.candidateSha)) violations.push("candidate_sha_invalid");
  if (!["local", "staging", "production-preview", "production"].includes(evidence?.environment))
    violations.push("environment_invalid");
  if (!Number.isInteger(evidence?.sampleCount) || evidence.sampleCount < 5)
    violations.push("sample_count_below_minimum");
  if (!isFiniteNumber(evidence?.availabilityPercent)) violations.push("availability_missing");
  else if (evidence.availabilityPercent < G12_BUDGETS.availabilityPercent)
    violations.push("availability_budget_exceeded");
  if (!isFiniteNumber(evidence?.http5xxRatePercent)) violations.push("http_5xx_rate_missing");
  else if (evidence.http5xxRatePercent > G12_BUDGETS.http5xxRatePercent)
    violations.push("http_5xx_budget_exceeded");
  if (!isFiniteNumber(evidence?.publicP95Ms)) violations.push("public_p95_missing");
  else if (evidence.publicP95Ms > G12_BUDGETS.publicP95Ms) violations.push("public_p95_budget_exceeded");
  if (evidence?.releaseHeadersExact !== true) violations.push("release_header_mismatch");
  if (evidence?.healthContractValid !== true) violations.push("health_contract_invalid");
  if (evidence?.manifestReleaseExact !== true) violations.push("manifest_release_mismatch");
  if (evidence?.nonProductionNoindexValid !== true) violations.push("noindex_boundary_invalid");
  return { healthy: violations.length === 0, violations };
}

export function evaluateRolloutWindow(evidence) {
  const probe = evaluateProbeWindow(evidence);
  const violations = [...probe.violations];
  if (!ROLLOUT_STAGES.includes(evidence?.stage)) violations.push("stage_invalid");
  if (!isIsoDate(evidence?.startedAt) || !isIsoDate(evidence?.endedAt)) {
    violations.push("window_timestamp_invalid");
  } else if (Date.parse(evidence.endedAt) <= Date.parse(evidence.startedAt)) {
    violations.push("window_not_positive");
  }
  if (evidence?.p0Count !== 0) violations.push("p0_present");
  if (evidence?.p1Count !== 0) violations.push("p1_present");
  if (evidence?.securityIncidentCount !== 0) violations.push("security_incident_present");
  if (evidence?.projectionDivergenceCount !== 0) violations.push("projection_divergence_present");
  if (evidence?.accessibilityCriticalCount !== 0 || evidence?.accessibilitySeriousCount !== 0)
    violations.push("accessibility_regression_present");
  if (evidence?.securityReviewStatus !== "passed") violations.push("security_review_not_passed");
  if (evidence?.privacyReviewStatus !== "passed") violations.push("privacy_review_not_passed");
  if (evidence?.projectionComparisonStatus !== "passed") violations.push("projection_comparison_not_passed");
  if (evidence?.restoreStatus !== "passed") violations.push("restore_not_passed");

  for (const [field, limit] of [
    ["adminReadP95Ms", G12_BUDGETS.adminReadP95Ms],
    ["commandP95Ms", G12_BUDGETS.commandP95Ms],
    ["outboxLagP95Ms", G12_BUDGETS.outboxLagP95Ms],
  ]) {
    if (!isFiniteNumber(evidence?.[field])) violations.push(`${field}_missing`);
    else if (evidence[field] > limit) violations.push(`${field}_budget_exceeded`);
  }

  return {
    healthy: violations.length === 0,
    decision: violations.length === 0 ? "continue" : "pause",
    violations,
  };
}

export function evaluateRolloutAdvance({ candidateSha, currentStage, nextStage, windows }) {
  const violations = [];
  const currentIndex = ROLLOUT_STAGES.indexOf(currentStage);
  const nextIndex = ROLLOUT_STAGES.indexOf(nextStage);
  if (!isFullSha(candidateSha)) violations.push("candidate_sha_invalid");
  if (currentIndex < 0 || nextIndex !== currentIndex + 1) violations.push("stage_skip_or_regression");
  if (!Array.isArray(windows) || windows.length < 3) violations.push("three_windows_required");

  const selected = Array.isArray(windows) ? windows.slice(-3) : [];
  let previousEnd = 0;
  for (const window of selected) {
    const result = evaluateRolloutWindow(window);
    if (window?.candidateSha !== candidateSha) violations.push("window_candidate_mismatch");
    if (window?.stage !== currentStage) violations.push("window_stage_mismatch");
    if (!result.healthy) violations.push(...result.violations.map((item) => `window_${item}`));
    const startedAt = Date.parse(window?.startedAt ?? "");
    const endedAt = Date.parse(window?.endedAt ?? "");
    if (!Number.isFinite(startedAt) || startedAt < previousEnd) violations.push("windows_not_consecutive");
    if (Number.isFinite(endedAt)) previousEnd = endedAt;
  }

  const uniqueViolations = [...new Set(violations)];
  return {
    allowed: uniqueViolations.length === 0,
    decision: uniqueViolations.length === 0 ? "advance" : "pause",
    violations: uniqueViolations,
  };
}

export function validateApprovalRecord(
  record,
  { expectedSha, expectedEnvironment, expectedChangeReference, now } = {},
) {
  const violations = [];
  if (record?.schemaVersion !== 1) violations.push("schema_version_invalid");
  if (record?.gate !== "G12") violations.push("gate_invalid");
  if (record?.decision !== "approved") violations.push("decision_not_approved");
  if (!isFullSha(record?.candidateSha)) violations.push("candidate_sha_invalid");
  if (expectedSha && record?.candidateSha !== expectedSha) violations.push("candidate_sha_mismatch");
  if (!["staging", "production"].includes(record?.environment)) violations.push("environment_invalid");
  if (expectedEnvironment && record?.environment !== expectedEnvironment)
    violations.push("environment_mismatch");
  if (!isMeaningful(record?.changeReference)) violations.push("change_reference_invalid");
  if (expectedChangeReference && record?.changeReference !== expectedChangeReference)
    violations.push("change_reference_mismatch");
  if (!UUID_PATTERN.test(record?.g11EvidenceRunId ?? "")) violations.push("g11_evidence_invalid");
  if (!isMeaningful(record?.requestedBy)) violations.push("requester_invalid");
  if (!UUID_PATTERN.test(record?.g12Evidence?.canaryRunId ?? ""))
    violations.push("g12_canary_evidence_invalid");
  if (record?.g12Evidence?.candidateSha !== record?.candidateSha)
    violations.push("g12_evidence_candidate_mismatch");
  if (!/^[a-f0-9]{64}$/.test(record?.g12Evidence?.reportSha256 ?? ""))
    violations.push("g12_evidence_digest_invalid");
  const healthyWindowIds = record?.g12Evidence?.healthyWindowIds;
  if (
    !Array.isArray(healthyWindowIds) ||
    healthyWindowIds.length !== 3 ||
    healthyWindowIds.some((id) => !UUID_PATTERN.test(id)) ||
    new Set(healthyWindowIds).size !== 3
  )
    violations.push("three_healthy_window_evidences_required");
  if (record?.g12Evidence?.syntheticOnly !== true || record?.g12Evidence?.realDataUsed !== false)
    violations.push("g12_canary_data_boundary_invalid");
  if (record?.g12Evidence?.productionMutations !== 0)
    violations.push("g12_canary_production_boundary_invalid");

  const ownerIds = [];
  for (const role of OWNER_ROLES) {
    const owner = record?.owners?.[role];
    if (!isMeaningful(owner?.id)) violations.push(`${role}_invalid`);
    else ownerIds.push(owner.id.trim().toLowerCase());
    if (!isIsoDate(owner?.approvedAt)) violations.push(`${role}_approval_time_invalid`);
  }
  if (ownerIds.length === OWNER_ROLES.length && new Set(ownerIds).size !== OWNER_ROLES.length)
    violations.push("owner_separation_required");

  if (!UUID_PATTERN.test(record?.rollback?.deploymentId ?? ""))
    violations.push("rollback_deployment_invalid");
  if (!isFullSha(record?.rollback?.release)) violations.push("rollback_release_invalid");
  if (!isIsoDate(record?.changeWindow?.startsAt) || !isIsoDate(record?.changeWindow?.endsAt)) {
    violations.push("change_window_invalid");
  } else {
    const startsAt = Date.parse(record.changeWindow.startsAt);
    const endsAt = Date.parse(record.changeWindow.endsAt);
    if (endsAt <= startsAt) violations.push("change_window_not_positive");
    if (now) {
      const current = now instanceof Date ? now.getTime() : Date.parse(now);
      if (!Number.isFinite(current) || current < startsAt || current > endsAt)
        violations.push("outside_change_window");
    }
  }

  if (record?.environment === "production") {
    if (record?.productionAuthorized !== true) violations.push("production_not_authorized");
    if (record?.productionAuthorizationText !== "AUTORIZO-G12-PRODUCAO")
      violations.push("production_authorization_text_invalid");
    if (record?.dpoLegalStatus !== "approved") violations.push("dpo_legal_not_approved");
    if (record?.target?.cloudflareProject !== "gaiatec-website")
      violations.push("production_project_invalid");
    const domains = record?.target?.domains;
    if (
      !Array.isArray(domains) ||
      domains.length !== 2 ||
      !domains.includes("gaiatecsistemas.com.br") ||
      !domains.includes("www.gaiatecsistemas.com.br") ||
      domains.some((domain) => domain.includes("pages.dev"))
    )
      violations.push("production_domains_invalid");
  }

  const uniqueViolations = [...new Set(violations)];
  return { valid: uniqueViolations.length === 0, violations: uniqueViolations };
}

export function evaluateGithubControls({ environment, branchProtection }) {
  const violations = [];
  const reviewerRule = environment?.protection_rules?.find((rule) => rule.type === "required_reviewers");
  if (!reviewerRule || !Array.isArray(reviewerRule.reviewers) || reviewerRule.reviewers.length < 2)
    violations.push("two_environment_reviewers_required");
  if (reviewerRule?.prevent_self_review !== true) violations.push("prevent_self_review_required");
  if (
    environment?.deployment_branch_policy?.protected_branches !== true ||
    environment?.deployment_branch_policy?.custom_branch_policies !== false
  )
    violations.push("environment_protected_branches_only_required");
  if (branchProtection?.required_status_checks?.strict !== true)
    violations.push("strict_status_checks_required");
  if (branchProtection?.required_pull_request_reviews?.required_approving_review_count < 1)
    violations.push("pull_request_review_required");
  if (branchProtection?.enforce_admins?.enabled !== true) violations.push("admin_enforcement_required");
  const contexts = new Set([
    ...(branchProtection?.required_status_checks?.contexts ?? []),
    ...(branchProtection?.required_status_checks?.checks ?? []).map((check) => check.context),
  ]);
  for (const required of ["quality", "database", "browser"])
    if (!contexts.has(required)) violations.push(`required_check_${required}_missing`);
  if (branchProtection?.allow_force_pushes?.enabled !== false) violations.push("force_push_must_be_disabled");
  if (branchProtection?.allow_deletions?.enabled !== false)
    violations.push("branch_deletion_must_be_disabled");
  return { valid: violations.length === 0, violations };
}

export function validateProductionConfig(config) {
  const violations = [];
  const stagingRef = "glcqsosxwgmlhzgcsnzv";
  if (!/^[a-z]{20}$/.test(config?.supabaseProjectRef ?? "")) violations.push("supabase_project_ref_invalid");
  if (config?.supabaseProjectRef === stagingRef) violations.push("staging_project_ref_forbidden");
  let supabaseHostname = "";
  try {
    const url = new URL(config?.supabaseUrl);
    if (url.protocol !== "https:" || url.pathname !== "/") violations.push("supabase_url_invalid");
    supabaseHostname = url.hostname;
  } catch {
    violations.push("supabase_url_invalid");
  }
  if (supabaseHostname !== `${config?.supabaseProjectRef}.supabase.co`)
    violations.push("supabase_url_project_mismatch");
  if (
    typeof config?.supabaseAnonKey !== "string" ||
    config.supabaseAnonKey.length < 20 ||
    /placeholder|cole|pending/i.test(config.supabaseAnonKey)
  )
    violations.push("supabase_anon_key_invalid");
  if (config?.siteOrigin !== "https://gaiatecsistemas.com.br") violations.push("site_origin_invalid");
  if (config?.cloudflareProject !== "gaiatec-website") violations.push("cloudflare_project_invalid");
  return { valid: violations.length === 0, violations };
}
