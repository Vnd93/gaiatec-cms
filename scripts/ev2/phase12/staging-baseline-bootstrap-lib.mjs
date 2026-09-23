import { createHash } from "node:crypto";

import { FULL_SHA_PATTERN, UUID_PATTERN } from "./release-guard-lib.mjs";

const SHA256 = /^[a-f0-9]{64}$/;
const PREFIXED_SHA256 = /^sha256:[a-f0-9]{64}$/;
const POSITIVE = /^[1-9]\d*$/;
const REPOSITORY = "Vnd93/gaiatec-cms";
const BRIDGE_WORKFLOW = ".github/workflows/promote-staging-frontend-bridge.yml";
const DEPLOY_WORKFLOW = ".github/workflows/deploy-staging.yml";
const MINIMUM_ARTIFACT_REMAINING_MS = 7 * 24 * 60 * 60 * 1000;

function exactKeys(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort())
  );
}

export function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function validateStagingBaselineBootstrapRecord(value) {
  const violations = [];
  if (
    !exactKeys(value, [
      "schemaVersion",
      "event",
      "repository",
      "candidateSha",
      "canonical",
      "bridge",
      "source",
      "dist",
    ]) ||
    value?.schemaVersion !== 1 ||
    value?.event !== "g12.staging.baseline.bootstrap" ||
    value?.repository !== REPOSITORY ||
    !FULL_SHA_PATTERN.test(value?.candidateSha ?? "")
  )
    violations.push("schema_invalid");
  if (
    !exactKeys(value?.canonical, ["deploymentId", "createdOn", "commitMessage"]) ||
    !UUID_PATTERN.test(value?.canonical?.deploymentId ?? "") ||
    !Number.isFinite(Date.parse(value?.canonical?.createdOn ?? "")) ||
    value?.canonical?.commitMessage !==
      `g12-staging-bridge-run-${value?.bridge?.runId}-${value?.bridge?.runAttempt}`
  )
    violations.push("canonical_invalid");
  if (
    !exactKeys(value?.bridge, [
      "runId",
      "runAttempt",
      "controlSha",
      "artifactId",
      "artifactDigest",
      "artifactName",
      "evidenceSha256",
    ]) ||
    !POSITIVE.test(value?.bridge?.runId ?? "") ||
    !Number.isSafeInteger(value?.bridge?.runAttempt) ||
    (value?.bridge?.runAttempt ?? 0) < 1 ||
    value?.bridge?.controlSha !== value?.candidateSha ||
    !POSITIVE.test(value?.bridge?.artifactId ?? "") ||
    !PREFIXED_SHA256.test(value?.bridge?.artifactDigest ?? "") ||
    value?.bridge?.artifactName !== `staging-frontend-bridge-${value?.candidateSha}` ||
    !SHA256.test(value?.bridge?.evidenceSha256 ?? "")
  )
    violations.push("bridge_invalid");
  if (
    !exactKeys(value?.source, [
      "runId",
      "runAttempt",
      "controlSha",
      "artifactId",
      "artifactDigest",
      "artifactName",
      "sealFile",
      "archiveFile",
      "sealSha256",
    ]) ||
    !POSITIVE.test(value?.source?.runId ?? "") ||
    !Number.isSafeInteger(value?.source?.runAttempt) ||
    (value?.source?.runAttempt ?? 0) < 1 ||
    value?.source?.controlSha !== value?.candidateSha ||
    !POSITIVE.test(value?.source?.artifactId ?? "") ||
    !PREFIXED_SHA256.test(value?.source?.artifactDigest ?? "") ||
    value?.source?.artifactName !==
      `staging-candidate-${value?.candidateSha}-${value?.source?.runId}-${value?.source?.runAttempt}` ||
    value?.source?.sealFile !== "staging-candidate-dist-seal.json" ||
    value?.source?.archiveFile !== "staging-candidate-dist.tar" ||
    !SHA256.test(value?.source?.sealSha256 ?? "")
  )
    violations.push("source_invalid");
  if (
    !exactKeys(value?.dist, ["archiveSha256", "treeSha256", "archiveBytes", "fileCount", "byteCount"]) ||
    !SHA256.test(value?.dist?.archiveSha256 ?? "") ||
    !SHA256.test(value?.dist?.treeSha256 ?? "") ||
    ![value?.dist?.archiveBytes, value?.dist?.fileCount, value?.dist?.byteCount].every(
      (entry) => Number.isSafeInteger(entry) && entry > 0,
    )
  )
    violations.push("dist_invalid");
  return { valid: violations.length === 0, violations: [...new Set(violations)] };
}

function validateRun(run, expected, { workflow, conclusion }) {
  return (
    String(run?.id ?? "") === expected.runId &&
    Number(run?.run_attempt) === expected.runAttempt &&
    run?.name === (workflow === BRIDGE_WORKFLOW ? "Promote staging frontend bridge" : "Deploy staging") &&
    run?.path === workflow &&
    run?.event === "workflow_dispatch" &&
    run?.head_branch === "main" &&
    run?.head_sha === expected.controlSha &&
    run?.status === "completed" &&
    run?.conclusion === conclusion &&
    String(run?.actor?.login ?? "").toLowerCase() === "vnd93" &&
    String(run?.triggering_actor?.login ?? "").toLowerCase() === "vnd93" &&
    run?.repository?.full_name === REPOSITORY
  );
}

