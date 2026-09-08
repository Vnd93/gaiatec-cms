import assert from "node:assert/strict";
import test from "node:test";

import {
  deployWithVerifiedCompensation,
  evaluateCandidateFunctionDeployment,
  evaluateFunctionDeploymentReceipt,
  evaluateKnownFunctionInventory,
} from "./production-function-deployment-lib.mjs";

test("function deployment completes and verifies without compensation", () => {
  const events = [];
  deployWithVerifiedCompensation({
    names: ["one", "two"],
    deployOne: (name) => events.push(`deploy:${name}`),
    verifyCandidate: () => events.push("verify"),
    restoreBaseline: () => events.push("restore"),
  });
  assert.deepEqual(events, ["deploy:one", "deploy:two", "verify"]);
});

test("partial deployment restores the baseline and still fails the release", () => {
  const events = [];
  assert.throws(
    () =>
      deployWithVerifiedCompensation({
        names: ["one", "two", "three"],
        deployOne: (name) => {
          events.push(`deploy:${name}`);
          if (name === "two") throw new Error("remote failure");
        },
        verifyCandidate: () => events.push("verify"),
        restoreBaseline: () => events.push("restore"),
      }),
    /G12_PRODUCTION_FUNCTION_DEPLOY_FAILED_COMPENSATED:two/,
  );
  assert.deepEqual(events, ["deploy:one", "deploy:two", "restore"]);
});

test("failed final verification is compensated", () => {
  const events = [];
  assert.throws(
    () =>
      deployWithVerifiedCompensation({
        names: ["one"],
        deployOne: (name) => events.push(`deploy:${name}`),
        verifyCandidate: () => {
          events.push("verify");
          throw new Error("inventory mismatch");
        },
        restoreBaseline: () => events.push("restore"),
      }),
    /G12_PRODUCTION_FUNCTION_DEPLOY_FAILED_COMPENSATED:verification/,
  );
  assert.deepEqual(events, ["deploy:one", "verify", "restore"]);
});

test("failed compensation is explicit and never reported as a safe rollback", () => {
  assert.throws(
    () =>
      deployWithVerifiedCompensation({
        names: ["one"],
        deployOne: () => {
          throw new Error("deploy failed");
        },
        verifyCandidate: () => undefined,
        restoreBaseline: () => {
          throw new Error("restore failed");
        },
      }),
    /G12_PRODUCTION_FUNCTION_COMPENSATION_FAILED:one:restore_failed/,
  );
});

test("staging uses the same compensation primitive with an environment-specific failure", () => {
  assert.throws(
    () =>
      deployWithVerifiedCompensation({
        names: ["one"],
        deployOne: () => {
          throw new Error("deploy failed");
        },
        verifyCandidate: () => undefined,
        restoreBaseline: () => undefined,
        errorPrefix: "G12_STAGING_FUNCTION",
      }),
    /G12_STAGING_FUNCTION_DEPLOY_FAILED_COMPENSATED:one/,
  );
});

test("live preflight rejects unmanaged, inactive and invalid JWT mode records", () => {
  const result = evaluateKnownFunctionInventory(
    [
      { name: "known", status: "INACTIVE", version: 0, verify_jwt: false },
      { name: "unknown", status: "ACTIVE", version: 1, verify_jwt: true },
    ],
    ["known"],
    new Set(),
  );
  assert.equal(result.valid, false);
  assert.match(result.violations.join(","), /known:inactive/);
  assert.match(result.violations.join(","), /known:version_invalid/);
  assert.match(result.violations.join(","), /known:verify_jwt_invalid/);
  assert.match(result.violations.join(","), /unknown:unmanaged/);
});

