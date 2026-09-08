import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { buildProductionMutationMarker } from "./production-mutation-marker-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

const output = resolve(argument("output"));
if (!argument("output")) throw new Error("G12_PRODUCTION_MUTATION_MARKER_OUTPUT_REQUIRED");
const marker = buildProductionMutationMarker({
  candidateSha: process.env.CANDIDATE_SHA,
  baselineDeploymentId: process.env.BASELINE_DEPLOYMENT_ID,
  baselineRelease: process.env.BASELINE_RELEASE,
  baselineCreatedOn: process.env.BASELINE_CREATED_ON,
  baselineCommitMessage: process.env.BASELINE_COMMIT_MESSAGE,
  bridgeRunId: process.env.BRIDGE_RUN_ID,
  bridgeRunAttempt: process.env.BRIDGE_RUN_ATTEMPT,
  bridgeControlSha: process.env.BRIDGE_CONTROL_SHA,
  bridgeEvidenceArtifactId: process.env.BRIDGE_EVIDENCE_ARTIFACT_ID,
  bridgeEvidenceArtifactDigest: process.env.BRIDGE_EVIDENCE_ARTIFACT_DIGEST,
  bridgeDistArtifactId: process.env.BRIDGE_DIST_ARTIFACT_ID,
  bridgeDistArtifactDigest: process.env.BRIDGE_DIST_ARTIFACT_DIGEST,
  bridgeDeploymentId: process.env.BRIDGE_DEPLOYMENT_ID,
  bridgeRelease: process.env.BRIDGE_RELEASE,
  bridgeCreatedOn: process.env.BRIDGE_CREATED_ON,
  bridgeCommitMessage: process.env.BRIDGE_COMMIT_MESSAGE,
  bridgePredecessorDeploymentId: process.env.BRIDGE_PREDECESSOR_DEPLOYMENT_ID,
  bridgePredecessorRelease: process.env.BRIDGE_PREDECESSOR_RELEASE,
  bridgePredecessorCreatedOn: process.env.BRIDGE_PREDECESSOR_CREATED_ON,
  bridgePredecessorCommitMessage: process.env.BRIDGE_PREDECESSOR_COMMIT_MESSAGE,
  approvalRecord: process.env.APPROVAL_RECORD,
  approvalSha256: process.env.APPROVAL_RECORD_SHA256,
  approvedRollbackRelease: process.env.APPROVED_ROLLBACK_RELEASE,
  changeReference: process.env.CHANGE_REFERENCE,
  repository: process.env.GITHUB_REPOSITORY,
  controlSha: process.env.CONTROL_SHA,
  runId: process.env.GITHUB_RUN_ID,
  runAttempt: process.env.GITHUB_RUN_ATTEMPT,
});
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(marker, null, 2)}\n`, { mode: 0o600, flag: "wx" });
console.log(
  JSON.stringify({
    event: "g12.production.mutation_marker.written",
    candidateSha: marker.candidateSha,
    runId: marker.github.runId,
    backendTarget: marker.backendTarget,
    bridgeRunId: marker.bridge.workflowRunId,
    secretsDisclosed: false,
  }),
);
