import { createHash } from "node:crypto";
import { GITHUB_SOLE_MAINTAINER, validateProductionReadinessControls } from "../phase16/readiness-lib.mjs";
import {
  RELEASE_EVIDENCE_REPOSITORY,
  STAGING_WORKFLOW_NAME,
  STAGING_WORKFLOW_PATH,
} from "./production-prerequisite-gate-lib.mjs";

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
const OPERATIONAL_GOVERNANCE_MODE = "sole-operator";
const G12_EVIDENCE_BASENAME = "(G12_CANARY_[a-f0-9_-]+\\.json)";
const CURRENT_G12_EVIDENCE_PATTERN = new RegExp(
  `^\\.github/release-controls/evidence/${G12_EVIDENCE_BASENAME}$`,
);
const HISTORICAL_G12_EVIDENCE_PATTERN = new RegExp(`^docs/ev2/fase-12/evidencias/${G12_EVIDENCE_BASENAME}$`);
const G16_CSP_EVIDENCE_BASENAME = "(G16_CSP_BROWSER_[a-f0-9_-]+\\.json)";
const CURRENT_G16_CSP_EVIDENCE_PATTERN = new RegExp(
  `^\\.github/release-controls/evidence/${G16_CSP_EVIDENCE_BASENAME}$`,
);
export const HISTORICAL_G16_CSP_EVIDENCE_REFERENCE =
  "docs/ev2/fase-16/evidencias/G16_CSP_BROWSER_e52b25d.json";
export const HISTORICAL_G16_CSP_CANDIDATE_SHA = "e52b25d903251cf538918d89049a58524c3c9911";
export const HISTORICAL_G16_CSP_EVIDENCE_SHA256 =
  "8edf047f0eb5da2412c7246978ef831f075e9ddf875ca4e360b421e55800e9bc";
const HISTORICAL_G12_CANDIDATE_SHA = "e52b25d903251cf538918d89049a58524c3c9911";
const HISTORICAL_G12_EVIDENCE_FILE = "docs/ev2/fase-12/evidencias/G12_CANARY_e52b25d_2026-09-05.json";
const HISTORICAL_G12_EVIDENCE_SHA256 = "88411f10217bdcdf08395adea2f73412de38163c2e3a80ef0e8f9a7d41b34299";
export const HISTORICAL_DPO_EVIDENCE_REFERENCE =
  "docs/ev2/fase-16/REGISTRO_DECLARACAO_GOVERNANCA_DPO_RISCO_2026-09-05.md";
export const CANONICAL_DPO_DOCUMENT_PATH =
  "docs/80-evolucao/ev2/fase-16/registro-declaracao-governanca-dpo-risco-2026-09-06.md";
const CANONICAL_DPO_URL_PREFIX = "https://github.com/Vnd93/gaiatec-documentacao/blob/";
export const CANONICAL_DOCUMENTATION_SHA = "bf03cbefc2e9d6ac343270530920c1ff83f0ae33";
export const CANONICAL_DPO_EVIDENCE_REFERENCE = `${CANONICAL_DPO_URL_PREFIX}${CANONICAL_DOCUMENTATION_SHA}/${CANONICAL_DPO_DOCUMENT_PATH}`;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
export const CSP_CANARY_ROUTES = Object.freeze(["/", "/contato", "/relatorio-de-obra/login", "/admin/login"]);
const CSP_CANARY_ORIGIN_PATTERN =
  /^https:\/\/(?:ev2-g16-csp-canary|[a-f0-9]{8,40})\.gaiatec-cms-staging\.pages\.dev$/;

function currentCspEvidencePath(candidateSha) {
  if (!isFullSha(candidateSha)) return null;
  return `.github/release-controls/evidence/G16_CSP_BROWSER_${candidateSha.slice(0, 7)}.json`;
}

export function buildPinnedDpoEvidenceReference(documentationSha) {
  if (!isFullSha(documentationSha)) return null;
  return `${CANONICAL_DPO_URL_PREFIX}${documentationSha}/${CANONICAL_DPO_DOCUMENT_PATH}`;
}

export function resolveDpoEvidenceReference(
  identifier,
  { documentationSha = CANONICAL_DOCUMENTATION_SHA, candidateSha } = {},
) {
  const canonicalReference = buildPinnedDpoEvidenceReference(documentationSha);
  if (!canonicalReference) return null;
  if (identifier === canonicalReference) return canonicalReference;
  if (identifier === HISTORICAL_DPO_EVIDENCE_REFERENCE && candidateSha === HISTORICAL_G16_CSP_CANDIDATE_SHA)
    return canonicalReference;
  return null;
}

