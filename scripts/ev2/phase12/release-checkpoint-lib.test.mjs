import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  RELEASE_CHECKPOINT_NEVER_REUSABLE,
  createReleaseCheckpoint,
  evaluateReleaseCheckpoints,
  validateReleaseCheckpointPolicy,
} from "./release-checkpoint-lib.mjs";

const policy = JSON.parse(
  await readFile(
    new URL("../../../.github/release-controls/release-checkpoint-policy.json", import.meta.url),
    "utf8",
  ),
);
const context = {
  profile: "full-release",
  matrixSha256: "f".repeat(64),
  policySha256: "1".repeat(64),
  candidateSha: "a".repeat(40),
  artifact: {
    id: "123",
    digest: `sha256:${"b".repeat(64)}`,
    archiveSha256: "c".repeat(64),
    treeSha256: "d".repeat(64),
    gateCiRunAttempt: 2,
  },
  deployment: { id: "123e4567-e89b-42d3-a456-426614174000" },
  environment: {
    snapshotSha256: "e".repeat(64),
    edgeBaselineManifestSha256: "6".repeat(64),
  },
};

function checkpoint(overrides = {}) {
  return {
    ...createReleaseCheckpoint({
      policy,
      context,
      createdAt: "2026-09-22T11:00:00.000Z",
      gateNames: ["artifact-seal", "immutable-provenance"],
    }),
    ...overrides,
  };
}

test("policy allows only pure source/artifact gates and marks every state-dependent gate never reusable", () => {
  assert.doesNotThrow(() => validateReleaseCheckpointPolicy(policy));
  assert.deepEqual(Object.keys(policy.reusableGates), ["artifact-seal", "immutable-provenance"]);
  for (const name of RELEASE_CHECKPOINT_NEVER_REUSABLE) {
    assert.ok(policy.neverReusable.includes(name));
    assert.equal(policy.reusableGates[name], undefined);
  }
  for (const name of ["browser-headless", "edge-runtime-smoke", "rls", "mfa-aal2"]) {
    assert.ok(policy.neverReusable.includes(name));
  }
  const unsafe = structuredClone(policy);
  unsafe.reusableGates["read-only-postdeploy"] = {
    dependencies: ["source", "artifact", "deployment", "environment"],
    maximumAgeSeconds: 60,
  };
  assert.throws(() => validateReleaseCheckpointPolicy(unsafe), /allowlist/u);
});

test("full-context checkpoint reuses only exact artifact seal and provenance", () => {
  const value = checkpoint();
  const result = evaluateReleaseCheckpoints({
    policy,
    checkpoint: value,
    context,
    now: "2026-09-22T12:00:00.000Z",
  });
  assert.equal(value.schemaVersion, 2);
  assert.equal(result.bindingMatches, true);
  assert.deepEqual(result.changedDependencies, []);
  assert.deepEqual(
    result.reusable.map(({ name }) => name),
    ["artifact-seal", "immutable-provenance"],
  );
  assert.deepEqual(result.rerun, []);
  assert.equal(result.mutationGatesReused, false);
});

test("candidate and every artifact identity change invalidates both reusable gates", () => {
  for (const [label, mutate] of [
    ["source", (value) => (value.candidateSha = "9".repeat(40))],
    ["artifact", (value) => (value.artifact.id = "999")],
    ["artifact", (value) => (value.artifact.digest = `sha256:${"9".repeat(64)}`)],
    ["artifact", (value) => (value.artifact.archiveSha256 = "9".repeat(64))],
    ["artifact", (value) => (value.artifact.treeSha256 = "9".repeat(64))],
    ["artifact", (value) => (value.artifact.gateCiRunAttempt = 3)],
  ]) {
    const changed = structuredClone(context);
    mutate(changed);
    const result = evaluateReleaseCheckpoints({
      policy,
      checkpoint: checkpoint(),
      context: changed,
      now: "2026-09-22T12:00:00.000Z",
    });
    assert.equal(result.bindingMatches, false);
    assert.ok(result.changedDependencies.includes(label));
    assert.deepEqual(result.rerun, [
      { name: "artifact-seal", reason: `${label}_changed` },
      { name: "immutable-provenance", reason: `${label}_changed` },
    ]);
  }
});

test("live deployment or environment drift invalidates the full binding even though no state gate is reusable", () => {
  for (const [dependency, mutate] of [
    ["deployment", (value) => (value.deployment.id = "223e4567-e89b-42d3-a456-426614174000")],
    ["environment", (value) => (value.environment.snapshotSha256 = "9".repeat(64))],
    ["environment", (value) => (value.environment.edgeBaselineManifestSha256 = "9".repeat(64))],
  ]) {
    const changed = structuredClone(context);
    mutate(changed);
    const result = evaluateReleaseCheckpoints({
      policy,
      checkpoint: checkpoint(),
      context: changed,
      now: "2026-09-22T12:00:00.000Z",
    });
    assert.equal(result.bindingMatches, false);
    assert.deepEqual(result.changedDependencies, [dependency]);
    assert.deepEqual(result.rerun, []);
    assert.equal(result.mutationGatesReused, false);
  }
});

test("profile, matrix and policy changes rerun every checkpoint gate", () => {
  for (const [mutate, reason] of [
    [(value) => (value.profile = "frontend-only"), "profile_changed"],
    [(value) => (value.matrixSha256 = "2".repeat(64)), "release_controls_changed"],
    [(value) => (value.policySha256 = "3".repeat(64)), "release_controls_changed"],
  ]) {
    const changed = structuredClone(context);
    mutate(changed);
    const result = evaluateReleaseCheckpoints({
      policy,
      checkpoint: checkpoint(),
      context: changed,
      now: "2026-09-22T12:00:00.000Z",
    });
    assert.deepEqual(result.rerun, [
      { name: "artifact-seal", reason },
      { name: "immutable-provenance", reason },
    ]);
  }
});

test("malformed bindings, duplicate gates and expired records fail closed", () => {
  const malformed = checkpoint();
  malformed.gates[0].bindings.artifactId = "999";
  assert.throws(
    () =>
      evaluateReleaseCheckpoints({
        policy,
        checkpoint: malformed,
        context,
        now: "2026-09-22T12:00:00.000Z",
      }),
    /stored context/u,
  );
  const duplicated = checkpoint();
  duplicated.gates.push(structuredClone(duplicated.gates[0]));
  assert.throws(
    () =>
      evaluateReleaseCheckpoints({
        policy,
        checkpoint: duplicated,
        context,
        now: "2026-09-22T12:00:00.000Z",
      }),
    /duplicated/u,
  );
  const expired = checkpoint();
  expired.gates[0].expiresAt = "2026-09-22T11:30:00.000Z";
  const result = evaluateReleaseCheckpoints({
    policy,
    checkpoint: expired,
    context,
    now: "2026-09-22T12:00:00.000Z",
  });
  assert.deepEqual(result.rerun[0], {
    name: "artifact-seal",
    reason: "checkpoint_expired_or_unsuccessful",
  });
});
