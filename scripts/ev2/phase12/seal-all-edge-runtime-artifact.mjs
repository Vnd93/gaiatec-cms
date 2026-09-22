#!/usr/bin/env node
import { createHash } from "node:crypto";
import { copyFile, cp, lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildAllEdgeRuntimeArtifactManifest,
  parseExactAttestation,
} from "./all-edge-runtime-artifact-lib.mjs";
import { ALL_EDGE_RUNTIME_SMOKE } from "./all-edge-runtime-smoke-lib.mjs";
import { PUBLIC_FUNCTIONS } from "./production-backend-lib.mjs";
import { frameRawEszip } from "./staging-cms-public-hotfix-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || !process.argv[index + 1])
    throw new Error(`G12_ALL_EDGE_RUNTIME_ARTIFACT_ARGUMENT_${name.toUpperCase()}_REQUIRED`);
  return process.argv[index + 1];
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function posix(value) {
  return value.split(sep).join("/");
}

async function requireFile(path, label) {
  const stats = await lstat(path).catch(() => null);
  if (!stats?.isFile() || stats.isSymbolicLink())
    throw new Error(`G12_ALL_EDGE_RUNTIME_ARTIFACT_${label}_REFUSED`);
}

async function requireDirectory(path, label) {
  const stats = await lstat(path).catch(() => null);
  if (!stats?.isDirectory() || stats.isSymbolicLink())
    throw new Error(`G12_ALL_EDGE_RUNTIME_ARTIFACT_${label}_REFUSED`);
}

async function requireAbsent(path) {
  const stats = await lstat(path).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (stats) throw new Error("G12_ALL_EDGE_RUNTIME_ARTIFACT_OUTPUT_EXISTS_REFUSED");
}

function parseChecksumRecords(text) {
  const records = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const match = /^([a-f0-9]{64}) {2}bundles\/([a-z0-9-]+)\.eszip$/.exec(line);
    if (!match || records.has(match[2])) throw new Error("G12_ALL_EDGE_RUNTIME_ARTIFACT_CHECKSUMS_REFUSED");
    records.set(match[2], match[1]);
  }
  return records;
}

function parseSizeRecords(text) {
  const records = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const match = /^([a-z0-9-]+)\t([1-9][0-9]*)$/.exec(line);
    if (!match || records.has(match[1])) throw new Error("G12_ALL_EDGE_RUNTIME_ARTIFACT_SIZES_REFUSED");
    const bytes = Number(match[2]);
    if (!Number.isSafeInteger(bytes)) throw new Error("G12_ALL_EDGE_RUNTIME_ARTIFACT_SIZES_REFUSED");
    records.set(match[1], bytes);
  }
  return records;
}

function parseBootRecords(text) {
  const records = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const match = /^([a-z0-9-]+)\t([a-f0-9]{64})\t(200|401)$/.exec(line);
    if (!match || records.has(match[1]))
      throw new Error("G12_ALL_EDGE_RUNTIME_ARTIFACT_BOOT_RECORDS_REFUSED");
    records.set(match[1], { sha256: match[2], status: Number(match[3]) });
  }
  return records;
}

async function indexedFiles(root, relativeRoot) {
  const records = [];
  async function walk(path) {
    const stats = await lstat(path);
    const name = posix(relative(root, path));
    if (stats.isSymbolicLink()) throw new Error(`G12_ALL_EDGE_RUNTIME_ARTIFACT_SYMLINK_REFUSED:${name}`);
    if (stats.isDirectory()) {
      const entries = await readdir(path, { withFileTypes: true });
      for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name)))
        await walk(join(path, entry.name));
      return;
    }
    if (!stats.isFile()) throw new Error(`G12_ALL_EDGE_RUNTIME_ARTIFACT_ENTRY_REFUSED:${name}`);
    const bytes = await readFile(path);
    records.push({ path: name, sha256: sha256(bytes), bytes: bytes.byteLength });
  }
  await walk(join(root, relativeRoot));
  return records;
}

