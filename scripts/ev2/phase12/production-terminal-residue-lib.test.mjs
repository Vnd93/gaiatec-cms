import assert from "node:assert/strict";
import test from "node:test";

import {
  NO_SYNTHETIC_ROUTE_CLASSIFICATION,
  TERMINAL_CLASSIFICATION,
  ZERO_OBSERVATION_FIELDS,
  assertProductionTerminalObservation,
  buildProductionTerminalResidueQuery,
  createProductionTerminalResidueReport,
  validateProductionTerminalInputs,
} from "./production-terminal-residue-lib.mjs";

const candidateSha = "a".repeat(40);
const actorId = "61000000-0000-4000-8000-000000000001";
const itemId = "61000000-0000-4000-8000-000000000105";
const runTag = "QA-CMS-FINAL-20260907-aaaaaaaa";
const path = "/qa-cms-final-gone-aaaaaaaa";

function validInput() {
  return {
    candidateSha,
    state: {
      schemaVersion: 1,
      status: "cleaned",
      environment: "production",
      expectedSha: candidateSha,
      runTag,
      actorId,
      itemIds: [itemId],
      terminalArchivedTombstone: { itemId },
    },
    cleanup: {
      schemaVersion: 1,
      status: "cleaned",
      environment: "production",
      candidateSha,
      runTag,
      activeResidue: 0,
      auditRetained: true,
      terminalArchivedTombstone: { ...TERMINAL_CLASSIFICATION },
    },
  };
}

function validObservation() {
  return {
    qa_actor_count: 5,
    terminal_tombstone_count: 1,
    retained_cleanup_audits: 2,
    ...Object.fromEntries(ZERO_OBSERVATION_FIELDS.map((field) => [field, 0])),
  };
}

function validRecoveryInput() {
  const input = validInput();
  input.state.terminalArchivedTombstone = null;
  input.cleanup.terminalArchivedTombstone = null;
  input.cleanup.terminalNoSyntheticRoute = { ...NO_SYNTHETIC_ROUTE_CLASSIFICATION };
  return { ...input, recoveryNoTombstone: true };
}

test("private state binds the designated gone page to the exact production run and SHA", () => {
  assert.deepEqual(validateProductionTerminalInputs(validInput()), {
    actorId,
    itemId,
    path,
    runTag,
    recoveryNoTombstone: false,
  });
  for (const mutate of [
    (input) => (input.state.terminalArchivedTombstone.path = path),
    (input) => (input.state.terminalArchivedTombstone.itemId = crypto.randomUUID()),
    (input) => (input.state.runTag = "QA-CMS-FINAL-20260907-bbbbbbbb"),
    (input) => (input.cleanup.runTag = "QA-CMS-FINAL-20260907-bbbbbbbb"),
    (input) => (input.cleanup.terminalArchivedTombstone.actionableOutboxCount = 1),
    (input) => (input.cleanup.terminalArchivedTombstone.piiExposed = true),
  ]) {
    const input = structuredClone(validInput());
    mutate(input);
    assert.throws(
      () => validateProductionTerminalInputs(input),
      /G12_PRODUCTION_RESIDUE_(?:STATE|CLEANUP_EVIDENCE)_REFUSED/,
    );
  }
});

test("failed-release recovery accepts only an explicit zero-route terminal state", () => {
  assert.deepEqual(validateProductionTerminalInputs(validRecoveryInput()), {
    actorId,
    itemId: null,
    path: null,
    runTag,
    recoveryNoTombstone: true,
  });
  assert.throws(
    () => validateProductionTerminalInputs({ ...validRecoveryInput(), recoveryNoTombstone: false }),
    /G12_PRODUCTION_RESIDUE_STATE_REFUSED/,
  );
  const recoveryWithTombstone = validRecoveryInput();
  recoveryWithTombstone.state.terminalArchivedTombstone = { itemId };
  assert.throws(
    () => validateProductionTerminalInputs(recoveryWithTombstone),
    /G12_PRODUCTION_RESIDUE_RECOVERY_STATE_REFUSED/,
  );
  const recoveryWithoutMarker = validRecoveryInput();
  delete recoveryWithoutMarker.cleanup.terminalNoSyntheticRoute;
  assert.throws(
    () => validateProductionTerminalInputs(recoveryWithoutMarker),
    /G12_PRODUCTION_RESIDUE_RECOVERY_EVIDENCE_REFUSED/,
  );
  const activeInputWithRecoveryMarker = validInput();
  activeInputWithRecoveryMarker.cleanup.terminalNoSyntheticRoute = {
    ...NO_SYNTHETIC_ROUTE_CLASSIFICATION,
  };
  assert.throws(
    () => validateProductionTerminalInputs(activeInputWithRecoveryMarker),
    /G12_PRODUCTION_RESIDUE_CLEANUP_EVIDENCE_REFUSED/,
  );
});

