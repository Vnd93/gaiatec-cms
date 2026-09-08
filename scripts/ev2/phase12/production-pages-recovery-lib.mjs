import { UUID_PATTERN, isFullSha } from "./release-guard-lib.mjs";

export const PRODUCTION_PAGES_RUN_MARKER = /^g12-production-run-([1-9]\d*)-([1-9]\d*)$/;

function validCreatedOn(value) {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function safeCommitMessage(value) {
  return typeof value === "string" && !/[\r\n\0]/.test(value);
}

function validDeployment(value) {
  return (
    value &&
    typeof value === "object" &&
    UUID_PATTERN.test(value.deploymentId ?? "") &&
    isFullSha(value.release) &&
    validCreatedOn(value.createdOn) &&
    safeCommitMessage(value.commitMessage)
  );
}

export function sameProductionPagesDeployment(left, right) {
  return (
    validDeployment(left) &&
    validDeployment(right) &&
    left.deploymentId === right.deploymentId &&
    left.release === right.release &&
    new Date(left.createdOn).toISOString() === new Date(right.createdOn).toISOString() &&
    left.commitMessage === right.commitMessage
  );
}

export function validateProductionPagesRecoveryState(state) {
  const violations = [];
  if (
    !state?.baseline ||
    !UUID_PATTERN.test(state.baseline.deploymentId ?? "") ||
    !isFullSha(state.baseline.release) ||
    !validCreatedOn(state.baseline.createdOn) ||
    !safeCommitMessage(state.baseline.commitMessage)
  )
    violations.push("baseline_invalid");
  if (!state?.owned || !isFullSha(state.owned.release)) violations.push("owned_release_invalid");
  if (!PRODUCTION_PAGES_RUN_MARKER.test(state?.owned?.runMarker ?? ""))
    violations.push("owned_marker_invalid");
  if (Boolean(state?.owned?.deploymentId) !== Boolean(state?.owned?.createdOn))
    violations.push("owned_identity_incomplete");
  if (
    state?.owned?.deploymentId &&
    (!UUID_PATTERN.test(state.owned.deploymentId) || !validCreatedOn(state.owned.createdOn))
  )
    violations.push("owned_deployment_invalid");
  return { valid: violations.length === 0, violations };
}

export function productionPagesRecoveryDecision(current, state) {
  const stateResult = validateProductionPagesRecoveryState(state);
  if (!stateResult.valid)
    throw new Error(`G12_PRODUCTION_PAGES_STATE_REFUSED:${stateResult.violations.join(",")}`);
  if (!validDeployment(current)) throw new Error("G12_PRODUCTION_PAGES_CANONICAL_REFUSED");

  if (sameProductionPagesDeployment(current, state.baseline)) return "already-baseline";

  if (
    current.release === state.owned.release &&
    current.commitMessage === state.owned.runMarker &&
    (!state.owned.deploymentId ||
      (current.deploymentId === state.owned.deploymentId &&
        new Date(current.createdOn).toISOString() === new Date(state.owned.createdOn).toISOString()))
  )
    return "restore-owned-candidate";

  return "external-conflict";
}

export function bindProductionPagesOwnedDeployment(current, deployments, state) {
  if (productionPagesRecoveryDecision(current, state) !== "restore-owned-candidate")
    throw new Error("G12_PRODUCTION_PAGES_OWNERSHIP_REFUSED");
  if (state.owned.deploymentId) return state;
  if (!Array.isArray(deployments)) throw new Error("G12_PRODUCTION_PAGES_OWNERSHIP_REFUSED");
  const matches = deployments.filter(
    (deployment) =>
      validDeployment(deployment) &&
      deployment.release === state.owned.release &&
      deployment.commitMessage === state.owned.runMarker,
  );
  if (matches.length !== 1 || matches[0].deploymentId !== current.deploymentId)
    throw new Error("G12_PRODUCTION_PAGES_OWNERSHIP_AMBIGUOUS");
  return {
    ...state,
    owned: { ...state.owned, deploymentId: current.deploymentId, createdOn: current.createdOn },
  };
}
