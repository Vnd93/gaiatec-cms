import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyFunctionDeploymentOutput,
  deployWithVerifiedCompensation,
  evaluateCandidateFunctionDeployment,
  evaluateFunctionDeploymentReceipt,
  evaluateKnownFunctionInventory,
  mergeFunctionDeploymentOutcome,
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

test("candidate verification requires exact remote digest and a proven deploy outcome", () => {
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
    deploymentOutcomes: { known: "deployed" },
  });
  assert.equal(result.valid, true);
  assert.equal(result.deployments[0].bundleSha256, "b".repeat(64));

  const missingOutcome = evaluateCandidateFunctionDeployment({
    beforePayload: before,
    afterPayload: after,
    managedFunctions: ["known"],
    publicFunctions: new Set(),
    candidateSourceDigests: { known: "c".repeat(64) },
    baselineSourceDigests: { known: "d".repeat(64) },
  });
  assert.match(missingOutcome.violations.join(","), /deployment_outcome_invalid/);

  const stale = evaluateCandidateFunctionDeployment({
    beforePayload: before,
    afterPayload: before,
    managedFunctions: ["known"],
    publicFunctions: new Set(),
    candidateSourceDigests: { known: "c".repeat(64) },
    baselineSourceDigests: { known: "d".repeat(64) },
    deploymentOutcomes: { known: "deployed" },
  });
  assert.equal(stale.valid, false);
  assert.match(stale.violations.join(","), /version_not_advanced/);

  const idempotentRecovery = evaluateCandidateFunctionDeployment({
    beforePayload: before,
    afterPayload: before,
    managedFunctions: ["known"],
    publicFunctions: new Set(),
    candidateSourceDigests: { known: "c".repeat(64) },
    baselineSourceDigests: { known: "d".repeat(64) },
    deploymentOutcomes: { known: "no-change" },
  });
  assert.equal(
    idempotentRecovery.valid,
    true,
    "the pinned CLI no-change outcome makes an already-live candidate retryable",
  );

  const digestChangedWithoutVersion = evaluateCandidateFunctionDeployment({
    beforePayload: before,
    afterPayload: [{ ...before[0], ezbr_sha256: "b".repeat(64) }],
    managedFunctions: ["known"],
    publicFunctions: new Set(),
    candidateSourceDigests: { known: "c".repeat(64) },
    baselineSourceDigests: { known: "d".repeat(64) },
    deploymentOutcomes: { known: "no-change" },
  });
  assert.match(digestChangedWithoutVersion.violations.join(","), /bundle_changed_without_version/);

  const stickyDeployedOutcome = mergeFunctionDeploymentOutcome("deployed", "no-change");
  assert.equal(stickyDeployedOutcome, "deployed");
  const retryAfterPartialAdvance = evaluateCandidateFunctionDeployment({
    beforePayload: before,
    afterPayload: after,
    managedFunctions: ["known"],
    publicFunctions: new Set(),
    candidateSourceDigests: { known: "c".repeat(64) },
    baselineSourceDigests: { known: "d".repeat(64) },
    deploymentOutcomes: { known: stickyDeployedOutcome },
  });
  assert.equal(
    retryAfterPartialAdvance.valid,
    true,
    "compensation can confirm a version advanced by the first partial deployment pass",
  );

  const unprovenConcurrentAdvance = evaluateCandidateFunctionDeployment({
    beforePayload: before,
    afterPayload: after,
    managedFunctions: ["known"],
    publicFunctions: new Set(),
    candidateSourceDigests: { known: "c".repeat(64) },
    baselineSourceDigests: { known: "d".repeat(64) },
    deploymentOutcomes: { known: "no-change" },
  });
  assert.match(unprovenConcurrentAdvance.violations.join(","), /no_change_version_advanced/);

  const skippedVersion = evaluateCandidateFunctionDeployment({
    beforePayload: before,
    afterPayload: [{ ...after[0], version: 5 }],
    managedFunctions: ["known"],
    publicFunctions: new Set(),
    candidateSourceDigests: { known: "c".repeat(64) },
    baselineSourceDigests: { known: "d".repeat(64) },
    deploymentOutcomes: { known: "deployed" },
  });
  assert.match(skippedVersion.violations.join(","), /version_advance_invalid/);
});

