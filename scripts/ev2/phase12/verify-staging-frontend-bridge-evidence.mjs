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
  controlSha: process.env.EXPECTED_CONTROL_SHA,
  deploymentId: process.env.EXPECTED_DEPLOYMENT_ID,
});
if (!result.valid)
  throw new Error(`G12_STAGING_FRONTEND_BRIDGE_EVIDENCE_REFUSED:${result.violations.join(",")}`);
if (process.env.GITHUB_OUTPUT)
  await appendFile(
    process.env.GITHUB_OUTPUT,
    [
      `candidate_sha=${evidence.candidateSha}`,
      `canonical_deployment_id=${evidence.canonical.deploymentId}`,
      `canonical_release=${evidence.canonical.release}`,
      `canonical_created_on=${new Date(evidence.canonical.createdOn).toISOString()}`,
      `canonical_commit_message_b64=${encodeDeploymentCommitMessage(evidence.canonical.commitMessage)}`,
      `baseline_release=${evidence.baseline.release}`,
      `archive_sha256=${evidence.dist.archiveSha256}`,
      `tree_sha256=${evidence.dist.treeSha256}`,
      "",
    ].join("\n"),
    "utf8",
  );
console.log(
  JSON.stringify({
    event: "g12.staging.frontend_bridge.evidence.verified",
    candidateSha: evidence.candidateSha,
  }),
);
