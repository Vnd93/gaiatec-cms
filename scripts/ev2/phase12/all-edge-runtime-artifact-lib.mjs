import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

import { ALL_EDGE_RUNTIME_SMOKE } from "./all-edge-runtime-smoke-lib.mjs";
import { PUBLIC_FUNCTIONS } from "./production-backend-lib.mjs";
import { reconcileDownloadedBundleBody } from "./staging-cms-public-hotfix-lib.mjs";

const SHA256 = /^[a-f0-9]{64}$/;

function refuse(label) {
  throw new Error(`G12_ALL_EDGE_RUNTIME_ARTIFACT_${label}_REFUSED`);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function posix(value) {
  return value.split(sep).join("/");
}

function requireFile(path, label) {
  const stats = lstatSync(path, { throwIfNoEntry: false });
  if (!stats?.isFile() || stats.isSymbolicLink()) refuse(label);
}

function artifactRecords(root, directoryNames) {
  const records = [];
  function walk(path) {
    const stats = lstatSync(path, { throwIfNoEntry: false });
    if (!stats || stats.isSymbolicLink()) refuse("CONSUMER_TREE");
    if (stats.isDirectory()) {
      for (const entry of readdirSync(path).sort((left, right) => left.localeCompare(right)))
        walk(join(path, entry));
      return;
    }
    if (!stats.isFile()) refuse("CONSUMER_TREE");
    const bytes = readFileSync(path);
    records.push({ path: posix(relative(root, path)), sha256: sha256(bytes), bytes: bytes.byteLength });
  }
  for (const directory of directoryNames) walk(join(root, directory));
  return records.sort((left, right) => left.path.localeCompare(right.path));
}

function exactKeys(value, expected, label) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())
  )
    refuse(label);
}

function validateAttestations({
  candidateSha,
  inputManifest,
  inputManifestSha256,
  checksumsSha256,
  sizesSha256,
  bootRecordsSha256,
  buildAttestation,
  bootAttestation,
}) {
  exactKeys(
    buildAttestation,
    [
      "SCHEMA_VERSION",
      "EVENT",
      "CANDIDATE_SHA",
      "FUNCTION_COUNT",
      "INVENTORY_SHA256",
      "INPUT_MANIFEST_SHA256",
      "BUNDLES_MANIFEST_SHA256",
      "SIZES_MANIFEST_SHA256",
      "AGGREGATE_ESZIP_BYTES",
      "EDGE_RUNTIME_INDEX_DIGEST",
      "EDGE_RUNTIME_AMD64_DIGEST",
      "PLATFORM",
    ],
    "BUILD_ATTESTATION_SHAPE",
  );
  exactKeys(
    bootAttestation,
    [
      "SCHEMA_VERSION",
      "EVENT",
      "CANDIDATE_SHA",
      "FUNCTION_COUNT",
      "INVENTORY_SHA256",
      "BOOT_RECORDS_SHA256",
      "EDGE_RUNTIME_IMAGE",
    ],
    "BOOT_ATTESTATION_SHAPE",
  );
  if (
    buildAttestation.SCHEMA_VERSION !== "1" ||
    buildAttestation.EVENT !== "g12.ci.all_edge_runtime_smoke.bundles_verified" ||
    buildAttestation.CANDIDATE_SHA !== candidateSha ||
    buildAttestation.FUNCTION_COUNT !== String(ALL_EDGE_RUNTIME_SMOKE.functions.length) ||
    buildAttestation.INVENTORY_SHA256 !== inputManifest.inventorySha256 ||
    buildAttestation.EDGE_RUNTIME_INDEX_DIGEST !== ALL_EDGE_RUNTIME_SMOKE.edgeRuntimeIndexDigest ||
    buildAttestation.EDGE_RUNTIME_AMD64_DIGEST !== ALL_EDGE_RUNTIME_SMOKE.edgeRuntimeAmd64Digest ||
    buildAttestation.PLATFORM !== "linux/amd64" ||
    buildAttestation.INPUT_MANIFEST_SHA256 !== inputManifestSha256 ||
    buildAttestation.BUNDLES_MANIFEST_SHA256 !== checksumsSha256 ||
    buildAttestation.SIZES_MANIFEST_SHA256 !== sizesSha256 ||
    !/^[1-9][0-9]*$/.test(buildAttestation.AGGREGATE_ESZIP_BYTES)
  )
    refuse("BUILD_ATTESTATION");
  if (
    bootAttestation.SCHEMA_VERSION !== "1" ||
    bootAttestation.EVENT !== "g12.ci.all_edge_runtime_smoke.boots_verified" ||
    bootAttestation.CANDIDATE_SHA !== candidateSha ||
    bootAttestation.FUNCTION_COUNT !== String(ALL_EDGE_RUNTIME_SMOKE.functions.length) ||
    bootAttestation.INVENTORY_SHA256 !== inputManifest.inventorySha256 ||
    bootAttestation.EDGE_RUNTIME_IMAGE !== ALL_EDGE_RUNTIME_SMOKE.edgeRuntimeImage ||
    bootAttestation.BOOT_RECORDS_SHA256 !== bootRecordsSha256
  )
    refuse("BOOT_ATTESTATION");
}

