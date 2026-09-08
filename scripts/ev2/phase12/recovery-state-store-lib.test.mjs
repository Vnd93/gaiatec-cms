import assert from "node:assert/strict";
import test from "node:test";

import {
  recoveryStateVariableName,
  sameRecoveryStateVariable,
  sealRecoveryStateVariable,
  serializeRecoveryStateVariable,
  verifyRecoveryStateVariable,
} from "./recovery-state-store-lib.mjs";

const key = "9".repeat(64);
const runId = "34000214001";
const runAttempt = 2;
const controlSha = "a".repeat(40);

function state(event = "g12.staging.rollback.prepared") {
  return {
    schemaVersion: 1,
    event,
    workflow: { runId, runAttempt, controlSha },
    original: { deploymentId: "034ac0ad-12b3-4eef-8abc-1234567890ab", release: "b".repeat(40) },
    target: { release: "c".repeat(40) },
  };
}

test("recovery state is HMAC-bound to its kind, run, attempt and control SHA", () => {
  const wrapper = sealRecoveryStateVariable("staging-rollback", state(), key);
  const result = verifyRecoveryStateVariable(wrapper, key, {
    kind: "staging-rollback",
    runId,
    runAttempt,
    controlSha,
  });

  assert.equal(result.valid, true);
  assert.equal(recoveryStateVariableName("staging-rollback"), "G12_STAGING_ROLLBACK_RECOVERY");
  assert.equal(sameRecoveryStateVariable(wrapper, structuredClone(wrapper)), true);
});

test("recovery state rejects payload, HMAC, kind and replay substitution", () => {
  const wrapper = sealRecoveryStateVariable("staging-rollback", state(), key);
  const payloadTamper = structuredClone(wrapper);
  payloadTamper.state.target.release = "d".repeat(40);
  assert.equal(verifyRecoveryStateVariable(payloadTamper, key).valid, false);

  const hmacTamper = structuredClone(wrapper);
  hmacTamper.hmacSha256 = "0".repeat(64);
  assert.equal(verifyRecoveryStateVariable(hmacTamper, key).valid, false);
  assert.equal(verifyRecoveryStateVariable(wrapper, key, { kind: "staging-deploy" }).valid, false);
  assert.equal(verifyRecoveryStateVariable(wrapper, key, { runId: "34000214002" }).valid, false);
  assert.equal(verifyRecoveryStateVariable(wrapper, key, { runAttempt: 3 }).valid, false);
  assert.equal(verifyRecoveryStateVariable(wrapper, key, { controlSha: "f".repeat(40) }).valid, false);
});

test("each recovery domain uses a separate occupied control variable", () => {
  assert.equal(recoveryStateVariableName("staging-deploy"), "G12_STAGING_DEPLOY_RECOVERY");
  assert.equal(recoveryStateVariableName("staging-rollback"), "G12_STAGING_ROLLBACK_RECOVERY");
  assert.equal(recoveryStateVariableName("production-rollback"), "G12_PRODUCTION_ROLLBACK_RECOVERY");
  assert.equal(
    recoveryStateVariableName("production-frontend-bridge"),
    "G12_PRODUCTION_FRONTEND_BRIDGE_RECOVERY",
  );
  assert.throws(() => recoveryStateVariableName("unknown"), /G12_RECOVERY_STATE_KIND_REFUSED/);
});

test("recovery state refuses values that cannot fit atomically in a GitHub variable", () => {
  const wrapper = sealRecoveryStateVariable(
    "staging-rollback",
    { ...state(), padding: "x".repeat(48_000) },
    key,
  );
  assert.throws(() => serializeRecoveryStateVariable(wrapper), /G12_RECOVERY_STATE_VARIABLE_SIZE_REFUSED/);
});
