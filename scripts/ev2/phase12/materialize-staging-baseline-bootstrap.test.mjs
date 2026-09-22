import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join, parse, resolve } from "node:path";
import test from "node:test";

import { sealProductionDistArchive } from "./production-dist-seal-lib.mjs";
import { sha256Bytes } from "./staging-baseline-bootstrap-lib.mjs";

const SCRIPT = resolve("scripts/ev2/phase12/materialize-staging-baseline-bootstrap.mjs");
const CANDIDATE = "a".repeat(40);

async function fixture(context) {
  const root = await mkdtemp(join(process.cwd(), ".g12-bootstrap-hardening-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const bridge = join(root, "bridge");
  const source = join(root, "source");
  const input = join(root, "input");
  const control = join(root, "control");
  const baseline = join(root, "baseline");
  await Promise.all([mkdir(bridge), mkdir(source), mkdir(input), mkdir(control), mkdir(baseline)]);
  await mkdir(join(input, "assets"));
  await writeFile(join(input, "assets", "app.js"), "console.log('sealed')");
  await writeFile(
    join(input, "release-manifest.json"),
    JSON.stringify({ schemaVersion: 1, release: CANDIDATE }),
  );

  const archiveFile = "staging-candidate-dist.tar";
  const sealFile = "staging-candidate-dist-seal.json";
  const archivePath = join(source, archiveFile);
  const seal = await sealProductionDistArchive(input, archivePath, CANDIDATE);
  const sealBytes = Buffer.from(JSON.stringify(seal));
  await writeFile(join(source, sealFile), sealBytes);

  const bridgeRunId = "40000000001";
  const bridgeRunAttempt = 2;
  const canonical = {
    deploymentId: "00000000-0000-4000-8000-000000000001",
    createdOn: "2026-09-22T12:00:00.000Z",
    commitMessage: `g12-staging-bridge-run-${bridgeRunId}-${bridgeRunAttempt}`,
  };
  const evidence = {
    schemaVersion: 4,
    event: "g12.staging.frontend_bridge.promoted",
    repository: "Vnd93/gaiatec-cms",
    candidateSha: CANDIDATE,
    workflow: {
      runId: bridgeRunId,
      runAttempt: bridgeRunAttempt,
      controlSha: CANDIDATE,
    },
    canonical: { ...canonical, release: CANDIDATE },
    dist: { archiveSha256: seal.archiveSha256, treeSha256: seal.treeSha256 },
    rollbackReady: true,
  };
  const evidenceBytes = Buffer.from(JSON.stringify(evidence));
  await writeFile(join(bridge, "staging-frontend-bridge-evidence.json"), evidenceBytes);

  const sourceRunId = "40000000002";
  const sourceRunAttempt = 1;
  const record = {
    schemaVersion: 1,
    event: "g12.staging.baseline.bootstrap",
    repository: "Vnd93/gaiatec-cms",
    candidateSha: CANDIDATE,
    canonical,
    bridge: {
      runId: bridgeRunId,
      runAttempt: bridgeRunAttempt,
      controlSha: CANDIDATE,
      artifactId: "50000000001",
      artifactDigest: `sha256:${"b".repeat(64)}`,
      artifactName: `staging-frontend-bridge-${CANDIDATE}`,
      evidenceSha256: sha256Bytes(evidenceBytes),
    },
    source: {
      runId: sourceRunId,
      runAttempt: sourceRunAttempt,
      controlSha: CANDIDATE,
      artifactId: "50000000002",
      artifactDigest: `sha256:${"c".repeat(64)}`,
      artifactName: `staging-candidate-${CANDIDATE}-${sourceRunId}-${sourceRunAttempt}`,
      sealFile,
      archiveFile,
      sealSha256: sha256Bytes(sealBytes),
    },
    dist: {
      archiveSha256: seal.archiveSha256,
      treeSha256: seal.treeSha256,
      archiveBytes: seal.archiveBytes,
      fileCount: seal.fileCount,
      byteCount: seal.byteCount,
    },
  };
  const recordPath = join(control, "record.json");
  await writeFile(recordPath, JSON.stringify(record));
  return {
    root,
    cwd: control,
    bridge,
    source,
    record: recordPath,
    output: join(baseline, "dist"),
  };
}

function run(paths, { omitOutput = false } = {}) {
  const args = [
    SCRIPT,
    "--record",
    paths.record,
    "--bridge-artifact-dir",
    paths.bridge,
    "--source-artifact-dir",
    paths.source,
  ];
  if (!omitOutput) args.push("--output-dist", paths.output);
  const env = { ...process.env };
  delete env.GITHUB_OUTPUT;
  return spawnSync(process.execPath, args, {
    cwd: paths.cwd,
    env,
    encoding: "utf8",
    timeout: 30_000,
  });
}

function assertPathRefused(result, reason = "") {
  assert.notEqual(result.status, 0);
  assert.match(
    `${result.stdout}\n${result.stderr}`,
    new RegExp(`G12_STAGING_BASELINE_BOOTSTRAP_PATH_REFUSED:${reason}`),
  );
}

test("bootstrap materializer publishes exact bytes only to a new output", async (context) => {
  const paths = await fixture(context);
  const result = run(paths);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(await readFile(join(paths.output, "release-manifest.json"), "utf8")), {
    schemaVersion: 1,
    release: CANDIDATE,
  });
  await access(join(paths.source, "staging-candidate-dist.tar"));
  await access(join(paths.bridge, "staging-frontend-bridge-evidence.json"));
});

test("bootstrap materializer rejects a missing output argument before reading artifacts", async (context) => {
  const paths = await fixture(context);
  assertPathRefused(run(paths, { omitOutput: true }), "output-dist_required_once");
});

test("bootstrap materializer rejects dangerous output relationships", async (context) => {
  const paths = await fixture(context);
  for (const output of [
    paths.cwd,
    parse(paths.cwd).root,
    paths.root,
    paths.source,
    join(paths.source, "nested"),
    paths.bridge,
    paths.record,
  ]) {
    assertPathRefused(run({ ...paths, output }));
  }
  assertPathRefused(run({ ...paths, bridge: paths.source }), "source_bridge_overlap");
});

test("bootstrap materializer never removes or overwrites an existing output", async (context) => {
  const paths = await fixture(context);
  await mkdir(paths.output);
  const sentinel = join(paths.output, "user-owned.txt");
  await writeFile(sentinel, "preserve-me");
  assertPathRefused(run(paths), "output_exists");
  assert.equal(await readFile(sentinel, "utf8"), "preserve-me");
});

test("bootstrap materializer rejects a symlinked artifact directory root", async (context) => {
  const paths = await fixture(context);
  const linkedBridge = join(paths.root, "bridge-link");
  try {
    await symlink(paths.bridge, linkedBridge, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (error?.code === "EPERM") return context.skip("symlinks are unavailable");
    throw error;
  }
  assertPathRefused(run({ ...paths, bridge: linkedBridge }), "bridge_root_invalid");
});

test("bootstrap materializer rejects symlinked evidence and record files", async (context) => {
  const evidencePaths = await fixture(context);
  const evidence = join(evidencePaths.bridge, "staging-frontend-bridge-evidence.json");
  const evidenceTarget = join(evidencePaths.root, "evidence-target.json");
  await writeFile(evidenceTarget, "{}");
  await rm(evidence);
  try {
    await symlink(evidenceTarget, evidence, "file");
  } catch (error) {
    if (error?.code === "EPERM") return context.skip("symlinks are unavailable");
    throw error;
  }
  const evidenceResult = run(evidencePaths);
  assert.notEqual(evidenceResult.status, 0);
  assert.match(
    `${evidenceResult.stdout}\n${evidenceResult.stderr}`,
    /BRIDGE_CONTENTS_REFUSED|bridge_file_not_regular/,
  );

  const recordPaths = await fixture(context);
  const recordTarget = join(recordPaths.root, "record-target.json");
  await writeFile(recordTarget, await readFile(recordPaths.record));
  await rm(recordPaths.record);
  await symlink(recordTarget, recordPaths.record, "file");
  assertPathRefused(run(recordPaths), "record_not_regular");
});
