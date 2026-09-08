import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFile, cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function runTar(args) {
  const result = spawnSync("tar", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 5 * 60 * 1000,
  });
  if (result.error || result.status !== 0) throw new Error("G12_PRODUCTION_RELEASE_ARCHIVE_TAR_FAILED");
  return result.stdout;
}

function safeRelativePath(path) {
  if (
    typeof path !== "string" ||
    !path ||
    isAbsolute(path) ||
    path.includes("\\") ||
    path.split("/").includes("..")
  )
    throw new Error("G12_PRODUCTION_RELEASE_ARCHIVE_PATH_REFUSED");
  return path;
}

function safeArchiveEntries(archivePath) {
  const names = runTar(["-tf", archivePath]).split(/\r?\n/).filter(Boolean);
  const types = runTar(["-tvf", archivePath])
    .split(/\r?\n/)
    .filter(Boolean)
    .map((entry) => entry[0]);
  if (names.length === 0 || names.length !== types.length)
    throw new Error("G12_PRODUCTION_RELEASE_ARCHIVE_CONTENT_REFUSED");
  for (const [index, name] of names.entries()) {
    const normalized = name.replace(/^\.\//, "");
    if (name === "./") continue;
    safeRelativePath(normalized);
    if (types[index] !== "-" && types[index] !== "d")
      throw new Error("G12_PRODUCTION_RELEASE_ARCHIVE_CONTENT_REFUSED");
  }
}

async function collectMaterializedFiles(root, current = root) {
  const result = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = resolve(current, entry.name);
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink()) throw new Error("G12_PRODUCTION_RELEASE_ARCHIVE_CONTENT_REFUSED");
    if (metadata.isDirectory()) result.push(...(await collectMaterializedFiles(root, path)));
    else if (metadata.isFile()) result.push(relative(root, path).split(sep).join("/"));
    else throw new Error("G12_PRODUCTION_RELEASE_ARCHIVE_CONTENT_REFUSED");
  }
  return result.sort();
}

async function validateMaterializedArchive(root, seal, binding) {
  const indexPath = join(root, "g12-production-evidence-index.json");
  const indexBytes = await readFile(indexPath);
  const index = JSON.parse(indexBytes.toString("utf8"));
  const violations = [];
  if (sha256(indexBytes) !== seal?.indexSha256) violations.push("index_digest_mismatch");
  if (index?.schemaVersion !== 2 || index?.event !== "g12.production.release_evidence.indexed")
    violations.push("index_identity_invalid");
  if (index?.candidateSha !== binding?.candidateSha) violations.push("index_candidate_mismatch");
  if (String(index?.github?.runId ?? "") !== String(binding?.runId ?? ""))
    violations.push("index_run_id_mismatch");
  if (Number(index?.github?.runAttempt) !== Number(binding?.runAttempt))
    violations.push("index_run_attempt_mismatch");
  if (index?.github?.controlSha !== binding?.controlSha) violations.push("index_control_sha_mismatch");
  const rows = Array.isArray(index?.files) ? index.files : [];
  if (rows.length !== index?.fileCount || seal?.fileCount !== rows.length + 1)
    violations.push("index_cardinality_invalid");
  const expected = new Set(["g12-production-evidence-index.json"]);
  for (const row of rows) {
    let path;
    try {
      path = safeRelativePath(row?.path);
    } catch {
      violations.push("index_path_invalid");
      continue;
    }
    if (expected.has(path)) violations.push("index_path_duplicate");
    expected.add(path);
    try {
      const bytes = await readFile(resolve(root, path));
      if (bytes.length !== row?.bytes || sha256(bytes) !== row?.sha256)
        violations.push(`${path}:digest_mismatch`);
    } catch {
      violations.push(`${path}:missing`);
    }
  }
  const actual = await collectMaterializedFiles(root);
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort()))
    violations.push("archive_file_inventory_mismatch");
  return { index, violations };
}