test("candidate verification requires exact remote digest and monotonic version advancement", () => {
  const before = [
    {
      name: "known",
      status: "ACTIVE",
      version: 3,
      verify_jwt: true,
      ezbr_sha256: "a".repeat(64),
      updated_at: "2026-09-07T12:00:00Z",
    },
  ];
  const after = [
    {
      ...before[0],
      version: 4,
      ezbr_sha256: "b".repeat(64),
      updated_at: "2026-09-07T12:01:00Z",
    },
  ];
  const result = evaluateCandidateFunctionDeployment({
    beforePayload: before,
    afterPayload: after,
    managedFunctions: ["known"],
    publicFunctions: new Set(),
    candidateSourceDigests: { known: "c".repeat(64) },
    baselineSourceDigests: { known: "d".repeat(64) },
  });
  assert.equal(result.valid, true);
  assert.equal(result.deployments[0].bundleSha256, "b".repeat(64));

  const stale = evaluateCandidateFunctionDeployment({
    beforePayload: before,
    afterPayload: before,
    managedFunctions: ["known"],
    publicFunctions: new Set(),
    candidateSourceDigests: { known: "c".repeat(64) },
    baselineSourceDigests: { known: "d".repeat(64) },
  });
  assert.equal(stale.valid, false);
  assert.match(stale.violations.join(","), /version_not_advanced/);

  const idempotentRecovery = evaluateCandidateFunctionDeployment({
    beforePayload: before,
    afterPayload: [{ ...before[0], version: 4, updated_at: "2026-09-07T12:01:00Z" }],
    managedFunctions: ["known"],
    publicFunctions: new Set(),
    candidateSourceDigests: { known: "c".repeat(64) },
    baselineSourceDigests: { known: "d".repeat(64) },
  });
  assert.equal(
    idempotentRecovery.valid,
    true,
    "a deterministic redeploy of an already-live candidate remains recoverable when its version advances",
  );
});

test("live inventory must match the immutable candidate receipt by source, bundle and version", () => {
  const live = [
    {
      name: "known",
      status: "ACTIVE",
      version: 4,
      verify_jwt: true,
      ezbr_sha256: "b".repeat(64),
      updated_at: "2026-09-07T12:01:00Z",
    },
  ];
  const receipt = {
    schemaVersion: 1,
    event: "g12.production.functions.deployment_verified",
    candidateSha: "e".repeat(40),
    deployments: [
      {
        name: "known",
        sourceSha256: "c".repeat(64),
        bundleSha256: "b".repeat(64),
        version: 4,
      },
    ],
  };
  assert.equal(
    evaluateFunctionDeploymentReceipt({
      receipt,
      livePayload: live,
      sourceDigests: { known: "c".repeat(64) },
      release: "e".repeat(40),
    }).valid,
    true,
  );
  const stale = evaluateFunctionDeploymentReceipt({
    receipt,
    livePayload: [{ ...live[0], version: 3 }],
    sourceDigests: { known: "c".repeat(64) },
    release: "e".repeat(40),
  });
  assert.match(stale.violations.join(","), /live_version_mismatch/);

  const duplicateReceipt = {
    ...receipt,
    deployments: [receipt.deployments[0], receipt.deployments[0]],
  };
  const duplicate = evaluateFunctionDeploymentReceipt({
    receipt: duplicateReceipt,
    livePayload: live,
    sourceDigests: { known: "c".repeat(64), missing: "d".repeat(64) },
    release: "e".repeat(40),
  });
  assert.equal(duplicate.valid, false);
  assert.match(duplicate.violations.join(","), /known:receipt_duplicate/);
  assert.match(duplicate.violations.join(","), /missing:receipt_missing/);

  const stagingReceipt = {
    ...receipt,
    event: "g12.staging.functions.deployment_verified",
    projectRef: "glcqsosxwgmlhzgcsnzv",
  };
  assert.equal(
    evaluateFunctionDeploymentReceipt({
      receipt: stagingReceipt,
      livePayload: live,
      sourceDigests: { known: "c".repeat(64) },
      release: "e".repeat(40),
      environment: "staging",
      projectRef: "glcqsosxwgmlhzgcsnzv",
    }).valid,
    true,
  );
  assert.match(
    evaluateFunctionDeploymentReceipt({
      receipt: stagingReceipt,
      livePayload: live,
      sourceDigests: { known: "c".repeat(64) },
      release: "e".repeat(40),
      environment: "staging",
      projectRef: "chfuhctnhqgyjowkvllv",
    }).violations.join(","),
    /receipt_project_mismatch/,
  );
});
