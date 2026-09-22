import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { classifyStagingRollbackBaseline } from "./staging-rollback-baseline-source-lib.mjs";

const sha = "a".repeat(40);
const deployment = {
  deploymentId: "00000000-0000-4000-8000-000000000001",
  release: sha,
  createdOn: "2026-09-22T11:05:24.028Z",
  commitMessage: "g12-staging-run-35720047261-2",
};

async function record() {
  return JSON.parse(await readFile(".github/release-controls/staging-baseline-bootstrap.json", "utf8"));
}

test("classifies an exact deploy producer tuple from the canonical marker", async () => {
  assert.deepEqual(classifyStagingRollbackBaseline({ record: await record(), deployment }), {
    valid: true,
    mode: "deploy-v4",
    runId: "35720047261",
    runAttempt: 2,
    violations: [],
  });
});

test("classifies bridge and compensation producers without accepting rollback markers", async () => {
  const bootstrap = await record();
  assert.equal(
    classifyStagingRollbackBaseline({
      record: bootstrap,
      deployment: { ...deployment, commitMessage: "g12-staging-bridge-run-35718428183-1" },
    }).mode,
    "bridge-v5",
  );
  assert.equal(
    classifyStagingRollbackBaseline({
      record: bootstrap,
      deployment: { ...deployment, commitMessage: "g12-staging-deploy-compensation-35718428183-3" },
    }).mode,
    "deploy-compensation",
  );
  const refused = classifyStagingRollbackBaseline({
    record: bootstrap,
    deployment: { ...deployment, commitMessage: "g12-staging-rollback-35718428183-1" },
  });
  assert.equal(refused.valid, false);
  assert.deepEqual(refused.violations, ["deployment_producer_marker_invalid"]);
});

test("accepts bootstrap only for the exact immutable deployment identity", async () => {
  const bootstrap = await record();
  const exact = classifyStagingRollbackBaseline({
    record: bootstrap,
    deployment: {
      deploymentId: bootstrap.canonical.deploymentId,
      release: bootstrap.candidateSha,
      createdOn: bootstrap.canonical.createdOn,
      commitMessage: bootstrap.canonical.commitMessage,
    },
  });
  assert.equal(exact.mode, "bootstrap");
  const substituted = classifyStagingRollbackBaseline({
    record: bootstrap,
    deployment: {
      deploymentId: "00000000-0000-4000-8000-000000000099",
      release: bootstrap.candidateSha,
      createdOn: bootstrap.canonical.createdOn,
      commitMessage: bootstrap.canonical.commitMessage,
    },
  });
  assert.equal(substituted.valid, true);
  assert.equal(substituted.mode, "bridge-v5");
  assert.notEqual(substituted.mode, "bootstrap");
});

test("rejects malformed deployment identities before producer resolution", async () => {
  const result = classifyStagingRollbackBaseline({
    record: await record(),
    deployment: { ...deployment, release: "short", createdOn: "not-a-date" },
  });
  assert.equal(result.valid, false);
  assert.ok(result.violations.includes("deployment_identity_invalid"));
});
