import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateStagingCandidateArtifact,
  normalizeStagingArtifactDigest,
} from "./staging-artifact-resolution-lib.mjs";

const candidateSha = "a".repeat(40);
const runId = "34000214001";
const runAttempt = 2;
const artifactId = "900000001";
const artifactDigest = `sha256:${"b".repeat(64)}`;
const expected = { candidateSha, runId, runAttempt, artifactId, artifactDigest };
const run = {
  id: Number(runId),
  run_attempt: runAttempt,
  status: "completed",
  conclusion: "success",
  event: "workflow_dispatch",
  head_branch: "main",
  head_sha: "c".repeat(40),
  path: ".github/workflows/deploy-staging.yml",
  head_repository: { full_name: "Vnd93/gaiatec-cms" },
};
const artifact = {
  id: Number(artifactId),
  name: `staging-candidate-${candidateSha}-${runId}-${runAttempt}`,
  expired: false,
  digest: artifactDigest,
  size_in_bytes: 1024,
  expires_at: "2030-01-01T00:00:00.000Z",
  workflow_run: { id: Number(runId) },
};

test("staging candidate resolver binds successful deploy run, artifact ID, digest and SHA", () => {
  const result = evaluateStagingCandidateArtifact({
    run,
    artifacts: [artifact],
    expected,
    now: Date.parse("2026-09-07T00:00:00.000Z"),
  });
  assert.equal(result.valid, true);
  assert.equal(normalizeStagingArtifactDigest("b".repeat(64)), artifactDigest);
});

test("staging candidate resolver rejects adversarial substitutions", () => {
  const cases = [
    { run: { ...run, conclusion: "failure" }, artifacts: [artifact], expected },
    { run: { ...run, path: ".github/workflows/rollback-staging.yml" }, artifacts: [artifact], expected },
    { run, artifacts: [{ ...artifact, name: `staging-candidate-${"d".repeat(40)}-${runId}-2` }], expected },
    { run, artifacts: [{ ...artifact, digest: `sha256:${"e".repeat(64)}` }], expected },
    { run, artifacts: [{ ...artifact, workflow_run: { id: 99 } }], expected },
    { run, artifacts: [{ ...artifact, expired: true }], expected },
    { run, artifacts: [artifact], expected: { ...expected, runAttempt: 3 } },
  ];
  for (const value of cases)
    assert.equal(
      evaluateStagingCandidateArtifact({
        ...value,
        now: Date.parse("2026-09-07T00:00:00.000Z"),
      }).valid,
      false,
    );
});
