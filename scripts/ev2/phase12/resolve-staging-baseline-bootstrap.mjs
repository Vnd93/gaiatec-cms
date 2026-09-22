import { createHash } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";

import {
  STAGING_BASELINE_BOOTSTRAP_REPOSITORY,
  validateStagingBaselineBootstrapRemote,
} from "./staging-baseline-bootstrap-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

const recordBytes = await readFile(argument("record"));
const record = JSON.parse(recordBytes.toString("utf8"));
const repository = process.env.GITHUB_REPOSITORY ?? "";
const token = process.env.GITHUB_TOKEN ?? "";
if (repository !== STAGING_BASELINE_BOOTSTRAP_REPOSITORY || token.length < 30)
  throw new Error("G12_STAGING_BASELINE_BOOTSTRAP_INPUT_REFUSED");

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
        throw new Error(`G12_STAGING_BASELINE_BOOTSTRAP_API_REFUSED:${response.status}`);
    } catch (error) {
      if (String(error?.message ?? "").startsWith("G12_STAGING_BASELINE_BOOTSTRAP_API_REFUSED:")) throw error;
      lastFailure = "transport";
    }
    if (attempt < 4) await new Promise((done) => setTimeout(done, 1_000 * 2 ** (attempt - 1)));
  }
  throw new Error(`G12_STAGING_BASELINE_BOOTSTRAP_RETRY_EXHAUSTED:${lastFailure}`);
}

async function artifacts(runId) {
  const payload = await github(`/repos/${repository}/actions/runs/${runId}/artifacts?per_page=100`);
  if (!Number.isSafeInteger(payload?.total_count) || !Array.isArray(payload?.artifacts))
    throw new Error("G12_STAGING_BASELINE_BOOTSTRAP_ARTIFACT_LIST_REFUSED");
  if (payload.total_count !== payload.artifacts.length || payload.total_count > 100)
    throw new Error("G12_STAGING_BASELINE_BOOTSTRAP_ARTIFACT_LIST_INCOMPLETE");
  return payload.artifacts;
}

const [bridgeRun, bridgeArtifacts, sourceRun, sourceArtifacts] = await Promise.all([
  github(`/repos/${repository}/actions/runs/${record.bridge.runId}`),
  artifacts(record.bridge.runId),
  github(`/repos/${repository}/actions/runs/${record.source.runId}`),
  artifacts(record.source.runId),
]);
const result = validateStagingBaselineBootstrapRemote({
  record,
  bridgeRun,
  bridgeArtifacts,
  sourceRun,
  sourceArtifacts,
});
if (!result.valid)
  throw new Error(`G12_STAGING_BASELINE_BOOTSTRAP_REMOTE_REFUSED:${result.violations.join(",")}`);
if (process.env.GITHUB_OUTPUT)
  await appendFile(
    process.env.GITHUB_OUTPUT,
    [
      `bridge_run_id=${record.bridge.runId}`,
      `bridge_run_attempt=${record.bridge.runAttempt}`,
      `bridge_artifact_id=${record.bridge.artifactId}`,
      `bridge_artifact_digest=${record.bridge.artifactDigest}`,
      `source_run_id=${record.source.runId}`,
      `source_run_attempt=${record.source.runAttempt}`,
      `source_control_sha=${record.source.controlSha}`,
      `source_artifact_id=${record.source.artifactId}`,
      `source_artifact_digest=${record.source.artifactDigest}`,
      `source_artifact_name=${record.source.artifactName}`,
      `source_seal_sha256=${record.source.sealSha256}`,
      `record_sha256=${createHash("sha256").update(recordBytes).digest("hex")}`,
      `archive_sha256=${record.dist.archiveSha256}`,
      `tree_sha256=${record.dist.treeSha256}`,
      `archive_bytes=${record.dist.archiveBytes}`,
      `file_count=${record.dist.fileCount}`,
      `byte_count=${record.dist.byteCount}`,
      "",
    ].join("\n"),
    "utf8",
  );
console.log(
  JSON.stringify({
    event: "g12.staging.baseline_bootstrap.remote_verified",
    candidateSha: record.candidateSha,
    bridgeRunId: record.bridge.runId,
    sourceRunId: record.source.runId,
    artifactDigestPresent: true,
  }),
);
