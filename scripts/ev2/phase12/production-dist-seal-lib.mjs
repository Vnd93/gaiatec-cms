import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, relative, resolve, sep } from "node:path";

const FULL_SHA = /^[a-f0-9]{40}$/;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function collectFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = resolve(current, entry.name);
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink())
      throw new Error(`G12_PRODUCTION_DIST_SEAL_REFUSED:symlink:${relative(root, path)}`);
    if (metadata.isDirectory()) files.push(...(await collectFiles(root, path)));
    else if (metadata.isFile()) files.push(path);
    else throw new Error(`G12_PRODUCTION_DIST_SEAL_REFUSED:unsupported_entry:${relative(root, path)}`);
  }
  return files;
}

export async function snapshotProductionDist(distDirectory, candidateSha) {
  if (!FULL_SHA.test(String(candidateSha ?? "")))
    throw new Error("G12_PRODUCTION_DIST_SEAL_REFUSED:candidate_sha_invalid");

  const root = resolve(distDirectory);
  const rootMetadata = await lstat(root);
  if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory())
    throw new Error("G12_PRODUCTION_DIST_SEAL_REFUSED:dist_root_invalid");
  const paths = await collectFiles(root);
  if (paths.length === 0) throw new Error("G12_PRODUCTION_DIST_SEAL_REFUSED:dist_empty");

  const files = [];
  for (const path of paths) {
    const bytes = await readFile(path);
    files.push({
      path: relative(root, path).split(sep).join("/"),
      bytes: bytes.length,
      sha256: sha256(bytes),
    });
  }
  files.sort((left, right) => left.path.localeCompare(right.path));
  if (!files.some((entry) => entry.path === "release-manifest.json"))
    throw new Error("G12_PRODUCTION_DIST_SEAL_REFUSED:release_manifest_missing");
  let releaseManifest;
  try {
    releaseManifest = JSON.parse(await readFile(resolve(root, "release-manifest.json"), "utf8"));
  } catch {
    throw new Error("G12_PRODUCTION_DIST_SEAL_REFUSED:release_manifest_invalid");
  }
  if (releaseManifest?.schemaVersion !== 1 || releaseManifest?.release !== candidateSha)
    throw new Error("G12_PRODUCTION_DIST_SEAL_REFUSED:release_manifest_identity_mismatch");

  const canonicalInventory = JSON.stringify(files);
  return {
    schemaVersion: 1,
    event: "g12.production.dist.sealed",
    candidateSha,
    fileCount: files.length,
    byteCount: files.reduce((total, entry) => total + entry.bytes, 0),
    treeSha256: sha256(canonicalInventory),
    files,
  };
}

export async function verifyProductionDistSeal(distDirectory, seal, candidateSha) {
  const violations = [];
  if (![1, 2].includes(seal?.schemaVersion)) violations.push("schema_version_invalid");
  if (seal?.event !== "g12.production.dist.sealed") violations.push("event_invalid");
  if (seal?.candidateSha !== candidateSha) violations.push("candidate_sha_mismatch");

  let live;
  try {
    live = await snapshotProductionDist(distDirectory, candidateSha);
  } catch (error) {
    violations.push(String(error instanceof Error ? error.message : error));
    return { valid: false, violations };
  }

  if (seal?.fileCount !== live.fileCount) violations.push("file_count_mismatch");
  if (seal?.byteCount !== live.byteCount) violations.push("byte_count_mismatch");
  if (seal?.treeSha256 !== live.treeSha256) violations.push("tree_digest_mismatch");
  if (JSON.stringify(seal?.files) !== JSON.stringify(live.files)) violations.push("file_inventory_mismatch");
  return { valid: violations.length === 0, violations, snapshot: live };
}

function runTar(args) {
  const result = spawnSync("tar", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 5 * 60 * 1000,
  });
  if (result.error || result.status !== 0) throw new Error("G12_PRODUCTION_DIST_ARCHIVE_TAR_FAILED");
  return result.stdout;
}

async function stableFileDigest(path) {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink())
    throw new Error("G12_PRODUCTION_DIST_ARCHIVE_REFUSED:not_regular");
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = await handle.stat({ bigint: true });
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ino !== after.ino)
      throw new Error("G12_PRODUCTION_DIST_ARCHIVE_REFUSED:changed_while_reading");
    return { bytes: Number(before.size), sha256: sha256(bytes) };
  } finally {
    await handle.close();
  }
}

