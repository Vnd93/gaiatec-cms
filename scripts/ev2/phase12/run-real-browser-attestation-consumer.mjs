import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, lstat, open, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  realBrowserAttestationVariableName,
  validateRealBrowserAttestationReport,
  validateRealBrowserGitHubVariableMetadata,
  verifyRealBrowserAttestationVariable,
} from "./real-browser-attestation-store-lib.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../../..");
const fullSha = /^[0-9a-f]{40}$/;
const sha256Pattern = /^[0-9a-f]{64}$/;
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const repository = "Vnd93/gaiatec-cms";
const apiRoot = "https://api.github.com";
const PARENT_JOB_NAME = "deploy";
const PARENT_WAIT_STEP = Object.freeze({
  staging: "Run the complete authenticated mutating editorial cycle first",
  production: "Create the complete UI-owned production fixture on the exact sealed preview",
});
const PARENT_STATE_KEYS = Object.freeze([
  "schemaVersion",
  "event",
  "repository",
  "environment",
  "candidateSha",
  "controlSha",
  "runId",
  "runAttempt",
  "jobId",
  "jobName",
  "stepNumber",
  "stepName",
]);

function option(args, name) {
  const index = args.indexOf(`--${name}`);
  if (index < 0 || !args[index + 1] || args[index + 1].startsWith("--")) {
    throw new Error(`G12_REAL_BROWSER_CONSUMER_OPTION_REQUIRED:${name}`);
  }
  return args[index + 1];
}

function containedPath(configured, code) {
  if (isAbsolute(configured)) throw new Error(`${code}:absolute_path_refused`);
  const target = resolve(repositoryRoot, configured);
  const fromRoot = relative(repositoryRoot, target);
  if (!fromRoot || fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new Error(`${code}:path_escape`);
  }
  return target;
}

async function securelyReadJson(path, code) {
  const rootReal = await realpath(repositoryRoot);
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size < 2 || metadata.size > 64 * 1024) {
    throw new Error(`${code}:file_refused`);
  }
  if (process.platform !== "win32" && (metadata.mode & 0o077) !== 0) {
    throw new Error(`${code}:mode_refused`);
  }
  const targetReal = await realpath(path);
  const fromRoot = relative(rootReal, targetReal);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new Error(`${code}:path_escape`);
  }
  const handle = await open(targetReal, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = await handle.stat({ bigint: true });
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs
    ) {
      throw new Error(`${code}:changed_while_reading`);
    }
    return JSON.parse(bytes.toString("utf8"));
  } finally {
    await handle.close();
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exactKeys(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort())
  );
}

function challengeVariableName(environment, runId, runAttempt) {
  return `G12_${environment.toUpperCase()}_REAL_BROWSER_CHALLENGE_${runId}_${runAttempt}`;
}

