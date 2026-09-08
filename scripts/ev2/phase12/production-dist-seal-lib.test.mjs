import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";

import {
  copyStableProductionDistArchive,
  lockProductionDistTree,
  materializeProductionDistArchive,
  sealProductionDistArchive,
  snapshotProductionDist,
  unlockProductionDistTree,
  verifyProductionDistSeal,
} from "./production-dist-seal-lib.mjs";

const SHA = "a".repeat(40);

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "g12-dist-seal-"));
  await mkdir(join(root, "assets"));
  await writeFile(join(root, "index.html"), "<main>GAIATEC</main>");
  await writeFile(join(root, "assets", "app.js"), "console.log('release')");
  await writeFile(
    join(root, "release-manifest.json"),
    JSON.stringify({ schemaVersion: 1, release: SHA, files: [] }),
  );
  return root;
}

test("dist seal is deterministic and verifies the exact file tree", async (context) => {
  const root = await fixture();
  context.after(() => rm(root, { recursive: true, force: true }));

  const first = await snapshotProductionDist(root, SHA);
  const second = await snapshotProductionDist(root, SHA);
  assert.deepEqual(second, first);
  assert.equal(first.fileCount, 3);
  assert.match(first.treeSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(await verifyProductionDistSeal(root, first, SHA), {
    valid: true,
    violations: [],
    snapshot: first,
  });
});

test("dist verification fails closed after mutation, addition or candidate substitution", async (context) => {
  const root = await fixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  const seal = await snapshotProductionDist(root, SHA);

  await writeFile(join(root, "assets", "app.js"), "console.log('mutated')");
  let result = await verifyProductionDistSeal(root, seal, SHA);
  assert.equal(result.valid, false);
  assert.match(result.violations.join(","), /tree_digest_mismatch|file_inventory_mismatch/);

  await writeFile(join(root, "extra.txt"), "unexpected");
  result = await verifyProductionDistSeal(root, seal, SHA);
  assert.match(result.violations.join(","), /file_count_mismatch/);

  result = await verifyProductionDistSeal(root, seal, "b".repeat(40));
  assert.match(result.violations.join(","), /candidate_sha_mismatch/);
});

test("dist seal refuses a tree without the release manifest", async (context) => {
  const root = await fixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  await rm(join(root, "release-manifest.json"));
  await assert.rejects(() => snapshotProductionDist(root, SHA), /release_manifest_missing/);
});

test("dist seal binds the embedded release identity to the approved candidate", async (context) => {
  const root = await fixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    join(root, "release-manifest.json"),
    JSON.stringify({ schemaVersion: 1, release: "b".repeat(40), files: [] }),
  );
  await assert.rejects(() => snapshotProductionDist(root, SHA), /release_manifest_identity_mismatch/);
});

test("dist seal refuses symlinks", { skip: process.platform === "win32" }, async (context) => {
  const root = await fixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  await symlink(join(root, "index.html"), join(root, "linked-index"));
  await assert.rejects(() => snapshotProductionDist(root, SHA), /symlink/);
  await rm(join(root, "linked-index"));
  const linkedRoot = `${root}-link`;
  context.after(() => rm(linkedRoot, { force: true }));
  await symlink(root, linkedRoot, "dir");
  await assert.rejects(() => snapshotProductionDist(linkedRoot, SHA), /dist_root_invalid/);
});

test(
  "single immutable archive materializes the exact sealed production tree",
  { skip: process.platform === "win32" },
  async (context) => {
    const root = await fixture();
    const archive = `${root}.tar`;
    const privateDirectory = `${root}.private`;
    const privateArchive = join(privateDirectory, basename(archive));
    const materialized = `${root}.materialized`;
    context.after(() => rm(root, { recursive: true, force: true }));
    context.after(() => rm(archive, { force: true }));
    context.after(async () => {
      await unlockProductionDistTree(materialized).catch(() => undefined);
      await rm(materialized, { recursive: true, force: true });
    });
    context.after(() => rm(privateDirectory, { recursive: true, force: true }));
    const seal = await sealProductionDistArchive(root, archive, SHA);
    assert.equal(seal.schemaVersion, 2);
    assert.match(seal.archiveSha256, /^[a-f0-9]{64}$/);
    const snapshot = await materializeProductionDistArchive(archive, seal, SHA, materialized);
    assert.equal(snapshot.treeSha256, seal.treeSha256);
    await mkdir(privateDirectory);
    const copied = await copyStableProductionDistArchive(archive, privateArchive);
    assert.equal(copied.sha256, seal.archiveSha256);
    await lockProductionDistTree(materialized);
    assert.equal((await stat(join(materialized, "index.html"))).mode & 0o777, 0o444);
    assert.equal((await stat(materialized)).mode & 0o777, 0o555);
    await unlockProductionDistTree(materialized);
    await writeFile(archive, "tampered");
    await assert.rejects(
      () => materializeProductionDistArchive(archive, seal, SHA, materialized),
      /archive_(?:byte_count|digest)_mismatch/,
    );
  },
);
