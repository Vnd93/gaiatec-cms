import { isDeploymentCommitMessage } from "./deployment-commit-message.mjs";
import { FULL_SHA_PATTERN, UUID_PATTERN } from "./release-guard-lib.mjs";
import { validateStagingBaselineBootstrapRecord } from "./staging-baseline-bootstrap-lib.mjs";
import { validateStagingDeployRecoveryState } from "./staging-deploy-recovery-state-lib.mjs";

const PREFIXED_SHA256 = /^sha256:[a-f0-9]{64}$/;
const REPOSITORY = "Vnd93/gaiatec-cms";
const MINIMUM_ARTIFACT_REMAINING_MS = 7 * 24 * 60 * 60 * 1000;
const TERMINAL_FAILURES = new Set(["failure", "cancelled", "timed_out", "action_required"]);
const BRIDGE_RERUN_REQUIRED_COMPENSATION_STEPS = Object.freeze([
  "Upload mandatory exact bridge recovery bytes before state or mutation",
  "Upload immutable bridge recovery state after binding exact baseline identity",
  "Download just-uploaded bridge recovery state by immutable artifact ID",
  "Download just-uploaded exact bridge recovery bytes by immutable artifact ID",
  "Reverify remote bridge state and exact recovery bytes before mutation",
  "Persist redundant HMAC bridge state only after remote recovery proof",
  "Promote exact A to canonical staging alias with CAS",
  "Restore the candidate public backend in every outcome",
  "Automatically restore old staging frontend on failure",
  "Reconfirm compensated canonical staging before clearing recovery state",
  "Probe compensated canonical staging before clearing recovery state",
  "Seal non-sensitive automatic bridge compensation evidence",
  "Upload mandatory automatic bridge compensation evidence",
  "Verify automatic bridge compensation artifact identity",
  "Clear redundant recovery state only after success or proven compensation",
  "Upload mandatory legacy backend restore evidence before lease release",
  "Verify mandatory legacy backend restore artifact identity",
  "Release the legacy backend lease only after a proven restore",
]);
const BRIDGE_RERUN_FAILURE_STEP = "Resolve the exact failed run and immutable compensation artifacts";
const BRIDGE_RERUN_FIRST_MUTATION_STEP =
  "Persist redundant HMAC bridge state only after remote recovery proof";

const MODE = Object.freeze({
  "deploy-compensation": {
    marker: "deploy",
    workflowName: "Deploy staging",
    workflowPath: ".github/workflows/deploy-staging.yml",
    stateArtifactName: (runId, runAttempt) => `staging-deploy-state-${runId}-${runAttempt}`,
    recoveryArtifactName: (runId, runAttempt) => `staging-recovery-${runId}-${runAttempt}`,
    runMarker: (runId, runAttempt) => `g12-staging-run-${runId}-${runAttempt}`,
  },
  "bridge-compensation": {
    marker: "bridge",
    workflowName: "Promote staging frontend bridge",
    workflowPath: ".github/workflows/promote-staging-frontend-bridge.yml",
    stateArtifactName: (runId, runAttempt) => `staging-frontend-bridge-state-${runId}-${runAttempt}`,
    recoveryArtifactName: (runId, runAttempt) => `staging-frontend-bridge-recovery-${runId}-${runAttempt}`,
    runMarker: (runId, runAttempt) => `g12-staging-bridge-run-${runId}-${runAttempt}`,
  },
});

function exactKeys(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort())
  );
}

function definition(mode) {
  const value = MODE[mode];
  if (!value) throw new Error("G12_STAGING_BASELINE_COMPENSATION_MODE_REFUSED");
  return value;
}

export function parseStagingCompensationMarker(commitMessage) {
  const match = /^g12-staging-(deploy|bridge)-compensation-([1-9]\d*)-([1-9]\d*)$/.exec(
    String(commitMessage ?? ""),
  );
  if (!match) return { valid: false, violations: ["compensation_marker_invalid"] };
  return {
    valid: true,
    violations: [],
    mode: `${match[1]}-compensation`,
    runId: match[2],
    runAttempt: Number(match[3]),
  };
}

