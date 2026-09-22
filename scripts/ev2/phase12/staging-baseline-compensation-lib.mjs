import { isDeploymentCommitMessage } from "./deployment-commit-message.mjs";
import { FULL_SHA_PATTERN, UUID_PATTERN } from "./release-guard-lib.mjs";
import { validateStagingDeployRecoveryState } from "./staging-deploy-recovery-state-lib.mjs";

const PREFIXED_SHA256 = /^sha256:[a-f0-9]{64}$/;
const REPOSITORY = "Vnd93/gaiatec-cms";
const MINIMUM_ARTIFACT_REMAINING_MS = 7 * 24 * 60 * 60 * 1000;
const TERMINAL_FAILURES = new Set(["failure", "cancelled", "timed_out", "action_required"]);

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
    stateArtifactName: null,
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
  return { valid: violations.length === 0, violations: [...new Set(violations)] };
}

export const STAGING_BASELINE_COMPENSATION_REPOSITORY = REPOSITORY;
