import { createHash } from "node:crypto";

import { isDeploymentCommitMessage } from "./deployment-commit-message.mjs";
import { FULL_SHA_PATTERN, UUID_PATTERN } from "./release-guard-lib.mjs";

export const STAGING_FRONTEND_BRIDGE_WORKFLOW_NAME = "Promote staging frontend bridge";
export const STAGING_FRONTEND_BRIDGE_WORKFLOW_PATH = ".github/workflows/promote-staging-frontend-bridge.yml";
export const STAGING_FRONTEND_BRIDGE_REPOSITORY = "Vnd93/gaiatec-cms";
const SHA256 = /^(?:sha256:)?[a-f0-9]{64}$/;
const POSITIVE = /^[1-9]\d*$/;
const PREVIEW_ORIGIN = "https://ev2-g12-canary.gaiatec-cms-staging.pages.dev";
const CANONICAL_ORIGIN = "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev";
const COMPATIBILITY_TESTED = Object.freeze([
  "legacy-content-read",
  "page-campaign-form-render",
  "turnstile-widget-request",
  "fail-closed-without-token",
  "zero-lead-post",
]);
const COMPATIBILITY_NOT_TESTED = Object.freeze([
  "positive-form-submission",
  "lead-persistence",
  "full-candidate-backend",
]);

function exactKeys(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort())
  );
}

function identity(value) {
  return (
    exactKeys(value, ["deploymentId", "release", "createdOn", "commitMessage"]) &&
    UUID_PATTERN.test(value.deploymentId ?? "") &&
    FULL_SHA_PATTERN.test(value.release ?? "") &&
    Number.isFinite(Date.parse(value.createdOn ?? "")) &&
    isDeploymentCommitMessage(value.commitMessage)
  );
}

