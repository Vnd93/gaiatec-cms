import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { classifySupabaseServiceKey, supabaseServiceKeyHeaders } from "./readiness-lib.mjs";

function required(value, code) {
  const clean = String(value ?? "").trim();
  if (!clean) throw new Error(code);
  return clean;
}

function validateSourceUrl(value) {
  const url = new URL(required(value, "STORAGE_SOURCE_URL_REQUIRED"));
  if (url.protocol !== "https:" || !/^[a-z0-9]{20}\.supabase\.co$/i.test(url.hostname))
    throw new Error("STORAGE_SOURCE_URL_INVALID");
  return url.origin;
}

function validateLocalTargetUrl(value) {
  const url = new URL(required(value, "STORAGE_TARGET_URL_REQUIRED"));
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname))
    throw new Error("STORAGE_TARGET_MUST_BE_LOCAL");
  return url.origin;
}

function validateServiceKey(value, code) {
  const key = required(value, code);
  if (!classifySupabaseServiceKey(key)) throw new Error(code);
  return key;
}

function storagePath(origin, action, bucketId, objectName) {
  const bucket = encodeURIComponent(bucketId);
  const object = objectName.split("/").map(encodeURIComponent).join("/");
  return `${origin}/storage/v1/object/${action ? `${action}/` : ""}${bucket}/${object}`;
}

function safeContentType(value) {
  const type = String(value ?? "").trim();
  return /^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+(?:;[\w !#$%&'*+.^_`|~-]+=[\w !#$%&'*+.^_`|~-]+)*$/.test(type) &&
    type.length <= 200
    ? type
    : "application/octet-stream";
}

function safeCacheControl(value) {
  const cacheControl = String(value ?? "").trim();
  return /^\d{1,10}$/.test(cacheControl) ? cacheControl : "3600";
}

function validateConcurrency(value) {
  if (!Number.isInteger(value) || value < 1 || value > 16) throw new Error("STORAGE_CONCURRENCY_INVALID");
  return value;
}

function validStorageIdentity(entry) {
  return (
    entry &&
    typeof entry.bucketId === "string" &&
    entry.bucketId.length > 0 &&
    entry.bucketId.length <= 100 &&
    !entry.bucketId.includes("\0") &&
    typeof entry.name === "string" &&
    entry.name.length > 0 &&
    entry.name.length <= 1_024 &&
    !entry.name.includes("\0")
  );
}

function validOptionalToken(value, maximum = 512) {
  return value === null || (typeof value === "string" && value.length > 0 && value.length <= maximum);
}

function normalizedEtag(value) {
  return String(value ?? "")
    .trim()
    .replace(/^W\//i, "")
    .replace(/^"|"$/g, "")
    .toLowerCase();
}

function normalizedChecksum(value) {
  return String(value ?? "")
    .trim()
    .replace(/^(?:sha256|sha-256|md5)[:=]/i, "")
    .replace(/^"|"$/g, "")
    .toLowerCase();
}

function supportedChecksum(value) {
  const checksum = normalizedChecksum(value);
  return /^[a-f0-9]{32}$|^[a-f0-9]{64}$/.test(checksum);
}

function validSnapshotMetadata(entry) {
  return (
    validOptionalToken(entry.version) &&
    typeof entry.updatedAt === "string" &&
    Number.isFinite(Date.parse(entry.updatedAt)) &&
    validOptionalToken(entry.eTag) &&
    validOptionalToken(entry.checksum) &&
    (entry.checksum === null || supportedChecksum(entry.checksum)) &&
    [entry.version, entry.eTag, entry.checksum].some((value) => value !== null)
  );
}

export function parseStorageInventory(source) {
  const entries = String(source)
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const identities = new Set();
  for (const entry of entries) {
    if (
      !validStorageIdentity(entry) ||
      !validSnapshotMetadata(entry) ||
      (entry.size !== null && (!Number.isSafeInteger(entry.size) || entry.size < 0))
    )
      throw new Error("STORAGE_INVENTORY_INVALID");
    const identity = `${entry.bucketId}\0${entry.name}`;
    if (identities.has(identity)) throw new Error("STORAGE_INVENTORY_DUPLICATED");
    identities.add(identity);
  }
  return entries;
}

async function hashResponseToFile(response, outputPath) {
  if (!response.body) throw new Error("STORAGE_OBJECT_BODY_MISSING");
  const digest = createHash("sha256");
  const md5 = createHash("md5");
  let bytes = 0;
  const handle = await open(outputPath, "wx", 0o600);
  try {
    for await (const chunk of response.body) {
      const buffer = Buffer.from(chunk);
      digest.update(buffer);
      md5.update(buffer);
      bytes += buffer.byteLength;
      await handle.write(buffer);
    }
  } catch (error) {
    await handle.close();
    await rm(outputPath, { force: true });
    throw error;
  }
  await handle.close();
  return { bytes, sha256: digest.digest("hex"), md5: md5.digest("hex") };
}

async function hashResponse(response) {
  if (!response.body) throw new Error("STORAGE_OBJECT_BODY_MISSING");
  const digest = createHash("sha256");
  const md5 = createHash("md5");
  let bytes = 0;
  for await (const chunk of response.body) {
    const buffer = Buffer.from(chunk);
    digest.update(buffer);
    md5.update(buffer);
    bytes += buffer.byteLength;
  }
  return { bytes, sha256: digest.digest("hex"), md5: md5.digest("hex") };
}

async function hashFile(path) {
  const digest = createHash("sha256");
  const md5 = createHash("md5");
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    digest.update(chunk);
    md5.update(chunk);
    bytes += chunk.byteLength;
  }
  return { bytes, sha256: digest.digest("hex"), md5: md5.digest("hex") };
}

async function concurrentMap(entries, concurrency, task) {
  const results = new Array(entries.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(entries.length, 1)) }, async () => {
      while (next < entries.length) {
        const index = next++;
        results[index] = await task(entries[index], index);
      }
    }),
  );
  return results;
}

