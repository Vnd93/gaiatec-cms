import { appendFile } from "node:fs/promises";

import { decodeDeploymentCommitMessage } from "./deployment-commit-message.mjs";
import {
  evaluateStagingCandidateArtifact,
  normalizeStagingArtifactDigest,
} from "./staging-artifact-resolution-lib.mjs";

const REPOSITORY = "Vnd93/gaiatec-cms";

function argument(name) {
  const indexes = process.argv.flatMap((value, index) => (value === `--${name}` ? [index] : []));
  if (indexes.length !== 1) throw new Error("G12_STAGING_ROLLBACK_DEPLOY_SOURCE_INPUT_REFUSED");
  const value = process.argv[indexes[0] + 1];
  if (!value || value.startsWith("--")) throw new Error("G12_STAGING_ROLLBACK_DEPLOY_SOURCE_INPUT_REFUSED");
  return value;
}

const expected = {
  runId: argument("run-id"),
  runAttempt: Number(argument("run-attempt")),
  candidateSha: argument("candidate"),
  deploymentId: argument("deployment-id"),
  createdOn: argument("created-on"),
  commitMessage: decodeDeploymentCommitMessage(argument("commit-message-b64")),
};
const token = process.env.GITHUB_TOKEN ?? "";
if (
  process.env.GITHUB_REPOSITORY !== REPOSITORY ||
  token.length < 30 ||
  !/^[1-9]\d*$/.test(expected.runId) ||
  !Number.isSafeInteger(expected.runAttempt) ||
  expected.runAttempt < 1 ||
  expected.runAttempt > 100 ||
  !/^[a-f0-9]{40}$/.test(expected.candidateSha) ||
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(expected.deploymentId) ||
  !Number.isFinite(Date.parse(expected.createdOn)) ||
  new Date(expected.createdOn).toISOString() !== expected.createdOn ||
  expected.commitMessage !== `g12-staging-run-${expected.runId}-${expected.runAttempt}`
)
  throw new Error("G12_STAGING_ROLLBACK_DEPLOY_SOURCE_INPUT_REFUSED");

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "gaiatec-staging-rollback-deploy-source",
};

async function github(path) {
  let lastFailure = "transport";
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(`https://api.github.com/repos/${REPOSITORY}${path}`, {
        headers,
        signal: AbortSignal.timeout(15_000),
      });
      const payload = await response.json().catch(() => null);
      if (response.ok) return payload;
      lastFailure = String(response.status);
      if (![408, 429].includes(response.status) && response.status < 500)
        throw new Error(`G12_STAGING_ROLLBACK_DEPLOY_SOURCE_API_REFUSED:${response.status}`);
    } catch (error) {
      if (String(error?.message ?? "").startsWith("G12_STAGING_ROLLBACK_DEPLOY_SOURCE_API_REFUSED:"))
        throw error;
      lastFailure = "transport";
    }
    if (attempt < 4) await new Promise((done) => setTimeout(done, 1_000 * 2 ** (attempt - 1)));
  }
  throw new Error(`G12_STAGING_ROLLBACK_DEPLOY_SOURCE_RETRY_EXHAUSTED:${lastFailure}`);
}

async function artifactsForRun() {
  const artifacts = [];
  for (let page = 1; page <= 10; page += 1) {
    const payload = await github(`/actions/runs/${expected.runId}/artifacts?per_page=100&page=${page}`);
    if (
      !Number.isSafeInteger(payload?.total_count) ||
      payload.total_count < 0 ||
      payload.total_count > 1000 ||
      !Array.isArray(payload?.artifacts)
    )
      throw new Error("G12_STAGING_ROLLBACK_DEPLOY_SOURCE_ARTIFACT_LIST_REFUSED");
    artifacts.push(...payload.artifacts);
    if (artifacts.length >= payload.total_count) return artifacts;
  }
  throw new Error("G12_STAGING_ROLLBACK_DEPLOY_SOURCE_ARTIFACT_LIST_INCOMPLETE");
}

