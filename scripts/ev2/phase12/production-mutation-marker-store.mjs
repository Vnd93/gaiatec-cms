import { appendFile, readFile } from "node:fs/promises";

import { validateProductionMutationMarker } from "./production-mutation-marker-lib.mjs";
import {
  PRODUCTION_MUTATION_MARKER_VARIABLE,
  sameProductionMutationMarkerVariable,
  sealProductionMutationMarkerVariable,
  verifyProductionMutationMarkerVariable,
} from "./production-mutation-marker-store-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

const operation = process.argv[2];
const repository = process.env.GITHUB_REPOSITORY ?? "";
const token = process.env.RELEASE_GUARD_TOKEN ?? "";
const hmacKey = process.env.PRODUCTION_MARKER_HMAC_KEY ?? "";
if (
  !["put", "clear"].includes(operation) ||
  repository !== "Vnd93/gaiatec-cms" ||
  token.length < 30 ||
  !/^[a-f0-9]{64}$/.test(hmacKey)
)
  throw new Error("G12_PRODUCTION_MARKER_STORE_INPUT_REFUSED");

const variablePath = `/repos/${repository}/actions/variables/${PRODUCTION_MUTATION_MARKER_VARIABLE}`;

async function github(path, { method = "GET", body, allowNotFound = false, etag } = {}) {
  let lastFailure = "transport";
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(`https://api.github.com${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(etag ? { "If-Match": etag } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      const payload = response.status === 204 ? null : await response.json().catch(() => null);
      if (allowNotFound && response.status === 404) return { found: false, etag: "", payload: null };
      if (response.ok) return { found: true, etag: response.headers.get("etag") ?? "", payload };
      lastFailure = String(response.status);
      if (![408, 429].includes(response.status) && response.status < 500)
        throw new Error(`G12_PRODUCTION_MARKER_STORE_API_REFUSED:${response.status}`);
    } catch (error) {
      if (String(error?.message ?? "").startsWith("G12_PRODUCTION_MARKER_STORE_API_REFUSED:")) throw error;
      lastFailure = "transport";
    }
    if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 1_000 * 2 ** (attempt - 1)));
  }
  throw new Error(`G12_PRODUCTION_MARKER_STORE_API_RETRY_EXHAUSTED:${lastFailure}`);
}

function parseStored(payload) {
  if (payload?.name !== PRODUCTION_MUTATION_MARKER_VARIABLE || typeof payload?.value !== "string")
    throw new Error("G12_PRODUCTION_MARKER_STORE_RESPONSE_REFUSED");
  try {
    return JSON.parse(payload.value);
  } catch (error) {
    throw new Error("G12_PRODUCTION_MARKER_STORE_RESPONSE_REFUSED", { cause: error });
  }
}

async function put() {
  const file = argument("file");
  const marker = JSON.parse(await readFile(file, "utf8"));
  const expected = {
    runId: process.env.GITHUB_RUN_ID,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT,
    controlSha: process.env.CONTROL_SHA,
  };
  const markerResult = validateProductionMutationMarker(marker, expected);
  if (!markerResult.valid)
    throw new Error(`G12_PRODUCTION_MARKER_STORE_REFUSED:${markerResult.violations.join(",")}`);
  const wrapper = sealProductionMutationMarkerVariable(
    {
      marker,
      artifactId: argument("artifact-id"),
      artifactDigest: argument("artifact-digest"),
      artifactName: argument("artifact-name"),
    },
    hmacKey,
  );
  const current = await github(variablePath, { allowNotFound: true });
  if (current.found) {
    const existing = parseStored(current.payload);
    const existingResult = verifyProductionMutationMarkerVariable(existing, hmacKey, expected);
    if (!existingResult.valid || !sameProductionMutationMarkerVariable(existing, wrapper))
      throw new Error("G12_PRODUCTION_MARKER_STORE_OCCUPIED");
  } else {
    await github(`/repos/${repository}/actions/variables`, {
      method: "POST",
      body: { name: PRODUCTION_MUTATION_MARKER_VARIABLE, value: JSON.stringify(wrapper) },
    });
  }
  const verified = await github(variablePath);
  const stored = parseStored(verified.payload);
  const result = verifyProductionMutationMarkerVariable(stored, hmacKey, expected);
  if (!result.valid || !sameProductionMutationMarkerVariable(stored, wrapper))
    throw new Error("G12_PRODUCTION_MARKER_STORE_WRITE_VERIFICATION_FAILED");
  console.log(
    JSON.stringify({
      event: "g12.production.mutation_marker.redundancy_verified",
      runId: marker.github.runId,
      runAttempt: marker.github.runAttempt,
      artifactId: wrapper.artifact.id,
      secretsDisclosed: false,
    }),
  );
}

async function clear() {
  const expected = {
    runId: argument("run-id"),
    runAttempt: argument("run-attempt"),
    controlSha: argument("control-sha"),
  };
  const current = await github(variablePath, { allowNotFound: true });
  if (!current.found) {
    console.log(JSON.stringify({ event: "g12.production.mutation_marker.already_cleared" }));
    return;
  }
  const stored = parseStored(current.payload);
  const result = verifyProductionMutationMarkerVariable(stored, hmacKey, expected);
  if (!result.valid)
    throw new Error(`G12_PRODUCTION_MARKER_STORE_CLEAR_REFUSED:${result.violations.join(",")}`);
  await github(variablePath, { method: "DELETE", etag: current.etag });
  const terminal = await github(variablePath, { allowNotFound: true });
  if (terminal.found) throw new Error("G12_PRODUCTION_MARKER_STORE_CLEAR_VERIFICATION_FAILED");
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, "cleared=true\n", "utf8");
  console.log(
    JSON.stringify({
      event: "g12.production.mutation_marker.compare_and_clear_verified",
      runId: expected.runId,
      runAttempt: Number(expected.runAttempt),
      secretsDisclosed: false,
    }),
  );
}

if (operation === "put") await put();
else await clear();