test("function deployment output classification is exact and fail-closed", () => {
  const common = {
    name: "cms-ai",
    projectRef: "glcqsosxwgmlhzgcsnzv",
  };
  assert.equal(
    classifyFunctionDeploymentOutput({
      ...common,
      stdout: "Deployed Functions on project glcqsosxwgmlhzgcsnzv: cms-ai\n",
      stderr: "No change found in Function: cms-ai\n",
    }),
    "no-change",
  );
  assert.equal(
    classifyFunctionDeploymentOutput({
      ...common,
      stdout: "Deployed Functions on project glcqsosxwgmlhzgcsnzv: cms-ai\n",
      stderr: "",
    }),
    "deployed",
  );
  assert.equal(mergeFunctionDeploymentOutcome(undefined, "no-change"), "no-change");
  assert.equal(mergeFunctionDeploymentOutcome("no-change", "deployed"), "deployed");
  assert.equal(mergeFunctionDeploymentOutcome("deployed", "no-change"), "deployed");
  assert.throws(() => mergeFunctionDeploymentOutcome("unknown", "no-change"), /OUTCOME_INVALID/);
  assert.throws(
    () => classifyFunctionDeploymentOutput({ ...common, stdout: "deployment accepted\n", stderr: "" }),
    /G12_FUNCTION_DEPLOY_OUTPUT_UNCONFIRMED/,
  );
  assert.throws(
    () =>
      classifyFunctionDeploymentOutput({
        ...common,
        stdout: "Deployed Functions on project glcqsosxwgmlhzgcsnzv: cms-ai-rogue\n",
        stderr: "No change found in Function: cms-ai-rogue\n",
      }),
    /G12_FUNCTION_DEPLOY_OUTPUT_UNCONFIRMED/,
  );
  assert.equal(
    classifyFunctionDeploymentOutput({
      ...common,
      stdout: "Deployed Functions on project glcqsosxwgmlhzgcsnzv: cms-ai\n",
      stderr: "warning only\n",
    }),
    "deployed",
  );
});

test("numeric Supabase management timestamps are normalized before verification", () => {
  const before = [
    {
      name: "known",
      status: "ACTIVE",
      version: 3,
      verify_jwt: true,
      ezbr_sha256: "a".repeat(64),
      updated_at: 1788932414142,
    },
  ];
  const result = evaluateCandidateFunctionDeployment({
    beforePayload: before,
    afterPayload: before,
    managedFunctions: ["known"],
    publicFunctions: new Set(),
    candidateSourceDigests: { known: "c".repeat(64) },
    baselineSourceDigests: { known: "d".repeat(64) },
    deploymentOutcomes: { known: "no-change" },
  });
  assert.equal(result.valid, true);
  assert.match(result.deployments[0].updatedAt, /^2026-09-09T/);

  for (const invalidTimestamp of [0, 123, "123", "1999-12-31T23:59:59Z", "not-a-date"]) {
    const invalid = evaluateCandidateFunctionDeployment({
      beforePayload: [{ ...before[0], updated_at: invalidTimestamp }],
      afterPayload: [{ ...before[0], updated_at: invalidTimestamp }],
      managedFunctions: ["known"],
      publicFunctions: new Set(),
      candidateSourceDigests: { known: "c".repeat(64) },
      baselineSourceDigests: { known: "d".repeat(64) },
      deploymentOutcomes: { known: "no-change" },
    });
    assert.match(invalid.violations.join(","), /updated_at_invalid/);
  }
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
