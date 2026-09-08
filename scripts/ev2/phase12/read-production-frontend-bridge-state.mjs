import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { encodeDeploymentCommitMessage } from "./deployment-commit-message.mjs";
import { validateFrontendBridgeState } from "./production-frontend-bridge-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

const file = argument("file");
if (!file) throw new Error("G12_FRONTEND_BRIDGE_STATE_FILE_REQUIRED");
const state = JSON.parse(await readFile(resolve(file), "utf8"));
const result = validateFrontendBridgeState(state, {
  runId: process.env.EXPECTED_RUN_ID,
  runAttempt: process.env.EXPECTED_RUN_ATTEMPT,
  controlSha: process.env.EXPECTED_CONTROL_SHA,
  candidateSha: process.env.EXPECTED_CANDIDATE_SHA,
});
if (!result.valid) throw new Error(`G12_FRONTEND_BRIDGE_STATE_REFUSED:${result.violations.join(",")}`);
if (process.env.GITHUB_OUTPUT) {
  await appendFile(
    process.env.GITHUB_OUTPUT,
    [
      `candidate_sha=${state.candidateSha}`,
      `run_marker=${state.runMarker}`,
      `compensation_marker=${state.compensationMarker}`,
      `baseline_deployment_id=${state.baseline.deploymentId}`,
      `baseline_release=${state.baseline.release}`,
      `baseline_created_on=${state.baseline.createdOn}`,
      `baseline_commit_message_b64=${encodeDeploymentCommitMessage(state.baseline.commitMessage)}`,
      `candidate_archive_sha256=${state.dist.archiveSha256}`,
      `candidate_tree_sha256=${state.dist.treeSha256}`,
      `candidate_archive_bytes=${state.dist.archiveBytes}`,
      `predecessor_archive_sha256=${state.predecessorDist.archiveSha256}`,
      `predecessor_tree_sha256=${state.predecessorDist.treeSha256}`,
      `predecessor_archive_bytes=${state.predecessorDist.archiveBytes}`,
      "",
    ].join("\n"),
    "utf8",
  );
}
console.log(
  JSON.stringify({
    event: "g12.production.frontend_bridge.state.verified",
    candidateSha: state.candidateSha,
  }),
);
