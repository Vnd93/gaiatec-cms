import assert from "node:assert/strict";
import test from "node:test";

import {
  recoveryStateVariableName,
  sealRecoveryStateVariable,
  verifyRecoveryStateVariable,
} from "../ev2/phase12/recovery-state-store-lib.mjs";
import {
  assertEngagePlan,
  assertRestorePlan,
  buildLegacyBridgeState,
  containsUuid,
  exactKeys,
  isLegacyFormContract,
  isPublicV2FormContract,
  LEGACY_BRIDGE_FUNCTION_SLUG,
  LEGACY_BRIDGE_PROJECT_REF,
  LEGACY_BRIDGE_RECOVERY_KIND,
  LEGACY_FORM_CONTRACT_KEYS,
  legacyBridgeMarkers,
  PUBLIC_V2_FORM_CONTRACT_KEYS,
  restoredVersionAdvanced,
} from "./cms-public-legacy-bridge-lib.mjs";

const CANDIDATE_SHA = "0ab1fa84eec65c762644ed9368bfcfb213402b17";
const LEGACY_SHA = "f48bb4530566456a0090a98cd39caf1cacb51b09";
const CONTROL_SHA = "a".repeat(40);
const CANDIDATE_DIGEST = "1".repeat(64);
const LEGACY_DIGEST = "2".repeat(64);
const FORM_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const VERSION_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3302";

function legacyForm(overrides = {}) {
  return {
    schemaVersion: 1,
    formId: FORM_ID,
    versionId: VERSION_ID,
    version: 1,
    key: "ponte-qa",
    title: "Ponte QA",
    purpose: "Captação sintética controlada.",
    fields: [],
    consent: { required: true, text: "Autorizo.", version: "tag", privacyPath: "/politica" },
    slaMinutes: 60,
    retentionDays: 1,
    successMessage: "Recebemos.",
    submitLabel: "Enviar",
    status: "published",
    ...overrides,
  };
}

function publicV2Form(overrides = {}) {
  return {
    key: "ponte-qa",
    version: 1,
    title: "Ponte QA",
    purpose: "Captação sintética controlada.",
    fields: [],
    consent: { required: true, text: "Autorizo.", version: "tag", privacyPath: "/politica" },
    successMessage: "Recebemos.",
    submitLabel: "Enviar",
    ...overrides,
  };
}

function state(overrides = {}) {
  return buildLegacyBridgeState({
    runId: "34400000001",
    runAttempt: 1,
    controlSha: CONTROL_SHA,
    projectRef: LEGACY_BRIDGE_PROJECT_REF,
    environment: "staging",
    candidateSha: CANDIDATE_SHA,
    legacySha: LEGACY_SHA,
    candidateSourceSha256: CANDIDATE_DIGEST,
    legacySourceSha256: LEGACY_DIGEST,
    liveVersion: 56,
    ...overrides,
  });
}

test("the two public form contracts stay disjoint on the identifiers that matter", () => {
  for (const key of ["formId", "versionId", "slaMinutes", "retentionDays", "status", "schemaVersion"]) {
    assert.ok(LEGACY_FORM_CONTRACT_KEYS.includes(key));
    assert.ok(!PUBLIC_V2_FORM_CONTRACT_KEYS.includes(key));
  }
  assert.equal(exactKeys(legacyForm(), LEGACY_FORM_CONTRACT_KEYS), true);
  assert.equal(exactKeys(publicV2Form(), PUBLIC_V2_FORM_CONTRACT_KEYS), true);
});

test("legacy detection requires the exact f48 shape bound to the requested form", () => {
  const expected = { formId: FORM_ID, versionId: VERSION_ID, version: 1, key: "ponte-qa" };
  assert.equal(isLegacyFormContract(legacyForm(), expected), true);
  assert.equal(isLegacyFormContract(publicV2Form(), expected), false);
  assert.equal(isLegacyFormContract(legacyForm({ status: "draft" }), expected), false);
  assert.equal(isLegacyFormContract(legacyForm({ formId: VERSION_ID }), expected), false);
  const extra = legacyForm();
  extra.extra = true;
  assert.equal(isLegacyFormContract(extra, expected), false);
  const missing = legacyForm();
  delete missing.slaMinutes;
  assert.equal(isLegacyFormContract(missing, expected), false);
});

test("public-v2 detection refuses any leaked identifier or operational field", () => {
  const expected = { key: "ponte-qa", version: 1 };
  assert.equal(isPublicV2FormContract(publicV2Form(), expected), true);
  assert.equal(isPublicV2FormContract(legacyForm(), expected), false);
  assert.equal(isPublicV2FormContract(publicV2Form({ formId: FORM_ID }), expected), false);
  assert.equal(isPublicV2FormContract(publicV2Form({ slaMinutes: 60 }), expected), false);
  // A UUID anywhere in the payload, even inside an otherwise valid field, is a leak.
  assert.equal(isPublicV2FormContract(publicV2Form({ title: `Ponte ${FORM_ID}` }), expected), false);
  assert.equal(containsUuid(publicV2Form()), false);
  assert.equal(containsUuid(legacyForm()), true);
});

