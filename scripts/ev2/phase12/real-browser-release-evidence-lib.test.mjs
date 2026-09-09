import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { deflateSync } from "node:zlib";

import {
  buildRealBrowserAttestationVariable,
  challengeNonceSha256,
  sanitizedConsumedRealBrowserAttestation,
  validateRealBrowserAttestationReport,
} from "./real-browser-attestation-store-lib.mjs";
import { validateConsumedRealBrowserEvidence } from "./real-browser-release-evidence-lib.mjs";

let crcTable;
function crc32(buffer) {
  crcTable ??= Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
  });
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data = Buffer.alloc(0)) {
  const name = Buffer.from(type, "ascii");
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  name.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return output;
}

function screenshot() {
  const width = 32;
  const height = 12;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const pixels = Buffer.alloc((width * 4 + 1) * height);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND"),
  ]);
}

function fixture() {
  const candidateSha = "a".repeat(40);
  const runTag = "QA-CMS-FINAL-20260908-aaaaaaaa";
  const observedAt = "2026-09-08T14:59:00.000Z";
  const report = {
    schemaVersion: 1,
    event: "g12.real_browser.attestation",
    repository: "Vnd93/gaiatec-cms",
    environment: "production",
    candidateSha,
    documentReleaseSha: candidateSha,
    healthReleaseSha: candidateSha,
    deploymentIdentityObserved: true,
    runId: "12345",
    runAttempt: 2,
    runTag,
    origin: "https://gaiatecsistemas.com.br",
    campaignPath: `/campanhas/qa-lead-${runTag.toLowerCase()}-deadbeef`,
    emailSha256: createHash("sha256").update("synthetic@example.invalid").digest("hex"),
    reference: "LD-A1B2C3D4E5",
    responseStatus: 201,
    uiSuccessObserved: true,
    visibleSuccessText: "Solicitação recebida. Protocolo LD-A1B2C3D4E5.",
    observedAt,
    challengeNonceSha256: challengeNonceSha256("browser_challenge_nonce_1234567890abcdef"),
    turnstile: {
      provider: "cloudflare-turnstile",
      officialWidgetObserved: true,
      cDataBound: true,
      tokenCaptured: false,
    },
  };
  const png = screenshot();
  const wrapper = buildRealBrowserAttestationVariable({
    report,
    screenshot: png,
    broker: {
      controlSha: "b".repeat(40),
      runId: "98765",
      runAttempt: 1,
      actor: "Vnd93",
      triggeringActor: "Vnd93",
      sealedAt: "2026-09-08T15:00:00.000Z",
    },
    evidenceSalt: "release-evidence-test-salt-at-least-32-characters",
    now: new Date("2026-09-08T15:00:00.000Z"),
  });
  const consumed = sanitizedConsumedRealBrowserAttestation(wrapper, {
    created_at: "2026-09-08T15:00:00Z",
    updated_at: "2026-09-08T15:00:00Z",
  });
  return {
    report,
    consumed,
    png,
    expected: {
      environment: "production",
      candidateSha,
      runId: "12345",
      runAttempt: 2,
      runTag,
      controlSha: "b".repeat(40),
    },
  };
}

test("archived evidence accepts an old but internally coherent immutable timeline", () => {
  const input = fixture();
  const archived = validateConsumedRealBrowserEvidence({
    report: input.consumed,
    screenshot: input.png,
    expected: input.expected,
    now: new Date("2030-01-01T00:00:00.000Z"),
  });
  assert.deepEqual(archived, { valid: true, violations: [] });
  assert.equal(
    validateRealBrowserAttestationReport(
      input.report,
      {},
      new Date("2030-01-01T00:00:00.000Z"),
    ).violations.includes("observed_at_stale"),
    true,
    "the live broker/store boundary must continue rejecting stale submissions",
  );
});

test("release evidence rejects deployment drift, incoherent timestamps, and extra claims", () => {
  const input = fixture();
  const cases = [
    [{ ...input.consumed, documentReleaseSha: "c".repeat(40) }, "document_release_sha_mismatch"],
    [{ ...input.consumed, healthReleaseSha: "c".repeat(40) }, "health_release_sha_mismatch"],
    [{ ...input.consumed, deploymentIdentityObserved: false }, "deployment_identity_not_observed"],
    [
      {
        ...input.consumed,
        githubVariable: { ...input.consumed.githubVariable, updatedAt: "2026-09-08T15:16:00.000Z" },
      },
      "github_variable_timestamps_invalid",
    ],
    [{ ...input.consumed, responseStatus: 200 }, "response_status_invalid"],
    [{ ...input.consumed, uiSuccessObserved: false }, "ui_success_not_observed"],
    [
      {
        ...input.consumed,
        githubVariable: {
          ...input.consumed.githubVariable,
          createdAt: "2026-09-08T12:00:00-03:00",
        },
      },
      "github_variable_timestamps_invalid",
    ],
    [{ ...input.consumed, candidateUiClaimed: true }, "top_level_keys_invalid"],
  ];
  for (const [report, violation] of cases) {
    const result = validateConsumedRealBrowserEvidence({
      report,
      screenshot: input.png,
      expected: input.expected,
    });
    assert.equal(result.valid, false, violation);
    assert.equal(result.violations.includes(violation), true, result.violations.join(","));
  }
});
