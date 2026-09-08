import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProductionTerminalEvidence,
  productionOutboxTerminalPassed,
  productionResidueTerminalPassed,
} from "./production-terminal-evidence-lib.mjs";

function fixture(outcome = "active") {
  return {
    outcome,
    candidateSha: "a".repeat(40),
    controlSha: "b".repeat(40),
    runId: "1234567",
    runAttempt: "1",
    pagesRelease: outcome === "active" ? "a".repeat(40) : "c".repeat(40),
    baselineRelease: "c".repeat(40),
    markerArtifactId: "101",
    markerArtifactDigest: `sha256:${"d".repeat(64)}`,
    releaseArtifactId: outcome === "active" ? "102" : "",
    releaseArtifactDigest: outcome === "active" ? `sha256:${"e".repeat(64)}` : "",
    backendArtifactId: outcome === "active" ? "103" : "",
    backendArtifactDigest: outcome === "active" ? `sha256:${"f".repeat(64)}` : "",
    checks: Array.from({ length: 9 }, (_, index) => ({ name: `check-${index}`, passed: true })),
  };
}

test("terminal evidence binds active artifacts and all remote checks", () => {
  const evidence = buildProductionTerminalEvidence(fixture());
  assert.equal(evidence.outcome, "active");
  assert.equal(evidence.artifacts.releaseEvidence.id, "102");
  assert.equal(evidence.checks.length, 9);
});

test("recovered terminal evidence accepts either readiness or a strong real canary", () => {
  const candidateSha = "a".repeat(40);
  const readiness = {
    event: "g12.production.outbox_cache_readiness.verified",
    candidateSha,
    cacheInvalidationCredentialReady: true,
    realCanaryNotApplicable: true,
    terminalNoSyntheticRoute: {
      classification: "terminalNoSyntheticRoute",
      count: 0,
      activeRouteRules: 0,
      identifiersOrPathsPersisted: false,
    },
  };
  const canary = {
    event: "g12.production.outbox_cache_canary.verified",
    candidateSha,
    syntheticOnly: true,
    eventCount: 3,
    completedCount: 3,
    failedCount: 0,
    cacheInvalidationProvenByWorkerCompletion: true,
    terminalNoSyntheticRoute: readiness.terminalNoSyntheticRoute,
  };
  const activeCanary = { ...canary };
  delete activeCanary.terminalNoSyntheticRoute;
  assert.equal(productionOutboxTerminalPassed(readiness, candidateSha, "recovered"), true);
  assert.equal(productionOutboxTerminalPassed(canary, candidateSha, "recovered"), true);
  assert.equal(productionOutboxTerminalPassed(activeCanary, candidateSha, "active"), true);
  assert.equal(productionOutboxTerminalPassed(readiness, candidateSha, "active"), false);
  assert.equal(
    productionOutboxTerminalPassed(
      { ...canary, terminalNoSyntheticRoute: undefined },
      candidateSha,
      "active",
    ),
    false,
  );
  for (const invalid of [
    { ...canary, candidateSha: "b".repeat(40) },
    { ...canary, completedCount: 2 },
    { ...canary, syntheticOnly: false },
    { ...readiness, realCanaryNotApplicable: false },
  ])
    assert.equal(productionOutboxTerminalPassed(invalid, candidateSha, "recovered"), false);
});

test("active and recovered residue classifications cannot substitute for each other", () => {
  const candidateSha = "a".repeat(40);
  const tombstone = {
    classification: "terminalArchivedTombstone",
    count: 1,
    statusCode: 410,
    destinationAbsent: true,
    itemArchived: true,
    publicationCount: 0,
    projectionCount: 0,
    actionableOutboxCount: 0,
    piiExposed: false,
  };
  const noRoute = {
    classification: "terminalNoSyntheticRoute",
    count: 0,
    activeRouteRules: 0,
    identifiersOrPathsPersisted: false,
  };
  const common = {
    event: "g12.production.synthetic_residue.verified",
    status: "passed",
    environment: "production",
    candidateSha,
    runTag: "QA-CMS-FINAL-20260907-aaaaaaaa",
    activeResidue: 0,
    activeLeases: 0,
    activeSessions: 0,
    actionableRouteRules: 0,
    actionablePublicationOutbox: 0,
    auditRetained: true,
    identifiersOrPathsPersisted: false,
  };
  const active = { ...common, terminalArchivedTombstone: tombstone };
  const recovered = {
    ...common,
    terminalArchivedTombstone: null,
    terminalNoSyntheticRoute: noRoute,
  };
  assert.equal(productionResidueTerminalPassed(active, candidateSha, "active"), true);
  assert.equal(productionResidueTerminalPassed(recovered, candidateSha, "recovered"), true);
  assert.equal(productionResidueTerminalPassed(active, candidateSha, "recovered"), false);
  assert.equal(productionResidueTerminalPassed(recovered, candidateSha, "active"), false);
  assert.equal(
    productionResidueTerminalPassed(
      { ...active, runTag: "QA-CMS-FINAL-20260907-bbbbbbbb" },
      candidateSha,
      "active",
    ),
    false,
  );
  assert.equal(
    productionResidueTerminalPassed({ ...active, status: "failed" }, candidateSha, "active"),
    false,
  );
});

test("recovery evidence requires baseline Pages and omits unavailable success artifacts", () => {
  const evidence = buildProductionTerminalEvidence(fixture("recovered"));
  assert.equal(evidence.pagesRelease, "c".repeat(40));
  assert.equal(evidence.artifacts.releaseEvidence, null);
  assert.throws(
    () => buildProductionTerminalEvidence({ ...fixture("recovered"), pagesRelease: "a".repeat(40) }),
    /PAGES_MISMATCH/,
  );
});
