const FULL_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_ANYWHERE = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

// The bridge only ever swaps the public read surface, and only in staging. Widening either constant
// would let the temporary legacy backend reach an authenticated surface or production.
export const LEGACY_BRIDGE_FUNCTION_SLUG = "cms-public";
export const LEGACY_BRIDGE_ENVIRONMENT = "staging";
export const LEGACY_BRIDGE_PROJECT_REF = "glcqsosxwgmlhzgcsnzv";
export const LEGACY_BRIDGE_RECOVERY_KIND = "staging-cms-public-legacy";
export const LEGACY_BRIDGE_STATE_EVENT = "g12.staging.cms_public_legacy.engaged";
// Edge Function inventory can advance before every dataplane isolate serves the new bytes. Keep the
// verification window fixed and bounded: only idempotent reads are retried, never the deployment.
export const PUBLIC_V2_RESTORE_PROBE_ATTEMPTS = 20;
export const PUBLIC_V2_RESTORE_PROBE_INTERVAL_MS = 4_000;
export const PUBLIC_V2_RESTORE_REQUIRED_CONSECUTIVE_SUCCESSES = 3;
export const PUBLIC_V2_RESTORE_SENTINEL_VERSION = "0";

// Exact wire shape served by the f48 release that production still runs.
export const LEGACY_FORM_CONTRACT_KEYS = Object.freeze([
  "schemaVersion",
  "formId",
  "versionId",
  "version",
  "key",
  "title",
  "purpose",
  "fields",
  "consent",
  "slaMinutes",
  "retentionDays",
  "successMessage",
  "submitLabel",
  "status",
]);

// Exact wire shape served by the candidate. It carries no internal identifier and no operational metadata.
export const PUBLIC_V2_FORM_CONTRACT_KEYS = Object.freeze([
  "key",
  "version",
  "title",
  "purpose",
  "fields",
  "consent",
  "successMessage",
  "submitLabel",
]);

export const PUBLIC_V2_FORBIDDEN_FORM_KEYS = Object.freeze([
  "schemaVersion",
  "formId",
  "versionId",
  "slaMinutes",
  "retentionDays",
  "status",
]);