export function validateStagingCompensationRun({ run, mode, runId, runAttempt, repository }) {
  const config = definition(mode);
  const violations = [];
  if (repository !== REPOSITORY || run?.repository?.full_name !== REPOSITORY)
    violations.push("repository_invalid");
  if (String(run?.id ?? "") !== String(runId ?? "")) violations.push("run_id_invalid");
  if (!Number.isSafeInteger(Number(runAttempt)) || Number(runAttempt) < 1)
    violations.push("run_attempt_invalid");
  if (Number(run?.run_attempt) !== Number(runAttempt)) violations.push("run_attempt_mismatch");
  if (run?.name !== config.workflowName || run?.path !== config.workflowPath)
    violations.push("workflow_invalid");
  if (
    run?.event !== "workflow_dispatch" ||
    run?.head_branch !== "main" ||
    run?.status !== "completed" ||
    !TERMINAL_FAILURES.has(run?.conclusion) ||
    String(run?.actor?.login ?? "").toLowerCase() !== "vnd93" ||
    String(run?.triggering_actor?.login ?? "").toLowerCase() !== "vnd93" ||
    !FULL_SHA_PATTERN.test(run?.head_sha ?? "")
  )
    violations.push("run_invalid");
  return { valid: violations.length === 0, violations: [...new Set(violations)] };
}

function validateArtifact(artifact, expectedName, run, now) {
  return (
    Number.isSafeInteger(artifact?.id) &&
    artifact.id > 0 &&
    artifact?.name === expectedName &&
    PREFIXED_SHA256.test(artifact?.digest ?? "") &&
    artifact?.expired === false &&
    Number.isSafeInteger(artifact?.size_in_bytes) &&
    artifact.size_in_bytes > 0 &&
    Number.isFinite(Date.parse(artifact?.expires_at ?? "")) &&
    Date.parse(artifact.expires_at) >= now + MINIMUM_ARTIFACT_REMAINING_MS &&
    String(artifact?.workflow_run?.id ?? "") === String(run?.id ?? "") &&
    artifact?.workflow_run?.head_sha === run?.head_sha
  );
}

export function selectStagingCompensationArtifacts({
  artifacts,
  run,
  mode,
  runId,
  runAttempt,
  now = Date.now(),
}) {
  const config = definition(mode);
  const values = Array.isArray(artifacts) ? artifacts : [];
  const recoveryName = config.recoveryArtifactName(runId, runAttempt);
  const recoveryMatches = values.filter((entry) => entry?.name === recoveryName);
  const violations = [];
  if (recoveryMatches.length !== 1 || !validateArtifact(recoveryMatches[0], recoveryName, run, now))
    violations.push("recovery_artifact_invalid");

  let stateArtifact = null;
  if (config.stateArtifactName) {
    const stateName = config.stateArtifactName(runId, runAttempt);
    const stateMatches = values.filter((entry) => entry?.name === stateName);
    if (stateMatches.length !== 1 || !validateArtifact(stateMatches[0], stateName, run, now))
      violations.push("state_artifact_invalid");
    else stateArtifact = stateMatches[0];
  }
  return {
    valid: violations.length === 0,
    violations: [...new Set(violations)],
    recoveryArtifact: violations.includes("recovery_artifact_invalid") ? null : recoveryMatches[0],
    stateArtifact,
  };
}

export function validateStagingCompensationArtifactList(payload) {
  const artifacts = Array.isArray(payload?.artifacts) ? payload.artifacts : [];
  const valid =
    Number.isSafeInteger(payload?.total_count) &&
    payload.total_count === artifacts.length &&
    payload.total_count <= 100;
  return {
    valid,
    violations: valid ? [] : ["artifact_list_incomplete"],
    artifacts,
  };
}

function completeJobs(payload) {
  const jobs = Array.isArray(payload?.jobs) ? payload.jobs : [];
  return (
    Number.isSafeInteger(payload?.total_count) &&
    payload.total_count === jobs.length &&
    payload.total_count > 0 &&
    payload.total_count <= 100
  );
}

