import { createHash } from "node:crypto";

import { isDeploymentCommitMessage } from "./deployment-commit-message.mjs";
import { FULL_SHA_PATTERN, UUID_PATTERN } from "./release-guard-lib.mjs";

export const FRONTEND_BRIDGE_WORKFLOW_NAME = "Promote production frontend bridge";
export const FRONTEND_BRIDGE_WORKFLOW_PATH = ".github/workflows/promote-production-frontend-bridge.yml";
export const FRONTEND_BRIDGE_REPOSITORY = "Vnd93/gaiatec-cms";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9][0-9]*$/;
const APPROVAL_PATTERN = /^\.github\/release-controls\/approvals\/G12_[a-f0-9]{40}\.json$/;
const STAGING_COMPATIBILITY_TESTED = Object.freeze([
  "legacy-content-read",
  "page-campaign-form-render",
  "turnstile-widget-request",
  "fail-closed-without-token",
  "zero-lead-post",
]);
const STAGING_COMPATIBILITY_NOT_TESTED = Object.freeze([
  "positive-form-submission",
  "lead-persistence",
  "full-candidate-backend",
]);

function exactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function isIsoDate(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function safeText(value, maximum = 300) {
  return typeof value === "string" && value.length > 0 && value.length <= maximum && !/[\r\n\0]/.test(value);
}

function validIdentity(value) {
  return (
    exactKeys(value, ["deploymentId", "release", "createdOn", "commitMessage"]) &&
    UUID_PATTERN.test(value.deploymentId ?? "") &&
    FULL_SHA_PATTERN.test(value.release ?? "") &&
    isIsoDate(value.createdOn) &&
    isDeploymentCommitMessage(value.commitMessage)
  );
}

function validPreview(value, candidateSha) {
  return (
    exactKeys(value, ["deploymentId", "release", "createdOn"]) &&
    UUID_PATTERN.test(value.deploymentId ?? "") &&
    value.release === candidateSha &&
    isIsoDate(value.createdOn)
  );
}

function validWorkflow(value, expected = {}) {
  return (
    exactKeys(value, ["name", "path", "runId", "runAttempt", "controlSha"]) &&
    value.name === FRONTEND_BRIDGE_WORKFLOW_NAME &&
    value.path === FRONTEND_BRIDGE_WORKFLOW_PATH &&
    POSITIVE_INTEGER_PATTERN.test(String(value.runId ?? "")) &&
    Number.isSafeInteger(value.runAttempt) &&
    value.runAttempt > 0 &&
    FULL_SHA_PATTERN.test(value.controlSha ?? "") &&
    (!expected.runId || String(value.runId) === String(expected.runId)) &&
    (!expected.runAttempt || Number(value.runAttempt) === Number(expected.runAttempt)) &&
    (!expected.controlSha || value.controlSha === expected.controlSha)
  );
}

function validApproval(value, candidateSha) {
  return (
    exactKeys(value, ["record", "recordSha256", "changeReference"]) &&
    APPROVAL_PATTERN.test(value.record ?? "") &&
    value.record.endsWith(`/G12_${candidateSha}.json`) &&
    SHA256_PATTERN.test(value.recordSha256 ?? "") &&
    safeText(value.changeReference, 180)
  );
}

function validDist(value, release) {
  return (
    exactKeys(value, [
      "candidateSha",
      "archiveFile",
      "archiveBytes",
      "archiveSha256",
      "treeSha256",
      "fileCount",
      "byteCount",
    ]) &&
    value.candidateSha === release &&
    value.archiveFile === "g12-production-frontend-bridge-dist.tar" &&
    Number.isSafeInteger(value.archiveBytes) &&
    value.archiveBytes > 0 &&
    SHA256_PATTERN.test(value.archiveSha256 ?? "") &&
    SHA256_PATTERN.test(value.treeSha256 ?? "") &&
    Number.isSafeInteger(value.fileCount) &&
    value.fileCount > 0 &&
    Number.isSafeInteger(value.byteCount) &&
    value.byteCount > 0
  );
}

function validPredecessorDist(value, release) {
  return (
    exactKeys(value, [
      "candidateSha",
      "archiveFile",
      "archiveBytes",
      "archiveSha256",
      "treeSha256",
      "fileCount",
      "byteCount",
    ]) &&
    value.candidateSha === release &&
    value.archiveFile === "g12-production-frontend-bridge-predecessor-dist.tar" &&
    Number.isSafeInteger(value.archiveBytes) &&
    value.archiveBytes > 0 &&
    SHA256_PATTERN.test(value.archiveSha256 ?? "") &&
    SHA256_PATTERN.test(value.treeSha256 ?? "") &&
    Number.isSafeInteger(value.fileCount) &&
    value.fileCount > 0 &&
    Number.isSafeInteger(value.byteCount) &&
    value.byteCount > 0
  );
}

function validHeadlessSummary(value, expected) {
  return (
    exactKeys(value, [
      "mode",
      "contract",
      "origin",
      "deploymentOrigin",
      "deploymentIdentitySha256",
      "fixtureBindingSha256",
      "reportSha256",
      "cleanupSha256",
      "residueSha256",
      "pageRendered",
      "campaignRendered",
      "formRendered",
      "turnstileWidgetRequested",
      "turnstileNetworkFailureObserved",
      "submitDisabledWithoutToken",
      "unavailableFeedbackVisible",
      "backendMutationRequests",
      "cleanupStatus",
      "residueStatus",
      "auditRetained",
    ]) &&
    value.mode === "headless-fail-closed" &&
    value.contract === "legacy-f48" &&
    /^https:\/\/[a-z0-9-]+\.gaiatec-cms-staging\.pages\.dev$/.test(value.origin ?? "") &&
    value.origin === expected.origin &&
    /^https:\/\/[a-z0-9-]+\.gaiatec-cms-staging\.pages\.dev$/.test(value.deploymentOrigin ?? "") &&
    value.deploymentOrigin === expected.deploymentOrigin &&
    UUID_PATTERN.test(expected.deploymentId ?? "") &&
    value.deploymentIdentitySha256 === sha256Bytes(expected.deploymentId ?? "") &&
    [
      "deploymentIdentitySha256",
      "fixtureBindingSha256",
      "reportSha256",
      "cleanupSha256",
      "residueSha256",
    ].every((key) => SHA256_PATTERN.test(value[key] ?? "")) &&
    value.pageRendered === true &&
    value.campaignRendered === true &&
    value.formRendered === true &&
    value.turnstileWidgetRequested === true &&
    value.turnstileNetworkFailureObserved === true &&
    value.submitDisabledWithoutToken === true &&
    value.unavailableFeedbackVisible === true &&
    value.backendMutationRequests === 0 &&
    value.cleanupStatus === "cleaned" &&
    value.residueStatus === "passed" &&
    value.auditRetained === true
  );
}

function validStagingCompatibilityScope(value) {
  return (
    exactKeys(value, ["mode", "backendContract", "tested", "notTested"]) &&
    value.mode === "compatibility-only" &&
    value.backendContract === "legacy-f48" &&
    JSON.stringify(value.tested) === JSON.stringify(STAGING_COMPATIBILITY_TESTED) &&
    JSON.stringify(value.notTested) === JSON.stringify(STAGING_COMPATIBILITY_NOT_TESTED)
  );
}

function validStagingBridge(value) {
  return (
    exactKeys(value, [
      "runId",
      "runAttempt",
      "controlSha",
      "artifactId",
      "artifactDigest",
      "evidenceSha256",
      "canonicalDeploymentId",
      "canonicalHeadless",
      "compatibilityScope",
      "positiveBrowserRequiredAfterFullCandidateDeploy",
      "backendMutation",
    ]) &&
    POSITIVE_INTEGER_PATTERN.test(String(value.runId ?? "")) &&
    Number.isSafeInteger(value.runAttempt) &&
    value.runAttempt > 0 &&
    FULL_SHA_PATTERN.test(value.controlSha ?? "") &&
    POSITIVE_INTEGER_PATTERN.test(String(value.artifactId ?? "")) &&
    /^sha256:[a-f0-9]{64}$/.test(value.artifactDigest ?? "") &&
    SHA256_PATTERN.test(value.evidenceSha256 ?? "") &&
    UUID_PATTERN.test(value.canonicalDeploymentId ?? "") &&
    validHeadlessSummary(value.canonicalHeadless, {
      origin: "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev",
      deploymentOrigin: "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev",
      deploymentId: value.canonicalDeploymentId,
    }) &&
    validStagingCompatibilityScope(value.compatibilityScope) &&
    value.positiveBrowserRequiredAfterFullCandidateDeploy === true &&
    value.backendMutation === "fixture-only-cleaned"
  );
}

function validProductionSafety(value, probes) {
  return (
    exactKeys(value, [
      "mode",
      "renderedRoutesPerDeployment",
      "leadSubmissions",
      "backendMutations",
      "previewProbeSha256",
      "productionProbeSha256",
      "previewReadOnlySha256",
      "productionReadOnlySha256",
      "positiveBrowserGate",
      "positiveBrowserGateOwner",
      "positiveBrowserSubmissionAttempted",
      "positiveBrowserHomologationClaimed",
    ]) &&
    value.mode === "read-only-old-backend" &&
    value.renderedRoutesPerDeployment === 4 &&
    value.leadSubmissions === 0 &&
    value.backendMutations === 0 &&
    value.previewProbeSha256 === probes?.previewSha256 &&
    value.productionProbeSha256 === probes?.productionSha256 &&
    SHA256_PATTERN.test(value.previewReadOnlySha256 ?? "") &&
    SHA256_PATTERN.test(value.productionReadOnlySha256 ?? "") &&
    value.previewReadOnlySha256 !== value.productionReadOnlySha256 &&
    value.positiveBrowserGate === "deferred-to-full-candidate-deploy" &&
    value.positiveBrowserGateOwner === ".github/workflows/deploy-production.yml" &&
    value.positiveBrowserSubmissionAttempted === false &&
    value.positiveBrowserHomologationClaimed === false
  );
}

export function frontendBridgeRunMarker(runId, runAttempt) {
  if (
    !POSITIVE_INTEGER_PATTERN.test(String(runId ?? "")) ||
    !POSITIVE_INTEGER_PATTERN.test(String(runAttempt ?? ""))
  ) {
    throw new Error("G12_FRONTEND_BRIDGE_RUN_IDENTITY_REFUSED");
  }
  return `g12-production-bridge-run-${runId}-${runAttempt}`;
}

export function frontendBridgeCompensationMarker(runId, runAttempt) {
  if (
    !POSITIVE_INTEGER_PATTERN.test(String(runId ?? "")) ||
    !POSITIVE_INTEGER_PATTERN.test(String(runAttempt ?? ""))
  ) {
    throw new Error("G12_FRONTEND_BRIDGE_RUN_IDENTITY_REFUSED");
  }
  return `g12-production-bridge-compensation-${runId}-${runAttempt}`;
}

export function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function validateFrontendBridgeState(value, expected = {}) {
  const violations = [];
  const candidateSha = value?.candidateSha;
  if (
    !exactKeys(value, [
      "schemaVersion",
      "event",
      "repository",
      "workflow",
      "candidateSha",
      "runMarker",
      "compensationMarker",
      "baseline",
      "approval",
      "dist",
      "predecessorDist",
      "backendMutation",
    ]) ||
    value?.schemaVersion !== 2 ||
    value?.event !== "g12.production.frontend_bridge.prepared" ||
    value?.repository !== FRONTEND_BRIDGE_REPOSITORY
  ) {
    violations.push("state_schema_invalid");
  }
  if (
    !FULL_SHA_PATTERN.test(candidateSha ?? "") ||
    (expected.candidateSha && candidateSha !== expected.candidateSha)
  )
    violations.push("state_candidate_invalid");
  if (!validWorkflow(value?.workflow, expected)) violations.push("state_workflow_invalid");
  let expectedMarker = "";
  try {
    expectedMarker = frontendBridgeRunMarker(value?.workflow?.runId, value?.workflow?.runAttempt);
  } catch {
    // Report the stable validation code below.
  }
  if (value?.runMarker !== expectedMarker) violations.push("state_run_marker_invalid");
  let expectedCompensationMarker = "";
  try {
    expectedCompensationMarker = frontendBridgeCompensationMarker(
      value?.workflow?.runId,
      value?.workflow?.runAttempt,
    );
  } catch {
    // Report the stable validation code below.
  }
  if (value?.compensationMarker !== expectedCompensationMarker)
    violations.push("state_compensation_marker_invalid");
  if (!validIdentity(value?.baseline) || value?.baseline?.release === candidateSha)
    violations.push("state_baseline_invalid");
  if (!validApproval(value?.approval, candidateSha)) violations.push("state_approval_invalid");
  if (!validDist(value?.dist, candidateSha)) violations.push("state_dist_invalid");
  if (!validPredecessorDist(value?.predecessorDist, value?.baseline?.release))
    violations.push("state_predecessor_dist_invalid");
  if (value?.backendMutation !== "none") violations.push("state_backend_mutation_invalid");
  const unique = [...new Set(violations)];
  return { valid: unique.length === 0, violations: unique };
}

export function validateFrontendBridgeEvidence(value, expected = {}) {
  const violations = [];
  const candidateSha = value?.candidateSha;
  if (
    !exactKeys(value, [
      "schemaVersion",
      "event",
      "repository",
      "workflow",
      "candidateSha",
      "runMarker",
      "compensationMarker",
      "baseline",
      "preview",
      "production",
      "approval",
      "prerequisites",
      "dist",
      "predecessorDist",
      "probes",
      "stagingBridge",
      "productionSafety",
      "backendMutation",
      "rollbackReady",
    ]) ||
    value?.schemaVersion !== 5 ||
    value?.event !== "g12.production.frontend_bridge.promoted" ||
    value?.repository !== FRONTEND_BRIDGE_REPOSITORY
  ) {
    violations.push("evidence_schema_invalid");
  }
  if (
    !FULL_SHA_PATTERN.test(candidateSha ?? "") ||
    (expected.candidateSha && candidateSha !== expected.candidateSha)
  )
    violations.push("evidence_candidate_invalid");
  if (!validWorkflow(value?.workflow, expected)) violations.push("evidence_workflow_invalid");
  let expectedMarker = "";
  try {
    expectedMarker = frontendBridgeRunMarker(value?.workflow?.runId, value?.workflow?.runAttempt);
  } catch {
    // Report the stable validation code below.
  }
  if (value?.runMarker !== expectedMarker) violations.push("evidence_run_marker_invalid");
  let expectedCompensationMarker = "";
  try {
    expectedCompensationMarker = frontendBridgeCompensationMarker(
      value?.workflow?.runId,
      value?.workflow?.runAttempt,
    );
  } catch {
    // Report the stable validation code below.
  }
  if (value?.compensationMarker !== expectedCompensationMarker)
    violations.push("evidence_compensation_marker_invalid");
  if (!validIdentity(value?.baseline) || value?.baseline?.release === candidateSha)
    violations.push("evidence_baseline_invalid");
  if (!validPreview(value?.preview, candidateSha)) violations.push("evidence_preview_invalid");
  if (
    !validIdentity(value?.production) ||
    value?.production?.release !== candidateSha ||
    value?.production?.commitMessage !== expectedMarker ||
    (expected.deploymentId && value?.production?.deploymentId !== expected.deploymentId)
  ) {
    violations.push("evidence_production_invalid");
  }
  if (!validApproval(value?.approval, candidateSha)) violations.push("evidence_approval_invalid");
  if (
    !exactKeys(value?.prerequisites, ["stagingRunId", "backupRunId", "emailRunId"]) ||
    Object.values(value?.prerequisites ?? {}).some(
      (entry) => !POSITIVE_INTEGER_PATTERN.test(String(entry ?? "")),
    )
  ) {
    violations.push("evidence_prerequisites_invalid");
  }
  if (!validDist(value?.dist, candidateSha)) violations.push("evidence_dist_invalid");
  if (!validPredecessorDist(value?.predecessorDist, value?.baseline?.release))
    violations.push("evidence_predecessor_dist_invalid");
  if (
    !exactKeys(value?.probes, ["previewSha256", "productionSha256"]) ||
    !SHA256_PATTERN.test(value?.probes?.previewSha256 ?? "") ||
    !SHA256_PATTERN.test(value?.probes?.productionSha256 ?? "")
  ) {
    violations.push("evidence_probes_invalid");
  }
  if (!validStagingBridge(value?.stagingBridge)) violations.push("evidence_staging_bridge_invalid");
  if (!validProductionSafety(value?.productionSafety, value?.probes))
    violations.push("evidence_production_safety_invalid");
  if (value?.backendMutation !== "none") violations.push("evidence_backend_mutation_invalid");
  if (value?.rollbackReady !== true) violations.push("evidence_rollback_not_ready");
  const unique = [...new Set(violations)];
  return { valid: unique.length === 0, violations: unique };
}

export function validateFrontendBridgeGitHubRun({
  repository,
  run,
  runId,
  expectedRelease,
  now = new Date(),
}) {
  const violations = [];
  const completedAt = Date.parse(run?.updated_at ?? "");
  if (repository !== FRONTEND_BRIDGE_REPOSITORY) violations.push("run_repository_input_invalid");
  if (String(run?.repository?.full_name ?? "").toLowerCase() !== FRONTEND_BRIDGE_REPOSITORY.toLowerCase())
    violations.push("run_repository_invalid");
  if (String(run?.id ?? "") !== String(runId ?? "")) violations.push("run_id_mismatch");
  if (run?.name !== FRONTEND_BRIDGE_WORKFLOW_NAME || run?.path !== FRONTEND_BRIDGE_WORKFLOW_PATH)
    violations.push("run_workflow_invalid");
  if (run?.event !== "workflow_dispatch" || run?.head_branch !== "main")
    violations.push("run_dispatch_invalid");
  if (run?.status !== "completed" || run?.conclusion !== "success") violations.push("run_not_successful");
  if (!FULL_SHA_PATTERN.test(run?.head_sha ?? "")) violations.push("run_control_sha_invalid");
  if (String(run?.actor?.login ?? "").toLowerCase() !== "vnd93") violations.push("run_actor_invalid");
  if (!Number.isSafeInteger(run?.run_attempt) || run.run_attempt < 1) violations.push("run_attempt_invalid");
  if (!Number.isFinite(completedAt) || completedAt > now.getTime() + 5 * 60_000)
    violations.push("run_completed_at_invalid");
  if (!FULL_SHA_PATTERN.test(expectedRelease ?? "")) violations.push("run_expected_release_invalid");
  const unique = [...new Set(violations)];
  return { valid: unique.length === 0, violations: unique };
}

export function selectFrontendBridgeArtifact({ artifacts, run, expectedRelease, now = new Date() }) {
  const violations = [];
  const name = `production-frontend-bridge-${expectedRelease}`;
  const matches = Array.isArray(artifacts) ? artifacts.filter((artifact) => artifact?.name === name) : [];
  if (matches.length !== 1) violations.push("artifact_not_unique");
  const artifact = matches[0];
  if (!Number.isSafeInteger(artifact?.id) || artifact.id < 1) violations.push("artifact_id_invalid");
  if (!/^sha256:[a-f0-9]{64}$/.test(artifact?.digest ?? "")) violations.push("artifact_digest_invalid");
  if (!Number.isSafeInteger(artifact?.size_in_bytes) || artifact.size_in_bytes < 2)
    violations.push("artifact_size_invalid");
  if (
    artifact?.expired !== false ||
    !isIsoDate(artifact?.expires_at) ||
    Date.parse(artifact.expires_at) <= now.getTime()
  ) {
    violations.push("artifact_expired");
  }
  if (
    String(artifact?.workflow_run?.id ?? "") !== String(run?.id ?? "") ||
    artifact?.workflow_run?.head_branch !== "main" ||
    artifact?.workflow_run?.head_sha !== run?.head_sha
  ) {
    violations.push("artifact_run_binding_invalid");
  }
  const expectedDownload = `https://api.github.com/repos/${FRONTEND_BRIDGE_REPOSITORY}/actions/artifacts/${artifact?.id}/zip`;
  if (artifact?.archive_download_url !== expectedDownload) violations.push("artifact_download_url_invalid");
  const unique = [...new Set(violations)];
  return { valid: unique.length === 0, violations: unique, artifact: unique.length ? null : artifact };
}

export function selectFrontendBridgeDistArtifact({ artifacts, run, expectedRelease, now = new Date() }) {
  const violations = [];
  const name = `production-frontend-bridge-dist-${expectedRelease}`;
  const matches = Array.isArray(artifacts) ? artifacts.filter((artifact) => artifact?.name === name) : [];
  if (matches.length !== 1) violations.push("dist_artifact_not_unique");
  const artifact = matches[0];
  if (!Number.isSafeInteger(artifact?.id) || artifact.id < 1) violations.push("dist_artifact_id_invalid");
  if (!/^sha256:[a-f0-9]{64}$/.test(artifact?.digest ?? "")) violations.push("dist_artifact_digest_invalid");
  if (!Number.isSafeInteger(artifact?.size_in_bytes) || artifact.size_in_bytes < 2)
    violations.push("dist_artifact_size_invalid");
  if (
    artifact?.expired !== false ||
    !isIsoDate(artifact?.expires_at) ||
    Date.parse(artifact.expires_at) <= now.getTime()
  ) {
    violations.push("dist_artifact_expired");
  }
  if (
    String(artifact?.workflow_run?.id ?? "") !== String(run?.id ?? "") ||
    artifact?.workflow_run?.head_branch !== "main" ||
    artifact?.workflow_run?.head_sha !== run?.head_sha
  ) {
    violations.push("dist_artifact_run_binding_invalid");
  }
  const expectedDownload = `https://api.github.com/repos/${FRONTEND_BRIDGE_REPOSITORY}/actions/artifacts/${artifact?.id}/zip`;
  if (artifact?.archive_download_url !== expectedDownload)
    violations.push("dist_artifact_download_url_invalid");
  const unique = [...new Set(violations)];
  return { valid: unique.length === 0, violations: unique, artifact: unique.length ? null : artifact };
}