export function resolveCspEvidenceBinding(control) {
  const identifier = control?.evidenceReference;
  const candidateSha = control?.candidateSha;
  const currentPath = currentCspEvidencePath(candidateSha);
  if (!currentPath) return null;

  if (identifier === HISTORICAL_G16_CSP_EVIDENCE_REFERENCE) {
    if (
      candidateSha !== HISTORICAL_G16_CSP_CANDIDATE_SHA ||
      (control?.evidenceSha256 !== undefined && control.evidenceSha256 !== HISTORICAL_G16_CSP_EVIDENCE_SHA256)
    )
      return null;
    return {
      repositoryPath: currentPath,
      evidenceSha256: HISTORICAL_G16_CSP_EVIDENCE_SHA256,
      historicalFallback: true,
    };
  }

  if (identifier !== currentPath || !SHA256_PATTERN.test(control?.evidenceSha256 ?? "")) return null;
  return {
    repositoryPath: currentPath,
    evidenceSha256: control.evidenceSha256,
    historicalFallback: false,
  };
}

export function validateCspEvidenceBinding(
  control,
  evidence,
  { reportSha256, expectedPolicySha256, expectedAdminPolicySha256 } = {},
) {
  const violations = [];
  const binding = resolveCspEvidenceBinding(control);
  const embeddedPolicyRequired = binding?.historicalFallback !== true;
  const expectedAdminPolicy = expectedAdminPolicySha256 ?? expectedPolicySha256;
  if (!binding) violations.push("csp_evidence_reference_or_digest_invalid");
  else if (reportSha256 !== binding.evidenceSha256) violations.push("csp_evidence_digest_mismatch");
  if (!SHA256_PATTERN.test(expectedPolicySha256 ?? "") || control?.policySha256 !== expectedPolicySha256)
    violations.push("csp_policy_digest_mismatch");
  if (
    !SHA256_PATTERN.test(expectedAdminPolicy ?? "") ||
    (embeddedPolicyRequired && control?.adminPolicySha256 !== expectedAdminPolicy)
  )
    violations.push("csp_admin_policy_digest_mismatch");
  if (evidence?.schemaVersion !== 1) violations.push("csp_evidence_schema_invalid");
  if (evidence?.event !== "ev2.phase16.csp.browser-canary") violations.push("csp_evidence_event_invalid");
  if (!CSP_CANARY_ORIGIN_PATTERN.test(evidence?.origin ?? "")) violations.push("csp_evidence_origin_invalid");
  if (!isIsoDate(evidence?.executedAt)) violations.push("csp_evidence_timestamp_invalid");
  if (evidence?.candidateSha !== control?.candidateSha) violations.push("csp_evidence_candidate_mismatch");
  if (
    evidence?.outcome !== "pass" ||
    evidence?.criticalViolations !== 0 ||
    evidence?.realDataUsed !== false ||
    evidence?.productionMutations !== 0
  )
    violations.push("csp_evidence_outcome_invalid");

  const routes = Array.isArray(evidence?.routes) ? evidence.routes : [];
  if (
    routes.length !== CSP_CANARY_ROUTES.length ||
    routes.some((route, index) => route?.path !== CSP_CANARY_ROUTES[index])
  )
    violations.push("csp_evidence_routes_invalid");
  for (const route of routes) {
    if (route?.status !== 200) violations.push("csp_evidence_route_status_invalid");
    if (route?.release !== control?.candidateSha) violations.push("csp_evidence_route_release_invalid");
    if (route?.cspEnforced !== true) violations.push("csp_evidence_route_enforcement_invalid");
    if (!Array.isArray(route?.violations) || route.violations.length !== 0)
      violations.push("csp_evidence_route_violations_present");
  }

  if (
    (embeddedPolicyRequired || evidence?.policySha256 !== undefined) &&
    evidence?.policySha256 !== expectedPolicySha256
  )
    violations.push("csp_evidence_policy_digest_mismatch");
  if (
    (embeddedPolicyRequired || evidence?.adminPolicySha256 !== undefined) &&
    evidence?.adminPolicySha256 !==
      (binding?.historicalFallback === true ? expectedPolicySha256 : expectedAdminPolicy)
  )
    violations.push("csp_evidence_admin_policy_digest_mismatch");
  for (const route of routes) {
    const expectedRoutePolicy =
      binding?.historicalFallback === true || route?.path !== "/admin/login"
        ? expectedPolicySha256
        : expectedAdminPolicy;
    if (
      (embeddedPolicyRequired || route?.policySha256 !== undefined) &&
      route?.policySha256 !== expectedRoutePolicy
    )
      violations.push("csp_evidence_route_policy_digest_mismatch");
  }

  const uniqueViolations = [...new Set(violations)];
  return { valid: uniqueViolations.length === 0, violations: uniqueViolations, binding };
}

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const isIsoDate = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
const isMeaningful = (value) =>
  typeof value === "string" && value.trim().length >= 3 && !/^(pending|todo|placeholder|n\/a)$/i.test(value);

