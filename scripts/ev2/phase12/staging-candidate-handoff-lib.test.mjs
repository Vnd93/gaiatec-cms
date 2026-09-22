import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { sealProductionDistArchive, snapshotProductionDist } from "./production-dist-seal-lib.mjs";
import {
  STAGING_CANDIDATE_HANDOFF,
  verifyStagingCandidateHandoff,
  writeStagingCandidateHandoff,
} from "./staging-candidate-handoff-lib.mjs";
import { STAGING_FRONTEND_PACKAGE, writeStagingFrontendPackage } from "./staging-frontend-package-lib.mjs";

const candidateSha = "a".repeat(40);
const runId = "35731735256";
const runAttempt = 2;
const environment = {
  VITE_RELEASE: candidateSha,
  VITE_CMS_ENVIRONMENT: "staging",
  VITE_SUPABASE_URL: "https://glcqsosxwgmlhzgcsnzv.supabase.co",
  VITE_SUPABASE_ANON_KEY: "sb_publishable_staging_fixture_1234567890",
  VITE_TURNSTILE_SITE_KEY: "0x4AAAAAAAstaging-real-widget-key",
  VITE_GOOGLE_MAPS_KEY: "AIzaSyStagingMapsFixtureKey",
  VITE_CONTACT_CAPTCHA_ALWAYS: "true",
  VITE_EV2_DRAFT_V2_CANDIDATE: "false",
};

async function createPackage(root) {
  const dist = join(root, "dist");
  const source = join(root, "source");
  const packageDirectory = join(root, "package");
  await mkdir(join(dist, "assets"), { recursive: true });
  await mkdir(source);
  await writeFile(join(dist, "index.html"), "<main>staging handoff</main>");
  await writeFile(join(dist, "assets", "app.js"), "console.log('same bytes')");
  await writeFile(
    join(dist, "release-manifest.json"),
    JSON.stringify({ schemaVersion: 1, release: candidateSha, files: [] }),
  );
  const archivePath = join(source, STAGING_FRONTEND_PACKAGE.archiveFile);
  const sealPath = join(source, STAGING_FRONTEND_PACKAGE.sealFile);
  let seal;
  if (process.platform === "win32") {
    const archived = spawnSync("tar", ["-cf", archivePath, "-C", dist, "."], { encoding: "utf8" });
    assert.equal(archived.status, 0, archived.stderr);
    const archiveBytes = await readFile(archivePath);
    seal = {
      ...(await snapshotProductionDist(dist, candidateSha)),
      schemaVersion: 2,
      archiveFile: STAGING_FRONTEND_PACKAGE.archiveFile,
      archiveBytes: archiveBytes.length,
      archiveSha256: createHash("sha256").update(archiveBytes).digest("hex"),
    };
  } else {
    seal = await sealProductionDistArchive(dist, archivePath, candidateSha);
  }
  await writeFile(sealPath, `${JSON.stringify(seal, null, 2)}\n`);
  await writeStagingFrontendPackage({
    archivePath,
    sealPath,
    outputDirectory: packageDirectory,
    candidateSha,
    runId,
    runAttempt,
    environment,
  });
  return { packageDirectory, seal };
}

function expectedFrom(result) {
  return {
    sourceRunId: runId,
    sourceRunAttempt: runAttempt,
    archiveSha256: result.archiveSha256,
    sealSha256: result.sealSha256,
    provenanceSha256: result.provenanceSha256,
    profileSha256: result.profileSha256,
    treeSha256: result.treeSha256,
    archiveBytes: result.archiveBytes,
    fileCount: result.fileCount,
    byteCount: result.byteCount,
  };
}

test("candidate handoff preserves all original CI package bytes and writes only an external manifest", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "g12-staging-candidate-handoff-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const { packageDirectory, seal: sourceSeal } = await createPackage(root);
  const handoffDirectory = join(root, "handoff");
  const result = await writeStagingCandidateHandoff({
    packageDirectory,
    outputDirectory: handoffDirectory,
    candidateSha,
    runId,
    runAttempt,
    environment,
  });

  assert.deepEqual(
    (await readdir(handoffDirectory)).sort(),
    [
      STAGING_CANDIDATE_HANDOFF.archiveFile,
      STAGING_CANDIDATE_HANDOFF.sealFile,
      STAGING_CANDIDATE_HANDOFF.provenanceFile,
      STAGING_CANDIDATE_HANDOFF.manifestFile,
    ].sort(),
  );
  assert.deepEqual(
    await readFile(join(handoffDirectory, STAGING_CANDIDATE_HANDOFF.archiveFile)),
    await readFile(join(packageDirectory, STAGING_FRONTEND_PACKAGE.archiveFile)),
  );
  assert.deepEqual(
    await readFile(join(handoffDirectory, STAGING_CANDIDATE_HANDOFF.sealFile)),
    await readFile(join(packageDirectory, STAGING_FRONTEND_PACKAGE.sealFile)),
  );
  assert.deepEqual(
    await readFile(join(handoffDirectory, STAGING_CANDIDATE_HANDOFF.provenanceFile)),
    await readFile(join(packageDirectory, STAGING_FRONTEND_PACKAGE.provenanceFile)),
  );
  const manifest = JSON.parse(
    await readFile(join(handoffDirectory, STAGING_CANDIDATE_HANDOFF.manifestFile), "utf8"),
  );
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.source.runId, runId);
  assert.equal(manifest.source.runAttempt, runAttempt);
  assert.equal(manifest.package.archive.file, STAGING_FRONTEND_PACKAGE.archiveFile);
  assert.equal(manifest.package.seal.file, STAGING_FRONTEND_PACKAGE.sealFile);
  assert.equal(manifest.package.provenance.file, STAGING_FRONTEND_PACKAGE.provenanceFile);
  assert.equal(result.archiveSha256, sourceSeal.archiveSha256);
  assert.equal(result.treeSha256, sourceSeal.treeSha256);
  assert.equal(result.archiveBytes, sourceSeal.archiveBytes);
  assert.equal(result.fileCount, sourceSeal.fileCount);
  assert.equal(result.byteCount, sourceSeal.byteCount);

  const verified = await verifyStagingCandidateHandoff({
    handoffDirectory,
    outputDirectory: join(root, "verified-dist"),
    candidateSha,
    expected: expectedFrom(result),
  });
  assert.equal(verified.archiveSha256, sourceSeal.archiveSha256);
  assert.equal(verified.treeSha256, sourceSeal.treeSha256);
  assert.equal(
    await readFile(join(root, "verified-dist", "index.html"), "utf8"),
    "<main>staging handoff</main>",
  );
});

