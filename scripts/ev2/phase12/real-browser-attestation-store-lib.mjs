import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { inflateSync } from "node:zlib";

const FULL_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const LEAD_REFERENCE = /^LD-[A-F0-9]{10}$/;
const RUN_TAG = /^QA-CMS-FINAL-(\d{8})-([a-f0-9]{8})$/;
const CAMPAIGN_PATH = /^\/campanhas\/(qa-lead-(qa-cms-final-\d{8}-[a-f0-9]{8})-[a-f0-9]{8})$/;
const UUID_ANYWHERE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const EMAIL_ANYWHERE =
  /\b[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+\b/i;
const JWT_ANYWHERE = /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/;
const TURNSTILE_TOKEN_ANYWHERE = /\b[01]\.[A-Za-z0-9_-]{20,}(?:\.[A-Za-z0-9_-]{10,})+\b/;
const KNOWN_TOKEN_ANYWHERE =
  /\b(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|sb_(?:secret|publishable)_[A-Za-z0-9_-]{20,})\b/i;
const OPAQUE_SECRET_ANYWHERE = /\b[A-Za-z0-9_-]{96,}\b/;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CANONICAL_ORIGINS = Object.freeze({
  staging: "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev",
  production: "https://gaiatecsistemas.com.br",
});
const REPORT_KEYS = Object.freeze([
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
]);
const TURNSTILE_KEYS = Object.freeze(["provider", "officialWidgetObserved", "cDataBound", "tokenCaptured"]);
const WRAPPER_KEYS = Object.freeze([
  "schemaVersion",
  "event",
  "repository",
  "variable",
  "broker",
  "report",
  "screenshot",
  "reportSha256",
  "hmacSha256",
]);
const BROKER_KEYS = Object.freeze([
  "controlSha",
  "runId",
  "runAttempt",
  "actor",
  "triggeringActor",
  "sealedAt",
]);
const SCREENSHOT_KEYS = Object.freeze(["mimeType", "sha256", "bytes", "width", "height", "base64"]);

export const REAL_BROWSER_ATTESTATION_EVENT = "g12.real_browser.attestation";
export const REAL_BROWSER_ATTESTATION_WRAPPER_EVENT = "g12.real_browser.attestation.sealed";
export const REAL_BROWSER_ATTESTATION_MAX_AGE_MS = 15 * 60_000;
export const MAX_REAL_BROWSER_SCREENSHOT_BYTES = 30 * 1024;
export const MAX_REAL_BROWSER_VARIABLE_BYTES = 47_000;

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, keys) {
  return (
    isPlainObject(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort())
  );
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

function canonicalBytes(value) {
  return Buffer.from(JSON.stringify(canonical(value)), "utf8");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function reportDigest(report) {
  return sha256(canonicalBytes(report));
}

function validateEvidenceSalt(value) {
  const bytes = Buffer.byteLength(String(value ?? ""), "utf8");
  return (
    bytes >= 32 && bytes <= 512 && String(value).trim() === String(value) && !String(value).includes("\0")
  );
}

function hmac(unsigned, evidenceSalt) {
  if (!validateEvidenceSalt(evidenceSalt)) throw new Error("G12_REAL_BROWSER_EVIDENCE_SALT_REFUSED");
  return createHmac("sha256", Buffer.from(evidenceSalt, "utf8"))
    .update(canonicalBytes(unsigned))
    .digest("hex");
}

function exactDigest(left, right) {
  if (!SHA256.test(String(left ?? "")) || !SHA256.test(String(right ?? ""))) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function canonicalIso(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const canonical = value.includes(".") ? parsed.toISOString() : parsed.toISOString().replace(".000Z", "Z");
  return canonical === value ? parsed : null;
}

function validRunTagDate(compactDate) {
  const year = Number(compactDate.slice(0, 4));
  const month = Number(compactDate.slice(4, 6));
  const day = Number(compactDate.slice(6, 8));
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
  );
}

function canonicalOrigin(value) {
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      parsed.pathname === "/" &&
      !parsed.search &&
      !parsed.hash &&
      parsed.origin === value
    );
  } catch {
    return false;
  }
}

