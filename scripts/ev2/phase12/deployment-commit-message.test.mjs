import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  DEPLOYMENT_COMMIT_MESSAGE_MAX_BYTES,
  decodeDeploymentCommitMessage,
  encodeDeploymentCommitMessage,
  isDeploymentCommitMessage,
} from "./deployment-commit-message.mjs";
import { productionFrontendBridgeDecision } from "./production-frontend-bridge-pages-state.mjs";
import {
  productionPagesRecoveryDecision,
  sameProductionPagesDeployment,
} from "./production-pages-recovery-lib.mjs";
import {
  sameStagingDeployment,
  selectCurrentStagingBranchDeployment,
  stagingReconcileDecision,
} from "./staging-pages-state.mjs";

const read = (path) => readFile(new URL(`../../../${path}`, import.meta.url), "utf8");
const uuid = "123e4567-e89b-42d3-a456-426614174000";
const sha = "a".repeat(40);
const multiline = "release subject\r\n\r\nBody com acentuação e Unicode 🌎\r\nCo-authored-by: QA";

test("deployment commit-message transport round-trips LF, CRLF, Unicode and hostile one-line syntax", () => {
  for (const value of [
    "",
    "subject\n\nbody",
    multiline,
    "commit_message=forged::notice::still-data",
    "delimiter\nEOF\nname=value",
  ]) {
    const encoded = encodeDeploymentCommitMessage(value);
    assert.match(encoded, /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);
    assert.doesNotMatch(encoded, /[\r\n\0]/);
    assert.equal(decodeDeploymentCommitMessage(encoded), value);
  }
});

test("deployment commit-message transport rejects noncanonical Base64, NUL, lone surrogates and oversize", () => {
  for (const encoded of ["YQ", "YQ===", "Y Q==", "YQ==\n", "/w=="])
    assert.throws(() => decodeDeploymentCommitMessage(encoded), /ENCODING_REFUSED/);
  for (const value of [
    "nul\0byte",
    "lone-high-\ud800",
    "lone-low-\udc00",
    "x".repeat(DEPLOYMENT_COMMIT_MESSAGE_MAX_BYTES + 1),
  ]) {
    assert.equal(isDeploymentCommitMessage(value), false);
    assert.throws(() => encodeDeploymentCommitMessage(value), /COMMIT_MESSAGE_REFUSED/);
  }
});

test("the newest staging branch deployment retains its exact multiline commit identity", () => {
  const older = {
    id: "123e4567-e89b-42d3-a456-426614174001",
    environment: "preview",
    created_on: "2026-09-08T10:00:00.000Z",
    url: "https://older.pages.dev",
    deployment_trigger: {
      metadata: { branch: "ev2-g17-canary", commit_hash: "b".repeat(40), commit_message: "older" },
    },
  };
  const newest = {
    id: uuid,
    environment: "preview",
    created_on: "2026-09-08T11:00:00.000Z",
    url: "https://newest.pages.dev",
    deployment_trigger: {
      metadata: { branch: "ev2-g17-canary", commit_hash: sha, commit_message: multiline },
    },
  };
  const selected = selectCurrentStagingBranchDeployment([older, newest]);
  assert.equal(selected.deploymentId, uuid);
  assert.equal(selected.commitMessage, multiline);
  assert.throws(
    () =>
      selectCurrentStagingBranchDeployment([
        older,
        {
          ...newest,
          deployment_trigger: {
            metadata: { ...newest.deployment_trigger.metadata, commit_message: "invalid\0newest" },
          },
        },
      ]),
    /BRANCH_DEPLOYMENT_REFUSED/,
  );
});