export function createRealBrowserBrokerGitHubClient({
  token,
  repositoryName,
  fetchImplementation = globalThis.fetch,
  sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
}) {
  if (typeof token !== "string" || token.length < 30 || repositoryName !== repository) {
    throw new Error("G12_REAL_BROWSER_CHALLENGE_GITHUB_ENVIRONMENT_REFUSED");
  }
  return async function request(
    path,
    { method = "GET", body, allowNotFound = false, recoverLostDelete = false, retryNotFound = false } = {},
  ) {
    if (recoverLostDelete && method !== "DELETE") {
      throw new Error("G12_REAL_BROWSER_CHALLENGE_GITHUB_DELETE_RECOVERY_REFUSED");
    }
    if (retryNotFound && (method !== "GET" || allowNotFound)) {
      throw new Error("G12_REAL_BROWSER_CHALLENGE_GITHUB_RETRY_MODE_REFUSED");
    }
    const maximumAttempts = retryNotFound ? 6 : 4;
    let lastFailure = "transport";
    let deleteTransportFailure = false;
    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      try {
        const response = await fetchImplementation(`${apiRoot}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(15_000),
        });
        const payload = response.status === 204 ? null : await response.json().catch(() => null);
        if (response.status === 404 && method === "DELETE" && recoverLostDelete) {
          if (!deleteTransportFailure) {
            throw new Error("G12_REAL_BROWSER_CHALLENGE_GITHUB_HTTP_404");
          }
          return {
            found: false,
            payload,
            status: response.status,
            recoveredLostDelete: true,
          };
        }
        if (allowNotFound && response.status === 404) {
          return { found: false, payload, status: response.status, recoveredLostDelete: false };
        }
        if (response.ok) {
          return { found: true, payload, status: response.status, recoveredLostDelete: false };
        }
        lastFailure = String(response.status);
        if (
          !(retryNotFound && response.status === 404) &&
          ![408, 429].includes(response.status) &&
          response.status < 500
        ) {
          throw new Error(`G12_REAL_BROWSER_CHALLENGE_GITHUB_HTTP_${response.status}`);
        }
      } catch (error) {
        if (String(error?.message ?? "").startsWith("G12_REAL_BROWSER_CHALLENGE_GITHUB_HTTP_")) {
          throw error;
        }
        lastFailure = "transport";
        if (method === "DELETE" && recoverLostDelete) deleteTransportFailure = true;
      }
      if (attempt < maximumAttempts) await sleep(Math.min(1_000 * 2 ** (attempt - 1), 8_000));
    }
    throw new Error(`G12_REAL_BROWSER_CHALLENGE_GITHUB_RETRY_EXHAUSTED:${lastFailure}`);
  };
}

function githubRequest(path, options) {
  return createRealBrowserBrokerGitHubClient({
    token: process.env.RELEASE_GUARD_TOKEN ?? "",
    repositoryName: process.env.GITHUB_REPOSITORY,
  })(path, options);
}

function parentJobsRequest(path, options) {
  return createRealBrowserBrokerGitHubClient({
    token: process.env.GITHUB_API_TOKEN ?? "",
    repositoryName: process.env.GITHUB_REPOSITORY,
  })(path, options);
}

async function confirmGitHubIdentity(request = githubRequest) {
  const identity = await request("/user");
  if (identity.payload?.login !== "Vnd93") {
    throw new Error("G12_REAL_BROWSER_CHALLENGE_GITHUB_IDENTITY_REFUSED");
  }
}

async function publishChallengeVariable(challenge) {
  await confirmGitHubIdentity();
  const variable = challengeVariableName(challenge.environment, challenge.runId, challenge.runAttempt);
  if (challenge.challengeVariable !== variable) {
    throw new Error("G12_REAL_BROWSER_CHALLENGE_VARIABLE_BINDING_REFUSED");
  }
  const path = `/repos/${repository}/actions/variables/${encodeURIComponent(variable)}`;
  const current = await githubRequest(path, { allowNotFound: true });
  if (current.found) throw new Error("G12_REAL_BROWSER_CHALLENGE_ALREADY_EXISTS");
  const value = JSON.stringify(challenge);
  if (Buffer.byteLength(value, "utf8") > 8 * 1024) {
    throw new Error("G12_REAL_BROWSER_CHALLENGE_VALUE_SIZE_REFUSED");
  }
  await githubRequest(`/repos/${repository}/actions/variables`, {
    method: "POST",
    body: { name: variable, value },
  });
  const stored = await githubRequest(path, { retryNotFound: true });
  if (stored.payload?.name !== variable || stored.payload?.value !== value) {
    throw new Error("G12_REAL_BROWSER_CHALLENGE_CREATE_VERIFICATION_FAILED");
  }
  process.stdout.write(
    `${JSON.stringify({ event: "g12.real_browser.challenge.published", variable, expiresAt: challenge.expiresAt })}\n`,
  );
  return variable;
}

async function clearChallengeVariable({ environment, runId, runAttempt, allowMissing }) {
  if (!["staging", "production"].includes(environment) || !POSITIVE_INTEGER.test(String(runId ?? ""))) {
    throw new Error("G12_REAL_BROWSER_CHALLENGE_CLEAR_BINDING_REFUSED");
  }
  const attempt = Number(runAttempt);
  if (!Number.isSafeInteger(attempt) || attempt < 1) {
    throw new Error("G12_REAL_BROWSER_CHALLENGE_CLEAR_BINDING_REFUSED");
  }
  await confirmGitHubIdentity();
  const variable = challengeVariableName(environment, runId, attempt);
  const path = `/repos/${repository}/actions/variables/${encodeURIComponent(variable)}`;
  const current = await githubRequest(path, { allowNotFound: true });
  if (!current.found) {
    if (allowMissing) return { variable, absent: true };
    throw new Error("G12_REAL_BROWSER_CHALLENGE_NOT_FOUND");
  }
  await githubRequest(path, { method: "DELETE" });
  const terminal = await githubRequest(path, { allowNotFound: true });
  if (terminal.found) throw new Error("G12_REAL_BROWSER_CHALLENGE_CLEAR_VERIFICATION_FAILED");
  return { variable, absent: true };
}

function validateChallenge(value, expected, now = new Date()) {
  const expectedOrigin =
    expected.environment === "production"
      ? "https://gaiatecsistemas.com.br"
      : "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev";
  const emailMatch = new RegExp(
    `^qa-iab-${expected.runTag.toLowerCase()}-${expected.runAttempt}-([a-f0-9]{16})@example\\.invalid$`,
  ).exec(String(value?.syntheticEmail ?? ""));
  if (
    !exactKeys(value, [
      "schemaVersion",
      "event",
      "repository",
      "environment",
      "candidateSha",
      "controlSha",
      "runId",
      "runAttempt",
      "runTag",
      "origin",
      "campaignPath",
      "url",
      "syntheticEmail",
      "emailSha256",
      "challengeNonceSha256",
      "variable",
      "challengeVariable",
      "successLocator",
      "documentReleaseHeader",
      "healthUrl",
      "healthReleaseField",
      "deploymentIdentityRequired",
      "screenshotScope",
      "expiresAt",
    ]) ||
    value?.schemaVersion !== 1 ||
    value?.event !== "g12.real_browser.handoff.ready" ||
    value?.repository !== "Vnd93/gaiatec-cms" ||
    value?.environment !== expected.environment ||
    value?.candidateSha !== expected.candidateSha ||
    value?.controlSha !== expected.controlSha ||
    value?.runId !== expected.runId ||
    value?.runAttempt !== expected.runAttempt ||
    value?.runTag !== expected.runTag ||
    value?.origin !== expectedOrigin ||
    value?.url !== `${expectedOrigin}${value?.campaignPath ?? ""}` ||
    !/^\/campanhas\/qa-lead-qa-cms-final-[0-9]{8}-[0-9a-f]{8}-[0-9a-f]{8}$/.test(
      String(value?.campaignPath ?? ""),
    ) ||
    !emailMatch ||
    value?.emailSha256 !== sha256(String(value?.syntheticEmail ?? "")) ||
    value?.challengeNonceSha256 !== sha256(String(emailMatch?.[1] ?? "")) ||
    !sha256Pattern.test(String(value?.challengeNonceSha256 ?? "")) ||
    value?.variable !==
      `G12_${expected.environment.toUpperCase()}_REAL_BROWSER_${expected.runId}_${expected.runAttempt}` ||
    value?.challengeVariable !==
      challengeVariableName(expected.environment, expected.runId, expected.runAttempt) ||
    value?.successLocator !== '[data-form-submission-status="success"]' ||
    value?.documentReleaseHeader !== "x-release" ||
    value?.healthUrl !== `${expectedOrigin}/healthz` ||
    value?.healthReleaseField !== "release" ||
    value?.deploymentIdentityRequired !== true ||
    value?.screenshotScope !== "success-locator-only-no-input-fields" ||
    !(now instanceof Date) ||
    !Number.isFinite(now.getTime()) ||
    !Number.isFinite(Date.parse(String(value?.expiresAt ?? ""))) ||
    Date.parse(value.expiresAt) <= now.getTime() ||
    Date.parse(value.expiresAt) > now.getTime() + 16 * 60_000
  ) {
    throw new Error("G12_REAL_BROWSER_CONSUMER_CHALLENGE_REFUSED");
  }
  return value;
}

function parentJobsPath(runId, runAttempt) {
  return `/repos/${repository}/actions/runs/${runId}/attempts/${runAttempt}/jobs?per_page=100&page=1`;
}

function observeParentWaitStep(payload, expected, previous = null) {
  if (
    !Number.isSafeInteger(payload?.total_count) ||
    payload.total_count < 1 ||
    payload.total_count > 100 ||
    !Array.isArray(payload?.jobs) ||
    payload.jobs.length !== payload.total_count
  ) {
    throw new Error("G12_REAL_BROWSER_PARENT_JOBS_CARDINALITY_REFUSED");
  }
  const matchingJobs = payload.jobs.filter((job) => job?.name === PARENT_JOB_NAME);
  if (matchingJobs.length !== 1) {
    throw new Error("G12_REAL_BROWSER_PARENT_DEPLOY_JOB_CARDINALITY_REFUSED");
  }
  const job = matchingJobs[0];
  const expectedStepName = PARENT_WAIT_STEP[expected.environment];
  const matchingSteps = Array.isArray(job?.steps)
    ? job.steps.filter((step) => step?.name === expectedStepName)
    : [];
  const activeSteps = Array.isArray(job?.steps)
    ? job.steps.filter((step) => step?.status === "in_progress" && step?.conclusion === null)
    : [];
  if (
    !POSITIVE_INTEGER.test(String(job?.id ?? "")) ||
    String(job?.run_id ?? "") !== expected.runId ||
    Number(job?.run_attempt) !== expected.runAttempt ||
    job?.head_branch !== "main" ||
    job?.head_sha !== expected.controlSha ||
    matchingSteps.length !== 1 ||
    !Number.isSafeInteger(matchingSteps[0]?.number) ||
    matchingSteps[0].number < 1
  ) {
    throw new Error("G12_REAL_BROWSER_PARENT_WAIT_STEP_BINDING_REFUSED");
  }
  const snapshot = {
    schemaVersion: 1,
    event: "g12.real_browser.parent_wait_step.active",
    repository,
    environment: expected.environment,
    candidateSha: expected.candidateSha,
    controlSha: expected.controlSha,
    runId: expected.runId,
    runAttempt: expected.runAttempt,
    jobId: String(job.id),
    jobName: job.name,
    stepNumber: matchingSteps[0].number,
    stepName: matchingSteps[0].name,
  };
  if (
    previous !== null &&
    (!exactKeys(previous, PARENT_STATE_KEYS) ||
      PARENT_STATE_KEYS.some((key) => previous[key] !== snapshot[key]))
  ) {
    throw new Error("G12_REAL_BROWSER_PARENT_WAIT_STEP_CHANGED");
  }
  const step = matchingSteps[0];
  const active =
    job.status === "in_progress" &&
    job.conclusion === null &&
    step.status === "in_progress" &&
    step.conclusion === null &&
    activeSteps.length === 1 &&
    activeSteps[0] === step;
  const completedSuccess =
    step.status === "completed" &&
    step.conclusion === "success" &&
    ((job.status === "in_progress" && job.conclusion === null) ||
      (job.status === "completed" && job.conclusion === "success"));
  return { snapshot, state: active ? "active" : completedSuccess ? "completed-success" : "inactive" };
}

async function queryActiveParentWaitStep(expected, previous, request) {
  const response = await request(parentJobsPath(expected.runId, expected.runAttempt));
  if (response.status !== 200) throw new Error("G12_REAL_BROWSER_PARENT_JOBS_STATUS_REFUSED");
  const observation = observeParentWaitStep(response.payload, expected, previous);
  if (observation.state !== "active") {
    throw new Error("G12_REAL_BROWSER_PARENT_WAIT_STEP_INACTIVE");
  }
  return observation.snapshot;
}

async function queryParentWaitStepAcknowledgement(expected, previous, request) {
  const response = await request(parentJobsPath(expected.runId, expected.runAttempt));
  if (response.status !== 200) throw new Error("G12_REAL_BROWSER_PARENT_JOBS_STATUS_REFUSED");
  const observation = observeParentWaitStep(response.payload, expected, previous);
  if (!new Set(["active", "completed-success"]).has(observation.state)) {
    throw new Error("G12_REAL_BROWSER_PARENT_WAIT_STEP_INACTIVE");
  }
  return observation.snapshot;
}

async function assertPathAbsent(path, code) {
  try {
    await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`${code}:already_exists`);
}

async function writeExclusiveJson(path, value, code) {
  try {
    await writeFile(path, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  } catch (error) {
    throw new Error(`${code}:write_refused`, { cause: error });
  }
}

function sameChallengeSnapshot(left, right) {
  return (
    left?.name === right?.name &&
    left?.value === right?.value &&
    left?.created_at === right?.created_at &&
    left?.updated_at === right?.updated_at
  );
}

export async function claimChallengeVariable(
  { environment, candidateSha, controlSha, runId, runAttempt, reportFile, parentStateFile },
  dependencies = {},
) {
  const attempt = Number(runAttempt);
  if (
    !["staging", "production"].includes(environment) ||
    !fullSha.test(String(candidateSha ?? "")) ||
    !fullSha.test(String(controlSha ?? "")) ||
    !POSITIVE_INTEGER.test(String(runId ?? "")) ||
    !Number.isSafeInteger(attempt) ||
    attempt < 1
  ) {
    throw new Error("G12_REAL_BROWSER_CHALLENGE_CLAIM_BINDING_REFUSED");
  }
  const now = dependencies.now ?? new Date();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("G12_REAL_BROWSER_CHALLENGE_CLAIM_CLOCK_REFUSED");
  }
  const reportPath = containedPath(reportFile, "G12_REAL_BROWSER_CHALLENGE_CLAIM_REPORT");
  const parentStatePath = containedPath(parentStateFile, "G12_REAL_BROWSER_CHALLENGE_CLAIM_PARENT_STATE");
  await assertPathAbsent(parentStatePath, "G12_REAL_BROWSER_CHALLENGE_CLAIM_PARENT_STATE");
  const report = await securelyReadJson(reportPath, "G12_REAL_BROWSER_CHALLENGE_CLAIM_REPORT");
  const reportValidation = validateRealBrowserAttestationReport(
    report,
    { environment, candidateSha, runId, runAttempt: attempt },
    now,
  );
  if (!reportValidation.valid) {
    throw new Error("G12_REAL_BROWSER_CHALLENGE_CLAIM_REPORT_REFUSED");
  }

  const request = dependencies.githubRequest ?? githubRequest;
  const jobsRequest = dependencies.parentJobsRequest ?? parentJobsRequest;
  await confirmGitHubIdentity(request);
  const parentSnapshot = await queryActiveParentWaitStep(
    { environment, candidateSha, controlSha, runId, runAttempt: attempt },
    null,
    jobsRequest,
  );
  const variable = challengeVariableName(environment, runId, attempt);
  const path = `/repos/${repository}/actions/variables/${encodeURIComponent(variable)}`;
  const current = await request(path, { allowNotFound: true });
  if (!current.found) throw new Error("G12_REAL_BROWSER_CHALLENGE_CLAIM_NOT_FOUND");
  let challenge;
  try {
    challenge = JSON.parse(String(current.payload?.value ?? ""));
  } catch {
    throw new Error("G12_REAL_BROWSER_CHALLENGE_CLAIM_VALUE_REFUSED");
  }
  validateChallenge(
    challenge,
    {
      environment,
      candidateSha,
      controlSha,
      runId,
      runAttempt: attempt,
      runTag: report.runTag,
    },
    now,
  );
  if (
    current.payload?.name !== variable ||
    challenge.origin !== report.origin ||
    challenge.campaignPath !== report.campaignPath ||
    challenge.emailSha256 !== report.emailSha256 ||
    challenge.challengeNonceSha256 !== report.challengeNonceSha256
  ) {
    throw new Error("G12_REAL_BROWSER_CHALLENGE_CLAIM_REPORT_BINDING_REFUSED");
  }
  const metadata = validateRealBrowserGitHubVariableMetadata(current.payload, now);
  const expiresAt = Date.parse(challenge.expiresAt);
  if (
    !metadata.valid ||
    !metadata.createdAt ||
    !metadata.updatedAt ||
    metadata.createdAt.getTime() !== metadata.updatedAt.getTime() ||
    metadata.createdAt.getTime() < expiresAt - 16 * 60_000 ||
    metadata.createdAt.getTime() > expiresAt
  ) {
    throw new Error("G12_REAL_BROWSER_CHALLENGE_CLAIM_METADATA_REFUSED");
  }

  const deletionRead = await request(path, { allowNotFound: true });
  if (!deletionRead.found || !sameChallengeSnapshot(current.payload, deletionRead.payload)) {
    throw new Error("G12_REAL_BROWSER_CHALLENGE_CLAIM_PREDELETE_SNAPSHOT_MISMATCH");
  }
  const deletion = await request(path, {
    method: "DELETE",
    allowNotFound: true,
    recoverLostDelete: true,
  });
  if (deletion.status !== 204 && !(deletion.status === 404 && deletion.recoveredLostDelete === true)) {
    throw new Error("G12_REAL_BROWSER_CHALLENGE_CLAIM_DELETE_REFUSED");
  }
  const terminal = await request(path, { allowNotFound: true });
  if (terminal.found || terminal.status !== 404) {
    throw new Error("G12_REAL_BROWSER_CHALLENGE_CLAIM_CLEAR_VERIFICATION_FAILED");
  }
  await writeExclusiveJson(parentStatePath, parentSnapshot, "G12_REAL_BROWSER_CHALLENGE_CLAIM_PARENT_STATE");
  process.stdout.write(
    `${JSON.stringify({ event: "g12.real_browser.challenge.claimed", environment, runId, runAttempt: attempt, variable })}\n`,
  );
  return { variable, claimed: true };
}

function validateParentState(value, expected) {
  if (
    !exactKeys(value, PARENT_STATE_KEYS) ||
    value.schemaVersion !== 1 ||
    value.event !== "g12.real_browser.parent_wait_step.active" ||
    value.repository !== repository ||
    value.environment !== expected.environment ||
    value.candidateSha !== expected.candidateSha ||
    value.controlSha !== expected.controlSha ||
    value.runId !== expected.runId ||
    value.runAttempt !== expected.runAttempt ||
    !POSITIVE_INTEGER.test(String(value.jobId ?? "")) ||
    value.jobName !== PARENT_JOB_NAME ||
    !Number.isSafeInteger(value.stepNumber) ||
    value.stepNumber < 1 ||
    value.stepName !== PARENT_WAIT_STEP[expected.environment]
  ) {
    throw new Error("G12_REAL_BROWSER_PARENT_STATE_REFUSED");
  }
  return value;
}

function assertHandshakeEnvironment(environment, controlSha) {
  if (
    environment.GITHUB_ACTIONS !== "true" ||
    environment.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
    environment.GITHUB_WORKFLOW_REF !==
      "Vnd93/gaiatec-cms/.github/workflows/submit-real-browser-attestation.yml@refs/heads/main" ||
    environment.RUNNER_ENVIRONMENT !== "github-hosted" ||
    environment.GITHUB_ACTOR !== "Vnd93" ||
    environment.GITHUB_TRIGGERING_ACTOR !== "Vnd93" ||
    !POSITIVE_INTEGER.test(String(environment.GITHUB_RUN_ID ?? "")) ||
    !POSITIVE_INTEGER.test(String(environment.GITHUB_RUN_ATTEMPT ?? "")) ||
    environment.GITHUB_SHA !== controlSha ||
    environment.CONTROL_SHA !== controlSha ||
    typeof environment.EVIDENCE_SALT !== "string" ||
    Buffer.byteLength(environment.EVIDENCE_SALT, "utf8") < 32
  ) {
    throw new Error("G12_REAL_BROWSER_HANDSHAKE_ENVIRONMENT_REFUSED");
  }
}

function readHandshakeClock(clock) {
  const value = clock();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error("G12_REAL_BROWSER_HANDSHAKE_CLOCK_REFUSED");
  }
  return value;
}

function validateAttestationSnapshot(payload, variable, report, expected, now, environment) {
  if (payload?.name !== variable || typeof payload?.value !== "string" || payload.value.length < 2) {
    throw new Error("G12_REAL_BROWSER_HANDSHAKE_ATTESTATION_RESPONSE_REFUSED");
  }
  let wrapper;
  try {
    wrapper = JSON.parse(payload.value);
  } catch {
    throw new Error("G12_REAL_BROWSER_HANDSHAKE_ATTESTATION_JSON_REFUSED");
  }
  const verified = verifyRealBrowserAttestationVariable(
    wrapper,
    environment.EVIDENCE_SALT,
    {
      ...expected,
      runTag: report.runTag,
      origin: report.origin,
      campaignPath: report.campaignPath,
      emailSha256: report.emailSha256,
      challengeNonceSha256: report.challengeNonceSha256,
      reference: report.reference,
    },
    now,
  );
  const metadata = validateRealBrowserGitHubVariableMetadata(payload, now);
  if (
    !verified.valid ||
    JSON.stringify(verified.wrapper?.report) !== JSON.stringify(report) ||
    String(verified.wrapper?.broker?.runId ?? "") !== environment.GITHUB_RUN_ID ||
    Number(verified.wrapper?.broker?.runAttempt) !== Number(environment.GITHUB_RUN_ATTEMPT) ||
    !metadata.valid ||
    !metadata.createdAt ||
    !metadata.updatedAt ||
    metadata.createdAt.getTime() !== metadata.updatedAt.getTime()
  ) {
    throw new Error("G12_REAL_BROWSER_HANDSHAKE_ATTESTATION_REFUSED");
  }
  return payload;
}

async function compareAndClearAttestation({ request, path, snapshot, verifySnapshot }) {
  const deletionRead = await request(path, { allowNotFound: true });
  if (!deletionRead.found) {
    if (deletionRead.status !== 404) {
      throw new Error("G12_REAL_BROWSER_HANDSHAKE_CLEAR_STATUS_REFUSED");
    }
    return { consumed: true, cleared: false };
  }
  if (!sameChallengeSnapshot(snapshot, deletionRead.payload)) {
    throw new Error("G12_REAL_BROWSER_HANDSHAKE_PREDELETE_SNAPSHOT_MISMATCH");
  }
  verifySnapshot(deletionRead.payload);
  const deletion = await request(path, {
    method: "DELETE",
    allowNotFound: true,
    recoverLostDelete: true,
  });
  if (deletion.status !== 204 && !(deletion.status === 404 && deletion.recoveredLostDelete === true)) {
    throw new Error("G12_REAL_BROWSER_HANDSHAKE_DELETE_REFUSED");
  }
  const terminal = await request(path, { allowNotFound: true });
  if (terminal.found || terminal.status !== 404) {
    throw new Error("G12_REAL_BROWSER_HANDSHAKE_CLEAR_VERIFICATION_FAILED");
  }
  return { consumed: false, cleared: true };
}

export async function clearExactBrokerAttestation(
  { environment, candidateSha, controlSha, runId, runAttempt, reportFile },
  dependencies = {},
) {
  const attempt = Number(runAttempt);
  if (
    !["staging", "production"].includes(environment) ||
    !fullSha.test(String(candidateSha ?? "")) ||
    !fullSha.test(String(controlSha ?? "")) ||
    !POSITIVE_INTEGER.test(String(runId ?? "")) ||
    !Number.isSafeInteger(attempt) ||
    attempt < 1
  ) {
    throw new Error("G12_REAL_BROWSER_BROKER_CLEAR_BINDING_REFUSED");
  }
  const processEnvironment = dependencies.environment ?? process.env;
  assertHandshakeEnvironment(processEnvironment, controlSha);
  const clock = dependencies.clock ?? (() => new Date());
  const observedNow = readHandshakeClock(clock);
  const expected = { environment, candidateSha, controlSha, runId, runAttempt: attempt };
  const report = await securelyReadJson(
    containedPath(reportFile, "G12_REAL_BROWSER_BROKER_CLEAR_REPORT"),
    "G12_REAL_BROWSER_BROKER_CLEAR_REPORT",
  );
  const reportValidation = validateRealBrowserAttestationReport(report, expected, observedNow);
  if (!reportValidation.valid) throw new Error("G12_REAL_BROWSER_BROKER_CLEAR_REPORT_REFUSED");
  const request = dependencies.githubRequest ?? githubRequest;
  const variable = realBrowserAttestationVariableName(expected);
  const path = `/repos/${repository}/actions/variables/${encodeURIComponent(variable)}`;
  await confirmGitHubIdentity(request);
  const current = await request(path, { allowNotFound: true });
  if (!current.found) {
    if (current.status !== 404) throw new Error("G12_REAL_BROWSER_BROKER_CLEAR_STATUS_REFUSED");
    return { variable, absent: true };
  }
  const verifySnapshot = (payload) =>
    validateAttestationSnapshot(
      payload,
      variable,
      report,
      expected,
      readHandshakeClock(clock),
      processEnvironment,
    );
  const snapshot = validateAttestationSnapshot(
    current.payload,
    variable,
    report,
    expected,
    observedNow,
    processEnvironment,
  );
  const cleanup = await compareAndClearAttestation({ request, path, snapshot, verifySnapshot });
  process.stdout.write(
    `${JSON.stringify({ event: "g12.real_browser.attestation.broker_cleanup", environment, runId, runAttempt: attempt, cleared: cleanup.cleared })}\n`,
  );
  return { variable, absent: cleanup.consumed, cleared: cleanup.cleared };
}

export async function awaitAttestationConsumption(
  {
    environment,
    candidateSha,
    controlSha,
    runId,
    runAttempt,
    reportFile,
    parentStateFile,
    handshakeWaitSeconds = "120",
    handshakePollMs = "2000",
  },
  dependencies = {},
) {
  const attempt = Number(runAttempt);
  const waitSeconds = Number(handshakeWaitSeconds);
  const pollMs = Number(handshakePollMs);
  if (
    !["staging", "production"].includes(environment) ||
    !fullSha.test(String(candidateSha ?? "")) ||
    !fullSha.test(String(controlSha ?? "")) ||
    !POSITIVE_INTEGER.test(String(runId ?? "")) ||
    !Number.isSafeInteger(attempt) ||
    attempt < 1 ||
    !Number.isSafeInteger(waitSeconds) ||
    waitSeconds < 1 ||
    waitSeconds > 180 ||
    !Number.isSafeInteger(pollMs) ||
    pollMs < 100 ||
    pollMs > 10_000
  ) {
    throw new Error("G12_REAL_BROWSER_HANDSHAKE_BINDING_REFUSED");
  }
  const processEnvironment = dependencies.environment ?? process.env;
  assertHandshakeEnvironment(processEnvironment, controlSha);
  const clock = dependencies.clock ?? (() => new Date());
  const initialNow = readHandshakeClock(clock);
  const expected = { environment, candidateSha, controlSha, runId, runAttempt: attempt };
  const report = await securelyReadJson(
    containedPath(reportFile, "G12_REAL_BROWSER_HANDSHAKE_REPORT"),
    "G12_REAL_BROWSER_HANDSHAKE_REPORT",
  );
  const reportValidation = validateRealBrowserAttestationReport(report, expected, initialNow);
  if (!reportValidation.valid) throw new Error("G12_REAL_BROWSER_HANDSHAKE_REPORT_REFUSED");
  const parentState = validateParentState(
    await securelyReadJson(
      containedPath(parentStateFile, "G12_REAL_BROWSER_HANDSHAKE_PARENT_STATE"),
      "G12_REAL_BROWSER_HANDSHAKE_PARENT_STATE",
    ),
    expected,
  );
  const request = dependencies.githubRequest ?? githubRequest;
  const jobsRequest = dependencies.parentJobsRequest ?? parentJobsRequest;
  const sleep =
    dependencies.sleep ??
    ((milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)));
  const variable = realBrowserAttestationVariableName(expected);
  const path = `/repos/${repository}/actions/variables/${encodeURIComponent(variable)}`;
  const maxPolls = Math.max(1, Math.ceil((waitSeconds * 1_000) / pollMs));
  await confirmGitHubIdentity(request);

  for (let poll = 1; poll <= maxPolls; poll += 1) {
    const observedNow = readHandshakeClock(clock);
    const current = await request(path, { allowNotFound: true });
    if (!current.found) {
      if (current.status !== 404) throw new Error("G12_REAL_BROWSER_HANDSHAKE_STATUS_REFUSED");
      await queryParentWaitStepAcknowledgement(expected, parentState, jobsRequest);
      process.stdout.write(
        `${JSON.stringify({ event: "g12.real_browser.attestation.acknowledged", environment, runId, runAttempt: attempt })}\n`,
      );
      return { variable, consumed: true };
    }
    const verifySnapshot = (payload) =>
      validateAttestationSnapshot(
        payload,
        variable,
        report,
        expected,
        readHandshakeClock(clock),
        processEnvironment,
      );
    const snapshot = validateAttestationSnapshot(
      current.payload,
      variable,
      report,
      expected,
      observedNow,
      processEnvironment,
    );
    try {
      await queryActiveParentWaitStep(expected, parentState, jobsRequest);
    } catch (error) {
      await compareAndClearAttestation({ request, path, snapshot, verifySnapshot });
      throw new Error("G12_REAL_BROWSER_HANDSHAKE_PARENT_INACTIVE", { cause: error });
    }
    if (poll < maxPolls) await sleep(pollMs);
    else {
      const cleanup = await compareAndClearAttestation({ request, path, snapshot, verifySnapshot });
      if (cleanup.consumed) {
        await queryParentWaitStepAcknowledgement(expected, parentState, jobsRequest);
        return { variable, consumed: true };
      }
      throw new Error("G12_REAL_BROWSER_HANDSHAKE_TIMEOUT");
    }
  }
  throw new Error("G12_REAL_BROWSER_HANDSHAKE_UNREACHABLE");
}

export async function runRealBrowserStoreChild(args, { signal } = {}) {
  if (signal?.aborted) throw new Error("G12_REAL_BROWSER_CONSUMER_INTERRUPTED");
  const child = spawn(process.execPath, args, {
    cwd: repositoryRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let stdout = "";
  let stderr = "";
  let interrupted = false;
  const collect = (current, chunk) => `${current}${String(chunk)}`.slice(-128 * 1024);
  child.stdout.on("data", (chunk) => {
    stdout = collect(stdout, chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderr = collect(stderr, chunk);
  });
  let forceKillTimer;
  let terminationStarted = false;
  const terminate = () => {
    if (terminationStarted) return;
    terminationStarted = true;
    interrupted = true;
    child.kill("SIGTERM");
    forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 10_000);
    forceKillTimer.unref?.();
  };
  const resultPromise = new Promise((resolvePromise, rejectPromise) => {
    child.once("error", rejectPromise);
    child.once("close", (status, exitSignal) => resolvePromise({ status, exitSignal }));
  });
  signal?.addEventListener("abort", terminate, { once: true });
  if (signal?.aborted) terminate();
  const result = await resultPromise.finally(() => {
    signal?.removeEventListener("abort", terminate);
    if (forceKillTimer) clearTimeout(forceKillTimer);
  });
  if (interrupted) throw new Error("G12_REAL_BROWSER_CONSUMER_INTERRUPTED");
  if (result.status !== 0) {
    const code = String(stderr || stdout || result.exitSignal || "consumer_failed")
      .trim()
      .split(/\r?\n/)
      .at(-1)
      ?.replace(/[^A-Z0-9_:-]/gi, "_")
      .slice(0, 180);
    throw new Error(`G12_REAL_BROWSER_CONSUMER_FAILED:${code || "unknown"}`);
  }
}

export async function runRealBrowserAttestationConsumer(args, dependencies = {}) {
  const environment = option(args, "environment");
  const candidateSha = option(args, "candidate-sha");
  const controlSha = option(args, "control-sha");
  const runId = option(args, "run-id");
  const runAttemptText = option(args, "run-attempt");
  const runAttempt = Number(runAttemptText);
  const runTag = option(args, "run-tag");
  const challengeFile = containedPath(option(args, "challenge-file"), "G12_REAL_BROWSER_CHALLENGE");
  const outputJson = containedPath(option(args, "output-json"), "G12_REAL_BROWSER_OUTPUT_JSON");
  const outputPng = containedPath(option(args, "output-png"), "G12_REAL_BROWSER_OUTPUT_PNG");
  const waitSeconds = Number(option(args, "challenge-wait-seconds"));
  if (
    !["staging", "production"].includes(environment) ||
    !fullSha.test(candidateSha) ||
    !fullSha.test(controlSha) ||
    !/^\d+$/.test(runId) ||
    !Number.isSafeInteger(runAttempt) ||
    runAttempt < 1 ||
    !/^QA-CMS-FINAL-[0-9]{8}-[0-9a-f]{8}$/.test(runTag) ||
    !runTag.endsWith(`-${candidateSha.slice(0, 8)}`) ||
    !Number.isSafeInteger(waitSeconds) ||
    waitSeconds < 1 ||
    waitSeconds > 35 * 60 ||
    !process.env.RELEASE_GUARD_TOKEN ||
    !process.env.EVIDENCE_SALT
  ) {
    throw new Error("G12_REAL_BROWSER_CONSUMER_CONFIGURATION_REFUSED");
  }
  const deadline = Date.now() + waitSeconds * 1_000;
  while (Date.now() < deadline) {
    try {
      await access(challengeFile, constants.F_OK);
      break;
    } catch {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_000));
    }
  }
  try {
    await access(challengeFile, constants.F_OK);
  } catch {
    throw new Error("G12_REAL_BROWSER_CONSUMER_CHALLENGE_TIMEOUT");
  }
  const challenge = validateChallenge(await securelyReadJson(challengeFile, "G12_REAL_BROWSER_CHALLENGE"), {
    environment,
    candidateSha,
    controlSha,
    runId,
    runAttempt,
    runTag,
  });
  const cli = resolve(scriptDirectory, "real-browser-attestation-store.mjs");
  const abortController = new AbortController();
  const interrupt = () => abortController.abort();
  process.once("SIGTERM", interrupt);
  process.once("SIGINT", interrupt);
  let challengePublished = false;
  try {
    await (dependencies.publishChallengeVariable ?? publishChallengeVariable)(challenge);
    challengePublished = true;
    await (dependencies.runStoreChild ?? runRealBrowserStoreChild)(
      [
        cli,
        "consume",
        "--environment",
        environment,
        "--candidate-sha",
        candidateSha,
        "--run-id",
        runId,
        "--run-attempt",
        String(runAttempt),
        "--run-tag",
        runTag,
        "--origin",
        challenge.origin,
        "--campaign-path",
        challenge.campaignPath,
        "--email-sha256",
        challenge.emailSha256,
        "--challenge-nonce-sha256",
        challenge.challengeNonceSha256,
        "--control-sha",
        controlSha,
        "--output-json",
        relative(repositoryRoot, outputJson).split("\\").join("/"),
        "--output-png",
        relative(repositoryRoot, outputPng).split("\\").join("/"),
        "--poll-seconds",
        "900",
        "--poll-interval-ms",
        "5000",
      ],
      { signal: abortController.signal },
    );
  } finally {
    process.removeListener("SIGTERM", interrupt);
    process.removeListener("SIGINT", interrupt);
    if (challengePublished) {
      await (dependencies.clearChallengeVariable ?? clearChallengeVariable)({
        environment,
        runId,
        runAttempt,
        allowMissing: true,
      });
    }
  }
  process.stdout.write(
    `${JSON.stringify({ event: "g12.real_browser.consumer.completed", environment, candidateSha, runId, runAttempt })}\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const operation = ["claim-challenge", "await-consumption", "clear-attestation", "clear-challenge"].includes(
    args[0],
  )
    ? args[0]
    : "consume";
  const operationArgs = operation === "consume" ? args : args.slice(1);
  const execution =
    operation === "claim-challenge"
      ? claimChallengeVariable({
          environment: option(operationArgs, "environment"),
          candidateSha: option(operationArgs, "candidate-sha"),
          controlSha: option(operationArgs, "control-sha"),
          runId: option(operationArgs, "run-id"),
          runAttempt: option(operationArgs, "run-attempt"),
          reportFile: option(operationArgs, "report"),
          parentStateFile: option(operationArgs, "parent-state"),
        })
      : operation === "await-consumption"
        ? awaitAttestationConsumption({
            environment: option(operationArgs, "environment"),
            candidateSha: option(operationArgs, "candidate-sha"),
            controlSha: option(operationArgs, "control-sha"),
            runId: option(operationArgs, "run-id"),
            runAttempt: option(operationArgs, "run-attempt"),
            reportFile: option(operationArgs, "report"),
            parentStateFile: option(operationArgs, "parent-state"),
            handshakeWaitSeconds: option(operationArgs, "handshake-wait-seconds"),
            handshakePollMs: option(operationArgs, "handshake-poll-ms"),
          })
        : operation === "clear-attestation"
          ? clearExactBrokerAttestation({
              environment: option(operationArgs, "environment"),
              candidateSha: option(operationArgs, "candidate-sha"),
              controlSha: option(operationArgs, "control-sha"),
              runId: option(operationArgs, "run-id"),
              runAttempt: option(operationArgs, "run-attempt"),
              reportFile: option(operationArgs, "report"),
            })
          : operation === "clear-challenge"
            ? clearChallengeVariable({
                environment: option(operationArgs, "environment"),
                runId: option(operationArgs, "run-id"),
                runAttempt: option(operationArgs, "run-attempt"),
                allowMissing: operationArgs.includes("--allow-missing"),
              })
            : runRealBrowserAttestationConsumer(operationArgs);
  execution.catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "G12_REAL_BROWSER_CONSUMER_FAILED"}\n`);
    process.exitCode = 1;
  });
}
