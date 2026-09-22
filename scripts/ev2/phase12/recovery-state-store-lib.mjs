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
  "staging-cms-public-hotfix": {
    event: "g12.staging.cms_public_hotfix.prepared",
    variable: "G12_STAGING_CMS_PUBLIC_HOTFIX_RECOVERY",
  },
  "staging-cms-public-hotfix-candidate-intent": {
    event: "g12.staging.cms_public_hotfix.candidate_intent",
    variable: "G12_STAGING_CMS_PUBLIC_HOTFIX_CANDIDATE_INTENT",
  },
  "staging-cms-public-hotfix-rollback-intent": {
    event: "g12.staging.cms_public_hotfix.rollback_intent",
    variable: "G12_STAGING_CMS_PUBLIC_HOTFIX_ROLLBACK_INTENT",
  },
  "staging-deploy": {
    event: "g12.staging.deploy.prepared",
    variable: "G12_STAGING_DEPLOY_RECOVERY",
  },
  "staging-rollback": {
    event: "g12.staging.rollback.prepared",
    variable: "G12_STAGING_ROLLBACK_RECOVERY",
  },
  "staging-preview": {
    event: "g12.staging.preview.prepared",
    variable: "G12_STAGING_PREVIEW_RECOVERY",
  },
});

export const STAGING_RECOVERY_KINDS = Object.freeze([
  "staging-cms-public-hotfix",
  "staging-cms-public-hotfix-candidate-intent",
  "staging-cms-public-hotfix-rollback-intent",
  "staging-deploy",
  "staging-cms-public-legacy",
  "staging-rollback",
  "staging-preview",
]);

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
  const runAttempt =
    kind === "staging-deploy" && [2, 3, 4].includes(state?.schemaVersion)
      ? state?.workflow?.attempt
      : state?.workflow?.runAttempt;
  if (!state || typeof state !== "object" || Array.isArray(state)) violations.push("state_invalid");
  if (!Number.isSafeInteger(state?.schemaVersion) || state.schemaVersion < 1)
    violations.push("state_schema_invalid");
  if (state?.event !== config.event) violations.push("state_event_invalid");
  if (!POSITIVE_INTEGER.test(String(state?.workflow?.runId ?? ""))) violations.push("state_run_id_invalid");
  if (!Number.isSafeInteger(Number(runAttempt)) || Number(runAttempt) < 1)
    violations.push("state_run_attempt_invalid");
  if (!FULL_SHA.test(String(state?.workflow?.controlSha ?? ""))) violations.push("state_control_sha_invalid");
  if (expected.runId && String(state?.workflow?.runId) !== String(expected.runId))
    violations.push("state_run_id_mismatch");
  if (expected.runAttempt && Number(runAttempt) !== Number(expected.runAttempt))
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

function sameWorkflowBinding(left, right) {
  const leftAttempt = left?.attempt ?? left?.runAttempt;
  const rightAttempt = right?.attempt ?? right?.runAttempt;
  return (
    String(left?.runId ?? "") === String(right?.runId ?? "") &&
    Number(leftAttempt) === Number(rightAttempt) &&
    left?.controlSha === right?.controlSha
  );
}

export function planHotfixTerminalCleanup({ outcome, main, candidateIntent, rollbackIntent }) {
  const key = [main, candidateIntent, rollbackIntent].map((value) => (value ? "1" : "0")).join("");
  const progress =
    {
      restored: {
        111: {
          phase: "armed",
          remainingClearOrder: ["main", "candidateIntent", "rollbackIntent"],
        },
        "011": {
          phase: "main-cleared",
          remainingClearOrder: ["candidateIntent", "rollbackIntent"],
        },
        "001": { phase: "candidate-cleared", remainingClearOrder: ["rollbackIntent"] },
        "000": { phase: "complete", remainingClearOrder: [] },
      },
      promoted: {
        110: { phase: "armed", remainingClearOrder: ["candidateIntent", "main"] },
        100: { phase: "candidate-cleared", remainingClearOrder: ["main"] },
        "000": { phase: "complete", remainingClearOrder: [] },
      },
    }[outcome]?.[key] ?? null;
  return progress
    ? { valid: true, outcome, ...progress }
    : {
        valid: false,
        outcome,
        phase: "invalid",
        remainingClearOrder: [],
        violations: [`hotfix_terminal_cleanup_prefix_invalid:${outcome}:${key}`],
      };
}

export function evaluateStagingRecoveryFence({ ownerKind, expected, states }) {
  const violations = [];
  if (!STAGING_RECOVERY_KINDS.includes(ownerKind)) violations.push("fence_owner_kind_invalid");
  if (
    !POSITIVE_INTEGER.test(String(expected?.runId ?? "")) ||
    !Number.isSafeInteger(Number(expected?.runAttempt)) ||
    Number(expected.runAttempt) < 1 ||
    !FULL_SHA.test(String(expected?.controlSha ?? ""))
  )
    violations.push("fence_expected_binding_invalid");
  const presentKinds = [];
  for (const kind of STAGING_RECOVERY_KINDS) {
    const state = states?.[kind] ?? null;
    if (!state) continue;
    presentKinds.push(kind);
    const stateViolations = validateState(kind, state);
    if (stateViolations.length > 0)
      violations.push(...stateViolations.map((item) => `fence_${kind}_${item}`));
  }
  const allowed =
    ownerKind === "staging-cms-public-hotfix"
      ? new Set([
          "staging-cms-public-hotfix",
          "staging-cms-public-hotfix-candidate-intent",
          "staging-cms-public-hotfix-rollback-intent",
        ])
      : ownerKind === "staging-deploy" || ownerKind === "staging-cms-public-legacy"
        ? new Set(["staging-deploy", "staging-cms-public-legacy"])
        : new Set([ownerKind]);
  for (const kind of presentKinds) if (!allowed.has(kind)) violations.push(`fence_conflict:${kind}`);
  for (const kind of presentKinds) {
    const workflow = states[kind]?.workflow;
    if (!sameWorkflowBinding(workflow, expected)) violations.push(`fence_binding_mismatch:${kind}`);
  }
  if (
    presentKinds.includes("staging-deploy") &&
    presentKinds.includes("staging-cms-public-legacy") &&
    !sameWorkflowBinding(states["staging-deploy"]?.workflow, states["staging-cms-public-legacy"]?.workflow)
  )
    violations.push("fence_deploy_legacy_pair_mismatch");
  const hotfixMainPresent = presentKinds.includes("staging-cms-public-hotfix");
  const hotfixIntentKinds = [
    "staging-cms-public-hotfix-candidate-intent",
    "staging-cms-public-hotfix-rollback-intent",
  ].filter((kind) => presentKinds.includes(kind));
  if (!hotfixMainPresent && hotfixIntentKinds.length > 0) violations.push("fence_hotfix_intent_orphan");
  if (
    presentKinds.includes("staging-cms-public-hotfix-rollback-intent") &&
    !presentKinds.includes("staging-cms-public-hotfix-candidate-intent")
  )
    violations.push("fence_hotfix_rollback_without_candidate_intent");
  return {
    valid: violations.length === 0,
    open: violations.length === 0,
    violations: [...new Set(violations)],
    presentKinds,
  };
}
