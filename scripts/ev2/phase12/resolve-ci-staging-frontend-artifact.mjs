import { appendFile } from "node:fs/promises";

import { evaluateCiStagingFrontendArtifact } from "./staging-artifact-resolution-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

const repository = process.env.GITHUB_REPOSITORY ?? "";
const token = process.env.GITHUB_TOKEN ?? "";
const runAttemptInput = argument("run-attempt");
const gateRunAttemptInput = argument("gate-run-attempt");
const expected = {
  runId: argument("run-id"),
  runAttempt: Number(runAttemptInput),
  gateRunAttempt: gateRunAttemptInput ? Number(gateRunAttemptInput) : undefined,
  headSha: argument("sha"),
};
if (
  repository !== "Vnd93/gaiatec-cms" ||
  token.length < 30 ||
  !/^[1-9]\d*$/.test(expected.runId) ||
  !Number.isSafeInteger(Number(expected.runId)) ||
  !/^[1-9]\d*$/.test(runAttemptInput) ||
  !Number.isSafeInteger(expected.runAttempt) ||
  expected.runAttempt < 1 ||
  expected.runAttempt > 100 ||
  (gateRunAttemptInput !== "" &&
    (!/^[1-9]\d*$/.test(gateRunAttemptInput) ||
      !Number.isSafeInteger(expected.gateRunAttempt) ||
      expected.gateRunAttempt < expected.runAttempt ||
      expected.gateRunAttempt > 100)) ||
  !/^[a-f0-9]{40}$/.test(expected.headSha)
) {
  throw new Error("G12_CI_STAGING_FRONTEND_ARTIFACT_INPUT_REFUSED");
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
        throw new Error(`G12_CI_STAGING_FRONTEND_ARTIFACT_API_REFUSED:${response.status}`);
    } catch (error) {
      if (String(error?.message ?? "").startsWith("G12_CI_STAGING_FRONTEND_ARTIFACT_API_REFUSED:"))
        throw error;
      lastFailure = "transport";
    }
    if (attempt < 4) await new Promise((done) => setTimeout(done, 1_000 * 2 ** (attempt - 1)));
  }
  throw new Error(`G12_CI_STAGING_FRONTEND_ARTIFACT_RETRY_EXHAUSTED:${lastFailure}`);
}

async function runArtifacts() {
  const artifacts = [];
  for (let page = 1; page <= 10; page += 1) {
    const payload = await github(
      `/repos/${repository}/actions/runs/${expected.runId}/artifacts?per_page=100&page=${page}`,
    );
    if (
      !Number.isSafeInteger(payload?.total_count) ||
      payload.total_count < 0 ||
      payload.total_count > 1000 ||
      !Array.isArray(payload?.artifacts)
    ) {
      throw new Error("G12_CI_STAGING_FRONTEND_ARTIFACT_LIST_REFUSED");
    }
    artifacts.push(...payload.artifacts);
    if (artifacts.length >= payload.total_count) return artifacts;
  }
  throw new Error("G12_CI_STAGING_FRONTEND_ARTIFACT_LIST_INCOMPLETE");
}

async function attemptJobs(runAttempt) {
  const jobs = [];
  for (let page = 1; page <= 10; page += 1) {
    const payload = await github(
      `/repos/${repository}/actions/runs/${expected.runId}/attempts/${runAttempt}/jobs?filter=all&per_page=100&page=${page}`,
    );
    if (
      !Number.isSafeInteger(payload?.total_count) ||
      payload.total_count < 0 ||
      payload.total_count > 1000 ||
      !Array.isArray(payload?.jobs)
    ) {
      throw new Error("G12_CI_STAGING_FRONTEND_ARTIFACT_JOBS_REFUSED");
    }
    jobs.push(...payload.jobs);
    if (jobs.length >= payload.total_count) return jobs;
  }
  throw new Error("G12_CI_STAGING_FRONTEND_ARTIFACT_JOBS_INCOMPLETE");
}

if (expected.gateRunAttempt === undefined) {
  const latest = await github(`/repos/${repository}/actions/runs/${expected.runId}`);
  if (
    !Number.isSafeInteger(latest?.run_attempt) ||
    latest.run_attempt < expected.runAttempt ||
    latest.run_attempt > 100
  )
    throw new Error("G12_CI_STAGING_FRONTEND_ARTIFACT_GATE_ATTEMPT_REFUSED");
  expected.gateRunAttempt = latest.run_attempt;
}
const [gateRun, producerRun, producerJobs, artifacts] = await Promise.all([
  github(`/repos/${repository}/actions/runs/${expected.runId}/attempts/${expected.gateRunAttempt}`),
  github(`/repos/${repository}/actions/runs/${expected.runId}/attempts/${expected.runAttempt}`),
  attemptJobs(expected.runAttempt),
  runArtifacts(),
]);
const result = evaluateCiStagingFrontendArtifact({
  repository,
  gateRun,
  producerRun,
  producerJobs,
  artifacts,
  expected,
});
if (!result.valid) throw new Error(`G12_CI_STAGING_FRONTEND_ARTIFACT_REFUSED:${result.violations.join(",")}`);

if (process.env.GITHUB_OUTPUT) {
  await appendFile(
    process.env.GITHUB_OUTPUT,
    [
      `artifact_id=${result.artifact.id}`,
      `artifact_digest=${result.normalizedDigest}`,
      `artifact_name=${result.expectedName}`,
      `source_run_id=${result.sourceRunId}`,
      `source_run_attempt=${result.sourceRunAttempt}`,
      `gate_run_attempt=${result.gateRunAttempt}`,
      `control_sha=${result.controlSha}`,
      "",
    ].join("\n"),
    "utf8",
  );
}

console.log(
  JSON.stringify({
    event: "g12.ci.staging_frontend_artifact.verified",
    artifactId: result.artifact.id,
    artifactName: result.expectedName,
    artifactDigestPresent: true,
    sourceRunId: result.sourceRunId,
    sourceRunAttempt: result.sourceRunAttempt,
    gateRunAttempt: result.gateRunAttempt,
    controlSha: result.controlSha,
  }),
);
