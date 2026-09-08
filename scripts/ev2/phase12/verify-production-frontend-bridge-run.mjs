import { appendFile } from "node:fs/promises";

import {
  FRONTEND_BRIDGE_REPOSITORY,
  selectFrontendBridgeArtifact,
  selectFrontendBridgeDistArtifact,
  validateFrontendBridgeGitHubRun,
} from "./production-frontend-bridge-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

const runId = argument("run-id");
const expectedRelease = argument("expected-release");
const token = process.env.GITHUB_TOKEN ?? "";
if (!/^[1-9][0-9]*$/.test(runId) || !/^[a-f0-9]{40}$/.test(expectedRelease) || !token)
  throw new Error("G12_FRONTEND_BRIDGE_RUN_INPUT_REFUSED");
const headers = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "gaiatec-production-frontend-bridge-gate",
};
async function githubJson(path) {
  const response = await fetch(`https://api.github.com/repos/${FRONTEND_BRIDGE_REPOSITORY}${path}`, {
    headers,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`G12_FRONTEND_BRIDGE_GITHUB_API_FAILED:${response.status}`);
  return response.json();
}
const run = await githubJson(`/actions/runs/${runId}`);
const runResult = validateFrontendBridgeGitHubRun({
  repository: process.env.GITHUB_REPOSITORY,
  run,
  runId,
  expectedRelease,
});
if (!runResult.valid) throw new Error(`G12_FRONTEND_BRIDGE_RUN_REFUSED:${runResult.violations.join(",")}`);
const payload = await githubJson(`/actions/runs/${runId}/artifacts?per_page=100`);
const artifactResult = selectFrontendBridgeArtifact({
  artifacts: payload?.artifacts,
  run,
  expectedRelease,
});
if (!artifactResult.valid)
  throw new Error(`G12_FRONTEND_BRIDGE_ARTIFACT_REFUSED:${artifactResult.violations.join(",")}`);
const distArtifactResult = selectFrontendBridgeDistArtifact({
  artifacts: payload?.artifacts,
  run,
  expectedRelease,
});
if (!distArtifactResult.valid)
  throw new Error(`G12_FRONTEND_BRIDGE_DIST_ARTIFACT_REFUSED:${distArtifactResult.violations.join(",")}`);
if (!process.env.GITHUB_OUTPUT) throw new Error("G12_FRONTEND_BRIDGE_GITHUB_OUTPUT_REQUIRED");
await appendFile(
  process.env.GITHUB_OUTPUT,
  [
    `artifact_id=${artifactResult.artifact.id}`,
    `artifact_digest=${artifactResult.artifact.digest}`,
    `dist_artifact_id=${distArtifactResult.artifact.id}`,
    `dist_artifact_digest=${distArtifactResult.artifact.digest}`,
    `control_sha=${run.head_sha}`,
    `run_attempt=${run.run_attempt}`,
    "",
  ].join("\n"),
  "utf8",
);
console.log(
  JSON.stringify({
    event: "g12.production.frontend_bridge.run.verified",
    runId,
    runAttempt: run.run_attempt,
    expectedRelease,
    artifactId: artifactResult.artifact.id,
    secretsExposed: false,
  }),
);
