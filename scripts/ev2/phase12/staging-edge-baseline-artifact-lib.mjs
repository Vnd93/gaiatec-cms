import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { ALL_EDGE_RUNTIME_SMOKE } from "./all-edge-runtime-smoke-lib.mjs";
import { PRODUCTION_FUNCTIONS, PUBLIC_FUNCTIONS } from "./production-backend-lib.mjs";
import {
  functionInventorySnapshot,
  normalizeFunctionTuple,
  reconcileDownloadedBundleBody,
  sameFunctionTuple,
} from "./staging-cms-public-hotfix-lib.mjs";

const FULL_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/;
const FUNCTION_TUPLE_KEYS = Object.freeze([
  "id",
  "name",
  "slug",
  "status",
  "verifyJwt",
  "version",
  "bundleSha256",
  "createdAt",
  "updatedAt",
  "entrypointPath",
  "importMap",
  "importMapPath",
]);

export const STAGING_EDGE_BASELINE_ARTIFACT = Object.freeze({
  schemaVersion: 1,
  event: "g12.staging.edge_baseline.captured",
  projectRef: "glcqsosxwgmlhzgcsnzv",
  directory: "edge-baseline",
  manifestFile: "manifest.json",
  artifactManifestPath: "edge-baseline/manifest.json",
  bundlesDirectory: "bundles",
  maximumBodyBytes: ALL_EDGE_RUNTIME_SMOKE.maximumEszipBytes,
  maximumAggregateBytes: ALL_EDGE_RUNTIME_SMOKE.maximumAggregateEszipBytes,
});

function refuse(label) {
  throw new Error(`G12_STAGING_EDGE_BASELINE_ARTIFACT_${label}_REFUSED`);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}

function canonicalBytes(value) {
  return Buffer.from(JSON.stringify(canonical(value)), "utf8");
}

function exactKeys(value, expected) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort())
  );
}