function metadataSignalCounts(entries) {
  return {
    version: entries.filter((entry) => entry.sourceVersion !== null).length,
    etag: entries.filter((entry) => entry.sourceEtag !== null).length,
    checksum: entries.filter((entry) => entry.sourceChecksum !== null).length,
    updatedAt: entries.filter((entry) => typeof entry.sourceUpdatedAt === "string").length,
    strongFingerprint: entries.filter((entry) =>
      [entry.sourceVersion, entry.sourceEtag, entry.sourceChecksum].some((value) => value !== null),
    ).length,
    contentFingerprint: entries.filter(
      (entry) =>
        entry.sourceEtag !== null ||
        supportedChecksum(entry.sourceChecksum) ||
        (entry.sourceVersion !== null && entry.responseEtag !== null),
    ).length,
  };
}

function aggregateReport(
  entries,
  { phase = "source", sourceSnapshot = null, metadataRestoreReport = null } = {},
) {
  const payload = entries.map((entry) => ({ bytes: entry.bytes, sha256: entry.sha256 }));
  const uploaded = phase === "upload" || phase === "restored";
  const restored = phase === "restored";
  return {
    schemaVersion: 1,
    event: `supabase.storage.payloads.${phase}-verified`,
    phase,
    objects: entries.length,
    bytes: entries.reduce((total, entry) => total + entry.bytes, 0),
    aggregateSha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
    exportVerified: true,
    payloadUploadVerified: uploaded,
    restoreVerified: restored,
    metadataReappliedAfterUpload: restored,
    metadataAggregateSha256: restored ? metadataRestoreReport?.storage?.aggregateSha256 : null,
    snapshotStabilityVerified: sourceSnapshot?.stabilityVerified === true,
    snapshotAt: sourceSnapshot?.snapshotAt ?? null,
    snapshotWalLsn: sourceSnapshot?.walLsn ?? null,
    snapshotVerifiedAt: sourceSnapshot?.verifiedAt ?? null,
    snapshotMetadataAggregateSha256: sourceSnapshot?.metadataAggregateSha256 ?? null,
    metadataSignals: metadataSignalCounts(entries),
    restoreTarget: uploaded ? "ephemeral-local-supabase" : null,
    containsObjectNames: false,
    containsBucketIdentifiers: false,
  };
}

