import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, parse, relative, resolve, sep } from "node:path";

import { ALL_EDGE_RUNTIME_SMOKE } from "./all-edge-runtime-smoke-lib.mjs";
import { RELEASE_PROFILE_NAMES } from "./release-profile-lib.mjs";
import { STAGING_FRONTEND_PACKAGE } from "./staging-frontend-package-lib.mjs";

const FULL_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const MAX_COMPONENT_FILES = 8192;
const MAX_COMPONENT_BYTES = 2 * 1024 * 1024 * 1024;
const EXACT_EDGE_FUNCTION_COUNT = 34;
const DATABASE_PAYLOAD_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.g12db$/;
const EDGE_ROOT_ENTRIES = Object.freeze([
  "artifact-files.sha256",
  "deployable",
  "evidence",
  "manifest.json",
  "raw",
  "source",
]);

export const STAGING_RELEASE_PACKAGE = Object.freeze({
  schemaVersion: 1,
  event: "g12.staging.release_package.sealed",
  environment: "staging",
  manifestFile: "staging-release-package.json",
  componentDirectories: Object.freeze({
    controls: "controls",
    frontend: "frontend",
    edge: "edge",
    database: "database",
  }),
  controlFiles: Object.freeze([
    "release-checkpoint-policy.json",
    "release-gate-matrix.json",
    "release-plan.json",
  ]),
  frontendFiles: Object.freeze([
    STAGING_FRONTEND_PACKAGE.archiveFile,
    STAGING_FRONTEND_PACKAGE.sealFile,
    STAGING_FRONTEND_PACKAGE.provenanceFile,
  ]),
});

const PROFILE_COMPONENTS = Object.freeze({
  "frontend-only": Object.freeze(["controls", "frontend"]),
  "edge-only": Object.freeze(["controls", "frontend", "edge"]),
  "database-auth": Object.freeze(["controls", "frontend", "database"]),
  "full-release": Object.freeze(["controls", "frontend", "edge", "database"]),
});

const MANIFEST_KEYS = Object.freeze([
  "schemaVersion",
  "event",
  "environment",
  "candidateSha",
  "releaseProfile",
  "artifactName",
  "source",
  "components",
]);
const SOURCE_KEYS = Object.freeze(["runId", "runAttempt"]);
const COMPONENT_KEYS = Object.freeze(["directory", "treeSha256", "fileCount", "byteCount", "files"]);
const FILE_KEYS = Object.freeze(["path", "bytes", "sha256"]);

