import { appendFile, readFile } from "node:fs/promises";

import {
  selectStagingCompensationArtifacts,
  STAGING_BASELINE_COMPENSATION_REPOSITORY,
  validateStagingBridgeRerunArtifactLossFallback,
  validateStagingCompensationArtifactList,
  validateStagingCompensationRun,
} from "./staging-baseline-compensation-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

const mode = argument("mode");
const runId = argument("run-id");
const runAttempt = Number(argument("run-attempt"));
const recordFile = argument("record");
const expectedRelease = argument("expected-release");
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
const artifactList = validateStagingCompensationArtifactList(artifactPayload);
if (!artifactList.valid) throw new Error("G12_STAGING_BASELINE_COMPENSATION_ARTIFACT_LIST_INCOMPLETE");
const selected = selectStagingCompensationArtifacts({
  artifacts: artifactList.artifacts,
  run,
  mode,
  runId,
  runAttempt,
});
let recoverySource = "compensation-artifacts";
if (!selected.valid) {
  let record;
  try {
    record = JSON.parse(await readFile(recordFile, "utf8"));
  } catch {
    throw new Error(
      `G12_STAGING_BASELINE_COMPENSATION_ARTIFACT_REFUSED:${selected.violations.join(",")},rerun_fallback_record_unavailable`,
    );
  }
  const currentRun = await github(`/actions/runs/${runId}`);
  const markerJobs = await github(`/actions/runs/${runId}/attempts/${runAttempt}/jobs?per_page=100`);
  const currentJobs = await github(
    `/actions/runs/${runId}/attempts/${currentRun.run_attempt}/jobs?per_page=100`,
  );
  const fallback = validateStagingBridgeRerunArtifactLossFallback({
    record,
    expectedRelease,
    artifacts: artifactList.artifacts,
    markerRun: run,
    currentRun,
    markerJobs,
    currentJobs,
    mode,
    runId,
    runAttempt,
    repository: process.env.GITHUB_REPOSITORY,
  });
  if (!fallback.valid)
    throw new Error(
      `G12_STAGING_BASELINE_COMPENSATION_ARTIFACT_REFUSED:${selected.violations.join(",")},${fallback.violations.join(",")}`,
    );
  recoverySource = "bootstrap-rerun-loss";
}
if (!process.env.GITHUB_OUTPUT) throw new Error("G12_STAGING_BASELINE_COMPENSATION_OUTPUT_REQUIRED");

await appendFile(
  process.env.GITHUB_OUTPUT,
  [
    `control_sha=${run.head_sha}`,
    `run_conclusion=${run.conclusion}`,
    `recovery_source=${recoverySource}`,
    `recovery_artifact_id=${selected.recoveryArtifact?.id ?? ""}`,
    `recovery_artifact_digest=${selected.recoveryArtifact?.digest ?? ""}`,
    `recovery_artifact_name=${selected.recoveryArtifact?.name ?? ""}`,
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
    recoverySource,
    artifactIdsResolved: selected.valid,
    artifactDigestsPresent: selected.valid,
    rerunArtifactLossVerified: recoverySource === "bootstrap-rerun-loss",
  }),
);