function uniqueJob(payload, name) {
  const matches = (Array.isArray(payload?.jobs) ? payload.jobs : []).filter((entry) => entry?.name === name);
  return matches.length === 1 ? matches[0] : null;
}

function uniqueStep(job, name) {
  const matches = (Array.isArray(job?.steps) ? job.steps : []).filter((entry) => entry?.name === name);
  return matches.length === 1 ? matches[0] : null;
}

function successfulStep(job, name) {
  const step = uniqueStep(job, name);
  return step?.status === "completed" && step?.conclusion === "success";
}

export function validateStagingBridgeRerunArtifactLossFallback({
  record,
  expectedRelease,
  artifacts,
  markerRun,
  currentRun,
  markerJobs,
  currentJobs,
  mode,
  runId,
  runAttempt,
  repository,
}) {
  const violations = [];
  if (mode !== "bridge-compensation") return { valid: false, violations: ["fallback_mode_invalid"] };
  if (!validateStagingBaselineBootstrapRecord(record).valid) violations.push("fallback_record_invalid");
  if (expectedRelease !== record?.candidateSha || !FULL_SHA_PATTERN.test(expectedRelease ?? ""))
    violations.push("fallback_release_invalid");

  const markerValidation = validateStagingCompensationRun({
    run: markerRun,
    mode,
    runId,
    runAttempt,
    repository,
  });
  if (!markerValidation.valid) violations.push("fallback_marker_run_invalid");

  const currentAttempt = Number(currentRun?.run_attempt);
  const currentValidation = validateStagingCompensationRun({
    run: currentRun,
    mode,
    runId,
    runAttempt: currentAttempt,
    repository,
  });
  if (!currentValidation.valid) violations.push("fallback_current_run_invalid");
  if (
    !Number.isSafeInteger(currentAttempt) ||
    currentAttempt !== Number(runAttempt) + 1 ||
    currentRun?.head_sha !== markerRun?.head_sha
  )
    violations.push("fallback_attempt_chain_invalid");

  const config = definition(mode);
  const values = Array.isArray(artifacts) ? artifacts : [];
  const lostNames = [
    config.stateArtifactName(runId, runAttempt),
    config.recoveryArtifactName(runId, runAttempt),
  ];
  if (lostNames.some((name) => values.some((artifact) => artifact?.name === name)))
    violations.push("fallback_artifact_loss_unproven");

  if (!completeJobs(markerJobs)) violations.push("fallback_marker_jobs_invalid");
  const markerPromote = uniqueJob(markerJobs, "promote");
  if (
    !markerPromote ||
    markerPromote.status !== "completed" ||
    !TERMINAL_FAILURES.has(markerPromote.conclusion) ||
    !BRIDGE_RERUN_REQUIRED_COMPENSATION_STEPS.every((name) => successfulStep(markerPromote, name))
  )
    violations.push("fallback_compensation_steps_invalid");

  if (!completeJobs(currentJobs)) violations.push("fallback_current_jobs_invalid");
  const currentPromote = uniqueJob(currentJobs, "promote");
  const failureStep = uniqueStep(currentPromote, BRIDGE_RERUN_FAILURE_STEP);
  const mutationStep = uniqueStep(currentPromote, BRIDGE_RERUN_FIRST_MUTATION_STEP);
  if (
    !currentPromote ||
    currentPromote.status !== "completed" ||
    currentPromote.conclusion !== "failure" ||
    failureStep?.status !== "completed" ||
    failureStep?.conclusion !== "failure" ||
    mutationStep?.status !== "completed" ||
    mutationStep?.conclusion !== "skipped"
  )
    violations.push("fallback_current_failure_boundary_invalid");

  return { valid: violations.length === 0, violations: [...new Set(violations)] };
}