export async function sealAllEdgeRuntimeArtifact({
  input,
  bundles: bundleDirectory,
  buildAttestation: buildAttestationFile,
  bootAttestation: bootAttestationFile,
  bootRecords: bootRecordsFile,
  checksums: checksumsFile,
  sizes: sizesFile,
  output,
  candidateSha,
}) {
  const inputRoot = resolve(input);
  const bundlesRoot = resolve(bundleDirectory);
  const buildAttestationPath = resolve(buildAttestationFile);
  const bootAttestationPath = resolve(bootAttestationFile);
  const bootRecordsPath = resolve(bootRecordsFile);
  const checksumsPath = resolve(checksumsFile);
  const sizesPath = resolve(sizesFile);
  const outputRoot = resolve(output);
  await requireAbsent(outputRoot);
  await requireDirectory(inputRoot, "INPUT_ROOT");
  await requireDirectory(bundlesRoot, "BUNDLES_ROOT");
  for (const [path, label] of [
    [join(inputRoot, "all-edge-runtime-smoke-input.json"), "INPUT_MANIFEST"],
    [join(inputRoot, "edge-functions.txt"), "INPUT_INVENTORY"],
    [buildAttestationPath, "BUILD_ATTESTATION"],
    [bootAttestationPath, "BOOT_ATTESTATION"],
    [bootRecordsPath, "BOOT_RECORDS"],
    [checksumsPath, "CHECKSUMS"],
    [sizesPath, "SIZES"],
  ])
    await requireFile(path, label);

  const inputManifestBytes = await readFile(join(inputRoot, "all-edge-runtime-smoke-input.json"));
  const inputManifest = JSON.parse(inputManifestBytes.toString("utf8"));
  const inventoryBytes = await readFile(join(inputRoot, "edge-functions.txt"));
  if (
    inventoryBytes.toString("utf8") !== `${ALL_EDGE_RUNTIME_SMOKE.functions.join("\n")}\n` ||
    sha256(inventoryBytes) !== inputManifest.inventorySha256
  )
    throw new Error("G12_ALL_EDGE_RUNTIME_ARTIFACT_INPUT_INVENTORY_REFUSED");
  const inputRootEntries = (await readdir(inputRoot)).sort((left, right) => left.localeCompare(right));
  const expectedInputRootEntries = [
    "all-edge-runtime-smoke-input.json",
    "deno.json",
    "deno.lock",
    "edge-functions.txt",
    "supabase",
    ...new Set(ALL_EDGE_RUNTIME_SMOKE.externalSourceFiles.map((path) => path.split("/")[0])),
  ].sort((left, right) => left.localeCompare(right));
  if (JSON.stringify(inputRootEntries) !== JSON.stringify(expectedInputRootEntries))
    throw new Error("G12_ALL_EDGE_RUNTIME_ARTIFACT_INPUT_ROOT_REFUSED");
  const materializedRecords = (
    await Promise.all(
      [
        "supabase/functions",
        ...ALL_EDGE_RUNTIME_SMOKE.externalSourceFiles,
        "deno.lock",
        "deno.json",
        "edge-functions.txt",
      ].map((path) => indexedFiles(inputRoot, path)),
    )
  )
    .flat()
    .sort((left, right) => left.path.localeCompare(right.path));
  const materializedIndex = Buffer.from(
    materializedRecords.map((record) => `${record.sha256}  ${record.path}\n`).join(""),
    "utf8",
  );
  if (
    sha256(materializedIndex) !== inputManifest.materialized?.treeSha256 ||
    materializedRecords.length !== inputManifest.materialized?.fileCount ||
    materializedRecords.reduce((total, record) => total + record.bytes, 0) !==
      inputManifest.materialized?.bytes
  )
    throw new Error("G12_ALL_EDGE_RUNTIME_ARTIFACT_INPUT_TREE_REFUSED");
  const buildAttestation = parseExactAttestation(await readFile(buildAttestationPath, "utf8"));
  const bootAttestation = parseExactAttestation(await readFile(bootAttestationPath, "utf8"));
  const bootRecordsBytes = await readFile(bootRecordsPath);
  const checksumBytes = await readFile(checksumsPath);
  const sizeBytes = await readFile(sizesPath);
  const checksums = parseChecksumRecords(checksumBytes.toString("utf8"));
  const sizes = parseSizeRecords(sizeBytes.toString("utf8"));
  const bootRecords = parseBootRecords(bootRecordsBytes.toString("utf8"));
  if (
    checksums.size !== ALL_EDGE_RUNTIME_SMOKE.functions.length ||
    sizes.size !== ALL_EDGE_RUNTIME_SMOKE.functions.length ||
    bootRecords.size !== ALL_EDGE_RUNTIME_SMOKE.functions.length
  )
    throw new Error("G12_ALL_EDGE_RUNTIME_ARTIFACT_BUNDLE_CARDINALITY_REFUSED");
  const bundleEntries = await readdir(bundlesRoot, { withFileTypes: true });
  const bundleNames = [];
  for (const entry of bundleEntries) {
    const match = /^([a-z0-9-]+)\.eszip$/.exec(entry.name);
    if (!entry.isFile() || !match) throw new Error("G12_ALL_EDGE_RUNTIME_ARTIFACT_BUNDLE_INVENTORY_REFUSED");
    bundleNames.push(match[1]);
  }
  bundleNames.sort((left, right) => left.localeCompare(right));
  const expectedBundleNames = [...ALL_EDGE_RUNTIME_SMOKE.functions].sort((left, right) =>
    left.localeCompare(right),
  );
  if (JSON.stringify(bundleNames) !== JSON.stringify(expectedBundleNames))
    throw new Error("G12_ALL_EDGE_RUNTIME_ARTIFACT_BUNDLE_INVENTORY_REFUSED");

  await mkdir(join(outputRoot, "raw"), { recursive: true, mode: 0o700 });
  await mkdir(join(outputRoot, "deployable"), { recursive: true, mode: 0o700 });
  await mkdir(join(outputRoot, "evidence"), { recursive: true, mode: 0o700 });
  await cp(inputRoot, join(outputRoot, "source"), {
    recursive: true,
    errorOnExist: true,
    force: false,
  });

  const bundles = [];
  for (const name of ALL_EDGE_RUNTIME_SMOKE.functions) {
    const sourcePath = join(bundlesRoot, `${name}.eszip`);
    await requireFile(sourcePath, `RAW_BUNDLE:${name}`);
    const raw = await readFile(sourcePath);
    const expectedStatus = name === "cms-outbox-worker" ? 401 : 200;
    if (
      checksums.get(name) !== sha256(raw) ||
      sizes.get(name) !== raw.byteLength ||
      bootRecords.get(name)?.sha256 !== sha256(raw) ||
      bootRecords.get(name)?.status !== expectedStatus
    )
      throw new Error(`G12_ALL_EDGE_RUNTIME_ARTIFACT_RAW_BUNDLE_MISMATCH:${name}`);
    const deployable = frameRawEszip(raw);
    await copyFile(sourcePath, join(outputRoot, "raw", `${name}.eszip`));
    await writeFile(join(outputRoot, "deployable", `${name}.ezbr`), deployable, {
      flag: "wx",
      mode: 0o600,
    });
    bundles.push({
      slug: name,
      entrypointPath: `file:///workspace/supabase/functions/${name}/index.ts`,
      importMapPath: "file:///workspace/deno.json",
      verifyJwt: !PUBLIC_FUNCTIONS.has(name),
      expectedColdBootStatus: expectedStatus,
      raw: { path: `raw/${name}.eszip`, sha256: sha256(raw), bytes: raw.byteLength },
      deployable: {
        path: `deployable/${name}.ezbr`,
        sha256: sha256(deployable),
        bytes: deployable.byteLength,
      },
    });
  }

  for (const [source, target] of [
    [join(inputRoot, "all-edge-runtime-smoke-input.json"), "input-manifest.json"],
    [join(inputRoot, "edge-functions.txt"), "edge-functions.txt"],
    [buildAttestationPath, "build-attestation.env"],
    [bootAttestationPath, "boot-attestation.env"],
    [bootRecordsPath, "boot-records.tsv"],
    [checksumsPath, "runtime-bundles.sha256"],
    [sizesPath, "runtime-bundles.bytes"],
  ])
    await copyFile(source, join(outputRoot, "evidence", target));

  const records = (
    await Promise.all(
      ["source", "raw", "deployable", "evidence"].map((directory) => indexedFiles(outputRoot, directory)),
    )
  )
    .flat()
    .sort((left, right) => left.path.localeCompare(right.path));
  const indexBytes = Buffer.from(
    records.map((record) => `${record.sha256}  ${record.path}\n`).join(""),
    "utf8",
  );
  await writeFile(join(outputRoot, "artifact-files.sha256"), indexBytes, {
    flag: "wx",
    mode: 0o600,
  });
  const manifest = buildAllEdgeRuntimeArtifactManifest({
    candidateSha,
    inputManifest,
    inputManifestSha256: sha256(inputManifestBytes),
    checksumsSha256: sha256(checksumBytes),
    sizesSha256: sha256(sizeBytes),
    bootRecordsSha256: sha256(bootRecordsBytes),
    bundles,
    buildAttestation,
    bootAttestation,
    fileIndexSha256: sha256(indexBytes),
    fileCount: records.length,
  });
  await writeFile(join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  return manifest;
}

export async function main() {
  const candidateSha = argument("candidate-sha");
  const manifest = await sealAllEdgeRuntimeArtifact({
    input: argument("input"),
    bundles: argument("bundles"),
    buildAttestation: argument("build-attestation"),
    bootAttestation: argument("boot-attestation"),
    bootRecords: argument("boot-records"),
    checksums: argument("checksums"),
    sizes: argument("sizes"),
    output: argument("output"),
    candidateSha,
  });
  process.stdout.write(
    `${JSON.stringify({
      event: manifest.event,
      candidateSha,
      functionCount: manifest.functionCount,
      aggregateRawBytes: manifest.aggregateRawBytes,
      aggregateDeployableBytes: manifest.aggregateDeployableBytes,
      fileIndexSha256: manifest.evidence.fileIndexSha256,
    })}\n`,
  );
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url))
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
