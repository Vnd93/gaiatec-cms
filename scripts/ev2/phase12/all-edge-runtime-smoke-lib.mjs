import { createHash } from "node:crypto";
import { cp, lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

import { PRODUCTION_FUNCTIONS } from "./production-backend-lib.mjs";

export const ALL_EDGE_RUNTIME_SMOKE = Object.freeze({
  edgeRuntimeImage:
    "ghcr.io/supabase/edge-runtime:v1.74.3@sha256:c52405002a890ca9fcf77978671c57f3a988e03174afb277f84ac65bc917013c",
  edgeRuntimeIndexDigest: "sha256:c52405002a890ca9fcf77978671c57f3a988e03174afb277f84ac65bc917013c",
  edgeRuntimeAmd64Digest: "sha256:cc355c3d0e9c063a351cad56d1c4c52a3c4d85aff4e1fad9d91688e75f9aad09",
  functions: Object.freeze([...PRODUCTION_FUNCTIONS]),
  externalSourceFiles: Object.freeze([
    "scripts/ev2/phase12/configure-staging-ai-provider-secrets.mjs",
    "scripts/ev2/phase12/configure-staging-edge-public-secrets.mjs",
    "scripts/ev2/phase12/staging-ai-provider-secrets-lib.mjs",
    "scripts/ev2/phase12/staging-edge-public-secrets-lib.mjs",
    "src/shared/contracts/cms-content.ts",
    "src/shared/dam-media-policy.ts",
    "src/shared/raster-image-metadata.ts",
  ]),
  maximumEszipBytes: 64 * 1024 * 1024,
  maximumAggregateEszipBytes: 1024 * 1024 * 1024,
});

function refuse(label) {
  throw new Error(`G12_ALL_EDGE_RUNTIME_SMOKE_${label}_REFUSED`);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function posixPath(value) {
  return value.split(sep).join("/");
}

async function assertDirectory(path, label) {
  const stats = await lstat(path).catch(() => null);
  if (!stats?.isDirectory() || stats.isSymbolicLink()) refuse(label);
}

async function assertAbsent(path, label) {
  const stats = await lstat(path).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (stats) refuse(label);
}

async function recordsUnder(root, relativePath) {
  const start = join(root, relativePath);
  const records = [];

  async function walk(path) {
    const stats = await lstat(path);
    const name = posixPath(relative(root, path));
    if (stats.isSymbolicLink()) refuse(`SYMLINK:${name}`);
    if (stats.isDirectory()) {
      const entries = await readdir(path, { withFileTypes: true });
      for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name)))
        await walk(join(path, entry.name));
      return;
    }
    if (!stats.isFile()) refuse(`SPECIAL_FILE:${name}`);
    const bytes = await readFile(path);
    records.push({ path: name, sha256: sha256(bytes), bytes: bytes.byteLength });
  }

  await walk(start);
  return records;
}

function summarizeRecords(records) {
  const sorted = [...records].sort((left, right) => left.path.localeCompare(right.path));
  const inventory = Buffer.from(
    sorted.map((record) => `${record.sha256}  ${record.path}\n`).join(""),
    "utf8",
  );
  return {
    treeSha256: sha256(inventory),
    fileCount: sorted.length,
    bytes: sorted.reduce((total, record) => total + record.bytes, 0),
    records: sorted,
  };
}

async function exactFunctionInventory(source) {
  const root = join(source, "supabase", "functions");
  await assertDirectory(root, "FUNCTIONS_ROOT");
  const entries = await readdir(root, { withFileTypes: true });
  const directories = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "_shared") continue;
    directories.push(entry.name);
  }
  directories.sort((left, right) => left.localeCompare(right));
  const expected = [...ALL_EDGE_RUNTIME_SMOKE.functions].sort((left, right) => left.localeCompare(right));
  if (JSON.stringify(directories) !== JSON.stringify(expected)) refuse("FUNCTION_INVENTORY");
  for (const name of expected) {
    const entrypoint = join(root, name, "index.ts");
    const stats = await lstat(entrypoint).catch(() => null);
    if (!stats?.isFile() || stats.isSymbolicLink()) refuse(`ENTRYPOINT:${name}`);
  }
  return expected;
}

function validateImportMap(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(["imports"]) ||
    JSON.stringify(value.imports) !== JSON.stringify({ zod: "npm:zod@4.4.3" })
  )
    refuse("IMPORT_MAP");
  return value;
}

