import { createHash } from "node:crypto";

import { validateRealBrowserScreenshotPng } from "./real-browser-attestation-store-lib.mjs";

const FULL_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const RUN_TAG = /^QA-CMS-FINAL-(\d{8})-([a-f0-9]{8})$/;
const REFERENCE = /^LD-[A-F0-9]{10}$/;
const MAX_AGE_MS = 15 * 60_000;
const TOP_LEVEL_KEYS = [
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
];

function exactKeys(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort())
  );
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalIso(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
    return null;
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const canonical = value.includes(".") ? date.toISOString() : date.toISOString().replace(".000Z", "Z");
  return canonical === value ? date : null;
}

function validCompactDate(value) {
  const date = new Date(
    Date.UTC(Number(value.slice(0, 4)), Number(value.slice(4, 6)) - 1, Number(value.slice(6, 8))),
  );
  return date.toISOString().slice(0, 10).replaceAll("-", "") === value;
}

function add(violations, condition, code) {
  if (!condition) violations.push(code);
}

export function validateConsumedRealBrowserEvidence(input) {
  const { report, screenshot, expected } = input;
  const violations = [];
  const runTag = RUN_TAG.exec(String(report?.runTag ?? ""));
  const expectedOrigin =
    expected.environment === "production"
      ? "https://gaiatecsistemas.com.br"
      : "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev";
  add(violations, exactKeys(report, TOP_LEVEL_KEYS), "top_level_keys_invalid");
  add(violations, report?.schemaVersion === 1, "schema_version_invalid");
  add(violations, report?.event === "g12.real_browser.attestation.consumed", "event_invalid");
  add(violations, report?.repository === "Vnd93/gaiatec-cms", "repository_invalid");
  add(violations, ["staging", "production"].includes(report?.environment), "environment_invalid");
  add(violations, report?.environment === expected.environment, "environment_mismatch");
  add(violations, FULL_SHA.test(String(report?.candidateSha ?? "")), "candidate_sha_invalid");
  add(violations, report?.candidateSha === expected.candidateSha, "candidate_sha_mismatch");
  add(violations, report?.documentReleaseSha === expected.candidateSha, "document_release_sha_mismatch");
  add(violations, report?.healthReleaseSha === expected.candidateSha, "health_release_sha_mismatch");
  add(violations, report?.deploymentIdentityObserved === true, "deployment_identity_not_observed");
  add(violations, POSITIVE_INTEGER.test(String(report?.runId ?? "")), "run_id_invalid");
  add(violations, String(report?.runId ?? "") === String(expected.runId ?? ""), "run_id_mismatch");
  add(violations, Number.isSafeInteger(report?.runAttempt) && report.runAttempt > 0, "run_attempt_invalid");
  add(violations, report?.runAttempt === Number(expected.runAttempt), "run_attempt_mismatch");
  add(
    violations,
    Boolean(
      runTag &&
      validCompactDate(runTag[1]) &&
      runTag[2] === String(report?.candidateSha ?? "").slice(0, 8) &&
      (!expected.runTag || report.runTag === expected.runTag),
    ),
    "run_tag_invalid",
  );
  add(violations, report?.origin === expectedOrigin, "origin_invalid");
  add(
    violations,
    new RegExp(`^/campanhas/qa-lead-${String(report?.runTag ?? "").toLowerCase()}-[a-f0-9]{8}$`).test(
      String(report?.campaignPath ?? ""),
    ),
    "campaign_path_invalid",
  );
  add(violations, SHA256.test(String(report?.emailSha256 ?? "")), "email_sha256_invalid");
  add(violations, REFERENCE.test(String(report?.reference ?? "")), "reference_invalid");
  add(violations, report?.responseStatus === 201, "response_status_invalid");
  add(violations, report?.uiSuccessObserved === true, "ui_success_not_observed");
  add(
    violations,
    typeof report?.visibleSuccessText === "string" &&
      new RegExp(`\\bProtocolo\\s+${String(report?.reference ?? "")}\\b`, "i").test(
        report.visibleSuccessText,
      ),
    "visible_success_invalid",
  );
  const observedAt = canonicalIso(report?.observedAt);
  add(violations, Boolean(observedAt), "observed_at_invalid");
  add(violations, SHA256.test(String(report?.challengeNonceSha256 ?? "")), "challenge_nonce_invalid");
  add(
    violations,
    exactKeys(report?.turnstile, ["provider", "officialWidgetObserved", "cDataBound", "tokenCaptured"]),
    "turnstile_keys_invalid",
  );
  add(violations, report?.turnstile?.provider === "cloudflare-turnstile", "turnstile_provider_invalid");
  add(violations, report?.turnstile?.officialWidgetObserved === true, "turnstile_widget_not_observed");
  add(violations, report?.turnstile?.cDataBound === true, "turnstile_cdata_not_bound");
  add(violations, report?.turnstile?.tokenCaptured === false, "turnstile_token_captured");
  add(
    violations,
    report?.variable ===
      `G12_${String(report?.environment ?? "").toUpperCase()}_REAL_BROWSER_${report?.runId}_${report?.runAttempt}`,
    "variable_invalid",
  );
  add(violations, report?.variableCleared === true, "variable_not_cleared");
  add(
    violations,
    exactKeys(report?.broker, ["controlSha", "runId", "runAttempt", "sealedAt"]),
    "broker_keys_invalid",
  );
  add(violations, report?.broker?.controlSha === expected.controlSha, "control_sha_mismatch");
  add(violations, POSITIVE_INTEGER.test(String(report?.broker?.runId ?? "")), "broker_run_id_invalid");
  add(
    violations,
    Number.isSafeInteger(report?.broker?.runAttempt) && report.broker.runAttempt > 0,
    "broker_run_attempt_invalid",
  );
  const sealedAt = canonicalIso(report?.broker?.sealedAt);
  add(
    violations,
    Boolean(
      sealedAt &&
      observedAt &&
      sealedAt.getTime() >= observedAt.getTime() - 60_000 &&
      sealedAt.getTime() - observedAt.getTime() <= MAX_AGE_MS,
    ),
    "broker_sealed_at_invalid",
  );
  add(
    violations,
    exactKeys(report?.githubVariable, ["createdAt", "updatedAt"]),
    "github_variable_keys_invalid",
  );
  const createdAt = canonicalIso(report?.githubVariable?.createdAt);
  const updatedAt = canonicalIso(report?.githubVariable?.updatedAt);
  add(
    violations,
    Boolean(
      createdAt &&
      updatedAt &&
      sealedAt &&
      createdAt.getTime() >= sealedAt.getTime() - 60_000 &&
      createdAt.getTime() <= sealedAt.getTime() + 60_000 &&
      updatedAt.getTime() >= createdAt.getTime() &&
      updatedAt.getTime() - createdAt.getTime() <= MAX_AGE_MS,
    ),
    "github_variable_timestamps_invalid",
  );
  add(
    violations,
    exactKeys(report?.screenshot, ["mimeType", "sha256", "bytes", "width", "height"]),
    "screenshot_keys_invalid",
  );
  const screenshotResult = validateRealBrowserScreenshotPng(screenshot);
  add(violations, screenshotResult.valid, "screenshot_png_invalid");
  add(violations, report?.screenshot?.mimeType === "image/png", "screenshot_mime_invalid");
  add(violations, report?.screenshot?.sha256 === sha256(screenshot), "screenshot_sha256_mismatch");
  add(violations, report?.screenshot?.bytes === screenshot?.length, "screenshot_bytes_mismatch");
  add(violations, report?.screenshot?.width === screenshotResult.width, "screenshot_width_mismatch");
  add(violations, report?.screenshot?.height === screenshotResult.height, "screenshot_height_mismatch");
  const serialized = JSON.stringify(report);
  add(
    violations,
    !/(?:captchaToken|turnstileToken|"base64"|tokenCaptured"\s*:\s*true)/i.test(serialized),
    "sensitive_token_material_present",
  );
  add(violations, !/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(serialized), "email_present");
  return { valid: violations.length === 0, violations: [...new Set(violations)] };
}

export function assertConsumedRealBrowserEvidence(input) {
  const result = validateConsumedRealBrowserEvidence(input);
  if (!result.valid) {
    throw new Error(`G12_REAL_BROWSER_RELEASE_EVIDENCE_REFUSED:${result.violations.join(",")}`);
  }
  return input.report;
}
