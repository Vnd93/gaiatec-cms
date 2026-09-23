import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFile, mkdtemp, mkdir, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { sealProductionDistArchive } from "./production-dist-seal-lib.mjs";

const SCRIPT = resolve("scripts/ev2/phase12/verify-staging-legacy-bootstrap-compensation.mjs");
const CANDIDATE = "a".repeat(40);
const RUN_ID = "40000000002";
const RUN_ATTEMPT = 1;

async function fixture(context) {
  const root = await mkdtemp(join(tmpdir(), "g12-legacy-bootstrap-test-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const stateArtifact = join(root, "state");
  const recoveryArtifact = join(root, "recovery");
  const dist = join(recoveryArtifact, "dist");
  const outputs = join(recoveryArtifact, "outputs");
  const ephemeral = join(root, "ephemeral");
  await Promise.all([
    mkdir(stateArtifact),
    mkdir(dist, { recursive: true }),
    mkdir(outputs, { recursive: true }),
    mkdir(ephemeral),
  ]);
  await mkdir(join(dist, "assets"));
  await writeFile(join(dist, "assets", "app.js"), "console.log('legacy baseline')");
  await writeFile(
    join(dist, "release-manifest.json"),
    JSON.stringify({ schemaVersion: 1, release: CANDIDATE }),
  );
  const archive = join(outputs, "staging-baseline-dist.tar");
  const seal = await sealProductionDistArchive(dist, archive, CANDIDATE);
  const sealPath = join(outputs, "staging-baseline-dist-seal.json");
  await writeFile(sealPath, JSON.stringify(seal));

  const bridgeRunId = "40000000001";
  const canonical = {
    deploymentId: "00000000-0000-4000-8000-000000000001",
    createdOn: "2026-09-22T12:00:00.000Z",
    commitMessage: `g12-staging-bridge-run-${bridgeRunId}-1`,
  };
  const record = {
    schemaVersion: 1,
    event: "g12.staging.baseline.bootstrap",
    repository: "Vnd93/gaiatec-cms",
    candidateSha: CANDIDATE,
    canonical,
    bridge: {
      runId: bridgeRunId,
      runAttempt: 1,
      controlSha: CANDIDATE,
      artifactId: "50000000001",
      artifactDigest: `sha256:${"b".repeat(64)}`,
      artifactName: `staging-frontend-bridge-${CANDIDATE}`,
      evidenceSha256: "c".repeat(64),
    },
    source: {
      runId: RUN_ID,
      runAttempt: RUN_ATTEMPT,
      controlSha: CANDIDATE,
      artifactId: "50000000002",
      artifactDigest: `sha256:${"d".repeat(64)}`,
      artifactName: `staging-candidate-${CANDIDATE}-${RUN_ID}-${RUN_ATTEMPT}`,
      sealFile: "staging-candidate-dist-seal.json",
      archiveFile: "staging-candidate-dist.tar",
      sealSha256: "e".repeat(64),
    },
    dist: {
      archiveSha256: seal.archiveSha256,
      treeSha256: seal.treeSha256,
      archiveBytes: seal.archiveBytes,
      fileCount: seal.fileCount,
      byteCount: seal.byteCount,
    },
  };
  const recordPath = join(root, "record.json");
  await writeFile(recordPath, JSON.stringify(record));
  const state = {
    schemaVersion: 1,
    event: "g12.staging.deploy.prepared",
    workflow: { runId: RUN_ID, runAttempt: RUN_ATTEMPT, controlSha: CANDIDATE },
    project: "gaiatec-cms-staging",
    branch: "ev2-g17-canary",
    runMarker: `g12-staging-run-${RUN_ID}-${RUN_ATTEMPT}`,
    compensationMarker: `g12-staging-deploy-compensation-${RUN_ID}-${RUN_ATTEMPT}`,
    candidateRelease: CANDIDATE,
    original: { ...canonical, release: CANDIDATE },
  };
  const statePath = join(stateArtifact, "staging-deploy-state.json");
  await writeFile(statePath, JSON.stringify(state));
  return {
    root,
    record,
    recordPath,
    state,
    statePath,
    stateArtifact,
    recoveryArtifact,
    dist,
    outputs,
    archive,
    seal,
    sealPath,
    ephemeral,
  };
}

function run(paths, overrides = {}) {
  const values = {
    record: paths.recordPath,
    "state-artifact-dir": paths.stateArtifact,
    "recovery-artifact-dir": paths.recoveryArtifact,
    "candidate-sha": CANDIDATE,
    "control-sha": CANDIDATE,
    "run-id": RUN_ID,
    "run-attempt": String(RUN_ATTEMPT),
    "state-artifact-id": "60000000001",
    "state-artifact-digest": `sha256:${"f".repeat(64)}`,
    "state-artifact-name": `staging-deploy-state-${RUN_ID}-${RUN_ATTEMPT}`,
    "recovery-artifact-id": "60000000002",
    "recovery-artifact-digest": `sha256:${"1".repeat(64)}`,
    "recovery-artifact-name": `staging-recovery-${RUN_ID}-${RUN_ATTEMPT}`,
    ...overrides,
  };
  const args = [SCRIPT];
  for (const [name, value] of Object.entries(values)) args.push(`--${name}`, value);
  return spawnSync(process.execPath, args, {
    encoding: "utf8",
    timeout: 30_000,
    env: {
      ...process.env,
      TEMP: paths.ephemeral,
      TMP: paths.ephemeral,
      TMPDIR: paths.ephemeral,
    },
  });
}

function assertRefused(result, reason = "") {
  assert.notEqual(result.status, 0);
  assert.match(
    `${result.stdout}\n${result.stderr}`,
    new RegExp(`G12_STAGING_LEGACY_BOOTSTRAP_COMPENSATION_REFUSED:${reason}`),
  );
}

test("legacy bootstrap compensation verifies the one pinned legacy bundle without persistent output", async (context) => {
  const paths = await fixture(context);
  const result = run(paths);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.mode, "legacy-bootstrap-compensation");
  assert.equal(output.archiveSha256, paths.record.dist.archiveSha256);
  assert.equal(output.treeSha256, paths.record.dist.treeSha256);
  assert.equal(output.rebuildPerformed, false);
  assert.equal(output.resealPerformed, false);
  assert.equal(output.persistentOutputCreated, false);
  assert.deepEqual(await readdir(paths.ephemeral), []);
});

test("legacy bootstrap compensation rejects every mismatch in the pinned source identity", async (context) => {
  const candidate = await fixture(context);
  assertRefused(run(candidate, { "candidate-sha": "2".repeat(40) }), "identity_invalid");
  const control = await fixture(context);
  assertRefused(run(control, { "control-sha": "3".repeat(40) }), "identity_invalid");
  const runId = await fixture(context);
  assertRefused(run(runId, { "run-id": "40000000003" }), "identity_invalid");
  const attempt = await fixture(context);
  assertRefused(run(attempt, { "run-attempt": "2" }), "identity_invalid");
  const schema = await fixture(context);
  await writeFile(schema.recordPath, JSON.stringify({ ...schema.record, schemaVersion: 2 }));
  assertRefused(run(schema), "identity_invalid");
});

test("legacy bootstrap compensation rejects state and remote artifact metadata drift", async (context) => {
  const original = await fixture(context);
  await writeFile(
    original.statePath,
    JSON.stringify({
      ...original.state,
      original: { ...original.state.original, release: "4".repeat(40) },
    }),
  );
  assertRefused(run(original), "state_invalid");

  const stateExtra = await fixture(context);
  await writeFile(stateExtra.statePath, JSON.stringify({ ...stateExtra.state, unexpected: true }));
  assertRefused(run(stateExtra), "state_invalid");

  const marker = await fixture(context);
  await writeFile(
    marker.statePath,
    JSON.stringify({ ...marker.state, compensationMarker: `g12-staging-deploy-compensation-${RUN_ID}-2` }),
  );
  assertRefused(run(marker), "state_invalid");

  const workflowControl = await fixture(context);
  await writeFile(
    workflowControl.statePath,
    JSON.stringify({
      ...workflowControl.state,
      workflow: { ...workflowControl.state.workflow, controlSha: "4".repeat(40) },
    }),
  );
  assertRefused(run(workflowControl), "state_invalid");

  const workflowRun = await fixture(context);
  await writeFile(
    workflowRun.statePath,
    JSON.stringify({
      ...workflowRun.state,
      workflow: { ...workflowRun.state.workflow, runId: "40000000003" },
    }),
  );
  assertRefused(run(workflowRun), "state_invalid");

  const candidate = await fixture(context);
  await writeFile(
    candidate.statePath,
    JSON.stringify({ ...candidate.state, candidateRelease: "5".repeat(40) }),
  );
  assertRefused(run(candidate), "state_invalid");

  const metadata = await fixture(context);
  assertRefused(
    run(metadata, { "recovery-artifact-name": `staging-recovery-${RUN_ID}-2` }),
    "artifact_metadata_invalid",
  );
  const rawDigest = await fixture(context);
  assertRefused(run(rawDigest, { "state-artifact-digest": "f".repeat(64) }), "artifact_metadata_invalid");
  const duplicateId = await fixture(context);
  assertRefused(run(duplicateId, { "recovery-artifact-id": "60000000001" }), "artifact_metadata_invalid");
});

test("legacy bootstrap compensation rejects wrappers and every unexpected artifact entry", async (context) => {
  const recoveryExtra = await fixture(context);
  await writeFile(join(recoveryExtra.recoveryArtifact, "unexpected.txt"), "no");
  assertRefused(run(recoveryExtra), "recovery_contents_invalid");

  const outputExtra = await fixture(context);
  await writeFile(join(outputExtra.outputs, "unexpected.json"), "{}");
  assertRefused(run(outputExtra), "recovery_outputs_contents_invalid");

  const stateExtra = await fixture(context);
  await writeFile(join(stateExtra.stateArtifact, "unexpected.json"), "{}");
  assertRefused(run(stateExtra), "state_artifact_contents_invalid");

  const wrapper = await fixture(context);
  const nested = join(wrapper.recoveryArtifact, "wrapper");
  await mkdir(nested);
  await Promise.all([
    rename(wrapper.dist, join(nested, "dist")),
    rename(wrapper.outputs, join(nested, "outputs")),
  ]);
  assertRefused(run(wrapper), "recovery_contents_invalid");
});

test("legacy bootstrap compensation rejects symlinks in the artifact topology", async (context) => {
  const paths = await fixture(context);
  const target = join(paths.root, "outside.js");
  const link = join(paths.dist, "assets", "linked.js");
  await writeFile(target, "outside");
  try {
    await symlink(target, link, "file");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOSYS"].includes(error?.code)) return context.skip("symlinks unavailable");
    throw error;
  }
  assertRefused(run(paths), "dist_invalid");
});

test("legacy bootstrap compensation rejects archive bytes divergent from the record", async (context) => {
  const paths = await fixture(context);
  await appendFile(paths.archive, "tamper");
  assertRefused(run(paths), "archive_record_mismatch");
  assert.deepEqual(await readdir(paths.ephemeral), []);
});

test("legacy bootstrap compensation rejects seal semantics divergent from the record", async (context) => {
  const paths = await fixture(context);
  await writeFile(paths.sealPath, JSON.stringify({ ...paths.seal, treeSha256: "5".repeat(64) }));
  assertRefused(run(paths), "seal_invalid");
});

test("legacy bootstrap compensation rejects downloaded dist bytes divergent from archive and seal", async (context) => {
  const paths = await fixture(context);
  await writeFile(join(paths.dist, "assets", "app.js"), "changed after durable upload");
  assertRefused(run(paths), "dist_invalid");
});

test("legacy bootstrap compensation refuses a symlinked recovery root", async (context) => {
  const paths = await fixture(context);
  const linked = join(paths.root, "recovery-link");
  try {
    await symlink(paths.recoveryArtifact, linked, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOSYS"].includes(error?.code)) return context.skip("symlinks unavailable");
    throw error;
  }
  assertRefused(run({ ...paths, recoveryArtifact: linked }), "recovery_root_invalid");
});
