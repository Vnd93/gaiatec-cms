import { appendFile } from "node:fs/promises";

import { evaluateCiStagingFrontendPackageSelection } from "./ci-staging-frontend-selection-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

const repository = process.env.GITHUB_REPOSITORY ?? "";
const token = process.env.GITHUB_TOKEN ?? "";
const runAttemptInput = argument("run-attempt");
const expected = {
  runId: argument("run-id"),
  currentRunAttempt: Number(runAttemptInput),
  headSha: argument("sha"),
};
if (
  repository !== "Vnd93/gaiatec-cms" ||
  token.length < 30 ||
  !/^[1-9]\d*$/.test(expected.runId) ||
  !Number.isSafeInteger(Number(expected.runId)) ||
  !/^[1-9]\d*$/.test(runAttemptInput) ||
  !Number.isSafeInteger(expected.currentRunAttempt) ||
  expected.currentRunAttempt < 1 ||
  expected.currentRunAttempt > 100 ||
  !/^[a-f0-9]{40}$/.test(expected.headSha)
) {
  throw new Error("G12_CI_STAGING_FRONTEND_SELECTION_INPUT_REFUSED");
}

async function github(path) {
  let lastFailure = "transport";
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(`https://api.github.com${path}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: AbortSignal.timeout(15_000),
      });
      const payload = await response.json().catch(() => null);
      if (response.ok) return payload;
      lastFailure = String(response.status);
      if (![408, 429].includes(response.status) && response.status < 500)
        throw new Error(`G12_CI_STAGING_FRONTEND_SELECTION_API_REFUSED:${response.status}`);
    } catch (error) {
      if (String(error?.message ?? "").startsWith("G12_CI_STAGING_FRONTEND_SELECTION_API_REFUSED:"))
        throw error;
      lastFailure = "transport";
    }
    if (attempt < 4) await new Promise((done) => setTimeout(done, 1_000 * 2 ** (attempt - 1)));
  }
  throw new Error(`G12_CI_STAGING_FRONTEND_SELECTION_RETRY_EXHAUSTED:${lastFailure}`);
}

async function paginated(path, key, maximum) {
  const entries = [];
  for (let page = 1; page <= 10; page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const payload = await github(`${path}${separator}per_page=100&page=${page}`);
    if (
      !Number.isSafeInteger(payload?.total_count) ||
      payload.total_count < 0 ||
      payload.total_count > maximum ||
      !Array.isArray(payload?.[key])
    ) {
      throw new Error("G12_CI_STAGING_FRONTEND_SELECTION_LIST_REFUSED");
    }
    entries.push(...payload[key]);
    if (entries.length >= payload.total_count) return entries;
  }
  throw new Error("G12_CI_STAGING_FRONTEND_SELECTION_LIST_INCOMPLETE");
}

const currentRun = await github(
  `/repos/${repository}/actions/runs/${expected.runId}/attempts/${expected.currentRunAttempt}`,
);
const artifacts = await paginated(
  `/repos/${repository}/actions/runs/${expected.runId}/artifacts`,
  "artifacts",
  1000,
);
const priorAttempts = [];
for (let attempt = 1; attempt < expected.currentRunAttempt; attempt += 1) {
  const run = await github(`/repos/${repository}/actions/runs/${expected.runId}/attempts/${attempt}`);
  const jobs = await paginated(
    `/repos/${repository}/actions/runs/${expected.runId}/attempts/${attempt}/jobs?filter=all`,
    "jobs",
    1000,
  );
  priorAttempts.push({ attempt, run, jobs });
}

const result = evaluateCiStagingFrontendPackageSelection({
  repository,
  currentRun,
  artifacts,
  priorAttempts,
  expected,
});
if (!result.valid)
  throw new Error(`G12_CI_STAGING_FRONTEND_SELECTION_REFUSED:${result.violations.join(",")}`);

if (process.env.GITHUB_OUTPUT) {
  await appendFile(
    process.env.GITHUB_OUTPUT,
    [
      `mode=${result.mode}`,
      `source_run_id=${result.sourceRunId}`,
      `source_run_attempt=${result.sourceRunAttempt}`,
      `artifact_id=${result.artifactId}`,
      `artifact_digest=${result.artifactDigest}`,
      `artifact_name=${result.artifactName}`,
      `control_sha=${result.controlSha}`,
      `release_plan_artifact_id=${result.releasePlanArtifactId}`,
      `release_plan_artifact_digest=${result.releasePlanArtifactDigest}`,
      `release_plan_artifact_name=${result.releasePlanArtifactName}`,
      "",
    ].join("\n"),
    "utf8",
  );
}

if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    [
      "### Staging frontend package selection",
      "",
      `- Mode: \`${result.mode}\``,
      `- Producer: run \`${result.sourceRunId}\`, attempt \`${result.sourceRunAttempt}\``,
      `- Artifact: \`${result.artifactName}\``,
      "",
    ].join("\n"),
    "utf8",
  );
}

console.log(
  JSON.stringify({
    event: "g12.ci.staging_frontend.selection_completed",
    mode: result.mode,
    sourceRunId: result.sourceRunId,
    sourceRunAttempt: result.sourceRunAttempt,
    artifactIdPresent: result.artifactId !== "",
    artifactDigestPresent: result.artifactDigest !== "",
    artifactName: result.artifactName,
    controlSha: result.controlSha,
    releasePlanArtifactId: result.releasePlanArtifactId,
    releasePlanArtifactDigestPresent: result.releasePlanArtifactDigest !== "",
    releasePlanArtifactName: result.releasePlanArtifactName,
    secretsExposed: false,
  }),
);
