import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateStagingRecoveryFence,
  planHotfixTerminalCleanup,
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
  assert.equal(
    recoveryStateVariableName("staging-cms-public-hotfix"),
    "G12_STAGING_CMS_PUBLIC_HOTFIX_RECOVERY",
  );
  assert.equal(
    recoveryStateVariableName("staging-cms-public-hotfix-candidate-intent"),
    "G12_STAGING_CMS_PUBLIC_HOTFIX_CANDIDATE_INTENT",
  );
  assert.equal(
    recoveryStateVariableName("staging-cms-public-hotfix-rollback-intent"),
    "G12_STAGING_CMS_PUBLIC_HOTFIX_ROLLBACK_INTENT",
  );
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

test("staging recovery fence is fail-closed and permits only the exact deploy plus legacy pair", () => {
  const expected = { runId, runAttempt, controlSha };
  const events = {
    "staging-cms-public-hotfix": "g12.staging.cms_public_hotfix.prepared",
    "staging-cms-public-hotfix-candidate-intent": "g12.staging.cms_public_hotfix.candidate_intent",
    "staging-cms-public-hotfix-rollback-intent": "g12.staging.cms_public_hotfix.rollback_intent",
    "staging-deploy": "g12.staging.deploy.prepared",
    "staging-cms-public-legacy": "g12.staging.cms_public_legacy.engaged",
    "staging-rollback": "g12.staging.rollback.prepared",
  };
  const value = (kind, workflow = expected) => ({
    schemaVersion: 1,
    event: events[kind],
    workflow: { ...workflow },
  });
  const empty = evaluateStagingRecoveryFence({
    ownerKind: "staging-cms-public-hotfix",
    expected,
    states: {},
  });
  assert.equal(empty.open, true);

  const conflict = evaluateStagingRecoveryFence({
    ownerKind: "staging-cms-public-hotfix",
    expected,
    states: { "staging-deploy": value("staging-deploy") },
  });
  assert.equal(conflict.open, false);
  assert.match(conflict.violations.join(","), /fence_conflict:staging-deploy/);

  const paired = {
    "staging-deploy": value("staging-deploy"),
    "staging-cms-public-legacy": value("staging-cms-public-legacy"),
  };
  assert.equal(
    evaluateStagingRecoveryFence({ ownerKind: "staging-deploy", expected, states: paired }).open,
    true,
  );
  const poisonedPair = structuredClone(paired);
  poisonedPair["staging-cms-public-legacy"].workflow.runAttempt += 1;
  const rejectedPair = evaluateStagingRecoveryFence({
    ownerKind: "staging-deploy",
    expected,
    states: poisonedPair,
  });
  assert.equal(rejectedPair.open, false);
  assert.match(rejectedPair.violations.join(","), /binding_mismatch|pair_mismatch/);

  const ownWatchdogState = evaluateStagingRecoveryFence({
    ownerKind: "staging-rollback",
    expected,
    states: { "staging-rollback": value("staging-rollback") },
  });
  assert.equal(ownWatchdogState.open, true);

  const orphanIntent = evaluateStagingRecoveryFence({
    ownerKind: "staging-cms-public-hotfix",
    expected,
    states: {
      "staging-cms-public-hotfix-candidate-intent": value("staging-cms-public-hotfix-candidate-intent"),
    },
  });
  assert.equal(orphanIntent.open, false);
  assert.match(orphanIntent.violations.join(","), /fence_hotfix_intent_orphan/);
  const rollbackWithoutCandidate = evaluateStagingRecoveryFence({
    ownerKind: "staging-cms-public-hotfix",
    expected,
    states: {
      "staging-cms-public-hotfix": value("staging-cms-public-hotfix"),
      "staging-cms-public-hotfix-rollback-intent": value("staging-cms-public-hotfix-rollback-intent"),
    },
  });
  assert.equal(rollbackWithoutCandidate.open, false);
  assert.match(
    rollbackWithoutCandidate.violations.join(","),
    /fence_hotfix_rollback_without_candidate_intent/,
  );
  const completeHotfixDomain = evaluateStagingRecoveryFence({
    ownerKind: "staging-cms-public-hotfix",
    expected,
    states: {
      "staging-cms-public-hotfix": value("staging-cms-public-hotfix"),
      "staging-cms-public-hotfix-candidate-intent": value("staging-cms-public-hotfix-candidate-intent"),
    },
  });
  assert.equal(completeHotfixDomain.open, true);
});

test("hotfix terminal cleanup accepts every interruption prefix without rehydration", () => {
  const prefixes = [
    {
      state: { outcome: "restored", main: true, candidateIntent: true, rollbackIntent: true },
      phase: "armed",
      remaining: ["main", "candidateIntent", "rollbackIntent"],
    },
    {
      state: { outcome: "restored", main: false, candidateIntent: true, rollbackIntent: true },
      phase: "main-cleared",
      remaining: ["candidateIntent", "rollbackIntent"],
    },
    {
      state: { outcome: "restored", main: false, candidateIntent: false, rollbackIntent: true },
      phase: "candidate-cleared",
      remaining: ["rollbackIntent"],
    },
    {
      state: { outcome: "restored", main: false, candidateIntent: false, rollbackIntent: false },
      phase: "complete",
      remaining: [],
    },
    {
      state: { outcome: "promoted", main: true, candidateIntent: true, rollbackIntent: false },
      phase: "armed",
      remaining: ["candidateIntent", "main"],
    },
    {
      state: { outcome: "promoted", main: true, candidateIntent: false, rollbackIntent: false },
      phase: "candidate-cleared",
      remaining: ["main"],
    },
    {
      state: { outcome: "promoted", main: false, candidateIntent: false, rollbackIntent: false },
      phase: "complete",
      remaining: [],
    },
  ];
  for (const fixture of prefixes) {
    const result = planHotfixTerminalCleanup(fixture.state);
    assert.equal(result.valid, true);
    assert.equal(result.phase, fixture.phase);
    assert.deepEqual(result.remainingClearOrder, fixture.remaining);
  }

  const validKeys = {
    restored: new Set(["111", "011", "001", "000"]),
    promoted: new Set(["110", "100", "000"]),
  };
  for (const outcome of Object.keys(validKeys)) {
    for (let bits = 0; bits < 8; bits += 1) {
      const key = bits.toString(2).padStart(3, "0");
      const result = planHotfixTerminalCleanup({
        outcome,
        main: key[0] === "1",
        candidateIntent: key[1] === "1",
        rollbackIntent: key[2] === "1",
      });
      assert.equal(result.valid, validKeys[outcome].has(key), `${outcome}:${key}`);
      if (!result.valid) assert.match(result.violations.join(","), /hotfix_terminal_cleanup_prefix_invalid/);
    }
  }
  assert.equal(
    planHotfixTerminalCleanup({
      outcome: "unknown",
      main: false,
      candidateIntent: false,
      rollbackIntent: false,
    }).valid,
    false,
  );
});
