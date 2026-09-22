import assert from "node:assert/strict";
import test from "node:test";

import { verifyStagingRollbackDeployEvidence } from "./staging-rollback-deploy-evidence-lib.mjs";

const sha = "a".repeat(40);
const digest = `sha256:${"b".repeat(64)}`;
const artifact = (id) => ({ id: String(id), digest: `sha256:${String(id).padStart(64, "0")}` });
const evidence = {
  schemaVersion: 1,
  event: "g12.staging.artifacts.bound",
  candidateSha: sha,
  state: artifact(11),
  recovery: artifact(12),
  candidate: {
    id: "13",
    digest,
    archiveSha256: "c".repeat(64),
    treeSha256: "d".repeat(64),
  },
};
const expected = { candidateSha: sha, artifactId: "13", artifactDigest: digest };

test("accepts legacy and current bindings only for the exact candidate tuple", () => {
  const legacy = verifyStagingRollbackDeployEvidence({ evidence, expected });
  assert.equal(legacy.valid, true);
  assert.equal(legacy.archiveSha256, "c".repeat(64));
  const current = verifyStagingRollbackDeployEvidence({
    evidence: {
      ...evidence,
      validations: {
        preflight: artifact(21),
        source: artifact(22),
        liveBaseline: artifact(23),
      },
    },
    expected,
  });
  assert.equal(current.valid, true);
});

test("refuses artifact ID, digest and SHA substitutions", () => {
  for (const substituted of [
    { ...expected, candidateSha: "e".repeat(40) },
    { ...expected, artifactId: "14" },
    { ...expected, artifactDigest: `sha256:${"f".repeat(64)}` },
  ]) {
    const result = verifyStagingRollbackDeployEvidence({ evidence, expected: substituted });
    assert.equal(result.valid, false);
  }
});

test("refuses malformed archive/tree bindings and unexpected evidence fields", () => {
  for (const changed of [
    { ...evidence, candidate: { ...evidence.candidate, archiveSha256: "short" } },
    { ...evidence, candidate: { ...evidence.candidate, treeSha256: "short" } },
    { ...evidence, unbound: true },
  ]) {
    const result = verifyStagingRollbackDeployEvidence({ evidence: changed, expected });
    assert.equal(result.valid, false);
  }
});
