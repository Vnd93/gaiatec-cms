import { appendFile } from "node:fs/promises";

import {
  readCiStagingFrontendSelectionControls,
  validateCiStagingFrontendSelection,
  verifyCiReleasePlan,
  verifyCiStagingFrontendSelection,
} from "./ci-staging-frontend-selection-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

const file = argument("file");
const matrixPath = argument("control-matrix") || argument("matrix");
const controlSelectorPath = argument("control-selector");
const controlLibraryPath = argument("control-library");
const candidateMatrixPath = argument("candidate-matrix");
const candidateCheckpointPolicyPath = argument("candidate-checkpoint-policy");
const policyPath = argument("control-checkpoint-policy") || argument("policy");
const releasePlanPath = argument("release-plan");
const releasePlanArtifactId = argument("release-plan-artifact-id");
const releasePlanArtifactDigest = argument("release-plan-artifact-digest");
const releasePlanArtifactName = argument("release-plan-artifact-name");
if (
  !file ||
  !matrixPath ||
  !controlSelectorPath ||
  !controlLibraryPath ||
  !policyPath ||
  !releasePlanPath ||
  !/^[1-9]\d*$/.test(releasePlanArtifactId) ||
  !/^sha256:[a-f0-9]{64}$/.test(releasePlanArtifactDigest) ||
  !releasePlanArtifactName
) {
  throw new Error("G12_CI_STAGING_FRONTEND_SELECTION_FILE_REQUIRED");
}
const value = await verifyCiStagingFrontendSelection(file, {
  candidateSha: argument("candidate"),
  runId: argument("run-id"),
  gateRunAttempt: argument("gate-run-attempt"),
  sourceRunId: argument("source-run-id"),
  sourceRunAttempt: argument("source-run-attempt"),
  artifactId: argument("artifact-id"),
  artifactDigest: argument("artifact-digest"),
  artifactName: argument("artifact-name"),
  baseSha: argument("base-sha"),
  planSha256: argument("plan-sha256"),
  releasePlanArtifactId,
  releasePlanArtifactDigest,
  releasePlanArtifactName,
});
const controls = await readCiStagingFrontendSelectionControls({
  matrixPath,
  policyPath,
  profile: value.checkpoint.profile,
});
const verifiedReleasePlan = await verifyCiReleasePlan(releasePlanPath, {
  baseSha: value.releasePlan.baseSha,
  candidateSha: value.releasePlan.candidateSha,
  planSha256: value.releasePlan.planSha256,
  profile: value.releasePlan.profile,
  matrixSha256: value.releasePlan.matrixSha256,
  controlSha: value.releasePlan.controlSha,
  trustMode: value.releasePlan.trustMode,
  controlSelectorPath,
  controlLibraryPath,
  controlMatrixPath: matrixPath,
  controlCheckpointPolicyPath: policyPath,
  candidateMatrixPath: candidateMatrixPath || undefined,
  candidateCheckpointPolicyPath: candidateCheckpointPolicyPath || undefined,
});
const controlResult = validateCiStagingFrontendSelection(value, {
  ...controls,
  controlSha: verifiedReleasePlan.plan.controlSha,
  trustMode: verifiedReleasePlan.plan.trustMode,
  controlImplementationSha256: verifiedReleasePlan.plan.controlImplementationSha256,
  controlMatrixSha256: verifiedReleasePlan.plan.controlMatrixSha256,
  candidateMatrixSha256: verifiedReleasePlan.plan.candidateMatrixSha256,
  controlCheckpointPolicySha256: verifiedReleasePlan.plan.controlCheckpointPolicySha256,
  candidateCheckpointPolicySha256: verifiedReleasePlan.plan.candidateCheckpointPolicySha256,
  checkpointPolicySha256: verifiedReleasePlan.plan.checkpointPolicySha256,
});
if (!controlResult.valid)
  throw new Error(`G12_CI_STAGING_FRONTEND_SELECTION_REFUSED:${controlResult.violations.join(",")}`);

if (process.env.GITHUB_OUTPUT) {
  await appendFile(
    process.env.GITHUB_OUTPUT,
    [
      `gate_run_id=${value.workflow.runId}`,
      `gate_run_attempt=${value.workflow.gateRunAttempt}`,
      `control_sha=${value.workflow.controlSha}`,
      `release_profile=${value.checkpoint.profile}`,
      `matrix_sha256=${value.checkpoint.matrixSha256}`,
      `policy_sha256=${value.checkpoint.policySha256}`,
      `base_sha=${value.releasePlan.baseSha}`,
      `release_plan_control_sha=${value.releasePlan.controlSha}`,
      `release_plan_trust_mode=${value.releasePlan.trustMode}`,
      `control_implementation_sha256=${value.releasePlan.controlImplementationSha256}`,
      `control_matrix_sha256=${value.releasePlan.controlMatrixSha256}`,
      `control_checkpoint_policy_sha256=${value.releasePlan.controlCheckpointPolicySha256}`,
      `plan_sha256=${value.releasePlan.planSha256}`,
      `release_plan_artifact_id=${value.releasePlan.artifactId}`,
      `release_plan_artifact_digest=${value.releasePlan.artifactDigest}`,
      `release_plan_artifact_name=${value.releasePlan.artifactName}`,
      `source_run_id=${value.package.sourceRunId}`,
      `source_run_attempt=${value.package.sourceRunAttempt}`,
      `artifact_id=${value.package.artifactId}`,
      `artifact_digest=${value.package.artifactDigest}`,
      `artifact_name=${value.package.artifactName}`,
      `artifact_environment=${value.package.environment}`,
      `profile_sha256=${value.package.profileSha256}`,
      `archive_sha256=${value.dist.archiveSha256}`,
      `tree_sha256=${value.dist.treeSha256}`,
      `archive_bytes=${value.dist.archiveBytes}`,
      `file_count=${value.dist.fileCount}`,
      `byte_count=${value.dist.byteCount}`,
      `seal_sha256=${value.dist.sealSha256}`,
      `provenance_sha256=${value.dist.provenanceSha256}`,
      "",
    ].join("\n"),
    "utf8",
  );
}

console.log(
  JSON.stringify({
    event: "g12.ci.staging_frontend.selection_verified",
    gateRunId: value.workflow.runId,
    gateRunAttempt: value.workflow.gateRunAttempt,
    sourceRunId: value.package.sourceRunId,
    sourceRunAttempt: value.package.sourceRunAttempt,
    artifactId: value.package.artifactId,
    artifactDigestPresent: true,
    candidateSha: value.workflow.controlSha,
    baseSha: value.releasePlan.baseSha,
    releasePlanControlSha: value.releasePlan.controlSha,
    releasePlanTrustMode: value.releasePlan.trustMode,
    controlImplementationSha256: value.releasePlan.controlImplementationSha256,
    controlMatrixSha256: value.releasePlan.controlMatrixSha256,
    controlCheckpointPolicySha256: value.releasePlan.controlCheckpointPolicySha256,
    planSha256: value.releasePlan.planSha256,
    releasePlanArtifactId: value.releasePlan.artifactId,
    releasePlanArtifactDigestPresent: true,
    releasePlanArtifactName: value.releasePlan.artifactName,
    profile: value.checkpoint.profile,
    matrixSha256: value.checkpoint.matrixSha256,
    policySha256: value.checkpoint.policySha256,
    secretsExposed: false,
  }),
);