export function isFullSha(value) {
  return typeof value === "string" && FULL_SHA_PATTERN.test(value);
}

export function canonicalTextSha256(value) {
  const text = Buffer.isBuffer(value) ? value.toString("utf8") : String(value);
  return createHash("sha256").update(text.replace(/\r\n?/g, "\n"), "utf8").digest("hex");
}

export function resolveG12EvidenceRepositoryPath(identifier) {
  if (typeof identifier !== "string") return null;
  const match =
    identifier.match(CURRENT_G12_EVIDENCE_PATTERN) ?? identifier.match(HISTORICAL_G12_EVIDENCE_PATTERN);
  return match ? `.github/release-controls/evidence/${match[1]}` : null;
}

export function approvalRecordFilenameMatchesCandidate(identifier, candidateSha) {
  if (typeof identifier !== "string" || !isFullSha(candidateSha)) return false;
  const basename = identifier.split("/").at(-1);
  const match = basename?.match(/^G12_([a-f0-9]{40})\.json$/);
  return match?.[1] === candidateSha;
}

export function resolveCspEvidenceRepositoryPath(identifier) {
  if (typeof identifier !== "string") return null;
  if (identifier === HISTORICAL_G16_CSP_EVIDENCE_REFERENCE)
    return ".github/release-controls/evidence/G16_CSP_BROWSER_e52b25d.json";
  const match = identifier.match(CURRENT_G16_CSP_EVIDENCE_PATTERN);
  return match ? `.github/release-controls/evidence/${match[1]}` : null;
}

export function validateReleaseManifest(manifest, { expectedRelease } = {}) {
  const violations = [];
  if (manifest?.schemaVersion !== 1) violations.push("manifest_schema_invalid");
  if (!isFullSha(manifest?.release)) violations.push("manifest_release_invalid");
  else if (expectedRelease && manifest.release !== expectedRelease)
    violations.push("manifest_release_mismatch");
  if (!Array.isArray(manifest?.files) || manifest.files.length === 0) {
    violations.push("manifest_files_invalid");
  } else {
    const paths = new Set();
    for (const file of manifest.files) {
      const pathValid =
        typeof file?.path === "string" &&
        file.path.length > 0 &&
        !file.path.startsWith("/") &&
        !file.path.includes("\\") &&
        !file.path.includes(":") &&
        ![...file.path].some((character) => character.charCodeAt(0) < 0x20) &&
        file.path.split("/").every((segment) => segment && segment !== "." && segment !== "..");
      if (
        !pathValid ||
        !Number.isSafeInteger(file?.bytes) ||
        file.bytes < 0 ||
        !/^[a-f0-9]{64}$/.test(file?.sha256 ?? "")
      )
        violations.push("manifest_file_entry_invalid");
      if (pathValid) {
        if (paths.has(file.path)) violations.push("manifest_file_path_duplicate");
        paths.add(file.path);
      }
    }
  }
  const uniqueViolations = [...new Set(violations)];
  return { valid: uniqueViolations.length === 0, violations: uniqueViolations };
}

