import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { deflateSync } from "node:zlib";

import {
  dispatchRealBrowserBrokerInput,
  fetchRealBrowserChallenge,
  prepareRealBrowserBrokerInput,
} from "./prepare-real-browser-broker-input.mjs";

const now = new Date("2026-09-08T15:00:00.000Z");
const candidateSha = "a".repeat(40);
const controlSha = "b".repeat(40);
const runId = "7654321";
const runAttempt = 2;
const runTag = "QA-CMS-FINAL-20260908-aaaaaaaa";
const nonce = "deadbeefcafebabe";
const syntheticEmail = `qa-iab-${runTag.toLowerCase()}-${runAttempt}-${nonce}@example.invalid`;

let crcTable;
function crc32(buffer) {
  crcTable ??= Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
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
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.alloc((width * 4 + 1) * height))),
    chunk("IEND"),
  ]);
}

function challenge() {
  const origin = "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev";
  const campaignPath = `/campanhas/qa-lead-${runTag.toLowerCase()}-deadbeef`;
  return {
    schemaVersion: 1,
    event: "g12.real_browser.handoff.ready",
    repository: "Vnd93/gaiatec-cms",
    environment: "staging",
    candidateSha,
    controlSha,
    runId,
    runAttempt,
    runTag,
    origin,
    campaignPath,
    url: `${origin}${campaignPath}`,
    syntheticEmail,
    emailSha256: createHash("sha256").update(syntheticEmail).digest("hex"),
    challengeNonceSha256: createHash("sha256").update(nonce).digest("hex"),
    variable: `G12_STAGING_REAL_BROWSER_${runId}_${runAttempt}`,
    challengeVariable: `G12_STAGING_REAL_BROWSER_CHALLENGE_${runId}_${runAttempt}`,
    successLocator: '[data-form-submission-status="success"]',
    documentReleaseHeader: "x-release",
    healthUrl: `${origin}/healthz`,
    healthReleaseField: "release",
    deploymentIdentityRequired: true,
    screenshotScope: "success-locator-only-no-input-fields",
    expiresAt: "2026-09-08T15:15:00.000Z",
  };
}

async function captureStdout(operation) {
  const original = process.stdout.write;
  let output = "";
  process.stdout.write = (chunk) => {
    output += String(chunk);
    return true;
  };
  try {
    return { value: await operation(), output };
  } finally {
    process.stdout.write = original;
  }
}

test("fetch, prepare, and dispatch bind the live GitHub challenge without logging sensitive inputs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "g12-real-browser-local-"));
  const challengePath = join(directory, "challenge.json");
  const screenshotPath = join(directory, "proof.png");
  const reportPath = join(directory, "report.json");
  const dispatchPath = join(directory, "dispatch.json");
  const expectedChallenge = challenge();
  const commandCalls = [];
  const command = (_executable, args, input) => {
    commandCalls.push({ args, input });
    if (args[0] === "api" && args[1] === "user") return "Vnd93\n";
    if (args[0] === "api") {
      return JSON.stringify({
        name: expectedChallenge.challengeVariable,
        value: JSON.stringify(expectedChallenge),
        created_at: "2026-09-08T14:59:30Z",
        updated_at: "2026-09-08T14:59:30Z",
      });
    }
    if (args[0] === "workflow") return "";
    throw new Error(`unexpected command: ${args.join(" ")}`);
  };
  try {
    await writeFile(screenshotPath, screenshot(), { flag: "wx" });
    const fetched = await captureStdout(() =>
      fetchRealBrowserChallenge(
        [
          "--environment",
          "staging",
          "--run-id",
          runId,
          "--run-attempt",
          String(runAttempt),
          "--output-challenge",
          challengePath,
          "--gh-path",
          process.execPath,
        ],
        now,
        command,
      ),
    );
    assert.equal(fetched.value.challengeNonceSha256, expectedChallenge.challengeNonceSha256);

    const prepared = await captureStdout(() =>
      prepareRealBrowserBrokerInput(
        [
          "--challenge",
          challengePath,
          "--screenshot",
          screenshotPath,
          "--reference",
          "LD-A1B2C3D4E5",
          "--response-status",
          "201",
          "--success-text",
          "Solicitação recebida. Protocolo LD-A1B2C3D4E5.",
          "--observed-at",
          "2026-09-08T15:00:00.000Z",
          "--document-release-sha",
          candidateSha,
          "--health-release-sha",
          candidateSha,
          "--output-report",
          reportPath,
          "--output-dispatch-inputs",
          dispatchPath,
        ],
        now,
      ),
    );
    assert.equal(prepared.value.report.deploymentIdentityObserved, true);

    const dispatched = await captureStdout(() =>
      dispatchRealBrowserBrokerInput(["--input", dispatchPath, "--gh-path", process.execPath], now, command),
    );
    assert.equal(dispatched.value.report.reference, "LD-A1B2C3D4E5");
    const workflowCall = commandCalls.find(({ args }) => args[0] === "workflow");
    assert.ok(workflowCall);
    assert.equal(workflowCall.args.includes("submit-real-browser-attestation.yml"), true);
    assert.deepEqual(JSON.parse(workflowCall.input), JSON.parse(await readFile(dispatchPath, "utf8")));

    const operatorOutput = `${fetched.output}${prepared.output}${dispatched.output}`;
    assert.doesNotMatch(operatorOutput, /qa-iab-|example\.invalid|report_base64|screenshot_base64/i);
    assert.doesNotMatch(operatorOutput, new RegExp(expectedChallenge.emailSha256, "i"));
    assert.doesNotMatch(operatorOutput, new RegExp(expectedChallenge.challengeNonceSha256, "i"));
    assert.doesNotMatch(operatorOutput, /ghp_|github_pat_|turnstile/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("fetch accepts only canonical UTC GitHub metadata and refuses offsets", async () => {
  const directory = await mkdtemp(join(tmpdir(), "g12-real-browser-timestamp-"));
  const output = join(directory, "challenge.json");
  const expectedChallenge = challenge();
  const command = (_executable, args) => {
    if (args[1] === "user") return "Vnd93\n";
    return JSON.stringify({
      name: expectedChallenge.challengeVariable,
      value: JSON.stringify(expectedChallenge),
      created_at: "2026-09-08T11:59:30-03:00",
      updated_at: "2026-09-08T11:59:30-03:00",
    });
  };
  try {
    await assert.rejects(
      fetchRealBrowserChallenge(
        [
          "--environment",
          "staging",
          "--run-id",
          runId,
          "--run-attempt",
          String(runAttempt),
          "--output-challenge",
          output,
          "--gh-path",
          process.execPath,
        ],
        now,
        command,
      ),
      /G12_REAL_BROWSER_FETCH_RESPONSE_REFUSED/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