export function parseExactAttestation(text) {
  const result = {};
  for (const line of String(text).split(/\r?\n/)) {
    if (!line) continue;
    const delimiter = line.indexOf("=");
    if (delimiter < 1) refuse("ATTESTATION_LINE");
    const key = line.slice(0, delimiter);
    if (!/^[A-Z][A-Z0-9_]*$/.test(key) || Object.hasOwn(result, key)) refuse("ATTESTATION_LINE");
    result[key] = line.slice(delimiter + 1);
  }
  return result;
}

export function buildAllEdgeRuntimeArtifactManifest({
  candidateSha,
  inputManifest,
  inputManifestSha256,
  checksumsSha256,
  sizesSha256,
  bootRecordsSha256,
  bundles,
  buildAttestation,
  bootAttestation,
  fileIndexSha256,
  fileCount,
}) {
  if (!/^[a-f0-9]{40}$/.test(String(candidateSha ?? ""))) refuse("CANDIDATE_SHA");
  exactKeys(
    inputManifest,
    [
      "schemaVersion",
      "event",
      "candidateSha",
      "runtime",
      "functions",
      "functionCount",
      "inventorySha256",
      "source",
      "materialized",
    ],
    "INPUT_MANIFEST_SHAPE",
  );
  exactKeys(inputManifest.runtime, ["image", "indexDigest", "amd64Digest"], "RUNTIME_SHAPE");
  exactKeys(
    inputManifest.source,
    ["treeSha256", "fileCount", "bytes", "denoLockSha256", "importMapSha256", "externalSourceFiles"],
    "SOURCE_SHAPE",
  );
  exactKeys(inputManifest.materialized, ["treeSha256", "fileCount", "bytes"], "MATERIALIZED_SHAPE");
  if (
    inputManifest.schemaVersion !== 1 ||
    inputManifest.event !== "g12.ci.all_edge_runtime_smoke.input_materialized" ||
    inputManifest.candidateSha !== candidateSha ||
    JSON.stringify(inputManifest.functions) !== JSON.stringify(ALL_EDGE_RUNTIME_SMOKE.functions) ||
    inputManifest.functionCount !== ALL_EDGE_RUNTIME_SMOKE.functions.length ||
    inputManifest.runtime?.image !== ALL_EDGE_RUNTIME_SMOKE.edgeRuntimeImage ||
    inputManifest.runtime?.indexDigest !== ALL_EDGE_RUNTIME_SMOKE.edgeRuntimeIndexDigest ||
    inputManifest.runtime?.amd64Digest !== ALL_EDGE_RUNTIME_SMOKE.edgeRuntimeAmd64Digest ||
    !SHA256.test(inputManifest.inventorySha256) ||
    !SHA256.test(inputManifestSha256) ||
    !SHA256.test(checksumsSha256) ||
    !SHA256.test(sizesSha256) ||
    !SHA256.test(bootRecordsSha256) ||
    !SHA256.test(inputManifest.source.treeSha256) ||
    !SHA256.test(inputManifest.source.denoLockSha256) ||
    !SHA256.test(inputManifest.source.importMapSha256) ||
    JSON.stringify(inputManifest.source.externalSourceFiles) !==
      JSON.stringify(ALL_EDGE_RUNTIME_SMOKE.externalSourceFiles) ||
    !Number.isSafeInteger(inputManifest.source.fileCount) ||
    inputManifest.source.fileCount < 1 ||
    !Number.isSafeInteger(inputManifest.source.bytes) ||
    inputManifest.source.bytes < 1 ||
    !SHA256.test(inputManifest.materialized.treeSha256) ||
    !Number.isSafeInteger(inputManifest.materialized.fileCount) ||
    inputManifest.materialized.fileCount < 1 ||
    !Number.isSafeInteger(inputManifest.materialized.bytes) ||
    inputManifest.materialized.bytes < 1
  )
    refuse("INPUT_MANIFEST");
  validateAttestations({
    candidateSha,
    inputManifest,
    inputManifestSha256,
    checksumsSha256,
    sizesSha256,
    bootRecordsSha256,
    buildAttestation,
    bootAttestation,
  });
  if (!Array.isArray(bundles) || bundles.length !== ALL_EDGE_RUNTIME_SMOKE.functions.length)
    refuse("BUNDLE_CARDINALITY");
  const expected = ALL_EDGE_RUNTIME_SMOKE.functions;
  if (JSON.stringify(bundles.map((bundle) => bundle.slug)) !== JSON.stringify(expected))
    refuse("BUNDLE_INVENTORY");
  let aggregateRawBytes = 0;
  let aggregateDeployableBytes = 0;
  for (const bundle of bundles) {
    exactKeys(
      bundle,
      ["slug", "entrypointPath", "importMapPath", "verifyJwt", "expectedColdBootStatus", "raw", "deployable"],
      "BUNDLE_SHAPE",
    );
    exactKeys(bundle.raw, ["path", "sha256", "bytes"], "RAW_BUNDLE_SHAPE");
    exactKeys(bundle.deployable, ["path", "sha256", "bytes"], "DEPLOYABLE_BUNDLE_SHAPE");
    if (
      bundle.entrypointPath !== `file:///workspace/supabase/functions/${bundle.slug}/index.ts` ||
      bundle.importMapPath !== "file:///workspace/deno.json" ||
      bundle.verifyJwt !== !PUBLIC_FUNCTIONS.has(bundle.slug) ||
      bundle.expectedColdBootStatus !== (bundle.slug === "cms-outbox-worker" ? 401 : 200) ||
      bundle.raw.path !== `raw/${bundle.slug}.eszip` ||
      bundle.deployable.path !== `deployable/${bundle.slug}.ezbr` ||
      !SHA256.test(bundle.raw.sha256) ||
      !SHA256.test(bundle.deployable.sha256) ||
      !Number.isSafeInteger(bundle.raw.bytes) ||
      bundle.raw.bytes < 1 ||
      bundle.raw.bytes > ALL_EDGE_RUNTIME_SMOKE.maximumEszipBytes ||
      !Number.isSafeInteger(bundle.deployable.bytes) ||
      bundle.deployable.bytes < 1
    )
      refuse(`BUNDLE:${bundle.slug}`);
    aggregateRawBytes += bundle.raw.bytes;
    aggregateDeployableBytes += bundle.deployable.bytes;
  }
  if (
    aggregateRawBytes > ALL_EDGE_RUNTIME_SMOKE.maximumAggregateEszipBytes ||
    String(aggregateRawBytes) !== buildAttestation.AGGREGATE_ESZIP_BYTES ||
    !SHA256.test(fileIndexSha256) ||
    !Number.isSafeInteger(fileCount) ||
    fileCount < 1
  )
    refuse("ARTIFACT_BOUNDARY");
  return {
    schemaVersion: 1,
    event: "g12.ci.all_edge_runtime_smoke.artifact_sealed",
    candidateSha,
    functionCount: expected.length,
    runtime: {
      image: ALL_EDGE_RUNTIME_SMOKE.edgeRuntimeImage,
      indexDigest: ALL_EDGE_RUNTIME_SMOKE.edgeRuntimeIndexDigest,
      amd64Digest: ALL_EDGE_RUNTIME_SMOKE.edgeRuntimeAmd64Digest,
      platform: "linux/amd64",
    },
    input: {
      path: "source",
      manifestPath: "evidence/input-manifest.json",
      manifestSha256: inputManifestSha256,
      inventorySha256: inputManifest.inventorySha256,
      treeSha256: inputManifest.materialized.treeSha256,
      fileCount: inputManifest.materialized.fileCount,
      bytes: inputManifest.materialized.bytes,
      denoLockSha256: inputManifest.source.denoLockSha256,
      importMapSha256: inputManifest.source.importMapSha256,
      externalSourceFiles: inputManifest.source.externalSourceFiles,
    },
    promotion: {
      rebuildRequired: false,
      method: "PATCH",
      contentType: "application/vnd.denoland.eszip",
      bodyFormat: "ezbr",
      wireFraming: "EZBR+Brotli",
      endpointTemplate: "/v1/projects/{projectRef}/functions/{slug}",
      queryParameters: {
        checksum: "ezbr_sha256",
        verifyJwt: "verify_jwt",
        entrypointPath: "entrypoint_path",
        importMapPath: "import_map_path",
      },
    },
    bundles,
    aggregateRawBytes,
    aggregateDeployableBytes,
    evidence: {
      buildAttestationPath: "evidence/build-attestation.env",
      bootAttestationPath: "evidence/boot-attestation.env",
      bundleChecksumsPath: "evidence/runtime-bundles.sha256",
      bundleChecksumsSha256: checksumsSha256,
      bundleSizesPath: "evidence/runtime-bundles.bytes",
      bundleSizesSha256: sizesSha256,
      bootRecordsPath: "evidence/boot-records.tsv",
      bootRecordsSha256,
      fileIndexPath: "artifact-files.sha256",
      fileIndexSha256,
      indexedFileCount: fileCount,
    },
  };
}

