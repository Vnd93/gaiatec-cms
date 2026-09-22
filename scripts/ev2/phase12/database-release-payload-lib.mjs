import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, realpath, rm, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, parse, relative, resolve } from "node:path";

const MAGIC = Buffer.from("G12DBRP1\n", "ascii");
const LENGTH_BYTES = 4;
const MAXIMUM_MANIFEST_BYTES = 4 * 1024 * 1024;
const MAXIMUM_FILE_BYTES = 64 * 1024 * 1024;
// Encoding and verification deliberately retain one sealed payload plus its decoded
// file slices. Keep the accepted envelope well below the default Node heap and
// reject the aggregate before retaining another source file.
const MAXIMUM_PAYLOAD_BYTES = 128 * 1024 * 1024;
const MAXIMUM_CONTENT_BYTES = MAXIMUM_PAYLOAD_BYTES - MAGIC.length - LENGTH_BYTES - MAXIMUM_MANIFEST_BYTES;
const MAXIMUM_FILE_COUNT = 10_000;
const FULL_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MIGRATION_NAME = /^(\d{4,14})_[A-Za-z0-9][A-Za-z0-9._-]*\.sql$/;
const REQUIRED_PROFILES = new Set(["database-auth", "full-release"]);
const OMITTED_PROFILES = new Set(["frontend-only", "edge-only"]);
const ENVIRONMENTS = new Set(["staging", "production"]);
const CONFIG_PATH = "supabase/config.toml";
const MIGRATIONS_PREFIX = "supabase/migrations/";
const AUTH_RUNTIME_FILES = Object.freeze([
  "scripts/ev2/phase12/configure-staging-auth.mjs",
  "scripts/ev2/phase12/production-backend-lib.mjs",
  "scripts/ev2/phase12/staging-auth-config-lib.mjs",
]);
const STATIC_FILES = Object.freeze([CONFIG_PATH, ...AUTH_RUNTIME_FILES]);
const STATIC_FILE_SET = new Set(STATIC_FILES);
const MATERIALIZED_MANIFEST = "database-release-manifest.json";
const DEPLOYMENT_CONTRACT = Object.freeze({
  cli: "supabase",
  version: "2.116.0",
  command: "db push",
  flags: Object.freeze(["--linked", "--include-all"]),
  rolesIncluded: false,
  seedIncluded: false,
});

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return isObject(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map((entry) => canonicalize(entry));
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(canonicalize(value))}\n`, "utf8");
}

function normalizeWindowsPath(value) {
  return process.platform === "win32" ? value.toLowerCase() : value;
}

function isWithin(root, candidate) {
  const relation = relative(resolve(root), resolve(candidate));
  return relation === "" || (!relation.startsWith("..") && !isAbsolute(relation));
}

async function resolveThroughExistingAncestor(path) {
  const requested = resolve(path);
  let ancestor = dirname(requested);
  const suffix = [basename(requested)];
  while (true) {
    try {
      return resolve(await realpath(ancestor), ...suffix);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = dirname(ancestor);
      if (parent === ancestor) throw error;
      suffix.unshift(basename(ancestor));
      ancestor = parent;
    }
  }
}

function assertIdentity({ candidateSha, environment, profile }) {
  if (!FULL_SHA.test(candidateSha ?? "")) {
    throw new Error("G12_DATABASE_RELEASE_PAYLOAD_CANDIDATE_SHA_REFUSED");
  }
  if (!ENVIRONMENTS.has(environment)) {
    throw new Error("G12_DATABASE_RELEASE_PAYLOAD_ENVIRONMENT_REFUSED");
  }
  if (!REQUIRED_PROFILES.has(profile) && !OMITTED_PROFILES.has(profile)) {
    throw new Error("G12_DATABASE_RELEASE_PAYLOAD_PROFILE_REFUSED");
  }
}

export function databaseReleasePayloadRequirement(profile) {
  if (REQUIRED_PROFILES.has(profile)) {
    return { required: true, omitted: false, reason: "database_mutation_profile" };
  }
  if (OMITTED_PROFILES.has(profile)) {
    return { required: false, omitted: true, reason: "profile_without_database_mutation" };
  }
  throw new Error("G12_DATABASE_RELEASE_PAYLOAD_PROFILE_REFUSED");
}

export function databaseReleasePayloadArtifactName({ candidateSha, environment, profile }) {
  assertIdentity({ candidateSha, environment, profile });
  if (!REQUIRED_PROFILES.has(profile)) {
    throw new Error("G12_DATABASE_RELEASE_PAYLOAD_ARTIFACT_NOT_REQUIRED");
  }
  return `database-release-${environment}-${candidateSha}-${profile}.g12db`;
}

async function assertAbsent(path, code) {
  try {
    await lstat(resolve(path));
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  throw new Error(code);
}

async function readStableRegularFile(path, maximumBytes, code) {
  const target = resolve(path);
  const linkMetadata = await lstat(target);
  if (!linkMetadata.isFile() || linkMetadata.isSymbolicLink()) {
    throw new Error(`${code}_TYPE_REFUSED`);
  }
  const handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = await handle.stat({ bigint: true });
    if (before.size < 1n || before.size > BigInt(maximumBytes)) {
      throw new Error(`${code}_SIZE_REFUSED`);
    }
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      BigInt(bytes.length) !== before.size
    ) {
      throw new Error(`${code}_CHANGED_WHILE_READING`);
    }
    return { bytes, sha256: sha256(bytes) };
  } finally {
    await handle.close();
  }
}

async function requireStableDirectory(path, code) {
  const target = resolve(path);
  const metadata = await lstat(target, { bigint: true });
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error(`${code}_TYPE_REFUSED`);
  }
  return { target, metadata };
}

function runGit(sourceRoot, args, options = {}) {
  try {
    return execFileSync("git", ["-C", sourceRoot, ...args], {
      encoding: options.encoding,
      maxBuffer: options.maxBuffer ?? MAXIMUM_FILE_BYTES + 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    throw new Error("G12_DATABASE_RELEASE_PAYLOAD_GIT_REFUSED", { cause: error });
  }
}

async function assertGitBinding(sourceRoot, candidateSha, files) {
  const topLevelText = runGit(sourceRoot, ["rev-parse", "--show-toplevel"], { encoding: "utf8" });
  const topLevel = await realpath(String(topLevelText).trim());
  const sourceReal = await realpath(sourceRoot);
  if (normalizeWindowsPath(topLevel) !== normalizeWindowsPath(sourceReal)) {
    throw new Error("G12_DATABASE_RELEASE_PAYLOAD_GIT_ROOT_REFUSED");
  }
  const head = String(
    runGit(sourceRoot, ["rev-parse", "--verify", "HEAD^{commit}"], { encoding: "utf8" }),
  ).trim();
  if (head !== candidateSha) {
    throw new Error("G12_DATABASE_RELEASE_PAYLOAD_GIT_SHA_MISMATCH");
  }

  const treeEntries = runGit(sourceRoot, [
    "ls-tree",
    "-r",
    "-z",
    candidateSha,
    "--",
    CONFIG_PATH,
    ...AUTH_RUNTIME_FILES,
    "supabase/migrations",
  ])
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((entry) => {
      const match = /^(100644|100755) blob [a-f0-9]{40}\t(.+)$/.exec(entry);
      if (!match) throw new Error("G12_DATABASE_RELEASE_PAYLOAD_GIT_FILE_MODE_REFUSED");
      return { mode: match[1], path: match[2] };
    });
  const tracked = treeEntries.map(({ path }) => path).sort();
  const expected = files.map(({ path }) => path).sort();
  if (JSON.stringify(tracked) !== JSON.stringify(expected)) {
    throw new Error("G12_DATABASE_RELEASE_PAYLOAD_GIT_INVENTORY_MISMATCH");
  }
  for (const file of files) {
    const committed = runGit(sourceRoot, ["show", `${candidateSha}:${file.path}`]);
    if (!committed.equals(file.bytes)) {
      throw new Error("G12_DATABASE_RELEASE_PAYLOAD_GIT_BYTES_MISMATCH");
    }
  }
}

function validatePaths(paths) {
  if (
    paths.length < STATIC_FILES.length + 1 ||
    paths.length > MAXIMUM_FILE_COUNT ||
    new Set(paths).size !== paths.length ||
    STATIC_FILES.some((path) => !paths.includes(path))
  ) {
    throw new Error("G12_DATABASE_RELEASE_PAYLOAD_FILE_INVENTORY_REFUSED");
  }
  const versions = new Set();
  for (const path of paths) {
    if (STATIC_FILE_SET.has(path)) continue;
    if (
      typeof path !== "string" ||
      !path.startsWith(MIGRATIONS_PREFIX) ||
      path.includes("\\") ||
      path.includes("\0")
    ) {
      throw new Error("G12_DATABASE_RELEASE_PAYLOAD_PATH_REFUSED");
    }
    const name = path.slice(MIGRATIONS_PREFIX.length);
    const match = MIGRATION_NAME.exec(name);
    if (
      !match ||
      name.includes("/") ||
      path.split("/").some((segment) => ["", ".", ".."].includes(segment))
    ) {
      throw new Error("G12_DATABASE_RELEASE_PAYLOAD_PATH_REFUSED");
    }
    if (versions.has(match[1])) {
      throw new Error("G12_DATABASE_RELEASE_PAYLOAD_MIGRATION_VERSION_DUPLICATED");
    }
    versions.add(match[1]);
  }
  if (JSON.stringify(paths) !== JSON.stringify([...paths].sort())) {
    throw new Error("G12_DATABASE_RELEASE_PAYLOAD_FILE_INVENTORY_REFUSED");
  }
}

async function collectSourceFiles(sourceRoot) {
  const root = resolve(sourceRoot);
  const rootMetadata = await lstat(root);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
    throw new Error("G12_DATABASE_RELEASE_PAYLOAD_SOURCE_ROOT_REFUSED");
  }
  const supabase = await requireStableDirectory(
    resolve(root, "supabase"),
    "G12_DATABASE_RELEASE_PAYLOAD_SUPABASE",
  );
  const scripts = await requireStableDirectory(
    resolve(root, "scripts"),
    "G12_DATABASE_RELEASE_PAYLOAD_SCRIPTS",
  );
  const ev2 = await requireStableDirectory(
    resolve(root, "scripts", "ev2"),
    "G12_DATABASE_RELEASE_PAYLOAD_EV2",
  );
  const phase12 = await requireStableDirectory(
    resolve(root, "scripts", "ev2", "phase12"),
    "G12_DATABASE_RELEASE_PAYLOAD_PHASE12",
  );
  const migrations = await requireStableDirectory(
    resolve(root, "supabase", "migrations"),
    "G12_DATABASE_RELEASE_PAYLOAD_MIGRATIONS",
  );
  const beforeEntries = await readdir(migrations.target, { withFileTypes: true });
  if (beforeEntries.length < 1 || beforeEntries.length > MAXIMUM_FILE_COUNT - 1) {
    throw new Error("G12_DATABASE_RELEASE_PAYLOAD_MIGRATION_COUNT_REFUSED");
  }
  const names = beforeEntries.map(({ name }) => name).sort();
  if (
    beforeEntries.some(
      (entry) =>
        !entry.isFile() ||
        entry.isSymbolicLink() ||
        !MIGRATION_NAME.test(entry.name) ||
        entry.name.includes("/") ||
        entry.name.includes("\\"),
    )
  ) {
    throw new Error("G12_DATABASE_RELEASE_PAYLOAD_MIGRATION_ENTRY_REFUSED");
  }
  const paths = [...STATIC_FILES, ...names.map((name) => `${MIGRATIONS_PREFIX}${name}`)].sort();
  validatePaths(paths);
  const files = [];
  let retainedBytes = 0;
  for (const repositoryPath of paths) {
    const identity = await readStableRegularFile(
      resolve(root, ...repositoryPath.split("/")),
      MAXIMUM_FILE_BYTES,
      "G12_DATABASE_RELEASE_PAYLOAD_SOURCE_FILE",
    );
    if (
      !Number.isSafeInteger(retainedBytes + identity.bytes.length) ||
      retainedBytes + identity.bytes.length > MAXIMUM_CONTENT_BYTES
    ) {
      throw new Error("G12_DATABASE_RELEASE_PAYLOAD_SIZE_REFUSED");
    }
    retainedBytes += identity.bytes.length;
    files.push({ path: repositoryPath, bytes: identity.bytes, sha256: identity.sha256 });
  }
  const afterEntries = (await readdir(migrations.target, { withFileTypes: true }))
    .map(({ name }) => name)
    .sort();
  const migrationsAfter = await lstat(migrations.target, { bigint: true });
  const supabaseAfter = await lstat(supabase.target, { bigint: true });
  const scriptsAfter = await lstat(scripts.target, { bigint: true });
  const ev2After = await lstat(ev2.target, { bigint: true });
  const phase12After = await lstat(phase12.target, { bigint: true });
  if (
    JSON.stringify(names) !== JSON.stringify(afterEntries) ||
    migrations.metadata.dev !== migrationsAfter.dev ||
    migrations.metadata.ino !== migrationsAfter.ino ||
    migrations.metadata.mtimeNs !== migrationsAfter.mtimeNs ||
    supabase.metadata.dev !== supabaseAfter.dev ||
    supabase.metadata.ino !== supabaseAfter.ino ||
    scripts.metadata.dev !== scriptsAfter.dev ||
    scripts.metadata.ino !== scriptsAfter.ino ||
    scripts.metadata.mtimeNs !== scriptsAfter.mtimeNs ||
    ev2.metadata.dev !== ev2After.dev ||
    ev2.metadata.ino !== ev2After.ino ||
    ev2.metadata.mtimeNs !== ev2After.mtimeNs ||
    phase12.metadata.dev !== phase12After.dev ||
    phase12.metadata.ino !== phase12After.ino ||
    phase12.metadata.mtimeNs !== phase12After.mtimeNs
  ) {
    throw new Error("G12_DATABASE_RELEASE_PAYLOAD_SOURCE_CHANGED");
  }
  return { root, files };
}

function fileDescriptors(files) {
  return files.map((file) => ({ path: file.path, bytes: file.bytes.length, sha256: file.sha256 }));
}

function treeSha256(descriptors) {
  return sha256(canonicalJsonBytes(descriptors));
}

function createManifest({ candidateSha, environment, profile, files }) {
  const descriptors = fileDescriptors(files);
  return {
    schemaVersion: 1,
    event: "g12.database.release_payload",
    format: "g12-database-release-payload-v1",
    repository: "Vnd93/gaiatec-cms",
    artifactName: databaseReleasePayloadArtifactName({ candidateSha, environment, profile }),
    candidateSha,
    environment,
    releaseProfile: profile,
    deployment: structuredClone(DEPLOYMENT_CONTRACT),
    fileCount: descriptors.length,
    byteCount: descriptors.reduce((total, file) => total + file.bytes, 0),
    treeSha256: treeSha256(descriptors),
    files: descriptors,
  };
}

function encodePayload(manifest, files) {
  const manifestBytes = canonicalJsonBytes(manifest);
  if (manifestBytes.length > MAXIMUM_MANIFEST_BYTES) {
    throw new Error("G12_DATABASE_RELEASE_PAYLOAD_MANIFEST_SIZE_REFUSED");
  }
  const length = Buffer.alloc(LENGTH_BYTES);
  length.writeUInt32BE(manifestBytes.length);
  const payload = Buffer.concat([MAGIC, length, manifestBytes, ...files.map(({ bytes }) => bytes)]);
  if (payload.length > MAXIMUM_PAYLOAD_BYTES) {
    throw new Error("G12_DATABASE_RELEASE_PAYLOAD_SIZE_REFUSED");
  }
  return { manifestBytes, payload };
}

function validateManifest(manifest, expected = {}) {
  if (
    !exactKeys(manifest, [
      "schemaVersion",
      "event",
      "format",
      "repository",
      "artifactName",
      "candidateSha",
      "environment",
      "releaseProfile",
      "deployment",
      "fileCount",
      "byteCount",
      "treeSha256",
      "files",
    ]) ||
    manifest.schemaVersion !== 1 ||
    manifest.event !== "g12.database.release_payload" ||
    manifest.format !== "g12-database-release-payload-v1" ||
    manifest.repository !== "Vnd93/gaiatec-cms"
  ) {
    throw new Error("G12_DATABASE_RELEASE_PAYLOAD_MANIFEST_SCHEMA_REFUSED");
  }
  assertIdentity({
    candidateSha: manifest.candidateSha,
    environment: manifest.environment,
    profile: manifest.releaseProfile,
  });
  if (!REQUIRED_PROFILES.has(manifest.releaseProfile)) {
    throw new Error("G12_DATABASE_RELEASE_PAYLOAD_MANIFEST_PROFILE_REFUSED");
  }
  if (
    manifest.artifactName !==
    databaseReleasePayloadArtifactName({
      candidateSha: manifest.candidateSha,
      environment: manifest.environment,
      profile: manifest.releaseProfile,
    })
  ) {
    throw new Error("G12_DATABASE_RELEASE_PAYLOAD_ARTIFACT_NAME_REFUSED");
  }
  if (
    !exactKeys(manifest.deployment, [
      "cli",
      "version",
      "command",
      "flags",
      "rolesIncluded",
      "seedIncluded",
    ]) ||
    !canonicalJsonBytes(manifest.deployment).equals(canonicalJsonBytes(DEPLOYMENT_CONTRACT))
  ) {
    throw new Error("G12_DATABASE_RELEASE_PAYLOAD_DEPLOYMENT_CONTRACT_REFUSED");
  }
  if (!Array.isArray(manifest.files)) {
    throw new Error("G12_DATABASE_RELEASE_PAYLOAD_FILES_REFUSED");
  }
  const paths = manifest.files.map((file) => file?.path);
  validatePaths(paths);
  for (const file of manifest.files) {
    if (
      !exactKeys(file, ["path", "bytes", "sha256"]) ||
      !Number.isSafeInteger(file.bytes) ||
      file.bytes < 1 ||
      file.bytes > MAXIMUM_FILE_BYTES ||
      !SHA256.test(file.sha256 ?? "")
    ) {
      throw new Error("G12_DATABASE_RELEASE_PAYLOAD_FILE_DESCRIPTOR_REFUSED");
    }
  }
  const byteCount = manifest.files.reduce((total, file) => total + file.bytes, 0);
  if (
    manifest.fileCount !== manifest.files.length ||
    !Number.isSafeInteger(manifest.fileCount) ||
    manifest.byteCount !== byteCount ||
    !Number.isSafeInteger(manifest.byteCount) ||
    manifest.treeSha256 !== treeSha256(manifest.files) ||
    !SHA256.test(manifest.treeSha256 ?? "")
  ) {
    throw new Error("G12_DATABASE_RELEASE_PAYLOAD_MANIFEST_TOTALS_REFUSED");
  }
  for (const [label, actual, wanted] of [
    ["CANDIDATE", manifest.candidateSha, expected.candidateSha],
    ["ENVIRONMENT", manifest.environment, expected.environment],
    ["PROFILE", manifest.releaseProfile, expected.profile],
  ]) {
    if (wanted !== undefined && wanted !== "" && actual !== wanted) {
      throw new Error(`G12_DATABASE_RELEASE_PAYLOAD_${label}_MISMATCH`);
    }
  }
  return manifest;
}

function decodePayload(bytes, expected = {}) {
  if (
    bytes.length < MAGIC.length + LENGTH_BYTES + 2 ||
    bytes.length > MAXIMUM_PAYLOAD_BYTES ||
    !bytes.subarray(0, MAGIC.length).equals(MAGIC)
  ) {
    throw new Error("G12_DATABASE_RELEASE_PAYLOAD_FORMAT_REFUSED");
  }
  const manifestLength = bytes.readUInt32BE(MAGIC.length);
  const manifestStart = MAGIC.length + LENGTH_BYTES;
  const manifestEnd = manifestStart + manifestLength;
  if (manifestLength < 2 || manifestLength > MAXIMUM_MANIFEST_BYTES || manifestEnd > bytes.length) {
    throw new Error("G12_DATABASE_RELEASE_PAYLOAD_MANIFEST_LENGTH_REFUSED");
  }
  const manifestBytes = bytes.subarray(manifestStart, manifestEnd);
  let manifest;
  try {
    manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes));
  } catch (error) {
    throw new Error("G12_DATABASE_RELEASE_PAYLOAD_MANIFEST_JSON_REFUSED", { cause: error });
  }
  validateManifest(manifest, expected);
  if (!manifestBytes.equals(canonicalJsonBytes(manifest))) {
    throw new Error("G12_DATABASE_RELEASE_PAYLOAD_MANIFEST_CANONICAL_REFUSED");
  }
  const files = [];
  let offset = manifestEnd;
  for (const descriptor of manifest.files) {
    const end = offset + descriptor.bytes;
    if (!Number.isSafeInteger(end) || end > bytes.length) {
      throw new Error("G12_DATABASE_RELEASE_PAYLOAD_FILE_BOUNDARY_REFUSED");
    }
    const fileBytes = Buffer.from(bytes.subarray(offset, end));
    if (sha256(fileBytes) !== descriptor.sha256) {
      throw new Error("G12_DATABASE_RELEASE_PAYLOAD_FILE_DIGEST_MISMATCH");
    }
    files.push({ ...descriptor, bytes: fileBytes });
    offset = end;
  }
  if (offset !== bytes.length) {
    throw new Error("G12_DATABASE_RELEASE_PAYLOAD_TRAILING_BYTES_REFUSED");
  }
  return {
    manifest,
    manifestBytes: Buffer.from(manifestBytes),
    manifestSha256: sha256(manifestBytes),
    payloadSha256: sha256(bytes),
    files,
  };
}

async function writeExclusiveFile(path, bytes, mode = 0o400) {
  const target = resolve(path);
  let handle;
  try {
    handle = await open(
      target,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0),
      mode,
    );
    await handle.writeFile(bytes);
    await handle.sync();
  } catch (error) {
    if (handle) {
      await handle.close().catch(() => {});
      handle = undefined;
      await unlink(target).catch(() => {});
    }
    throw error;
  } finally {
    if (handle) await handle.close();
  }
}

async function requireNewOutputDirectory(path) {
  const requestedOutput = resolve(path);
  if (requestedOutput === parse(requestedOutput).root || requestedOutput === resolve(".")) {
    throw new Error("G12_DATABASE_RELEASE_PAYLOAD_OUTPUT_REFUSED");
  }
  await assertAbsent(requestedOutput, "G12_DATABASE_RELEASE_PAYLOAD_OUTPUT_MUST_BE_NEW");
  const output = await resolveThroughExistingAncestor(requestedOutput);
  if (output === parse(output).root || output === resolve(".")) {
    throw new Error("G12_DATABASE_RELEASE_PAYLOAD_OUTPUT_REFUSED");
  }
  await assertAbsent(output, "G12_DATABASE_RELEASE_PAYLOAD_OUTPUT_MUST_BE_NEW");
  await mkdir(output, { mode: 0o700 });
  return realpath(output);
}

export async function writeDatabaseReleasePayload({
  sourceRoot,
  outputPath,
  candidateSha,
  environment,
  profile,
}) {
  assertIdentity({ candidateSha, environment, profile });
  const requirement = databaseReleasePayloadRequirement(profile);
  const requestedOutput = resolve(outputPath);
  if (!requirement.required) {
    await assertAbsent(requestedOutput, "G12_DATABASE_RELEASE_PAYLOAD_OMITTED_OUTPUT_PRESENT");
    return { ...requirement, candidateSha, environment, profile };
  }
  const collected = await collectSourceFiles(sourceRoot);
  const output = await resolveThroughExistingAncestor(requestedOutput);
  const sourceSupabase = await realpath(resolve(collected.root, "supabase"));
  const sourcePhase12 = await realpath(resolve(collected.root, "scripts", "ev2", "phase12"));
  if (isWithin(sourceSupabase, output) || isWithin(sourcePhase12, output)) {
    throw new Error("G12_DATABASE_RELEASE_PAYLOAD_OUTPUT_INSIDE_SOURCE_REFUSED");
  }
  await assertGitBinding(collected.root, candidateSha, collected.files);
  const manifest = createManifest({
    candidateSha,
    environment,
    profile,
    files: collected.files,
  });
  const encoded = encodePayload(manifest, collected.files);
  await mkdir(dirname(output), { recursive: true, mode: 0o700 });
  let created = false;
  try {
    await writeExclusiveFile(output, encoded.payload, 0o400);
    created = true;
    const written = await readStableRegularFile(
      output,
      MAXIMUM_PAYLOAD_BYTES,
      "G12_DATABASE_RELEASE_PAYLOAD_OUTPUT",
    );
    if (!written.bytes.equals(encoded.payload)) {
      throw new Error("G12_DATABASE_RELEASE_PAYLOAD_OUTPUT_BYTES_MISMATCH");
    }
    return {
      ...requirement,
      candidateSha,
      environment,
      profile,
      artifactName: manifest.artifactName,
      manifest,
      manifestSha256: sha256(encoded.manifestBytes),
      payloadSha256: written.sha256,
      payloadBytes: written.bytes.length,
    };
  } catch (error) {
    if (created) await unlink(output).catch(() => {});
    throw error;
  }
}

export async function verifyDatabaseReleasePayload({
  payloadPath,
  outputDirectory,
  candidateSha,
  environment,
  profile,
  expectedPayloadSha256,
}) {
  assertIdentity({ candidateSha, environment, profile });
  const requirement = databaseReleasePayloadRequirement(profile);
  if (!requirement.required) {
    if (expectedPayloadSha256 !== undefined && expectedPayloadSha256 !== "") {
      throw new Error("G12_DATABASE_RELEASE_PAYLOAD_OMITTED_DIGEST_PRESENT");
    }
    await assertAbsent(payloadPath, "G12_DATABASE_RELEASE_PAYLOAD_UNEXPECTED_FOR_PROFILE");
    await assertAbsent(outputDirectory, "G12_DATABASE_RELEASE_PAYLOAD_OMITTED_OUTPUT_PRESENT");
    return { ...requirement, candidateSha, environment, profile };
  }
  if (!SHA256.test(expectedPayloadSha256 ?? "")) {
    throw new Error("G12_DATABASE_RELEASE_PAYLOAD_EXPECTED_SHA256_REFUSED");
  }
  const payload = await readStableRegularFile(
    payloadPath,
    MAXIMUM_PAYLOAD_BYTES,
    "G12_DATABASE_RELEASE_PAYLOAD_INPUT",
  );
  if (payload.sha256 !== expectedPayloadSha256) {
    throw new Error("G12_DATABASE_RELEASE_PAYLOAD_SHA256_MISMATCH");
  }
  const decoded = decodePayload(payload.bytes, { candidateSha, environment, profile });
  const output = await requireNewOutputDirectory(outputDirectory);
  try {
    const materializedSupabase = resolve(output, "supabase");
    const materializedMigrations = resolve(materializedSupabase, "migrations");
    const materializedScripts = resolve(output, "scripts");
    const materializedEv2 = resolve(materializedScripts, "ev2");
    const materializedPhase12 = resolve(materializedEv2, "phase12");
    await mkdir(materializedSupabase, { mode: 0o700 });
    await mkdir(materializedMigrations, { mode: 0o700 });
    await mkdir(materializedScripts, { mode: 0o700 });
    await mkdir(materializedEv2, { mode: 0o700 });
    await mkdir(materializedPhase12, { mode: 0o700 });
    const outputReal = await realpath(output);
    for (const [directory, code] of [
      [materializedSupabase, "G12_DATABASE_RELEASE_PAYLOAD_MATERIALIZED_SUPABASE"],
      [materializedMigrations, "G12_DATABASE_RELEASE_PAYLOAD_MATERIALIZED_MIGRATIONS"],
      [materializedScripts, "G12_DATABASE_RELEASE_PAYLOAD_MATERIALIZED_SCRIPTS"],
      [materializedEv2, "G12_DATABASE_RELEASE_PAYLOAD_MATERIALIZED_EV2"],
      [materializedPhase12, "G12_DATABASE_RELEASE_PAYLOAD_MATERIALIZED_PHASE12"],
    ]) {
      const stable = await requireStableDirectory(directory, code);
      const actual = await realpath(stable.target);
      const expected = resolve(outputReal, relative(output, stable.target));
      if (normalizeWindowsPath(actual) !== normalizeWindowsPath(expected)) {
        throw new Error(`${code}_SYMLINK_REFUSED`);
      }
    }
    for (const file of decoded.files) {
      const target = resolve(output, ...file.path.split("/"));
      if (!isWithin(output, target)) {
        throw new Error("G12_DATABASE_RELEASE_PAYLOAD_PATH_ESCAPE_REFUSED");
      }
      await writeExclusiveFile(target, file.bytes, 0o400);
    }
    await writeExclusiveFile(resolve(output, MATERIALIZED_MANIFEST), decoded.manifestBytes, 0o400);
    for (const file of decoded.files) {
      const materialized = await readStableRegularFile(
        resolve(output, ...file.path.split("/")),
        MAXIMUM_FILE_BYTES,
        "G12_DATABASE_RELEASE_PAYLOAD_MATERIALIZED_FILE",
      );
      if (materialized.sha256 !== file.sha256 || materialized.bytes.length !== file.bytes.length) {
        throw new Error("G12_DATABASE_RELEASE_PAYLOAD_MATERIALIZED_BYTES_MISMATCH");
      }
    }
    return {
      ...requirement,
      candidateSha,
      environment,
      profile,
      artifactName: decoded.manifest.artifactName,
      manifest: decoded.manifest,
      manifestSha256: decoded.manifestSha256,
      payloadSha256: decoded.payloadSha256,
      payloadBytes: payload.bytes.length,
      projectDirectory: output,
      supabaseDirectory: materializedSupabase,
      materializedManifest: resolve(output, MATERIALIZED_MANIFEST),
    };
  } catch (error) {
    await rm(output, { recursive: true, force: true });
    throw error;
  }
}

export const DATABASE_RELEASE_PAYLOAD = Object.freeze({
  schemaVersion: 1,
  event: "g12.database.release_payload",
  format: "g12-database-release-payload-v1",
  repository: "Vnd93/gaiatec-cms",
  magic: MAGIC.toString("ascii"),
  manifestFile: MATERIALIZED_MANIFEST,
  configPath: CONFIG_PATH,
  migrationsPrefix: MIGRATIONS_PREFIX,
  authRuntimeFiles: AUTH_RUNTIME_FILES,
  requiredProfiles: Object.freeze([...REQUIRED_PROFILES]),
  omittedProfiles: Object.freeze([...OMITTED_PROFILES]),
  environments: Object.freeze([...ENVIRONMENTS]),
  deployment: DEPLOYMENT_CONTRACT,
});
