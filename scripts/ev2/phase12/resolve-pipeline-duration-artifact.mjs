import { appendFile } from "node:fs/promises";
import process from "node:process";

import { evaluatePipelineDurationArtifact } from "./staging-artifact-resolution-lib.mjs";

const REPOSITORY = "Vnd93/gaiatec-cms";
const COMPONENTS = new Set(["ci", "bridge"]);

function parseArguments(argv) {
  if (argv.length % 2 !== 0) throw new Error("G12_PIPELINE_DURATION_ARGUMENTS_REFUSED");
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined)
      throw new Error("G12_PIPELINE_DURATION_ARGUMENTS_REFUSED");
    const name = key.slice(2);
    if (Object.hasOwn(options, name)) throw new Error("G12_PIPELINE_DURATION_ARGUMENTS_REFUSED");
    options[name] = value;
  }
  const expectedKeys = ["component", "run-id", "run-attempt", "candidate-sha", "control-sha"];
  if (
    Object.keys(options).sort().join(",") !== expectedKeys.sort().join(",") ||
    !COMPONENTS.has(options.component) ||
    !/^[1-9]\d*$/.test(options["run-id"] ?? "") ||
    !Number.isSafeInteger(Number(options["run-id"])) ||
    !/^[1-9]\d*$/.test(options["run-attempt"] ?? "") ||
    !Number.isSafeInteger(Number(options["run-attempt"])) ||
    Number(options["run-attempt"]) > 100 ||
    !/^[a-f0-9]{40}$/.test(options["candidate-sha"] ?? "") ||
    !/^[a-f0-9]{40}$/.test(options["control-sha"] ?? "")
  ) {
    throw new Error("G12_PIPELINE_DURATION_ARGUMENTS_REFUSED");
  }
  return options;
}

async function github(path, token) {
  let lastFailure = "transport";
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(`https://api.github.com/repos/${REPOSITORY}${path}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "gaiatec-pipeline-duration-resolver",
        },
        signal: AbortSignal.timeout(15_000),
      });
      const payload = await response.json().catch(() => null);
      if (response.ok) return payload;
      lastFailure = String(response.status);
      if (![408, 429].includes(response.status) && response.status < 500) {
        throw new Error(`G12_PIPELINE_DURATION_API_REFUSED:${response.status}`);
      }
    } catch (error) {
      if (String(error?.message ?? "").startsWith("G12_PIPELINE_DURATION_API_REFUSED:")) throw error;
      lastFailure = "transport";
    }
    if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 1_000 * 2 ** (attempt - 1)));
  }
  throw new Error(`G12_PIPELINE_DURATION_API_RETRY_EXHAUSTED:${lastFailure}`);
}

async function artifactsForRun(runId, token) {
  const artifacts = [];
  for (let page = 1; page <= 10; page += 1) {
    const payload = await github(`/actions/runs/${runId}/artifacts?per_page=100&page=${page}`, token);
    if (
      !Number.isSafeInteger(payload?.total_count) ||
      payload.total_count < 0 ||
      payload.total_count > 1000 ||
      !Array.isArray(payload?.artifacts)
    ) {
      throw new Error("G12_PIPELINE_DURATION_ARTIFACT_LIST_REFUSED");
    }
    artifacts.push(...payload.artifacts);
    if (artifacts.length >= payload.total_count) return artifacts;
  }
  throw new Error("G12_PIPELINE_DURATION_ARTIFACT_LIST_INCOMPLETE");
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const token = process.env.GITHUB_TOKEN ?? "";
  if (process.env.GITHUB_REPOSITORY !== REPOSITORY || token.length < 30)
    throw new Error("G12_PIPELINE_DURATION_ENVIRONMENT_REFUSED");
  const run = await github(`/actions/runs/${options["run-id"]}/attempts/${options["run-attempt"]}`, token);
  const artifacts = await artifactsForRun(options["run-id"], token);
  const result = evaluatePipelineDurationArtifact({
    component: options.component,
    repository: process.env.GITHUB_REPOSITORY,
    run,
    artifacts,
    expected: {
      runId: options["run-id"],
      runAttempt: Number(options["run-attempt"]),
      candidateSha: options["candidate-sha"],
      controlSha: options["control-sha"],
    },
  });
  if (!result.valid) throw new Error(`G12_PIPELINE_DURATION_ARTIFACT_REFUSED:${result.violations.join(",")}`);
  if (!process.env.GITHUB_OUTPUT) throw new Error("G12_PIPELINE_DURATION_OUTPUT_REQUIRED");
  await appendFile(
    process.env.GITHUB_OUTPUT,
    [
      `artifact_id=${result.artifactId}`,
      `artifact_digest=${result.artifactDigest}`,
      `artifact_name=${result.artifactName}`,
      `run_id=${result.runId}`,
      `run_attempt=${result.runAttempt}`,
      `candidate_sha=${result.candidateSha}`,
      `control_sha=${result.controlSha}`,
      `head_sha=${result.headSha}`,
      "",
    ].join("\n"),
    "utf8",
  );
  process.stdout.write(
    `${JSON.stringify({
      event: "release.pipeline.duration_artifact.resolved",
      component: options.component,
      runId: result.runId,
      runAttempt: result.runAttempt,
      candidateSha: result.candidateSha,
      controlSha: result.controlSha,
      headSha: result.headSha,
      artifactId: result.artifactId,
      artifactDigest: result.artifactDigest,
    })}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
