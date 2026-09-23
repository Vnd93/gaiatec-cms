import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildStagingDeployRecoveryState } from "./staging-deploy-recovery-state-lib.mjs";
import {
  readStagingReleaseCheckpointControls,
  verifyStagingReleaseCheckpoint,
  writeStagingReleaseCheckpoint,
} from "./staging-release-checkpoint-lib.mjs";

const candidateSha = "a".repeat(40);
const controlSha = "b".repeat(40);
const matrixSource = new URL("../../../.github/release-controls/release-gate-matrix.json", import.meta.url);
const policySource = new URL(
  "../../../.github/release-controls/release-checkpoint-policy.json",
  import.meta.url,
);

function state() {
  return buildStagingDeployRecoveryState({
    workflow: { runId: "35347256421", attempt: 2, controlSha },
    candidateRelease: candidateSha,
    original: {
      deploymentId: "123e4567-e89b-42d3-a456-426614174000",
      release: candidateSha,
      createdOn: "2026-09-22T10:00:00.000Z",
      commitMessage: "g12-staging-bridge-run-35347256420-1",
    },
    source: {
      ciRunId: "35347256000",
      ciRunAttempt: 1,
      gateCiRunAttempt: 2,
      artifactId: "987654321",
      digest: `sha256:${"c".repeat(64)}`,
      name: `staging-frontend-${candidateSha}-35347256000-1`,
      profileSha256: "d".repeat(64),
    },
    dist: {
      archiveSha256: "e".repeat(64),
      treeSha256: "f".repeat(64),
      archiveBytes: 1234,
      fileCount: 8,
      byteCount: 900,
    },
    recoveryArtifact: {
      id: "777777777",
      digest: `sha256:${"1".repeat(64)}`,
      name: "staging-recovery-35347256421-2",
    },
    environmentSnapshot: {
      file: "outputs/staging-remote-environment-snapshot.json",
      sha256: "2".repeat(64),
    },
    edgeBaseline: {
      manifestFile: "edge-baseline/manifest.json",
      manifestSha256: "3".repeat(64),
      inventorySha256: "4".repeat(64),
      functionCount: 34,
      aggregateBytes: 4096,
      aggregateRawEszipBytes: 8192,
    },
    browserRecovery: {
      environment: "staging",
      runTag: `QA-CMS-FINAL-20260922-${candidateSha.slice(0, 8)}`,
    },
  });
}

async function fixture(root) {
  const paths = {
    candidateMatrix: join(root, "candidate-matrix.json"),
    controlMatrix: join(root, "control-matrix.json"),
    candidatePolicy: join(root, "candidate-policy.json"),
    controlPolicy: join(root, "control-policy.json"),
    state: join(root, "staging-deploy-state.json"),
    checkpoint: join(root, "staging-release-checkpoint.json"),
  };
  const [matrixBytes, policyBytes] = await Promise.all([readFile(matrixSource), readFile(policySource)]);
  await Promise.all([
    writeFile(paths.candidateMatrix, matrixBytes),
    writeFile(paths.controlMatrix, matrixBytes),
    writeFile(paths.candidatePolicy, policyBytes),
    writeFile(paths.controlPolicy, policyBytes),
    writeFile(paths.state, `${JSON.stringify(state(), null, 2)}\n`),
  ]);
  const controls = await readStagingReleaseCheckpointControls({
    candidateMatrixPath: paths.candidateMatrix,
    controlMatrixPath: paths.controlMatrix,
    candidatePolicyPath: paths.candidatePolicy,
    controlPolicyPath: paths.controlPolicy,
    profile: "full-release",
  });
  return { paths, controls };
}

