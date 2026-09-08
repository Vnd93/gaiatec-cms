import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

function failureLabel(value) {
  return String(value instanceof Error ? value.message : value)
    .replace(/[^A-Za-z0-9_.:-]/g, "_")
    .slice(0, 160);
}

export function evaluateKnownFunctionInventory(payload, managedFunctions, publicFunctions) {
  const records = (Array.isArray(payload) ? payload : (payload?.functions ?? [])).map(
    normalizeDeploymentRecord,
  );
  const violations = [];
  if (records.length === 0) violations.push("inventory_empty");
  const counts = new Map();
  for (const record of records) {
    counts.set(record.name, (counts.get(record.name) ?? 0) + 1);
    if (!managedFunctions.includes(record.name)) violations.push(`${record.name}:unmanaged`);
    if (record.status !== "ACTIVE") violations.push(`${record.name}:inactive`);
    if (record.version < 1) violations.push(`${record.name}:version_invalid`);
    if (record.verifyJwt === publicFunctions.has(record.name))
      violations.push(`${record.name}:verify_jwt_invalid`);
  }
  for (const [name, count] of counts) if (count !== 1) violations.push(`${name}:duplicate`);
  return { valid: violations.length === 0, violations, records };
}

function normalizeDeploymentRecord(record) {
  return {
    name: String(record?.name ?? record?.slug ?? ""),
    status: String(record?.status ?? "").toUpperCase(),
    verifyJwt: Boolean(record?.verify_jwt ?? record?.verifyJwt),
    version: Number(record?.version ?? 0),
    bundleSha256: String(record?.ezbr_sha256 ?? record?.sha256 ?? record?.bundleSha256 ?? "").toLowerCase(),
    updatedAt: String(record?.updated_at ?? record?.updatedAt ?? ""),
  };
}

function collectSourceFiles(root, current, files) {
  for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const path = join(current, entry.name);
    const metadata = lstatSync(path);
    if (metadata.isSymbolicLink())
      throw new Error(`G12_PRODUCTION_FUNCTION_SOURCE_REFUSED:symlink:${relative(root, path)}`);
    if (metadata.isDirectory()) collectSourceFiles(root, path, files);
    else if (metadata.isFile()) files.push(path);
    else throw new Error(`G12_PRODUCTION_FUNCTION_SOURCE_REFUSED:unsupported:${relative(root, path)}`);
  }
}

export function productionFunctionSourceDigest(sourceRoot, name) {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error("G12_PRODUCTION_FUNCTION_SOURCE_REFUSED:name_invalid");
  const functionsRoot = resolve(sourceRoot, "supabase", "functions");
  const paths = [];
  collectSourceFiles(functionsRoot, join(functionsRoot, "_shared"), paths);
  collectSourceFiles(functionsRoot, join(functionsRoot, name), paths);
  const importMapPath = join(functionsRoot, "import_map.json");
  if (existsSync(importMapPath)) paths.push(importMapPath);
  paths.push(resolve(sourceRoot, "src", "shared", "contracts", "cms-content.ts"));
  const digest = createHash("sha256");
  for (const path of paths.sort()) {
    const metadata = lstatSync(path);
    if (metadata.isSymbolicLink() || !metadata.isFile())
      throw new Error(`G12_PRODUCTION_FUNCTION_SOURCE_REFUSED:unsupported:${relative(sourceRoot, path)}`);
    digest.update(relative(sourceRoot, path).replaceAll("\\", "/"));
    digest.update("\0");
    digest.update(readFileSync(path));
    digest.update("\0");
  }
  return digest.digest("hex");
}

export function sourceDigestInventory(sourceRoot, names) {
  return Object.fromEntries(names.map((name) => [name, productionFunctionSourceDigest(sourceRoot, name)]));
}

