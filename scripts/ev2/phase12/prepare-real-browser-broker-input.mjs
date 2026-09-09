import { constants, lstatSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstat, open, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  validateRealBrowserAttestationReport,
  validateRealBrowserScreenshotPng,
  decodeCanonicalBase64,
} from "./real-browser-attestation-store-lib.mjs";

const FULL_SHA = /^[a-f0-9]{40}$/;
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const REFERENCE = /^LD-[A-F0-9]{10}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const REPOSITORY = "Vnd93/gaiatec-cms";
const BROKER_WORKFLOW = "submit-real-browser-attestation.yml";

function option(args, name) {
  const index = args.indexOf(`--${name}`);
  if (index < 0 || !args[index + 1] || args[index + 1].startsWith("--")) {
    throw new Error(`G12_REAL_BROWSER_PREPARE_OPTION_REQUIRED:${name}`);
  }
  return args[index + 1];
}

function optionalOption(args, name) {
  const index = args.indexOf(`--${name}`);
  if (index < 0) return undefined;
  if (!args[index + 1] || args[index + 1].startsWith("--")) {
    throw new Error(`G12_REAL_BROWSER_PREPARE_OPTION_REQUIRED:${name}`);
  }
  return args[index + 1];
}

async function readStrict(path, maximumBytes, code) {
  const absolute = resolve(path);
  const metadata = await lstat(absolute);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size < 1 || metadata.size > maximumBytes) {
    throw new Error(`${code}_FILE_REFUSED`);
  }
  const handle = await open(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
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
      throw new Error(`${code}_CHANGED_WHILE_READING`);
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

function parseJson(bytes, code) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`${code}_JSON_REFUSED`, { cause: error });
  }
}

function exactKeys(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort())
  );
}

function canonicalUtcTimestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
    return null;
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  const canonical = value.includes(".") ? parsed.toISOString() : parsed.toISOString().replace(".000Z", "Z");
  return canonical === value ? parsed : null;
}

