import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  ALL_EDGE_RUNTIME_SMOKE,
  materializeAllEdgeRuntimeSmokeInput,
} from "./all-edge-runtime-smoke-lib.mjs";
import {
  ALL_EDGE_RUNTIME_LOCK_PROFILES,
  ALL_EDGE_RUNTIME_SOURCE_LOCK,
} from "./all-edge-runtime-deno-lock-lib.mjs";
import {
  buildAllEdgeRuntimeArtifactManifest,
  loadAndVerifyAllEdgeRuntimeArtifact,
  parseExactAttestation,
} from "./all-edge-runtime-artifact-lib.mjs";
import { PRODUCTION_FUNCTIONS, PUBLIC_FUNCTIONS } from "./production-backend-lib.mjs";
import { sealAllEdgeRuntimeArtifact } from "./seal-all-edge-runtime-artifact.mjs";

const workflow = await readFile(new URL("../../../.github/workflows/ci.yml", import.meta.url), "utf8");
const builder = await readFile(new URL("./all-edge-runtime-smoke-bundle.sh", import.meta.url), "utf8");
const boot = await readFile(new URL("./all-edge-runtime-smoke-boot.sh", import.meta.url), "utf8");
const sealer = await readFile(new URL("./seal-all-edge-runtime-artifact.mjs", import.meta.url), "utf8");
const verifierPath = fileURLToPath(new URL("./verify-all-edge-runtime-artifact.mjs", import.meta.url));
const repositoryRootLockBytes = await readFile(new URL("../../../deno.lock", import.meta.url));
const edgeSourceLockBytes = await readFile(new URL("./all-edge-runtime-source-deno.lock", import.meta.url));

const digest = (value) => value.toString(16).padStart(64, "0");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function lockProfileEvidence(id, functions) {
  const profile = ALL_EDGE_RUNTIME_LOCK_PROFILES[id];
  return {
    profileId: id,
    sha256: profile.sha256,
    serializedBytes: profile.serializedBytes,
    specifierCount: profile.specifierCount,
    jsrPackageCount: profile.jsrPackageCount,
    npmPackageCount: profile.npmPackageCount,
    dependencyEdgeCount: profile.dependencyEdgeCount,
    functions,
  };
}

function dependencyManifestFixture() {
  const configBytes = Buffer.from(
    `${JSON.stringify(
      {
        imports: { zod: "npm:zod@4.4.3" },
        lock: { path: "./deno.lock", frozen: true },
        nodeModulesDir: "none",
      },
      null,
      2,
    )}\n`,
  );
  const records = PRODUCTION_FUNCTIONS.flatMap((name) => {
    const profile = ["rdo-command", "rdo-sign"].includes(name) ? "pdf" : "standard";
    return [
      {
        path: `supabase/functions/${name}/deno.json`,
        sha256: sha256(configBytes),
      },
      {
        path: `supabase/functions/${name}/deno.lock`,
        sha256: ALL_EDGE_RUNTIME_LOCK_PROFILES[profile].sha256,
      },
    ];
  }).sort((left, right) => left.path.localeCompare(right.path));
  const indexBytes = Buffer.from(records.map((record) => `${record.sha256}  ${record.path}\n`).join(""));
  return {
    configSha256: sha256(configBytes),
    configBytes: configBytes.byteLength,
    filesPath: "edge-function-dependencies.sha256",
    filesSha256: sha256(indexBytes),
    fileCount: records.length,
    profiles: [
      lockProfileEvidence(
        "standard",
        PRODUCTION_FUNCTIONS.filter((name) => !["rdo-command", "rdo-sign"].includes(name)),
      ),
      lockProfileEvidence("pdf", ["rdo-command", "rdo-sign"]),
    ],
  };
}

function be32(value) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value);
  return bytes;
}

function eszipSection(content) {
  return Buffer.concat([be32(content.byteLength), content, createHash("sha256").update(content).digest()]);
}

function validEszip(slug) {
  const specifier = Buffer.from(`file:///workspace/supabase/functions/${slug}/index.ts`, "utf8");
  const source = Buffer.from('Deno.serve(() => new Response("ok"));', "utf8");
  const header = Buffer.concat([
    be32(specifier.byteLength),
    specifier,
    Buffer.from([0]),
    be32(0),
    be32(source.byteLength),
    be32(0),
    be32(0),
    Buffer.from([0]),
  ]);
  const sourceSection = Buffer.concat([source, createHash("sha256").update(source).digest()]);
  return Buffer.concat([
    Buffer.from("ESZIP2.3", "ascii"),
    eszipSection(Buffer.from([0, 1, 1, 32])),
    eszipSection(header),
    eszipSection(Buffer.alloc(0)),
    be32(sourceSection.byteLength),
    sourceSection,
    be32(0),
  ]);
}

