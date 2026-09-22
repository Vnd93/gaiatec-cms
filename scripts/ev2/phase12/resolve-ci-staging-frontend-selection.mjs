import { appendFile } from "node:fs/promises";

import { evaluateCiStagingFrontendSelectionArtifact } from "./ci-staging-frontend-selection-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

const repository = process.env.GITHUB_REPOSITORY ?? "";
const token = process.env.GITHUB_TOKEN ?? "";
const gateRunAttemptInput = argument("gate-run-attempt");
const expected = {
  runId: argument("run-id"),
  gateRunAttempt: Number(gateRunAttemptInput),
  candidateSha: argument("sha"),
};
if (
  repository !== "Vnd93/gaiatec-cms" ||
  token.length < 30 ||
  !/^[1-9]\d*$/.test(expected.runId) ||
  !Number.isSafeInteger(Number(expected.runId)) ||
  !/^[1-9]\d*$/.test(gateRunAttemptInput) ||
  !Number.isSafeInteger(expected.gateRunAttempt) ||
  expected.gateRunAttempt < 1 ||
  expected.gateRunAttempt > 100 ||
  !/^[a-f0-9]{40}$/.test(expected.candidateSha)
) {
  throw new Error("G12_CI_STAGING_FRONTEND_SELECTION_RESOLUTION_INPUT_REFUSED");
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
        throw new Error(`G12_CI_STAGING_FRONTEND_SELECTION_RESOLUTION_API_REFUSED:${response.status}`);
    } catch (error) {
      if (
        String(error?.message ?? "").startsWith("G12_CI_STAGING_FRONTEND_SELECTION_RESOLUTION_API_REFUSED:")
      ) {
        throw error;
      }
      lastFailure = "transport";
    }
    if (attempt < 4) await new Promise((done) => setTimeout(done, 1_000 * 2 ** (attempt - 1)));
  }
  throw new Error(`G12_CI_STAGING_FRONTEND_SELECTION_RESOLUTION_RETRY_EXHAUSTED:${lastFailure}`);
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
      throw new Error("G12_CI_STAGING_FRONTEND_SELECTION_RESOLUTION_LIST_REFUSED");
    }
    artifacts.push(...payload.artifacts);
    if (artifacts.length >= payload.total_count) return artifacts;
  }
  throw new Error("G12_CI_STAGING_FRONTEND_SELECTION_RESOLUTION_LIST_INCOMPLETE");
}

const [run, artifacts] = await Promise.all([
  github(`/repos/${repository}/actions/runs/${expected.runId}/attempts/${expected.gateRunAttempt}`),
  runArtifacts(),
]);
const result = evaluateCiStagingFrontendSelectionArtifact({
  repository,
  run,
  artifacts,
  expected,
});
if (!result.valid)
  throw new Error(`G12_CI_STAGING_FRONTEND_SELECTION_RESOLUTION_REFUSED:${result.violations.join(",")}`);

if (process.env.GITHUB_OUTPUT) {
  await appendFile(
    process.env.GITHUB_OUTPUT,
    [
      `selection_artifact_id=${result.artifactId}`,
      `selection_artifact_digest=${result.artifactDigest}`,
      `selection_artifact_name=${result.artifactName}`,
      `gate_run_id=${result.gateRunId}`,
      `gate_run_attempt=${result.gateRunAttempt}`,
      `control_sha=${result.controlSha}`,
      `release_plan_artifact_id=${result.releasePlanArtifactId}`,
      `release_plan_artifact_digest=${result.releasePlanArtifactDigest}`,
      `release_plan_artifact_name=${result.releasePlanArtifactName}`,
      "",
    ].join("\n"),
    "utf8",
  );
}

console.log(
  JSON.stringify({
    event: "g12.ci.staging_frontend.selection_artifact_resolved",
    selectionArtifactId: result.artifactId,
    selectionArtifactName: result.artifactName,
    selectionArtifactDigestPresent: true,
    gateRunId: result.gateRunId,
    gateRunAttempt: result.gateRunAttempt,
    controlSha: result.controlSha,
    releasePlanArtifactId: result.releasePlanArtifactId,
    releasePlanArtifactName: result.releasePlanArtifactName,
    releasePlanArtifactDigestPresent: true,
  }),
);
