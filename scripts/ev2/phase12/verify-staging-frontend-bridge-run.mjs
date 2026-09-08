import { appendFile } from "node:fs/promises";
import {
  selectStagingFrontendBridgeArtifact,
  STAGING_FRONTEND_BRIDGE_REPOSITORY,
  validateStagingFrontendBridgeRun,
} from "./staging-frontend-bridge-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? "" : process.argv[index + 1];
}
const runId = argument("run-id");
const candidateSha = argument("expected-release");
const token = process.env.GITHUB_TOKEN ?? "";
if (!/^[1-9]\d*$/.test(runId) || !/^[a-f0-9]{40}$/.test(candidateSha) || !token)
  throw new Error("G12_STAGING_FRONTEND_BRIDGE_RUN_INPUT_REFUSED");
const headers = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "gaiatec-staging-frontend-bridge-gate",
};
async function github(path) {
  const response = await fetch(`https://api.github.com/repos/${STAGING_FRONTEND_BRIDGE_REPOSITORY}${path}`, {
    headers,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`G12_STAGING_FRONTEND_BRIDGE_GITHUB_FAILED:${response.status}`);
  return response.json();
}
const run = await github(`/actions/runs/${runId}`);
const runResult = validateStagingFrontendBridgeRun({
  run,
  runId,
  repository: process.env.GITHUB_REPOSITORY,
  candidateSha,
});
if (!runResult.valid)
  throw new Error(`G12_STAGING_FRONTEND_BRIDGE_RUN_REFUSED:${runResult.violations.join(",")}`);
const artifacts = await github(`/actions/runs/${runId}/artifacts?per_page=100`);
const selected = selectStagingFrontendBridgeArtifact({ artifacts: artifacts?.artifacts, run, candidateSha });
if (!selected.valid)
  throw new Error(`G12_STAGING_FRONTEND_BRIDGE_ARTIFACT_REFUSED:${selected.violations.join(",")}`);
if (!process.env.GITHUB_OUTPUT) throw new Error("G12_STAGING_FRONTEND_BRIDGE_OUTPUT_REQUIRED");
await appendFile(
  process.env.GITHUB_OUTPUT,
  [
    `artifact_id=${selected.artifact.id}`,
    `artifact_digest=${selected.artifact.digest}`,
    `control_sha=${run.head_sha}`,
    `run_attempt=${run.run_attempt}`,
    "",
  ].join("\n"),
  "utf8",
);
console.log(JSON.stringify({ event: "g12.staging.frontend_bridge.run.verified", runId, candidateSha }));
