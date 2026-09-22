import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  createReleaseCheckpoint,
  evaluateReleaseCheckpoints,
  validateReleaseCheckpointPolicy,
} from "./release-checkpoint-lib.mjs";
import { validateReleaseGateMatrix } from "./release-profile-lib.mjs";
import {
  readStagingDeployRecoveryJson,
  stagingDeployRecoveryCheckpointContext,
} from "./staging-deploy-recovery-state-lib.mjs";

const HEX_SHA256 = /^[a-f0-9]{64}$/;
const MAXIMUM_CONTROL_BYTES = 1024 * 1024;
const MAXIMUM_CHECKPOINT_BYTES = 1024 * 1024;
const REUSABLE_GATES = Object.freeze(["artifact-seal", "immutable-provenance"]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readStableBytes(path, maximumBytes, label) {
  const target = resolve(path);
  const metadata = await lstat(target);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`G12_STAGING_RELEASE_CHECKPOINT_${label}_TYPE_REFUSED`);
  }
  const handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = await handle.stat({ bigint: true });
    if (before.size < 2n || before.size > BigInt(maximumBytes)) {
      throw new Error(`G12_STAGING_RELEASE_CHECKPOINT_${label}_SIZE_REFUSED`);
    }
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ino !== after.ino ||
      before.dev !== after.dev ||
      BigInt(bytes.length) !== before.size
    ) {
      throw new Error(`G12_STAGING_RELEASE_CHECKPOINT_${label}_CHANGED`);
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    throw new Error(`G12_STAGING_RELEASE_CHECKPOINT_${label}_JSON_REFUSED`, { cause: error });
  }
}

export async function readStagingReleaseCheckpointControls({
  candidateMatrixPath,
  controlMatrixPath,
  candidatePolicyPath,
  controlPolicyPath,
  profile,
  expectedMatrixSha256 = "",
  expectedPolicySha256 = "",
}) {
  const [candidateMatrix, controlMatrix, candidatePolicy, controlPolicy] = await Promise.all([
    readStableBytes(candidateMatrixPath, MAXIMUM_CONTROL_BYTES, "CANDIDATE_MATRIX"),
    readStableBytes(controlMatrixPath, MAXIMUM_CONTROL_BYTES, "CONTROL_MATRIX"),
    readStableBytes(candidatePolicyPath, MAXIMUM_CONTROL_BYTES, "CANDIDATE_POLICY"),
    readStableBytes(controlPolicyPath, MAXIMUM_CONTROL_BYTES, "CONTROL_POLICY"),
  ]);
  if (!candidateMatrix.equals(controlMatrix) || !candidatePolicy.equals(controlPolicy)) {
    throw new Error("G12_STAGING_RELEASE_CHECKPOINT_CONTROL_BYTES_MISMATCH");
  }
  const matrix = parseJson(candidateMatrix, "MATRIX");
  const policy = parseJson(candidatePolicy, "POLICY");
  validateReleaseGateMatrix(matrix);
  validateReleaseCheckpointPolicy(policy);
  if (!Object.hasOwn(matrix.profiles, profile)) {
    throw new Error("G12_STAGING_RELEASE_CHECKPOINT_PROFILE_REFUSED");
  }
  const matrixSha256 = sha256(candidateMatrix);
  const policySha256 = sha256(candidatePolicy);
  if (
    (expectedMatrixSha256 &&
      (!HEX_SHA256.test(expectedMatrixSha256) || expectedMatrixSha256 !== matrixSha256)) ||
    (expectedPolicySha256 &&
      (!HEX_SHA256.test(expectedPolicySha256) || expectedPolicySha256 !== policySha256))
  ) {
    throw new Error("G12_STAGING_RELEASE_CHECKPOINT_CONTROL_DIGEST_MISMATCH");
  }
  return { matrix, policy, profile, matrixSha256, policySha256 };
}

export async function writeStagingReleaseCheckpoint({
  statePath,
  outputPath,
  controls,
  createdAt = new Date().toISOString(),
}) {
  const stateRead = await readStagingDeployRecoveryJson(statePath, "CHECKPOINT_STATE");
  const context = stagingDeployRecoveryCheckpointContext(stateRead.value, controls);
  const checkpoint = createReleaseCheckpoint({
    policy: controls.policy,
    context,
    createdAt,
    gateNames: [...REUSABLE_GATES],
  });
  const output = resolve(outputPath);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(checkpoint, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  return {
    checkpoint,
    context,
    checkpointSha256: sha256(await readStableBytes(output, MAXIMUM_CHECKPOINT_BYTES, "OUTPUT")),
  };
}

export async function verifyStagingReleaseCheckpoint({
  statePath,
  checkpointPath,
  controls,
  now = new Date().toISOString(),
}) {
  const [stateRead, checkpointBytes] = await Promise.all([
    readStagingDeployRecoveryJson(statePath, "CHECKPOINT_STATE"),
    readStableBytes(checkpointPath, MAXIMUM_CHECKPOINT_BYTES, "DOCUMENT"),
  ]);
  const checkpoint = parseJson(checkpointBytes, "DOCUMENT");
  const context = stagingDeployRecoveryCheckpointContext(stateRead.value, controls);
  const evaluation = evaluateReleaseCheckpoints({
    policy: controls.policy,
    checkpoint,
    context,
    now,
  });
  const gateNames = checkpoint.gates.map(({ name }) => name);
  const reusableNames = evaluation.reusable.map(({ name }) => name);
  if (
    JSON.stringify(gateNames) !== JSON.stringify(REUSABLE_GATES) ||
    JSON.stringify(reusableNames) !== JSON.stringify(REUSABLE_GATES) ||
    evaluation.rerun.length !== 0 ||
    evaluation.bindingMatches !== true ||
    evaluation.changedDependencies.length !== 0 ||
    evaluation.mutationGatesReused !== false
  ) {
    throw new Error("G12_STAGING_RELEASE_CHECKPOINT_REUSE_REFUSED");
  }
  return {
    checkpoint,
    context,
    evaluation,
    checkpointSha256: sha256(checkpointBytes),
    stateSha256: stateRead.identity.sha256,
  };
}

export const STAGING_RELEASE_CHECKPOINT_REUSABLE_GATES = REUSABLE_GATES;