test("remote query proves the tombstone and every actionable surface from one bound actor set", () => {
  const binding = validateProductionTerminalInputs(validInput());
  const query = buildProductionTerminalResidueQuery(binding, candidateSha);
  assert.match(query, /private\.cms_qa_terminal_archived_tombstone_is_exact/);
  assert.match(query, /route\.source_path = '\/qa-cms-final-gone-aaaaaaaa'/);
  assert.match(query, /route\.id not in \(select id from terminal\)/);
  assert.match(query, /outbox\.status <> 'completed'/);
  assert.match(query, /document\.blob_disposition = 'available'/);
  assert.match(query, /actor\.banned_until is null or actor\.banned_until <= clock_timestamp\(\)/);
  assert.doesNotMatch(query, /example\.(?:com|invalid)|bearer|service_role/i);
});

test("one terminal tombstone is excluded but any other nonzero surface fails closed", () => {
  assert.doesNotThrow(() => assertProductionTerminalObservation(validObservation()));
  for (const [field, value] of [
    ["terminal_tombstone_count", 0],
    ["terminal_tombstone_count", 2],
    ["actionable_route_rules", 1],
    ["actionable_publication_outbox", 1],
    ["active_credentials", 1],
    ["active_documents", 1],
    ["retained_cleanup_audits", 0],
  ]) {
    assert.throws(
      () => assertProductionTerminalObservation({ ...validObservation(), [field]: value }),
      /G12_PRODUCTION_RESIDUE_REMOTE_CHECK_FAILED/,
    );
  }
});

test("recovery proves zero terminal routes and cannot be accepted as the active release state", () => {
  const observation = { ...validObservation(), terminal_tombstone_count: 0 };
  assert.doesNotThrow(() => assertProductionTerminalObservation(observation, { recoveryNoTombstone: true }));
  assert.throws(
    () => assertProductionTerminalObservation(observation),
    /G12_PRODUCTION_RESIDUE_REMOTE_CHECK_FAILED/,
  );
  const binding = validateProductionTerminalInputs(validRecoveryInput());
  const query = buildProductionTerminalResidueQuery(binding, candidateSha);
  assert.match(query, /terminal as materialized \([\s\S]*where false/);
  assert.doesNotMatch(query, /private\.cms_qa_terminal_archived_tombstone_is_exact/);
  assert.doesNotMatch(query, /qa-cms-final-gone-/);
  const report = createProductionTerminalResidueReport({
    candidateSha,
    runTag,
    observation,
    recoveryNoTombstone: true,
  });
  assert.equal(report.terminalArchivedTombstone, null);
  assert.deepEqual(report.terminalNoSyntheticRoute, NO_SYNTHETIC_ROUTE_CLASSIFICATION);
  assert.equal(report.identifiersOrPathsPersisted, false);
});

test("the evidence is sanitized and classifies only the intentional 410 terminal state", () => {
  const report = createProductionTerminalResidueReport({
    candidateSha,
    runTag,
    observation: validObservation(),
  });
  assert.deepEqual(report.terminalArchivedTombstone, TERMINAL_CLASSIFICATION);
  assert.equal(report.activeResidue, 0);
  assert.equal(report.status, "passed");
  assert.equal(report.runTag, runTag);
  assert.equal(report.identifiersOrPathsPersisted, false);
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, new RegExp(actorId, "i"));
  assert.doesNotMatch(serialized, new RegExp(itemId, "i"));
  assert.doesNotMatch(serialized, /qa-cms-final-gone-/i);
});