function artifactFixture() {
  const candidateSha = "d".repeat(40);
  const bundles = PRODUCTION_FUNCTIONS.map((slug, index) => ({
    slug,
    entrypointPath: `file:///workspace/supabase/functions/${slug}/index.ts`,
    importMapPath: `file:///workspace/supabase/functions/${slug}/deno.json`,
    verifyJwt: !PUBLIC_FUNCTIONS.has(slug),
    expectedColdBootStatus: slug === "cms-outbox-worker" ? 401 : 200,
    raw: { path: `raw/${slug}.eszip`, sha256: digest(index + 20), bytes: index + 1 },
    deployable: {
      path: `deployable/${slug}.ezbr`,
      sha256: digest(index + 100),
      bytes: index + 101,
    },
  }));
  const inputManifest = {
    schemaVersion: 1,
    event: "g12.ci.all_edge_runtime_smoke.input_materialized",
    candidateSha,
    runtime: {
      image: ALL_EDGE_RUNTIME_SMOKE.edgeRuntimeImage,
      indexDigest: ALL_EDGE_RUNTIME_SMOKE.edgeRuntimeIndexDigest,
      amd64Digest: ALL_EDGE_RUNTIME_SMOKE.edgeRuntimeAmd64Digest,
    },
    functions: [...PRODUCTION_FUNCTIONS],
    functionCount: PRODUCTION_FUNCTIONS.length,
    inventorySha256: digest(1),
    source: {
      treeSha256: digest(2),
      fileCount: 100,
      bytes: 1000,
      denoLockSha256: digest(3),
      edgeSourceDenoLockPath: ALL_EDGE_RUNTIME_SOURCE_LOCK.path,
      edgeSourceDenoLockSha256: ALL_EDGE_RUNTIME_SOURCE_LOCK.sha256,
      edgeSourceDenoLockBytes: ALL_EDGE_RUNTIME_SOURCE_LOCK.serializedBytes,
      importMapSha256: digest(4),
      externalSourceFiles: [...ALL_EDGE_RUNTIME_SMOKE.externalSourceFiles],
    },
    dependencies: dependencyManifestFixture(),
    materialized: { treeSha256: digest(5), fileCount: 170, bytes: 1200 },
  };
  const inputManifestSha256 = digest(6);
  const checksumsSha256 = digest(7);
  const sizesSha256 = digest(8);
  const bootRecordsSha256 = digest(9);
  const buildAttestation = {
    SCHEMA_VERSION: "1",
    EVENT: "g12.ci.all_edge_runtime_smoke.bundles_verified",
    CANDIDATE_SHA: candidateSha,
    FUNCTION_COUNT: String(PRODUCTION_FUNCTIONS.length),
    INVENTORY_SHA256: inputManifest.inventorySha256,
    INPUT_MANIFEST_SHA256: inputManifestSha256,
    DEPENDENCY_FILES_SHA256: inputManifest.dependencies.filesSha256,
    BUNDLES_MANIFEST_SHA256: checksumsSha256,
    SIZES_MANIFEST_SHA256: sizesSha256,
    AGGREGATE_ESZIP_BYTES: String(bundles.reduce((total, bundle) => total + bundle.raw.bytes, 0)),
    EDGE_RUNTIME_INDEX_DIGEST: ALL_EDGE_RUNTIME_SMOKE.edgeRuntimeIndexDigest,
    EDGE_RUNTIME_AMD64_DIGEST: ALL_EDGE_RUNTIME_SMOKE.edgeRuntimeAmd64Digest,
    PLATFORM: "linux/amd64",
  };
  const bootAttestation = {
    SCHEMA_VERSION: "1",
    EVENT: "g12.ci.all_edge_runtime_smoke.boots_verified",
    CANDIDATE_SHA: candidateSha,
    FUNCTION_COUNT: String(PRODUCTION_FUNCTIONS.length),
    INVENTORY_SHA256: inputManifest.inventorySha256,
    BOOT_RECORDS_SHA256: bootRecordsSha256,
    EDGE_RUNTIME_IMAGE: ALL_EDGE_RUNTIME_SMOKE.edgeRuntimeImage,
  };
  return {
    candidateSha,
    inputManifest,
    inputManifestSha256,
    checksumsSha256,
    sizesSha256,
    bootRecordsSha256,
    bundles,
    buildAttestation,
    bootAttestation,
    fileIndexSha256: digest(10),
    fileCount: 500,
  };
}

function jobBody(name, nextName) {
  const start = workflow.indexOf(`  ${name}:`);
  const end = workflow.indexOf(`\n  ${nextName}:`, start);
  assert.notEqual(start, -1, `missing job ${name}`);
  assert.notEqual(end, -1, `missing job boundary ${nextName}`);
  return workflow.slice(start, end);
}

function assertOrdered(source, values) {
  let cursor = -1;
  for (const value of values) {
    const next = source.indexOf(value, cursor + 1);
    assert.notEqual(next, -1, `missing ordered token: ${value}`);
    assert.ok(next > cursor, `out-of-order token: ${value}`);
    cursor = next;
  }
}

async function filesUnder(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files.sort((left, right) => left.localeCompare(right));
}

async function fixture(root) {
  const source = join(root, "source");
  await mkdir(join(source, "supabase", "functions", "_shared"), { recursive: true });
  await writeFile(
    join(source, "supabase", "functions", "_shared", "security.ts"),
    "export const ok = true;\n",
  );
  for (const name of PRODUCTION_FUNCTIONS) {
    const directory = join(source, "supabase", "functions", name);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "index.ts"), 'Deno.serve(() => new Response("ok"));\n');
  }
  await writeFile(
    join(source, "supabase", "functions", "import_map.json"),
    `${JSON.stringify({ imports: { zod: "npm:zod@4.4.3" } }, null, 2)}\n`,
  );
  for (const path of ALL_EDGE_RUNTIME_SMOKE.externalSourceFiles) {
    const target = join(source, ...path.split("/"));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, `export const fixture = ${JSON.stringify(path)};\n`);
  }
  await writeFile(join(source, "deno.lock"), repositoryRootLockBytes);
  const edgeSourceLockPath = join(source, ...ALL_EDGE_RUNTIME_SOURCE_LOCK.path.split("/"));
  await mkdir(dirname(edgeSourceLockPath), { recursive: true });
  await writeFile(edgeSourceLockPath, edgeSourceLockBytes);
  return source;
}