function canonicalInstant(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

function expectedNames() {
  return [...PRODUCTION_FUNCTIONS].sort((left, right) => left.localeCompare(right));
}

function bodyFor(bodies, slug) {
  const value = bodies instanceof Map ? bodies.get(slug) : bodies?.[slug];
  if (!value) refuse(`BODY_MISSING:${slug}`);
  return Buffer.from(value);
}

function requireStableInventory(beforePayload, afterPayload) {
  const options = { expectedNames: PRODUCTION_FUNCTIONS, publicFunctions: PUBLIC_FUNCTIONS };
  const before = functionInventorySnapshot(beforePayload, options);
  const after = functionInventorySnapshot(afterPayload, options);
  if (!before.valid) refuse(`INVENTORY_BEFORE:${before.violations.join(",")}`);
  if (!after.valid) refuse(`INVENTORY_AFTER:${after.violations.join(",")}`);
  if (before.inventorySha256 !== after.inventorySha256) refuse("INVENTORY_DRIFT");
  const afterByName = new Map(after.records.map((record) => [record.name, record]));
  for (const record of before.records)
    if (!sameFunctionTuple(record, afterByName.get(record.name))) refuse(`TUPLE_DRIFT:${record.name}`);
  return after;
}

function validateContext({ workflow, candidateSha, projectRef, capturedAt }) {
  if (
    !exactKeys(workflow, ["runId", "runAttempt", "controlSha"]) ||
    !POSITIVE_INTEGER.test(String(workflow.runId ?? "")) ||
    !Number.isSafeInteger(Number(workflow.runAttempt)) ||
    Number(workflow.runAttempt) < 1 ||
    !FULL_SHA.test(String(workflow.controlSha ?? "")) ||
    !FULL_SHA.test(String(candidateSha ?? "")) ||
    projectRef !== STAGING_EDGE_BASELINE_ARTIFACT.projectRef ||
    !canonicalInstant(capturedAt)
  )
    refuse("CONTEXT");
}

export function buildStagingEdgeBaselineManifest({
  workflow,
  candidateSha,
  projectRef,
  capturedAt,
  beforePayload,
  afterPayload,
  bodies,
}) {
  validateContext({ workflow, candidateSha, projectRef, capturedAt });
  const snapshot = requireStableInventory(beforePayload, afterPayload);
  const functions = [];
  let aggregateBytes = 0;
  for (const tuple of snapshot.records) {
    const reconciled = reconcileDownloadedBundleBody(bodyFor(bodies, tuple.name), tuple.bundleSha256);
    const deploymentBody = reconciled.deploymentBody;
    if (
      deploymentBody.byteLength < 1 ||
      deploymentBody.byteLength > STAGING_EDGE_BASELINE_ARTIFACT.maximumBodyBytes
    )
      refuse(`BODY_SIZE:${tuple.name}`);
    aggregateBytes += deploymentBody.byteLength;
    functions.push({
      slug: tuple.name,
      tuple: normalizeFunctionTuple(tuple),
      body: {
        path: `${STAGING_EDGE_BASELINE_ARTIFACT.bundlesDirectory}/${tuple.name}.ezbr`,
        sha256: sha256(deploymentBody),
        bytes: deploymentBody.byteLength,
        rawEszipSha256: sha256(reconciled.rawEszip),
        rawEszipBytes: reconciled.rawEszip.byteLength,
      },
    });
  }
  functions.sort((left, right) => left.slug.localeCompare(right.slug));
  if (aggregateBytes < 1 || aggregateBytes > STAGING_EDGE_BASELINE_ARTIFACT.maximumAggregateBytes)
    refuse("AGGREGATE_SIZE");
  const bundleIndex = functions.map(({ slug, body }) => ({ slug, ...body }));
  return {
    schemaVersion: STAGING_EDGE_BASELINE_ARTIFACT.schemaVersion,
    event: STAGING_EDGE_BASELINE_ARTIFACT.event,
    capturedAt,
    workflow: {
      runId: String(workflow.runId),
      runAttempt: Number(workflow.runAttempt),
      controlSha: workflow.controlSha,
    },
    candidateSha,
    projectRef,
    functionCount: functions.length,
    inventorySha256: snapshot.inventorySha256,
    bundleIndexSha256: sha256(canonicalBytes(bundleIndex)),
    aggregateBytes,
    functions,
  };
}

function validateManifest(manifest, expected = {}) {
  const violations = [];
  if (
    !exactKeys(manifest, [
      "schemaVersion",
      "event",
      "capturedAt",
      "workflow",
      "candidateSha",
      "projectRef",
      "functionCount",
      "inventorySha256",
      "bundleIndexSha256",
      "aggregateBytes",
      "functions",
    ])
  )
    violations.push("manifest_keys_invalid");
  try {
    validateContext(manifest ?? {});
  } catch {
    violations.push("manifest_context_invalid");
  }
  if (manifest?.schemaVersion !== STAGING_EDGE_BASELINE_ARTIFACT.schemaVersion)
    violations.push("manifest_schema_invalid");
  if (manifest?.event !== STAGING_EDGE_BASELINE_ARTIFACT.event) violations.push("manifest_event_invalid");
  for (const [label, actual, wanted] of [
    ["project", manifest?.projectRef, expected.projectRef],
    ["candidate", manifest?.candidateSha, expected.candidateSha],
    ["control", manifest?.workflow?.controlSha, expected.controlSha],
    ["run_id", manifest?.workflow?.runId, expected.runId && String(expected.runId)],
    ["run_attempt", manifest?.workflow?.runAttempt, expected.runAttempt && Number(expected.runAttempt)],
  ])
    if (wanted !== undefined && wanted !== "" && actual !== wanted) violations.push(`${label}_mismatch`);
  if (!Array.isArray(manifest?.functions)) {
    violations.push("functions_invalid");
    return [...new Set(violations)];
  }
  const names = manifest.functions.map((record) => record?.slug);
  if (JSON.stringify(names) !== JSON.stringify(expectedNames())) violations.push("function_names_invalid");
  if (
    manifest.functionCount !== PRODUCTION_FUNCTIONS.length ||
    manifest.functions.length !== manifest.functionCount
  )
    violations.push("function_count_invalid");
  if (!SHA256.test(String(manifest.inventorySha256 ?? ""))) violations.push("inventory_digest_invalid");
  if (!SHA256.test(String(manifest.bundleIndexSha256 ?? ""))) violations.push("bundle_index_invalid");
  if (
    !Number.isSafeInteger(manifest.aggregateBytes) ||
    manifest.aggregateBytes < 1 ||
    manifest.aggregateBytes > STAGING_EDGE_BASELINE_ARTIFACT.maximumAggregateBytes
  )
    violations.push("aggregate_bytes_invalid");
  return [...new Set(violations)];
}

export function writeStagingEdgeBaselineArtifact(options) {
  const root = resolve(options.outputDirectory);
  const parent = dirname(root);
  const parentMetadata = lstatSync(parent, { throwIfNoEntry: false });
  if (!parentMetadata?.isDirectory() || parentMetadata.isSymbolicLink()) refuse("OUTPUT_PARENT");
  if (lstatSync(root, { throwIfNoEntry: false })) refuse("OUTPUT_EXISTS");
  const manifest = buildStagingEdgeBaselineManifest(options);
  mkdirSync(join(root, STAGING_EDGE_BASELINE_ARTIFACT.bundlesDirectory), {
    recursive: true,
    mode: 0o700,
  });
  for (const record of manifest.functions) {
    const reconciled = reconcileDownloadedBundleBody(
      bodyFor(options.bodies, record.slug),
      record.tuple.bundleSha256,
    );
    writeFileSync(join(root, ...record.body.path.split("/")), reconciled.deploymentBody, {
      mode: 0o400,
      flag: "wx",
    });
  }
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  writeFileSync(join(root, STAGING_EDGE_BASELINE_ARTIFACT.manifestFile), manifestBytes, {
    mode: 0o400,
    flag: "wx",
  });
  return { manifest, manifestSha256: sha256(manifestBytes), root };
}

export function loadAndVerifyStagingEdgeBaselineArtifact({ root, expectedManifestSha256, expected = {} }) {
  const artifactRoot = resolve(root);
  const rootMetadata = lstatSync(artifactRoot, { throwIfNoEntry: false });
  if (!rootMetadata?.isDirectory() || rootMetadata.isSymbolicLink()) refuse("ROOT");
  const expectedRootEntries = [
    STAGING_EDGE_BASELINE_ARTIFACT.bundlesDirectory,
    STAGING_EDGE_BASELINE_ARTIFACT.manifestFile,
  ];
  const rootEntries = readdirSync(artifactRoot, { withFileTypes: true });
  if (
    JSON.stringify(rootEntries.map((entry) => entry.name).sort()) !==
      JSON.stringify(expectedRootEntries.sort()) ||
    rootEntries.some((entry) => entry.isSymbolicLink())
  )
    refuse("LAYOUT");
  const manifestPath = join(artifactRoot, STAGING_EDGE_BASELINE_ARTIFACT.manifestFile);
  const manifestMetadata = lstatSync(manifestPath, { throwIfNoEntry: false });
  if (!manifestMetadata?.isFile() || manifestMetadata.isSymbolicLink()) refuse("MANIFEST_TYPE");
  const manifestBytes = readFileSync(manifestPath);
  const manifestSha256 = sha256(manifestBytes);
  if (expectedManifestSha256 && manifestSha256 !== expectedManifestSha256) refuse("MANIFEST_DIGEST");
  let manifest;
  try {
    manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes));
  } catch {
    refuse("MANIFEST_JSON");
  }
  const violations = validateManifest(manifest, expected);
  if (violations.length > 0) refuse(violations.join(","));
  const bundlesRoot = join(artifactRoot, STAGING_EDGE_BASELINE_ARTIFACT.bundlesDirectory);
  const bundlesMetadata = lstatSync(bundlesRoot, { throwIfNoEntry: false });
  if (!bundlesMetadata?.isDirectory() || bundlesMetadata.isSymbolicLink()) refuse("BUNDLES_TYPE");
  const bundleEntries = readdirSync(bundlesRoot, { withFileTypes: true });
  if (
    JSON.stringify(bundleEntries.map((entry) => entry.name).sort()) !==
      JSON.stringify(
        expectedNames()
          .map((name) => `${name}.ezbr`)
          .sort(),
      ) ||
    bundleEntries.some((entry) => !entry.isFile() || entry.isSymbolicLink())
  )
    violations.push("bundle_layout_invalid");
  for (const record of manifest.functions) {
    if (!exactKeys(record, ["slug", "tuple", "body"])) {
      violations.push(`${record?.slug ?? "unknown"}:record_keys_invalid`);
      continue;
    }
    if (!exactKeys(record.tuple, FUNCTION_TUPLE_KEYS)) {
      violations.push(`${record.slug}:tuple_keys_invalid`);
      continue;
    }
    if (
      !exactKeys(record.body, ["path", "sha256", "bytes", "rawEszipSha256", "rawEszipBytes"]) ||
      record.body.path !== `${STAGING_EDGE_BASELINE_ARTIFACT.bundlesDirectory}/${record.slug}.ezbr` ||
      !SHA256.test(String(record.body.sha256 ?? "")) ||
      !SHA256.test(String(record.body.rawEszipSha256 ?? "")) ||
      !Number.isSafeInteger(record.body.bytes) ||
      record.body.bytes < 1 ||
      record.body.bytes > STAGING_EDGE_BASELINE_ARTIFACT.maximumBodyBytes ||
      !Number.isSafeInteger(record.body.rawEszipBytes) ||
      record.body.rawEszipBytes < 1 ||
      record.body.rawEszipBytes > STAGING_EDGE_BASELINE_ARTIFACT.maximumBodyBytes
    )
      violations.push(`${record.slug}:body_contract_invalid`);
  }
  if (violations.length > 0) refuse(violations.join(","));
  const functions = [];
  let aggregateBytes = 0;
  for (const record of manifest?.functions ?? []) {
    const bodyPath = join(artifactRoot, ...record.body.path.split("/"));
    const bodyMetadata = lstatSync(bodyPath, { throwIfNoEntry: false });
    if (!bodyMetadata?.isFile() || bodyMetadata.isSymbolicLink()) {
      violations.push(`${record.slug}:body_type_invalid`);
      continue;
    }
    const body = readFileSync(bodyPath);
    aggregateBytes += body.byteLength;
    if (
      body.byteLength !== record.body.bytes ||
      sha256(body) !== record.body.sha256 ||
      record.body.sha256 !== record.tuple?.bundleSha256
    )
      violations.push(`${record.slug}:body_identity_invalid`);
    try {
      const reconciled = reconcileDownloadedBundleBody(body, record.tuple?.bundleSha256);
      if (
        reconciled.rawEszip.byteLength !== record.body.rawEszipBytes ||
        sha256(reconciled.rawEszip) !== record.body.rawEszipSha256
      )
        violations.push(`${record.slug}:raw_eszip_identity_invalid`);
    } catch {
      violations.push(`${record.slug}:body_format_invalid`);
    }
    functions.push({ ...record, bodyPath });
  }
  const snapshot = functionInventorySnapshot(
    functions.map((record) => record.tuple),
    { expectedNames: PRODUCTION_FUNCTIONS, publicFunctions: PUBLIC_FUNCTIONS },
  );
  if (!snapshot.valid) violations.push(...snapshot.violations.map((item) => `inventory:${item}`));
  if (snapshot.inventorySha256 !== manifest?.inventorySha256) violations.push("inventory_digest_mismatch");
  const bundleIndex = functions.map(({ slug, body }) => ({ slug, ...body }));
  if (sha256(canonicalBytes(bundleIndex)) !== manifest?.bundleIndexSha256)
    violations.push("bundle_index_mismatch");
  if (aggregateBytes !== manifest?.aggregateBytes) violations.push("aggregate_bytes_mismatch");
  if (violations.length > 0) refuse(violations.join(","));
  return { root: artifactRoot, manifest, manifestSha256, functions };
}
