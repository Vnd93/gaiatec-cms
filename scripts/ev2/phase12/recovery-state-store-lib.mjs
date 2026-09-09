import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const FULL_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const POSITIVE_INTEGER = /^[1-9]\d*$/;
export const MAX_RECOVERY_STATE_VARIABLE_BYTES = 47_000;

const RECOVERY_KINDS = Object.freeze({
  "production-frontend-bridge": {
    event: "g12.production.frontend_bridge.prepared",
    variable: "G12_PRODUCTION_FRONTEND_BRIDGE_RECOVERY",
  },
  "production-rollback": {
    event: "g12.production.rollback.prepared",
    variable: "G12_PRODUCTION_ROLLBACK_RECOVERY",
  },
  "staging-cms-public-legacy": {
    event: "g12.staging.cms_public_legacy.engaged",
    variable: "G12_STAGING_CMS_PUBLIC_LEGACY_RECOVERY",
  },
  "staging-deploy": {
    event: "g12.staging.deploy.prepared",
    variable: "G12_STAGING_DEPLOY_RECOVERY",
  },
  "staging-rollback": {
    event: "g12.staging.rollback.prepared",
    variable: "G12_STAGING_ROLLBACK_RECOVERY",
  },
});

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

function sha256(value) {
  return createHash("sha256").update(canonicalBytes(value)).digest("hex");
}

function hmac(value, key) {
  if (!SHA256.test(String(key ?? ""))) throw new Error("G12_RECOVERY_STATE_HMAC_KEY_REFUSED");
  return createHmac("sha256", Buffer.from(key, "hex")).update(canonicalBytes(value)).digest("hex");
}

function exactDigest(left, right) {
  if (!SHA256.test(String(left ?? "")) || !SHA256.test(String(right ?? ""))) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function definition(kind) {
  const value = RECOVERY_KINDS[kind];
  if (!value) throw new Error("G12_RECOVERY_STATE_KIND_REFUSED");
  return value;
}

function validateState(kind, state, expected = {}) {
  const violations = [];
  const config = definition(kind);
  if (!state || typeof state !== "object" || Array.isArray(state)) violations.push("state_invalid");
  if (!Number.isSafeInteger(state?.schemaVersion) || state.schemaVersion < 1)
    violations.push("state_schema_invalid");
  if (state?.event !== config.event) violations.push("state_event_invalid");
  if (!POSITIVE_INTEGER.test(String(state?.workflow?.runId ?? ""))) violations.push("state_run_id_invalid");
  if (!Number.isSafeInteger(Number(state?.workflow?.runAttempt)) || Number(state?.workflow?.runAttempt) < 1)
    violations.push("state_run_attempt_invalid");
  if (!FULL_SHA.test(String(state?.workflow?.controlSha ?? ""))) violations.push("state_control_sha_invalid");
  if (expected.runId && String(state?.workflow?.runId) !== String(expected.runId))
    violations.push("state_run_id_mismatch");
  if (expected.runAttempt && Number(state?.workflow?.runAttempt) !== Number(expected.runAttempt))
    violations.push("state_run_attempt_mismatch");
  if (expected.controlSha && state?.workflow?.controlSha !== expected.controlSha)
    violations.push("state_control_sha_mismatch");
  return violations;
}

export function recoveryStateVariableName(kind) {
  return definition(kind).variable;
}

export function sealRecoveryStateVariable(kind, state, key) {
  const config = definition(kind);
  const violations = validateState(kind, state);
  if (violations.length > 0) throw new Error(`G12_RECOVERY_STATE_REFUSED:${violations.join(",")}`);
  const unsigned = {
    schemaVersion: 1,
    event: "g12.recovery_state.redundant",
    repository: "Vnd93/gaiatec-cms",
    kind,
    variable: config.variable,
    state,
    stateSha256: sha256(state),
  };
  return { ...unsigned, hmacSha256: hmac(unsigned, key) };
}

export function verifyRecoveryStateVariable(wrapper, key, expected = {}) {
  const violations = [];
  const { hmacSha256, ...unsigned } = wrapper && typeof wrapper === "object" ? wrapper : {};
  let config;
  try {
    config = definition(unsigned.kind);
  } catch {
    violations.push("kind_invalid");
  }
  if (unsigned.schemaVersion !== 1) violations.push("schema_invalid");
  if (unsigned.event !== "g12.recovery_state.redundant") violations.push("event_invalid");
  if (unsigned.repository !== "Vnd93/gaiatec-cms") violations.push("repository_invalid");
  if (config && unsigned.variable !== config.variable) violations.push("variable_invalid");
  if (expected.kind && unsigned.kind !== expected.kind) violations.push("kind_mismatch");
  if (config) violations.push(...validateState(unsigned.kind, unsigned.state, expected));

  let stateDigest = "";
  let expectedHmac = "";
  try {
    stateDigest = sha256(unsigned.state);
  } catch {
    violations.push("state_payload_invalid");
  }
  if (!exactDigest(unsigned.stateSha256, stateDigest)) violations.push("state_digest_invalid");
  try {
    expectedHmac = hmac(unsigned, key);
  } catch {
    violations.push("hmac_key_invalid");
  }
  if (!exactDigest(hmacSha256, expectedHmac)) violations.push("hmac_invalid");
  return { valid: violations.length === 0, violations, state: unsigned.state, wrapper };
}

export function sameRecoveryStateVariable(left, right) {
  return canonicalBytes(left).equals(canonicalBytes(right));
}

export function serializeRecoveryStateVariable(wrapper) {
  const value = JSON.stringify(wrapper);
  if (Buffer.byteLength(value, "utf8") > MAX_RECOVERY_STATE_VARIABLE_BYTES)
    throw new Error("G12_RECOVERY_STATE_VARIABLE_SIZE_REFUSED");
  return value;
}