test("the complete runtime smoke inventory is exactly the deployable production inventory", async () => {
  assert.deepEqual(ALL_EDGE_RUNTIME_SMOKE.functions, PRODUCTION_FUNCTIONS);
  assert.equal(ALL_EDGE_RUNTIME_SMOKE.functions.length, 34);
  assert.equal(new Set(ALL_EDGE_RUNTIME_SMOKE.functions).size, 34);
  const sourceDirectories = (await readdir("supabase/functions", { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name !== "_shared")
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
  assert.deepEqual(
    [...ALL_EDGE_RUNTIME_SMOKE.functions].sort((left, right) => left.localeCompare(right)),
    sourceDirectories,
  );
  const externalImports = new Set();
  const repositoryRoot = resolve(".");
  const functionsRoot = resolve("supabase/functions");
  for (const path of (await filesUnder("supabase/functions")).filter((item) => item.endsWith(".ts"))) {
    const source = await readFile(path, "utf8");
    for (const match of source.matchAll(/["']((?:\.\.\/)+[^"']+)["']/g)) {
      const target = resolve(dirname(path), match[1]);
      const fromFunctions = relative(functionsRoot, target);
      if (!fromFunctions.startsWith("..") && !isAbsolute(fromFunctions)) continue;
      externalImports.add(relative(repositoryRoot, target).replaceAll("\\", "/"));
    }
  }
  const sealedExternalFiles = new Set(ALL_EDGE_RUNTIME_SMOKE.externalSourceFiles);
  assert.deepEqual(
    [...externalImports].sort((left, right) => left.localeCompare(right)),
    [...externalImports]
      .filter((path) => sealedExternalFiles.has(path))
      .sort((left, right) => left.localeCompare(right)),
  );
  assert.deepEqual(
    ALL_EDGE_RUNTIME_SMOKE.externalSourceFiles.filter((path) => path.startsWith("scripts/")),
    [
      "scripts/ev2/phase12/configure-staging-ai-provider-secrets.mjs",
      "scripts/ev2/phase12/configure-staging-edge-public-secrets.mjs",
      "scripts/ev2/phase12/staging-ai-provider-secrets-lib.mjs",
      "scripts/ev2/phase12/staging-edge-public-secrets-lib.mjs",
    ],
  );
});

test("materialization seals the exact candidate inventory, source tree, frozen lock, and runtime pins", async () => {
  const root = await mkdtemp(join(tmpdir(), "g12-all-edge-runtime-"));
  try {
    const source = await fixture(root);
    const output = join(root, "output");
    const candidateSha = "a".repeat(40);
    const manifest = await materializeAllEdgeRuntimeSmokeInput({ source, output, candidateSha });
    assert.equal(manifest.candidateSha, candidateSha);
    assert.deepEqual(manifest.functions, PRODUCTION_FUNCTIONS);
    assert.equal(manifest.functionCount, 34);
    assert.match(manifest.source.treeSha256, /^[a-f0-9]{64}$/);
    assert.equal(manifest.source.denoLockSha256, sha256(repositoryRootLockBytes));
    assert.equal(manifest.source.edgeSourceDenoLockPath, ALL_EDGE_RUNTIME_SOURCE_LOCK.path);
    assert.equal(manifest.source.edgeSourceDenoLockSha256, ALL_EDGE_RUNTIME_SOURCE_LOCK.sha256);
    assert.equal(manifest.source.edgeSourceDenoLockBytes, ALL_EDGE_RUNTIME_SOURCE_LOCK.serializedBytes);
    assert.deepEqual(manifest.source.externalSourceFiles, [
      "scripts/ev2/phase12/configure-staging-ai-provider-secrets.mjs",
      "scripts/ev2/phase12/configure-staging-edge-public-secrets.mjs",
      "scripts/ev2/phase12/staging-ai-provider-secrets-lib.mjs",
      "scripts/ev2/phase12/staging-edge-public-secrets-lib.mjs",
      "src/shared/contracts/cms-content.ts",
      "src/shared/dam-media-policy.ts",
      "src/shared/raster-image-metadata.ts",
    ]);
    assert.match(manifest.materialized.treeSha256, /^[a-f0-9]{64}$/);
    assert.match(manifest.inventorySha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(manifest.runtime, {
      image: ALL_EDGE_RUNTIME_SMOKE.edgeRuntimeImage,
      indexDigest: ALL_EDGE_RUNTIME_SMOKE.edgeRuntimeIndexDigest,
      amd64Digest: ALL_EDGE_RUNTIME_SMOKE.edgeRuntimeAmd64Digest,
    });
    assert.equal(
      await readFile(join(output, "edge-functions.txt"), "utf8"),
      `${PRODUCTION_FUNCTIONS.join("\n")}\n`,
    );
    await assert.rejects(readFile(join(output, "deno.json")), (error) => error?.code === "ENOENT");
    await assert.rejects(readFile(join(output, "deno.lock")), (error) => error?.code === "ENOENT");
    const dependencyIndex = await readFile(join(output, "edge-function-dependencies.sha256"), "utf8");
    const dependencyLines = dependencyIndex.trimEnd().split("\n");
    assert.equal(dependencyLines.length, 68);
    const dependencyPaths = dependencyLines.map((line) => line.slice(66));
    assert.deepEqual(
      dependencyPaths,
      [...dependencyPaths].sort((left, right) => left.localeCompare(right)),
    );
    assert.equal(manifest.dependencies.filesPath, "edge-function-dependencies.sha256");
    assert.equal(manifest.dependencies.filesSha256, sha256(Buffer.from(dependencyIndex)));
    assert.equal(manifest.dependencies.fileCount, 68);
    assert.deepEqual(manifest.dependencies.profiles, [
      lockProfileEvidence(
        "standard",
        PRODUCTION_FUNCTIONS.filter((name) => !["rdo-command", "rdo-sign"].includes(name)),
      ),
      lockProfileEvidence("pdf", ["rdo-command", "rdo-sign"]),
    ]);
    for (const name of PRODUCTION_FUNCTIONS) {
      const directory = join(output, "supabase", "functions", name);
      const configBytes = await readFile(join(directory, "deno.json"));
      const lockBytes = await readFile(join(directory, "deno.lock"));
      assert.deepEqual(JSON.parse(configBytes.toString("utf8")), {
        imports: { zod: "npm:zod@4.4.3" },
        lock: { path: "./deno.lock", frozen: true },
        nodeModulesDir: "none",
      });
      const profile = ["rdo-command", "rdo-sign"].includes(name) ? "pdf" : "standard";
      assert.equal(sha256(lockBytes), ALL_EDGE_RUNTIME_LOCK_PROFILES[profile].sha256, name);
      for (const leaf of ["deno.json", "deno.lock"])
        assert.ok(
          dependencyLines.includes(
            `${sha256(await readFile(join(directory, leaf)))}  supabase/functions/${name}/${leaf}`,
          ),
          `${name}/${leaf}`,
        );
    }
    for (const path of ALL_EDGE_RUNTIME_SMOKE.externalSourceFiles)
      assert.deepEqual(
        await readFile(join(output, ...path.split("/"))),
        await readFile(join(source, ...path.split("/"))),
      );
    assert.deepEqual(
      JSON.parse(await readFile(join(output, "all-edge-runtime-smoke-input.json"), "utf8")),
      manifest,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("materialization fails closed on inventory drift, local env, an existing output, and an invalid SHA", async () => {
  const root = await mkdtemp(join(tmpdir(), "g12-all-edge-runtime-refusal-"));
  try {
    const source = await fixture(root);
    await rm(join(source, "supabase", "functions", PRODUCTION_FUNCTIONS[0]), {
      recursive: true,
      force: true,
    });
    await assert.rejects(
      materializeAllEdgeRuntimeSmokeInput({
        source,
        output: join(root, "missing-function-output"),
        candidateSha: "b".repeat(40),
      }),
      /G12_ALL_EDGE_RUNTIME_SMOKE_FUNCTION_INVENTORY_REFUSED/,
    );
    await fixture(root);
    await writeFile(join(source, ".env.local"), "FORBIDDEN=true\n");
    await assert.rejects(
      materializeAllEdgeRuntimeSmokeInput({
        source,
        output: join(root, "local-env-output"),
        candidateSha: "b".repeat(40),
      }),
      /G12_ALL_EDGE_RUNTIME_SMOKE_LOCAL_ENV_REFUSED/,
    );
    await rm(join(source, ".env.local"));
    const nestedEnv = join(source, "supabase", "functions", "_shared", ".env.staging");
    await writeFile(nestedEnv, "FORBIDDEN=true\n");
    await assert.rejects(
      materializeAllEdgeRuntimeSmokeInput({
        source,
        output: join(root, "nested-env-output"),
        candidateSha: "b".repeat(40),
      }),
      /G12_ALL_EDGE_RUNTIME_SMOKE_LOCAL_ENV_REFUSED/,
    );
    await rm(nestedEnv);
    const existing = join(root, "existing-output");
    await mkdir(existing);
    await assert.rejects(
      materializeAllEdgeRuntimeSmokeInput({
        source,
        output: existing,
        candidateSha: "b".repeat(40),
      }),
      /G12_ALL_EDGE_RUNTIME_SMOKE_OUTPUT_EXISTS_REFUSED/,
    );
    await assert.rejects(
      materializeAllEdgeRuntimeSmokeInput({
        source,
        output: join(root, "invalid-sha-output"),
        candidateSha: "main",
      }),
      /G12_ALL_EDGE_RUNTIME_SMOKE_CANDIDATE_SHA_REFUSED/,
    );
    const injectedConfig = join(source, "supabase", "functions", PRODUCTION_FUNCTIONS[0], "deno.json");
    await writeFile(injectedConfig, "{}\n");
    await assert.rejects(
      materializeAllEdgeRuntimeSmokeInput({
        source,
        output: join(root, "injected-config-output"),
        candidateSha: "b".repeat(40),
      }),
      new RegExp(`G12_ALL_EDGE_RUNTIME_SMOKE_FUNCTION_CONFIG:${PRODUCTION_FUNCTIONS[0]}_REFUSED`),
    );
    await rm(injectedConfig);
    await writeFile(
      join(source, ...ALL_EDGE_RUNTIME_SOURCE_LOCK.path.split("/")),
      Buffer.concat([edgeSourceLockBytes, Buffer.from("\n")]),
    );
    await assert.rejects(
      materializeAllEdgeRuntimeSmokeInput({
        source,
        output: join(root, "source-lock-drift-output"),
        candidateSha: "b".repeat(40),
      }),
      /G12_ALL_EDGE_RUNTIME_SMOKE_EDGE_SOURCE_LOCK_IDENTITY_REFUSED/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("edge and full profiles run a candidate-bound all-function runtime smoke without deployment", () => {
  const job = jobBody("hotfix-bundle-smoke", "database");
  assert.match(job, /if: needs\.release-plan\.outputs\.run_edge == 'true'/);
  assert.match(job, /timeout-minutes: 35/);
  assert.match(job, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(job, /test "\$\(git -C candidate-source rev-parse HEAD\)" = "\$\{\{ github\.sha \}\}"/);
  assert.match(job, /test -z "\$\(git -C candidate-source status --short\)"/);
  assertOrdered(job, [
    "Verify the exact clean CI candidate before runtime smoke",
    "Prepare the production-mode candidate input for the Docker smoke",
    "Materialize the complete candidate Edge Function inventory",
    "Verify and pull the immutable runtime for the Docker smoke",
    "Seal the byte-identical Docker smoke builds",
    "Bundle and unbundle every candidate Edge Function in the pinned runtime",
    "Cold-boot every candidate Edge Function without external egress",
    "Seal the complete Edge Function candidate artifact",
    "Preserve the complete deployable Edge Function candidate artifact",
  ]);
  assert.match(job, /prepare-all-edge-runtime-smoke-input\.mjs/);
  assert.match(job, /--candidate-sha "\$\{\{ github\.sha \}\}"/);
  assert.match(job, /all-edge-runtime-input:\/workspace:ro/);
  assert.match(job, /all-edge-runtime-smoke-bundle\.sh:\/g12-all-edge-builder\.sh:ro/);
  assert.match(job, /--network bridge --read-only/);
  assert.match(job, /--cap-drop ALL --security-opt no-new-privileges/);
  assert.match(job, /all-edge-runtime-smoke-boot\.sh/);
  assert.match(job, /seal-all-edge-runtime-artifact\.mjs/);
  assert.match(job, /--boot-records "\$RUNNER_TEMP\/g12-all-edge-output\/boot-records\.tsv"/);
  assert.match(job, /path: \$\{\{ runner\.temp \}\}\/g12-all-edge-artifact/);
  assert.doesNotMatch(job, /path: \|[\s\S]*g12-all-edge-artifact/);
  assert.match(job, /artifact_id: \$\{\{ steps\.upload-edge-runtime-artifact\.outputs\.artifact-id \}\}/);
  assert.match(
    job,
    /artifact_digest: \$\{\{ steps\.upload-edge-runtime-artifact\.outputs\.artifact-digest \}\}/,
  );
  assert.match(job, /retention-days: 90/);
  assert.doesNotMatch(job, /supabase functions deploy|environment:|\$\{\{\s*secrets\./);
});

test("generic builder proves every exact entrypoint with pinned bundle and unbundle operations", () => {
  assert.match(builder, /expected_count=34/);
  assert.match(builder, /find "\$\{input\}\/supabase\/functions"[\s\S]*! -name _shared/);
  assert.match(builder, /cmp -s "\$\{inventory_sorted\}" "\$\{directories_sorted\}"/);
  assert.match(builder, /edge-runtime bundle/);
  assert.match(builder, /--entrypoint "\$\{entrypoint\}"/);
  assert.match(builder, /edge-runtime unbundle/);
  assert.match(builder, /unbundle_root="\$\{output\}\/unbundled\/\$\{slug\}"/);
  assert.match(builder, /unbundled="\$\{unbundle_root\}\/workspace\/supabase\/functions\/\$\{slug\}"/);
  assert.doesNotMatch(builder, /unbundled="\$\{output\}\/unbundled\/\$\{slug\}"/);
  assertOrdered(builder, [
    'unbundle_root="${output}/unbundled/${slug}"',
    'unbundled="${unbundle_root}/workspace/supabase/functions/${slug}"',
    'test ! -e "${eszip}" && test ! -e "${unbundle_root}"',
    'edge-runtime unbundle --eszip "${eszip}" --output "${unbundled}"',
    'require_directory "${unbundle_root}"',
    'if ! unbundled_symlink="$(find "${unbundle_root}" -type l -print -quit)"; then',
    'test -z "${unbundled_symlink}"',
    'if ! unbundled_file="$(find "${unbundle_root}" -type f -print -quit)"; then',
    'test -n "${unbundled_file}"',
  ]);
  assert.match(builder, /edge-function-dependencies\.sha256/);
  assert.match(builder, /count != 68/);
  assert.ok(builder.includes("$2 !~ /^supabase\\/functions\\/[a-z0-9-]+\\/deno\\.(json|lock)$/"));
  assert.match(builder, /G12_ALL_EDGE_RUNTIME_SMOKE_ROOT_DENO_CONFIG_REFUSED/);
  assert.match(builder, /function_config="\$\{input\}\/supabase\/functions\/\$\{slug\}\/deno\.json"/);
  assert.match(builder, /function_lock="\$\{input\}\/supabase\/functions\/\$\{slug\}\/deno\.lock"/);
  assert.match(builder, /maximum_eszip_bytes=67108864/);
  assert.match(builder, /maximum_aggregate_eszip_bytes=1073741824/);
  assert.match(builder, /g12\.ci\.all_edge_runtime_smoke\.bundle_measured/);
  assertOrdered(builder, [
    '"bytes":%s,"maximumBytes":%s',
    'test "${bytes}" -gt 0 && test "${bytes}" -le "${maximum_eszip_bytes}"',
  ]);
  assert.match(builder, /G12_ALL_EDGE_RUNTIME_SMOKE_BUNDLE_FAILED:\$\{slug\}/);
  assert.match(builder, /EVENT=g12\.ci\.all_edge_runtime_smoke\.bundles_verified/);
  assert.match(builder, /DEPENDENCY_FILES_SHA256/);
  assert.doesNotMatch(builder, /supabase functions deploy|TOKEN|PASSWORD|SECRET/);
});

test("mirrored per-function unbundle output contains shared and repository imports", () => {
  const slug = "cms-content";
  const unbundleRoot = posix.join("/output/unbundled", slug);
  const unbundled = posix.join(unbundleRoot, "workspace/supabase/functions", slug);
  const sharedModule = posix.resolve(unbundled, "../_shared/security.ts");
  const repositoryModule = posix.resolve(unbundled, "../../../src/shared/contracts/cms-content.ts");

  assert.equal(sharedModule, posix.join(unbundleRoot, "workspace/supabase/functions/_shared/security.ts"));
  assert.equal(repositoryModule, posix.join(unbundleRoot, "workspace/src/shared/contracts/cms-content.ts"));
  assert.ok(sharedModule.startsWith(`${unbundleRoot}/`));
  assert.ok(repositoryModule.startsWith(`${unbundleRoot}/`));
});

test("generic boot invokes every exact ESZIP in the pinned runtime with no network or privileges", () => {
  assert.match(boot, /expected_count=34/);
  assert.match(boot, /cmp -s "\$\{inventory_sorted\}" "\$\{bundles_sorted\}"/);
  assert.match(boot, /--network none/);
  assert.match(boot, /--read-only/);
  assert.match(boot, /--cap-drop ALL/);
  assert.match(boot, /--security-opt no-new-privileges/);
  assert.match(boot, /--main-entrypoint "workspace\/supabase\/functions\/\$\{slug\}\/index\.ts"/);
  assert.match(boot, /test "\$\{slug\}" != cms-outbox-worker \|\| expected_status=401/);
  assert.match(boot, /OPTIONS \/ HTTP\/1\.1/);
  assert.match(boot, /EVENT=g12\.ci\.all_edge_runtime_smoke\.boots_verified/);
  assert.match(boot, /boot-records\.tsv/);
  assert.match(boot, /BOOT_RECORDS_SHA256/);
  assert.doesNotMatch(boot, /--network bridge|TOKEN|PASSWORD|SECRET/);
});

test("the sealed Edge artifact manifest binds exact raw ESZIP and deployable EZBR metadata", () => {
  const fixture = artifactFixture();
  const manifest = buildAllEdgeRuntimeArtifactManifest(fixture);
  assert.equal(ALL_EDGE_RUNTIME_SMOKE.maximumEszipBytes, 64 * 1024 * 1024);
  assert.equal(ALL_EDGE_RUNTIME_SMOKE.maximumDeployableBytes, 20 * 1024 * 1024);
  assert.equal(
    ALL_EDGE_RUNTIME_SMOKE.maximumAggregateDeployableBytes,
    PRODUCTION_FUNCTIONS.length * ALL_EDGE_RUNTIME_SMOKE.maximumDeployableBytes,
  );
  assert.equal(manifest.functionCount, PRODUCTION_FUNCTIONS.length);
  assert.deepEqual(
    manifest.bundles.map((bundle) => bundle.slug),
    PRODUCTION_FUNCTIONS,
  );
  assert.equal(manifest.promotion.rebuildRequired, false);
  assert.equal(manifest.promotion.contentType, "application/vnd.denoland.eszip");
  assert.equal(manifest.promotion.bodyFormat, "ezbr");
  assert.equal(manifest.promotion.wireFraming, "EZBR+Brotli");
  assert.deepEqual(manifest.promotion.queryParameters, {
    checksum: "ezbr_sha256",
    verifyJwt: "verify_jwt",
    entrypointPath: "entrypoint_path",
    importMapPath: "import_map_path",
  });
  for (const bundle of manifest.bundles) {
    assert.equal(bundle.entrypointPath, `file:///workspace/supabase/functions/${bundle.slug}/index.ts`);
    assert.equal(bundle.importMapPath, `file:///workspace/supabase/functions/${bundle.slug}/deno.json`);
    assert.equal(bundle.raw.path, `raw/${bundle.slug}.eszip`);
    assert.equal(bundle.deployable.path, `deployable/${bundle.slug}.ezbr`);
    assert.equal(bundle.verifyJwt, !PUBLIC_FUNCTIONS.has(bundle.slug));
    assert.match(bundle.raw.sha256, /^[a-f0-9]{64}$/);
    assert.match(bundle.deployable.sha256, /^[a-f0-9]{64}$/);
  }
  assert.equal(manifest.evidence.bootRecordsPath, "evidence/boot-records.tsv");
});

test("the Edge artifact refuses missing, extra, reordered, or digest-unbound function payloads", () => {
  const missing = artifactFixture();
  missing.bundles = missing.bundles.slice(1);
  assert.throws(
    () => buildAllEdgeRuntimeArtifactManifest(missing),
    /G12_ALL_EDGE_RUNTIME_ARTIFACT_BUNDLE_CARDINALITY_REFUSED/,
  );
  const extra = artifactFixture();
  extra.bundles = [...extra.bundles, extra.bundles[0]];
  assert.throws(
    () => buildAllEdgeRuntimeArtifactManifest(extra),
    /G12_ALL_EDGE_RUNTIME_ARTIFACT_BUNDLE_CARDINALITY_REFUSED/,
  );
  const reordered = artifactFixture();
  [reordered.bundles[0], reordered.bundles[1]] = [reordered.bundles[1], reordered.bundles[0]];
  assert.throws(
    () => buildAllEdgeRuntimeArtifactManifest(reordered),
    /G12_ALL_EDGE_RUNTIME_ARTIFACT_BUNDLE_INVENTORY_REFUSED/,
  );
  const digestDrift = artifactFixture();
  digestDrift.buildAttestation.BUNDLES_MANIFEST_SHA256 = digest(999);
  assert.throws(
    () => buildAllEdgeRuntimeArtifactManifest(digestDrift),
    /G12_ALL_EDGE_RUNTIME_ARTIFACT_BUILD_ATTESTATION_REFUSED/,
  );
  const deployableOversize = artifactFixture();
  deployableOversize.bundles[0].deployable.bytes = ALL_EDGE_RUNTIME_SMOKE.maximumDeployableBytes + 1;
  assert.throws(
    () => buildAllEdgeRuntimeArtifactManifest(deployableOversize),
    new RegExp(`G12_ALL_EDGE_RUNTIME_ARTIFACT_BUNDLE:${PRODUCTION_FUNCTIONS[0]}_REFUSED`),
  );
  const rawAggregateOversize = artifactFixture();
  for (const bundle of rawAggregateOversize.bundles) bundle.raw.bytes = 32 * 1024 * 1024;
  rawAggregateOversize.buildAttestation.AGGREGATE_ESZIP_BYTES = String(
    rawAggregateOversize.bundles.reduce((total, bundle) => total + bundle.raw.bytes, 0),
  );
  assert.throws(
    () => buildAllEdgeRuntimeArtifactManifest(rawAggregateOversize),
    /G12_ALL_EDGE_RUNTIME_ARTIFACT_ARTIFACT_BOUNDARY_REFUSED/,
  );
});

test("the sealer and read-only consumer prove one exact all-function EZBR artifact end to end", async () => {
  const root = await mkdtemp(join(tmpdir(), "g12-all-edge-artifact-"));
  try {
    const source = await fixture(root);
    const input = join(root, "input");
    const bundles = join(root, "bundles");
    const evidence = join(root, "builder-evidence");
    const output = join(root, "artifact");
    const candidateSha = "f".repeat(40);
    const inputManifest = await materializeAllEdgeRuntimeSmokeInput({
      source,
      output: input,
      candidateSha,
    });
    await mkdir(bundles);
    await mkdir(evidence);
    const checksumLines = [];
    const sizeLines = [];
    const bootLines = [];
    let aggregateBytes = 0;
    for (const slug of PRODUCTION_FUNCTIONS) {
      const raw = validEszip(slug);
      await writeFile(join(bundles, `${slug}.eszip`), raw);
      checksumLines.push(`${sha256(raw)}  bundles/${slug}.eszip`);
      sizeLines.push(`${slug}\t${raw.byteLength}`);
      bootLines.push(`${slug}\t${sha256(raw)}\t${slug === "cms-outbox-worker" ? 401 : 200}`);
      aggregateBytes += raw.byteLength;
    }
    const checksums = Buffer.from(`${checksumLines.join("\n")}\n`);
    const sizes = Buffer.from(`${sizeLines.join("\n")}\n`);
    const bootRecords = Buffer.from(`${bootLines.join("\n")}\n`);
    const inputManifestBytes = await readFile(join(input, "all-edge-runtime-smoke-input.json"));
    const checksumsPath = join(evidence, "runtime-bundles.sha256");
    const sizesPath = join(evidence, "runtime-bundles.bytes");
    const bootRecordsPath = join(evidence, "boot-records.tsv");
    const buildAttestationPath = join(evidence, "build-attestation.env");
    const bootAttestationPath = join(evidence, "boot-attestation.env");
    await writeFile(checksumsPath, checksums);
    await writeFile(sizesPath, sizes);
    await writeFile(bootRecordsPath, bootRecords);
    await writeFile(
      buildAttestationPath,
      [
        "SCHEMA_VERSION=1",
        "EVENT=g12.ci.all_edge_runtime_smoke.bundles_verified",
        `CANDIDATE_SHA=${candidateSha}`,
        `FUNCTION_COUNT=${PRODUCTION_FUNCTIONS.length}`,
        `INVENTORY_SHA256=${inputManifest.inventorySha256}`,
        `INPUT_MANIFEST_SHA256=${sha256(inputManifestBytes)}`,
        `DEPENDENCY_FILES_SHA256=${inputManifest.dependencies.filesSha256}`,
        `BUNDLES_MANIFEST_SHA256=${sha256(checksums)}`,
        `SIZES_MANIFEST_SHA256=${sha256(sizes)}`,
        `AGGREGATE_ESZIP_BYTES=${aggregateBytes}`,
        `EDGE_RUNTIME_INDEX_DIGEST=${ALL_EDGE_RUNTIME_SMOKE.edgeRuntimeIndexDigest}`,
        `EDGE_RUNTIME_AMD64_DIGEST=${ALL_EDGE_RUNTIME_SMOKE.edgeRuntimeAmd64Digest}`,
        "PLATFORM=linux/amd64",
        "",
      ].join("\n"),
    );
    await writeFile(
      bootAttestationPath,
      [
        "SCHEMA_VERSION=1",
        "EVENT=g12.ci.all_edge_runtime_smoke.boots_verified",
        `CANDIDATE_SHA=${candidateSha}`,
        `FUNCTION_COUNT=${PRODUCTION_FUNCTIONS.length}`,
        `INVENTORY_SHA256=${inputManifest.inventorySha256}`,
        `BOOT_RECORDS_SHA256=${sha256(bootRecords)}`,
        `EDGE_RUNTIME_IMAGE=${ALL_EDGE_RUNTIME_SMOKE.edgeRuntimeImage}`,
        "",
      ].join("\n"),
    );
    const manifest = await sealAllEdgeRuntimeArtifact({
      input,
      bundles,
      buildAttestation: buildAttestationPath,
      bootAttestation: bootAttestationPath,
      bootRecords: bootRecordsPath,
      checksums: checksumsPath,
      sizes: sizesPath,
      output,
      candidateSha,
    });
    const manifestSha256 = sha256(await readFile(join(output, "manifest.json")));
    const verified = loadAndVerifyAllEdgeRuntimeArtifact({
      root: output,
      candidateSha,
      manifestSha256,
    });
    assert.equal(verified.manifest.event, manifest.event);
    assert.equal(verified.functions.length, PRODUCTION_FUNCTIONS.length);
    assert.ok(verified.functions.every((record) => record.deployable.path.endsWith(".ezbr")));
    const githubOutput = join(root, "github-output.txt");
    const cli = spawnSync(
      process.execPath,
      [verifierPath, "--root", output, "--candidate-sha", candidateSha, "--manifest-sha256", manifestSha256],
      {
        encoding: "utf8",
        env: { ...process.env, GITHUB_OUTPUT: githubOutput },
      },
    );
    assert.equal(cli.status, 0, cli.stderr);
    assert.deepEqual(JSON.parse(cli.stdout), {
      schemaVersion: 1,
      event: "g12.ci.all_edge_runtime_smoke.artifact_verified",
      candidateSha,
      manifestSha256,
      fileIndexSha256: manifest.evidence.fileIndexSha256,
      inventorySha256: inputManifest.inventorySha256,
      functionCount: PRODUCTION_FUNCTIONS.length,
      transport: "management-api-ezbr",
    });
    const outputs = await readFile(githubOutput, "utf8");
    for (const line of [
      `candidate_sha=${candidateSha}`,
      `manifest_sha256=${manifestSha256}`,
      `file_index_sha256=${manifest.evidence.fileIndexSha256}`,
      `inventory_sha256=${inputManifest.inventorySha256}`,
      `function_count=${PRODUCTION_FUNCTIONS.length}`,
      "transport=management-api-ezbr",
    ])
      assert.match(outputs, new RegExp(`^${line}$`, "m"));
    await writeFile(join(output, "deployable", `${PRODUCTION_FUNCTIONS[0]}.ezbr`), "tampered");
    assert.throws(
      () => loadAndVerifyAllEdgeRuntimeArtifact({ root: output, candidateSha, manifestSha256 }),
      /G12_ALL_EDGE_RUNTIME_ARTIFACT_CONSUMER_INDEX_CONTENT_REFUSED/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the artifact sealer frames each raw ESZIP as deterministic Brotli EZBR and preserves exact source", () => {
  assert.match(sealer, /frameRawEszip\(raw\)/);
  assert.match(sealer, /deployable\/\$\{name\}\.ezbr/);
  assert.match(sealer, /importMapPath: `file:\/\/\/workspace\/supabase\/functions\/\$\{name\}\/deno\.json`/);
  assert.match(sealer, /edge-function-dependencies\.sha256/);
  assert.match(sealer, /PUBLIC_FUNCTIONS\.has\(name\)/);
  assert.match(sealer, /join\(outputRoot, "source"\)/);
  assert.match(sealer, /artifact-files\.sha256/);
  assert.match(sealer, /boot-records\.tsv/);
  assert.match(sealer, /manifest\.json/);
});

test("attestation parsing rejects duplicate or malformed evidence fields", () => {
  assert.deepEqual(parseExactAttestation("SCHEMA_VERSION=1\nEVENT=ok\n"), {
    SCHEMA_VERSION: "1",
    EVENT: "ok",
  });
  assert.throws(
    () => parseExactAttestation("EVENT=one\nEVENT=two\n"),
    /G12_ALL_EDGE_RUNTIME_ARTIFACT_ATTESTATION_LINE_REFUSED/,
  );
});

test("every CI checkout drops the GitHub credential after checkout", () => {
  const matches = [...workflow.matchAll(/uses: actions\/checkout@[a-f0-9]+[^\n]*/g)];
  assert.ok(matches.length >= 7);
  for (const match of matches) {
    const nextStep = workflow.indexOf("\n      - ", match.index + match[0].length);
    const step = workflow.slice(match.index, nextStep === -1 ? workflow.length : nextStep);
    assert.match(step, /persist-credentials: false/, `credential persisted near offset ${match.index}`);
  }
});