export function validateHealthContract(health, { expectedRelease, expectedEnvironment } = {}) {
  const violations = [];
  if (health?.schemaVersion !== 1) violations.push("health_schema_invalid");
  if (health?.status !== "ready") violations.push("health_status_invalid");
  if (!isFullSha(health?.release)) violations.push("health_release_invalid");
  else if (expectedRelease && health.release !== expectedRelease) violations.push("health_release_mismatch");
  if (!["local", "staging", "production-preview", "production"].includes(health?.environment))
    violations.push("health_environment_invalid");
  else if (expectedEnvironment && health.environment !== expectedEnvironment)
    violations.push("health_environment_mismatch");
  const uniqueViolations = [...new Set(violations)];
  return { valid: uniqueViolations.length === 0, violations: uniqueViolations };
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
  if (evidence?.routeBudgetsValid !== true) violations.push("route_latency_budget_exceeded");
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
  if (![2, 3].includes(record?.schemaVersion)) violations.push("schema_version_invalid");
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
  else if (record.requestedBy.trim().toLowerCase() !== GITHUB_SOLE_MAINTAINER)
    violations.push("requester_must_match_sole_operator");
  if (!UUID_PATTERN.test(record?.g12Evidence?.canaryRunId ?? ""))
    violations.push("g12_canary_evidence_invalid");
  if (record?.g12Evidence?.candidateSha !== record?.candidateSha)
    violations.push("g12_evidence_candidate_mismatch");
  if (!/^[a-f0-9]{64}$/.test(record?.g12Evidence?.reportSha256 ?? ""))
    violations.push("g12_evidence_digest_invalid");
  if (!resolveG12EvidenceRepositoryPath(record?.g12Evidence?.file))
    violations.push("g12_evidence_file_invalid");
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
  if (record?.schemaVersion === 3) {
    const staging = record?.g12Evidence;
    if (staging?.repository !== RELEASE_EVIDENCE_REPOSITORY)
      violations.push("g12_staging_repository_invalid");
    if (staging?.workflow !== STAGING_WORKFLOW_PATH || staging?.workflowName !== STAGING_WORKFLOW_NAME)
      violations.push("g12_staging_workflow_invalid");
    if (!/^[1-9]\d{5,19}$/.test(staging?.runId ?? "") || !Number.isSafeInteger(staging?.runAttempt))
      violations.push("g12_staging_run_invalid");
    if (
      staging?.event !== "workflow_dispatch" ||
      staging?.ref !== "refs/heads/main" ||
      staging?.headSha !== record?.candidateSha
    )
      violations.push("g12_staging_candidate_binding_invalid");
    if (!isIsoDate(staging?.completedAt)) violations.push("g12_staging_completed_at_invalid");
    if (staging?.artifactName !== `staging-${record?.candidateSha}`)
      violations.push("g12_staging_artifact_name_invalid");
    if (!/^[1-9]\d{5,19}$/.test(staging?.artifactId ?? ""))
      violations.push("g12_staging_artifact_id_invalid");
    if (!/^sha256:[a-f0-9]{64}$/.test(staging?.artifactDigest ?? ""))
      violations.push("g12_staging_artifact_digest_invalid");
    if (
      staging?.candidateArtifactName !==
      `staging-candidate-${record?.candidateSha}-${staging?.runId}-${staging?.runAttempt}`
    )
      violations.push("g12_staging_candidate_artifact_name_invalid");
    if (!/^[1-9]\d{5,19}$/.test(staging?.candidateArtifactId ?? ""))
      violations.push("g12_staging_candidate_artifact_id_invalid");
    if (!/^sha256:[a-f0-9]{64}$/.test(staging?.candidateArtifactDigest ?? ""))
      violations.push("g12_staging_candidate_artifact_digest_invalid");
    if (
      !SHA256_PATTERN.test(staging?.candidateArchiveSha256 ?? "") ||
      !SHA256_PATTERN.test(staging?.candidateTreeSha256 ?? "")
    )
      violations.push("g12_staging_candidate_seal_invalid");
  }

  const operationalGovernance = record?.operationalGovernance;
  if (operationalGovernance?.mode !== OPERATIONAL_GOVERNANCE_MODE)
    violations.push("operational_governance_mode_invalid");
  if (
    String(operationalGovernance?.responsibleId ?? "")
      .trim()
      .toLowerCase() !== GITHUB_SOLE_MAINTAINER
  )
    violations.push("operational_responsible_invalid");
  if (operationalGovernance?.riskAccepted !== true) violations.push("sole_operator_risk_not_accepted");
  if (!isIsoDate(operationalGovernance?.acceptedAt)) violations.push("sole_operator_acceptance_time_invalid");
  if (
    !resolveDpoEvidenceReference(operationalGovernance?.evidenceReference, {
      candidateSha: record?.candidateSha,
    })
  )
    violations.push("sole_operator_evidence_invalid");

  for (const role of OWNER_ROLES) {
    const owner = record?.owners?.[role];
    if (!isMeaningful(owner?.id)) violations.push(`${role}_invalid`);
    else if (owner.id.trim().toLowerCase() !== GITHUB_SOLE_MAINTAINER)
      violations.push(`${role}_must_match_sole_operator`);
    if (!isIsoDate(owner?.approvedAt)) violations.push(`${role}_approval_time_invalid`);
    if (!isMeaningful(owner?.evidenceReference)) violations.push(`${role}_evidence_invalid`);
  }

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
    if (record?.productionAuthorizationSha !== record?.candidateSha)
      violations.push("production_authorization_sha_mismatch");
    if (record?.productionAuthorizationText !== `AUTORIZO-G12-PRODUCAO:${record?.candidateSha}`)
      violations.push("production_authorization_text_invalid");
    if (!isMeaningful(record?.productionAuthorizedBy)) violations.push("production_authorizer_invalid");
    else if (record.productionAuthorizedBy.trim().toLowerCase() !== GITHUB_SOLE_MAINTAINER)
      violations.push("production_authorizer_must_match_sole_operator");
    if (!isIsoDate(record?.productionAuthorizedAt)) violations.push("production_authorization_time_invalid");
    if (record?.schemaVersion === 3) {
      const stagingCompletedAt = Date.parse(record?.g12Evidence?.completedAt ?? "");
      const backupEvidenceAt = Date.parse(record?.productionReadiness?.backupRestore?.completedAt ?? "");
      const backupCompletedAt = Date.parse(record?.productionReadiness?.backupRestore?.runCompletedAt ?? "");
      const emailVerifiedAt = Date.parse(record?.productionReadiness?.emailProvider?.verifiedAt ?? "");
      const emailCompletedAt = Date.parse(record?.productionReadiness?.emailProvider?.runCompletedAt ?? "");
      const authorizationAt = Date.parse(record?.productionAuthorizedAt ?? "");
      if (
        ![
          stagingCompletedAt,
          backupEvidenceAt,
          backupCompletedAt,
          emailVerifiedAt,
          emailCompletedAt,
          authorizationAt,
        ].every(Number.isFinite) ||
        stagingCompletedAt > backupEvidenceAt ||
        backupEvidenceAt > backupCompletedAt ||
        backupCompletedAt > emailVerifiedAt ||
        emailVerifiedAt > emailCompletedAt ||
        emailCompletedAt > authorizationAt
      )
        violations.push("production_prerequisite_chronology_invalid");
    }
    if (record?.target?.cloudflareProject !== "gaiatec-website")
      violations.push("production_project_invalid");
    if (
      record?.schemaVersion === 3 &&
      (!/^[a-f0-9]{32}$/.test(record?.target?.cloudflareAccountId ?? "") ||
        !/^[a-f0-9]{32}$/.test(record?.target?.cloudflareZoneId ?? "") ||
        !/^[a-f0-9]{32}$/.test(record?.target?.cachePurgeTokenId ?? ""))
    )
      violations.push("production_cloudflare_identity_invalid");
    const domains = record?.target?.domains;
    if (
      !Array.isArray(domains) ||
      domains.length !== 2 ||
      !domains.includes("gaiatecsistemas.com.br") ||
      !domains.includes("www.gaiatecsistemas.com.br") ||
      domains.some((domain) => domain.includes("pages.dev"))
    )
      violations.push("production_domains_invalid");
    const readiness = validateProductionReadinessControls(record?.productionReadiness, {
      candidateSha: record?.candidateSha,
      approvalSchemaVersion: record?.schemaVersion,
    });
    violations.push(...readiness.violations.map((item) => `readiness_${item}`));
    if (
      !resolveDpoEvidenceReference(record?.productionReadiness?.dpoLegal?.evidenceReference, {
        candidateSha: record?.candidateSha,
      })
    )
      violations.push("readiness_dpo_legal_evidence_invalid");
    if (!resolveCspEvidenceBinding(record?.productionReadiness?.csp))
      violations.push("readiness_csp_evidence_binding_invalid");
  }

  const uniqueViolations = [...new Set(violations)];
  return { valid: uniqueViolations.length === 0, violations: uniqueViolations };
}