function containsSensitiveText(value) {
  return (
    typeof value !== "string" ||
    EMAIL_ANYWHERE.test(value) ||
    UUID_ANYWHERE.test(value) ||
    JWT_ANYWHERE.test(value) ||
    TURNSTILE_TOKEN_ANYWHERE.test(value) ||
    KNOWN_TOKEN_ANYWHERE.test(value) ||
    OPAQUE_SECRET_ANYWHERE.test(value)
  );
}

function expectedCampaignPath(runTag, campaignPath) {
  const match = CAMPAIGN_PATH.exec(String(campaignPath ?? ""));
  return Boolean(match && match[2] === runTag.toLowerCase());
}

function addMismatch(violations, expected, actual, key, name = key) {
  if (expected[key] !== undefined && String(actual) !== String(expected[key])) {
    violations.push(`${name}_mismatch`);
  }
}

export function realBrowserAttestationVariableName({ environment, runId, runAttempt }) {
  if (
    !["staging", "production"].includes(environment) ||
    !POSITIVE_INTEGER.test(String(runId ?? "")) ||
    !POSITIVE_INTEGER.test(String(runAttempt ?? ""))
  ) {
    throw new Error("G12_REAL_BROWSER_VARIABLE_IDENTITY_REFUSED");
  }
  return `G12_${environment.toUpperCase()}_REAL_BROWSER_${runId}_${runAttempt}`;
}

export function challengeNonceSha256(preimage) {
  if (typeof preimage !== "string" || !/^[A-Za-z0-9_-]{32,128}$/.test(preimage)) {
    throw new Error("G12_REAL_BROWSER_CHALLENGE_NONCE_REFUSED");
  }
  return sha256(Buffer.from(preimage, "utf8"));
}

export function decodeCanonicalBase64(value, label = "PAYLOAD") {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length % 4 !== 0 ||
    /[^A-Za-z0-9+/=]/.test(value)
  ) {
    throw new Error(`G12_REAL_BROWSER_${label}_BASE64_REFUSED`);
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.length === 0 || decoded.toString("base64") !== value) {
    throw new Error(`G12_REAL_BROWSER_${label}_BASE64_REFUSED`);
  }
  return decoded;
}