function authorizationHeaders(serviceKey) {
  return supabaseServiceKeyHeaders(serviceKey);
}

export async function exportStorageObjects({
  inventorySource,
  outputDirectory,
  indexPath,
  reportPath,
  sourceUrl,
  serviceKey,
  fetchImpl = fetch,
  concurrency = 4,
}) {
  const origin = validateSourceUrl(sourceUrl);
  const credential = validateServiceKey(serviceKey, "STORAGE_SOURCE_SERVICE_KEY_REQUIRED");
  const inventory = parseStorageInventory(inventorySource);
  validateConcurrency(concurrency);
  await mkdir(outputDirectory, { recursive: true, mode: 0o700 });

  const entries = await concurrentMap(inventory, concurrency, async (entry, ordinal) => {
    const opaqueName = `${String(ordinal).padStart(8, "0")}-${createHash("sha256")
      .update(`${entry.bucketId}\0${entry.name}`)
      .digest("hex")}.blob`;
    const response = await fetchImpl(storagePath(origin, "authenticated", entry.bucketId, entry.name), {
      headers: { ...authorizationHeaders(credential), "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(60_000),
    }).catch(() => null);
    if (!response?.ok) throw new Error(`STORAGE_OBJECT_DOWNLOAD_FAILED:${response?.status ?? 0}:${ordinal}`);
    const verified = await hashResponseToFile(response, `${outputDirectory}/${opaqueName}`);
    if (entry.size !== null && verified.bytes !== entry.size)
      throw new Error(`STORAGE_OBJECT_SIZE_MISMATCH:${ordinal}`);
    const responseEtag = normalizedEtag(response.headers.get("etag"));
    const sourceEtag = normalizedEtag(entry.eTag);
    if (sourceEtag && (!responseEtag || responseEtag !== sourceEtag))
      throw new Error(`STORAGE_OBJECT_ETAG_MISMATCH:${ordinal}`);
    if (/^[a-f0-9]{32}$/.test(responseEtag) && responseEtag !== verified.md5)
      throw new Error(`STORAGE_OBJECT_ETAG_CONTENT_MISMATCH:${ordinal}`);
    const sourceChecksum = normalizedChecksum(entry.checksum);
    if (
      (/^[a-f0-9]{64}$/.test(sourceChecksum) && sourceChecksum !== verified.sha256) ||
      (/^[a-f0-9]{32}$/.test(sourceChecksum) && sourceChecksum !== verified.md5)
    )
      throw new Error(`STORAGE_OBJECT_CHECKSUM_MISMATCH:${ordinal}`);
    if (!sourceEtag && !supportedChecksum(entry.checksum) && !(entry.version !== null && responseEtag))
      throw new Error(`STORAGE_OBJECT_FINGERPRINT_MISSING:${ordinal}`);
    return {
      bucketId: entry.bucketId,
      name: entry.name,
      contentType: safeContentType(entry.contentType),
      cacheControl: safeCacheControl(entry.cacheControl),
      backupFile: opaqueName,
      sourceVersion: entry.version,
      sourceUpdatedAt: entry.updatedAt,
      sourceEtag: entry.eTag,
      sourceChecksum: entry.checksum,
      responseEtag: responseEtag || null,
      ...verified,
    };
  });
  const index = { schemaVersion: 2, sourceSnapshot: null, entries };
  const report = aggregateReport(entries);
  await Promise.all([
    writeFile(indexPath, `${JSON.stringify(index)}\n`, { encoding: "utf8", mode: 0o600 }),
    writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 }),
  ]);
  return report;
}

function snapshotMetadata(entry) {
  return {
    size: entry.size,
    contentType: entry.contentType,
    cacheControl: entry.cacheControl,
    version: entry.version,
    updatedAt: entry.updatedAt,
    eTag: entry.eTag,
    checksum: entry.checksum,
  };
}