export function validateCanaryEvidenceBinding(record, evidence, { reportSha256 } = {}) {
  const violations = [];
  const expected = record?.g12Evidence;
  const isPinnedHistoricalEvidence =
    record?.candidateSha === HISTORICAL_G12_CANDIDATE_SHA &&
    expected?.file === HISTORICAL_G12_EVIDENCE_FILE &&
    expected?.reportSha256 === HISTORICAL_G12_EVIDENCE_SHA256 &&
    reportSha256 === HISTORICAL_G12_EVIDENCE_SHA256;
  if (!/^[a-f0-9]{64}$/.test(reportSha256 ?? "") || reportSha256 !== expected?.reportSha256)
    violations.push("g12_evidence_digest_mismatch");
  if (evidence?.schemaVersion !== 1) violations.push("g12_report_schema_invalid");
  if (evidence?.outcome !== "G12_CANARY_PASS") violations.push("g12_report_outcome_invalid");
  if (evidence?.suiteKey !== "g12-staging-integrated-reduced-v2") violations.push("g12_report_suite_invalid");
  if (evidence?.environment !== "staging") violations.push("g12_report_environment_invalid");
  if (evidence?.candidateSha !== record?.candidateSha) violations.push("g12_report_candidate_mismatch");
  if (evidence?.canaryRunId !== expected?.canaryRunId) violations.push("g12_report_run_mismatch");
  if (
    !isIsoDate(evidence?.startedAt) ||
    !isIsoDate(evidence?.finishedAt) ||
    Date.parse(evidence?.finishedAt ?? "") <= Date.parse(evidence?.startedAt ?? "") ||
    (record?.schemaVersion === 3 &&
      Date.parse(evidence?.finishedAt ?? "") > Date.parse(expected?.completedAt ?? ""))
  )
    violations.push("g12_report_timeline_invalid");
  if (evidence?.g11AssuranceRunId !== record?.g11EvidenceRunId) violations.push("g11_report_run_mismatch");
  if (
    evidence?.candidateOrigin !== "https://ev2-g12-canary.gaiatec-cms-staging.pages.dev" ||
    evidence?.stableOrigin !== "https://gaiatec-cms-staging.pages.dev"
  )
    violations.push("g12_report_origin_invalid");
  if (
    evidence?.syntheticOnly !== true ||
    evidence?.realDataUsed !== false ||
    evidence?.productionMutations !== 0 ||
    evidence?.stablePromoted !== false
  )
    violations.push("g12_report_boundary_invalid");
  if (
    evidence?.p0Count !== 0 ||
    evidence?.p1Count !== 0 ||
    evidence?.securityStatus !== "passed" ||
    evidence?.restoreStatus !== "passed"
  )
    violations.push("g12_report_assurance_invalid");
  if (
    !Number.isInteger(evidence?.inheritedG11Checks) ||
    evidence.inheritedG11Checks <= 0 ||
    evidence?.inheritedG11Passed !== evidence.inheritedG11Checks
  )
    violations.push("g11_inherited_checks_invalid");

  const residue = evidence?.syntheticResidue;
  if (
    !residue ||
    residue.activeActors !== 0 ||
    residue.activeCredentials !== 0 ||
    residue.activeOverrides !== 0 ||
    residue.personalLeadPayloads !== 0
  )
    violations.push("g12_active_synthetic_residue_present");

  const windows = Array.isArray(evidence?.healthyWindows) ? evidence.healthyWindows : [];
  const expectedIds = Array.isArray(expected?.healthyWindowIds) ? expected.healthyWindowIds : [];
  if (
    windows.length !== 3 ||
    expectedIds.length !== 3 ||
    windows.some((window, index) => window?.id !== expectedIds[index])
  )
    violations.push("g12_window_binding_mismatch");
  let previousEnd = 0;
  for (const window of windows) {
    const startedAt = Date.parse(window?.startedAt ?? "");
    const endedAt = Date.parse(window?.endedAt ?? "");
    const probe = window?.probe;
    const probeIsObject = probe !== null && typeof probe === "object" && !Array.isArray(probe);
    let probeHash = "";
    if (probeIsObject) {
      try {
        probeHash = createHash("sha256").update(JSON.stringify(probe)).digest("hex");
      } catch {
        violations.push("g12_window_probe_invalid");
      }
    } else {
      violations.push("g12_window_probe_missing");
    }
    if (probeHash !== window?.evidenceHash) violations.push("g12_window_probe_hash_mismatch");

    const probeEvaluation = probeIsObject ? evaluateProbeWindow(probe) : { healthy: false };
    const routeMetrics = probe?.routeMetrics;
    const requiredRoutes = ["/", "/produtos", "/contato", "/admin/login"];
    const routeSampleCounts = requiredRoutes.map((route) => routeMetrics?.[route]?.samples);
    const uniformRouteSampleCount =
      routeSampleCounts.every((samples) => Number.isInteger(samples) && samples >= 5) &&
      new Set(routeSampleCounts).size === 1
        ? routeSampleCounts[0]
        : null;
    const currentSampleContract =
      requiredRoutes.every((route) => routeMetrics?.[route]?.samples === probe?.sampleCount) &&
      requiredRoutes.length * probe?.sampleCount + 2 === probe?.measuredResponses;
    const pinnedHistoricalSampleContract =
      isPinnedHistoricalEvidence &&
      probe?.sampleCount === probe?.measuredResponses &&
      uniformRouteSampleCount !== null &&
      requiredRoutes.length * uniformRouteSampleCount + 2 === probe?.measuredResponses;
    const routeMetricsValid =
      routeMetrics !== null &&
      typeof routeMetrics === "object" &&
      !Array.isArray(routeMetrics) &&
      Object.keys(routeMetrics).length === requiredRoutes.length &&
      requiredRoutes.every((route) => {
        const metric = routeMetrics[route];
        return (
          Number.isInteger(metric?.samples) &&
          metric.samples >= 5 &&
          isFiniteNumber(metric?.availabilityPercent) &&
          metric.availabilityPercent >= G12_BUDGETS.availabilityPercent &&
          isFiniteNumber(metric?.p95Ms) &&
          metric.p95Ms <= G12_BUDGETS.publicP95Ms
        );
      });
    if (
      !probeEvaluation.healthy ||
      probe?.schemaVersion !== 1 ||
      probe?.event !== "g12.rollout.probe" ||
      probe?.outcome !== "pass" ||
      !Array.isArray(probe?.violations) ||
      probe.violations.length !== 0 ||
      !Number.isInteger(probe?.sampleCount) ||
      probe.sampleCount < 5 ||
      (!currentSampleContract && !pinnedHistoricalSampleContract) ||
      !Number.isInteger(probe?.requestTimeoutMs) ||
      probe.requestTimeoutMs < 1_000 ||
      probe.requestTimeoutMs > 30_000 ||
      !routeMetricsValid
    )
      violations.push("g12_window_probe_invalid");
    if (
      probe?.candidateSha !== record?.candidateSha ||
      probe?.environment !== "staging" ||
      probe?.origin !== evidence?.candidateOrigin
    )
      violations.push("g12_window_probe_binding_mismatch");
    if (
      window?.outcome !== probe?.outcome ||
      window?.measuredResponses !== probe?.measuredResponses ||
      window?.availabilityPercent !== probe?.availabilityPercent ||
      window?.http5xxRatePercent !== probe?.http5xxRatePercent ||
      window?.publicP95Ms !== probe?.publicP95Ms
    )
      violations.push("g12_window_summary_mismatch");
    if (
      !UUID_PATTERN.test(window?.id ?? "") ||
      window?.outcome !== "pass" ||
      !Number.isInteger(window?.measuredResponses) ||
      window.measuredResponses < 22 ||
      !isFiniteNumber(window?.availabilityPercent) ||
      window.availabilityPercent < G12_BUDGETS.availabilityPercent ||
      !isFiniteNumber(window?.http5xxRatePercent) ||
      window.http5xxRatePercent > G12_BUDGETS.http5xxRatePercent ||
      !isFiniteNumber(window?.publicP95Ms) ||
      window.publicP95Ms > G12_BUDGETS.publicP95Ms ||
      !/^[a-f0-9]{64}$/.test(window?.evidenceHash ?? "") ||
      !Number.isFinite(startedAt) ||
      !Number.isFinite(endedAt) ||
      endedAt <= startedAt
    )
      violations.push("g12_window_invalid");
    if (previousEnd && (startedAt < previousEnd || startedAt - previousEnd > 60_000))
      violations.push("g12_windows_not_consecutive");
    if (Number.isFinite(endedAt)) previousEnd = endedAt;
  }

  const uniqueViolations = [...new Set(violations)];
  return { valid: uniqueViolations.length === 0, violations: uniqueViolations };
}

