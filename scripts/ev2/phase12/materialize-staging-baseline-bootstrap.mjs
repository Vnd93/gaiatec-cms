import { constants } from "node:fs";
import { appendFile, cp, lstat, mkdtemp, open, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";

import { materializeProductionDistArchive, verifyProductionDistSeal } from "./production-dist-seal-lib.mjs";
import { sha256Bytes, validateStagingBaselineBootstrapRecord } from "./staging-baseline-bootstrap-lib.mjs";

const PATH_ERROR = "G12_STAGING_BASELINE_BOOTSTRAP_PATH_REFUSED";

function refusePath(reason) {
  throw new Error(`${PATH_ERROR}:${reason}`);
}

function requiredArgument(name) {
  const indexes = process.argv.flatMap((value, index) => (value === `--${name}` ? [index] : []));
  if (indexes.length !== 1) refusePath(`${name}_required_once`);
  const value = process.argv[indexes[0] + 1];
  if (!value || value.startsWith("--") || value.includes("\0")) refusePath(`${name}_required`);
  return value;
}

function comparable(path) {
  return process.platform === "win32" ? path.toLowerCase() : path;
}

function samePath(left, right) {
  return comparable(resolve(left)) === comparable(resolve(right));
}

function strictlyContains(parent, child) {
  const result = relative(parent, child);
  return result !== "" && result !== ".." && !result.startsWith(`..${sep}`) && !isAbsolute(result);
}

function pathsOverlap(left, right) {
  return samePath(left, right) || strictlyContains(left, right) || strictlyContains(right, left);
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode;
}

function sameStableSnapshot(left, right) {
  return (
    sameIdentity(left, right) &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

async function assertNoSymlinkComponents(path, label) {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  let current = root;
  for (const component of absolute
    .slice(root.length)
    .split(/[\\/]+/)
    .filter(Boolean)) {
    current = resolve(current, component);
    const metadata = await lstat(current, { bigint: true }).catch(() =>
      refusePath(`${label}_ancestor_uninspectable`),
    );
    if (metadata.isSymbolicLink()) refusePath(`${label}_ancestor_symlink`);
  }
}

async function stableReadRegularFile(path, label) {
  const before = await lstat(path, { bigint: true }).catch(() => refusePath(`${label}_missing`));
  if (before.isSymbolicLink() || !before.isFile()) refusePath(`${label}_not_regular`);
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)).catch(() =>
    refusePath(`${label}_open_refused`),
  );
  try {
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile() || !sameIdentity(before, opened)) refusePath(`${label}_identity_changed`);
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    const pathAfter = await lstat(path, { bigint: true }).catch(() =>
      refusePath(`${label}_identity_changed`),
    );
    if (
      bytes.length !== Number(opened.size) ||
      !sameStableSnapshot(opened, after) ||
      !sameStableSnapshot(after, pathAfter)
    )
      refusePath(`${label}_changed_while_reading`);
    return bytes;
  } finally {
    await handle.close();
  }
}

async function openStableDirectoryRoot(path, label) {
  await assertNoSymlinkComponents(dirname(path), label);
  const before = await lstat(path, { bigint: true }).catch(() => refusePath(`${label}_missing`));
  if (before.isSymbolicLink() || !before.isDirectory()) refusePath(`${label}_root_invalid`);
  const handle = await open(
    path,
    constants.O_RDONLY | (constants.O_DIRECTORY ?? 0) | (constants.O_NOFOLLOW ?? 0),
  ).catch(() => refusePath(`${label}_open_refused`));
  let opened;
  let canonicalPath;
  try {
    opened = await handle.stat({ bigint: true });
    canonicalPath = await realpath(path);
  } catch {
    await handle.close();
    refusePath(`${label}_open_refused`);
  }
  if (!opened.isDirectory() || !sameIdentity(before, opened)) {
    await handle.close();
    refusePath(`${label}_identity_changed`);
  }
  return { path, label, handle, opened, canonicalPath };
}

async function assertStableDirectoryRoot(root) {
  const after = await root.handle.stat({ bigint: true });
  const pathAfter = await lstat(root.path, { bigint: true }).catch(() =>
    refusePath(`${root.label}_identity_changed`),
  );
  if (
    !sameStableSnapshot(root.opened, after) ||
    !sameStableSnapshot(after, pathAfter) ||
    !samePath(await realpath(root.path), root.canonicalPath)
  )
    refusePath(`${root.label}_changed_while_reading`);
}