let crcTable;
function crc32(buffer) {
  if (!crcTable) {
    crcTable = Array.from({ length: 256 }, (_, index) => {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      return value >>> 0;
    });
  }
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function validateRealBrowserScreenshotPng(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value ?? []);
  const violations = [];
  if (buffer.length === 0 || buffer.length > MAX_REAL_BROWSER_SCREENSHOT_BYTES) {
    violations.push("screenshot_size_invalid");
  }
  if (buffer.length < 45 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    violations.push("screenshot_signature_invalid");
    return { valid: false, violations, bytes: buffer.length, width: 0, height: 0 };
  }

  let offset = 8;
  let chunkIndex = 0;
  let width = 0;
  let height = 0;
  let seenIhdr = false;
  let seenIdat = false;
  let idatEnded = false;
  let seenIend = false;
  let colorType = -1;
  let bitDepth = 0;
  let seenPlte = false;
  const idatParts = [];
  const allowedChunks = new Set(["IHDR", "PLTE", "IDAT", "IEND"]);
  while (offset < buffer.length) {
    if (offset + 12 > buffer.length) {
      violations.push("screenshot_chunk_truncated");
      break;
    }
    const length = buffer.readUInt32BE(offset);
    const typeBuffer = buffer.subarray(offset + 4, offset + 8);
    const type = typeBuffer.toString("ascii");
    const end = offset + 12 + length;
    if (!/^[A-Za-z]{4}$/.test(type) || end > buffer.length) {
      violations.push("screenshot_chunk_invalid");
      break;
    }
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    const expectedCrc = buffer.readUInt32BE(offset + 8 + length);
    if (crc32(Buffer.concat([typeBuffer, data])) !== expectedCrc) violations.push("screenshot_crc_invalid");
    if (!allowedChunks.has(type)) violations.push("screenshot_chunk_not_canonical");

    if (chunkIndex === 0 && type !== "IHDR") violations.push("screenshot_ihdr_not_first");
    if (type === "IHDR") {
      if (seenIhdr || length !== 13) {
        violations.push("screenshot_ihdr_invalid");
      } else {
        seenIhdr = true;
        width = data.readUInt32BE(0);
        height = data.readUInt32BE(4);
        bitDepth = data[8];
        colorType = data[9];
        const allowedDepths = {
          0: [1, 2, 4, 8, 16],
          2: [8, 16],
          3: [1, 2, 4, 8],
          4: [8, 16],
          6: [8, 16],
        };
        if (
          !allowedDepths[colorType]?.includes(bitDepth) ||
          data[10] !== 0 ||
          data[11] !== 0 ||
          data[12] !== 0
        ) {
          violations.push("screenshot_ihdr_encoding_invalid");
        }
      }
    } else if (type === "IDAT") {
      if (!seenIhdr || seenIend || idatEnded || length === 0) violations.push("screenshot_idat_invalid");
      seenIdat = true;
      idatParts.push(data);
    } else if (type === "PLTE") {
      if (seenPlte || seenIdat || length < 3 || length > 768 || length % 3 !== 0) {
        violations.push("screenshot_plte_invalid");
      }
      seenPlte = true;
    } else if (type === "IEND") {
      if (!seenIhdr || !seenIdat || seenIend || length !== 0 || end !== buffer.length) {
        violations.push("screenshot_iend_invalid");
      }
      seenIend = true;
    } else if (seenIdat) {
      idatEnded = true;
    }
    offset = end;
    chunkIndex += 1;
  }
  if (!seenIhdr) violations.push("screenshot_ihdr_missing");
  if (!seenIdat) violations.push("screenshot_idat_missing");
  if (!seenIend || offset !== buffer.length) violations.push("screenshot_iend_missing");
  if (colorType === 3 && !seenPlte) violations.push("screenshot_plte_missing");
  if (width < 1 || height < 1 || width > 4096 || height > 4096 || width * height > 8_388_608) {
    violations.push("screenshot_dimensions_invalid");
  }
  if (seenIhdr && seenIdat && width > 0 && height > 0) {
    try {
      const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
      const rowBytes = Math.ceil((width * channels * bitDepth) / 8);
      const expectedInflatedBytes = (rowBytes + 1) * height;
      const inflated = inflateSync(Buffer.concat(idatParts), {
        maxOutputLength: Math.min(expectedInflatedBytes + 1, 64 * 1024 * 1024),
      });
      if (inflated.length !== expectedInflatedBytes) {
        violations.push("screenshot_pixel_data_invalid");
      } else {
        for (let row = 0; row < height; row += 1) {
          if (inflated[row * (rowBytes + 1)] > 4) {
            violations.push("screenshot_filter_invalid");
            break;
          }
        }
      }
    } catch {
      violations.push("screenshot_pixel_data_invalid");
    }
  }
  return {
    valid: violations.length === 0,
    violations: [...new Set(violations)],
    bytes: buffer.length,
    width,
    height,
  };
}