export function loadAndVerifyAllEdgeRuntimeArtifact({ root, candidateSha, manifestSha256 }) {
  const artifactRoot = resolve(root);
  if (!/^[a-f0-9]{40}$/.test(String(candidateSha ?? ""))) refuse("CONSUMER_CANDIDATE_SHA");
  if (!SHA256.test(String(manifestSha256 ?? ""))) refuse("CONSUMER_MANIFEST_SHA");
  const rootStats = lstatSync(artifactRoot, { throwIfNoEntry: false });
  if (!rootStats?.isDirectory() || rootStats.isSymbolicLink()) refuse("CONSUMER_ROOT");
  const expectedRootEntries = [
    "artifact-files.sha256",
    "deployable",
    "evidence",
    "manifest.json",
    "raw",
    "source",
  ];
  const rootEntries = readdirSync(artifactRoot).sort((left, right) => left.localeCompare(right));
  if (JSON.stringify(rootEntries) !== JSON.stringify(expectedRootEntries)) refuse("CONSUMER_LAYOUT");
  const manifestPath = join(artifactRoot, "manifest.json");
  const indexPath = join(artifactRoot, "artifact-files.sha256");
  requireFile(manifestPath, "CONSUMER_MANIFEST");
  requireFile(indexPath, "CONSUMER_INDEX");
  const manifestBytes = readFileSync(manifestPath);
  if (sha256(manifestBytes) !== manifestSha256) refuse("CONSUMER_MANIFEST_DIGEST");
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    refuse("CONSUMER_MANIFEST_JSON");
  }
  const records = artifactRecords(artifactRoot, ["source", "raw", "deployable", "evidence"]);
  const expectedIndexBytes = Buffer.from(
    records.map((record) => `${record.sha256}  ${record.path}\n`).join(""),
    "utf8",
  );
  const indexBytes = readFileSync(indexPath);
  if (!indexBytes.equals(expectedIndexBytes)) refuse("CONSUMER_INDEX_CONTENT");

  const evidenceRoot = join(artifactRoot, "evidence");
  const inputManifestBytes = readFileSync(join(evidenceRoot, "input-manifest.json"));
  if (
    !inputManifestBytes.equals(
      readFileSync(join(artifactRoot, "source", "all-edge-runtime-smoke-input.json")),
    ) ||
    !readFileSync(join(evidenceRoot, "edge-functions.txt")).equals(
      readFileSync(join(artifactRoot, "source", "edge-functions.txt")),
    )
  )
    refuse("CONSUMER_SOURCE_EVIDENCE");
  let inputManifest;
  try {
    inputManifest = JSON.parse(inputManifestBytes.toString("utf8"));
  } catch {
    refuse("CONSUMER_INPUT_MANIFEST_JSON");
  }
  const checksumsBytes = readFileSync(join(evidenceRoot, "runtime-bundles.sha256"));
  const sizesBytes = readFileSync(join(evidenceRoot, "runtime-bundles.bytes"));
  const bootRecordsBytes = readFileSync(join(evidenceRoot, "boot-records.tsv"));
  const expectedManifest = buildAllEdgeRuntimeArtifactManifest({
    candidateSha,
    inputManifest,
    inputManifestSha256: sha256(inputManifestBytes),
    checksumsSha256: sha256(checksumsBytes),
    sizesSha256: sha256(sizesBytes),
    bootRecordsSha256: sha256(bootRecordsBytes),
    bundles: manifest?.bundles,
    buildAttestation: parseExactAttestation(
      readFileSync(join(evidenceRoot, "build-attestation.env"), "utf8"),
    ),
    bootAttestation: parseExactAttestation(readFileSync(join(evidenceRoot, "boot-attestation.env"), "utf8")),
    fileIndexSha256: sha256(indexBytes),
    fileCount: records.length,
  });
  if (JSON.stringify(manifest) !== JSON.stringify(expectedManifest)) refuse("CONSUMER_MANIFEST_CONTRACT");

  const functions = [];
  for (const bundle of expectedManifest.bundles) {
    const rawPath = join(artifactRoot, ...bundle.raw.path.split("/"));
    const deployablePath = join(artifactRoot, ...bundle.deployable.path.split("/"));
    requireFile(rawPath, `CONSUMER_RAW:${bundle.slug}`);
    requireFile(deployablePath, `CONSUMER_DEPLOYABLE:${bundle.slug}`);
    const raw = readFileSync(rawPath);
    const deployable = readFileSync(deployablePath);
    if (
      raw.byteLength !== bundle.raw.bytes ||
      sha256(raw) !== bundle.raw.sha256 ||
      deployable.byteLength !== bundle.deployable.bytes ||
      sha256(deployable) !== bundle.deployable.sha256
    )
      refuse(`CONSUMER_BUNDLE:${bundle.slug}`);
    const reconciled = reconcileDownloadedBundleBody(deployable, bundle.deployable.sha256);
    if (!reconciled.rawEszip.equals(raw)) refuse(`CONSUMER_EZBR:${bundle.slug}`);
    functions.push({
      ...bundle,
      rawPath,
      deployablePath,
    });
  }
  return {
    root: artifactRoot,
    manifest,
    manifestSha256,
    sourceRoot: join(artifactRoot, "source"),
    functions,
  };
}
