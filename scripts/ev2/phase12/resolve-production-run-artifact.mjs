import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { evaluateProductionMarkerAbsenceProof } from "./production-artifact-resolution-lib.mjs";
import {
  normalizeProductionArtifactDigest,
  PRODUCTION_MUTATION_MARKER_VARIABLE,
  verifyProductionMutationMarkerVariable,
} from "./production-mutation-marker-store-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

const repository = process.env.GITHUB_REPOSITORY ?? "";
const token = process.env.GITHUB_TOKEN ?? "";
const variableToken = process.env.RELEASE_GUARD_TOKEN ?? "";
const runId = argument("run-id");
const runAttempt = argument("run-attempt");
const name = argument("name");
const markerFallback = argument("marker-fallback");
const allowMissing = process.argv.includes("--allow-missing");
const variableOnly = process.argv.includes("--variable-only");
const expectedId = String(process.env.EXPECTED_ARTIFACT_ID ?? "");
const rawExpectedDigest = String(process.env.EXPECTED_ARTIFACT_DIGEST ?? "");
const expectedDigest = rawExpectedDigest ? normalizeProductionArtifactDigest(rawExpectedDigest) : "";
if (
  repository !== "Vnd93/gaiatec-cms" ||
  !token ||
  !/^\d+$/.test(runId) ||
  !/^[A-Za-z0-9._-]{3,180}$/.test(name)
)
  throw new Error("G12_PRODUCTION_ARTIFACT_RESOLUTION_INPUT_REFUSED");
if (
  (expectedId && !rawExpectedDigest) ||
  (!expectedId && rawExpectedDigest) ||
  (rawExpectedDigest && !expectedDigest)
)
  throw new Error("G12_PRODUCTION_ARTIFACT_EXPECTATION_REFUSED");
if (
  markerFallback &&
  (variableToken.length < 30 ||
    !/^[a-f0-9]{64}$/.test(process.env.PRODUCTION_MARKER_HMAC_KEY ?? "") ||
    !/^\d+$/.test(runAttempt) ||
    !/^[a-f0-9]{40}$/.test(process.env.EXPECTED_CONTROL_SHA ?? ""))
)
  throw new Error("G12_PRODUCTION_MARKER_FALLBACK_INPUT_REFUSED");
if (variableOnly && (!markerFallback || !expectedId || !expectedDigest))
  throw new Error("G12_PRODUCTION_MARKER_VARIABLE_ONLY_BINDING_REQUIRED");

