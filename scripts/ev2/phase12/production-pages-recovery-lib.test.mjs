import assert from "node:assert/strict";
import test from "node:test";

import {
  bindProductionPagesOwnedDeployment,
  productionPagesRecoveryDecision,
} from "./production-pages-recovery-lib.mjs";

const baseline = {
  deploymentId: "00000000-0000-4000-8000-000000000001",
  release: "a".repeat(40),
  createdOn: "2026-09-07T10:00:00.000Z",
  commitMessage: "prior-production-release",
};
const owned = {
  deploymentId: "00000000-0000-4000-8000-000000000002",
  release: "b".repeat(40),
  runMarker: "g12-production-run-123456-2",
  createdOn: "2026-09-07T11:00:00.000Z",
};
const state = { baseline, owned };

test("production Pages recovery accepts only the exact baseline or owned candidate", () => {
  assert.equal(productionPagesRecoveryDecision(baseline, state), "already-baseline");
  assert.equal(
    productionPagesRecoveryDecision({ ...owned, commitMessage: owned.runMarker }, state),
    "restore-owned-candidate",
  );
});

test("marker-bound fallback identifies an owned candidate when the deploy output was lost", () => {
  const current = {
    ...owned,
    deploymentId: "00000000-0000-4000-8000-000000000099",
    commitMessage: owned.runMarker,
    createdOn: "2026-09-07T11:01:00.000Z",
  };
  const fallback = { baseline, owned: { release: owned.release, runMarker: owned.runMarker } };
  assert.equal(productionPagesRecoveryDecision(current, fallback), "restore-owned-candidate");
  assert.equal(
    bindProductionPagesOwnedDeployment(current, [current, { ...baseline, commitMessage: "old" }], fallback)
      .owned.deploymentId,
    current.deploymentId,
  );
});

test("marker fallback refuses duplicate ownership claims", () => {
  const current = { ...owned, commitMessage: owned.runMarker };
  const fallback = { baseline, owned: { release: owned.release, runMarker: owned.runMarker } };
  assert.throws(
    () =>
      bindProductionPagesOwnedDeployment(
        current,
        [current, { ...current, deploymentId: "00000000-0000-4000-8000-000000000098" }],
        fallback,
      ),
    /G12_PRODUCTION_PAGES_OWNERSHIP_AMBIGUOUS/,
  );
});

test("production Pages recovery preserves same-SHA and different-SHA external deployments", () => {
  for (const current of [
    { ...owned, deploymentId: "00000000-0000-4000-8000-000000000003", commitMessage: owned.runMarker },
    { ...owned, commitMessage: "external deployment" },
    {
      deploymentId: "00000000-0000-4000-8000-000000000004",
      release: "c".repeat(40),
      commitMessage: "external deployment",
      createdOn: "2026-09-07T12:00:00.000Z",
    },
  ])
    assert.equal(productionPagesRecoveryDecision(current, state), "external-conflict");
});

test("production Pages recovery rejects same-SHA replacements and timestamp substitutions", () => {
  for (const current of [
    { ...baseline, deploymentId: "00000000-0000-4000-8000-000000000009" },
    { ...baseline, createdOn: "2026-09-07T10:00:01.000Z" },
    { ...baseline, commitMessage: "external same-SHA redeploy" },
    { ...owned, createdOn: "2026-09-07T11:00:01.000Z", commitMessage: owned.runMarker },
  ])
    assert.equal(productionPagesRecoveryDecision(current, state), "external-conflict");
});

test("production Pages recovery refuses malformed immutable bindings", () => {
  assert.throws(
    () =>
      productionPagesRecoveryDecision(
        { ...owned, commitMessage: owned.runMarker },
        { baseline, owned: { ...owned, runMarker: "unbound" } },
      ),
    /G12_PRODUCTION_PAGES_STATE_REFUSED/,
  );
  assert.throws(
    () =>
      productionPagesRecoveryDecision({ ...owned, release: "short", commitMessage: owned.runMarker }, state),
    /G12_PRODUCTION_PAGES_CANONICAL_REFUSED/,
  );
});