export function validateRealBrowserAttestationExpected(expected, { minimum = false } = {}) {
  const violations = [];
  if (!isPlainObject(expected)) return { valid: false, violations: ["expected_invalid"] };
  if (!["staging", "production"].includes(expected.environment)) violations.push("environment_invalid");
  if (!FULL_SHA.test(String(expected.candidateSha ?? ""))) violations.push("candidate_sha_invalid");
  if (!POSITIVE_INTEGER.test(String(expected.runId ?? ""))) violations.push("run_id_invalid");
  if (!POSITIVE_INTEGER.test(String(expected.runAttempt ?? ""))) violations.push("run_attempt_invalid");
  if (!FULL_SHA.test(String(expected.controlSha ?? ""))) violations.push("control_sha_invalid");
  if (!minimum) {
    const runTag = RUN_TAG.exec(String(expected.runTag ?? ""));
    if (!runTag || !validRunTagDate(runTag[1]) || runTag[2] !== String(expected.candidateSha).slice(0, 8)) {
      violations.push("run_tag_invalid");
    }
    if (!canonicalOrigin(expected.origin)) violations.push("origin_invalid");
    if (
      CANONICAL_ORIGINS[expected.environment] !== undefined &&
      expected.origin !== CANONICAL_ORIGINS[expected.environment]
    ) {
      violations.push("origin_environment_mismatch");
    }
    if (!expectedCampaignPath(String(expected.runTag ?? ""), expected.campaignPath)) {
      violations.push("campaign_path_invalid");
    }
    if (!SHA256.test(String(expected.emailSha256 ?? ""))) violations.push("email_sha256_invalid");
    if (!SHA256.test(String(expected.challengeNonceSha256 ?? ""))) {
      violations.push("challenge_nonce_sha256_invalid");
    }
    if (expected.reference !== undefined && !LEAD_REFERENCE.test(String(expected.reference))) {
      violations.push("reference_invalid");
    }
  }
  return { valid: violations.length === 0, violations };
}

export function validateRealBrowserAttestationReport(
  report,
  expected = {},
  now = new Date(),
  { ignoreFreshness = false } = {},
) {
  const violations = [];
  if (!hasExactKeys(report, REPORT_KEYS)) violations.push("report_keys_invalid");
  if (report?.schemaVersion !== 1) violations.push("report_schema_invalid");
  if (report?.event !== REAL_BROWSER_ATTESTATION_EVENT) violations.push("report_event_invalid");
  if (report?.repository !== "Vnd93/gaiatec-cms") violations.push("report_repository_invalid");
  if (!["staging", "production"].includes(report?.environment)) violations.push("environment_invalid");
  if (!FULL_SHA.test(String(report?.candidateSha ?? ""))) violations.push("candidate_sha_invalid");
  if (
    !FULL_SHA.test(String(report?.documentReleaseSha ?? "")) ||
    report?.documentReleaseSha !== report?.candidateSha
  ) {
    violations.push("document_release_sha_invalid");
  }
  if (
    !FULL_SHA.test(String(report?.healthReleaseSha ?? "")) ||
    report?.healthReleaseSha !== report?.candidateSha
  ) {
    violations.push("health_release_sha_invalid");
  }
  if (report?.deploymentIdentityObserved !== true) {
    violations.push("deployment_identity_not_observed");
  }
  if (!POSITIVE_INTEGER.test(String(report?.runId ?? ""))) violations.push("run_id_invalid");
  if (!Number.isSafeInteger(report?.runAttempt) || report.runAttempt < 1)
    violations.push("run_attempt_invalid");
  const runTag = RUN_TAG.exec(String(report?.runTag ?? ""));
  if (
    !runTag ||
    !validRunTagDate(runTag[1]) ||
    runTag[2] !== String(report?.candidateSha ?? "").slice(0, 8)
  ) {
    violations.push("run_tag_invalid");
  }
  if (!canonicalOrigin(report?.origin)) violations.push("origin_invalid");
  if (
    CANONICAL_ORIGINS[report?.environment] !== undefined &&
    report?.origin !== CANONICAL_ORIGINS[report.environment]
  ) {
    violations.push("origin_environment_mismatch");
  }
  if (!expectedCampaignPath(String(report?.runTag ?? ""), report?.campaignPath)) {
    violations.push("campaign_path_invalid");
  }
  if (!SHA256.test(String(report?.emailSha256 ?? ""))) violations.push("email_sha256_invalid");
  if (!LEAD_REFERENCE.test(String(report?.reference ?? ""))) violations.push("reference_invalid");
  if (report?.responseStatus !== 201) violations.push("response_status_invalid");
  if (report?.uiSuccessObserved !== true) violations.push("ui_success_not_observed");
  if (
    typeof report?.visibleSuccessText !== "string" ||
    report.visibleSuccessText.length < 12 ||
    report.visibleSuccessText.length > 500 ||
    !new RegExp(`\\bProtocolo\\s+${String(report?.reference ?? "")}\\b`, "i").test(report.visibleSuccessText)
  ) {
    violations.push("visible_success_text_invalid");
  }
  if (containsSensitiveText(report?.visibleSuccessText)) violations.push("report_sensitive_text");
  const observedAt = canonicalIso(report?.observedAt);
  const current = now instanceof Date ? now : new Date(now);
  if (!observedAt || Number.isNaN(current.getTime())) {
    violations.push("observed_at_invalid");
  } else if (!ignoreFreshness) {
    const age = current.getTime() - observedAt.getTime();
    if (age < -60_000 || age > REAL_BROWSER_ATTESTATION_MAX_AGE_MS) violations.push("observed_at_stale");
  }
  if (!SHA256.test(String(report?.challengeNonceSha256 ?? ""))) {
    violations.push("challenge_nonce_sha256_invalid");
  }
  if (!hasExactKeys(report?.turnstile, TURNSTILE_KEYS)) violations.push("turnstile_keys_invalid");
  if (report?.turnstile?.provider !== "cloudflare-turnstile") violations.push("turnstile_provider_invalid");
  if (report?.turnstile?.officialWidgetObserved !== true) violations.push("turnstile_official_not_observed");
  if (report?.turnstile?.cDataBound !== true) violations.push("turnstile_cdata_not_bound");
  if (report?.turnstile?.tokenCaptured !== false) violations.push("turnstile_token_captured");

  addMismatch(violations, expected, report?.environment, "environment");
  addMismatch(violations, expected, report?.candidateSha, "candidateSha", "candidate_sha");
  addMismatch(violations, expected, report?.documentReleaseSha, "documentReleaseSha", "document_release_sha");
  addMismatch(violations, expected, report?.healthReleaseSha, "healthReleaseSha", "health_release_sha");
  addMismatch(violations, expected, report?.runId, "runId", "run_id");
  addMismatch(violations, expected, report?.runAttempt, "runAttempt", "run_attempt");
  addMismatch(violations, expected, report?.runTag, "runTag", "run_tag");
  addMismatch(violations, expected, report?.origin, "origin");
  addMismatch(violations, expected, report?.campaignPath, "campaignPath", "campaign_path");
  addMismatch(violations, expected, report?.emailSha256, "emailSha256", "email_sha256");
  addMismatch(
    violations,
    expected,
    report?.challengeNonceSha256,
    "challengeNonceSha256",
    "challenge_nonce_sha256",
  );
  addMismatch(violations, expected, report?.reference, "reference");
  return { valid: violations.length === 0, violations: [...new Set(violations)], report };
}