async function github(path, { allowNotFound = false, tokenOverride } = {}) {
  const requestToken = tokenOverride ?? token;
  let lastFailure = "transport";
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(`https://api.github.com${path}`, {
        headers: {
          Authorization: `Bearer ${requestToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: AbortSignal.timeout(15_000),
      });
      const payload = await response.json().catch(() => null);
      if (allowNotFound && response.status === 404) return null;
      if (response.ok) return payload;
      lastFailure = String(response.status);
      if (![408, 429].includes(response.status) && response.status < 500)
        throw new Error(`G12_PRODUCTION_ARTIFACT_RESOLUTION_FAILED:${response.status}`);
    } catch (error) {
      if (String(error?.message ?? "").startsWith("G12_PRODUCTION_ARTIFACT_RESOLUTION_FAILED:")) throw error;
      lastFailure = "transport";
    }
    if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 1_000 * 2 ** (attempt - 1)));
  }
  throw new Error(`G12_PRODUCTION_ARTIFACT_RESOLUTION_RETRY_EXHAUSTED:${lastFailure}`);
}

async function resolveRedundantMarker() {
  if (!markerFallback) return null;
  const payload = await github(
    `/repos/${repository}/actions/variables/${PRODUCTION_MUTATION_MARKER_VARIABLE}`,
    { allowNotFound: true, tokenOverride: variableToken },
  );
  if (payload === null) return null;
  if (payload?.name !== PRODUCTION_MUTATION_MARKER_VARIABLE || typeof payload?.value !== "string")
    throw new Error("G12_PRODUCTION_MARKER_FALLBACK_RESPONSE_REFUSED");
  let wrapper;
  try {
    wrapper = JSON.parse(payload.value);
  } catch (error) {
    throw new Error("G12_PRODUCTION_MARKER_FALLBACK_RESPONSE_REFUSED", { cause: error });
  }
  const result = verifyProductionMutationMarkerVariable(wrapper, process.env.PRODUCTION_MARKER_HMAC_KEY, {
    runId,
    runAttempt,
    controlSha: process.env.EXPECTED_CONTROL_SHA,
  });
  if (
    !result.valid ||
    wrapper?.artifact?.name !== name ||
    (expectedId && wrapper?.artifact?.id !== expectedId) ||
    (expectedDigest && wrapper?.artifact?.digest !== expectedDigest)
  )
    throw new Error(`G12_PRODUCTION_MARKER_FALLBACK_REFUSED:${result.violations.join(",")}`);
  const output = resolve(markerFallback);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(result.marker, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  return wrapper;
}

async function emitRedundantMarker(redundant, event) {
  if (process.env.GITHUB_OUTPUT)
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `found=true\nsource=variable\nartifact_id=${redundant.artifact.id}\nartifact_digest=${redundant.artifact.digest}\nartifact_name=${name}\n`,
      "utf8",
    );
  console.log(
    JSON.stringify({
      event,
      runId,
      runAttempt,
      name,
      artifactId: redundant.artifact.id,
      secretsDisclosed: false,
    }),
  );
}

async function listRunArtifacts() {
  const artifacts = [];
  for (let page = 1; page <= 10; page += 1) {
    const payload = await github(
      `/repos/${repository}/actions/runs/${runId}/artifacts?per_page=100&page=${page}`,
    );
    if (!Number.isSafeInteger(payload?.total_count) || payload.total_count < 0 || payload.total_count > 1000)
      throw new Error("G12_PRODUCTION_ARTIFACT_LIST_REFUSED");
    if (!Array.isArray(payload?.artifacts)) throw new Error("G12_PRODUCTION_ARTIFACT_LIST_REFUSED");
    artifacts.push(...payload.artifacts);
    if (artifacts.length >= payload.total_count) return artifacts;
  }
  throw new Error("G12_PRODUCTION_ARTIFACT_LIST_INCOMPLETE");
}

async function listAttemptJobs() {
  if (!/^\d+$/.test(runAttempt)) throw new Error("G12_PRODUCTION_MARKER_ABSENCE_PROOF_ATTEMPT_REQUIRED");
  const jobs = [];
  for (let page = 1; page <= 10; page += 1) {
    const payload = await github(
      `/repos/${repository}/actions/runs/${runId}/attempts/${runAttempt}/jobs?per_page=100&page=${page}`,
    );
    if (!Number.isSafeInteger(payload?.total_count) || payload.total_count < 0 || payload.total_count > 1000)
      throw new Error("G12_PRODUCTION_JOB_LIST_REFUSED");
    if (!Array.isArray(payload?.jobs)) throw new Error("G12_PRODUCTION_JOB_LIST_REFUSED");
    jobs.push(...payload.jobs);
    if (jobs.length >= payload.total_count) return { jobs };
  }
  throw new Error("G12_PRODUCTION_JOB_LIST_INCOMPLETE");
}

if (variableOnly) {
  const redundant = await resolveRedundantMarker();
  if (!redundant) throw new Error("G12_PRODUCTION_MARKER_VARIABLE_FALLBACK_REQUIRED");
  await emitRedundantMarker(redundant, "g12.production.artifact_identity.recovered_after_download_failure");
  process.exit(0);
}

let matches = [];
let artifactFailure;
try {
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const artifacts = await listRunArtifacts();
    const named = artifacts.filter((artifact) => artifact?.name === name && artifact?.expired === false);
    matches = expectedId ? named.filter((artifact) => String(artifact?.id ?? "") === expectedId) : named;
    if (matches.length > 0 || attempt === 10) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(1_000 * 2 ** (attempt - 1), 15_000)));
  }
} catch (error) {
  artifactFailure = error;
}
if (matches.length === 0 && allowMissing) {
  const redundant = await resolveRedundantMarker();
  if (redundant) {
    await emitRedundantMarker(
      redundant,
      artifactFailure
        ? "g12.production.artifact_identity.recovered_from_redundant_marker_after_api_failure"
        : "g12.production.artifact_identity.recovered_from_redundant_marker",
    );
    process.exit(0);
  }
  const absence = evaluateProductionMarkerAbsenceProof(await listAttemptJobs());
  if (!absence.valid)
    throw new Error(`G12_PRODUCTION_MARKER_ABSENCE_UNPROVEN:${absence.violations.join(",")}`);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, "found=false\n", "utf8");
  console.log(
    JSON.stringify({
      event: "g12.production.artifact_identity.absent_proven",
      runId,
      runAttempt,
      name,
      markerStepConclusion: absence.markerConclusion,
      redundancyStepConclusion: absence.redundancyConclusion,
      productionMutationsObserved: 0,
    }),
  );
  process.exit(0);
}
if (artifactFailure) throw artifactFailure;
if (
  matches.length !== 1 ||
  !Number.isSafeInteger(matches[0]?.id) ||
  !/^sha256:[a-f0-9]{64}$/.test(matches[0]?.digest ?? "") ||
  String(matches[0]?.workflow_run?.id ?? "") !== runId ||
  !Number.isFinite(Date.parse(matches[0]?.expires_at ?? "")) ||
  Date.parse(matches[0].expires_at) <= Date.now() ||
  (expectedId && String(matches[0].id) !== expectedId) ||
  (expectedDigest && matches[0].digest !== expectedDigest)
)
  throw new Error("G12_PRODUCTION_ARTIFACT_IDENTITY_REFUSED");
if (process.env.GITHUB_OUTPUT)
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `found=true\nsource=artifact\nartifact_id=${matches[0].id}\nartifact_digest=${matches[0].digest}\nartifact_name=${name}\n`,
    "utf8",
  );
console.log(
  JSON.stringify({
    event: "g12.production.artifact_identity.verified",
    runId,
    name,
    artifactId: matches[0].id,
    digestPresent: true,
  }),
);