function validateChallenge(challenge, now) {
  const expectedOrigin =
    challenge?.environment === "production"
      ? "https://gaiatecsistemas.com.br"
      : "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev";
  const expiresAt = new Date(challenge?.expiresAt ?? "");
  const emailMatch = new RegExp(
    `^qa-iab-${String(challenge?.runTag ?? "").toLowerCase()}-${String(challenge?.runAttempt ?? "")}-([a-f0-9]{16})@example\\.invalid$`,
  ).exec(String(challenge?.syntheticEmail ?? ""));
  if (
    !exactKeys(challenge, [
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
    challenge?.schemaVersion !== 1 ||
    challenge?.event !== "g12.real_browser.handoff.ready" ||
    challenge?.repository !== "Vnd93/gaiatec-cms" ||
    !["staging", "production"].includes(challenge?.environment) ||
    !FULL_SHA.test(String(challenge?.candidateSha ?? "")) ||
    !FULL_SHA.test(String(challenge?.controlSha ?? "")) ||
    !POSITIVE_INTEGER.test(String(challenge?.runId ?? "")) ||
    !Number.isSafeInteger(challenge?.runAttempt) ||
    challenge.runAttempt < 1 ||
    !/^QA-CMS-FINAL-[0-9]{8}-[a-f0-9]{8}$/.test(String(challenge?.runTag ?? "")) ||
    !challenge.runTag.endsWith(`-${challenge.candidateSha.slice(0, 8)}`) ||
    challenge?.origin !== expectedOrigin ||
    challenge?.url !== `${expectedOrigin}${challenge?.campaignPath ?? ""}` ||
    !/^\/campanhas\/qa-lead-qa-cms-final-[0-9]{8}-[a-f0-9]{8}-[a-f0-9]{8}$/.test(
      String(challenge?.campaignPath ?? ""),
    ) ||
    !emailMatch ||
    challenge?.emailSha256 !==
      createHash("sha256")
        .update(String(challenge?.syntheticEmail ?? ""))
        .digest("hex") ||
    challenge?.challengeNonceSha256 !==
      createHash("sha256")
        .update(String(emailMatch?.[1] ?? ""))
        .digest("hex") ||
    !SHA256.test(String(challenge?.challengeNonceSha256 ?? "")) ||
    challenge?.variable !==
      `G12_${String(challenge?.environment ?? "").toUpperCase()}_REAL_BROWSER_${challenge?.runId}_${challenge?.runAttempt}` ||
    challenge?.challengeVariable !==
      `G12_${String(challenge?.environment ?? "").toUpperCase()}_REAL_BROWSER_CHALLENGE_${challenge?.runId}_${challenge?.runAttempt}` ||
    challenge?.successLocator !== '[data-form-submission-status="success"]' ||
    challenge?.documentReleaseHeader !== "x-release" ||
    challenge?.healthUrl !== `${expectedOrigin}/healthz` ||
    challenge?.healthReleaseField !== "release" ||
    challenge?.deploymentIdentityRequired !== true ||
    challenge?.screenshotScope !== "success-locator-only-no-input-fields" ||
    Number.isNaN(expiresAt.getTime()) ||
    expiresAt.toISOString() !== challenge.expiresAt ||
    expiresAt <= now ||
    expiresAt.getTime() - now.getTime() > 15 * 60_000
  ) {
    throw new Error("G12_REAL_BROWSER_PREPARE_CHALLENGE_REFUSED");
  }
  return challenge;
}

export async function prepareRealBrowserBrokerInput(args, now = new Date()) {
  const challengeFile = option(args, "challenge");
  const screenshotFile = option(args, "screenshot");
  const reference = option(args, "reference");
  const responseStatus = Number(option(args, "response-status"));
  const successText = option(args, "success-text");
  const observedAt = option(args, "observed-at");
  const documentReleaseSha = option(args, "document-release-sha");
  const healthReleaseSha = option(args, "health-release-sha");
  const reportOutput = resolve(option(args, "output-report"));
  const dispatchOutput = resolve(option(args, "output-dispatch-inputs"));
  if (reportOutput === dispatchOutput) throw new Error("G12_REAL_BROWSER_PREPARE_OUTPUT_PATHS_REFUSED");
  const challenge = validateChallenge(
    parseJson(
      await readStrict(challengeFile, 16 * 1024, "G12_REAL_BROWSER_PREPARE_CHALLENGE"),
      "G12_REAL_BROWSER_PREPARE_CHALLENGE",
    ),
    now,
  );
  const screenshot = await readStrict(screenshotFile, 30 * 1024, "G12_REAL_BROWSER_PREPARE_SCREENSHOT");
  const png = validateRealBrowserScreenshotPng(screenshot);
  if (!png.valid) {
    throw new Error(`G12_REAL_BROWSER_PREPARE_SCREENSHOT_REFUSED:${png.violations.join(",")}`);
  }
  if (
    !REFERENCE.test(reference) ||
    responseStatus !== 201 ||
    documentReleaseSha !== challenge.candidateSha ||
    healthReleaseSha !== challenge.candidateSha
  ) {
    throw new Error("G12_REAL_BROWSER_PREPARE_OBSERVATION_REFUSED");
  }
  const report = {
    schemaVersion: 1,
    event: "g12.real_browser.attestation",
    repository: "Vnd93/gaiatec-cms",
    environment: challenge.environment,
    candidateSha: challenge.candidateSha,
    documentReleaseSha,
    healthReleaseSha,
    deploymentIdentityObserved: true,
    runId: challenge.runId,
    runAttempt: challenge.runAttempt,
    runTag: challenge.runTag,
    origin: challenge.origin,
    campaignPath: challenge.campaignPath,
    emailSha256: challenge.emailSha256,
    reference,
    responseStatus: 201,
    uiSuccessObserved: true,
    visibleSuccessText: successText,
    observedAt,
    challengeNonceSha256: challenge.challengeNonceSha256,
    turnstile: {
      provider: "cloudflare-turnstile",
      officialWidgetObserved: true,
      cDataBound: true,
      tokenCaptured: false,
    },
  };
  const validation = validateRealBrowserAttestationReport(report, {}, now);
  if (!validation.valid) {
    throw new Error(`G12_REAL_BROWSER_PREPARE_REPORT_REFUSED:${validation.violations.join(",")}`);
  }
  const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`, "utf8");
  const dispatch = {
    environment: challenge.environment,
    parent_run_id: challenge.runId,
    parent_run_attempt: String(challenge.runAttempt),
    candidate_sha: challenge.candidateSha,
    control_sha: challenge.controlSha,
    report_base64: reportBytes.toString("base64"),
    screenshot_base64: screenshot.toString("base64"),
  };
  await writeFile(reportOutput, reportBytes, { encoding: "utf8", flag: "wx", mode: 0o600 });
  try {
    await writeFile(dispatchOutput, `${JSON.stringify(dispatch)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    await rm(reportOutput, { force: true });
    throw error;
  }
  process.stdout.write(
    `${JSON.stringify({ event: "g12.real_browser.broker_input.prepared", report: reportOutput, dispatchInputs: dispatchOutput, screenshotBytes: screenshot.length })}\n`,
  );
  return { report, dispatch };
}

function resolveGhExecutable(args) {
  const configured = optionalOption(args, "gh-path") ?? process.env.GH_CLI_PATH;
  if (!configured) return "gh";
  const absolute = resolve(configured);
  const metadata = lstatSync(absolute);
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    (process.platform !== "win32" && (metadata.mode & 0o111) === 0)
  ) {
    throw new Error("G12_REAL_BROWSER_LOCAL_GH_PATH_REFUSED");
  }
  return realpathSync(absolute);
}

function runGh(executable, args, input) {
  const result = spawnSync(executable, args, {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    maxBuffer: 256 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error("G12_REAL_BROWSER_LOCAL_GITHUB_COMMAND_FAILED");
  }
  return result.stdout;
}

function confirmLocalGitHubIdentity(executable, command = runGh) {
  const login = command(executable, ["api", "user", "--jq", ".login"]).trim();
  if (login !== "Vnd93") throw new Error("G12_REAL_BROWSER_LOCAL_GITHUB_IDENTITY_REFUSED");
}

export async function fetchRealBrowserChallenge(args, now = new Date(), command = runGh) {
  const environment = option(args, "environment");
  const runId = option(args, "run-id");
  const runAttempt = Number(option(args, "run-attempt"));
  const output = resolve(option(args, "output-challenge"));
  const ghExecutable = resolveGhExecutable(args);
  if (
    !["staging", "production"].includes(environment) ||
    !POSITIVE_INTEGER.test(runId) ||
    !Number.isSafeInteger(runAttempt) ||
    runAttempt < 1
  ) {
    throw new Error("G12_REAL_BROWSER_FETCH_BINDING_REFUSED");
  }
  confirmLocalGitHubIdentity(ghExecutable, command);
  const variable = `G12_${environment.toUpperCase()}_REAL_BROWSER_CHALLENGE_${runId}_${runAttempt}`;
  const encodedName = encodeURIComponent(variable);
  const response = parseJson(
    Buffer.from(
      command(ghExecutable, [
        "api",
        `repos/${REPOSITORY}/actions/variables/${encodedName}`,
        "--method",
        "GET",
      ]),
      "utf8",
    ),
    "G12_REAL_BROWSER_FETCH_RESPONSE",
  );
  const createdAt = canonicalUtcTimestamp(response?.created_at);
  const updatedAt = canonicalUtcTimestamp(response?.updated_at);
  if (
    response?.name !== variable ||
    typeof response?.value !== "string" ||
    !createdAt ||
    !updatedAt ||
    createdAt.getTime() !== updatedAt.getTime() ||
    createdAt.getTime() > now.getTime() + 60_000 ||
    now.getTime() - createdAt.getTime() > 15 * 60_000
  ) {
    throw new Error("G12_REAL_BROWSER_FETCH_RESPONSE_REFUSED");
  }
  const challenge = validateChallenge(
    parseJson(Buffer.from(response.value, "utf8"), "G12_REAL_BROWSER_FETCH_CHALLENGE"),
    now,
  );
  if (
    challenge.environment !== environment ||
    challenge.runId !== runId ||
    challenge.runAttempt !== runAttempt ||
    challenge.challengeVariable !== variable
  ) {
    throw new Error("G12_REAL_BROWSER_FETCH_CHALLENGE_BINDING_REFUSED");
  }
  const expiresAt = Date.parse(challenge.expiresAt);
  if (createdAt.getTime() < expiresAt - 16 * 60_000 || createdAt.getTime() > expiresAt) {
    throw new Error("G12_REAL_BROWSER_FETCH_CHALLENGE_TIMESTAMP_REFUSED");
  }
  await writeFile(output, `${JSON.stringify(challenge, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  process.stdout.write(
    `${JSON.stringify({ event: "g12.real_browser.challenge.fetched", environment, runId, runAttempt, variable, candidateSha: challenge.candidateSha, output })}\n`,
  );
  return challenge;
}

export async function dispatchRealBrowserBrokerInput(args, now = new Date(), command = runGh) {
  const inputFile = option(args, "input");
  const ghExecutable = resolveGhExecutable(args);
  const dispatch = parseJson(
    await readStrict(inputFile, 96 * 1024, "G12_REAL_BROWSER_DISPATCH_INPUT"),
    "G12_REAL_BROWSER_DISPATCH_INPUT",
  );
  if (
    !exactKeys(dispatch, [
      "environment",
      "parent_run_id",
      "parent_run_attempt",
      "candidate_sha",
      "control_sha",
      "report_base64",
      "screenshot_base64",
    ]) ||
    !["staging", "production"].includes(dispatch?.environment) ||
    !POSITIVE_INTEGER.test(String(dispatch?.parent_run_id ?? "")) ||
    !POSITIVE_INTEGER.test(String(dispatch?.parent_run_attempt ?? "")) ||
    !FULL_SHA.test(String(dispatch?.candidate_sha ?? "")) ||
    !FULL_SHA.test(String(dispatch?.control_sha ?? ""))
  ) {
    throw new Error("G12_REAL_BROWSER_DISPATCH_INPUT_REFUSED");
  }
  const reportBytes = decodeCanonicalBase64(dispatch.report_base64, "REPORT");
  const screenshot = decodeCanonicalBase64(dispatch.screenshot_base64, "SCREENSHOT");
  const report = parseJson(reportBytes, "G12_REAL_BROWSER_DISPATCH_REPORT");
  const reportValidation = validateRealBrowserAttestationReport(
    report,
    {
      environment: dispatch.environment,
      candidateSha: dispatch.candidate_sha,
      runId: dispatch.parent_run_id,
      runAttempt: Number(dispatch.parent_run_attempt),
      controlSha: dispatch.control_sha,
    },
    now,
  );
  const screenshotValidation = validateRealBrowserScreenshotPng(screenshot);
  if (!reportValidation.valid || !screenshotValidation.valid) {
    throw new Error("G12_REAL_BROWSER_DISPATCH_EVIDENCE_REFUSED");
  }
  confirmLocalGitHubIdentity(ghExecutable, command);
  command(
    ghExecutable,
    ["workflow", "run", BROKER_WORKFLOW, "--repo", REPOSITORY, "--ref", "main", "--json"],
    `${JSON.stringify(dispatch)}\n`,
  );
  process.stdout.write(
    `${JSON.stringify({ event: "g12.real_browser.broker.dispatched", environment: dispatch.environment, parentRunId: dispatch.parent_run_id, parentRunAttempt: Number(dispatch.parent_run_attempt), candidateSha: dispatch.candidate_sha, workflow: BROKER_WORKFLOW })}\n`,
  );
  return { report, screenshotBytes: screenshot.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [operation = "prepare", ...args] = process.argv.slice(2);
  const execution =
    operation === "fetch-challenge"
      ? fetchRealBrowserChallenge(args)
      : operation === "dispatch"
        ? dispatchRealBrowserBrokerInput(args)
        : operation === "prepare"
          ? prepareRealBrowserBrokerInput(args)
          : Promise.reject(new Error("G12_REAL_BROWSER_PREPARE_OPERATION_REFUSED"));
  execution.catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "G12_REAL_BROWSER_PREPARE_FAILED"}\n`);
    process.exitCode = 1;
  });
}
