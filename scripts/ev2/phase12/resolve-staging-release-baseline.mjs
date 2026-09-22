import { execFileSync } from "node:child_process";
import { appendFile } from "node:fs/promises";
import process from "node:process";

import {
  STAGING_RELEASE_BASELINE_REPOSITORY,
  evaluateStagingReleaseBaseline,
} from "./staging-release-baseline-lib.mjs";

const FULL_SHA = /^[a-f0-9]{40}$/;
const ZERO_SHA = "0".repeat(40);

function argument(name) {
  const matches = process.argv
    .slice(2)
    .reduce((indexes, value, index) => (value === `--${name}` ? [...indexes, index] : indexes), []);
  if (matches.length !== 1) return "";
  return process.argv.slice(2)[matches[0] + 1] ?? "";
}

async function github(path, token) {
  let lastFailure = "transport";
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(`https://api.github.com${path}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "gaiatec-staging-release-baseline-resolver",
        },
        signal: AbortSignal.timeout(15_000),
      });
      const payload = await response.json().catch(() => null);
      if (response.ok) return payload;
      lastFailure = String(response.status);
      if (![408, 429].includes(response.status) && response.status < 500) {
        throw new Error(`G12_STAGING_BASELINE_API_REFUSED:${response.status}`);
      }
    } catch (error) {
      if (String(error?.message ?? "").startsWith("G12_STAGING_BASELINE_API_REFUSED:")) {
        throw error;
      }
      lastFailure = "transport";
    }
    if (attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 1_000 * 2 ** (attempt - 1)));
    }
  }
  throw new Error(`G12_STAGING_BASELINE_API_RETRY_EXHAUSTED:${lastFailure}`);
}

async function artifactsForRun(repository, runId, token) {
  const artifacts = [];
  for (let page = 1; page <= 10; page += 1) {
    const payload = await github(
      `/repos/${repository}/actions/runs/${runId}/artifacts?per_page=100&page=${page}`,
      token,
    );
    if (
      !Number.isSafeInteger(payload?.total_count) ||
      payload.total_count < 0 ||
      payload.total_count > 1000 ||
      !Array.isArray(payload?.artifacts)
    ) {
      throw new Error("G12_STAGING_BASELINE_ARTIFACT_LIST_REFUSED");
    }
    artifacts.push(...payload.artifacts);
    if (artifacts.length >= payload.total_count) return artifacts;
  }
  throw new Error("G12_STAGING_BASELINE_ARTIFACT_LIST_INCOMPLETE");
}

function isAncestor(baseSha, candidateSha) {
  for (const sha of [baseSha, candidateSha]) {
    execFileSync("git", ["cat-file", "-e", `${sha}^{commit}`], {
      encoding: "utf8",
      stdio: ["ignore", "ignore", "ignore"],
    });
  }
  execFileSync("git", ["merge-base", "--is-ancestor", baseSha, candidateSha], {
    encoding: "utf8",
    stdio: ["ignore", "ignore", "ignore"],
  });
  return true;
}

async function emit(result) {
  if (!process.env.GITHUB_OUTPUT) throw new Error("G12_STAGING_BASELINE_OUTPUT_REQUIRED");
  const valid = result?.valid === true;
  await appendFile(
    process.env.GITHUB_OUTPUT,
    [
      `baseline_sha=${valid ? result.baselineSha : ZERO_SHA}`,
      `baseline_proven=${String(valid)}`,
      `baseline_run_id=${valid ? result.runId : ""}`,
      `baseline_run_attempt=${valid ? result.runAttempt : ""}`,
      `baseline_checkpoint_artifact_id=${valid ? result.checkpointArtifactId : ""}`,
      `baseline_terminal_artifact_id=${valid ? result.terminalArtifactId : ""}`,
      `baseline_chain_artifact_id=${valid ? result.chainArtifactId : ""}`,
      `baseline_violation=${valid ? "" : "staging_baseline_unproved"}`,
      "",
    ].join("\n"),
    "utf8",
  );
  process.stdout.write(
    `${JSON.stringify({
      event: "release.staging_baseline.resolved",
      proven: valid,
      baselineSha: valid ? result.baselineSha : null,
      runId: valid ? result.runId : null,
      runAttempt: valid ? result.runAttempt : null,
      checkpointArtifactId: valid ? result.checkpointArtifactId : null,
      terminalArtifactId: valid ? result.terminalArtifactId : null,
      chainArtifactId: valid ? result.chainArtifactId : null,
      violations: valid ? [] : ["staging_baseline_unproved"],
    })}\n`,
  );
}

async function resolveBaseline() {
  const repository = process.env.GITHUB_REPOSITORY ?? "";
  const token = process.env.GITHUB_TOKEN ?? "";
  const candidateSha = argument("candidate-sha").toLowerCase();
  if (
    process.argv.length !== 4 ||
    repository !== STAGING_RELEASE_BASELINE_REPOSITORY ||
    token.length < 30 ||
    !FULL_SHA.test(candidateSha)
  ) {
    return { valid: false };
  }
  const runs = await github(
    `/repos/${repository}/actions/workflows/deploy-staging.yml/runs` +
      "?branch=main&event=workflow_dispatch&status=completed&per_page=1",
    token,
  );
  if (
    !Number.isSafeInteger(runs?.total_count) ||
    runs.total_count < 0 ||
    !Array.isArray(runs?.workflow_runs) ||
    runs.workflow_runs.length > 1
  ) {
    return { valid: false };
  }
  const latest = runs.workflow_runs[0];
  if (!Number.isSafeInteger(latest?.id) || !Number.isSafeInteger(latest?.run_attempt)) {
    return { valid: false };
  }
  const [run, artifacts] = await Promise.all([
    github(`/repos/${repository}/actions/runs/${latest.id}/attempts/${latest.run_attempt}`, token),
    artifactsForRun(repository, latest.id, token),
  ]);
  return evaluateStagingReleaseBaseline({
    repository,
    run,
    artifacts,
    candidateSha,
    isAncestor,
  });
}

resolveBaseline()
  .catch(() => ({ valid: false }))
  .then(emit)
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