export function evaluateCandidateFunctionDeployment({
  beforePayload,
  afterPayload,
  managedFunctions,
  publicFunctions,
  candidateSourceDigests,
  baselineSourceDigests,
}) {
  const before = evaluateKnownFunctionInventory(beforePayload, managedFunctions, publicFunctions);
  const after = evaluateKnownFunctionInventory(afterPayload, managedFunctions, publicFunctions);
  const violations = [...before.violations.map((item) => `before:${item}`), ...after.violations];
  const beforeByName = new Map(before.records.map((record) => [record.name, record]));
  const afterByName = new Map(after.records.map((record) => [record.name, record]));
  const deployments = [];

  for (const name of managedFunctions) {
    const previous = beforeByName.get(name);
    const current = afterByName.get(name);
    const sourceSha256 = candidateSourceDigests?.[name];
    const baselineSourceSha256 = baselineSourceDigests?.[name];
    if (!/^[a-f0-9]{64}$/.test(sourceSha256 ?? "")) violations.push(`${name}:source_digest_invalid`);
    if (baselineSourceSha256 !== undefined && !/^[a-f0-9]{64}$/.test(baselineSourceSha256))
      violations.push(`${name}:baseline_source_digest_invalid`);
    if (!current) {
      violations.push(`${name}:missing`);
      continue;
    }
    if (!previous) {
      if (!/^[a-f0-9]{64}$/.test(current.bundleSha256)) violations.push(`${name}:remote_digest_missing`);
      if (current.version < 1) violations.push(`${name}:version_invalid`);
      if (!Number.isFinite(Date.parse(current.updatedAt))) violations.push(`${name}:updated_at_invalid`);
      deployments.push({
        name,
        sourceSha256,
        baselineSourceSha256: baselineSourceSha256 ?? null,
        sourceChangedFromBaseline: sourceSha256 !== baselineSourceSha256,
        bundleSha256: current.bundleSha256,
        previousVersion: 0,
        version: current.version,
        updatedAt: current.updatedAt,
        verifyJwt: current.verifyJwt,
      });
      continue;
    }
    if (!/^[a-f0-9]{64}$/.test(current.bundleSha256)) violations.push(`${name}:remote_digest_missing`);
    if (current.version <= previous.version) violations.push(`${name}:version_not_advanced`);
    // A partially completed run can already have this exact candidate live. Its
    // deterministic redeploy must remain idempotent: the remote version still has
    // to advance, while the bundle digest may correctly remain unchanged. The
    // deployment receipt below binds that post-deploy digest to this candidate's
    // exact source inventory.
    if (!Number.isFinite(Date.parse(current.updatedAt))) violations.push(`${name}:updated_at_invalid`);
    deployments.push({
      name,
      sourceSha256,
      baselineSourceSha256: baselineSourceSha256 ?? null,
      sourceChangedFromBaseline: sourceSha256 !== baselineSourceSha256,
      bundleSha256: current.bundleSha256,
      previousVersion: previous.version,
      version: current.version,
      updatedAt: current.updatedAt,
      verifyJwt: current.verifyJwt,
    });
  }

  return { valid: violations.length === 0, violations, deployments };
}

export function evaluateFunctionDeploymentReceipt({
  receipt,
  livePayload,
  sourceDigests,
  release,
  environment = "production",
  projectRef,
}) {
  const violations = [];
  if (receipt?.schemaVersion !== 1) violations.push("receipt_schema_invalid");
  if (!["production", "staging"].includes(environment)) violations.push("receipt_environment_invalid");
  if (receipt?.event !== `g12.${environment}.functions.deployment_verified`)
    violations.push("receipt_event_invalid");
  if (receipt?.candidateSha !== release) violations.push("receipt_candidate_mismatch");
  if (projectRef !== undefined && receipt?.projectRef !== projectRef)
    violations.push("receipt_project_mismatch");
  const live = (Array.isArray(livePayload) ? livePayload : (livePayload?.functions ?? [])).map(
    normalizeDeploymentRecord,
  );
  const liveByName = new Map(live.map((record) => [record.name, record]));
  const receiptRows = Array.isArray(receipt?.deployments) ? receipt.deployments : [];
  const expectedNames = Object.keys(sourceDigests ?? {}).sort();
  if (receiptRows.length !== expectedNames.length) violations.push("receipt_cardinality_invalid");
  const receiptCounts = new Map();
  for (const row of receiptRows) {
    const name = String(row?.name ?? "");
    receiptCounts.set(name, (receiptCounts.get(name) ?? 0) + 1);
    if (!Object.hasOwn(sourceDigests ?? {}, name)) violations.push(`${name || "unknown"}:receipt_unmanaged`);
    const current = liveByName.get(name);
    if (row?.sourceSha256 !== sourceDigests?.[name])
      violations.push(`${name}:receipt_source_digest_mismatch`);
    if (!current || current.bundleSha256 !== row?.bundleSha256)
      violations.push(`${name}:live_bundle_digest_mismatch`);
    if (!current || current.version !== row?.version) violations.push(`${name}:live_version_mismatch`);
  }
  for (const name of expectedNames) {
    const count = receiptCounts.get(name) ?? 0;
    if (count === 0) violations.push(`${name}:receipt_missing`);
    if (count > 1) violations.push(`${name}:receipt_duplicate`);
  }
  return { valid: violations.length === 0, violations };
}

export function deployWithVerifiedCompensation({
  names,
  deployOne,
  verifyCandidate,
  restoreBaseline,
  errorPrefix = "G12_PRODUCTION_FUNCTION",
}) {
  let stage = "preflight";
  try {
    for (const name of names) {
      stage = name;
      deployOne(name);
    }
    stage = "verification";
    verifyCandidate();
  } catch (deploymentError) {
    try {
      restoreBaseline();
    } catch (compensationError) {
      throw new Error(`${errorPrefix}_COMPENSATION_FAILED:${stage}:${failureLabel(compensationError)}`, {
        cause: compensationError,
      });
    }
    throw new Error(`${errorPrefix}_DEPLOY_FAILED_COMPENSATED:${stage}`, {
      cause: deploymentError,
    });
  }
}