export async function materializeAllEdgeRuntimeSmokeInput({ source, output, candidateSha }) {
  const sourceRoot = resolve(source);
  const outputRoot = resolve(output);
  if (!/^[a-f0-9]{40}$/.test(String(candidateSha ?? ""))) refuse("CANDIDATE_SHA");
  await assertDirectory(sourceRoot, "SOURCE_ROOT");
  await assertAbsent(outputRoot, "OUTPUT_EXISTS");
  for (const name of [".env.local", ".env.staging.local", ".env.production.local"])
    await assertAbsent(join(sourceRoot, name), "LOCAL_ENV");

  const functions = await exactFunctionInventory(sourceRoot);
  const sourceRecords = [
    ...(await recordsUnder(sourceRoot, join("supabase", "functions"))),
    ...(
      await Promise.all(
        ALL_EDGE_RUNTIME_SMOKE.externalSourceFiles.map((path) => recordsUnder(sourceRoot, path)),
      )
    ).flat(),
    ...(await recordsUnder(sourceRoot, "deno.lock")),
  ];
  if (
    sourceRecords.some(({ path }) =>
      path.split("/").some((name) => name.startsWith(".env") && name !== ".env.example"),
    )
  )
    refuse("LOCAL_ENV");
  const sourceSummary = summarizeRecords(sourceRecords);
  const importMapPath = join(sourceRoot, "supabase", "functions", "import_map.json");
  const importMapBytes = await readFile(importMapPath);
  const importMap = validateImportMap(JSON.parse(importMapBytes.toString("utf8")));
  const denoLockBytes = await readFile(join(sourceRoot, "deno.lock"));

  await mkdir(outputRoot, { recursive: false, mode: 0o700 });
  await cp(join(sourceRoot, "supabase", "functions"), join(outputRoot, "supabase", "functions"), {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
  for (const path of ALL_EDGE_RUNTIME_SMOKE.externalSourceFiles) {
    const target = join(outputRoot, ...path.split("/"));
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    await cp(join(sourceRoot, ...path.split("/")), target, {
      errorOnExist: true,
      force: false,
    });
  }
  await writeFile(join(outputRoot, "deno.lock"), denoLockBytes, { flag: "wx", mode: 0o600 });
  await writeFile(
    join(outputRoot, "deno.json"),
    `${JSON.stringify(
      {
        imports: importMap.imports,
        lock: { path: "./deno.lock", frozen: true },
        nodeModulesDir: "none",
      },
      null,
      2,
    )}\n`,
    { flag: "wx", mode: 0o600 },
  );
  const inventoryBytes = Buffer.from(`${functions.join("\n")}\n`, "utf8");
  await writeFile(join(outputRoot, "edge-functions.txt"), inventoryBytes, {
    flag: "wx",
    mode: 0o600,
  });

  const materializedRecords = [
    ...(await recordsUnder(outputRoot, join("supabase", "functions"))),
    ...(
      await Promise.all(
        ALL_EDGE_RUNTIME_SMOKE.externalSourceFiles.map((path) => recordsUnder(outputRoot, path)),
      )
    ).flat(),
    ...(await recordsUnder(outputRoot, "deno.lock")),
    ...(await recordsUnder(outputRoot, "deno.json")),
    ...(await recordsUnder(outputRoot, "edge-functions.txt")),
  ];
  const materializedSummary = summarizeRecords(materializedRecords);
  const manifest = {
    schemaVersion: 1,
    event: "g12.ci.all_edge_runtime_smoke.input_materialized",
    candidateSha,
    runtime: {
      image: ALL_EDGE_RUNTIME_SMOKE.edgeRuntimeImage,
      indexDigest: ALL_EDGE_RUNTIME_SMOKE.edgeRuntimeIndexDigest,
      amd64Digest: ALL_EDGE_RUNTIME_SMOKE.edgeRuntimeAmd64Digest,
    },
    functions,
    functionCount: functions.length,
    inventorySha256: sha256(inventoryBytes),
    source: {
      treeSha256: sourceSummary.treeSha256,
      fileCount: sourceSummary.fileCount,
      bytes: sourceSummary.bytes,
      denoLockSha256: sha256(denoLockBytes),
      importMapSha256: sha256(importMapBytes),
      externalSourceFiles: [...ALL_EDGE_RUNTIME_SMOKE.externalSourceFiles],
    },
    materialized: {
      treeSha256: materializedSummary.treeSha256,
      fileCount: materializedSummary.fileCount,
      bytes: materializedSummary.bytes,
    },
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(join(outputRoot, "all-edge-runtime-smoke-input.json"), manifestBytes, {
    flag: "wx",
    mode: 0o600,
  });
  return manifest;
}