function headless(value, expected) {
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
    (!expected.deploymentOrigin || value.deploymentOrigin === expected.deploymentOrigin) &&
    UUID_PATTERN.test(expected.deploymentId ?? "") &&
    value.deploymentIdentitySha256 ===
      createHash("sha256")
        .update(expected.deploymentId ?? "")
        .digest("hex") &&
    [
      "deploymentIdentitySha256",
      "fixtureBindingSha256",
      "reportSha256",
      "cleanupSha256",
      "residueSha256",
    ].every((key) => /^[a-f0-9]{64}$/.test(value[key] ?? "")) &&
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

function compatibilityScope(value) {
  return (
    exactKeys(value, ["mode", "backendContract", "tested", "notTested"]) &&
    value.mode === "compatibility-only" &&
    value.backendContract === "legacy-f48" &&
    JSON.stringify(value.tested) === JSON.stringify(COMPATIBILITY_TESTED) &&
    JSON.stringify(value.notTested) === JSON.stringify(COMPATIBILITY_NOT_TESTED)
  );
}

export function validateStagingFrontendBridgeEvidence(value, expected = {}) {
  const violations = [];
  if (
    !exactKeys(value, [
      "schemaVersion",
      "event",
      "repository",
      "workflow",
      "candidateSha",
      "baseline",
      "preview",
      "canonical",
      "dist",
      "probes",
      "headlessCanaries",
      "compatibilityScope",
      "positiveBrowserRequiredAfterFullCandidateDeploy",
      "backendMutation",
      "rollbackReady",
    ]) ||
    value?.schemaVersion !== 3 ||
    value?.event !== "g12.staging.frontend_bridge.promoted" ||
    value?.repository !== STAGING_FRONTEND_BRIDGE_REPOSITORY
  )
    violations.push("schema_invalid");
  if (
    !FULL_SHA_PATTERN.test(value?.candidateSha ?? "") ||
    (expected.candidateSha && value?.candidateSha !== expected.candidateSha)
  )
    violations.push("candidate_invalid");
  if (
    !exactKeys(value?.workflow, ["name", "path", "runId", "runAttempt", "controlSha"]) ||
    value?.workflow?.name !== STAGING_FRONTEND_BRIDGE_WORKFLOW_NAME ||
    value?.workflow?.path !== STAGING_FRONTEND_BRIDGE_WORKFLOW_PATH ||
    !POSITIVE.test(String(value?.workflow?.runId ?? "")) ||
    !Number.isSafeInteger(value?.workflow?.runAttempt) ||
    value.workflow.runAttempt < 1 ||
    !FULL_SHA_PATTERN.test(value?.workflow?.controlSha ?? "") ||
    (expected.runId && String(value.workflow.runId) !== String(expected.runId)) ||
    (expected.runAttempt && Number(value.workflow.runAttempt) !== Number(expected.runAttempt)) ||
    (expected.controlSha && value.workflow.controlSha !== expected.controlSha)
  )
    violations.push("workflow_invalid");
  if (!identity(value?.baseline) || value?.baseline?.release === value?.candidateSha)
    violations.push("baseline_invalid");
  if (!identity(value?.preview) || value?.preview?.release !== value?.candidateSha)
    violations.push("preview_invalid");
  const marker = `g12-staging-bridge-run-${value?.workflow?.runId}-${value?.workflow?.runAttempt}`;
  if (
    !identity(value?.canonical) ||
    value?.canonical?.release !== value?.candidateSha ||
    value?.canonical?.commitMessage !== marker ||
    (expected.deploymentId && value.canonical.deploymentId !== expected.deploymentId)
  )
    violations.push("canonical_invalid");
  if (
    !exactKeys(value?.dist, ["archiveSha256", "treeSha256"]) ||
    !SHA256.test(value?.dist?.archiveSha256 ?? "") ||
    !SHA256.test(value?.dist?.treeSha256 ?? "")
  )
    violations.push("dist_invalid");
  if (
    !exactKeys(value?.probes, ["previewSha256", "canonicalSha256"]) ||
    !SHA256.test(value?.probes?.previewSha256 ?? "") ||
    !SHA256.test(value?.probes?.canonicalSha256 ?? "")
  )
    violations.push("probes_invalid");
  if (
    !exactKeys(value?.headlessCanaries, ["preview", "canonical"]) ||
    !headless(value?.headlessCanaries?.preview, {
      origin: PREVIEW_ORIGIN,
      deploymentId: value?.preview?.deploymentId,
    }) ||
    !headless(value?.headlessCanaries?.canonical, {
      origin: CANONICAL_ORIGIN,
      deploymentOrigin: CANONICAL_ORIGIN,
      deploymentId: value?.canonical?.deploymentId,
    }) ||
    value?.headlessCanaries?.preview?.fixtureBindingSha256 ===
      value?.headlessCanaries?.canonical?.fixtureBindingSha256
  )
    violations.push("headless_invalid");
  if (!compatibilityScope(value?.compatibilityScope)) violations.push("compatibility_scope_invalid");
  if (value?.positiveBrowserRequiredAfterFullCandidateDeploy !== true)
    violations.push("positive_browser_requirement_invalid");
  if (value?.backendMutation !== "fixture-only-cleaned") violations.push("backend_mutation_invalid");
  if (value?.rollbackReady !== true) violations.push("rollback_not_ready");
  const unique = [...new Set(violations)];
  return { valid: unique.length === 0, violations: unique };
}

export function validateStagingFrontendBridgeRun({ run, runId, repository, candidateSha }) {
  const violations = [];
  if (
    repository !== STAGING_FRONTEND_BRIDGE_REPOSITORY ||
    run?.repository?.full_name !== STAGING_FRONTEND_BRIDGE_REPOSITORY
  )
    violations.push("repository_invalid");
  if (String(run?.id ?? "") !== String(runId ?? "")) violations.push("run_id_invalid");
  if (
    run?.name !== STAGING_FRONTEND_BRIDGE_WORKFLOW_NAME ||
    run?.path !== STAGING_FRONTEND_BRIDGE_WORKFLOW_PATH
  )
    violations.push("workflow_invalid");
  if (
    run?.event !== "workflow_dispatch" ||
    run?.head_branch !== "main" ||
    run?.status !== "completed" ||
    run?.conclusion !== "success" ||
    String(run?.actor?.login ?? "").toLowerCase() !== "vnd93" ||
    !FULL_SHA_PATTERN.test(run?.head_sha ?? "") ||
    !FULL_SHA_PATTERN.test(candidateSha ?? "")
  )
    violations.push("run_invalid");
  return { valid: violations.length === 0, violations };
}

export function selectStagingFrontendBridgeArtifact({ artifacts, run, candidateSha }) {
  const matches = Array.isArray(artifacts)
    ? artifacts.filter((entry) => entry?.name === `staging-frontend-bridge-${candidateSha}`)
    : [];
  const artifact = matches[0];
  const violations = [];
  if (matches.length !== 1) violations.push("artifact_not_unique");
  if (
    !Number.isSafeInteger(artifact?.id) ||
    artifact.id < 1 ||
    !/^sha256:[a-f0-9]{64}$/.test(artifact?.digest ?? "") ||
    artifact?.expired !== false ||
    String(artifact?.workflow_run?.id ?? "") !== String(run?.id ?? "") ||
    artifact?.workflow_run?.head_sha !== run?.head_sha
  )
    violations.push("artifact_invalid");
  return { valid: violations.length === 0, violations, artifact: violations.length ? null : artifact };
}
