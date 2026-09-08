import { timingSafeEqual } from "node:crypto";

const SHA256 = /^[a-f0-9]{64}$/;
const FULL_SHA = /^[a-f0-9]{40}$/;

function exactDigest(left, right) {
  if (!SHA256.test(String(left ?? "")) || !SHA256.test(String(right ?? ""))) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

export function stagingSealIdentity(seal) {
  return {
    schemaVersion: seal?.schemaVersion,
    candidateSha: seal?.candidateSha,
    fileCount: seal?.fileCount,
    byteCount: seal?.byteCount,
    treeSha256: seal?.treeSha256,
    archiveFile: seal?.archiveFile,
    archiveBytes: seal?.archiveBytes,
    archiveSha256: seal?.archiveSha256,
  };
}

export function verifyStagingSealIdentity(actualSeal, expectedIdentity, expectedRelease) {
  const actual = stagingSealIdentity(actualSeal);
  const violations = [];
  if (!FULL_SHA.test(String(expectedRelease ?? ""))) violations.push("expected_release_invalid");
  if (actual.schemaVersion !== 2 || expectedIdentity?.schemaVersion !== 2) violations.push("schema_invalid");
  if (actual.candidateSha !== expectedRelease || expectedIdentity?.candidateSha !== expectedRelease)
    violations.push("candidate_sha_mismatch");
  for (const field of ["fileCount", "byteCount", "archiveBytes"])
    if (
      !Number.isSafeInteger(actual[field]) ||
      actual[field] < 1 ||
      actual[field] !== expectedIdentity?.[field]
    )
      violations.push(`${field}_mismatch`);
  if (actual.archiveFile !== expectedIdentity?.archiveFile) violations.push("archive_file_mismatch");
  if (!exactDigest(actual.treeSha256, expectedIdentity?.treeSha256)) violations.push("tree_digest_mismatch");
  if (!exactDigest(actual.archiveSha256, expectedIdentity?.archiveSha256))
    violations.push("archive_digest_mismatch");
  return { valid: violations.length === 0, violations, identity: actual };
}
