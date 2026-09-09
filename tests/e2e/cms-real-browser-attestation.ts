import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";

const fullSha = /^[0-9a-f]{40}$/;
const sha256Pattern = /^[0-9a-f]{64}$/;
const referencePattern = /^LD-[A-F0-9]{10}$/;
const runTagPattern = /^QA-CMS-FINAL-[0-9]{8}-[0-9a-f]{8}$/;
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export const CMS_REAL_BROWSER_SUCCESS_LOCATOR = '[data-form-submission-status="success"]';

type TargetEnvironment = "staging" | "production";

export type CmsRealBrowserChallenge = {
  schemaVersion: 1;
  event: "g12.real_browser.handoff.ready";
  repository: "Vnd93/gaiatec-cms";
  environment: TargetEnvironment;
  candidateSha: string;
  controlSha: string;
  runId: string;
  runAttempt: number;
  runTag: string;
  origin: string;
  campaignPath: string;
  url: string;
  syntheticEmail: string;
  emailSha256: string;
  challengeNonceSha256: string;
  variable: string;
  challengeVariable: string;
  successLocator: typeof CMS_REAL_BROWSER_SUCCESS_LOCATOR;
  documentReleaseHeader: "x-release";
  healthUrl: string;
  healthReleaseField: "release";
  deploymentIdentityRequired: true;
  screenshotScope: "success-locator-only-no-input-fields";
  expiresAt: string;
};

export type CmsConsumedRealBrowserAttestation = {
  schemaVersion: 1;
  event: "g12.real_browser.attestation.consumed";
  repository: "Vnd93/gaiatec-cms";
  environment: TargetEnvironment;
  candidateSha: string;
  documentReleaseSha: string;
  healthReleaseSha: string;
  deploymentIdentityObserved: true;
  runId: string;
  runAttempt: number;
  runTag: string;
  origin: string;
  campaignPath: string;
  emailSha256: string;
  reference: string;
  responseStatus: 201;
  uiSuccessObserved: true;
  visibleSuccessText: string;
  observedAt: string;
  challengeNonceSha256: string;
  turnstile: {
    provider: "cloudflare-turnstile";
    officialWidgetObserved: true;
    cDataBound: true;
    tokenCaptured: false;
  };
  variable: string;
  variableCleared: true;
  broker: { controlSha: string; runId: string; runAttempt: number; sealedAt: string };
  githubVariable: { createdAt: string; updatedAt: string };
  screenshot: {
    mimeType: "image/png";
    sha256: string;
    bytes: number;
    width: number;
    height: number;
  };
};

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function challengeNonceFromEmail(email: unknown, runTag: string, runAttempt: number) {
  const prefix = `qa-iab-${runTag.toLowerCase()}-${runAttempt}-`;
  if (typeof email !== "string" || !email.startsWith(prefix) || !email.endsWith("@example.invalid")) {
    return null;
  }
  const nonce = email.slice(prefix.length, -"@example.invalid".length);
  return /^[a-f0-9]{16}$/.test(nonce) ? nonce : null;
}

export function selectSingleAttestedLead<T extends { reference_code?: unknown }>(
  rows: readonly T[],
  reference: string,
) {
  if (!referencePattern.test(reference)) {
    throw new Error("QA_CMS_REAL_BROWSER_REFERENCE_REFUSED");
  }
  const matches = rows.filter((row) => row.reference_code === reference);
  if (matches.length !== 1) {
    throw new Error("QA_CMS_REAL_BROWSER_REFERENCE_CARDINALITY_INVALID");
  }
  return matches[0]!;
}

function safePath(repositoryRoot: string, configured: string, code: string) {
  const root = realpathSync(repositoryRoot);
  const target = resolve(root, configured);
  const fromRoot = relative(root, target);
  if (!fromRoot || fromRoot === ".." || fromRoot.startsWith("../") || fromRoot.startsWith("..\\")) {
    throw new Error(`${code}_PATH_REFUSED`);
  }
  return target;
}

function readRegularFile(path: string, maximumBytes: number, code: string) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > maximumBytes) {
    throw new Error(`${code}_FILE_REFUSED`);
  }
  if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) throw new Error(`${code}_MODE_REFUSED`);
  return readFileSync(path);
}

function writeExclusiveJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    linkSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function exactKeys(value: unknown, keys: readonly string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

const challengeKeys = [
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
] as const;

const consumedAttestationKeys = [
  "schemaVersion",
  "event",
  "repository",
  "environment",
  "candidateSha",
  "documentReleaseSha",
  "healthReleaseSha",
  "deploymentIdentityObserved",
  "runId",
  "runAttempt",
  "runTag",
  "origin",
  "campaignPath",
  "emailSha256",
  "reference",
  "responseStatus",
  "uiSuccessObserved",
  "visibleSuccessText",
  "observedAt",
  "challengeNonceSha256",
  "turnstile",
  "variable",
  "variableCleared",
  "broker",
  "githubVariable",
  "screenshot",
] as const;

export function parseCanonicalUtcTimestamp(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
    return Number.NaN;
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return Number.NaN;
  const canonical = value.includes(".")
    ? new Date(timestamp).toISOString()
    : new Date(timestamp).toISOString().replace(".000Z", "Z");
  return canonical === value ? timestamp : Number.NaN;
}

function expectedConfiguration(input: {
  repositoryRoot: string;
  environment: TargetEnvironment;
  candidateSha: string;
  runTag: string;
  origin: string;
}) {
  if (process.env.QA_CMS_REAL_BROWSER_REQUIRED !== "true") {
    throw new Error("QA_CMS_REAL_BROWSER_HANDOFF_NOT_REQUIRED");
  }
  const runId = process.env.QA_CMS_PARENT_RUN_ID ?? "";
  const runAttemptText = process.env.QA_CMS_PARENT_RUN_ATTEMPT ?? "";
  const runAttempt = Number(runAttemptText);
  const controlSha = process.env.QA_CMS_CONTROL_SHA ?? "";
  if (
    !fullSha.test(input.candidateSha) ||
    !runTagPattern.test(input.runTag) ||
    !input.runTag.endsWith(`-${input.candidateSha.slice(0, 8)}`) ||
    !fullSha.test(controlSha) ||
    !/^\d+$/.test(runId) ||
    !Number.isSafeInteger(runAttempt) ||
    runAttempt < 1
  ) {
    throw new Error("QA_CMS_REAL_BROWSER_RUN_BINDING_INVALID");
  }
  const expectedOrigin =
    input.environment === "production"
      ? "https://gaiatecsistemas.com.br"
      : "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev";
  const parsedOrigin = new URL(input.origin);
  if (
    input.origin !== expectedOrigin ||
    parsedOrigin.origin !== expectedOrigin ||
    parsedOrigin.pathname !== "/" ||
    parsedOrigin.search ||
    parsedOrigin.hash ||
    parsedOrigin.username ||
    parsedOrigin.password
  ) {
    throw new Error("QA_CMS_REAL_BROWSER_ORIGIN_REFUSED");
  }
  return {
    runId,
    runAttempt,
    controlSha,
    challengePath: safePath(
      input.repositoryRoot,
      process.env.QA_CMS_REAL_BROWSER_CHALLENGE_PATH ?? "outputs/cms-real-browser-challenge.json",
      "QA_CMS_REAL_BROWSER_CHALLENGE",
    ),
    attestationPath: safePath(
      input.repositoryRoot,
      process.env.QA_CMS_REAL_BROWSER_ATTESTATION_PATH ?? "outputs/cms-real-browser-attestation.json",
      "QA_CMS_REAL_BROWSER_ATTESTATION",
    ),
    screenshotPath: safePath(
      input.repositoryRoot,
      process.env.QA_CMS_REAL_BROWSER_SCREENSHOT_PATH ?? "outputs/cms-real-browser-attestation.png",
      "QA_CMS_REAL_BROWSER_SCREENSHOT",
    ),
  };
}

export function createCmsRealBrowserChallenge(input: {
  repositoryRoot: string;
  environment: TargetEnvironment;
  candidateSha: string;
  runTag: string;
  origin: string;
  campaignPath: string;
  formKey: string;
}) {
  const configuration = expectedConfiguration(input);
  if (!/^\/campanhas\/qa-lead-qa-cms-final-[0-9]{8}-[0-9a-f]{8}-[0-9a-f]{8}$/.test(input.campaignPath)) {
    throw new Error("QA_CMS_REAL_BROWSER_CAMPAIGN_PATH_REFUSED");
  }
  if (!/^qa-ops-qa-cms-final-[0-9]{8}-[0-9a-f]{8}-[0-9a-f]{8}$/.test(input.formKey)) {
    throw new Error("QA_CMS_REAL_BROWSER_FORM_KEY_REFUSED");
  }
  const challengeNonce = randomBytes(8).toString("hex");
  const syntheticEmail = `qa-iab-${input.runTag.toLowerCase()}-${configuration.runAttempt}-${challengeNonce}@example.invalid`;
  const emailSha256 = sha256(syntheticEmail);
  const challengeNonceSha256 = sha256(challengeNonce);
  const variable = `G12_${input.environment.toUpperCase()}_REAL_BROWSER_${configuration.runId}_${configuration.runAttempt}`;
  const challengeVariable = `G12_${input.environment.toUpperCase()}_REAL_BROWSER_CHALLENGE_${configuration.runId}_${configuration.runAttempt}`;
  const challenge: CmsRealBrowserChallenge = {
    schemaVersion: 1,
    event: "g12.real_browser.handoff.ready",
    repository: "Vnd93/gaiatec-cms",
    environment: input.environment,
    candidateSha: input.candidateSha,
    controlSha: configuration.controlSha,
    runId: configuration.runId,
    runAttempt: configuration.runAttempt,
    runTag: input.runTag,
    origin: input.origin,
    campaignPath: input.campaignPath,
    url: `${input.origin}${input.campaignPath}`,
    syntheticEmail,
    emailSha256,
    challengeNonceSha256,
    variable,
    challengeVariable,
    successLocator: CMS_REAL_BROWSER_SUCCESS_LOCATOR,
    documentReleaseHeader: "x-release",
    healthUrl: `${input.origin}/healthz`,
    healthReleaseField: "release",
    deploymentIdentityRequired: true,
    screenshotScope: "success-locator-only-no-input-fields",
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  };
  writeExclusiveJson(configuration.challengePath, challenge);
  process.stdout.write(
    `${JSON.stringify({
      event: "g12.real_browser.handoff.created",
      environment: challenge.environment,
      candidateSha: challenge.candidateSha,
      runId: challenge.runId,
      runAttempt: challenge.runAttempt,
      expiresAt: challenge.expiresAt,
      secretsDisclosed: false,
    })}\n`,
  );
  return { challenge, ...configuration };
}

export async function waitForCmsRealBrowserAttestation(input: {
  repositoryRoot: string;
  challenge: CmsRealBrowserChallenge;
  timeoutMs?: number;
}): Promise<CmsConsumedRealBrowserAttestation> {
  const configuration = expectedConfiguration({
    repositoryRoot: input.repositoryRoot,
    environment: input.challenge.environment,
    candidateSha: input.challenge.candidateSha,
    runTag: input.challenge.runTag,
    origin: input.challenge.origin,
  });
  const timeoutMs = input.timeoutMs ?? 15 * 60_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15 * 60_000) {
    throw new Error("QA_CMS_REAL_BROWSER_WAIT_WINDOW_REFUSED");
  }
  const deadline = Date.now() + timeoutMs;
  while (!existsSync(configuration.attestationPath) && Date.now() < deadline) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_000));
  }
  if (!existsSync(configuration.attestationPath)) throw new Error("QA_CMS_REAL_BROWSER_ATTESTATION_TIMEOUT");
  const bytes = readRegularFile(configuration.attestationPath, 64 * 1024, "QA_CMS_REAL_BROWSER_ATTESTATION");
  let report: Record<string, unknown>;
  try {
    report = JSON.parse(bytes.toString("utf8")) as Record<string, unknown>;
  } catch (error) {
    throw new Error("QA_CMS_REAL_BROWSER_ATTESTATION_JSON_INVALID", { cause: error });
  }
  const turnstile = report.turnstile;
  const screenshotBytes = readRegularFile(
    configuration.screenshotPath,
    30 * 1024,
    "QA_CMS_REAL_BROWSER_SCREENSHOT",
  );
  const observedAt = parseCanonicalUtcTimestamp(report.observedAt);
  const expiresAt = parseCanonicalUtcTimestamp(input.challenge.expiresAt);
  const broker = report.broker as Record<string, unknown>;
  const githubVariable = report.githubVariable as Record<string, unknown>;
  const brokerSealedAt = parseCanonicalUtcTimestamp(broker?.sealedAt);
  const variableCreatedAt = parseCanonicalUtcTimestamp(githubVariable?.createdAt);
  const variableUpdatedAt = parseCanonicalUtcTimestamp(githubVariable?.updatedAt);
  if (
    !exactKeys(report, consumedAttestationKeys) ||
    report.schemaVersion !== 1 ||
    report.event !== "g12.real_browser.attestation.consumed" ||
    report.repository !== input.challenge.repository ||
    report.environment !== input.challenge.environment ||
    report.candidateSha !== input.challenge.candidateSha ||
    report.documentReleaseSha !== input.challenge.candidateSha ||
    report.healthReleaseSha !== input.challenge.candidateSha ||
    report.deploymentIdentityObserved !== true ||
    report.runId !== input.challenge.runId ||
    report.runAttempt !== input.challenge.runAttempt ||
    report.runTag !== input.challenge.runTag ||
    report.origin !== input.challenge.origin ||
    report.campaignPath !== input.challenge.campaignPath ||
    report.emailSha256 !== input.challenge.emailSha256 ||
    report.challengeNonceSha256 !== input.challenge.challengeNonceSha256 ||
    report.responseStatus !== 201 ||
    report.uiSuccessObserved !== true ||
    !referencePattern.test(String(report.reference ?? "")) ||
    !String(report.visibleSuccessText ?? "").includes("Protocolo") ||
    !String(report.visibleSuccessText ?? "").includes(String(report.reference ?? "")) ||
    !Number.isFinite(observedAt) ||
    observedAt > expiresAt ||
    observedAt < expiresAt - 16 * 60_000 ||
    !exactKeys(turnstile, ["provider", "officialWidgetObserved", "cDataBound", "tokenCaptured"]) ||
    (turnstile as Record<string, unknown>).provider !== "cloudflare-turnstile" ||
    (turnstile as Record<string, unknown>).officialWidgetObserved !== true ||
    (turnstile as Record<string, unknown>).cDataBound !== true ||
    (turnstile as Record<string, unknown>).tokenCaptured !== false ||
    report.variable !== input.challenge.variable ||
    report.variableCleared !== true ||
    !exactKeys(report.broker, ["controlSha", "runId", "runAttempt", "sealedAt"]) ||
    broker.controlSha !== input.challenge.controlSha ||
    !/^\d+$/.test(String(broker.runId ?? "")) ||
    !Number.isSafeInteger(broker.runAttempt) ||
    !Number.isFinite(brokerSealedAt) ||
    brokerSealedAt < observedAt - 60_000 ||
    brokerSealedAt > Date.now() + 60_000 ||
    brokerSealedAt > observedAt + 15 * 60_000 ||
    !exactKeys(report.githubVariable, ["createdAt", "updatedAt"]) ||
    !Number.isFinite(variableCreatedAt) ||
    !Number.isFinite(variableUpdatedAt) ||
    variableCreatedAt < brokerSealedAt - 60_000 ||
    variableCreatedAt > brokerSealedAt + 60_000 ||
    variableUpdatedAt < variableCreatedAt ||
    variableUpdatedAt > Date.now() + 60_000 ||
    variableUpdatedAt > variableCreatedAt + 15 * 60_000 ||
    !exactKeys(report.screenshot, ["mimeType", "sha256", "bytes", "width", "height"]) ||
    (report.screenshot as Record<string, unknown>).mimeType !== "image/png" ||
    !sha256Pattern.test(String((report.screenshot as Record<string, unknown>).sha256 ?? "")) ||
    (report.screenshot as Record<string, unknown>).sha256 !== sha256(screenshotBytes) ||
    (report.screenshot as Record<string, unknown>).bytes !== screenshotBytes.length ||
    !Number.isSafeInteger((report.screenshot as Record<string, unknown>).width) ||
    !Number.isSafeInteger((report.screenshot as Record<string, unknown>).height) ||
    Number((report.screenshot as Record<string, unknown>).width) < 1 ||
    Number((report.screenshot as Record<string, unknown>).width) > 4096 ||
    Number((report.screenshot as Record<string, unknown>).height) < 1 ||
    Number((report.screenshot as Record<string, unknown>).height) > 4096 ||
    Number((report.screenshot as Record<string, unknown>).width) *
      Number((report.screenshot as Record<string, unknown>).height) >
      8_388_608 ||
    !screenshotBytes.subarray(0, pngSignature.length).equals(pngSignature)
  ) {
    throw new Error("QA_CMS_REAL_BROWSER_ATTESTATION_BINDING_INVALID");
  }
  const serialized = bytes.toString("utf8");
  if (
    serialized.includes(input.challenge.syntheticEmail) ||
    /(?:captchaToken|turnstileToken|tokenCaptured"\s*:\s*true|screenshotBase64)/i.test(serialized)
  ) {
    throw new Error("QA_CMS_REAL_BROWSER_ATTESTATION_SENSITIVE_VALUE_REFUSED");
  }
  return report as unknown as CmsConsumedRealBrowserAttestation;
}

