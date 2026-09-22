import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PRODUCTION_FUNCTIONS } from "./production-backend-lib.mjs";
import {
  STAGING_EDGE_BASELINE_ARTIFACT,
  writeStagingEdgeBaselineArtifact,
} from "./staging-edge-baseline-artifact-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? "" : process.argv[index + 1];
}

function token() {
  const value = process.env.SUPABASE_ACCESS_TOKEN ?? "";
  if (!value.startsWith("sbp_") || value.length < 24)
    throw new Error("G12_STAGING_EDGE_BASELINE_CAPTURE_BLOCKED");
  return value;
}

async function request(path, { accept = "application/json", maximumBytes = 8 * 1024 * 1024 } = {}) {
  let lastFailure = "transport";
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(`https://api.supabase.com${path}`, {
        headers: {
          Authorization: `Bearer ${token()}`,
          Accept: accept,
          "Accept-Encoding": "identity",
        },
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) {
        lastFailure = `http_${response.status}`;
        if (![408, 429].includes(response.status) && response.status < 500)
          throw new Error(`G12_STAGING_EDGE_BASELINE_CAPTURE_HTTP_${response.status}`);
      } else {
        const lengthHeader = response.headers.get("content-length");
        if (lengthHeader !== null) {
          const length = Number(lengthHeader);
          if (!Number.isSafeInteger(length) || length < 1 || length > maximumBytes)
            throw new Error("G12_STAGING_EDGE_BASELINE_CAPTURE_SIZE_REFUSED");
        }
        if (!response.body) throw new Error("G12_STAGING_EDGE_BASELINE_CAPTURE_BODY_MISSING");
        const reader = response.body.getReader();
        const chunks = [];
        let total = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > maximumBytes) {
            await reader.cancel();
            throw new Error("G12_STAGING_EDGE_BASELINE_CAPTURE_SIZE_REFUSED");
          }
          chunks.push(Buffer.from(value));
        }
        if (total < 1) throw new Error("G12_STAGING_EDGE_BASELINE_CAPTURE_BODY_EMPTY");
        return Buffer.concat(chunks, total);
      }
    } catch (error) {
      const message = String(error instanceof Error ? error.message : error);
      if (
        message.includes("SIZE_REFUSED") ||
        message.includes("BODY_MISSING") ||
        message.includes("BODY_EMPTY") ||
        /_HTTP_(?:4\d\d)$/.test(message)
      )
        throw error;
      lastFailure = "transport";
    }
    if (attempt < 4)
      await new Promise((resolveDelay) =>
        setTimeout(resolveDelay, Math.min(1_000 * 2 ** (attempt - 1), 8_000)),
      );
  }
  throw new Error(`G12_STAGING_EDGE_BASELINE_CAPTURE_RETRY_EXHAUSTED:${lastFailure}`);
}

async function inventory(projectRef) {
  const bytes = await request(`/v1/projects/${projectRef}/functions`);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    throw new Error("G12_STAGING_EDGE_BASELINE_CAPTURE_INVENTORY_JSON_REFUSED", { cause: error });
  }
}

async function captureBodies(projectRef) {
  const bodies = new Map();
  const queue = [...PRODUCTION_FUNCTIONS];
  const workers = Array.from({ length: 4 }, async () => {
    while (queue.length > 0) {
      const slug = queue.shift();
      if (!slug) return;
      const body = await request(`/v1/projects/${projectRef}/functions/${encodeURIComponent(slug)}/body`, {
        accept: "*/*",
        maximumBytes: STAGING_EDGE_BASELINE_ARTIFACT.maximumBodyBytes,
      });
      bodies.set(slug, body);
    }
  });
  await Promise.all(workers);
  return bodies;
}

const outputDirectory = argument("output");
const candidateSha = argument("candidate");
const controlSha = argument("control-sha");
const projectRef = argument("project-ref");
if (!outputDirectory || !candidateSha || !controlSha || !projectRef)
  throw new Error("G12_STAGING_EDGE_BASELINE_CAPTURE_INPUT_REQUIRED");
if (projectRef !== STAGING_EDGE_BASELINE_ARTIFACT.projectRef)
  throw new Error("G12_STAGING_EDGE_BASELINE_CAPTURE_PROJECT_REFUSED");
const beforePayload = await inventory(projectRef);
const bodies = await captureBodies(projectRef);
const afterPayload = await inventory(projectRef);
const result = writeStagingEdgeBaselineArtifact({
  outputDirectory: resolve(outputDirectory),
  workflow: {
    runId: process.env.GITHUB_RUN_ID,
    runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
    controlSha,
  },
  candidateSha,
  projectRef,
  capturedAt: new Date().toISOString(),
  beforePayload,
  afterPayload,
  bodies,
});
if (process.env.GITHUB_OUTPUT)
  await appendFile(
    process.env.GITHUB_OUTPUT,
    [
      `edge_baseline_manifest_sha256=${result.manifestSha256}`,
      `edge_baseline_inventory_sha256=${result.manifest.inventorySha256}`,
      `edge_baseline_function_count=${result.manifest.functionCount}`,
      `edge_baseline_aggregate_bytes=${result.manifest.aggregateBytes}`,
      "",
    ].join("\n"),
    "utf8",
  );
console.log(
  JSON.stringify({
    event: "g12.staging.edge_baseline.captured",
    manifestSha256: result.manifestSha256,
    inventorySha256: result.manifest.inventorySha256,
    functionCount: result.manifest.functionCount,
    aggregateBytes: result.manifest.aggregateBytes,
    secretsDisclosed: false,
  }),
);
