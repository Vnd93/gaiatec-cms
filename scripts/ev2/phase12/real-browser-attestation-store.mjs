import { randomUUID } from "node:crypto";
import { appendFile, link, lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildRealBrowserAttestationVariable,
  MAX_REAL_BROWSER_SCREENSHOT_BYTES,
  realBrowserAttestationVariableName,
  sanitizedConsumedRealBrowserAttestation,
  serializeRealBrowserAttestationVariable,
  validateRealBrowserAttestationExpected,
  validateRealBrowserGitHubVariableMetadata,
  verifyRealBrowserAttestationVariable,
} from "./real-browser-attestation-store-lib.mjs";

const REPOSITORY = "Vnd93/gaiatec-cms";
const API_ROOT = "https://api.github.com";
const TOKEN_MINIMUM_LENGTH = 30;
const REPORT_MAXIMUM_BYTES = 16 * 1024;
const BROKER_WORKFLOW_REF =
  "Vnd93/gaiatec-cms/.github/workflows/submit-real-browser-attestation.yml@refs/heads/main";

const OPTION_NAMES = new Set([
  "file",
  "screenshot",
  "environment",
  "candidate-sha",
  "run-id",
  "run-attempt",
  "run-tag",
  "origin",
  "campaign-path",
  "email-sha256",
  "challenge-nonce-sha256",
  "reference",
  "control-sha",
  "output-json",
  "output-png",
  "poll-seconds",
  "poll-interval-ms",
]);
const BINDING_OPTION_NAMES = [
  "environment",
  "candidate-sha",
  "run-id",
  "run-attempt",
  "run-tag",
  "origin",
  "campaign-path",
  "email-sha256",
  "challenge-nonce-sha256",
  "reference",
  "control-sha",
];
const OPERATION_OPTION_NAMES = Object.freeze({
  put: new Set(["file", "screenshot"]),
  consume: new Set([
    ...BINDING_OPTION_NAMES,
    "output-json",
    "output-png",
    "poll-seconds",
    "poll-interval-ms",
  ]),
  clear: new Set(BINDING_OPTION_NAMES),
});

function parseArguments(argv) {
  const operation = argv[2] ?? "";
  if (!["put", "consume", "clear"].includes(operation)) {
    throw new Error("G12_REAL_BROWSER_STORE_OPERATION_REFUSED");
  }
  const values = new Map();
  let allowMissing = false;
  for (let index = 3; index < argv.length; index += 1) {
    const entry = argv[index];
    if (entry === "--allow-missing") {
      if (allowMissing) throw new Error("G12_REAL_BROWSER_STORE_ARGUMENTS_REFUSED");
      allowMissing = true;
      continue;
    }
    if (!entry.startsWith("--") || !OPTION_NAMES.has(entry.slice(2)) || values.has(entry.slice(2))) {
      throw new Error("G12_REAL_BROWSER_STORE_ARGUMENTS_REFUSED");
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error("G12_REAL_BROWSER_STORE_ARGUMENTS_REFUSED");
    values.set(entry.slice(2), value);
    index += 1;
  }
  if (allowMissing && operation !== "clear") throw new Error("G12_REAL_BROWSER_STORE_ARGUMENTS_REFUSED");
  if ([...values.keys()].some((name) => !OPERATION_OPTION_NAMES[operation].has(name))) {
    throw new Error("G12_REAL_BROWSER_STORE_ARGUMENTS_REFUSED");
  }
  return { operation, values, allowMissing };
}

function required(values, name) {
  const value = values.get(name);
  if (!value) throw new Error(`G12_REAL_BROWSER_STORE_${name.replaceAll("-", "_").toUpperCase()}_REQUIRED`);
  return value;
}

function expectedFromArguments(values, { minimum = false } = {}) {
  const expected = {
    environment: required(values, "environment"),
    candidateSha: required(values, "candidate-sha"),
    runId: required(values, "run-id"),
    runAttempt: required(values, "run-attempt"),
    controlSha: required(values, "control-sha"),
  };
  if (!minimum) {
    expected.runTag = required(values, "run-tag");
    expected.origin = required(values, "origin");
    expected.campaignPath = required(values, "campaign-path");
    expected.emailSha256 = required(values, "email-sha256");
    expected.challengeNonceSha256 = required(values, "challenge-nonce-sha256");
  }
  for (const [argumentName, key] of [
    ["run-tag", "runTag"],
    ["origin", "origin"],
    ["campaign-path", "campaignPath"],
    ["email-sha256", "emailSha256"],
    ["challenge-nonce-sha256", "challengeNonceSha256"],
    ["reference", "reference"],
  ]) {
    if (values.has(argumentName)) expected[key] = values.get(argumentName);
  }
  const result = validateRealBrowserAttestationExpected(expected, { minimum });
  if (!result.valid) {
    throw new Error(`G12_REAL_BROWSER_STORE_EXPECTED_REFUSED:${result.violations.join(",")}`);
  }
  return expected;
}

async function readStrictFile(path, maximumBytes, label) {
  const absolute = resolve(path);
  const metadata = await lstat(absolute);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size < 1 || metadata.size > maximumBytes) {
    throw new Error(`G12_REAL_BROWSER_STORE_${label}_FILE_REFUSED`);
  }
  const value = await readFile(absolute);
  if (value.length !== metadata.size) throw new Error(`G12_REAL_BROWSER_STORE_${label}_FILE_CHANGED`);
  return value;
}