export async function sealProductionReleaseEvidenceArchive({ root, indexFile, archiveFile }) {
  const rootPath = resolve(root);
  const indexPath = resolve(indexFile);
  const archivePath = resolve(archiveFile);
  const indexBytes = await readFile(indexPath);
  const index = JSON.parse(indexBytes.toString("utf8"));
  if (
    index?.schemaVersion !== 2 ||
    index?.event !== "g12.production.release_evidence.indexed" ||
    !/^[a-f0-9]{40}$/.test(index?.candidateSha ?? "") ||
    !Array.isArray(index?.files) ||
    index.files.length !== index.fileCount
  )
    throw new Error("G12_PRODUCTION_RELEASE_ARCHIVE_INDEX_REFUSED");

  const staging = await mkdtemp(join(tmpdir(), "g12-production-evidence-archive-"));
  try {
    const selectedPaths = new Set();
    for (const entry of index.files) {
      const relativePath = safeRelativePath(entry?.path);
      if (selectedPaths.has(relativePath)) throw new Error("G12_PRODUCTION_RELEASE_ARCHIVE_INDEX_REFUSED");
      selectedPaths.add(relativePath);
      if (!/^[a-f0-9]{64}$/.test(entry?.sha256 ?? ""))
        throw new Error("G12_PRODUCTION_RELEASE_ARCHIVE_INDEX_REFUSED");
      const source = resolve(rootPath, entry.path);
      const target = resolve(staging, entry.path);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(source, target);
      const copied = await readFile(target);
      if (copied.length !== entry.bytes || sha256(copied) !== entry.sha256)
        throw new Error(`G12_PRODUCTION_RELEASE_ARCHIVE_SOURCE_CHANGED:${entry.path}`);
    }
    await writeFile(join(staging, "g12-production-evidence-index.json"), indexBytes, {
      flag: "wx",
      mode: 0o600,
    });
    await rm(archivePath, { force: true });
    runTar([
      "--sort=name",
      "--mtime=@0",
      "--owner=0",
      "--group=0",
      "--numeric-owner",
      "--format=posix",
      "--pax-option=delete=atime,delete=ctime",
      "-cf",
      archivePath,
      "-C",
      staging,
      ".",
    ]);
    const archiveBytes = await readFile(archivePath);
    return {
      schemaVersion: 1,
      event: "g12.production.release_evidence.archive_sealed",
      candidateSha: index.candidateSha,
      github: index.github,
      fileCount: index.fileCount + 1,
      indexSha256: sha256(indexBytes),
      archiveFile: basename(archivePath),
      archiveBytes: archiveBytes.length,
      archiveSha256: sha256(archiveBytes),
      sealedAt: new Date().toISOString(),
    };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

export async function verifyProductionReleaseEvidenceArchive({
  archiveFile,
  seal,
  binding,
  materializeDirectory,
}) {
  const bytes = await readFile(resolve(archiveFile));
  const violations = [];
  if (seal?.schemaVersion !== 1) violations.push("seal_schema_invalid");
  if (seal?.event !== "g12.production.release_evidence.archive_sealed") violations.push("seal_event_invalid");
  if (seal?.candidateSha !== binding?.candidateSha) violations.push("candidate_mismatch");
  if (String(seal?.github?.runId ?? "") !== String(binding?.runId ?? "")) violations.push("run_id_mismatch");
  if (Number(seal?.github?.runAttempt) !== Number(binding?.runAttempt))
    violations.push("run_attempt_mismatch");
  if (seal?.github?.controlSha !== binding?.controlSha) violations.push("control_sha_mismatch");
  if (seal?.archiveFile !== basename(resolve(archiveFile))) violations.push("archive_filename_mismatch");
  if (seal?.archiveBytes !== bytes.length) violations.push("archive_size_mismatch");
  if (seal?.archiveSha256 !== sha256(bytes)) violations.push("archive_digest_mismatch");
  if (violations.length > 0) return { valid: false, violations };

  const temporary = await mkdtemp(join(tmpdir(), "g12-production-evidence-verify-"));
  const privateArchive = join(temporary, "release-evidence.tar");
  const extracted = join(temporary, "materialized");
  try {
    await writeFile(privateArchive, bytes, { flag: "wx", mode: 0o400 });
    safeArchiveEntries(privateArchive);
    await mkdir(extracted);
    runTar(["--no-same-owner", "--no-same-permissions", "-xf", privateArchive, "-C", extracted]);
    const content = await validateMaterializedArchive(extracted, seal, binding);
    violations.push(...content.violations);
    if (violations.length === 0 && materializeDirectory) {
      const destination = resolve(materializeDirectory);
      await rm(destination, { recursive: true, force: true });
      await cp(extracted, destination, { recursive: true, errorOnExist: true, force: false });
    }
    return { valid: violations.length === 0, violations };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function writeProductionReleaseArchiveSeal(path, seal) {
  await mkdir(dirname(resolve(path)), { recursive: true });
  await writeFile(resolve(path), `${JSON.stringify(seal, null, 2)}\n`, { mode: 0o600 });
}