function exactKeys(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort())
  );
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sameJson(left, right) {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map((entry) => canonicalize(entry));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function canonicalManifestBytes(value) {
  return Buffer.from(`${JSON.stringify(canonicalize(value))}\n`, "utf8");
}

function normalizePath(value) {
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

async function assertAbsent(path) {
  try {
    await lstat(resolve(path));
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  throw new Error("G12_STAGING_RELEASE_PACKAGE_REFUSED:output_must_be_new");
}

async function assertCanonicalDirectory(path, code) {
  const target = resolve(path);
  const metadata = await lstat(target);
  if (!metadata.isDirectory() || metadata.isSymbolicLink())
    throw new Error(`G12_STAGING_RELEASE_PACKAGE_REFUSED:${code}`);
  const actual = await realpath(target);
  if (normalizePath(actual) !== normalizePath(target))
    throw new Error(`G12_STAGING_RELEASE_PACKAGE_REFUSED:${code}`);
  return actual;
}

async function resolveComponentSource(path) {
  const requested = resolve(path);
  const metadata = await lstat(requested);
  if (!metadata.isDirectory() || metadata.isSymbolicLink())
    throw new Error("G12_STAGING_RELEASE_PACKAGE_REFUSED:component_root_invalid");
  return realpath(requested);
}

function safeRelativePath(value) {
  const path = String(value ?? "");
  return (
    path.length > 0 &&
    !path.includes("\\") &&
    !path.includes("\0") &&
    !path.startsWith("/") &&
    !path.endsWith("/") &&
    !path.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..")
  );
}

function validateIdentity({ candidateSha, releaseProfile, runId, runAttempt }) {
  const violations = [];
  if (!FULL_SHA.test(String(candidateSha ?? ""))) violations.push("candidate_sha_invalid");
  if (!RELEASE_PROFILE_NAMES.includes(releaseProfile)) violations.push("release_profile_invalid");
  if (!POSITIVE_INTEGER.test(String(runId ?? "")) || !Number.isSafeInteger(Number(runId)))
    violations.push("run_id_invalid");
  if (!Number.isSafeInteger(runAttempt) || runAttempt < 1 || runAttempt > 100)
    violations.push("run_attempt_invalid");
  return violations;
}

export function stagingReleaseArtifactName(candidateSha, runId, runAttempt) {
  return `staging-frontend-${candidateSha}-${runId}-${runAttempt}`;
}

async function readStableRegularFile(file, { maximumBytes = MAX_COMPONENT_BYTES } = {}) {
  const source = resolve(file);
  const metadata = await lstat(source);
  if (!metadata.isFile() || metadata.isSymbolicLink())
    throw new Error("G12_STAGING_RELEASE_PACKAGE_REFUSED:not_regular");
  if (metadata.size > maximumBytes) throw new Error("G12_STAGING_RELEASE_PACKAGE_REFUSED:file_too_large");
  const handle = await open(source, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = await handle.stat({ bigint: true });
    const buffer = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (
      before.dev !== after.dev ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ino !== after.ino ||
      BigInt(buffer.length) !== before.size
    ) {
      throw new Error("G12_STAGING_RELEASE_PACKAGE_REFUSED:changed_while_reading");
    }
    return { buffer, bytes: buffer.length, sha256: sha256(buffer) };
  } finally {
    await handle.close();
  }
}

async function requireNewDirectory(directory, forbidden = []) {
  const requested = resolve(directory);
  if (requested === parse(requested).root || requested === resolve(".")) {
    throw new Error("G12_STAGING_RELEASE_PACKAGE_REFUSED:output_path_invalid");
  }
  await assertAbsent(requested);
  const target = await resolveThroughExistingAncestor(requested);
  const canonicalForbidden = await Promise.all(forbidden.map((item) => resolveThroughExistingAncestor(item)));
  if (
    target === parse(target).root ||
    target === resolve(".") ||
    canonicalForbidden.some((item) => isWithin(item, target) || isWithin(target, item))
  ) {
    throw new Error("G12_STAGING_RELEASE_PACKAGE_REFUSED:output_path_invalid");
  }
  await assertAbsent(target);
  await mkdir(dirname(target), { recursive: true });
  await assertCanonicalDirectory(dirname(target), "output_ancestor_invalid");
  return target;
}

async function walkDirectory(root, current = root, files = []) {
  const metadata = await lstat(current);
  if (!metadata.isDirectory() || metadata.isSymbolicLink())
    throw new Error("G12_STAGING_RELEASE_PACKAGE_REFUSED:component_root_invalid");
  const entries = await readdir(current, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error("G12_STAGING_RELEASE_PACKAGE_REFUSED:symlink_forbidden");
    const absolute = resolve(current, entry.name);
    if (!isWithin(root, absolute)) throw new Error("G12_STAGING_RELEASE_PACKAGE_REFUSED:path_escape");
    if (entry.isDirectory()) {
      await walkDirectory(root, absolute, files);
      continue;
    }
    if (!entry.isFile()) throw new Error("G12_STAGING_RELEASE_PACKAGE_REFUSED:entry_type_invalid");
    const path = relative(root, absolute).split(sep).join("/");
    if (!safeRelativePath(path)) throw new Error("G12_STAGING_RELEASE_PACKAGE_REFUSED:file_path_invalid");
    const identity = await readStableRegularFile(absolute);
    files.push({ path, bytes: identity.bytes, sha256: identity.sha256 });
    if (files.length > MAX_COMPONENT_FILES)
      throw new Error("G12_STAGING_RELEASE_PACKAGE_REFUSED:too_many_files");
  }
  return files;
}

function componentTreeSha256(files) {
  return sha256(JSON.stringify(files.map(({ path, bytes, sha256 }) => [path, bytes, sha256])));
}

async function inspectComponent(directory, label) {
  const root = resolve(directory);
  const files = await walkDirectory(root);
  files.sort((left, right) => left.path.localeCompare(right.path, "en"));
  if (files.length === 0) throw new Error(`G12_STAGING_RELEASE_PACKAGE_REFUSED:${label}_empty`);
  const byteCount = files.reduce((total, file) => total + file.bytes, 0);
  if (!Number.isSafeInteger(byteCount) || byteCount > MAX_COMPONENT_BYTES)
    throw new Error(`G12_STAGING_RELEASE_PACKAGE_REFUSED:${label}_too_large`);
  return {
    directory: STAGING_RELEASE_PACKAGE.componentDirectories[label],
    treeSha256: componentTreeSha256(files),
    fileCount: files.length,
    byteCount,
    files,
  };
}

function assertExactNamedFiles(component, expected, label) {
  const actual = component.files.map((file) => file.path);
  if (!sameJson(actual, [...expected].sort()))
    throw new Error(`G12_STAGING_RELEASE_PACKAGE_REFUSED:${label}_contents_invalid`);
}

async function assertExactEdgeComponent(directory, component) {
  if (ALL_EDGE_RUNTIME_SMOKE.functions.length !== EXACT_EDGE_FUNCTION_COUNT)
    throw new Error("G12_STAGING_RELEASE_PACKAGE_REFUSED:edge_function_inventory_invalid");
  const entries = await readdir(resolve(directory), { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
  if (
    !sameJson(
      entries.map(({ name }) => name),
      EDGE_ROOT_ENTRIES,
    )
  )
    throw new Error("G12_STAGING_RELEASE_PACKAGE_REFUSED:edge_root_contents_invalid");
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error("G12_STAGING_RELEASE_PACKAGE_REFUSED:symlink_forbidden");
    const fileExpected = ["artifact-files.sha256", "manifest.json"].includes(entry.name);
    if (fileExpected ? !entry.isFile() : !entry.isDirectory())
      throw new Error("G12_STAGING_RELEASE_PACKAGE_REFUSED:edge_root_entry_invalid");
  }
  const expectedRaw = ALL_EDGE_RUNTIME_SMOKE.functions
    .map((slug) => `raw/${slug}.eszip`)
    .sort((left, right) => left.localeCompare(right, "en"));
  const expectedDeployable = ALL_EDGE_RUNTIME_SMOKE.functions
    .map((slug) => `deployable/${slug}.ezbr`)
    .sort((left, right) => left.localeCompare(right, "en"));
  const paths = component.files.map(({ path }) => path);
  const raw = paths.filter((path) => path.startsWith("raw/"));
  const deployable = paths.filter((path) => path.startsWith("deployable/"));
  if (!sameJson(raw, expectedRaw) || !sameJson(deployable, expectedDeployable))
    throw new Error("G12_STAGING_RELEASE_PACKAGE_REFUSED:edge_bundle_inventory_invalid");
  if (
    !paths.includes("manifest.json") ||
    !paths.includes("artifact-files.sha256") ||
    !paths.some((path) => path.startsWith("source/")) ||
    !paths.some((path) => path.startsWith("evidence/"))
  ) {
    throw new Error("G12_STAGING_RELEASE_PACKAGE_REFUSED:edge_contents_invalid");
  }
}

async function assertExactDatabaseComponent(directory, component) {
  const entries = await readdir(resolve(directory), { withFileTypes: true });
  if (
    entries.length !== 1 ||
    entries[0].isSymbolicLink() ||
    !entries[0].isFile() ||
    !DATABASE_PAYLOAD_FILE.test(entries[0].name) ||
    component.files.length !== 1 ||
    component.files[0].path !== entries[0].name
  ) {
    throw new Error("G12_STAGING_RELEASE_PACKAGE_REFUSED:database_contents_invalid");
  }
}

async function assertExactComponentShape(directory, component, label) {
  if (label === "controls") assertExactNamedFiles(component, STAGING_RELEASE_PACKAGE.controlFiles, label);
  if (label === "frontend") assertExactNamedFiles(component, STAGING_RELEASE_PACKAGE.frontendFiles, label);
  if (label === "edge") await assertExactEdgeComponent(directory, component);
  if (label === "database") await assertExactDatabaseComponent(directory, component);
}

async function copyComponent(sourceRoot, destinationRoot, component) {
  await mkdir(destinationRoot, { mode: 0o700 });
  await assertCanonicalDirectory(destinationRoot, "copy_destination_invalid");
  for (const expected of component.files) {
    const source = resolve(sourceRoot, ...expected.path.split("/"));
    const destination = resolve(destinationRoot, ...expected.path.split("/"));
    if (!isWithin(sourceRoot, source) || !isWithin(destinationRoot, destination))
      throw new Error("G12_STAGING_RELEASE_PACKAGE_REFUSED:copy_path_invalid");
    const identity = await readStableRegularFile(source);
    if (identity.bytes !== expected.bytes || identity.sha256 !== expected.sha256)
      throw new Error("G12_STAGING_RELEASE_PACKAGE_REFUSED:source_changed_before_copy");
    await mkdir(dirname(destination), { recursive: true });
    await assertCanonicalDirectory(dirname(destination), "copy_destination_invalid");
    await writeFile(destination, identity.buffer, { flag: "wx", mode: 0o400 });
  }
}

function createManifest({ candidateSha, releaseProfile, runId, runAttempt, components }) {
  return {
    schemaVersion: STAGING_RELEASE_PACKAGE.schemaVersion,
    event: STAGING_RELEASE_PACKAGE.event,
    environment: STAGING_RELEASE_PACKAGE.environment,
    candidateSha,
    releaseProfile,
    artifactName: stagingReleaseArtifactName(candidateSha, runId, runAttempt),
    source: { runId: String(runId), runAttempt },
    components,
  };
}

function validateComponentManifest(value, label) {
  const violations = [];
  if (!exactKeys(value, COMPONENT_KEYS)) violations.push(`${label}_keys_invalid`);
  if (value?.directory !== STAGING_RELEASE_PACKAGE.componentDirectories[label])
    violations.push(`${label}_directory_invalid`);
  if (!SHA256.test(String(value?.treeSha256 ?? ""))) violations.push(`${label}_tree_invalid`);
  if (!Number.isSafeInteger(value?.fileCount) || value.fileCount < 1)
    violations.push(`${label}_file_count_invalid`);
  if (!Number.isSafeInteger(value?.byteCount) || value.byteCount < 0)
    violations.push(`${label}_byte_count_invalid`);
  if (
    !Array.isArray(value?.files) ||
    value.files.length !== value?.fileCount ||
    value.files.length > MAX_COMPONENT_FILES
  ) {
    violations.push(`${label}_files_invalid`);
  } else {
    const paths = [];
    for (const file of value.files) {
      if (
        !exactKeys(file, FILE_KEYS) ||
        !safeRelativePath(file?.path) ||
        !Number.isSafeInteger(file?.bytes) ||
        file.bytes < 0 ||
        !SHA256.test(String(file?.sha256 ?? ""))
      ) {
        violations.push(`${label}_file_invalid`);
        continue;
      }
      paths.push(file.path);
    }
    if (!sameJson(paths, [...paths].sort()) || new Set(paths).size !== paths.length)
      violations.push(`${label}_file_order_invalid`);
    if (value.files.reduce((total, file) => total + Number(file?.bytes ?? 0), 0) !== value.byteCount)
      violations.push(`${label}_byte_count_mismatch`);
    if (componentTreeSha256(value.files) !== value.treeSha256) violations.push(`${label}_tree_mismatch`);
  }
  return violations;
}

export function evaluateStagingReleasePackageManifest(manifest, expected = {}) {
  const violations = validateIdentity({
    candidateSha: manifest?.candidateSha,
    releaseProfile: manifest?.releaseProfile,
    runId: manifest?.source?.runId,
    runAttempt: manifest?.source?.runAttempt,
  });
  if (!exactKeys(manifest, MANIFEST_KEYS)) violations.push("manifest_keys_invalid");
  if (manifest?.schemaVersion !== STAGING_RELEASE_PACKAGE.schemaVersion)
    violations.push("manifest_schema_invalid");
  if (manifest?.event !== STAGING_RELEASE_PACKAGE.event) violations.push("manifest_event_invalid");
  if (manifest?.environment !== STAGING_RELEASE_PACKAGE.environment) violations.push("environment_invalid");
  if (!exactKeys(manifest?.source, SOURCE_KEYS)) violations.push("source_keys_invalid");
  if (
    manifest?.artifactName !==
    stagingReleaseArtifactName(manifest?.candidateSha, manifest?.source?.runId, manifest?.source?.runAttempt)
  ) {
    violations.push("artifact_name_invalid");
  }
  const required = PROFILE_COMPONENTS[manifest?.releaseProfile] ?? [];
  if (
    !manifest?.components ||
    typeof manifest.components !== "object" ||
    Array.isArray(manifest.components) ||
    !sameJson(Object.keys(manifest.components).sort(), [...required].sort())
  ) {
    violations.push("components_invalid");
  } else {
    for (const label of required)
      violations.push(...validateComponentManifest(manifest.components[label], label));
  }
  for (const [label, actual, wanted] of [
    ["candidate_sha", manifest?.candidateSha, expected.candidateSha],
    ["release_profile", manifest?.releaseProfile, expected.releaseProfile],
    ["run_id", manifest?.source?.runId, expected.runId && String(expected.runId)],
    ["run_attempt", manifest?.source?.runAttempt, expected.runAttempt],
    ["artifact_name", manifest?.artifactName, expected.artifactName],
  ]) {
    if (wanted !== undefined && wanted !== "" && actual !== wanted) violations.push(`${label}_mismatch`);
  }
  return { valid: [...new Set(violations)].length === 0, violations: [...new Set(violations)] };
}

async function assertPackageRoot(packageDirectory, releaseProfile) {
  const requested = resolve(packageDirectory);
  const metadata = await lstat(requested);
  if (!metadata.isDirectory() || metadata.isSymbolicLink())
    throw new Error("G12_STAGING_RELEASE_PACKAGE_REFUSED:package_root_invalid");
  const root = await realpath(requested);
  const entries = await readdir(root, { withFileTypes: true });
  const requiredComponents = PROFILE_COMPONENTS[releaseProfile] ?? [];
  const expected = [
    STAGING_RELEASE_PACKAGE.manifestFile,
    ...requiredComponents.map((label) => STAGING_RELEASE_PACKAGE.componentDirectories[label]),
  ].sort();
  const actual = entries.map((entry) => entry.name).sort();
  if (!sameJson(actual, expected))
    throw new Error("G12_STAGING_RELEASE_PACKAGE_REFUSED:package_contents_invalid");
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error("G12_STAGING_RELEASE_PACKAGE_REFUSED:symlink_forbidden");
    if (entry.name === STAGING_RELEASE_PACKAGE.manifestFile ? !entry.isFile() : !entry.isDirectory())
      throw new Error("G12_STAGING_RELEASE_PACKAGE_REFUSED:package_entry_invalid");
  }
  return root;
}

export async function writeStagingReleasePackage({
  componentDirectories,
  outputDirectory,
  candidateSha,
  releaseProfile,
  runId,
  runAttempt,
}) {
  const violations = validateIdentity({ candidateSha, releaseProfile, runId, runAttempt });
  if (violations.length > 0) throw new Error(`G12_STAGING_RELEASE_PACKAGE_REFUSED:${violations.join(",")}`);
  const required = PROFILE_COMPONENTS[releaseProfile];
  const supplied = Object.keys(componentDirectories ?? {}).sort();
  if (!sameJson(supplied, [...required].sort()))
    throw new Error("G12_STAGING_RELEASE_PACKAGE_REFUSED:component_sources_invalid");
  const sourceRoots = Object.fromEntries(
    await Promise.all(
      required.map(async (label) => [label, await resolveComponentSource(componentDirectories[label])]),
    ),
  );
  const output = await requireNewDirectory(outputDirectory, Object.values(sourceRoots));
  const components = {};
  for (const label of required) {
    components[label] = await inspectComponent(sourceRoots[label], label);
    await assertExactComponentShape(sourceRoots[label], components[label], label);
  }
  const manifest = createManifest({ candidateSha, releaseProfile, runId, runAttempt, components });
  const result = evaluateStagingReleasePackageManifest(manifest, {
    candidateSha,
    releaseProfile,
    runId: String(runId),
    runAttempt,
  });
  if (!result.valid) throw new Error(`G12_STAGING_RELEASE_PACKAGE_REFUSED:${result.violations.join(",")}`);
  let outputCreated = false;
  try {
    await mkdir(output, { mode: 0o700 });
    outputCreated = true;
    await assertCanonicalDirectory(output, "output_directory_invalid");
    for (const label of required) {
      await copyComponent(
        sourceRoots[label],
        resolve(output, STAGING_RELEASE_PACKAGE.componentDirectories[label]),
        components[label],
      );
    }
    const serialized = canonicalManifestBytes(manifest);
    await writeFile(resolve(output, STAGING_RELEASE_PACKAGE.manifestFile), serialized, {
      flag: "wx",
      mode: 0o400,
    });
    const verified = await verifyStagingReleasePackage({
      packageDirectory: output,
      candidateSha,
      releaseProfile,
      runId,
      runAttempt,
    });
    return verified;
  } catch (error) {
    if (outputCreated) await rm(output, { recursive: true, force: true });
    throw error;
  }
}

export async function verifyStagingReleasePackage({
  packageDirectory,
  outputDirectory,
  candidateSha,
  releaseProfile,
  runId,
  runAttempt,
}) {
  const root = await assertPackageRoot(packageDirectory, releaseProfile);
  const manifestIdentity = await readStableRegularFile(resolve(root, STAGING_RELEASE_PACKAGE.manifestFile), {
    maximumBytes: MAX_MANIFEST_BYTES,
  });
  let manifest;
  try {
    manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifestIdentity.buffer));
  } catch {
    throw new Error("G12_STAGING_RELEASE_PACKAGE_REFUSED:manifest_json_invalid");
  }
  if (!manifestIdentity.buffer.equals(canonicalManifestBytes(manifest)))
    throw new Error("G12_STAGING_RELEASE_PACKAGE_REFUSED:manifest_canonical_invalid");
  const result = evaluateStagingReleasePackageManifest(manifest, {
    candidateSha,
    releaseProfile,
    runId: String(runId),
    runAttempt,
  });
  if (!result.valid) throw new Error(`G12_STAGING_RELEASE_PACKAGE_REFUSED:${result.violations.join(",")}`);
  for (const label of PROFILE_COMPONENTS[releaseProfile]) {
    const actual = await inspectComponent(
      resolve(root, STAGING_RELEASE_PACKAGE.componentDirectories[label]),
      label,
    );
    if (!sameJson(actual, manifest.components[label]))
      throw new Error(`G12_STAGING_RELEASE_PACKAGE_REFUSED:${label}_identity_mismatch`);
    await assertExactComponentShape(
      resolve(root, STAGING_RELEASE_PACKAGE.componentDirectories[label]),
      actual,
      label,
    );
  }

  let materializedPath = "";
  if (outputDirectory) {
    const output = await requireNewDirectory(outputDirectory, [root]);
    let outputCreated = false;
    try {
      await mkdir(output, { mode: 0o700 });
      outputCreated = true;
      await assertCanonicalDirectory(output, "output_directory_invalid");
      for (const label of PROFILE_COMPONENTS[releaseProfile]) {
        await copyComponent(
          resolve(root, STAGING_RELEASE_PACKAGE.componentDirectories[label]),
          resolve(output, STAGING_RELEASE_PACKAGE.componentDirectories[label]),
          manifest.components[label],
        );
      }
      await writeFile(resolve(output, STAGING_RELEASE_PACKAGE.manifestFile), manifestIdentity.buffer, {
        flag: "wx",
        mode: 0o400,
      });
      materializedPath = output;
    } catch (error) {
      if (outputCreated) await rm(output, { recursive: true, force: true });
      throw error;
    }
  }
  return {
    manifest,
    manifestSha256: manifestIdentity.sha256,
    manifestBytes: manifestIdentity.bytes,
    artifactName: manifest.artifactName,
    components: manifest.components,
    materializedPath,
  };
}

export const STAGING_RELEASE_PROFILE_COMPONENTS = PROFILE_COMPONENTS;