test("engage state binds environment, project, both SHAs and both source digests", () => {
  const value = state();
  assert.equal(value.event, "g12.staging.cms_public_legacy.engaged");
  assert.equal(value.functionSlug, LEGACY_BRIDGE_FUNCTION_SLUG);
  assert.equal(value.projectRef, LEGACY_BRIDGE_PROJECT_REF);
  assert.equal(value.capturedLiveVersion, 56);
  assert.equal(value.engageMarker, "g12-staging-cms-public-legacy-engage-34400000001-1");
  assert.equal(value.restoreMarker, "g12-staging-cms-public-legacy-restore-34400000001-1");

  assert.throws(() => state({ environment: "production" }), /ENVIRONMENT_REFUSED/);
  assert.throws(() => state({ projectRef: "chfuhctnhqgyjowkvllv" }), /PROJECT_REFUSED/);
  assert.throws(() => state({ legacySha: CANDIDATE_SHA }), /SHA_INVALID/);
  assert.throws(() => state({ legacySourceSha256: CANDIDATE_DIGEST }), /SOURCE_DIGEST_INVALID/);
  assert.throws(() => state({ liveVersion: 0 }), /LIVE_VERSION_INVALID/);
  assert.throws(() => state({ controlSha: "nope" }), /WORKFLOW_BINDING_INVALID/);
  assert.throws(() => legacyBridgeMarkers("0", 1), /WORKFLOW_BINDING_INVALID/);
});

test("restore always redeploys the candidate bytes captured at engage time", () => {
  const plan = assertRestorePlan(state(), CANDIDATE_DIGEST);
  assert.deepEqual(plan, {
    slug: LEGACY_BRIDGE_FUNCTION_SLUG,
    projectRef: LEGACY_BRIDGE_PROJECT_REF,
    sha: CANDIDATE_SHA,
    sourceSha256: CANDIDATE_DIGEST,
  });
  // Restoring the legacy digest, or a candidate tree that drifted, must never be accepted.
  assert.throws(() => assertRestorePlan(state(), LEGACY_DIGEST), /RESTORE_SOURCE_MISMATCH/);
  assert.throws(() => assertRestorePlan(state(), "3".repeat(64)), /RESTORE_SOURCE_MISMATCH/);
  assert.throws(() => assertRestorePlan(state(), "short"), /SOURCE_DIGEST_INVALID/);
  assert.throws(() => assertRestorePlan({ ...state(), event: "other" }, CANDIDATE_DIGEST), /STATE_INVALID/);
  assert.throws(
    () => assertRestorePlan({ ...state(), functionSlug: "cms-content" }, CANDIDATE_DIGEST),
    /STATE_INVALID/,
  );
  assert.throws(
    () => assertRestorePlan({ ...state(), environment: "production" }, CANDIDATE_DIGEST),
    /ENVIRONMENT_REFUSED/,
  );
});

test("the swap only ever deploys the legacy bytes recorded at prepare time", () => {
  const plan = assertEngagePlan(state(), LEGACY_DIGEST);
  assert.deepEqual(plan, {
    slug: LEGACY_BRIDGE_FUNCTION_SLUG,
    projectRef: LEGACY_BRIDGE_PROJECT_REF,
    sha: LEGACY_SHA,
    sourceSha256: LEGACY_DIGEST,
  });
  // Swapping in the candidate bytes, or a drifted legacy tree, is not a bridge and must be refused.
  assert.throws(() => assertEngagePlan(state(), CANDIDATE_DIGEST), /ENGAGE_SOURCE_MISMATCH/);
  assert.throws(() => assertEngagePlan(state(), "4".repeat(64)), /ENGAGE_SOURCE_MISMATCH/);
  assert.throws(() => assertEngagePlan(state(), "short"), /SOURCE_DIGEST_INVALID/);
  assert.throws(
    () => assertEngagePlan({ ...state(), environment: "production" }, LEGACY_DIGEST),
    /ENVIRONMENT_REFUSED/,
  );
  assert.throws(
    () => assertEngagePlan({ ...state(), projectRef: "chfuhctnhqgyjowkvllv" }, LEGACY_DIGEST),
    /PROJECT_REFUSED/,
  );
});

test("restore is only proven when the live function version advances past the swap", () => {
  assert.equal(restoredVersionAdvanced(state(), 57), true);
  assert.equal(restoredVersionAdvanced(state(), 56), false);
  assert.equal(restoredVersionAdvanced(state(), 55), false);
  assert.equal(restoredVersionAdvanced(state(), 0), false);
  assert.equal(restoredVersionAdvanced({}, 57), false);
});

test("the legacy bridge holds its own exclusive recovery variable", () => {
  const key = "9".repeat(64);
  assert.equal(
    recoveryStateVariableName(LEGACY_BRIDGE_RECOVERY_KIND),
    "G12_STAGING_CMS_PUBLIC_LEGACY_RECOVERY",
  );
  assert.notEqual(
    recoveryStateVariableName(LEGACY_BRIDGE_RECOVERY_KIND),
    recoveryStateVariableName("staging-deploy"),
  );
  const wrapper = sealRecoveryStateVariable(LEGACY_BRIDGE_RECOVERY_KIND, state(), key);
  assert.equal(verifyRecoveryStateVariable(wrapper, key).valid, true);
  // A state sealed for this kind must not verify as any other recovery domain.
  assert.equal(verifyRecoveryStateVariable(wrapper, key, { kind: "staging-deploy" }).valid, false);
  assert.throws(
    () => sealRecoveryStateVariable("staging-deploy", state(), key),
    /G12_RECOVERY_STATE_REFUSED/,
  );
});
