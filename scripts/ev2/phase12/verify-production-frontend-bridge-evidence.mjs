import { appendFile, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { encodeDeploymentCommitMessage } from "./deployment-commit-message.mjs";
import { validateFrontendBridgeEvidence } from "./production-frontend-bridge-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

const directory = argument("artifact-dir");
const file = argument("file");
if ((!directory && !file) || (directory && file))
  throw new Error("G12_FRONTEND_BRIDGE_EVIDENCE_LOCATION_REQUIRED");
let evidenceFile = file ? resolve(file) : "";
if (directory) {
  const root = resolve(directory);
  const entries = await readdir(root, { withFileTypes: true });
  if (entries.length !== 1 || !entries[0].isFile() || entries[0].isSymbolicLink())
    throw new Error("G12_FRONTEND_BRIDGE_ARTIFACT_CONTENTS_REFUSED");
  evidenceFile = resolve(root, entries[0].name);
}
const evidence = JSON.parse(await readFile(evidenceFile, "utf8"));
const result = validateFrontendBridgeEvidence(evidence, {
  runId: process.env.EXPECTED_RUN_ID,
  controlSha: process.env.EXPECTED_CONTROL_SHA,
  candidateSha: process.env.EXPECTED_RELEASE,
  deploymentId: process.env.EXPECTED_DEPLOYMENT_ID,
});
if (!result.valid) throw new Error(`G12_FRONTEND_BRIDGE_EVIDENCE_REFUSED:${result.violations.join(",")}`);
if (process.env.GITHUB_OUTPUT)
  await appendFile(
    process.env.GITHUB_OUTPUT,
    [
      `candidate_sha=${evidence.candidateSha}`,
      `run_id=${evidence.workflow.runId}`,
      `run_attempt=${evidence.workflow.runAttempt}`,
      `control_sha=${evidence.workflow.controlSha}`,
      `production_deployment_id=${evidence.production.deploymentId}`,
      `production_release=${evidence.production.release}`,
      `production_created_on=${new Date(evidence.production.createdOn).toISOString()}`,
      `production_commit_message_b64=${encodeDeploymentCommitMessage(evidence.production.commitMessage)}`,
      `predecessor_deployment_id=${evidence.baseline.deploymentId}`,
      `predecessor_release=${evidence.baseline.release}`,
      `predecessor_created_on=${new Date(evidence.baseline.createdOn).toISOString()}`,
      `predecessor_commit_message_b64=${encodeDeploymentCommitMessage(evidence.baseline.commitMessage)}`,
      `dist_archive_sha256=${evidence.dist.archiveSha256}`,
      `dist_tree_sha256=${evidence.dist.treeSha256}`,
      "",
    ].join("\n"),
    "utf8",
  );
console.log(
  JSON.stringify({
    event: "g12.production.frontend_bridge.evidence.verified",
    candidateSha: evidence.candidateSha,
    deploymentId: evidence.production.deploymentId,
    rollbackReady: evidence.rollbackReady,
    backendMutation: evidence.backendMutation,
  }),
);