function parseJson(value, label) {
  try {
    return JSON.parse(value.toString("utf8"));
  } catch {
    throw new Error(`G12_REAL_BROWSER_STORE_${label}_JSON_REFUSED`);
  }
}

function createGitHubClient({ token, fetchImplementation, sleep }) {
  async function request(
    path,
    { method = "GET", body, allowNotFound = false, retryNotFound = false, retryPresent = false } = {},
  ) {
    if (
      (retryNotFound && retryPresent) ||
      (retryNotFound && (method !== "GET" || allowNotFound)) ||
      (retryPresent && (method !== "GET" || !allowNotFound))
    ) {
      throw new Error("G12_REAL_BROWSER_STORE_RETRY_MODE_REFUSED");
    }
    const maximumAttempts = retryNotFound || retryPresent ? 6 : 4;
    let lastFailure = "transport";
    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      try {
        const response = await fetchImplementation(`${API_ROOT}${path}`, {
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
        if (allowNotFound && response.status === 404) {
          return { found: false, payload: null, status: response.status };
        }
        if (response.ok) {
          if (!retryPresent || attempt === maximumAttempts) {
            return { found: true, payload, status: response.status };
          }
          lastFailure = "still-present";
        } else {
          lastFailure = String(response.status);
          if (
            !(retryNotFound && response.status === 404) &&
            ![408, 429].includes(response.status) &&
            response.status < 500
          ) {
            throw new Error(`G12_REAL_BROWSER_STORE_API_REFUSED:${response.status}`);
          }
        }
      } catch (error) {
        if (String(error?.message ?? "").startsWith("G12_REAL_BROWSER_STORE_API_REFUSED:")) {
          throw error;
        }
        lastFailure = "transport";
      }
      if (attempt < maximumAttempts) await sleep(Math.min(1_000 * 2 ** (attempt - 1), 8_000));
    }
    throw new Error(`G12_REAL_BROWSER_STORE_API_RETRY_EXHAUSTED:${lastFailure}`);
  }
  return request;
}

async function confirmGitHubIdentity(github) {
  const identity = await github("/user");
  if (identity.payload?.login !== "Vnd93") throw new Error("G12_REAL_BROWSER_STORE_GITHUB_IDENTITY_REFUSED");
}

function parseStored(payload, variable) {
  if (payload?.name !== variable || typeof payload?.value !== "string" || payload.value.length === 0) {
    throw new Error("G12_REAL_BROWSER_STORE_RESPONSE_REFUSED");
  }
  return parseJson(Buffer.from(payload.value, "utf8"), "VARIABLE");
}

function sameVariableSnapshot(left, right) {
  return (
    left?.name === right?.name &&
    left?.value === right?.value &&
    left?.created_at === right?.created_at &&
    left?.updated_at === right?.updated_at
  );
}

function verifyStored({ payload, variable, evidenceSalt, expected, now }) {
  const stored = parseStored(payload, variable);
  const result = verifyRealBrowserAttestationVariable(stored, evidenceSalt, expected, now);
  if (!result.valid) {
    throw new Error(`G12_REAL_BROWSER_STORE_ATTESTATION_REFUSED:${result.violations.join(",")}`);
  }
  const metadata = validateRealBrowserGitHubVariableMetadata(payload, now);
  if (!metadata.valid) {
    throw new Error(`G12_REAL_BROWSER_STORE_METADATA_REFUSED:${metadata.violations.join(",")}`);
  }
  return { stored, result, metadata };
}

function assertCoreEnvironment(environment) {
  if (
    environment.GITHUB_REPOSITORY !== REPOSITORY ||
    typeof environment.RELEASE_GUARD_TOKEN !== "string" ||
    environment.RELEASE_GUARD_TOKEN.length < TOKEN_MINIMUM_LENGTH ||
    typeof environment.EVIDENCE_SALT !== "string" ||
    Buffer.byteLength(environment.EVIDENCE_SALT, "utf8") < 32
  ) {
    throw new Error("G12_REAL_BROWSER_STORE_ENVIRONMENT_REFUSED");
  }
}

function assertPutBrokerEnvironment(environment) {
  if (
    environment.GITHUB_ACTIONS !== "true" ||
    environment.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
    environment.GITHUB_WORKFLOW_REF !== BROKER_WORKFLOW_REF ||
    environment.RUNNER_ENVIRONMENT !== "github-hosted" ||
    environment.GITHUB_ACTOR !== "Vnd93" ||
    environment.GITHUB_TRIGGERING_ACTOR !== "Vnd93" ||
    !/^[1-9]\d*$/.test(environment.GITHUB_RUN_ID ?? "") ||
    !/^[1-9]\d*$/.test(environment.GITHUB_RUN_ATTEMPT ?? "") ||
    !/^[a-f0-9]{40}$/.test(environment.GITHUB_SHA ?? "") ||
    environment.CONTROL_SHA !== environment.GITHUB_SHA
  ) {
    throw new Error("G12_REAL_BROWSER_STORE_BROKER_ENVIRONMENT_REFUSED");
  }
}

function readClock(clock) {
  const value = clock();
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error("G12_REAL_BROWSER_STORE_CLOCK_REFUSED");
  }
  return value;
}

