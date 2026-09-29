import { createHash } from "node:crypto";

import { canonicalSha256, functionInventorySnapshot } from "./staging-cms-public-hotfix-lib.mjs";
import { expectedStagingEdgePublicSecrets } from "./staging-edge-public-secrets-lib.mjs";
import {
  STAGING_AI_EXTERNAL_PROVIDER_ENABLED,
  STAGING_OPENROUTER_MODEL,
} from "./staging-ai-provider-secrets-lib.mjs";

const SHA256 = /^[a-f0-9]{64}$/;
const KINDS = ["public", "ai"];
const digest = (value) => createHash("sha256").update(value).digest("hex");
const same = (left, right) => canonicalSha256(left) === canonicalSha256(right);

function refuse(reason) {
  throw new Error(`G12_STAGING_EDGE_CONFIGURATION_${reason}_REFUSED`);
}

function exactKeys(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort())
  );
}

export function verifyConfigurationProof(kind, proof, candidateSha) {
  if (
    !proof ||
    proof.valuesDisclosed !== 0 ||
    proof.unmanagedSecretsPreserved !== true ||
    !Number.isSafeInteger(proof.unmanagedSecretCount) ||
    proof.unmanagedSecretCount < 0
  )
    refuse("SECRET_PROOF");
  if (kind === "public") {
    const expected = expectedStagingEdgePublicSecrets(candidateSha);
    if (
      !exactKeys(proof, [
        "event",
        "candidateSha",
        "configuredNames",
        "expectedDigests",
        "unmanagedSecretCount",
        "unmanagedSecretsPreserved",
        "valuesDisclosed",
      ]) ||
      proof.event !== "g12.staging.edge_public_secrets.verified" ||
      proof.candidateSha !== candidateSha ||
      !same(proof.configuredNames, Object.keys(expected)) ||
      !same(
        proof.expectedDigests,
        Object.fromEntries(Object.entries(expected).map(([key, value]) => [key, digest(value)])),
      )
    )
      refuse("PUBLIC_PROOF");
  } else if (kind === "ai") {
    if (
      !exactKeys(proof, [
        "event",
        "model",
        "modelDigest",
        "switchDigest",
        "apiKeyPreserved",
        "unmanagedSecretCount",
        "unmanagedSecretsPreserved",
        "valuesDisclosed",
      ]) ||
      proof.event !== "g12.staging.ai_provider_secrets.verified" ||
      proof.apiKeyPreserved !== true ||
      proof.model !== STAGING_OPENROUTER_MODEL ||
      proof.modelDigest !== digest(STAGING_OPENROUTER_MODEL) ||
      proof.switchDigest !== digest(STAGING_AI_EXTERNAL_PROVIDER_ENABLED)
    )
      refuse("AI_PROOF");
  } else refuse("KIND");
}

// Supabase secrets.set advanced all 34 versions by one, without changing any other
// tuple field, in run 36577142069. This is an exact authorized transition, not a
// permission to ignore version drift or accept arbitrary redeploys.
export function evaluateConfigurationVersionTransition(before, after) {
  const left = functionInventorySnapshot(before);
  const right = functionInventorySnapshot(after);
  const expected = left.records.map((record) => ({ ...record, version: record.version + 1 }));
  const valid = left.valid && right.valid && same(right.records, expected);
  return {
    valid,
    violations: valid ? [] : ["configuration_exact_version_transition_mismatch"],
    snapshot: right,
  };
}

