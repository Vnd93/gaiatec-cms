import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { deflateSync } from "node:zlib";

import {
  buildRealBrowserAttestationVariable,
  buildRealBrowserAttestationVariableFromBase64,
  challengeNonceSha256,
  decodeCanonicalBase64,
  MAX_REAL_BROWSER_SCREENSHOT_BYTES,
  realBrowserAttestationVariableName,
  sanitizedConsumedRealBrowserAttestation,
  serializeRealBrowserAttestationVariable,
  validateRealBrowserAttestationExpected,
  validateRealBrowserAttestationReport,
  validateRealBrowserGitHubVariableMetadata,
  validateRealBrowserScreenshotPng,
  verifyRealBrowserAttestationVariable,
} from "./real-browser-attestation-store-lib.mjs";

const now = new Date("2026-09-08T15:00:00.000Z");
const evidenceSalt = "evidence-salt-not-a-production-secret-123456789";

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

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, "ascii");
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  typeBuffer.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return output;
}

function png({ width = 390, height = 120, ancillary = null, noisy = false } = {}) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rows = Buffer.alloc((width * 4 + 1) * height);
  if (noisy) {
    let state = 0x12345678;
    for (let row = 0; row < height; row += 1) {
      const start = row * (width * 4 + 1);
      for (let offset = 1; offset <= width * 4; offset += 1) {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        rows[start + offset] = state & 0xff;
      }
    }
  }
  const chunks = [signature, pngChunk("IHDR", ihdr)];
  if (ancillary) chunks.push(pngChunk(ancillary.type, ancillary.data));
  chunks.push(pngChunk("IDAT", deflateSync(rows)), pngChunk("IEND"));
  return Buffer.concat(chunks);
}

function fixture() {
  const candidateSha = "a".repeat(40);
  const runTag = "QA-CMS-FINAL-20260908-aaaaaaaa";
  const report = {
    schemaVersion: 1,
    event: "g12.real_browser.attestation",
    repository: "Vnd93/gaiatec-cms",
    environment: "staging",
    candidateSha,
    documentReleaseSha: candidateSha,
    healthReleaseSha: candidateSha,
    deploymentIdentityObserved: true,
    runId: "7654321",
    runAttempt: 2,
    runTag,
    origin: "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev",
    campaignPath: `/campanhas/qa-lead-${runTag.toLowerCase()}-deadbeef`,
    emailSha256: createHash("sha256").update("qa-public-deadbeef@example.invalid").digest("hex"),
    reference: "LD-A1B2C3D4E5",
    responseStatus: 201,
    uiSuccessObserved: true,
    visibleSuccessText: "Solicitação recebida. Protocolo LD-A1B2C3D4E5.",
    observedAt: "2026-09-08T14:59:30.000Z",
    challengeNonceSha256: challengeNonceSha256("browser_challenge_nonce_1234567890abcdef"),
    turnstile: {
      provider: "cloudflare-turnstile",
      officialWidgetObserved: true,
      cDataBound: true,
      tokenCaptured: false,
    },
  };
  const broker = {
    controlSha: "b".repeat(40),
    runId: "998877",
    runAttempt: 1,
    actor: "Vnd93",
    triggeringActor: "Vnd93",
    sealedAt: "2026-09-08T15:00:00.000Z",
  };
  const screenshot = png();
  const expected = { ...report, controlSha: broker.controlSha };
  return { report, broker, screenshot, expected };
}

test("builds, serializes, and verifies an exact candidate-bound real-browser attestation", () => {
  const input = fixture();
  const wrapper = buildRealBrowserAttestationVariable({ ...input, evidenceSalt, now });
  const serialized = serializeRealBrowserAttestationVariable(wrapper);
  const result = verifyRealBrowserAttestationVariable(wrapper, evidenceSalt, input.expected, now);

  assert.equal(wrapper.variable, "G12_STAGING_REAL_BROWSER_7654321_2");
  assert.equal(Buffer.byteLength(serialized, "utf8") < 47_000, true);
  assert.equal(result.valid, true, result.violations.join(","));
  assert.deepEqual(result.screenshot, input.screenshot);
  assert.doesNotMatch(serialized, /qa-public-deadbeef@example\.invalid/);
  assert.equal(wrapper.report.candidateSha, input.report.candidateSha);
  assert.equal("loadedF48TabToCandidate" in wrapper.report, false);

  const consumed = sanitizedConsumedRealBrowserAttestation(wrapper, {
    created_at: "2026-09-08T14:59:59.000Z",
    updated_at: "2026-09-08T14:59:59.000Z",
  });
  assert.equal(consumed.variableCleared, true);
  assert.equal(consumed.screenshot.sha256, wrapper.screenshot.sha256);
  assert.equal(consumed.screenshot.bytes, input.screenshot.length);
  assert.equal("base64" in consumed.screenshot, false);
  assert.equal(JSON.stringify(consumed).includes(wrapper.screenshot.base64), false);
});

