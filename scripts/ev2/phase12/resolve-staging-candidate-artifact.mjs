import { appendFile } from "node:fs/promises";

import { evaluateStagingCandidateArtifact } from "./staging-artifact-resolution-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

const repository = process.env.GITHUB_REPOSITORY ?? "";
const token = process.env.GITHUB_TOKEN ?? "";
const expected = {
  runId: argument("run-id"),
  runAttempt: argument("run-attempt"),
  artifactId: argument("artifact-id"),
  artifactDigest: argument("artifact-digest"),
  candidateSha: argument("candidate"),
};
if (repository !== "Vnd93/gaiatec-cms" || token.length < 30)
  throw new Error("G12_STAGING_ARTIFACT_RESOLUTION_INPUT_REFUSED");

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
        throw new Error(`G12_STAGING_ARTIFACT_RESOLUTION_API_REFUSED:${response.status}`);
    } catch (error) {
      if (String(error?.message ?? "").startsWith("G12_STAGING_ARTIFACT_RESOLUTION_API_REFUSED:"))
        throw error;
      lastFailure = "transport";
    }
    if (attempt < 4) await new Promise((done) => setTimeout(done, 1_000 * 2 ** (attempt - 1)));
  }
  throw new Error(`G12_STAGING_ARTIFACT_RESOLUTION_RETRY_EXHAUSTED:${lastFailure}`);
}

async function runArtifacts() {
  const artifacts = [];
  for (let page = 1; page <= 10; page += 1) {
    const payload = await github(
      `/repos/${repository}/actions/runs/${expected.runId}/artifacts?per_page=100&page=${page}`,
    );
    if (!Number.isSafeInteger(payload?.total_count) || payload.total_count < 0 || payload.total_count > 1000)
      throw new Error("G12_STAGING_ARTIFACT_LIST_REFUSED");
    if (!Array.isArray(payload?.artifacts)) throw new Error("G12_STAGING_ARTIFACT_LIST_REFUSED");
    artifacts.push(...payload.artifacts);
    if (artifacts.length >= payload.total_count) return artifacts;
  }
  throw new Error("G12_STAGING_ARTIFACT_LIST_INCOMPLETE");
}

const [run, artifacts] = await Promise.all([
  github(`/repos/${repository}/actions/runs/${expected.runId}`),
  runArtifacts(),
]);
const result = evaluateStagingCandidateArtifact({ run, artifacts, expected });
if (!result.valid) throw new Error(`G12_STAGING_ARTIFACT_IDENTITY_REFUSED:${result.violations.join(",")}`);
if (process.env.GITHUB_OUTPUT)
  await appendFile(
    process.env.GITHUB_OUTPUT,
    [
      `artifact_id=${result.artifact.id}`,
      `artifact_digest=${result.normalizedDigest}`,
      `artifact_name=${result.expectedName}`,
      `control_sha=${run.head_sha}`,
      "",
    ].join("\n"),
    "utf8",
  );
console.log(
  JSON.stringify({
    event: "g12.staging.candidate_artifact.verified",
    candidateSha: expected.candidateSha,
    sourceRunId: expected.runId,
    sourceRunAttempt: Number(expected.runAttempt),
    artifactId: result.artifact.id,
    artifactDigestPresent: true,
  }),
);