export function evaluateCodeOwners(content) {
  const rules = String(content ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+#.*$/, "").trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line, index) => {
      const [pattern, ...tokens] = line.split(/\s+/);
      return {
        index,
        pattern,
        normalizedPattern: String(pattern ?? "").replace(/^\//, ""),
        owners: tokens.map((token) => token.toLowerCase()),
        syntaxValid:
          Boolean(pattern) && !pattern.startsWith("!") && !pattern.includes("[") && !pattern.includes("]"),
      };
    });
  const lastRuleIndexByPattern = new Map(rules.map((rule) => [rule.normalizedPattern, rule.index]));
  const effectiveRules = rules.filter(
    (rule) => lastRuleIndexByPattern.get(rule.normalizedPattern) === rule.index,
  );
  const hasSoleMaintainer = (rule) =>
    rule?.owners.length === 1 && rule.owners[0] === `@${GITHUB_SOLE_MAINTAINER}`;
  const couldMatchArea = (pattern, areaRoot) => {
    const normalized = String(pattern ?? "").replace(/^\//, "");
    if (!normalized.includes("/") || normalized.includes("\\")) return true;
    const wildcardIndex = normalized.search(/[?*]/);
    const literalPrefix = (wildcardIndex < 0 ? normalized : normalized.slice(0, wildcardIndex)).replace(
      /\/+$/,
      "",
    );
    if (!literalPrefix) return true;
    if (wildcardIndex >= 0) return areaRoot.startsWith(literalPrefix) || literalPrefix.startsWith(areaRoot);
    return (
      literalPrefix === areaRoot ||
      literalPrefix.startsWith(`${areaRoot}/`) ||
      areaRoot.startsWith(`${literalPrefix}/`)
    );
  };
  const covers = (expectedPatterns, areaRoot) => {
    const declaration = effectiveRules
      .filter((rule) => rule.syntaxValid && expectedPatterns.has(rule.normalizedPattern))
      .at(-1);
    if (!hasSoleMaintainer(declaration)) return false;
    return !effectiveRules
      .filter((rule) => rule.index > declaration.index)
      .some(
        (rule) =>
          rule.syntaxValid &&
          !hasSoleMaintainer(rule) &&
          (areaRoot === null || couldMatchArea(rule.normalizedPattern, areaRoot)),
      );
  };
  const violations = [];
  if (!covers(new Set(["*", "**"]), null)) violations.push("global_vnd93_codeowner_required");
  if (!covers(new Set([".github/workflows/*", ".github/workflows/**"]), ".github/workflows"))
    violations.push("workflow_vnd93_codeowner_required");
  if (!covers(new Set([".github/release-controls/**"]), ".github/release-controls"))
    violations.push("approval_record_vnd93_codeowner_required");
  return { valid: violations.length === 0, violations };
}

export const G12_CI_WORKFLOW_PATH = ".github/workflows/ci.yml";
export const G12_CI_REQUIRED_JOBS = ["quality", "database", "browser"];

export function selectLatestCiWorkflowRun(workflowRuns) {
  return [...(Array.isArray(workflowRuns) ? workflowRuns : [])].sort((left, right) => {
    const runNumber = Number(right?.run_number ?? 0) - Number(left?.run_number ?? 0);
    if (runNumber) return runNumber;
    const runAttempt = Number(right?.run_attempt ?? 0) - Number(left?.run_attempt ?? 0);
    if (runAttempt) return runAttempt;
    return Number(right?.id ?? 0) - Number(left?.id ?? 0);
  })[0];
}

export function evaluateGithubControls({
  environment,
  comparison,
  branchProtection,
  codeOwners,
  candidateSha,
  repository,
  ciWorkflow,
  ciWorkflowRun,
  checkRuns,
}) {
  const violations = [];
  const reviewerRule = environment?.protection_rules?.find((rule) => rule.type === "required_reviewers");
  if (reviewerRule) violations.push("environment_reviewer_incompatible_with_sole_maintainer");
  if (
    environment?.deployment_branch_policy?.protected_branches !== true ||
    environment?.deployment_branch_policy?.custom_branch_policies !== false
  )
    violations.push("environment_protected_branches_only_required");
  if (comparison?.base_commit?.sha !== candidateSha || !["ahead", "identical"].includes(comparison?.status))
    violations.push("candidate_must_belong_to_main");
  if (branchProtection?.required_status_checks)
    violations.push("required_status_checks_incompatible_with_direct_main");
  const pullReviewRule = branchProtection?.required_pull_request_reviews;
  if (pullReviewRule) violations.push("pull_request_rule_incompatible_with_direct_main");
  if (branchProtection?.enforce_admins?.enabled !== true) violations.push("admin_enforcement_required");
  if (branchProtection?.allow_force_pushes?.enabled !== false) violations.push("force_push_must_be_disabled");
  if (branchProtection?.allow_deletions?.enabled !== false)
    violations.push("branch_deletion_must_be_disabled");
  if (branchProtection?.required_conversation_resolution?.enabled === true)
    violations.push("conversation_resolution_incompatible_with_direct_main");
  if (branchProtection?.required_linear_history?.enabled !== true) violations.push("linear_history_required");
  const codeOwnerResult = evaluateCodeOwners(codeOwners);
  violations.push(...codeOwnerResult.violations);

  const workflowId = Number(ciWorkflow?.id);
  const runId = Number(ciWorkflowRun?.id);
  const runAttempt = Number(ciWorkflowRun?.run_attempt);
  if (
    !Number.isSafeInteger(workflowId) ||
    workflowId < 1 ||
    ciWorkflow?.path !== G12_CI_WORKFLOW_PATH ||
    ciWorkflow?.state !== "active"
  )
    violations.push("ci_workflow_identity_invalid");
  if (
    !Number.isSafeInteger(runId) ||
    runId < 1 ||
    !Number.isSafeInteger(runAttempt) ||
    runAttempt < 1 ||
    ciWorkflowRun?.workflow_id !== workflowId ||
    ciWorkflowRun?.path !== G12_CI_WORKFLOW_PATH ||
    ciWorkflowRun?.head_sha !== candidateSha ||
    ciWorkflowRun?.head_branch !== "main" ||
    ciWorkflowRun?.event !== "push" ||
    ciWorkflowRun?.status !== "completed" ||
    ciWorkflowRun?.conclusion !== "success" ||
    ciWorkflowRun?.head_repository?.full_name !== repository ||
    ciWorkflowRun?.repository?.full_name !== repository
  )
    violations.push("latest_exact_ci_run_not_successful");

  const exactChecks = new Map();
  const duplicateChecks = new Set();
  for (const run of Array.isArray(checkRuns) ? checkRuns : []) {
    const name = String(run?.name ?? "")
      .toLowerCase()
      .replace(/^.*\/\s*/, "")
      .replace(/\s+\((?:push|pull_request)\)$/, "");
    if (!name) continue;
    if (Number(run?.run_id) !== runId) {
      violations.push("ci_job_run_identity_mismatch");
      continue;
    }
    if (exactChecks.has(name)) duplicateChecks.add(name);
    else exactChecks.set(name, run);
  }
  for (const required of G12_CI_REQUIRED_JOBS) {
    const run = exactChecks.get(required);
    if (duplicateChecks.has(required)) violations.push(`actual_check_${required}_duplicated`);
    if (run?.status !== "completed" || run?.conclusion !== "success")
      violations.push(`actual_check_${required}_not_successful`);
  }
  return { valid: violations.length === 0, violations };
}

export function validateProductionConfig(config) {
  const violations = [];
  const stagingRef = "glcqsosxwgmlhzgcsnzv";
  if (!/^[a-z]{20}$/.test(config?.supabaseProjectRef ?? "")) violations.push("supabase_project_ref_invalid");
  if (config?.supabaseProjectRef === stagingRef) violations.push("staging_project_ref_forbidden");
  if (config?.supabaseProjectRef !== "chfuhctnhqgyjowkvllv")
    violations.push("production_project_ref_mismatch");
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