async function put({ values, environment, github, now }) {
  assertPutBrokerEnvironment(environment);
  const reportBytes = await readStrictFile(required(values, "file"), REPORT_MAXIMUM_BYTES, "REPORT");
  const screenshot = await readStrictFile(
    required(values, "screenshot"),
    MAX_REAL_BROWSER_SCREENSHOT_BYTES,
    "SCREENSHOT",
  );
  const report = parseJson(reportBytes, "REPORT");
  const broker = {
    controlSha: environment.CONTROL_SHA,
    runId: environment.GITHUB_RUN_ID,
    runAttempt: Number(environment.GITHUB_RUN_ATTEMPT),
    actor: environment.GITHUB_ACTOR,
    triggeringActor: environment.GITHUB_TRIGGERING_ACTOR,
    sealedAt: now.toISOString(),
  };
  const wrapper = buildRealBrowserAttestationVariable({
    report,
    screenshot,
    broker,
    evidenceSalt: environment.EVIDENCE_SALT,
    now,
  });
  const serialized = serializeRealBrowserAttestationVariable(wrapper);
  const variable = wrapper.variable;
  const variablePath = `/repos/${REPOSITORY}/actions/variables/${encodeURIComponent(variable)}`;
  const storeBinding = {
    environment: report.environment,
    candidateSha: report.candidateSha,
    runId: report.runId,
    runAttempt: report.runAttempt,
    controlSha: environment.CONTROL_SHA,
  };

  await confirmGitHubIdentity(github);
  const current = await github(variablePath, { allowNotFound: true });
  if (current.found) {
    throw new Error("G12_REAL_BROWSER_STORE_OCCUPIED");
  }
  const creation = await github(`/repos/${REPOSITORY}/actions/variables`, {
    method: "POST",
    body: { name: variable, value: serialized },
  });
  if (creation.status !== 201) throw new Error("G12_REAL_BROWSER_STORE_CREATE_STATUS_REFUSED");
  const written = await github(variablePath, { retryNotFound: true });
  const created = verifyStored({
    payload: written.payload,
    variable,
    evidenceSalt: environment.EVIDENCE_SALT,
    expected: storeBinding,
    now,
  });
  if (serializeRealBrowserAttestationVariable(created.stored) !== serialized) {
    throw new Error("G12_REAL_BROWSER_STORE_WRITE_VERIFICATION_FAILED");
  }
  console.log(
    JSON.stringify({
      event: "g12.real_browser.attestation.stored",
      environment: report.environment,
      runId: report.runId,
      runAttempt: report.runAttempt,
      variable,
      secretsDisclosed: false,
    }),
  );
}

async function assertOutputAbsent(path, label) {
  try {
    await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`G12_REAL_BROWSER_STORE_${label}_EXISTS`);
}

