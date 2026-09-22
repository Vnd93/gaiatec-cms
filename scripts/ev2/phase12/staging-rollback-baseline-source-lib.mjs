import { isDeploymentCommitMessage } from "./deployment-commit-message.mjs";
import { FULL_SHA_PATTERN, UUID_PATTERN } from "./release-guard-lib.mjs";
import { validateStagingBaselineBootstrapRecord } from "./staging-baseline-bootstrap-lib.mjs";

const MARKERS = Object.freeze([
  {
    pattern: /^g12-staging-run-([1-9]\d*)-([1-9]\d*)$/,
    mode: "deploy-v4",
  },
  {
    pattern: /^g12-staging-bridge-run-([1-9]\d*)-([1-9]\d*)$/,
    mode: "bridge-v5",
  },
  {
    pattern: /^g12-staging-(deploy|bridge)-compensation-([1-9]\d*)-([1-9]\d*)$/,
    mode: "compensation",
  },
]);

function validInstant(value) {
  const parsed = Date.parse(value ?? "");
  return typeof value === "string" && Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

export function classifyStagingRollbackBaseline({ record, deployment }) {
  const violations = [];
  if (
    !UUID_PATTERN.test(deployment?.deploymentId ?? "") ||
    !FULL_SHA_PATTERN.test(deployment?.release ?? "") ||
    !validInstant(deployment?.createdOn) ||
    !isDeploymentCommitMessage(deployment?.commitMessage)
  ) {
    violations.push("deployment_identity_invalid");
  }
  const recordResult = validateStagingBaselineBootstrapRecord(record);
  if (!recordResult.valid) violations.push("bootstrap_record_invalid");
  if (violations.length) return { valid: false, mode: "refused", violations };

  if (
    deployment.release === record.candidateSha &&
    deployment.deploymentId === record.canonical.deploymentId &&
    deployment.createdOn === record.canonical.createdOn &&
    deployment.commitMessage === record.canonical.commitMessage
  ) {
    return {
      valid: true,
      mode: "bootstrap",
      runId: record.bridge.runId,
      runAttempt: record.bridge.runAttempt,
      violations: [],
    };
  }

  for (const definition of MARKERS) {
    const match = definition.pattern.exec(deployment.commitMessage);
    if (!match) continue;
    if (definition.mode === "compensation") {
      return {
        valid: true,
        mode: `${match[1]}-compensation`,
        runId: match[2],
        runAttempt: Number(match[3]),
        violations: [],
      };
    }
    return {
      valid: true,
      mode: definition.mode,
      runId: match[1],
      runAttempt: Number(match[2]),
      violations: [],
    };
  }
  return { valid: false, mode: "refused", violations: ["deployment_producer_marker_invalid"] };
}
