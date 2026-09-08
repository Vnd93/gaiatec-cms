import { appendFile, readFile } from "node:fs/promises";

import { encodeDeploymentCommitMessage } from "./deployment-commit-message.mjs";
import { validateProductionMutationMarker } from "./production-mutation-marker-lib.mjs";

const fileIndex = process.argv.indexOf("--file");
const file = fileIndex >= 0 ? process.argv[fileIndex + 1] : "";
if (!file) throw new Error("G12_PRODUCTION_MUTATION_MARKER_FILE_REQUIRED");
const marker = JSON.parse(await readFile(file, "utf8"));
const result = validateProductionMutationMarker(marker, {
  runId: process.env.EXPECTED_RUN_ID,
  runAttempt: process.env.EXPECTED_RUN_ATTEMPT,
  controlSha: process.env.EXPECTED_CONTROL_SHA,
});
if (!result.valid) throw new Error(`G12_PRODUCTION_MUTATION_MARKER_REFUSED:${result.violations.join(",")}`);
if (process.env.GITHUB_OUTPUT)
  await appendFile(
    process.env.GITHUB_OUTPUT,
    [
      `candidate_sha=${marker.candidateSha}`,
      `baseline_deployment_id=${marker.baseline.deploymentId}`,
      `baseline_release=${marker.baseline.release}`,
      `baseline_created_on=${new Date(marker.baseline.createdOn).toISOString()}`,
      `baseline_commit_message_b64=${encodeDeploymentCommitMessage(marker.baseline.commitMessage)}`,
      `bridge_run_id=${marker.bridge.workflowRunId}`,
      `bridge_run_attempt=${marker.bridge.workflowRunAttempt}`,
      `bridge_control_sha=${marker.bridge.controlSha}`,
      `bridge_evidence_artifact_id=${marker.bridge.evidenceArtifact.id}`,
      `bridge_evidence_artifact_digest=${marker.bridge.evidenceArtifact.digest}`,
      `bridge_dist_artifact_id=${marker.bridge.distArtifact.id}`,
      `bridge_dist_artifact_digest=${marker.bridge.distArtifact.digest}`,
      `bridge_deployment_id=${marker.bridge.production.deploymentId}`,
      `bridge_release=${marker.bridge.production.release}`,
      `bridge_created_on=${new Date(marker.bridge.production.createdOn).toISOString()}`,
      `bridge_commit_message_b64=${encodeDeploymentCommitMessage(marker.bridge.production.commitMessage)}`,
      `authorized_predecessor_release=${marker.approval.authorizedPredecessorRelease}`,
      `pages_run_marker=${marker.pages.runMarker}`,
      `approval_record=${marker.approval.record}`,
      `approval_sha256=${marker.approval.sha256}`,
      `change_reference=${marker.approval.changeReference}`,
      `control_sha=${marker.github.controlSha}`,
      `run_id=${marker.github.runId}`,
      `run_attempt=${marker.github.runAttempt}`,
      `armed_at=${new Date(marker.armedAt).toISOString()}`,
      "",
    ].join("\n"),
    "utf8",
  );
console.log(
  JSON.stringify({
    event: "g12.production.mutation_marker.verified",
    candidateSha: marker.candidateSha,
    runId: marker.github.runId,
    backendTarget: marker.backendTarget,
  }),
);
