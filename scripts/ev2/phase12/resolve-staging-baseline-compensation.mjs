import { appendFile } from "node:fs/promises";

import {
  selectStagingCompensationArtifacts,
  STAGING_BASELINE_COMPENSATION_REPOSITORY,
  validateStagingCompensationRun,
} from "./staging-baseline-compensation-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

const mode = argument("mode");
const runId = argument("run-id");
const runAttempt = Number(argument("run-attempt"));
const token = process.env.GITHUB_TOKEN ?? "";
if (
  !["deploy-compensation", "bridge-compensation"].includes(mode) ||
  !/^[1-9]\d*$/.test(runId) ||
  !Number.isSafeInteger(runAttempt) ||
  runAttempt < 1 ||
  !token
)
  throw new Error("G12_STAGING_BASELINE_COMPENSATION_INPUT_REFUSED");

const headers = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "gaiatec-staging-baseline-compensation-gate",
};

async function github(path) {
  const response = await fetch(
    `https://api.github.com/repos/${STAGING_BASELINE_COMPENSATION_REPOSITORY}${path}`,
    { headers, signal: AbortSignal.timeout(30_000) },
  );
  if (!response.ok) throw new Error(`G12_STAGING_BASELINE_COMPENSATION_GITHUB_FAILED:${response.status}`);
  return response.json();
}

const run = await github(`/actions/runs/${runId}/attempts/${runAttempt}`);
const runResult = validateStagingCompensationRun({
  run,
  mode,
  runId,
  runAttempt,
  repository: process.env.GITHUB_REPOSITORY,
});
if (!runResult.valid)
  throw new Error(`G12_STAGING_BASELINE_COMPENSATION_RUN_REFUSED:${runResult.violations.join(",")}`);

const artifactPayload = await github(`/actions/runs/${runId}/artifacts?per_page=100`);
if (Number(artifactPayload?.total_count ?? 0) > 100)
  throw new Error("G12_STAGING_BASELINE_COMPENSATION_ARTIFACT_PAGINATION_REFUSED");
const selected = selectStagingCompensationArtifacts({
  artifacts: artifactPayload?.artifacts,
  run,
  mode,
  runId,
  runAttempt,
});
if (!selected.valid)
  throw new Error(`G12_STAGING_BASELINE_COMPENSATION_ARTIFACT_REFUSED:${selected.violations.join(",")}`);
if (!process.env.GITHUB_OUTPUT) throw new Error("G12_STAGING_BASELINE_COMPENSATION_OUTPUT_REQUIRED");

await appendFile(
  process.env.GITHUB_OUTPUT,
  [
    `control_sha=${run.head_sha}`,
    `run_conclusion=${run.conclusion}`,
    `recovery_artifact_id=${selected.recoveryArtifact.id}`,
    `recovery_artifact_digest=${selected.recoveryArtifact.digest}`,
    `recovery_artifact_name=${selected.recoveryArtifact.name}`,
    `state_artifact_id=${selected.stateArtifact?.id ?? ""}`,
    `state_artifact_digest=${selected.stateArtifact?.digest ?? ""}`,
    `state_artifact_name=${selected.stateArtifact?.name ?? ""}`,
    "",
  ].join("\n"),
  "utf8",
);
console.log(
  JSON.stringify({
    event: "g12.staging.baseline_compensation.remote_verified",
    mode,
    runId,
    runAttempt,
    controlSha: run.head_sha,
    artifactIdsResolved: true,
    artifactDigestsPresent: true,
  }),
);