function validateArtifact(artifact, expected, run, now) {
  return (
    String(artifact?.id ?? "") === expected.artifactId &&
    artifact?.name === expected.artifactName &&
    artifact?.digest === expected.artifactDigest &&
    artifact?.expired === false &&
    Number.isSafeInteger(artifact?.size_in_bytes) &&
    artifact.size_in_bytes > 0 &&
    Number.isFinite(Date.parse(artifact?.expires_at ?? "")) &&
    Date.parse(artifact.expires_at) >= now + MINIMUM_ARTIFACT_REMAINING_MS &&
    String(artifact?.workflow_run?.id ?? "") === expected.runId &&
    artifact?.workflow_run?.head_sha === run?.head_sha
  );
}

export function validateStagingBaselineBootstrapRemote({
  record,
  bridgeRun,
  bridgeArtifacts,
  sourceRun,
  sourceArtifacts,
  now = Date.now(),
}) {
  const violations = [...validateStagingBaselineBootstrapRecord(record).violations];
  if (!validateRun(bridgeRun, record?.bridge ?? {}, { workflow: BRIDGE_WORKFLOW, conclusion: "success" }))
    violations.push("bridge_run_invalid");
  if (!validateRun(sourceRun, record?.source ?? {}, { workflow: DEPLOY_WORKFLOW, conclusion: "failure" }))
    violations.push("source_run_invalid");
  const bridgeMatches = (Array.isArray(bridgeArtifacts) ? bridgeArtifacts : []).filter(
    (entry) => entry?.name === record?.bridge?.artifactName,
  );
  if (bridgeMatches.length !== 1 || !validateArtifact(bridgeMatches[0], record?.bridge ?? {}, bridgeRun, now))
    violations.push("bridge_artifact_invalid");
  const sourceMatches = (Array.isArray(sourceArtifacts) ? sourceArtifacts : []).filter(
    (entry) => entry?.name === record?.source?.artifactName,
  );
  if (sourceMatches.length !== 1 || !validateArtifact(sourceMatches[0], record?.source ?? {}, sourceRun, now))
    violations.push("source_artifact_invalid");
  return { valid: violations.length === 0, violations: [...new Set(violations)] };
}

export function identifyLegacyBootstrapCompensation({ record, candidateSha, commitMessage }) {
  if (!validateStagingBaselineBootstrapRecord(record).valid || candidateSha !== record.candidateSha)
    return null;
  const match = /^g12-staging-deploy-compensation-([1-9]\d*)-([1-9]\d*)$/.exec(String(commitMessage ?? ""));
  if (!match || match[1] !== record.source.runId || Number(match[2]) !== record.source.runAttempt)
    return null;
  return { runId: match[1], runAttempt: Number(match[2]) };
}

export function selectStagingBaselineSource({ record, candidateSha, deployment }) {
  const recordValidation = validateStagingBaselineBootstrapRecord(record);
  if (!recordValidation.valid)
    return { valid: false, violations: recordValidation.violations, mode: "refused" };
  const commitMessage = String(deployment?.commitMessage ?? "");
  if (
    candidateSha === record.candidateSha &&
    deployment?.deploymentId === record.canonical.deploymentId &&
    deployment?.createdOn === record.canonical.createdOn &&
    commitMessage === record.canonical.commitMessage
  )
    return {
      valid: true,
      violations: [],
      mode: "bootstrap",
      trusted: false,
      requiresRemoteVerification: true,
      bridgeRunId: record.bridge.runId,
      bridgeRunAttempt: record.bridge.runAttempt,
    };
  const bridge = /^g12-staging-bridge-run-([1-9]\d*)-([1-9]\d*)$/.exec(commitMessage);
  const compensation = /^g12-staging-(deploy|bridge)-compensation-([1-9]\d*)-([1-9]\d*)$/.exec(commitMessage);
  if (!FULL_SHA_PATTERN.test(candidateSha ?? "") || !UUID_PATTERN.test(deployment?.deploymentId ?? ""))
    return { valid: false, violations: ["deployment_invalid"], mode: "refused" };
  if (!Number.isFinite(Date.parse(deployment?.createdOn ?? "")) || (!bridge && !compensation))
    return { valid: false, violations: ["bridge_marker_invalid"], mode: "refused" };
  const legacyBootstrapCompensation = identifyLegacyBootstrapCompensation({
    record,
    candidateSha,
    commitMessage,
  });
  if (legacyBootstrapCompensation)
    return {
      valid: true,
      violations: [],
      mode: "legacy-bootstrap-compensation",
      trusted: false,
      requiresRemoteVerification: true,
      bridgeRunId: "",
      bridgeRunAttempt: 0,
      compensationRunId: legacyBootstrapCompensation.runId,
      compensationRunAttempt: legacyBootstrapCompensation.runAttempt,
    };
  if (compensation)
    return {
      valid: true,
      violations: [],
      mode: `${compensation[1]}-compensation`,
      trusted: false,
      requiresRemoteVerification: true,
      bridgeRunId: "",
      bridgeRunAttempt: 0,
      compensationRunId: compensation[2],
      compensationRunAttempt: Number(compensation[3]),
    };
  return {
    valid: true,
    violations: [],
    mode: "bridge-v5",
    trusted: false,
    requiresRemoteVerification: true,
    bridgeRunId: bridge[1],
    bridgeRunAttempt: Number(bridge[2]),
    compensationRunId: "",
    compensationRunAttempt: 0,
  };
}

export const STAGING_BASELINE_BOOTSTRAP_REPOSITORY = REPOSITORY;