export function validateStagingCompensationState({
  state,
  mode,
  runId,
  runAttempt,
  controlSha,
  expectedRelease,
}) {
  const config = definition(mode);
  if (mode === "deploy-compensation") {
    const result = validateStagingDeployRecoveryState(state, {
      runId,
      attempt: runAttempt,
      controlSha,
      originalRelease: expectedRelease,
    });
    return { valid: result.valid, violations: result.violations };
  }
  const violations = [];
  if (
    !exactKeys(state, [
      "schemaVersion",
      "event",
      "workflow",
      "project",
      "branch",
      "runMarker",
      "compensationMarker",
      "candidateRelease",
      "original",
      "recovery",
    ]) ||
    state?.schemaVersion !== 1 ||
    state?.event !== "g12.staging.deploy.prepared" ||
    state?.project !== "gaiatec-cms-staging" ||
    state?.branch !== "ev2-g17-canary"
  )
    violations.push("state_schema_invalid");
  if (
    !exactKeys(state?.workflow, ["runId", "runAttempt", "controlSha"]) ||
    String(state?.workflow?.runId ?? "") !== String(runId ?? "") ||
    Number(state?.workflow?.runAttempt) !== Number(runAttempt) ||
    state?.workflow?.controlSha !== controlSha ||
    !FULL_SHA_PATTERN.test(controlSha ?? "")
  )
    violations.push("state_workflow_invalid");
  if (
    state?.runMarker !== config.runMarker(runId, runAttempt) ||
    state?.compensationMarker !== `g12-staging-${config.marker}-compensation-${runId}-${runAttempt}`
  )
    violations.push("state_marker_invalid");
  if (
    !FULL_SHA_PATTERN.test(state?.candidateRelease ?? "") ||
    !FULL_SHA_PATTERN.test(expectedRelease ?? "") ||
    !exactKeys(state?.original, ["deploymentId", "release", "createdOn", "commitMessage"]) ||
    !UUID_PATTERN.test(state?.original?.deploymentId ?? "") ||
    state?.original?.release !== expectedRelease ||
    !Number.isFinite(Date.parse(state?.original?.createdOn ?? "")) ||
    !isDeploymentCommitMessage(state?.original?.commitMessage)
  )
    violations.push("state_original_invalid");
  if (
    !exactKeys(state?.recovery, ["artifact", "seal"]) ||
    !exactKeys(state?.recovery?.artifact, ["id", "digest", "name"]) ||
    !exactKeys(state?.recovery?.seal, [
      "schemaVersion",
      "candidateSha",
      "fileCount",
      "byteCount",
      "treeSha256",
      "archiveFile",
      "archiveBytes",
      "archiveSha256",
    ]) ||
    !/^[1-9]\d*$/.test(state?.recovery?.artifact?.id ?? "") ||
    !PREFIXED_SHA256.test(state?.recovery?.artifact?.digest ?? "") ||
    state?.recovery?.artifact?.name !== `staging-frontend-bridge-recovery-${runId}-${runAttempt}` ||
    state?.recovery?.seal?.schemaVersion !== 2 ||
    state?.recovery?.seal?.candidateSha !== expectedRelease ||
    !Number.isSafeInteger(state?.recovery?.seal?.fileCount) ||
    state.recovery.seal.fileCount < 1 ||
    !Number.isSafeInteger(state?.recovery?.seal?.byteCount) ||
    state.recovery.seal.byteCount < 1 ||
    !Number.isSafeInteger(state?.recovery?.seal?.archiveBytes) ||
    state.recovery.seal.archiveBytes < 1 ||
    !/^[a-f0-9]{64}$/.test(state?.recovery?.seal?.treeSha256 ?? "") ||
    !/^[a-f0-9]{64}$/.test(state?.recovery?.seal?.archiveSha256 ?? "") ||
    !["staging-frontend-dist.tar", "staging-candidate-dist.tar"].includes(state?.recovery?.seal?.archiveFile)
  )
    violations.push("state_recovery_invalid");
  return { valid: violations.length === 0, violations: [...new Set(violations)] };
}

export const STAGING_BASELINE_COMPENSATION_REPOSITORY = REPOSITORY;