function validateBroker(broker, expected, now, { ignoreFreshness = false } = {}) {
  const violations = [];
  if (!hasExactKeys(broker, BROKER_KEYS)) violations.push("broker_keys_invalid");
  if (!FULL_SHA.test(String(broker?.controlSha ?? ""))) violations.push("broker_control_sha_invalid");
  if (!POSITIVE_INTEGER.test(String(broker?.runId ?? ""))) violations.push("broker_run_id_invalid");
  if (!Number.isSafeInteger(broker?.runAttempt) || broker.runAttempt < 1) {
    violations.push("broker_run_attempt_invalid");
  }
  if (broker?.actor !== "Vnd93" || broker?.triggeringActor !== "Vnd93") {
    violations.push("broker_actor_invalid");
  }
  const sealedAt = canonicalIso(broker?.sealedAt);
  if (!sealedAt) {
    violations.push("broker_sealed_at_invalid");
  } else if (!ignoreFreshness) {
    const age = now.getTime() - sealedAt.getTime();
    if (age < -60_000 || age > REAL_BROWSER_ATTESTATION_MAX_AGE_MS) {
      violations.push("broker_sealed_at_stale");
    }
  }
  if (expected.controlSha !== undefined && broker?.controlSha !== expected.controlSha) {
    violations.push("control_sha_mismatch");
  }
  return violations;
}