async function assertDirectoryRootIdentity(root) {
  const after = await root.handle.stat({ bigint: true });
  const pathAfter = await lstat(root.path, { bigint: true }).catch(() =>
    refusePath(`${root.label}_identity_changed`),
  );
  if (
    !sameIdentity(root.opened, after) ||
    !sameIdentity(after, pathAfter) ||
    !samePath(await realpath(root.path), root.canonicalPath)
  )
    refusePath(`${root.label}_identity_changed`);
}

async function requireExactRegularFiles(root, expected) {
  const entries = await readdir(root.path, { withFileTypes: true });
  if (
    entries.length !== expected.size ||
    entries.some((entry) => !entry.isFile() || !expected.has(entry.name))
  )
    throw new Error(`G12_STAGING_BASELINE_BOOTSTRAP_${root.label.toUpperCase()}_CONTENTS_REFUSED`);
  for (const name of expected) {
    const metadata = await lstat(resolve(root.path, name), { bigint: true });
    if (metadata.isSymbolicLink() || !metadata.isFile()) refusePath(`${root.label}_file_not_regular`);
  }
  await assertStableDirectoryRoot(root);
}

async function assertAbsent(path, label) {
  try {
    await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    refusePath(`${label}_uninspectable`);
  }
  refusePath(`${label}_exists`);
}

function validateLexicalPaths(paths) {
  const cwd = resolve(process.cwd());
  if (samePath(paths.output, parse(paths.output).root)) refusePath("output_root");
  if (samePath(paths.output, cwd)) refusePath("output_cwd");
  if (strictlyContains(paths.output, cwd)) refusePath("output_cwd_ancestor");
  for (const [label, path] of [
    ["source", paths.source],
    ["bridge", paths.bridge],
    ["record", paths.record],
  ]) {
    if (samePath(path, parse(path).root) || samePath(path, cwd)) refusePath(`${label}_unsafe_root`);
    if (pathsOverlap(paths.output, path)) refusePath(`output_${label}_overlap`);
  }
  if (pathsOverlap(paths.source, paths.bridge)) refusePath("source_bridge_overlap");
  if (pathsOverlap(paths.source, paths.record)) refusePath("source_record_overlap");
  if (pathsOverlap(paths.bridge, paths.record)) refusePath("bridge_record_overlap");
}

const rawPaths = {
  output: requiredArgument("output-dist"),
  record: requiredArgument("record"),
  bridge: requiredArgument("bridge-artifact-dir"),
  source: requiredArgument("source-artifact-dir"),
};
const paths = Object.fromEntries(Object.entries(rawPaths).map(([key, value]) => [key, resolve(value)]));
validateLexicalPaths(paths);
await assertAbsent(paths.output, "output");
await assertNoSymlinkComponents(dirname(paths.record), "record");

const recordBytes = await stableReadRegularFile(paths.record, "record");
const record = JSON.parse(recordBytes.toString("utf8"));
const recordValidation = validateStagingBaselineBootstrapRecord(record);
if (!recordValidation.valid)
  throw new Error(`G12_STAGING_BASELINE_BOOTSTRAP_RECORD_REFUSED:${recordValidation.violations.join(",")}`);