const [run, artifacts] = await Promise.all([
  github(`/actions/runs/${expected.runId}/attempts/${expected.runAttempt}`),
  artifactsForRun(),
]);
const expectedName = `staging-candidate-${expected.candidateSha}-${expected.runId}-${expected.runAttempt}`;
const named = artifacts.filter((artifact) => artifact?.name === expectedName);
if (named.length !== 1) throw new Error("G12_STAGING_ROLLBACK_DEPLOY_SOURCE_ARTIFACT_NOT_UNIQUE");
const evidenceNames = new Set([
  `staging-${expected.candidateSha}`,
  `staging-preliminary-${expected.candidateSha}`,
]);
const evidenceMatches = artifacts.filter((artifact) => evidenceNames.has(artifact?.name));
if (evidenceMatches.length !== 1) throw new Error("G12_STAGING_ROLLBACK_DEPLOY_SOURCE_EVIDENCE_NOT_UNIQUE");
const artifactDigest = normalizeStagingArtifactDigest(named[0]?.digest);
const result = evaluateStagingCandidateArtifact({
  repository: REPOSITORY,
  run,
  artifacts,
  expected: {
    runId: expected.runId,
    runAttempt: expected.runAttempt,
    artifactId: String(named[0].id ?? ""),
    artifactDigest,
    candidateSha: expected.candidateSha,
    controlSha: run?.head_sha,
  },
});
const evidenceArtifact = evidenceMatches[0];
const evidenceDigest = normalizeStagingArtifactDigest(evidenceArtifact?.digest);
const deploymentTime = Date.parse(expected.createdOn);
const runStarted = Date.parse(run?.run_started_at ?? run?.created_at ?? "");
const runFinished = Date.parse(run?.updated_at ?? "");
const evidenceCreated = Date.parse(evidenceArtifact?.created_at ?? "");
const evidenceUpdated = Date.parse(evidenceArtifact?.updated_at ?? "");
const evidenceExpires = Date.parse(evidenceArtifact?.expires_at ?? "");
const candidateCreated = Date.parse(named[0]?.created_at ?? "");
const evidenceApiUrl = `https://api.github.com/repos/${REPOSITORY}/actions/artifacts/${evidenceArtifact?.id}`;
const evidenceValid =
  Number.isSafeInteger(evidenceArtifact?.id) &&
  evidenceArtifact.id > 0 &&
  /^sha256:[a-f0-9]{64}$/.test(evidenceArtifact?.digest ?? "") &&
  /^sha256:[a-f0-9]{64}$/.test(evidenceDigest) &&
  Number.isSafeInteger(evidenceArtifact?.size_in_bytes) &&
  evidenceArtifact.size_in_bytes > 0 &&
  evidenceArtifact?.expired === false &&
  Number.isFinite(evidenceCreated) &&
  Number.isFinite(evidenceUpdated) &&
  Number.isFinite(evidenceExpires) &&
  Number.isFinite(candidateCreated) &&
  evidenceCreated >= candidateCreated &&
  evidenceCreated >= runStarted - 5 * 60_000 &&
  evidenceCreated <= runFinished + 5 * 60_000 &&
  evidenceCreated <= evidenceUpdated &&
  evidenceUpdated <= Date.now() + 5 * 60_000 &&
  evidenceExpires > Date.now() &&
  evidenceExpires - evidenceCreated >= 30 * 24 * 60 * 60_000 &&
  String(evidenceArtifact?.workflow_run?.id ?? "") === expected.runId &&
  evidenceArtifact?.workflow_run?.head_branch === "main" &&
  evidenceArtifact?.workflow_run?.head_sha === run?.head_sha &&
  evidenceArtifact?.url === evidenceApiUrl &&
  evidenceArtifact?.archive_download_url === `${evidenceApiUrl}/zip`;
if (
  !result.valid ||
  !evidenceValid ||
  !Number.isFinite(runStarted) ||
  !Number.isFinite(runFinished) ||
  deploymentTime < runStarted - 5 * 60_000 ||
  deploymentTime > runFinished + 5 * 60_000
)
  throw new Error(
    `G12_STAGING_ROLLBACK_DEPLOY_SOURCE_REFUSED:${[
      ...result.violations,
      ...(!evidenceValid ? ["deploy_evidence_artifact_invalid"] : []),
      ...(deploymentTime < runStarted - 5 * 60_000 || deploymentTime > runFinished + 5 * 60_000
        ? ["deployment_time_not_bound_to_run"]
        : []),
    ].join(",")}`,
  );
if (!process.env.GITHUB_OUTPUT) throw new Error("G12_STAGING_ROLLBACK_DEPLOY_SOURCE_OUTPUT_REQUIRED");
await appendFile(
  process.env.GITHUB_OUTPUT,
  [
    `artifact_id=${result.artifact.id}`,
    `artifact_digest=${result.normalizedDigest}`,
    `artifact_name=${result.expectedName}`,
    `evidence_artifact_id=${evidenceArtifact.id}`,
    `evidence_artifact_digest=${evidenceDigest}`,
    `evidence_artifact_name=${evidenceArtifact.name}`,
    `source_run_id=${expected.runId}`,
    `source_run_attempt=${expected.runAttempt}`,
    `control_sha=${result.controlSha}`,
    `deployment_id=${expected.deploymentId}`,
    "",
  ].join("\n"),
  "utf8",
);
console.log(
  JSON.stringify({
    event: "g12.staging.rollback.deploy_source_verified",
    candidateSha: expected.candidateSha,
    deploymentId: expected.deploymentId,
    runId: expected.runId,
    runAttempt: expected.runAttempt,
    artifactId: result.artifact.id,
    artifactDigestPresent: true,
    evidenceArtifactId: evidenceArtifact.id,
    evidenceArtifactDigestPresent: true,
  }),
);