export function verifyStagingEdgeConfigurationContext({ baseline, expected }) {
  const workflow = baseline?.manifest?.workflow;
  if (
    !expected ||
    !/^[a-f0-9]{40}$/.test(expected.candidateSha ?? "") ||
    expected.projectRef !== "glcqsosxwgmlhzgcsnzv" ||
    !/^[1-9]\d*$/.test(String(expected.workflow?.runId ?? "")) ||
    !Number.isSafeInteger(expected.workflow?.runAttempt) ||
    expected.workflow.runAttempt < 1 ||
    !/^[a-f0-9]{40}$/.test(expected.workflow?.controlSha ?? "") ||
    !workflow ||
    !same(workflow, expected.workflow) ||
    baseline?.manifest?.candidateSha !== expected.candidateSha ||
    baseline?.manifest?.projectRef !== expected.projectRef ||
    !SHA256.test(baseline?.manifestSha256 ?? "") ||
    !Array.isArray(baseline?.functions)
  )
    refuse("BINDING");
  const snapshot = functionInventorySnapshot(baseline.functions.map((record) => record.tuple));
  if (!snapshot.valid || snapshot.inventorySha256 !== baseline.manifest.inventorySha256) refuse("BASELINE");
  return snapshot;
}

export function verifyStagingEdgeConfigurationReceipt({ receipt, baseline, expected, requiredSteps = 2 }) {
  let previous = verifyStagingEdgeConfigurationContext({ baseline, expected });
  if (!Number.isSafeInteger(requiredSteps) || requiredSteps < 1 || requiredSteps > 2) refuse("BINDING");
  if (
    !exactKeys(receipt, [
      "schemaVersion",
      "event",
      "candidateSha",
      "projectRef",
      "workflow",
      "baselineManifestSha256",
      "steps",
    ]) ||
    receipt.schemaVersion !== 1 ||
    receipt.event !== "g12.staging.edge_configuration.version_bound" ||
    receipt.candidateSha !== expected.candidateSha ||
    receipt.projectRef !== expected.projectRef ||
    !same(receipt.workflow, expected.workflow) ||
    receipt.baselineManifestSha256 !== baseline.manifestSha256 ||
    !Array.isArray(receipt.steps) ||
    receipt.steps.length !== requiredSteps
  )
    refuse("RECEIPT");
  for (const [index, step] of receipt.steps.entries()) {
    if (
      !exactKeys(step, [
        "kind",
        "beforeInventorySha256",
        "afterInventorySha256",
        "records",
        "configurationProof",
      ]) ||
      step.kind !== KINDS[index] ||
      step.beforeInventorySha256 !== previous.inventorySha256
    )
      refuse("CHAIN");
    verifyConfigurationProof(step.kind, step.configurationProof, expected.candidateSha);
    const transition = evaluateConfigurationVersionTransition(previous.records, step.records);
    if (!transition.valid || transition.snapshot.inventorySha256 !== step.afterInventorySha256)
      refuse("TRANSITION");
    previous = transition.snapshot;
  }
  return previous;
}

export function appendStagingEdgeConfigurationReceipt({
  previous,
  baseline,
  expected,
  kind,
  before,
  after,
  proof,
}) {
  const index = KINDS.indexOf(kind);
  if (index < 0) refuse("KIND");
  const expectedBefore =
    index === 0
      ? verifyStagingEdgeConfigurationContext({ baseline, expected })
      : verifyStagingEdgeConfigurationReceipt({ receipt: previous, baseline, expected, requiredSteps: 1 });
  if (
    (index === 0 && previous !== undefined) ||
    !expectedBefore.valid ||
    functionInventorySnapshot(before).inventorySha256 !== expectedBefore.inventorySha256
  )
    refuse("PRESTATE");
  const transition = evaluateConfigurationVersionTransition(before, after);
  if (!transition.valid) refuse("TRANSITION");
  const receipt = {
    schemaVersion: 1,
    event: "g12.staging.edge_configuration.version_bound",
    ...expected,
    baselineManifestSha256: baseline.manifestSha256,
    steps: [
      ...(previous?.steps ?? []),
      {
        kind,
        beforeInventorySha256: expectedBefore.inventorySha256,
        afterInventorySha256: transition.snapshot.inventorySha256,
        records: transition.snapshot.records,
        configurationProof: proof,
      },
    ],
  };
  verifyStagingEdgeConfigurationReceipt({ receipt, baseline, expected, requiredSteps: index + 1 });
  return receipt;
}