test("base64 builder accepts only canonical report and screenshot encodings", () => {
  const input = fixture();
  const wrapper = buildRealBrowserAttestationVariableFromBase64({
    reportBase64: Buffer.from(JSON.stringify(input.report), "utf8").toString("base64"),
    screenshotBase64: input.screenshot.toString("base64"),
    broker: input.broker,
    evidenceSalt,
    now,
  });
  assert.equal(verifyRealBrowserAttestationVariable(wrapper, evidenceSalt, input.expected, now).valid, true);
  assert.throws(() => decodeCanonicalBase64(`${input.screenshot.toString("base64")}\n`), /BASE64_REFUSED/);
  assert.throws(
    () =>
      buildRealBrowserAttestationVariableFromBase64({
        reportBase64: Buffer.from("not-json").toString("base64"),
        screenshotBase64: input.screenshot.toString("base64"),
        broker: input.broker,
        evidenceSalt,
        now,
      }),
    /REPORT_JSON_REFUSED/,
  );
});

test("schema and candidate bindings fail closed on extra keys and substitutions", () => {
  const { report, expected } = fixture();
  const cases = [
    [{ ...report, unexpected: true }, "report_keys_invalid"],
    [{ ...report, candidateSha: "c".repeat(40) }, "run_tag_invalid"],
    [{ ...report, documentReleaseSha: "c".repeat(40) }, "document_release_sha_invalid"],
    [{ ...report, healthReleaseSha: "c".repeat(40) }, "health_release_sha_invalid"],
    [{ ...report, deploymentIdentityObserved: false }, "deployment_identity_not_observed"],
    [{ ...report, runTag: "QA-CMS-FINAL-20260908-bbbbbbbb" }, "run_tag_invalid"],
    [
      { ...report, campaignPath: "/campanhas/qa-lead-qa-cms-final-20260908-aaaaaaaa-cafebabe" },
      "campaign_path_mismatch",
    ],
    [{ ...report, emailSha256: "c".repeat(64) }, "email_sha256_mismatch"],
    [{ ...report, challengeNonceSha256: "d".repeat(64) }, "challenge_nonce_sha256_mismatch"],
    [{ ...report, reference: "LD-WRONG" }, "reference_invalid"],
    [{ ...report, responseStatus: 200 }, "response_status_invalid"],
    [{ ...report, uiSuccessObserved: false }, "ui_success_not_observed"],
    [
      { ...report, visibleSuccessText: "Solicitação recebida sem referência." },
      "visible_success_text_invalid",
    ],
    [{ ...report, turnstile: { ...report.turnstile, cDataBound: false } }, "turnstile_cdata_not_bound"],
    [{ ...report, turnstile: { ...report.turnstile, tokenCaptured: true } }, "turnstile_token_captured"],
    [{ ...report, origin: "https://example.com/path" }, "origin_invalid"],
    [
      { ...report, origin: "https://ev2-g12-canary.gaiatec-cms-staging.pages.dev" },
      "origin_environment_mismatch",
    ],
  ];
  for (const [candidate, violation] of cases) {
    const result = validateRealBrowserAttestationReport(candidate, expected, now);
    assert.equal(result.valid, false, violation);
    assert.equal(result.violations.includes(violation), true, result.violations.join(","));
  }
});

test("report rejects raw email, UUID, token-like text, stale evidence, and malformed calendar dates", () => {
  const { report } = fixture();
  for (const visibleSuccessText of [
    "Protocolo LD-A1B2C3D4E5 para person@example.com.",
    "Protocolo LD-A1B2C3D4E5 para 123e4567-e89b-42d3-a456-426614174000.",
    "Protocolo LD-A1B2C3D4E5 com ghp_abcdefghijklmnopqrstuvwxyz123456.",
    `Protocolo LD-A1B2C3D4E5 ${"x".repeat(120)}.`,
  ]) {
    const result = validateRealBrowserAttestationReport({ ...report, visibleSuccessText }, {}, now);
    assert.equal(result.violations.includes("report_sensitive_text"), true);
  }
  assert.equal(
    validateRealBrowserAttestationReport(
      { ...report, observedAt: "2026-09-08T14:44:59.999Z" },
      {},
      now,
    ).violations.includes("observed_at_stale"),
    true,
  );
  assert.equal(
    validateRealBrowserAttestationReport(
      { ...report, runTag: "QA-CMS-FINAL-20260230-aaaaaaaa" },
      {},
      now,
    ).violations.includes("run_tag_invalid"),
    true,
  );
});