export async function loadCmsRealBrowserAttestation(input: {
  repositoryRoot: string;
  environment: TargetEnvironment;
  candidateSha: string;
  runTag: string;
  origin: string;
}) {
  const configuration = expectedConfiguration(input);
  const challengeBytes = readRegularFile(
    configuration.challengePath,
    64 * 1024,
    "QA_CMS_REAL_BROWSER_CHALLENGE",
  );
  let challenge: CmsRealBrowserChallenge;
  try {
    challenge = JSON.parse(challengeBytes.toString("utf8")) as CmsRealBrowserChallenge;
  } catch (error) {
    throw new Error("QA_CMS_REAL_BROWSER_CHALLENGE_JSON_INVALID", { cause: error });
  }
  const challengeNonce = challengeNonceFromEmail(
    challenge.syntheticEmail,
    input.runTag,
    configuration.runAttempt,
  );
  if (
    !exactKeys(challenge, challengeKeys) ||
    challenge.schemaVersion !== 1 ||
    challenge.event !== "g12.real_browser.handoff.ready" ||
    challenge.repository !== "Vnd93/gaiatec-cms" ||
    challenge.environment !== input.environment ||
    challenge.candidateSha !== input.candidateSha ||
    challenge.controlSha !== configuration.controlSha ||
    challenge.runId !== configuration.runId ||
    challenge.runAttempt !== configuration.runAttempt ||
    challenge.runTag !== input.runTag ||
    challenge.origin !== input.origin ||
    new URL(challenge.origin).origin !== challenge.origin ||
    challenge.url !== `${input.origin}${challenge.campaignPath}` ||
    challenge.emailSha256 !== sha256(challenge.syntheticEmail) ||
    !challengeNonce ||
    challenge.challengeNonceSha256 !== sha256(challengeNonce) ||
    !sha256Pattern.test(challenge.challengeNonceSha256) ||
    challenge.variable !==
      `G12_${input.environment.toUpperCase()}_REAL_BROWSER_${configuration.runId}_${configuration.runAttempt}` ||
    challenge.challengeVariable !==
      `G12_${input.environment.toUpperCase()}_REAL_BROWSER_CHALLENGE_${configuration.runId}_${configuration.runAttempt}` ||
    challenge.successLocator !== CMS_REAL_BROWSER_SUCCESS_LOCATOR ||
    challenge.documentReleaseHeader !== "x-release" ||
    challenge.healthUrl !== `${input.origin}/healthz` ||
    challenge.healthReleaseField !== "release" ||
    challenge.deploymentIdentityRequired !== true ||
    challenge.screenshotScope !== "success-locator-only-no-input-fields" ||
    !Number.isFinite(parseCanonicalUtcTimestamp(challenge.expiresAt))
  ) {
    throw new Error("QA_CMS_REAL_BROWSER_CHALLENGE_BINDING_INVALID");
  }
  const attestation = await waitForCmsRealBrowserAttestation({
    repositoryRoot: input.repositoryRoot,
    challenge,
    timeoutMs: 1,
  });
  return { challenge, attestation, screenshotPath: configuration.screenshotPath };
}

export function cmsRealBrowserEvidenceSummary(
  report: CmsConsumedRealBrowserAttestation,
  screenshotPath: string,
) {
  const screenshot = readRegularFile(screenshotPath, 30 * 1024, "QA_CMS_REAL_BROWSER_SCREENSHOT");
  return {
    status: "passed",
    channel: "iab-workflow-dispatch-hmac",
    canonicalFrontendReleaseBound:
      report.documentReleaseSha === report.candidateSha &&
      report.healthReleaseSha === report.candidateSha &&
      report.deploymentIdentityObserved === true,
    backendAccepted: report.responseStatus === 201,
    persistedReference: referencePattern.test(report.reference),
    successLocator: CMS_REAL_BROWSER_SUCCESS_LOCATOR,
    successLocatorObserved: report.uiSuccessObserved,
    officialWidgetObserved: report.turnstile.officialWidgetObserved,
    cDataBound: report.turnstile.cDataBound,
    tokenCaptured: false,
    variableCleared: report.variableCleared,
    screenshotSha256: sha256(screenshot),
    screenshotBytes: screenshot.length,
    observedAt: report.observedAt,
  } as const;
}
