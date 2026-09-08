import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProductionMutationMarker,
  validateProductionMutationMarker,
} from "./production-mutation-marker-lib.mjs";

function fixture() {
  const candidateSha = "a".repeat(40);
  return buildProductionMutationMarker({
    candidateSha,
    baselineDeploymentId: "00000000-0000-4000-8000-000000000001",
    baselineRelease: candidateSha,
    baselineCreatedOn: "2026-09-07T11:30:00.000Z",
    baselineCommitMessage: "g12-production-bridge-run-7654321-1",
    bridgeRunId: "7654321",
    bridgeRunAttempt: 1,
    bridgeControlSha: "e".repeat(40),
    bridgeEvidenceArtifactId: "901",
    bridgeEvidenceArtifactDigest: `sha256:${"1".repeat(64)}`,
    bridgeDistArtifactId: "902",
    bridgeDistArtifactDigest: `sha256:${"2".repeat(64)}`,
    bridgeDeploymentId: "00000000-0000-4000-8000-000000000001",
    bridgeRelease: candidateSha,
    bridgeCreatedOn: "2026-09-07T11:30:00.000Z",
    bridgeCommitMessage: "g12-production-bridge-run-7654321-1",
    bridgePredecessorDeploymentId: "00000000-0000-4000-8000-000000000002",
    bridgePredecessorRelease: "b".repeat(40),
    bridgePredecessorCreatedOn: "2026-09-06T11:30:00.000Z",
    bridgePredecessorCommitMessage: "prior-production-release",
    approvalRecord: `.github/release-controls/approvals/G12_${candidateSha}.json`,
    approvalSha256: "c".repeat(64),
    approvedRollbackRelease: "b".repeat(40),
    changeReference: "CMS-FINAL-2026-09",
    repository: "Vnd93/gaiatec-cms",
    controlSha: "d".repeat(40),
    runId: "1234567",
    runAttempt: "2",
    armedAt: "2026-09-07T12:00:00Z",
  });
}

test("durable mutation marker binds candidate, approval, baseline and workflow attempt", () => {
  const marker = fixture();
  assert.equal(
    validateProductionMutationMarker(marker, {
      runId: "1234567",
      runAttempt: "2",
      controlSha: "d".repeat(40),
    }).valid,
    true,
  );
  assert.equal(marker.pages.runMarker, "g12-production-run-1234567-2");
  assert.equal(marker.baseline.createdOn, "2026-09-07T11:30:00.000Z");
  assert.equal(marker.baseline.commitMessage, "g12-production-bridge-run-7654321-1");
  assert.equal(marker.approval.authorizedPredecessorRelease, "b".repeat(40));
});

test("mutation marker rejects substituted baseline, candidate and workflow identity", () => {
  for (const mutation of [
    (value) => (value.candidateSha = "e".repeat(40)),
    (value) => (value.baseline.release = "e".repeat(40)),
    (value) => (value.bridge.production.deploymentId = "00000000-0000-4000-8000-000000000099"),
    (value) => (value.bridge.predecessor.release = value.candidateSha),
    (value) => (value.approval.authorizedPredecessorRelease = value.candidateSha),
    (value) => (value.baseline.createdOn = "not-a-date"),
    (value) => (value.baseline.commitMessage = "forged\noutput"),
    (value) => (value.github.controlSha = "e".repeat(40)),
    (value) => (value.pages.runMarker = "g12-production-run-1234567-3"),
  ]) {
    const marker = structuredClone(fixture());
    mutation(marker);
    assert.equal(
      validateProductionMutationMarker(marker, {
        runId: "1234567",
        runAttempt: "2",
        controlSha: "d".repeat(40),
      }).valid,
      false,
    );
  }
});