function assertSafeArchiveEntries(entries) {
  if (entries.length === 0) throw new Error("G12_PRODUCTION_DIST_ARCHIVE_REFUSED:empty");
  let payloadEntries = 0;
  for (const entry of entries) {
    const normalized = entry.replace(/^\.\//, "");
    if (!normalized && entry === "./") continue;
    if (
      !normalized ||
      normalized.startsWith("/") ||
      normalized.split("/").includes("..") ||
      normalized.includes("\\")
    )
      throw new Error("G12_PRODUCTION_DIST_ARCHIVE_REFUSED:path_invalid");
    payloadEntries += 1;
  }
  if (payloadEntries === 0) throw new Error("G12_PRODUCTION_DIST_ARCHIVE_REFUSED:empty");
}

async function extractArchive(archivePath, targetDirectory) {
  const entries = runTar(["-tf", archivePath]).split(/\r?\n/).filter(Boolean);
  assertSafeArchiveEntries(entries);
  const entryTypes = runTar(["-tvf", archivePath])
    .split(/\r?\n/)
    .filter(Boolean)
    .map((entry) => entry[0]);
  if (entryTypes.length !== entries.length || entryTypes.some((type) => type !== "-" && type !== "d"))
    throw new Error("G12_PRODUCTION_DIST_ARCHIVE_REFUSED:link_or_special_entry");
  await mkdir(targetDirectory, { recursive: true });
  runTar(["--no-same-owner", "--no-same-permissions", "-xf", archivePath, "-C", targetDirectory]);
}

async function setTreeMode(root, { fileMode, directoryMode }) {
  const metadata = await lstat(root);
  if (metadata.isSymbolicLink()) throw new Error("G12_PRODUCTION_DIST_ARCHIVE_REFUSED:symlink");
  if (metadata.isFile()) {
    await chmod(root, fileMode);
    return;
  }
  if (!metadata.isDirectory()) throw new Error("G12_PRODUCTION_DIST_ARCHIVE_REFUSED:unsupported_entry");
  for (const entry of await readdir(root))
    await setTreeMode(resolve(root, entry), { fileMode, directoryMode });
  await chmod(root, directoryMode);
}

export async function lockProductionDistTree(root) {
  await setTreeMode(resolve(root), { fileMode: 0o444, directoryMode: 0o555 });
}

export async function unlockProductionDistTree(root) {
  await setTreeMode(resolve(root), { fileMode: 0o600, directoryMode: 0o700 });
}

export async function copyStableProductionDistArchive(sourcePath, targetPath) {
  const source = resolve(sourcePath);
  const target = resolve(targetPath);
  const snapshot = await stableFileDigest(source);
  const handle = await open(source, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = await handle.stat({ bigint: true });
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ino !== after.ino ||
      bytes.length !== snapshot.bytes ||
      sha256(bytes) !== snapshot.sha256
    )
      throw new Error("G12_PRODUCTION_DIST_ARCHIVE_REFUSED:changed_while_copying");
    await writeFile(target, bytes, { flag: "wx", mode: 0o400 });
  } finally {
    await handle.close();
  }
  const copied = await stableFileDigest(target);
  if (copied.bytes !== snapshot.bytes || copied.sha256 !== snapshot.sha256)
    throw new Error("G12_PRODUCTION_DIST_ARCHIVE_REFUSED:copy_digest_mismatch");
  return copied;
}

export async function sealProductionDistArchive(distDirectory, archivePath, candidateSha) {
  const source = resolve(distDirectory);
  const archive = resolve(archivePath);
  await rm(archive, { force: true });
  runTar([
    "--sort=name",
    "--mtime=@0",
    "--owner=0",
    "--group=0",
    "--numeric-owner",
    "--format=posix",
    "--pax-option=delete=atime,delete=ctime",
    "-cf",
    archive,
    "-C",
    source,
    ".",
  ]);
  const archiveIdentity = await stableFileDigest(archive);
  const temporary = `${archive}.verify-${process.pid}`;
  await rm(temporary, { recursive: true, force: true });
  try {
    await extractArchive(archive, temporary);
    const snapshot = await snapshotProductionDist(temporary, candidateSha);
    return {
      ...snapshot,
      schemaVersion: 2,
      archiveFile: basename(archive),
      archiveBytes: archiveIdentity.bytes,
      archiveSha256: archiveIdentity.sha256,
    };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function materializeProductionDistArchive(archivePath, seal, candidateSha, targetDirectory) {
  const archive = resolve(archivePath);
  const identity = await stableFileDigest(archive);
  const violations = [];
  if (seal?.schemaVersion !== 2) violations.push("schema_version_invalid");
  if (seal?.candidateSha !== candidateSha) violations.push("candidate_sha_mismatch");
  if (seal?.archiveFile !== basename(archive)) violations.push("archive_filename_mismatch");
  if (seal?.archiveBytes !== identity.bytes) violations.push("archive_byte_count_mismatch");
  if (seal?.archiveSha256 !== identity.sha256) violations.push("archive_digest_mismatch");
  if (violations.length > 0) throw new Error(`G12_PRODUCTION_DIST_ARCHIVE_REFUSED:${violations.join(",")}`);
  await rm(targetDirectory, { recursive: true, force: true });
  await extractArchive(archive, targetDirectory);
  const result = await verifyProductionDistSeal(targetDirectory, seal, candidateSha);
  if (!result.valid) throw new Error(`G12_PRODUCTION_DIST_ARCHIVE_REFUSED:${result.violations.join(",")}`);
  return result.snapshot;
}