export function verifyStorageSnapshotStability({
  beforeInventorySource,
  afterInventorySource,
  indexSource,
  snapshotAt,
  snapshotLsn,
}) {
  const before = parseStorageInventory(beforeInventorySource);
  const after = parseStorageInventory(afterInventorySource);
  const index = JSON.parse(indexSource);
  if (index?.schemaVersion !== 2 || index?.sourceSnapshot !== null || !Array.isArray(index?.entries))
    throw new Error("STORAGE_SNAPSHOT_INDEX_INVALID");
  if (
    !Number.isFinite(Date.parse(snapshotAt ?? "")) ||
    !/^[0-9A-Fa-f]+\/[0-9A-Fa-f]+$/.test(snapshotLsn ?? "")
  )
    throw new Error("STORAGE_SNAPSHOT_IDENTITY_INVALID");
  if (before.length !== after.length || before.length !== index.entries.length)
    throw new Error("STORAGE_SNAPSHOT_CARDINALITY_CHANGED");
  const afterByIdentity = new Map(after.map((entry) => [`${entry.bucketId}\0${entry.name}`, entry]));
  const indexByIdentity = new Map(index.entries.map((entry) => [`${entry.bucketId}\0${entry.name}`, entry]));
  if (indexByIdentity.size !== index.entries.length)
    throw new Error("STORAGE_SNAPSHOT_INDEX_IDENTITY_DUPLICATED");
  for (const [ordinal, entry] of before.entries()) {
    const identity = `${entry.bucketId}\0${entry.name}`;
    const afterEntry = afterByIdentity.get(identity);
    const indexEntry = indexByIdentity.get(identity);
    if (!afterEntry || !indexEntry) throw new Error(`STORAGE_SNAPSHOT_IDENTITY_CHANGED:${ordinal}`);
    if (JSON.stringify(snapshotMetadata(entry)) !== JSON.stringify(snapshotMetadata(afterEntry)))
      throw new Error(`STORAGE_SNAPSHOT_METADATA_CHANGED:${ordinal}`);
    const sourceEtag = normalizedEtag(entry.eTag);
    const responseEtag = normalizedEtag(indexEntry.responseEtag);
    const sourceChecksum = normalizedChecksum(entry.checksum);
    if (
      !validStorageIdentity(indexEntry) ||
      !Number.isSafeInteger(indexEntry.bytes) ||
      indexEntry.bytes < 0 ||
      !/^[a-f0-9]{64}$/.test(indexEntry.sha256 ?? "") ||
      !/^[a-f0-9]{32}$/.test(indexEntry.md5 ?? "") ||
      !validOptionalToken(indexEntry.responseEtag) ||
      indexEntry.sourceVersion !== entry.version ||
      indexEntry.sourceUpdatedAt !== entry.updatedAt ||
      indexEntry.sourceEtag !== entry.eTag ||
      indexEntry.sourceChecksum !== entry.checksum ||
      indexEntry.contentType !== safeContentType(entry.contentType) ||
      indexEntry.cacheControl !== safeCacheControl(entry.cacheControl) ||
      (sourceEtag && responseEtag !== sourceEtag) ||
      (/^[a-f0-9]{32}$/.test(responseEtag) && responseEtag !== indexEntry.md5) ||
      (/^[a-f0-9]{64}$/.test(sourceChecksum) && sourceChecksum !== indexEntry.sha256) ||
      (/^[a-f0-9]{32}$/.test(sourceChecksum) && sourceChecksum !== indexEntry.md5) ||
      (!sourceEtag && !supportedChecksum(entry.checksum) && !(entry.version !== null && responseEtag)) ||
      (entry.size !== null && indexEntry.bytes !== entry.size)
    )
      throw new Error(`STORAGE_SNAPSHOT_DOWNLOAD_BINDING_INVALID:${ordinal}`);
  }
  const metadataAggregateSha256 = createHash("sha256")
    .update(JSON.stringify(before.map((entry) => snapshotMetadata(entry))))
    .digest("hex");
  const verifiedAt = new Date().toISOString();
  const signals = {
    version: before.filter((entry) => entry.version !== null).length,
    etag: before.filter((entry) => entry.eTag !== null).length,
    checksum: before.filter((entry) => entry.checksum !== null).length,
    updatedAt: before.length,
    strongFingerprint: before.filter((entry) =>
      [entry.version, entry.eTag, entry.checksum].some((value) => value !== null),
    ).length,
    contentFingerprint: metadataSignalCounts(index.entries).contentFingerprint,
  };
  index.sourceSnapshot = {
    snapshotAt,
    walLsn: snapshotLsn,
    verifiedAt,
    stabilityVerified: true,
    metadataAggregateSha256,
  };
  return {
    index,
    report: aggregateReport(index.entries, { sourceSnapshot: index.sourceSnapshot }),
    stabilityReport: {
      schemaVersion: 1,
      event: "supabase.storage.snapshot-stability.verified",
      snapshotAt,
      walLsn: snapshotLsn,
      verifiedAt,
      objects: before.length,
      metadataSignals: signals,
      metadataAggregateSha256,
      beforeAfterExact: true,
      downloadsBoundToSnapshot: true,
      containsObjectNames: false,
      containsBucketIdentifiers: false,
    },
  };
}