export function buildRealBrowserAttestationVariable({
  report,
  screenshot,
  broker,
  evidenceSalt,
  now = new Date(),
}) {
  const reportResult = validateRealBrowserAttestationReport(report, {}, now);
  if (!reportResult.valid) {
    throw new Error(`G12_REAL_BROWSER_REPORT_REFUSED:${reportResult.violations.join(",")}`);
  }
  const png = Buffer.isBuffer(screenshot) ? screenshot : Buffer.from(screenshot ?? []);
  const pngResult = validateRealBrowserScreenshotPng(png);
  if (!pngResult.valid) {
    throw new Error(`G12_REAL_BROWSER_SCREENSHOT_REFUSED:${pngResult.violations.join(",")}`);
  }
  const brokerViolations = validateBroker(broker, {}, now);
  if (brokerViolations.length > 0) {
    throw new Error(`G12_REAL_BROWSER_BROKER_REFUSED:${brokerViolations.join(",")}`);
  }
  const variable = realBrowserAttestationVariableName(report);
  const screenshotRecord = {
    mimeType: "image/png",
    sha256: sha256(png),
    bytes: png.length,
    width: pngResult.width,
    height: pngResult.height,
    base64: png.toString("base64"),
  };
  const unsigned = {
    schemaVersion: 1,
    event: REAL_BROWSER_ATTESTATION_WRAPPER_EVENT,
    repository: "Vnd93/gaiatec-cms",
    variable,
    broker,
    report,
    screenshot: screenshotRecord,
    reportSha256: reportDigest(report),
  };
  const wrapper = { ...unsigned, hmacSha256: hmac(unsigned, evidenceSalt) };
  serializeRealBrowserAttestationVariable(wrapper);
  return wrapper;
}

export function buildRealBrowserAttestationVariableFromBase64({
  reportBase64,
  screenshotBase64,
  broker,
  evidenceSalt,
  now = new Date(),
}) {
  let report;
  let parseFailed = false;
  try {
    report = JSON.parse(decodeCanonicalBase64(reportBase64, "REPORT").toString("utf8"));
  } catch (error) {
    if (String(error?.message ?? "").startsWith("G12_REAL_BROWSER_REPORT_BASE64_REFUSED")) throw error;
    parseFailed = true;
  }
  if (parseFailed) throw new Error("G12_REAL_BROWSER_REPORT_JSON_REFUSED");
  return buildRealBrowserAttestationVariable({
    report,
    screenshot: decodeCanonicalBase64(screenshotBase64, "SCREENSHOT"),
    broker,
    evidenceSalt,
    now,
  });
}

