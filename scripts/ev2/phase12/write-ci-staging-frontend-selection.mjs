import {
  readCiStagingFrontendSelectionControls,
  verifyCiReleasePlan,
  writeCiStagingFrontendSelection,
} from "./ci-staging-frontend-selection-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

const output = argument("output");
const matrixPath = argument("control-matrix") || argument("matrix");
const controlSelectorPath = argument("control-selector");
const controlLibraryPath = argument("control-library");
const candidateMatrixPath = argument("candidate-matrix");
const candidateCheckpointPolicyPath = argument("candidate-checkpoint-policy");
const policyPath = argument("control-checkpoint-policy") || argument("policy");
const profile = argument("profile");
const releasePlanPath = argument("release-plan");
const candidateSha = argument("candidate");
const expectedBaseSha = argument("expected-base-sha");
const expectedPlanSha256 = argument("expected-plan-sha256");
const expectedMatrixSha256 = argument("expected-matrix-sha256");
const releasePlanArtifactId = argument("release-plan-artifact-id");
const releasePlanArtifactDigest = argument("release-plan-artifact-digest");
const releasePlanArtifactName = argument("release-plan-artifact-name");
if (
  !output ||
  !matrixPath ||
  !controlSelectorPath ||
  !controlLibraryPath ||
  !policyPath ||
  !profile ||
  !releasePlanPath ||
  !/^[a-f0-9]{40}$/.test(candidateSha) ||
  !/^[a-f0-9]{40}$/.test(expectedBaseSha) ||
  !/^[a-f0-9]{64}$/.test(expectedPlanSha256) ||
  !/^[a-f0-9]{64}$/.test(expectedMatrixSha256) ||
  !/^[1-9]\d*$/.test(releasePlanArtifactId) ||
  !/^sha256:[a-f0-9]{64}$/.test(releasePlanArtifactDigest) ||
  !releasePlanArtifactName
) {
  throw new Error("G12_CI_STAGING_FRONTEND_SELECTION_OUTPUT_REQUIRED");
}
const verifiedReleasePlan = await verifyCiReleasePlan(releasePlanPath, {
  baseSha: expectedBaseSha,
  candidateSha,
  planSha256: expectedPlanSha256,
  profile,
  matrixSha256: expectedMatrixSha256,
  controlSha: expectedBaseSha,
  controlSelectorPath,
  controlLibraryPath,
  controlMatrixPath: matrixPath,
  controlCheckpointPolicyPath: policyPath,
  candidateMatrixPath: candidateMatrixPath || undefined,
  candidateCheckpointPolicyPath: candidateCheckpointPolicyPath || undefined,
});
const controls = await readCiStagingFrontendSelectionControls({
  matrixPath,
  policyPath,
  profile,
  expectedMatrixSha256: verifiedReleasePlan.plan.controlMatrixSha256,
  expectedPolicySha256: verifiedReleasePlan.plan.controlCheckpointPolicySha256,
});

const value = await writeCiStagingFrontendSelection(output, {
  ...controls,
  baseSha: verifiedReleasePlan.plan.baseSha,
  controlSha: verifiedReleasePlan.plan.controlSha,
  trustMode: verifiedReleasePlan.plan.trustMode,
  controlImplementationSha256: verifiedReleasePlan.plan.controlImplementationSha256,
  controlMatrixSha256: verifiedReleasePlan.plan.controlMatrixSha256,
  candidateMatrixSha256: verifiedReleasePlan.plan.candidateMatrixSha256,
  controlCheckpointPolicySha256: verifiedReleasePlan.plan.controlCheckpointPolicySha256,
  candidateCheckpointPolicySha256: verifiedReleasePlan.plan.candidateCheckpointPolicySha256,
  checkpointPolicySha256: verifiedReleasePlan.plan.checkpointPolicySha256,
  planSha256: verifiedReleasePlan.planSha256,
  releasePlanArtifactId,
  releasePlanArtifactDigest,
  releasePlanArtifactName,
  candidateSha,
  runId: argument("run-id"),
  gateRunAttempt: argument("gate-run-attempt"),
  sourceRunId: argument("source-run-id"),
  sourceRunAttempt: argument("source-run-attempt"),
  artifactId: argument("artifact-id"),
  artifactDigest: argument("artifact-digest"),
  artifactName: argument("artifact-name"),
  profileSha256: argument("profile-sha256"),
  archiveSha256: argument("archive-sha256"),
  treeSha256: argument("tree-sha256"),
  archiveBytes: argument("archive-bytes"),
  fileCount: argument("file-count"),
  byteCount: argument("byte-count"),
  sealSha256: argument("seal-sha256"),
  provenanceSha256: argument("provenance-sha256"),
});

console.log(
  JSON.stringify({
    event: "g12.ci.staging_frontend.selection_written",
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