async function consume({ values, environment, github, clock, sleep }) {
  const expected = expectedFromArguments(values);
  const variable = realBrowserAttestationVariableName(expected);
  const variablePath = `/repos/${REPOSITORY}/actions/variables/${encodeURIComponent(variable)}`;
  const outputJson = resolve(required(values, "output-json"));
  const outputPng = resolve(required(values, "output-png"));
  if (outputJson === outputPng) throw new Error("G12_REAL_BROWSER_STORE_OUTPUT_PATHS_REFUSED");
  await assertOutputAbsent(outputJson, "OUTPUT_JSON");
  await assertOutputAbsent(outputPng, "OUTPUT_PNG");

  const pollSecondsText = values.get("poll-seconds") ?? "900";
  const pollIntervalText = values.get("poll-interval-ms") ?? "5000";
  if (!/^\d+$/.test(pollSecondsText) || Number(pollSecondsText) > 900) {
    throw new Error("G12_REAL_BROWSER_STORE_POLL_SECONDS_REFUSED");
  }
  if (!/^[1-9]\d*$/.test(pollIntervalText) || Number(pollIntervalText) > 10_000) {
    throw new Error("G12_REAL_BROWSER_STORE_POLL_INTERVAL_REFUSED");
  }
  const maxPolls =
    Number(pollSecondsText) === 0
      ? 1
      : Math.max(1, Math.ceil((Number(pollSecondsText) * 1_000) / Number(pollIntervalText)) + 1);

  await confirmGitHubIdentity(github);
  let current;
  for (let attempt = 1; attempt <= maxPolls; attempt += 1) {
    current = await github(variablePath, { allowNotFound: true });
    if (current.found) break;
    if (attempt < maxPolls) await sleep(Number(pollIntervalText));
  }
  if (!current?.found) throw new Error("G12_REAL_BROWSER_STORE_POLL_EXHAUSTED");
  const observedNow = readClock(clock);
  const verified = verifyStored({
    payload: current.payload,
    variable,
    evidenceSalt: environment.EVIDENCE_SALT,
    expected,
    now: observedNow,
  });

  const consumed = sanitizedConsumedRealBrowserAttestation(verified.stored, current.payload);
  const serializedOutput = `${JSON.stringify(consumed, null, 2)}\n`;
  if (
    serializedOutput.includes('"base64"') ||
    /\b[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(serializedOutput) ||
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(serializedOutput)
  ) {
    throw new Error("G12_REAL_BROWSER_STORE_OUTPUT_SENSITIVE");
  }

  await mkdir(dirname(outputJson), { recursive: true });
  await mkdir(dirname(outputPng), { recursive: true });
  const suffix = `${process.pid}-${randomUUID()}`;
  const temporaryJson = resolve(dirname(outputJson), `.${basename(outputJson)}.${suffix}.tmp`);
  const temporaryPng = resolve(dirname(outputPng), `.${basename(outputPng)}.${suffix}.tmp`);
  let jsonFinalized = false;
  let pngFinalized = false;
  try {
    await writeFile(temporaryJson, serializedOutput, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await writeFile(temporaryPng, verified.result.screenshot, { mode: 0o600, flag: "wx" });

    const deletionRead = await github(variablePath, { allowNotFound: true });
    if (!deletionRead.found || !sameVariableSnapshot(current.payload, deletionRead.payload)) {
      throw new Error("G12_REAL_BROWSER_STORE_PREDELETE_SNAPSHOT_MISMATCH");
    }
    const deletionNow = readClock(clock);
    verifyStored({
      payload: deletionRead.payload,
      variable,
      evidenceSalt: environment.EVIDENCE_SALT,
      expected,
      now: deletionNow,
    });
    await github(variablePath, { method: "DELETE", allowNotFound: true });
    const terminal = await github(variablePath, { allowNotFound: true, retryPresent: true });
    if (terminal.found) throw new Error("G12_REAL_BROWSER_STORE_CLEAR_VERIFICATION_FAILED");

    await link(temporaryPng, outputPng);
    pngFinalized = true;
    await link(temporaryJson, outputJson);
    jsonFinalized = true;
  } catch (error) {
    if (jsonFinalized) await rm(outputJson, { force: true }).catch(() => undefined);
    if (pngFinalized) await rm(outputPng, { force: true }).catch(() => undefined);
    throw error;
  } finally {
    await rm(temporaryJson, { force: true }).catch(() => undefined);
    await rm(temporaryPng, { force: true }).catch(() => undefined);
  }

  if (environment.GITHUB_OUTPUT) {
    await appendFile(
      environment.GITHUB_OUTPUT,
      [
        `variable=${variable}`,
        "variable_cleared=true",
        `evidence_json=${outputJson}`,
        `screenshot_png=${outputPng}`,
        `screenshot_sha256=${verified.stored.screenshot.sha256}`,
        `screenshot_bytes=${verified.stored.screenshot.bytes}`,
        `reference=${verified.stored.report.reference}`,
        "",
      ].join("\n"),
      "utf8",
    );
  }
  console.log(
    JSON.stringify({
      event: "g12.real_browser.attestation.consumed",
      environment: expected.environment,
      runId: expected.runId,
      runAttempt: Number(expected.runAttempt),
      variable,
      variableCleared: true,
      secretsDisclosed: false,
    }),
  );
}

async function clear({ values, allowMissing, environment, github, now }) {
  const expected = expectedFromArguments(values, { minimum: true });
  const variable = realBrowserAttestationVariableName(expected);
  const variablePath = `/repos/${REPOSITORY}/actions/variables/${encodeURIComponent(variable)}`;
  await confirmGitHubIdentity(github);
  const current = await github(variablePath, { allowNotFound: true });
  if (!current.found) {
    if (!allowMissing) throw new Error("G12_REAL_BROWSER_STORE_MISSING");
    console.log(
      JSON.stringify({
        event: "g12.real_browser.attestation.already_cleared",
        environment: expected.environment,
        runId: expected.runId,
        runAttempt: Number(expected.runAttempt),
        variable,
        variableCleared: true,
        secretsDisclosed: false,
      }),
    );
    return;
  }
  let payloadValidated = false;
  try {
    const stored = parseStored(current.payload, variable);
    const intrinsic = verifyRealBrowserAttestationVariable(stored, environment.EVIDENCE_SALT, {}, now, {
      ignoreFreshness: true,
    });
    if (intrinsic.valid) {
      const bound = verifyRealBrowserAttestationVariable(stored, environment.EVIDENCE_SALT, expected, now, {
        ignoreFreshness: true,
      });
      if (!bound.valid) {
        throw new Error(`G12_REAL_BROWSER_STORE_CLEAR_REFUSED:${bound.violations.join(",")}`);
      }
      payloadValidated = true;
    }
  } catch (error) {
    if (String(error?.message ?? "").startsWith("G12_REAL_BROWSER_STORE_CLEAR_REFUSED:")) throw error;
    payloadValidated = false;
  }
  const deletionRead = await github(variablePath, { allowNotFound: true });
  if (!deletionRead.found || !sameVariableSnapshot(current.payload, deletionRead.payload)) {
    throw new Error("G12_REAL_BROWSER_STORE_CLEAR_PREDELETE_SNAPSHOT_MISMATCH");
  }
  await github(variablePath, { method: "DELETE", allowNotFound: true });
  const terminal = await github(variablePath, { allowNotFound: true, retryPresent: true });
  if (terminal.found) throw new Error("G12_REAL_BROWSER_STORE_CLEAR_VERIFICATION_FAILED");
  if (environment.GITHUB_OUTPUT) {
    await appendFile(environment.GITHUB_OUTPUT, `variable=${variable}\nvariable_cleared=true\n`, "utf8");
  }
  console.log(
    JSON.stringify({
      event: "g12.real_browser.attestation.cleared",
      environment: expected.environment,
      runId: expected.runId,
      runAttempt: Number(expected.runAttempt),
      variable,
      variableCleared: true,
      payloadValidated,
      secretsDisclosed: false,
    }),
  );
}

export async function runRealBrowserAttestationStore({
  argv = process.argv,
  environment = process.env,
  fetchImplementation = globalThis.fetch,
  sleep = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds)),
  now = () => new Date(),
} = {}) {
  const input = parseArguments(argv);
  assertCoreEnvironment(environment);
  const github = createGitHubClient({
    token: environment.RELEASE_GUARD_TOKEN,
    fetchImplementation,
    sleep,
  });
  if (input.operation === "put") {
    await put({ ...input, environment, github, now: readClock(now) });
  } else if (input.operation === "consume") {
    await consume({ ...input, environment, github, clock: now, sleep });
  } else {
    await clear({ ...input, environment, github, now: readClock(now) });
  }
}

const directPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (directPath && directPath === resolve(fileURLToPath(import.meta.url))) {
  await runRealBrowserAttestationStore();
}