test("staging and production CAS preserve CRLF exactly and reject newline normalization", () => {
  const baseline = {
    deploymentId: uuid,
    release: sha,
    createdOn: "2026-09-08T11:00:00.000Z",
    commitMessage: multiline,
  };
  const normalized = { ...baseline, commitMessage: multiline.replaceAll("\r\n", "\n") };
  assert.equal(sameStagingDeployment(baseline, { ...baseline }), true);
  assert.equal(sameStagingDeployment(baseline, normalized), false);
  assert.equal(sameProductionPagesDeployment(baseline, { ...baseline }), true);
  assert.equal(sameProductionPagesDeployment(baseline, normalized), false);
  const productionState = {
    baseline,
    owned: { release: "b".repeat(40), runMarker: "g12-production-run-1-1" },
  };
  assert.equal(productionPagesRecoveryDecision(baseline, productionState), "already-baseline");
  assert.equal(productionPagesRecoveryDecision(normalized, productionState), "external-conflict");

  const stagingState = {
    originalDeployment: baseline.deploymentId,
    originalRelease: baseline.release,
    originalCreatedOn: baseline.createdOn,
    originalCommitMessage: baseline.commitMessage,
    candidateRelease: "b".repeat(40),
    runMarker: "g12-staging-run-1-1",
    compensationMarker: "g12-staging-deploy-compensation-1-1",
  };
  assert.equal(stagingReconcileDecision(baseline, stagingState), "already-original");
  assert.equal(stagingReconcileDecision(normalized, stagingState), "external-conflict");

  const bridgeState = {
    baseline,
    candidateRelease: "b".repeat(40),
    runMarker: "g12-production-bridge-run-1-1",
    compensationMarker: "g12-production-bridge-compensation-1-1",
  };
  assert.equal(productionFrontendBridgeDecision(baseline, bridgeState), "already-predecessor");
  assert.equal(productionFrontendBridgeDecision(normalized, bridgeState), "external-conflict");
});

test("all release workflows and output producers use only explicit Base64 commit-message boundaries", async () => {
  const workflowPaths = [
    ".github/workflows/deploy-staging.yml",
    ".github/workflows/deploy-staging-watchdog.yml",
    ".github/workflows/promote-staging-frontend-bridge.yml",
    ".github/workflows/promote-staging-frontend-bridge-watchdog.yml",
    ".github/workflows/rollback-staging.yml",
    ".github/workflows/rollback-staging-watchdog.yml",
    ".github/workflows/deploy-production.yml",
    ".github/workflows/finalize-production-deploy.yml",
    ".github/workflows/promote-production-frontend-bridge.yml",
    ".github/workflows/promote-production-frontend-bridge-watchdog.yml",
    ".github/workflows/rollback-production.yml",
    ".github/workflows/rollback-production-watchdog.yml",
  ];
  const workflows = await Promise.all(workflowPaths.map(read));
  const rawEnvironment =
    /\b(?:STAGING_ORIGINAL|ORIGINAL|BASELINE|PRODUCTION|PRODUCTION_BRIDGE_BASELINE|BRIDGE|BRIDGE_PREDECESSOR|CLOUDFLARE_BASELINE|CLOUDFLARE_EXPECTED_CURRENT)_COMMIT_MESSAGE\b/;
  for (const [index, workflow] of workflows.entries()) {
    assert.doesNotMatch(workflow, rawEnvironment, workflowPaths[index]);
    assert.doesNotMatch(
      workflow,
      /outputs\.(?:commit_message|original_commit_message|canonical_commit_message|baseline_commit_message|production_commit_message|predecessor_commit_message|bridge_commit_message)\b/,
      workflowPaths[index],
    );
    assert.doesNotMatch(workflow, /--expected-canonical-marker(?:\s|["'])/, workflowPaths[index]);
    assert.doesNotMatch(workflow, /grep '\^commit_message='/, workflowPaths[index]);
  }

  const producerPaths = [
    "scripts/ev2/phase12/staging-pages-state.mjs",
    "scripts/ev2/phase12/cloudflare-pages.mjs",
    "scripts/ev2/phase12/deploy-sealed-staging-dist.mjs",
    "scripts/ev2/phase12/deploy-sealed-production-dist.mjs",
    "scripts/ev2/phase12/production-frontend-bridge-pages-state.mjs",
    "scripts/ev2/phase12/read-production-frontend-bridge-state.mjs",
    "scripts/ev2/phase12/read-production-mutation-marker.mjs",
    "scripts/ev2/phase12/verify-production-frontend-bridge-evidence.mjs",
    "scripts/ev2/phase12/verify-staging-frontend-bridge-evidence.mjs",
  ];
  const producers = await Promise.all(producerPaths.map(read));
  for (const [index, producer] of producers.entries()) {
    assert.doesNotMatch(producer, /`[a-z_-]*commit[_-]message=/, producerPaths[index]);
    assert.match(
      producer,
      /(?:commit[_-]message|deployment[_-]marker|canonical[_-]marker)[_-]b64/,
      producerPaths[index],
    );
  }
});
