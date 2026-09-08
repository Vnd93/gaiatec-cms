import assert from "node:assert/strict";
import test from "node:test";

import { buildProductionMutationMarker } from "./production-mutation-marker-lib.mjs";
import {
  sameProductionMutationMarkerVariable,
  sealProductionMutationMarkerVariable,
  verifyProductionMutationMarkerVariable,
} from "./production-mutation-marker-store-lib.mjs";

const key = "9".repeat(64);
const marker = buildProductionMutationMarker({
  candidateSha: "a".repeat(40),
  baselineDeploymentId: "11111111-1111-4111-8111-111111111111",
  baselineRelease: "a".repeat(40),
  baselineCreatedOn: "2026-09-07T11:00:00.000Z",
  baselineCommitMessage: "g12-production-bridge-run-654321-1",
  bridgeRunId: "654321",
  bridgeRunAttempt: 1,
  bridgeControlSha: "e".repeat(40),
  bridgeEvidenceArtifactId: "991",
  bridgeEvidenceArtifactDigest: `sha256:${"1".repeat(64)}`,
  bridgeDistArtifactId: "992",
  bridgeDistArtifactDigest: `sha256:${"2".repeat(64)}`,
  bridgeDeploymentId: "11111111-1111-4111-8111-111111111111",
  bridgeRelease: "a".repeat(40),
  bridgeCreatedOn: "2026-09-07T11:00:00.000Z",
  bridgeCommitMessage: "g12-production-bridge-run-654321-1",
  bridgePredecessorDeploymentId: "11111111-1111-4111-8111-111111111112",
  bridgePredecessorRelease: "b".repeat(40),
  bridgePredecessorCreatedOn: "2026-09-06T11:00:00.000Z",
  bridgePredecessorCommitMessage: "prior production",
  approvalRecord: `.github/release-controls/approvals/G12_${"a".repeat(40)}.json`,
  approvalSha256: "c".repeat(64),
  approvedRollbackRelease: "b".repeat(40),
  changeReference: "CHG-FINAL",
  repository: "Vnd93/gaiatec-cms",
  controlSha: "d".repeat(40),
  runId: "123456",
  runAttempt: 2,
  armedAt: "2026-09-07T12:00:00.000Z",
});

function sealed() {
  return sealProductionMutationMarkerVariable(
    {
      marker,
      artifactId: "998877",
      artifactDigest: "e".repeat(64),
      artifactName: "production-mutation-123456-2",
    },
    key,
  );
}

test("redundant marker seals exact run, artifact and marker bytes with HMAC", () => {
  const wrapper = sealed();
  const result = verifyProductionMutationMarkerVariable(wrapper, key, {
    runId: "123456",
    runAttempt: 2,
    controlSha: "d".repeat(40),
  });
  assert.equal(result.valid, true);
  assert.equal(wrapper.artifact.digest, `sha256:${"e".repeat(64)}`);
  assert.equal(sameProductionMutationMarkerVariable(wrapper, structuredClone(wrapper)), true);
});

test("substitution of marker, artifact, run or HMAC is rejected", () => {
  for (const wrapper of [
    { ...sealed(), hmacSha256: "0".repeat(64) },
    { ...sealed(), artifact: { ...sealed().artifact, id: "1" } },
    { ...sealed(), marker: { ...marker, candidateSha: "f".repeat(40) } },
  ])
    assert.equal(
      verifyProductionMutationMarkerVariable(wrapper, key, {
        runId: "123456",
        runAttempt: 2,
        controlSha: "d".repeat(40),
      }).valid,
      false,
    );
  assert.match(
    verifyProductionMutationMarkerVariable(sealed(), key, { runId: "654321" }).violations.join(","),
    /marker_run_id_mismatch/,
  );
  assert.equal(verifyProductionMutationMarkerVariable(null, key).valid, false);
});
