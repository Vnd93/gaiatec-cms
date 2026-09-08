import assert from "node:assert/strict";
import test from "node:test";

import {
  OUTPUT_KEYS,
  PRODUCTION_PROJECT_REF,
  materializeCmsTerminalState,
} from "./materialize-cms-terminal-state.mjs";

const candidateSha = "a".repeat(40);
const actorId = "61000000-0000-4000-8000-000000000001";
const itemId = "61000000-0000-4000-8000-000000000105";

function state() {
  return {
    schemaVersion: 1,
    status: "cleaned",
    environment: "production",
    projectRef: PRODUCTION_PROJECT_REF,
    expectedSha: candidateSha,
    runTag: "QA-CMS-FINAL-20260907-aaaaaaaa",
    actorId,
    itemIds: [itemId],
    terminalArchivedTombstone: { itemId },
    leadCampaignPath: "/campanhas/private-path-must-not-escape",
    leadReference: "LD-PRIVATE",
    documentIds: ["62000000-0000-4000-8000-000000000001"],
    accidentalCredential: "must-not-escape",
  };
}

test("terminal state keeps only the exact cleanup bindings required by the successful finalizer", () => {
  const result = materializeCmsTerminalState(state(), candidateSha);
  assert.deepEqual(Object.keys(result).sort(), OUTPUT_KEYS);
  assert.deepEqual(result.terminalArchivedTombstone, { itemId });
  assert.deepEqual(result.itemIds, [itemId]);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /private-path|LD-PRIVATE|must-not-escape|lead|document/i);
  assert.doesNotMatch(serialized, /\/(?:campanhas|qa-cms-final-gone)-/i);
  assert.doesNotMatch(serialized, /@/);
});

test("terminal state fails closed on an unclean, cross-environment or identifiable tombstone", () => {
  for (const mutate of [
    (value) => (value.status = "ready"),
    (value) => (value.environment = "staging"),
    (value) => (value.projectRef = "aaaaaaaaaaaaaaaaaaaa"),
    (value) => (value.expectedSha = "b".repeat(40)),
    (value) => (value.runTag = "QA-CMS-FINAL-20260907-bbbbbbbb"),
    (value) => value.itemIds.push(itemId),
    (value) => (value.terminalArchivedTombstone.itemId = crypto.randomUUID()),
    (value) => (value.terminalArchivedTombstone.path = "/qa-cms-final-gone-aaaaaaaa"),
  ]) {
    const value = structuredClone(state());
    mutate(value);
    assert.throws(
      () => materializeCmsTerminalState(value, candidateSha),
      /QA_CMS_TERMINAL_STATE_BINDING_REFUSED/,
    );
  }
});
