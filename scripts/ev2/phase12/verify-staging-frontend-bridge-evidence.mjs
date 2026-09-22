import { appendFile, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { encodeDeploymentCommitMessage } from "./deployment-commit-message.mjs";
import { validateStagingFrontendBridgeEvidence } from "./staging-frontend-bridge-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? "" : process.argv[index + 1];
}
let file = argument("file");
const directory = argument("artifact-dir");
if ((!file && !directory) || (file && directory))
  throw new Error("G12_STAGING_FRONTEND_BRIDGE_LOCATION_REQUIRED");
if (directory) {
  const entries = await readdir(resolve(directory), { withFileTypes: true });
  if (entries.length !== 1 || !entries[0].isFile() || entries[0].isSymbolicLink())
    throw new Error("G12_STAGING_FRONTEND_BRIDGE_ARTIFACT_CONTENTS_REFUSED");
  file = resolve(directory, entries[0].name);
}
const evidence = JSON.parse(await readFile(resolve(file), "utf8"));
const result = validateStagingFrontendBridgeEvidence(evidence, {
  candidateSha: process.env.EXPECTED_RELEASE,
  runId: process.env.EXPECTED_RUN_ID,
  runAttempt: process.env.EXPECTED_RUN_ATTEMPT,
  controlSha: process.env.EXPECTED_CONTROL_SHA,
  deploymentId: process.env.EXPECTED_DEPLOYMENT_ID,
  canonicalCreatedOn: process.env.EXPECTED_CANONICAL_CREATED_ON,
  sourceRunId: process.env.EXPECTED_SOURCE_RUN_ID,
  sourceRunAttempt: process.env.EXPECTED_SOURCE_RUN_ATTEMPT,
  gateRunAttempt: process.env.EXPECTED_GATE_RUN_ATTEMPT,
  artifactId: process.env.EXPECTED_ARTIFACT_ID,
  artifactDigest: process.env.EXPECTED_ARTIFACT_DIGEST,
  artifactName: process.env.EXPECTED_ARTIFACT_NAME,
  artifactEnvironment: process.env.EXPECTED_ARTIFACT_ENVIRONMENT,
  releaseProfile: process.env.EXPECTED_RELEASE_PROFILE,
  matrixSha256: process.env.EXPECTED_MATRIX_SHA256,
  policySha256: process.env.EXPECTED_POLICY_SHA256,
  profileSha256: process.env.EXPECTED_PROFILE_SHA256,
  archiveSha256: process.env.EXPECTED_ARCHIVE_SHA256,
  treeSha256: process.env.EXPECTED_TREE_SHA256,
  archiveBytes: process.env.EXPECTED_ARCHIVE_BYTES,
  fileCount: process.env.EXPECTED_FILE_COUNT,
  byteCount: process.env.EXPECTED_BYTE_COUNT,
});
if (!result.valid)
  throw new Error(`G12_STAGING_FRONTEND_BRIDGE_EVIDENCE_REFUSED:${result.violations.join(",")}`);
if (process.env.GITHUB_OUTPUT)
  await appendFile(
    process.env.GITHUB_OUTPUT,
    [
      `candidate_sha=${evidence.candidateSha}`,
      `promotion_mode=${evidence.promotionMode}`,
      `canonical_deployment_id=${evidence.canonical.deploymentId}`,
      `canonical_release=${evidence.canonical.release}`,
      `canonical_created_on=${new Date(evidence.canonical.createdOn).toISOString()}`,
      `canonical_commit_message_b64=${encodeDeploymentCommitMessage(evidence.canonical.commitMessage)}`,
      `baseline_release=${evidence.baseline.release}`,
      `source_run_id=${evidence.artifact.sourceRunId}`,
      `source_run_attempt=${evidence.artifact.sourceRunAttempt}`,
      `gate_run_attempt=${evidence.artifact.gateRunAttempt}`,
      `artifact_id=${evidence.artifact.artifactId}`,
      `artifact_digest=${evidence.artifact.artifactDigest}`,
      `artifact_name=${evidence.artifact.artifactName}`,
      `artifact_environment=${evidence.artifact.environment}`,
      `release_profile=${evidence.artifact.releaseProfile}`,
      `matrix_sha256=${evidence.artifact.matrixSha256}`,
      `policy_sha256=${evidence.artifact.policySha256}`,
      `profile_sha256=${evidence.artifact.profileSha256}`,
      `archive_sha256=${evidence.dist.archiveSha256}`,
      `tree_sha256=${evidence.dist.treeSha256}`,
      `archive_bytes=${evidence.dist.archiveBytes}`,
      `file_count=${evidence.dist.fileCount}`,
      `byte_count=${evidence.dist.byteCount}`,
      "compatibility_only=true",
      "positive_browser_required_after_full_candidate_deploy=true",
      "",
    ].join("\n"),
    "utf8",
  );
console.log(
  JSON.stringify({
    event: "g12.staging.frontend_bridge.evidence.verified",
    candidateSha: evidence.candidateSha,
    promotionMode: evidence.promotionMode,
    compatibilityOnly: true,
    positiveBrowserRequiredAfterFullCandidateDeploy: true,
  }),
);