test("candidate handoff writer requires a new output and rejects wrong source identity", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "g12-staging-candidate-output-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const { packageDirectory } = await createPackage(root);
  const existing = join(root, "existing");
  await mkdir(existing);
  await assert.rejects(
    () =>
      writeStagingCandidateHandoff({
        packageDirectory,
        outputDirectory: existing,
        candidateSha,
        runId,
        runAttempt,
        environment,
      }),
    /output_must_be_new/,
  );
  await assert.rejects(
    () =>
      writeStagingCandidateHandoff({
        packageDirectory,
        outputDirectory: join(root, "wrong-run"),
        candidateSha,
        runId: "0",
        runAttempt,
        environment,
      }),
    /source_identity_invalid/,
  );
  await assert.rejects(
    () =>
      writeStagingCandidateHandoff({
        packageDirectory,
        outputDirectory: join(packageDirectory, "nested"),
        candidateSha,
        runId,
        runAttempt,
        environment,
      }),
    /output_path_invalid/,
  );
});

test("candidate handoff verification fails closed on additions, seal substitutions and byte changes", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "g12-staging-candidate-adversarial-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const { packageDirectory } = await createPackage(root);
  const handoffDirectory = join(root, "handoff");
  const result = await writeStagingCandidateHandoff({
    packageDirectory,
    outputDirectory: handoffDirectory,
    candidateSha,
    runId,
    runAttempt,
    environment,
  });
  const expected = expectedFrom(result);
  const sealPath = join(handoffDirectory, STAGING_CANDIDATE_HANDOFF.sealFile);
  const archivePath = join(handoffDirectory, STAGING_CANDIDATE_HANDOFF.archiveFile);
  const originalSeal = await readFile(sealPath);
  const originalArchive = await readFile(archivePath);

  await writeFile(join(handoffDirectory, "unexpected.txt"), "refused");
  await assert.rejects(
    () =>
      verifyStagingCandidateHandoff({
        handoffDirectory,
        outputDirectory: join(root, "unexpected-output"),
        candidateSha,
        expected,
      }),
    /handoff_contents_invalid/,
  );
  await rm(join(handoffDirectory, "unexpected.txt"));

  await chmod(sealPath, 0o600);
  const seal = JSON.parse(originalSeal.toString("utf8"));
  await writeFile(sealPath, `${JSON.stringify({ ...seal, unexpected: true }, null, 2)}\n`);
  await assert.rejects(
    () =>
      verifyStagingCandidateHandoff({
        handoffDirectory,
        outputDirectory: join(root, "extra-seal-output"),
        candidateSha,
        expected,
      }),
    /manifest_invalid/,
  );
  await writeFile(sealPath, originalSeal);

  await chmod(archivePath, 0o600);
  await writeFile(archivePath, Buffer.concat([originalArchive, Buffer.from("tampered")]));
  await assert.rejects(
    () =>
      verifyStagingCandidateHandoff({
        handoffDirectory,
        outputDirectory: join(root, "tampered-output"),
        candidateSha,
        expected,
      }),
    /manifest_invalid/,
  );
  await writeFile(archivePath, originalArchive);

  await assert.rejects(
    () =>
      verifyStagingCandidateHandoff({
        handoffDirectory,
        outputDirectory: join(root, "wrong-tree-output"),
        candidateSha,
        expected: { ...expected, treeSha256: "b".repeat(64) },
      }),
    /manifest_invalid/,
  );
});

test("candidate handoff rejects symlink substitution when the platform permits it", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "g12-staging-candidate-symlink-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const { packageDirectory } = await createPackage(root);
  const handoffDirectory = join(root, "handoff");
  const result = await writeStagingCandidateHandoff({
    packageDirectory,
    outputDirectory: handoffDirectory,
    candidateSha,
    runId,
    runAttempt,
    environment,
  });
  const sealPath = join(handoffDirectory, STAGING_CANDIDATE_HANDOFF.sealFile);
  const outsideSeal = join(root, "outside-seal.json");
  await writeFile(outsideSeal, await readFile(sealPath));
  await rm(sealPath);
  try {
    await symlink(outsideSeal, sealPath, "file");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) {
      context.skip(`symlinks unavailable: ${error.code}`);
      return;
    }
    throw error;
  }
  await assert.rejects(
    () =>
      verifyStagingCandidateHandoff({
        handoffDirectory,
        outputDirectory: join(root, "symlink-output"),
        candidateSha,
        expected: expectedFrom(result),
      }),
    /handoff_contents_invalid/,
  );
});