export function legacyBridgeRefusal(code) {
  return new Error(`QA_CMS_PUBLIC_LEGACY_BRIDGE_${code}`);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function exactKeys(value, keys) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function containsUuid(value) {
  return UUID_ANYWHERE.test(JSON.stringify(value ?? null));
}

export function isLegacyFormContract(value, expected) {
  if (!exactKeys(value, LEGACY_FORM_CONTRACT_KEYS)) return false;
  return (
    value.schemaVersion === 1 &&
    value.status === "published" &&
    value.formId === expected?.formId &&
    value.versionId === expected?.versionId &&
    value.version === expected?.version &&
    value.key === expected?.key &&
    Number.isSafeInteger(value.slaMinutes) &&
    Number.isSafeInteger(value.retentionDays) &&
    Array.isArray(value.fields)
  );
}

export function isPublicV2FormContract(value, expected) {
  if (!exactKeys(value, PUBLIC_V2_FORM_CONTRACT_KEYS)) return false;
  if (PUBLIC_V2_FORBIDDEN_FORM_KEYS.some((key) => key in value)) return false;
  if (containsUuid(value)) return false;
  return (
    value.key === expected?.key &&
    value.version === expected?.version &&
    Array.isArray(value.fields) &&
    isRecord(value.consent) &&
    value.consent.required === true
  );
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function probeRestoreConvergence({ read, classify, pause }) {
  if (typeof read !== "function" || typeof classify !== "function" || typeof pause !== "function")
    throw legacyBridgeRefusal("CONTRACT_PROBE_INPUT_INVALID");

  let lastHttpStatus = null;
  let lastClassification = "unavailable";
  let incompatibleContractObserved = false;
  let consecutiveSuccesses = 0;
  for (let attempt = 1; attempt <= PUBLIC_V2_RESTORE_PROBE_ATTEMPTS; attempt += 1) {
    let result;
    try {
      result = await read(attempt);
    } catch {
      result = null;
    }
    lastHttpStatus = Number.isInteger(result?.status) ? result.status : null;
    lastClassification = classify(result);
    if (!new Set(["public-v2", "legacy", "violated", "unavailable"]).has(lastClassification))
      throw legacyBridgeRefusal("CONTRACT_PROBE_CLASSIFICATION_INVALID");
    if (lastClassification === "public-v2") {
      consecutiveSuccesses += 1;
      if (consecutiveSuccesses === PUBLIC_V2_RESTORE_REQUIRED_CONSECUTIVE_SUCCESSES) {
        return {
          contractProbe: "public-v2",
          attemptsUsed: attempt,
          maximumAttempts: PUBLIC_V2_RESTORE_PROBE_ATTEMPTS,
          intervalMs: PUBLIC_V2_RESTORE_PROBE_INTERVAL_MS,
          consecutiveSuccessesRequired: PUBLIC_V2_RESTORE_REQUIRED_CONSECUTIVE_SUCCESSES,
          consecutiveSuccessesObserved: consecutiveSuccesses,
          lastHttpStatus,
          lastClassification,
          incompatibleContractObserved,
        };
      }
    } else {
      consecutiveSuccesses = 0;
      if (lastClassification === "legacy" || lastClassification === "violated") {
        incompatibleContractObserved = true;
      }
    }

    if (attempt < PUBLIC_V2_RESTORE_PROBE_ATTEMPTS) await pause(PUBLIC_V2_RESTORE_PROBE_INTERVAL_MS);
  }

  return {
    contractProbe: incompatibleContractObserved ? "violated" : "unavailable",
    attemptsUsed: PUBLIC_V2_RESTORE_PROBE_ATTEMPTS,
    maximumAttempts: PUBLIC_V2_RESTORE_PROBE_ATTEMPTS,
    intervalMs: PUBLIC_V2_RESTORE_PROBE_INTERVAL_MS,
    consecutiveSuccessesRequired: PUBLIC_V2_RESTORE_REQUIRED_CONSECUTIVE_SUCCESSES,
    consecutiveSuccessesObserved: consecutiveSuccesses,
    lastHttpStatus,
    lastClassification,
    incompatibleContractObserved,
  };
}

export async function probePublicV2RestoreConvergence({ read, expected, pause = wait }) {
  if (
    !isRecord(expected) ||
    typeof expected.key !== "string" ||
    expected.key.length < 1 ||
    !UUID.test(String(expected.formId ?? "")) ||
    !UUID.test(String(expected.versionId ?? "")) ||
    !Number.isSafeInteger(expected.version) ||
    expected.version < 1
  )
    throw legacyBridgeRefusal("CONTRACT_PROBE_INPUT_INVALID");

  return probeRestoreConvergence({
    read,
    pause,
    classify: (result) => {
      if (result?.status !== 200) return "unavailable";
      if (isPublicV2FormContract(result.body, expected)) return "public-v2";
      if (isLegacyFormContract(result.body, expected)) return "legacy";
      // An unknown successful payload is never accepted. It remains retryable only inside this
      // fixed propagation window, and any observation is preserved as a terminal violation.
      return "violated";
    },
  });
}

export function isPublicV2RestoreSentinelContract(result) {
  return (
    result?.status === 404 && exactKeys(result.body, ["error"]) && result.body.error === "Não encontrado."
  );
}

// Candidate cms-public rejects version=0 before any database read. The legacy f48 implementation
// ignores that parameter and returns 204 for the per-run missing key, so this proves the candidate
// dataplane even when an interrupted run left no fixture state for the watchdog.
export async function probePublicV2RestoreSentinelConvergence({ read, pause = wait }) {
  return probeRestoreConvergence({
    read,
    pause,
    classify: (result) => {
      if (isPublicV2RestoreSentinelContract(result)) return "public-v2";
      if (result?.status === 204) return "legacy";
      if (!Number.isInteger(result?.status) || result.status >= 500) return "unavailable";
      return "violated";
    },
  });
}

export function legacyBridgeMarkers(runId, runAttempt) {
  if (!POSITIVE_INTEGER.test(String(runId)) || !POSITIVE_INTEGER.test(String(runAttempt)))
    throw legacyBridgeRefusal("WORKFLOW_BINDING_INVALID");
  return {
    engageMarker: `g12-staging-cms-public-legacy-engage-${runId}-${runAttempt}`,
    restoreMarker: `g12-staging-cms-public-legacy-restore-${runId}-${runAttempt}`,
  };
}

export function buildLegacyBridgeState({
  runId,
  runAttempt,
  controlSha,
  projectRef,
  environment,
  candidateSha,
  legacySha,
  candidateSourceSha256,
  legacySourceSha256,
  liveVersion,
}) {
  if (environment !== LEGACY_BRIDGE_ENVIRONMENT) throw legacyBridgeRefusal("ENVIRONMENT_REFUSED");
  if (projectRef !== LEGACY_BRIDGE_PROJECT_REF) throw legacyBridgeRefusal("PROJECT_REFUSED");
  if (!FULL_SHA.test(String(candidateSha)) || !FULL_SHA.test(String(legacySha)))
    throw legacyBridgeRefusal("SHA_INVALID");
  if (candidateSha === legacySha) throw legacyBridgeRefusal("SHA_INVALID");
  if (!FULL_SHA.test(String(controlSha))) throw legacyBridgeRefusal("WORKFLOW_BINDING_INVALID");
  if (!SHA256.test(String(candidateSourceSha256)) || !SHA256.test(String(legacySourceSha256)))
    throw legacyBridgeRefusal("SOURCE_DIGEST_INVALID");
  if (candidateSourceSha256 === legacySourceSha256) throw legacyBridgeRefusal("SOURCE_DIGEST_INVALID");
  if (!Number.isSafeInteger(liveVersion) || liveVersion < 1)
    throw legacyBridgeRefusal("LIVE_VERSION_INVALID");
  const markers = legacyBridgeMarkers(runId, runAttempt);
  return {
    schemaVersion: 1,
    event: LEGACY_BRIDGE_STATE_EVENT,
    workflow: { runId: String(runId), runAttempt: Number(runAttempt), controlSha },
    projectRef,
    environment,
    functionSlug: LEGACY_BRIDGE_FUNCTION_SLUG,
    ...markers,
    candidate: { sha: candidateSha, sourceSha256: candidateSourceSha256 },
    legacy: { sha: legacySha, sourceSha256: legacySourceSha256 },
    capturedLiveVersion: liveVersion,
  };
}

// The restore path must always redeploy the candidate bytes captured at engage time, never the legacy
// ones, and never a source tree whose digest drifted while the bridge was engaged.
export function assertRestorePlan(state, observedCandidateSourceSha256) {
  if (!isRecord(state) || state.event !== LEGACY_BRIDGE_STATE_EVENT)
    throw legacyBridgeRefusal("STATE_INVALID");
  if (state.functionSlug !== LEGACY_BRIDGE_FUNCTION_SLUG) throw legacyBridgeRefusal("STATE_INVALID");
  if (state.environment !== LEGACY_BRIDGE_ENVIRONMENT) throw legacyBridgeRefusal("ENVIRONMENT_REFUSED");
  if (state.projectRef !== LEGACY_BRIDGE_PROJECT_REF) throw legacyBridgeRefusal("PROJECT_REFUSED");
  if (!SHA256.test(String(observedCandidateSourceSha256))) throw legacyBridgeRefusal("SOURCE_DIGEST_INVALID");
  if (state.candidate?.sourceSha256 !== observedCandidateSourceSha256)
    throw legacyBridgeRefusal("RESTORE_SOURCE_MISMATCH");
  if (state.candidate?.sourceSha256 === state.legacy?.sourceSha256)
    throw legacyBridgeRefusal("SOURCE_DIGEST_INVALID");
  return {
    slug: state.functionSlug,
    projectRef: state.projectRef,
    sha: state.candidate.sha,
    sourceSha256: state.candidate.sourceSha256,
  };
}

// The swap may only ever deploy the legacy bytes recorded at prepare time, from a source tree whose
// digest has not drifted since the exclusive lease was taken.
export function assertEngagePlan(state, observedLegacySourceSha256) {
  if (!isRecord(state) || state.event !== LEGACY_BRIDGE_STATE_EVENT)
    throw legacyBridgeRefusal("STATE_INVALID");
  if (state.functionSlug !== LEGACY_BRIDGE_FUNCTION_SLUG) throw legacyBridgeRefusal("STATE_INVALID");
  if (state.environment !== LEGACY_BRIDGE_ENVIRONMENT) throw legacyBridgeRefusal("ENVIRONMENT_REFUSED");
  if (state.projectRef !== LEGACY_BRIDGE_PROJECT_REF) throw legacyBridgeRefusal("PROJECT_REFUSED");
  if (!SHA256.test(String(observedLegacySourceSha256))) throw legacyBridgeRefusal("SOURCE_DIGEST_INVALID");
  if (state.legacy?.sourceSha256 !== observedLegacySourceSha256)
    throw legacyBridgeRefusal("ENGAGE_SOURCE_MISMATCH");
  if (state.legacy?.sourceSha256 === state.candidate?.sourceSha256)
    throw legacyBridgeRefusal("SOURCE_DIGEST_INVALID");
  return {
    slug: state.functionSlug,
    projectRef: state.projectRef,
    sha: state.legacy.sha,
    sourceSha256: state.legacy.sourceSha256,
  };
}

// A restored function must be a strictly newer deployment than the one captured before the swap;
// an equal or lower version means the legacy bytes are still live.
export function restoredVersionAdvanced(state, restoredVersion) {
  if (!Number.isSafeInteger(restoredVersion) || restoredVersion < 1) return false;
  return restoredVersion > Number(state?.capturedLiveVersion ?? Number.POSITIVE_INFINITY);
}