export function verifyRealBrowserAttestationVariable(
  wrapper,
  evidenceSalt,
  expected = {},
  now = new Date(),
  { ignoreFreshness = false } = {},
) {
  const violations = [];
  if (!hasExactKeys(wrapper, WRAPPER_KEYS)) violations.push("wrapper_keys_invalid");
  const { hmacSha256, ...unsigned } = isPlainObject(wrapper) ? wrapper : {};
  if (wrapper?.schemaVersion !== 1) violations.push("wrapper_schema_invalid");
  if (wrapper?.event !== REAL_BROWSER_ATTESTATION_WRAPPER_EVENT) violations.push("wrapper_event_invalid");
  if (wrapper?.repository !== "Vnd93/gaiatec-cms") violations.push("wrapper_repository_invalid");

  const reportResult = validateRealBrowserAttestationReport(wrapper?.report, expected, now, {
    ignoreFreshness,
  });
  violations.push(...reportResult.violations);
  let expectedVariable = "";
  try {
    expectedVariable = realBrowserAttestationVariableName(wrapper?.report ?? {});
  } catch {
    violations.push("variable_identity_invalid");
  }
  if (wrapper?.variable !== expectedVariable) violations.push("variable_mismatch");
  violations.push(...validateBroker(wrapper?.broker, expected, now, { ignoreFreshness }));
  let expectedReportDigest = "";
  try {
    expectedReportDigest = reportDigest(wrapper?.report);
  } catch {
    violations.push("report_digest_payload_invalid");
  }
  if (!exactDigest(wrapper?.reportSha256, expectedReportDigest)) {
    violations.push("report_digest_invalid");
  }

  let screenshotBuffer = Buffer.alloc(0);
  if (!hasExactKeys(wrapper?.screenshot, SCREENSHOT_KEYS)) violations.push("screenshot_keys_invalid");
  if (wrapper?.screenshot?.mimeType !== "image/png") violations.push("screenshot_mime_invalid");
  try {
    screenshotBuffer = decodeCanonicalBase64(wrapper?.screenshot?.base64, "SCREENSHOT");
  } catch {
    violations.push("screenshot_base64_invalid");
  }
  const pngResult = validateRealBrowserScreenshotPng(screenshotBuffer);
  violations.push(...pngResult.violations);
  if (!exactDigest(wrapper?.screenshot?.sha256, sha256(screenshotBuffer))) {
    violations.push("screenshot_digest_invalid");
  }
  if (wrapper?.screenshot?.bytes !== screenshotBuffer.length) violations.push("screenshot_bytes_invalid");
  if (wrapper?.screenshot?.width !== pngResult.width || wrapper?.screenshot?.height !== pngResult.height) {
    violations.push("screenshot_dimensions_mismatch");
  }

  let expectedHmac = "";
  try {
    expectedHmac = hmac(unsigned, evidenceSalt);
  } catch {
    violations.push("hmac_key_invalid");
  }
  if (!exactDigest(hmacSha256, expectedHmac)) violations.push("hmac_invalid");
  return {
    valid: violations.length === 0,
    violations: [...new Set(violations)],
    report: wrapper?.report,
    screenshot: screenshotBuffer,
    wrapper,
  };
}

export function serializeRealBrowserAttestationVariable(wrapper) {
  const serialized = JSON.stringify(wrapper);
  if (Buffer.byteLength(serialized, "utf8") > MAX_REAL_BROWSER_VARIABLE_BYTES) {
    throw new Error("G12_REAL_BROWSER_VARIABLE_SIZE_REFUSED");
  }
  return serialized;
}

export function validateRealBrowserGitHubVariableMetadata(payload, now = new Date()) {
  const violations = [];
  const createdAt = canonicalIso(payload?.created_at);
  const updatedAt = canonicalIso(payload?.updated_at);
  if (!createdAt) violations.push("github_created_at_invalid");
  if (!updatedAt) violations.push("github_updated_at_invalid");
  if (createdAt && updatedAt) {
    const current = now instanceof Date ? now : new Date(now);
    const createdAge = current.getTime() - createdAt.getTime();
    const updatedAge = current.getTime() - updatedAt.getTime();
    if (
      Number.isNaN(current.getTime()) ||
      createdAge < -60_000 ||
      updatedAge < -60_000 ||
      createdAge > REAL_BROWSER_ATTESTATION_MAX_AGE_MS ||
      updatedAge > REAL_BROWSER_ATTESTATION_MAX_AGE_MS ||
      updatedAt < createdAt
    ) {
      violations.push("github_variable_ttl_invalid");
    }
  }
  return { valid: violations.length === 0, violations, createdAt, updatedAt };
}

export function sanitizedConsumedRealBrowserAttestation(wrapper, githubMetadata) {
  return {
    ...wrapper.report,
    event: "g12.real_browser.attestation.consumed",
    variable: wrapper.variable,
    variableCleared: true,
    broker: {
      controlSha: wrapper.broker.controlSha,
      runId: wrapper.broker.runId,
      runAttempt: wrapper.broker.runAttempt,
      sealedAt: wrapper.broker.sealedAt,
    },
    githubVariable: {
      createdAt: githubMetadata.created_at,
      updatedAt: githubMetadata.updated_at,
    },
    screenshot: {
      mimeType: wrapper.screenshot.mimeType,
      sha256: wrapper.screenshot.sha256,
      bytes: wrapper.screenshot.bytes,
      width: wrapper.screenshot.width,
      height: wrapper.screenshot.height,
    },
  };
}
