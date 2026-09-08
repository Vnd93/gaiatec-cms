import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { validateProductionMutationMarker } from "./production-mutation-marker-lib.mjs";

export const PRODUCTION_MUTATION_MARKER_VARIABLE = "G12_PRODUCTION_MUTATION_MARKER";

const SHA256 = /^[a-f0-9]{64}$/;

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}

function canonicalBytes(value) {
  return Buffer.from(JSON.stringify(canonical(value)), "utf8");
}

function digest(value) {
  return createHash("sha256").update(canonicalBytes(value)).digest("hex");
}

function hmac(value, key) {
  if (!/^[a-f0-9]{64}$/.test(key ?? "")) throw new Error("G12_PRODUCTION_MARKER_STORE_HMAC_KEY_REFUSED");
  return createHmac("sha256", Buffer.from(key, "hex")).update(canonicalBytes(value)).digest("hex");
}

function exactDigest(left, right) {
  if (!SHA256.test(left ?? "") || !SHA256.test(right ?? "")) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

export function normalizeProductionArtifactDigest(value) {
  const digest = String(value ?? "").toLowerCase();
  if (/^[a-f0-9]{64}$/.test(digest)) return `sha256:${digest}`;
  if (/^sha256:[a-f0-9]{64}$/.test(digest)) return digest;
  return "";
}

export function sealProductionMutationMarkerVariable(
  { marker, artifactId, artifactDigest, artifactName },
  key,
) {
  const markerResult = validateProductionMutationMarker(marker, {});
  if (!markerResult.valid)
    throw new Error(`G12_PRODUCTION_MARKER_STORE_REFUSED:${markerResult.violations.join(",")}`);
  const expectedName = `production-mutation-${marker.github.runId}-${marker.github.runAttempt}`;
  const normalizedArtifactDigest = normalizeProductionArtifactDigest(artifactDigest);
  if (!/^\d+$/.test(String(artifactId ?? "")) || !normalizedArtifactDigest || artifactName !== expectedName)
    throw new Error("G12_PRODUCTION_MARKER_STORE_ARTIFACT_REFUSED");
  const unsigned = {
    schemaVersion: 2,
    event: "g12.production.mutation.redundant_marker",
    repository: "Vnd93/gaiatec-cms",
    variable: PRODUCTION_MUTATION_MARKER_VARIABLE,
    marker,
    markerSha256: digest(marker),
    artifact: {
      id: String(artifactId),
      digest: normalizedArtifactDigest,
      name: artifactName,
    },
  };
  return { ...unsigned, hmacSha256: hmac(unsigned, key) };
}

export function verifyProductionMutationMarkerVariable(wrapper, key, expected = {}) {
  const violations = [];
  const { hmacSha256, ...unsigned } = wrapper && typeof wrapper === "object" ? wrapper : {};
  if (unsigned.schemaVersion !== 2) violations.push("schema_invalid");
  if (unsigned.event !== "g12.production.mutation.redundant_marker") violations.push("event_invalid");
  if (unsigned.repository !== "Vnd93/gaiatec-cms") violations.push("repository_invalid");
  if (unsigned.variable !== PRODUCTION_MUTATION_MARKER_VARIABLE) violations.push("variable_invalid");
  const markerResult = validateProductionMutationMarker(unsigned.marker, expected);
  violations.push(...markerResult.violations.map((item) => `marker_${item}`));
  let markerDigest = "";
  try {
    markerDigest = digest(unsigned.marker);
  } catch {
    violations.push("marker_payload_invalid");
  }
  if (!exactDigest(unsigned.markerSha256, markerDigest)) violations.push("marker_digest_invalid");
  let expectedHmac = "";
  try {
    expectedHmac = hmac(unsigned, key);
  } catch {
    violations.push("hmac_key_invalid");
  }
  if (!exactDigest(hmacSha256, expectedHmac)) violations.push("hmac_invalid");
  const expectedName = `production-mutation-${unsigned.marker?.github?.runId}-${unsigned.marker?.github?.runAttempt}`;
  if (
    !/^\d+$/.test(String(unsigned.artifact?.id ?? "")) ||
    !/^sha256:[a-f0-9]{64}$/.test(unsigned.artifact?.digest ?? "") ||
    unsigned.artifact?.name !== expectedName
  )
    violations.push("artifact_invalid");
  return { valid: violations.length === 0, violations, marker: unsigned.marker, wrapper };
}

export function sameProductionMutationMarkerVariable(left, right) {
  return canonicalBytes(left).equals(canonicalBytes(right));
}