let bridgeRoot;
let sourceRoot;
let outputParentRoot;
try {
  bridgeRoot = await openStableDirectoryRoot(paths.bridge, "bridge");
  sourceRoot = await openStableDirectoryRoot(paths.source, "source");
  outputParentRoot = await openStableDirectoryRoot(dirname(paths.output), "output_parent");
  const canonicalPaths = {
    ...paths,
    record: await realpath(paths.record),
    bridge: bridgeRoot.canonicalPath,
    source: sourceRoot.canonicalPath,
    output: resolve(outputParentRoot.canonicalPath, basename(paths.output)),
  };
  validateLexicalPaths(canonicalPaths);

  await requireExactRegularFiles(bridgeRoot, new Set(["staging-frontend-bridge-evidence.json"]));
  await requireExactRegularFiles(sourceRoot, new Set([record.source.archiveFile, record.source.sealFile]));

  const evidenceBytes = await stableReadRegularFile(
    resolve(paths.bridge, "staging-frontend-bridge-evidence.json"),
    "bridge_evidence",
  );
  if (sha256Bytes(evidenceBytes) !== record.bridge.evidenceSha256)
    throw new Error("G12_STAGING_BASELINE_BOOTSTRAP_EVIDENCE_DIGEST_REFUSED");
  const evidence = JSON.parse(evidenceBytes.toString("utf8"));
  if (
    evidence?.schemaVersion !== 4 ||
    evidence?.event !== "g12.staging.frontend_bridge.promoted" ||
    evidence?.repository !== record.repository ||
    evidence?.candidateSha !== record.candidateSha ||
    String(evidence?.workflow?.runId ?? "") !== record.bridge.runId ||
    evidence?.workflow?.runAttempt !== record.bridge.runAttempt ||
    evidence?.workflow?.controlSha !== record.bridge.controlSha ||
    evidence?.canonical?.deploymentId !== record.canonical.deploymentId ||
    evidence?.canonical?.release !== record.candidateSha ||
    evidence?.canonical?.createdOn !== record.canonical.createdOn ||
    evidence?.canonical?.commitMessage !== record.canonical.commitMessage ||
    evidence?.dist?.archiveSha256 !== record.dist.archiveSha256 ||
    evidence?.dist?.treeSha256 !== record.dist.treeSha256 ||
    evidence?.rollbackReady !== true
  )
    throw new Error("G12_STAGING_BASELINE_BOOTSTRAP_EVIDENCE_BINDING_REFUSED");

  const sealBytes = await stableReadRegularFile(resolve(paths.source, record.source.sealFile), "source_seal");
  if (sha256Bytes(sealBytes) !== record.source.sealSha256)
    throw new Error("G12_STAGING_BASELINE_BOOTSTRAP_SEAL_DIGEST_REFUSED");
  const seal = JSON.parse(sealBytes.toString("utf8"));
  if (
    seal?.candidateSha !== record.candidateSha ||
    seal?.archiveFile !== record.source.archiveFile ||
    seal?.archiveSha256 !== record.dist.archiveSha256 ||
    seal?.treeSha256 !== record.dist.treeSha256 ||
    seal?.archiveBytes !== record.dist.archiveBytes ||
    seal?.fileCount !== record.dist.fileCount ||
    seal?.byteCount !== record.dist.byteCount
  )
    throw new Error("G12_STAGING_BASELINE_BOOTSTRAP_SEAL_BINDING_REFUSED");

  await assertStableDirectoryRoot(bridgeRoot);
  await assertStableDirectoryRoot(sourceRoot);
  await assertStableDirectoryRoot(outputParentRoot);
  await assertAbsent(paths.output, "output");

  const privateRoot = await mkdtemp(join(tmpdir(), "g12-staging-baseline-bootstrap-"));
  let snapshot;
  try {
    const privateDist = resolve(privateRoot, "dist");
    snapshot = await materializeProductionDistArchive(
      resolve(paths.source, record.source.archiveFile),
      seal,
      record.candidateSha,
      privateDist,
    );
    await assertStableDirectoryRoot(sourceRoot);
    await assertStableDirectoryRoot(outputParentRoot);
    await assertAbsent(paths.output, "output");
    await cp(privateDist, paths.output, {
      recursive: true,
      force: false,
      errorOnExist: true,
      mode: constants.COPYFILE_EXCL,
    });
  } finally {
    await rm(privateRoot, { recursive: true, force: true });
  }

  const published = await verifyProductionDistSeal(paths.output, seal, record.candidateSha);
  if (!published.valid)
    throw new Error(`G12_STAGING_BASELINE_BOOTSTRAP_OUTPUT_REFUSED:${published.violations.join(",")}`);
  await assertDirectoryRootIdentity(outputParentRoot);
  await assertStableDirectoryRoot(bridgeRoot);
  await assertStableDirectoryRoot(sourceRoot);

  if (process.env.GITHUB_OUTPUT)
    await appendFile(
      process.env.GITHUB_OUTPUT,
      [
        `archive_path=${resolve(paths.source, record.source.archiveFile)}`,
        `seal_path=${resolve(paths.source, record.source.sealFile)}`,
        `archive_sha256=${seal.archiveSha256}`,
        `tree_sha256=${seal.treeSha256}`,
        `archive_bytes=${seal.archiveBytes}`,
        `file_count=${snapshot.fileCount}`,
        `byte_count=${snapshot.byteCount}`,
        "",
      ].join("\n"),
      "utf8",
    );
  console.log(
    JSON.stringify({
      event: "g12.staging.baseline_bootstrap.materialized",
      candidateSha: record.candidateSha,
      archiveSha256: seal.archiveSha256,
      treeSha256: snapshot.treeSha256,
      fileCount: snapshot.fileCount,
      byteCount: snapshot.byteCount,
    }),
  );
} finally {
  await Promise.all(
    [bridgeRoot, sourceRoot, outputParentRoot].filter(Boolean).map((root) => root.handle.close()),
  );
}