test("state v4 produces a durable full-context checkpoint with only two reusable artifact gates", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "g12-staging-checkpoint-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const { paths, controls } = await fixture(root);
  const written = await writeStagingReleaseCheckpoint({
    statePath: paths.state,
    outputPath: paths.checkpoint,
    controls,
    createdAt: "2026-09-22T11:00:00.000Z",
  });
  assert.deepEqual(
    written.checkpoint.gates.map(({ name }) => name),
    ["artifact-seal", "immutable-provenance"],
  );
  assert.equal(written.checkpoint.binding.artifact.id, "987654321");
  assert.equal(written.checkpoint.binding.artifact.gateCiRunAttempt, 2);
  assert.equal(written.checkpoint.binding.deployment.id, state().original.deploymentId);
  assert.equal(written.checkpoint.binding.environment.snapshotSha256, state().environmentSnapshot.sha256);
  assert.equal(
    written.checkpoint.binding.environment.edgeBaselineManifestSha256,
    state().edgeBaseline.manifestSha256,
  );
  const verified = await verifyStagingReleaseCheckpoint({
    statePath: paths.state,
    checkpointPath: paths.checkpoint,
    controls,
    now: "2026-09-22T12:00:00.000Z",
  });
  assert.equal(verified.evaluation.bindingMatches, true);
  assert.deepEqual(verified.evaluation.rerun, []);
  assert.equal(verified.evaluation.mutationGatesReused, false);
});

test("state, artifact, deployment and snapshot drift invalidate the checkpoint", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "g12-staging-checkpoint-drift-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const { paths, controls } = await fixture(root);
  await writeStagingReleaseCheckpoint({
    statePath: paths.state,
    outputPath: paths.checkpoint,
    controls,
    createdAt: "2026-09-22T11:00:00.000Z",
  });
  for (const mutate of [
    (value) => (value.source.artifactId = "987654322"),
    (value) => (value.source.digest = `sha256:${"9".repeat(64)}`),
    (value) => (value.source.gateCiRunAttempt = 3),
    (value) => (value.dist.archiveSha256 = "9".repeat(64)),
    (value) => (value.dist.treeSha256 = "9".repeat(64)),
    (value) => (value.original.deploymentId = "223e4567-e89b-42d3-a456-426614174000"),
    (value) => (value.environmentSnapshot.sha256 = "9".repeat(64)),
    (value) => (value.edgeBaseline.manifestSha256 = "9".repeat(64)),
  ]) {
    const changed = state();
    mutate(changed);
    await writeFile(paths.state, `${JSON.stringify(changed, null, 2)}\n`);
    await assert.rejects(
      () =>
        verifyStagingReleaseCheckpoint({
          statePath: paths.state,
          checkpointPath: paths.checkpoint,
          controls,
          now: "2026-09-22T12:00:00.000Z",
        }),
      /REUSE_REFUSED/u,
    );
  }
});

test("candidate and control policy bytes must match exactly", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "g12-staging-checkpoint-controls-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const { paths } = await fixture(root);
  await writeFile(paths.candidatePolicy, `${await readFile(paths.candidatePolicy, "utf8")}\n`);
  await assert.rejects(
    () =>
      readStagingReleaseCheckpointControls({
        candidateMatrixPath: paths.candidateMatrix,
        controlMatrixPath: paths.controlMatrix,
        candidatePolicyPath: paths.candidatePolicy,
        controlPolicyPath: paths.controlPolicy,
        profile: "full-release",
      }),
    /CONTROL_BYTES_MISMATCH/u,
  );
});

test("checkpoint extra keys and symlink substitutions fail closed", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "g12-staging-checkpoint-adversarial-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const { paths, controls } = await fixture(root);
  await writeStagingReleaseCheckpoint({
    statePath: paths.state,
    outputPath: paths.checkpoint,
    controls,
    createdAt: "2026-09-22T11:00:00.000Z",
  });
  const value = JSON.parse(await readFile(paths.checkpoint, "utf8"));
  await writeFile(paths.checkpoint, `${JSON.stringify({ ...value, unsafe: true }, null, 2)}\n`);
  await assert.rejects(
    () =>
      verifyStagingReleaseCheckpoint({
        statePath: paths.state,
        checkpointPath: paths.checkpoint,
        controls,
        now: "2026-09-22T12:00:00.000Z",
      }),
    /document is invalid/u,
  );
  const outside = join(root, "outside.json");
  await writeFile(outside, `${JSON.stringify(value, null, 2)}\n`);
  await rm(paths.checkpoint);
  try {
    await symlink(outside, paths.checkpoint, "file");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) {
      context.skip(`symlinks unavailable: ${error.code}`);
      return;
    }
    throw error;
  }
  await assert.rejects(
    () =>
      verifyStagingReleaseCheckpoint({
        statePath: paths.state,
        checkpointPath: paths.checkpoint,
        controls,
        now: "2026-09-22T12:00:00.000Z",
      }),
    /DOCUMENT_TYPE_REFUSED/u,
  );
});
