import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";

const FILE_NAMES = Object.freeze(["manifest", "functions", "database"]);
const SHA256 = /^[a-f0-9]{64}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const MAX_EVIDENCE_BYTES = 2 * 1024 * 1024;

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sourceBytes(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  throw new Error("G12_PRODUCTION_ROLLBACK_EVIDENCE_SOURCE_REFUSED");
}

export function buildProductionRollbackEvidenceBundle(files) {
  const encoded = {};
  for (const name of FILE_NAMES) {
    const bytes = sourceBytes(files?.[name]);
    if (bytes.length < 1 || bytes.length > MAX_EVIDENCE_BYTES)
      throw new Error(`G12_PRODUCTION_ROLLBACK_EVIDENCE_SIZE_REFUSED:${name}`);
    encoded[name] = {
      bytes: bytes.length,
      sha256: digest(bytes),
      data: gzipSync(bytes, { level: 9, mtime: 0 }).toString("base64"),
    };
  }
  return {
    schemaVersion: 1,
    encoding: "gzip+base64",
    files: encoded,
  };
}

export function validateProductionRollbackEvidenceBundle(bundle) {
  const violations = [];
  const decoded = {};
  if (bundle?.schemaVersion !== 1) violations.push("schema_invalid");
  if (bundle?.encoding !== "gzip+base64") violations.push("encoding_invalid");
  const actualNames =
    bundle?.files && typeof bundle.files === "object" && !Array.isArray(bundle.files)
      ? Object.keys(bundle.files).sort()
      : [];
  if (actualNames.join(",") !== [...FILE_NAMES].sort().join(",")) violations.push("files_invalid");

  for (const name of FILE_NAMES) {
    const entry = bundle?.files?.[name];
    if (!Number.isSafeInteger(entry?.bytes) || entry.bytes < 1 || entry.bytes > MAX_EVIDENCE_BYTES) {
      violations.push(`${name}_bytes_invalid`);
      continue;
    }
    if (!SHA256.test(entry?.sha256 ?? "")) violations.push(`${name}_digest_invalid`);
    if (
      typeof entry?.data !== "string" ||
      entry.data.length < 4 ||
      entry.data.length % 4 !== 0 ||
      !BASE64.test(entry.data)
    ) {
      violations.push(`${name}_encoding_invalid`);
      continue;
    }
    try {
      const compressed = Buffer.from(entry.data, "base64");
      if (compressed.toString("base64") !== entry.data) {
        violations.push(`${name}_encoding_invalid`);
        continue;
      }
      const bytes = gunzipSync(compressed, { maxOutputLength: MAX_EVIDENCE_BYTES + 1 });
      if (bytes.length !== entry.bytes) violations.push(`${name}_bytes_mismatch`);
      if (digest(bytes) !== entry.sha256) violations.push(`${name}_digest_mismatch`);
      decoded[name] = bytes;
    } catch {
      violations.push(`${name}_compression_invalid`);
    }
  }
  return { valid: violations.length === 0, violations, files: decoded };
}

export function decodeProductionRollbackEvidenceBundle(bundle) {
  const result = validateProductionRollbackEvidenceBundle(bundle);
  if (!result.valid)
    throw new Error(`G12_PRODUCTION_ROLLBACK_EVIDENCE_REFUSED:${result.violations.join(",")}`);
  return result.files;
}