test("strict PNG validation checks signature, IHDR, dimensions, CRC, canonical chunks, and size", () => {
  const valid = png();
  assert.deepEqual(validateRealBrowserScreenshotPng(valid), {
    valid: true,
    violations: [],
    bytes: valid.length,
    width: 390,
    height: 120,
  });

  const badSignature = Buffer.from(valid);
  badSignature[0] = 0;
  assert.equal(
    validateRealBrowserScreenshotPng(badSignature).violations.includes("screenshot_signature_invalid"),
    true,
  );

  const badCrc = Buffer.from(valid);
  badCrc[29] ^= 0xff;
  assert.equal(validateRealBrowserScreenshotPng(badCrc).violations.includes("screenshot_crc_invalid"), true);
  assert.equal(
    validateRealBrowserScreenshotPng(png({ width: 0 })).violations.includes("screenshot_dimensions_invalid"),
    true,
  );
  assert.equal(
    validateRealBrowserScreenshotPng(
      png({ ancillary: { type: "tEXt", data: Buffer.from("email=person@example.com") } }),
    ).violations.includes("screenshot_chunk_not_canonical"),
    true,
  );
  assert.equal(
    validateRealBrowserScreenshotPng(Buffer.alloc(MAX_REAL_BROWSER_SCREENSHOT_BYTES + 1)).violations.includes(
      "screenshot_size_invalid",
    ),
    true,
  );
});

test("HMAC, screenshot digest, challenge, and control SHA tampering are refused", () => {
  const input = fixture();
  const wrapper = buildRealBrowserAttestationVariable({ ...input, evidenceSalt, now });
  const tamperedScreenshot = structuredClone(wrapper);
  tamperedScreenshot.screenshot.sha256 = "f".repeat(64);
  let result = verifyRealBrowserAttestationVariable(tamperedScreenshot, evidenceSalt, input.expected, now);
  assert.equal(result.valid, false);
  assert.equal(result.violations.includes("screenshot_digest_invalid"), true);
  assert.equal(result.violations.includes("hmac_invalid"), true);

  result = verifyRealBrowserAttestationVariable(
    wrapper,
    evidenceSalt,
    {
      ...input.expected,
      challengeNonceSha256: "e".repeat(64),
    },
    now,
  );
  assert.equal(result.violations.includes("challenge_nonce_sha256_mismatch"), true);
  result = verifyRealBrowserAttestationVariable(
    wrapper,
    evidenceSalt,
    {
      ...input.expected,
      controlSha: "c".repeat(40),
    },
    now,
  );
  assert.equal(result.violations.includes("control_sha_mismatch"), true);
  assert.equal(
    verifyRealBrowserAttestationVariable(wrapper, `${evidenceSalt}x`, input.expected, now).valid,
    false,
  );
});

test("expected bindings, variable identity, challenge preimage, and GitHub TTL are strict", () => {
  const input = fixture();
  assert.equal(validateRealBrowserAttestationExpected(input.expected).valid, true);
  assert.equal(
    validateRealBrowserAttestationExpected(
      {
        environment: input.report.environment,
        candidateSha: input.report.candidateSha,
        runId: input.report.runId,
        runAttempt: input.report.runAttempt,
        controlSha: input.broker.controlSha,
      },
      { minimum: true },
    ).valid,
    true,
  );
  assert.throws(
    () => realBrowserAttestationVariableName({ environment: "stage", runId: "1", runAttempt: "1" }),
    /VARIABLE_IDENTITY_REFUSED/,
  );
  assert.throws(() => challengeNonceSha256("too-short"), /CHALLENGE_NONCE_REFUSED/);

  const fresh = validateRealBrowserGitHubVariableMetadata(
    {
      created_at: "2026-09-08T14:59:00Z",
      updated_at: "2026-09-08T14:59:30Z",
    },
    now,
  );
  assert.equal(fresh.valid, true);
  assert.equal(fresh.createdAt?.getTime(), Date.parse("2026-09-08T14:59:00.000Z"));
  assert.equal(
    validateRealBrowserGitHubVariableMetadata(
      {
        created_at: "2026-09-08T11:59:00-03:00",
        updated_at: "2026-09-08T14:59:30Z",
      },
      now,
    ).violations.includes("github_created_at_invalid"),
    true,
  );
  assert.equal(
    validateRealBrowserGitHubVariableMetadata(
      {
        created_at: "2026-09-08T14:44:59.999Z",
        updated_at: "2026-09-08T14:59:30.000Z",
      },
      now,
    ).valid,
    false,
  );
  assert.equal(
    validateRealBrowserGitHubVariableMetadata(
      {
        created_at: "2026-09-08T14:59:30.000Z",
        updated_at: "2026-09-08T14:59:00.000Z",
      },
      now,
    ).valid,
    false,
  );
});

test("maximum screenshot remains below the variable ceiling and oversized serialization is refused", () => {
  const input = fixture();
  const nearLimit = png({ width: 100, height: 70, noisy: true });
  assert.equal(nearLimit.length > 25_000, true);
  assert.equal(nearLimit.length <= MAX_REAL_BROWSER_SCREENSHOT_BYTES, true);
  const wrapper = buildRealBrowserAttestationVariable({
    ...input,
    screenshot: nearLimit,
    evidenceSalt,
    now,
  });
  assert.equal(Buffer.byteLength(serializeRealBrowserAttestationVariable(wrapper), "utf8") < 47_000, true);
  assert.throws(
    () => serializeRealBrowserAttestationVariable({ padding: "x".repeat(47_000) }),
    /VARIABLE_SIZE_REFUSED/,
  );
});