export async function restoreStorageObjects({
  indexSource,
  objectsDirectory,
  reportPath,
  targetUrl,
  serviceKey,
  fetchImpl = fetch,
  concurrency = 2,
}) {
  const origin = validateLocalTargetUrl(targetUrl);
  const credential = validateServiceKey(serviceKey, "STORAGE_TARGET_SERVICE_KEY_REQUIRED");
  const index = JSON.parse(indexSource);
  if (
    index?.schemaVersion !== 2 ||
    index?.sourceSnapshot?.stabilityVerified !== true ||
    !Number.isFinite(Date.parse(index?.sourceSnapshot?.snapshotAt ?? "")) ||
    !Number.isFinite(Date.parse(index?.sourceSnapshot?.verifiedAt ?? "")) ||
    Date.parse(index?.sourceSnapshot?.verifiedAt ?? "") <
      Date.parse(index?.sourceSnapshot?.snapshotAt ?? "") ||
    !/^[0-9A-Fa-f]+\/[0-9A-Fa-f]+$/.test(index?.sourceSnapshot?.walLsn ?? "") ||
    !/^[a-f0-9]{64}$/.test(index?.sourceSnapshot?.metadataAggregateSha256 ?? "") ||
    !Array.isArray(index.entries)
  )
    throw new Error("STORAGE_BACKUP_INDEX_INVALID");
  validateConcurrency(concurrency);

  const identities = new Set();
  const backupFiles = new Set();
  for (const [ordinal, entry] of index.entries.entries()) {
    if (
      !validStorageIdentity(entry) ||
      !/^\d{8}-[a-f0-9]{64}\.blob$/.test(entry.backupFile ?? "") ||
      !/^[a-f0-9]{64}$/.test(entry.sha256 ?? "") ||
      !/^[a-f0-9]{32}$/.test(entry.md5 ?? "") ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 0 ||
      !validOptionalToken(entry.sourceVersion) ||
      typeof entry.sourceUpdatedAt !== "string" ||
      !Number.isFinite(Date.parse(entry.sourceUpdatedAt)) ||
      !validOptionalToken(entry.sourceEtag) ||
      !validOptionalToken(entry.sourceChecksum) ||
      !validOptionalToken(entry.responseEtag)
    )
      throw new Error(`STORAGE_BACKUP_INDEX_ENTRY_INVALID:${ordinal}`);
    const identity = `${entry.bucketId}\0${entry.name}`;
    if (identities.has(identity) || backupFiles.has(entry.backupFile))
      throw new Error("STORAGE_BACKUP_INDEX_DUPLICATED");
    identities.add(identity);
    backupFiles.add(entry.backupFile);
  }

  await concurrentMap(index.entries, concurrency, async (entry, ordinal) => {
    const sourcePath = `${objectsDirectory}/${entry.backupFile}`;
    const local = await hashFile(sourcePath);
    if (local.bytes !== entry.bytes || local.sha256 !== entry.sha256 || local.md5 !== entry.md5)
      throw new Error(`STORAGE_BACKUP_BLOB_MISMATCH:${ordinal}`);

    const response = await fetchImpl(storagePath(origin, "", entry.bucketId, entry.name), {
      method: "POST",
      headers: {
        ...authorizationHeaders(credential),
        "Content-Type": safeContentType(entry.contentType),
        "Content-Length": String(entry.bytes),
        "Cache-Control": safeCacheControl(entry.cacheControl),
        "x-upsert": "true",
      },
      body: createReadStream(sourcePath),
      duplex: "half",
      signal: AbortSignal.timeout(60_000),
    }).catch(() => null);
    if (!response?.ok) throw new Error(`STORAGE_OBJECT_RESTORE_FAILED:${response?.status ?? 0}:${ordinal}`);

    const verification = await fetchImpl(storagePath(origin, "authenticated", entry.bucketId, entry.name), {
      headers: { ...authorizationHeaders(credential), "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(60_000),
    }).catch(() => null);
    if (!verification?.ok)
      throw new Error(`STORAGE_OBJECT_RESTORE_VERIFY_FAILED:${verification?.status ?? 0}:${ordinal}`);
    const restored = await hashResponse(verification);
    if (restored.bytes !== entry.bytes || restored.sha256 !== entry.sha256 || restored.md5 !== entry.md5)
      throw new Error(`STORAGE_OBJECT_RESTORE_HASH_MISMATCH:${ordinal}`);
  });

  const report = aggregateReport(index.entries, { phase: "upload", sourceSnapshot: index.sourceSnapshot });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return report;
}

export async function verifyRestoredStorageObjects({
  indexSource,
  reportPath,
  metadataRestoreReport,
  targetUrl,
  serviceKey,
  fetchImpl = fetch,
  concurrency = 4,
}) {
  const origin = validateLocalTargetUrl(targetUrl);
  const credential = validateServiceKey(serviceKey, "STORAGE_TARGET_SERVICE_KEY_REQUIRED");
  const index = JSON.parse(indexSource);
  if (
    index?.schemaVersion !== 2 ||
    index?.sourceSnapshot?.stabilityVerified !== true ||
    !Array.isArray(index?.entries) ||
    metadataRestoreReport?.schemaVersion !== 2 ||
    metadataRestoreReport?.phase !== "restore" ||
    metadataRestoreReport?.storage?.restoreVerified !== true ||
    !/^[a-f0-9]{64}$/.test(metadataRestoreReport?.storage?.aggregateSha256 ?? "")
  )
    throw new Error("STORAGE_FINAL_VERIFICATION_INPUT_INVALID");
  validateConcurrency(concurrency);
  const identities = new Set();
  for (const [ordinal, entry] of index.entries.entries()) {
    const identity = `${entry?.bucketId ?? ""}\0${entry?.name ?? ""}`;
    if (
      !validStorageIdentity(entry) ||
      identities.has(identity) ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 0 ||
      !/^[a-f0-9]{64}$/.test(entry.sha256 ?? "") ||
      !/^[a-f0-9]{32}$/.test(entry.md5 ?? "")
    )
      throw new Error(`STORAGE_FINAL_INDEX_INVALID:${ordinal}`);
    identities.add(identity);
  }
  await concurrentMap(index.entries, concurrency, async (entry, ordinal) => {
    const response = await fetchImpl(storagePath(origin, "authenticated", entry.bucketId, entry.name), {
      headers: { ...authorizationHeaders(credential), "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(60_000),
    }).catch(() => null);
    if (!response?.ok)
      throw new Error(`STORAGE_FINAL_PAYLOAD_DOWNLOAD_FAILED:${response?.status ?? 0}:${ordinal}`);
    const restored = await hashResponse(response);
    if (restored.bytes !== entry.bytes || restored.sha256 !== entry.sha256 || restored.md5 !== entry.md5)
      throw new Error(`STORAGE_FINAL_PAYLOAD_HASH_MISMATCH:${ordinal}`);
  });
  const report = aggregateReport(index.entries, {
    phase: "restored",
    sourceSnapshot: index.sourceSnapshot,
    metadataRestoreReport,
  });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return report;
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

async function main() {
  const mode = process.argv[2];
  if (mode === "export") {
    const inventoryPath = argument("--inventory");
    const outputDirectory = argument("--objects-dir");
    const indexPath = argument("--index");
    const reportPath = argument("--report");
    if (!inventoryPath || !outputDirectory || !indexPath || !reportPath)
      throw new Error("STORAGE_EXPORT_PATHS_REQUIRED");
    const report = await exportStorageObjects({
      inventorySource: await readFile(inventoryPath, "utf8"),
      outputDirectory,
      indexPath,
      reportPath,
      sourceUrl: process.env.SOURCE_SUPABASE_URL,
      serviceKey: process.env.SOURCE_SUPABASE_SERVICE_ROLE_KEY,
    });
    console.log(
      JSON.stringify({
        event: "supabase.storage.payloads.exported",
        objects: report.objects,
        bytes: report.bytes,
        aggregateSha256: report.aggregateSha256,
      }),
    );
    return;
  }
  if (mode === "verify-snapshot") {
    const beforeInventoryPath = argument("--before-inventory");
    const afterInventoryPath = argument("--after-inventory");
    const indexPath = argument("--index");
    const reportPath = argument("--report");
    const stabilityReportPath = argument("--stability-report");
    const snapshotAt = argument("--snapshot-at");
    const snapshotLsn = argument("--snapshot-lsn");
    if (
      !beforeInventoryPath ||
      !afterInventoryPath ||
      !indexPath ||
      !reportPath ||
      !stabilityReportPath ||
      !snapshotAt ||
      !snapshotLsn
    )
      throw new Error("STORAGE_SNAPSHOT_PATHS_REQUIRED");
    const verified = verifyStorageSnapshotStability({
      beforeInventorySource: await readFile(beforeInventoryPath, "utf8"),
      afterInventorySource: await readFile(afterInventoryPath, "utf8"),
      indexSource: await readFile(indexPath, "utf8"),
      snapshotAt,
      snapshotLsn,
    });
    await Promise.all([
      writeFile(indexPath, `${JSON.stringify(verified.index)}\n`, { encoding: "utf8", mode: 0o600 }),
      writeFile(reportPath, `${JSON.stringify(verified.report, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      }),
      writeFile(stabilityReportPath, `${JSON.stringify(verified.stabilityReport, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      }),
    ]);
    console.log(
      JSON.stringify({
        event: verified.stabilityReport.event,
        snapshotAt,
        walLsn: snapshotLsn,
        objects: verified.stabilityReport.objects,
        metadataSignals: verified.stabilityReport.metadataSignals,
        stable: true,
        identifiersExposed: false,
      }),
    );
    return;
  }
  if (mode === "restore") {
    const indexPath = argument("--index");
    const objectsDirectory = argument("--objects-dir");
    const reportPath = argument("--report");
    if (!indexPath || !objectsDirectory || !reportPath) throw new Error("STORAGE_RESTORE_PATHS_REQUIRED");
    const report = await restoreStorageObjects({
      indexSource: await readFile(indexPath, "utf8"),
      objectsDirectory,
      reportPath,
      targetUrl: process.env.TARGET_SUPABASE_URL,
      serviceKey: process.env.TARGET_SUPABASE_SERVICE_ROLE_KEY,
    });
    console.log(
      JSON.stringify({
        event: "supabase.storage.payloads.restored",
        objects: report.objects,
        bytes: report.bytes,
        aggregateSha256: report.aggregateSha256,
        target: report.restoreTarget,
      }),
    );
    return;
  }
  if (mode === "verify-restore") {
    const indexPath = argument("--index");
    const reportPath = argument("--report");
    const metadataReportPath = argument("--metadata-report");
    if (!indexPath || !reportPath || !metadataReportPath)
      throw new Error("STORAGE_FINAL_VERIFICATION_PATHS_REQUIRED");
    const report = await verifyRestoredStorageObjects({
      indexSource: await readFile(indexPath, "utf8"),
      reportPath,
      metadataRestoreReport: JSON.parse(await readFile(metadataReportPath, "utf8")),
      targetUrl: process.env.TARGET_SUPABASE_URL,
      serviceKey: process.env.TARGET_SUPABASE_SERVICE_ROLE_KEY,
    });
    console.log(
      JSON.stringify({
        event: report.event,
        objects: report.objects,
        bytes: report.bytes,
        aggregateSha256: report.aggregateSha256,
        metadataReappliedAfterUpload: true,
        target: report.restoreTarget,
      }),
    );
    return;
  }
  throw new Error("STORAGE_BACKUP_MODE_INVALID");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
