import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { brotliCompressSync, brotliDecompressSync, constants as zlibConstants } from "node:zlib";

import { PRODUCTION_FUNCTIONS, PUBLIC_FUNCTIONS } from "./production-backend-lib.mjs";
import { validatePublicBridgeRolloutProbe } from "./public-bridge-evidence-lib.mjs";
import { CMS_PUBLIC_BUNDLE_LOCK } from "./staging-cms-public-hotfix-deno-lock-lib.mjs";
import { CMS_PUBLIC_JSR_MIRROR } from "./staging-cms-public-hotfix-jsr-mirror-lib.mjs";

const FULL_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const EZBR_MAGIC = Buffer.from("EZBR", "ascii");
const ESZIP_V2_3_MAGIC = Buffer.from("ESZIP2.3", "ascii");

export const STAGING_CMS_PUBLIC_HOTFIX = Object.freeze({
  repository: "Vnd93/gaiatec-cms",
  workflowName: "Promote staging cms-public hotfix",
  workflowPath: ".github/workflows/promote-staging-cms-public-hotfix.yml",
  watchdogName: "Promote staging cms-public hotfix watchdog",
  watchdogPath: ".github/workflows/promote-staging-cms-public-hotfix-watchdog.yml",
  recoveryIncident: Object.freeze({
    parentRunId: "35295119905",
    parentRunAttempt: 1,
    parentControlSha: "33a626ca0ef17c96686c8bbea9a71b326724ec0c",
    ciWorkflowName: "CI",
    ciWorkflowPath: ".github/workflows/ci.yml",
    ciJobs: Object.freeze(["browser", "database", "hotfix-bundle-smoke", "quality"]),
  }),
  projectRef: "glcqsosxwgmlhzgcsnzv",
  functionSlug: "cms-public",
  origin: "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev",
  hotfixSha: "e40eb0c2cc81c27fbf8f23e8671136f9dfc6f282",
  hotfixParentSha: "4f96e78bad1d29fbee245a11c7536986f2bf79c6",
  rollbackSha: "c8aec5cad25830580bf9ca8a89594ebce1aa3570",
  candidateCi: Object.freeze({
    runId: "34989099615",
    runAttempt: 1,
    workflowName: "CI",
    workflowPath: ".github/workflows/ci.yml",
    jobs: Object.freeze(["browser", "database", "quality"]),
  }),
  baselineSourceSha256: "1e1df2c176b6ca099e4e41b9582e51f360dbde80c8160895e00c74b90b07e505",
  candidateSourceSha256: "84e59669b716a7f43820128ce8de21fa1ae5e69abf9452fa71dfb768a6c8367b",
  sourceDenoLockSha256: CMS_PUBLIC_BUNDLE_LOCK.sourceSha256,
  bundleDenoLockSha256: CMS_PUBLIC_BUNDLE_LOCK.sha256,
  importMapSha256: "d33ffa2ae7065139c3b3fc49c59cdd49fdae7817c5fa78bfd2d53bebbe83407c",
  edgeRuntimeIndexDigest: "sha256:c52405002a890ca9fcf77978671c57f3a988e03174afb277f84ac65bc917013c",
  edgeRuntimeAmd64Digest: "sha256:cc355c3d0e9c063a351cad56d1c4c52a3c4d85aff4e1fad9d91688e75f9aad09",
  bundleCommand:
    "edge-runtime bundle --entrypoint /workspace/supabase/functions/cms-public/index.ts --output /output/output.eszip --checksum sha256",
  unbundleCommand:
    "edge-runtime unbundle --eszip /output/output.eszip --output /output/unbundled/supabase/functions/cms-public",
  builderScriptSha256: "d52af72629242ea92f7323bbb9d14183206dde42ff99784ab9dc950690543bff",
  maximumArtifactFileBytes: 2 * 1024 * 1024,
  maximumArtifactTreeBytes: 64 * 1024 * 1024,
  maximumArtifactFileCount: 65_536,
  maximumArtifactEntryCount: 65_536,
  maximumArtifactPathBytes: 4_096,
  maximumArtifactDepth: 64,
  maximumEszipModuleCount: 65_536,
  maximumWireBundleBytes: 20 * 1024 * 1024,
  maximumRawEszipBytes: 64 * 1024 * 1024,
  candidateEntrypointPath: "file:///workspace/supabase/functions/cms-public/index.ts",
  candidateImportMapPath: "file:///workspace/deno.json",
  candidateEszipEntrypointSpecifier: "workspace/supabase/functions/cms-public/index.ts",
  edgeRuntimeMetadataSpecifier: "---EDGE-RUNTIME-METADATA---",
  trustedBaseline: Object.freeze({
    runId: "34908383307",
    runAttempt: 1,
    artifactId: "10373653337",
    artifactName: "staging-terminal-34908383307-1",
    artifactDigest: "sha256:7899884c96e7a8bb2048d00ef5dd47b5c1c151e2f439768addd0ce4ae3d0b8cb",
  }),
  sourceBaselineFunction: Object.freeze({
    id: "9da3b9be-6ac5-4393-aa57-b550fe549e7f",
    name: "cms-public",
    slug: "cms-public",
    version: 283,
    bundleSha256: "1960d5302b5aede36aaed5fb309f0645c2334d687cdf6e76760936257a6049f7",
    createdAt: "2026-08-28T22:17:33.542Z",
    updatedAt: "2026-09-14T23:39:47.148Z",
    status: "ACTIVE",
    verifyJwt: false,
    importMap: true,
    entrypointPath:
      "file:///home/runner/work/gaiatec-cms/gaiatec-cms/candidate-recovery/supabase/functions/cms-public/index.ts",
    importMapPath:
      "file:///home/runner/work/gaiatec-cms/gaiatec-cms/candidate-recovery/supabase/functions/import_map.json",
  }),
  recoveredBaseline: Object.freeze({
    runId: "35298567582",
    runAttempt: 1,
    controlSha: "6fc1577bc5a7de23fc0ee5e6802b0bfd29ba1303",
    workflowName: "Promote staging cms-public hotfix watchdog",
    workflowPath: ".github/workflows/promote-staging-cms-public-hotfix-watchdog.yml",
    jobName: "recover-incomplete-hotfix",
    terminalArtifactId: "10529465038",
    terminalArtifactName: "staging-cms-public-hotfix-recovered-35298567582-1-receipt-10528643032",
    terminalArtifactDigest: "sha256:dece0085b04cb6acc028163ec0bc164cd7385b1657a053a2e4946b52bbb660c2",
    receiptArtifactId: "10528643032",
    receiptArtifactName: "staging-cms-public-hotfix-rollback-receipt-35298567582-1",
    receiptArtifactDigest: "sha256:023d87ad4465601f4150dc80b1ba6e064d67ab52eee3be9ab72f1815ec38a637",
  }),
  baselineFunction: Object.freeze({
    id: "9da3b9be-6ac5-4393-aa57-b550fe549e7f",
    name: "cms-public",
    slug: "cms-public",
    version: 285,
    bundleSha256: "1960d5302b5aede36aaed5fb309f0645c2334d687cdf6e76760936257a6049f7",
    createdAt: "2026-08-28T22:17:33.542Z",
    updatedAt: "2026-09-18T02:15:50.806Z",
    status: "ACTIVE",
    verifyJwt: false,
    importMap: true,
    entrypointPath:
      "file:///home/runner/work/gaiatec-cms/gaiatec-cms/candidate-recovery/supabase/functions/cms-public/index.ts",
    importMapPath:
      "file:///home/runner/work/gaiatec-cms/gaiatec-cms/candidate-recovery/supabase/functions/import_map.json",
  }),
});

export function stagingCmsPublicRecoveryConfirmation({ controlSha, ciRunId }) {
  if (!FULL_SHA.test(controlSha) || !POSITIVE_INTEGER.test(String(ciRunId)))
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_RECOVERY_CONFIRMATION_INPUT_REFUSED");
  const incident = STAGING_CMS_PUBLIC_HOTFIX.recoveryIncident;
  return [
    "RECOVER_STAGING_CMS_PUBLIC",
    `PARENT_RUN_${incident.parentRunId}`,
    `ATTEMPT_${incident.parentRunAttempt}`,
    `PARENT_CONTROL_${incident.parentControlSha}`,
    `RECOVERY_CONTROL_${controlSha}`,
    `CI_${ciRunId}`,
    `ROLLBACK_${STAGING_CMS_PUBLIC_HOTFIX.rollbackSha}`,
  ].join("_");
}

export function stagingCmsPublicPromotionConfirmation({ controlSha, ciRunId }) {
  if (!FULL_SHA.test(controlSha) || !POSITIVE_INTEGER.test(String(ciRunId)))
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_PROMOTION_CONFIRMATION_INPUT_REFUSED");
  const recovered = STAGING_CMS_PUBLIC_HOTFIX.recoveredBaseline;
  return [
    "PROMOTE_STAGING_CMS_PUBLIC",
    STAGING_CMS_PUBLIC_HOTFIX.hotfixSha,
    `CONTROL_${controlSha}`,
    `CI_${ciRunId}`,
    `RECOVERY_RUN_${recovered.runId}`,
    `ATTEMPT_${recovered.runAttempt}`,
    `TERMINAL_${recovered.terminalArtifactId}`,
    `RECEIPT_${recovered.receiptArtifactId}`,
    `ROLLBACK_${STAGING_CMS_PUBLIC_HOTFIX.rollbackSha}`,
  ].join("_");
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

export function canonicalBytes(value) {
  return Buffer.from(JSON.stringify(canonical(value)), "utf8");
}

export function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalSha256(value) {
  return sha256Bytes(canonicalBytes(value));
}

export function assertRawEszipByteLength(value) {
  if (!Number.isSafeInteger(value) || value < 32 || value > STAGING_CMS_PUBLIC_HOTFIX.maximumRawEszipBytes)
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_ESZIP_SIZE_REFUSED");
  return value;
}

export function assertWireBundleByteLength(value) {
  if (!Number.isSafeInteger(value) || value < 32 || value > STAGING_CMS_PUBLIC_HOTFIX.maximumWireBundleBytes)
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_BUNDLE_SIZE_REFUSED");
  return value;
}

export function assertLiveBodyByteLength(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > STAGING_CMS_PUBLIC_HOTFIX.maximumRawEszipBytes)
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_LIVE_BODY_SIZE_REFUSED");
  return value;
}

export function assertBoundedFileByteLength(value, maximumBytes, { allowEmpty = false } = {}) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1)
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_FILE_LIMIT_REFUSED");
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_FILE_SIZE_REFUSED");
  if (value === 0 && !allowEmpty) throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_FILE_EMPTY_REFUSED");
  if (value > maximumBytes) throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_FILE_TOO_LARGE_REFUSED");
  return value;
}

export function assertArtifactTreeFileCount(
  value,
  maximum = STAGING_CMS_PUBLIC_HOTFIX.maximumArtifactFileCount,
) {
  if (!Number.isSafeInteger(maximum) || maximum < 1)
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_TREE_FILE_COUNT_LIMIT_REFUSED");
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum)
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_TREE_FILE_COUNT_REFUSED");
  return value;
}

export function assertArtifactTreeEntryCount(
  value,
  maximum = STAGING_CMS_PUBLIC_HOTFIX.maximumArtifactEntryCount,
) {
  if (!Number.isSafeInteger(maximum) || maximum < 1)
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_TREE_ENTRY_COUNT_LIMIT_REFUSED");
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum)
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_TREE_ENTRY_COUNT_REFUSED");
  return value;
}

export function assertArtifactTreeByteLength(
  value,
  maximum = STAGING_CMS_PUBLIC_HOTFIX.maximumArtifactTreeBytes,
) {
  if (!Number.isSafeInteger(maximum) || maximum < 1)
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_TREE_SIZE_LIMIT_REFUSED");
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum)
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_TREE_TOO_LARGE_REFUSED");
  return value;
}

export function assertArtifactTreePath(
  value,
  {
    maximumBytes = STAGING_CMS_PUBLIC_HOTFIX.maximumArtifactPathBytes,
    maximumDepth = STAGING_CMS_PUBLIC_HOTFIX.maximumArtifactDepth,
  } = {},
) {
  const relativePath = String(value ?? "");
  const parts = relativePath.split("/");
  if (
    !relativePath ||
    relativePath.startsWith("/") ||
    /^[A-Za-z]:(?:$|\/)/.test(relativePath) ||
    relativePath.startsWith("../") ||
    relativePath.includes("\\") ||
    Array.from(relativePath).some((character) => {
      const code = character.codePointAt(0);
      return code <= 31 || code === 127;
    }) ||
    parts.some((part) => !part || part === "." || part === "..")
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_TREE_PATH_REFUSED");
  const bytes = Buffer.byteLength(relativePath, "utf8");
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || bytes > maximumBytes)
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_TREE_PATH_SIZE_REFUSED");
  if (!Number.isSafeInteger(maximumDepth) || maximumDepth < 1 || parts.length > maximumDepth)
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_TREE_DEPTH_REFUSED");
  return { relativePath, bytes, depth: parts.length };
}

export function safeArtifactTreeEvidencePath(value, options) {
  try {
    return assertArtifactTreePath(value, options).relativePath;
  } catch {
    return undefined;
  }
}

function safeCanonicalSha256(value) {
  try {
    return canonicalSha256(value);
  } catch {
    return "";
  }
}

function sameCanonical(left, right) {
  try {
    return canonicalBytes(left).equals(canonicalBytes(right));
  } catch {
    return false;
  }
}

export function normalizeGithubArtifactDigest(value) {
  const digest = String(value ?? "").toLowerCase();
  if (SHA256.test(digest)) return `sha256:${digest}`;
  return /^sha256:[a-f0-9]{64}$/.test(digest) ? digest : "";
}

function newestArtifactFirst(left, right) {
  const attemptDifference = right.owner.runAttempt - left.owner.runAttempt;
  if (attemptDifference !== 0) return attemptDifference;
  const leftId = String(left.id);
  const rightId = String(right.id);
  return rightId.length - leftId.length || rightId.localeCompare(leftId);
}

export function selectHotfixWatchdogArtifactChain({ rollbackReceipts = [], recoveryTerminals = [] } = {}) {
  const violations = [];
  if (!Array.isArray(rollbackReceipts) || !Array.isArray(recoveryTerminals))
    return {
      valid: false,
      violations: ["watchdog_artifact_chain_invalid"],
      rollbackReceipt: null,
      recoveryTerminal: null,
    };
  const artifacts = [...rollbackReceipts, ...recoveryTerminals];
  if (
    artifacts.some(
      (artifact) =>
        !POSITIVE_INTEGER.test(String(artifact?.id ?? "")) ||
        !POSITIVE_INTEGER.test(String(artifact?.owner?.runId ?? "")) ||
        !Number.isSafeInteger(artifact?.owner?.runAttempt) ||
        artifact.owner.runAttempt < 1,
    ) ||
    new Set(artifacts.map((artifact) => String(artifact.id))).size !== artifacts.length
  ) {
    violations.push("watchdog_artifact_chain_invalid");
    return {
      valid: false,
      violations,
      rollbackReceipt: null,
      recoveryTerminal: null,
    };
  }
  const receipts = [...rollbackReceipts].sort(newestArtifactFirst);
  const terminals = [...recoveryTerminals].sort(newestArtifactFirst);
  const recoveryTerminal = terminals[0] ?? null;
  if (!recoveryTerminal)
    return {
      valid: violations.length === 0,
      violations,
      rollbackReceipt: receipts[0] ?? null,
      recoveryTerminal: null,
    };
  const receiptArtifactId = String(recoveryTerminal.receiptArtifactId ?? "");
  const matches = receipts.filter((receipt) => String(receipt.id) === receiptArtifactId);
  if (
    !POSITIVE_INTEGER.test(receiptArtifactId) ||
    matches.length !== 1 ||
    String(matches[0]?.owner?.runId ?? "") !== String(recoveryTerminal.owner.runId) ||
    Number(matches[0]?.owner?.runAttempt) > recoveryTerminal.owner.runAttempt
  )
    violations.push("watchdog_terminal_receipt_binding_invalid");
  return {
    valid: violations.length === 0,
    violations: [...new Set(violations)],
    rollbackReceipt: violations.length === 0 ? matches[0] : null,
    recoveryTerminal,
  };
}

export async function executeHotfixRollbackTransition({
  allowPatch,
  intentOwnedByExecutor,
  patch,
  observe,
} = {}) {
  if (
    typeof allowPatch !== "boolean" ||
    typeof intentOwnedByExecutor !== "boolean" ||
    typeof patch !== "function" ||
    typeof observe !== "function"
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_ROLLBACK_TRANSITION_INPUT_REFUSED");
  const patchAttempted = allowPatch && intentOwnedByExecutor;
  let responseAmbiguous = false;
  if (patchAttempted) {
    try {
      await patch();
    } catch {
      responseAmbiguous = true;
    }
  }
  const snapshot = await observe();
  return {
    snapshot,
    completionMode: patchAttempted ? "patched" : "reconciled",
    patchAttempted,
    responseAmbiguous,
  };
}

function exactDigest(left, right) {
  if (!SHA256.test(String(left ?? "")) || !SHA256.test(String(right ?? ""))) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function hmac(value, key) {
  if (!SHA256.test(String(key ?? ""))) throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_HMAC_KEY_REFUSED");
  return createHmac("sha256", Buffer.from(key, "hex")).update(canonicalBytes(value)).digest("hex");
}

function normalizedTimestamp(value) {
  const raw = String(value ?? "").trim();
  let milliseconds = Number.NaN;
  if (/^\d{13}$/.test(raw)) milliseconds = Number(raw);
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(raw))
    milliseconds = Date.parse(raw);
  if (
    !Number.isSafeInteger(milliseconds) ||
    milliseconds < Date.UTC(2000, 0, 1) ||
    milliseconds >= Date.UTC(3000, 0, 1)
  )
    return "";
  return new Date(milliseconds).toISOString();
}

function fileUrl(value) {
  const text = String(value ?? "");
  return text.startsWith("file:///") && !/[\r\n\0]/.test(text) ? text : "";
}

function nullableBoolean(value) {
  return typeof value === "boolean" ? value : null;
}

function u32(buffer, offset) {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset + 4 > buffer.byteLength)
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_ESZIP_TRUNCATED");
  return buffer.readUInt32BE(offset);
}

function exactUtf8(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_ESZIP_UTF8_REFUSED", { cause: error });
  }
}

function verifyEszipSection(content, digest, checksum) {
  if (checksum === 0 && digest.byteLength === 0) return;
  if (
    checksum !== 1 ||
    digest.byteLength !== 32 ||
    !timingSafeEqual(createHash("sha256").update(content).digest(), digest)
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_ESZIP_SECTION_HASH_REFUSED");
}

export function inspectEszipV2(rawEszip) {
  const raw = Buffer.from(rawEszip);
  assertRawEszipByteLength(raw.byteLength);
  if (raw.byteLength < 8 || !raw.subarray(0, ESZIP_V2_3_MAGIC.byteLength).equals(ESZIP_V2_3_MAGIC))
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_ESZIP_VERSION_REFUSED");
  let cursor = 8;
  const optionsLength = u32(raw, cursor);
  cursor += 4;
  if (optionsLength < 4 || optionsLength % 2 !== 0 || cursor + optionsLength > raw.byteLength)
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_ESZIP_OPTIONS_REFUSED");
  const options = raw.subarray(cursor, cursor + optionsLength);
  cursor += optionsLength;
  let checksum = -1;
  let checksumSize = -1;
  for (let offset = 0; offset < options.byteLength; offset += 2) {
    if (options[offset] === 0) checksum = options[offset + 1];
    if (options[offset] === 1) checksumSize = options[offset + 1];
  }
  if (
    !((checksum === 0 && checksumSize === 0) || (checksum === 1 && checksumSize === 32)) ||
    cursor + checksumSize > raw.byteLength
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_ESZIP_CHECKSUM_REFUSED");
  verifyEszipSection(options, raw.subarray(cursor, cursor + checksumSize), checksum);
  cursor += checksumSize;

  const readSection = () => {
    const length = u32(raw, cursor);
    cursor += 4;
    if (cursor + length + checksumSize > raw.byteLength)
      throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_ESZIP_SECTION_REFUSED");
    const content = raw.subarray(cursor, cursor + length);
    cursor += length;
    const digest = raw.subarray(cursor, cursor + checksumSize);
    cursor += checksumSize;
    verifyEszipSection(content, digest, checksum);
    return content;
  };

  const modulesHeader = readSection();
  const modules = [];
  const moduleSpecifiers = new Set();
  const sourceSlots = [];
  const sourceMapSlots = [];
  let headerCursor = 0;
  const headerBytes = (length) => {
    if (!Number.isSafeInteger(length) || length < 0 || headerCursor + length > modulesHeader.byteLength)
      throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_ESZIP_HEADER_REFUSED");
    const value = modulesHeader.subarray(headerCursor, headerCursor + length);
    headerCursor += length;
    return value;
  };
  const headerU32 = () => {
    const value = headerBytes(4);
    return value.readUInt32BE(0);
  };
  while (headerCursor < modulesHeader.byteLength) {
    if (modules.length >= STAGING_CMS_PUBLIC_HOTFIX.maximumEszipModuleCount)
      throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_ESZIP_MODULE_COUNT_REFUSED");
    const specifierLength = headerU32();
    if (specifierLength < 1) throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_ESZIP_SPECIFIER_REFUSED");
    const specifier = exactUtf8(headerBytes(specifierLength));
    if (!specifier || /[\r\n\0]/.test(specifier) || moduleSpecifiers.has(specifier))
      throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_ESZIP_SPECIFIER_REFUSED");
    moduleSpecifiers.add(specifier);
    const entryKind = headerBytes(1)[0];
    if (entryKind === 0) {
      const sourceOffset = headerU32();
      const sourceLength = headerU32();
      const sourceMapOffset = headerU32();
      const sourceMapLength = headerU32();
      const moduleKind = headerBytes(1)[0];
      if (moduleKind > 4) throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_ESZIP_MODULE_KIND_REFUSED");
      if (sourceOffset !== 0 || sourceLength !== 0)
        sourceSlots.push({ offset: sourceOffset, length: sourceLength });
      if (sourceMapOffset !== 0 || sourceMapLength !== 0)
        sourceMapSlots.push({ offset: sourceMapOffset, length: sourceMapLength });
      modules.push({ specifier, entryKind, moduleKind });
    } else if (entryKind === 1) {
      const targetLength = headerU32();
      const target = exactUtf8(headerBytes(targetLength));
      if (!target || /[\r\n\0]/.test(target))
        throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_ESZIP_REDIRECT_REFUSED");
      modules.push({ specifier, entryKind, target });
    } else if (entryKind === 2) {
      headerU32();
      modules.push({ specifier, entryKind });
    } else {
      throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_ESZIP_ENTRY_KIND_REFUSED");
    }
  }
  if (modules.length < 1 || !modules.some((item) => item.entryKind === 0))
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_ESZIP_MODULES_REFUSED");

  readSection();
  const readDataSection = (slots, label) => {
    const totalLength = u32(raw, cursor);
    cursor += 4;
    if (cursor + totalLength > raw.byteLength)
      throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_ESZIP_${label}_REFUSED`);
    const section = raw.subarray(cursor, cursor + totalLength);
    cursor += totalLength;
    let offset = 0;
    const ordered = [...slots].sort((left, right) => left.offset - right.offset);
    for (const slot of ordered) {
      if (
        slot.offset !== offset ||
        slot.length < 1 ||
        offset + slot.length + checksumSize > section.byteLength
      )
        throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_ESZIP_${label}_OFFSET_REFUSED`);
      const content = section.subarray(offset, offset + slot.length);
      const digest = section.subarray(offset + slot.length, offset + slot.length + checksumSize);
      verifyEszipSection(content, digest, checksum);
      offset += slot.length + checksumSize;
    }
    if (offset !== section.byteLength)
      throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_ESZIP_${label}_TAIL_REFUSED`);
    return totalLength;
  };
  const sourceBytes = readDataSection(sourceSlots, "SOURCES");
  const sourceMapBytes = readDataSection(sourceMapSlots, "SOURCE_MAPS");
  if (cursor !== raw.byteLength || sourceBytes < 1)
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_ESZIP_TAIL_REFUSED");
  const moduleDescriptors = modules.map((item) => ({ ...item }));
  return {
    version: "2.3",
    checksum: checksum === 1 ? "sha256" : "none",
    checksumSize,
    moduleCount: modules.length,
    moduleSpecifiers: modules.map((item) => item.specifier),
    moduleSpecifiersSha256: canonicalSha256(modules.map((item) => item.specifier)),
    moduleDescriptors,
    moduleDescriptorsSha256: canonicalSha256(moduleDescriptors),
    sourceBytes,
    sourceMapBytes,
    bytes: raw.byteLength,
    sha256: sha256Bytes(raw),
  };
}

export function hasExpectedCandidateEszipStructure(inspection) {
  const descriptors = inspection?.moduleDescriptors;
  const specifiers = inspection?.moduleSpecifiers;
  if (
    inspection?.version !== "2.3" ||
    inspection?.checksum !== "sha256" ||
    inspection?.checksumSize !== 32 ||
    !Number.isSafeInteger(inspection?.moduleCount) ||
    inspection.moduleCount < 2 ||
    inspection.moduleCount > STAGING_CMS_PUBLIC_HOTFIX.maximumEszipModuleCount ||
    !Array.isArray(specifiers) ||
    specifiers.length !== inspection.moduleCount ||
    new Set(specifiers).size !== specifiers.length ||
    specifiers.some(
      (specifier) => typeof specifier !== "string" || !specifier || /[\r\n\0]/.test(specifier),
    ) ||
    inspection?.moduleSpecifiersSha256 !== canonicalSha256(specifiers) ||
    !Array.isArray(descriptors) ||
    descriptors.length !== inspection.moduleCount ||
    !sameCanonical(
      descriptors.map((descriptor) => descriptor?.specifier),
      specifiers,
    ) ||
    inspection?.moduleDescriptorsSha256 !== canonicalSha256(descriptors)
  )
    return false;
  return (
    descriptors.some((descriptor) =>
      sameCanonical(descriptor, {
        specifier: STAGING_CMS_PUBLIC_HOTFIX.candidateEszipEntrypointSpecifier,
        entryKind: 0,
        moduleKind: 0,
      }),
    ) &&
    descriptors.some((descriptor) =>
      sameCanonical(descriptor, {
        specifier: STAGING_CMS_PUBLIC_HOTFIX.edgeRuntimeMetadataSpecifier,
        entryKind: 0,
        moduleKind: 3,
      }),
    )
  );
}

export function validateCandidateBuildProvenance(provenance, { rawEszip } = {}) {
  const violations = [];
  const input = provenance?.input;
  const bundleDenoLock = input?.bundleDenoLock;
  const jsrMirror = input?.jsrMirror;
  const builder = provenance?.builder;
  const inspection = provenance?.rawEszip;
  if (
    provenance?.schemaVersion !== 1 ||
    provenance?.event !== "g12.staging.cms_public_hotfix.bundle_provenance" ||
    provenance?.reproducible !== true ||
    !SHA256.test(input?.manifestSha256 ?? "") ||
    !SHA256.test(input?.filesManifestSha256 ?? "") ||
    !SHA256.test(input?.treeSha256 ?? "") ||
    !Number.isSafeInteger(input?.fileCount) ||
    input.fileCount < 1 ||
    !SHA256.test(input?.denoConfigSha256 ?? "") ||
    input?.sourceDenoLockSha256 !== STAGING_CMS_PUBLIC_HOTFIX.sourceDenoLockSha256 ||
    input?.bundleDenoLockSha256 !== STAGING_CMS_PUBLIC_HOTFIX.bundleDenoLockSha256 ||
    !sameCanonical(bundleDenoLock, CMS_PUBLIC_BUNDLE_LOCK.evidence) ||
    input?.importMapSha256 !== STAGING_CMS_PUBLIC_HOTFIX.importMapSha256 ||
    jsrMirror?.runtimeUrl !== CMS_PUBLIC_JSR_MIRROR.runtimeUrl ||
    !SHA256.test(jsrMirror?.manifestSha256 ?? "") ||
    !SHA256.test(jsrMirror?.filesManifestSha256 ?? "") ||
    !SHA256.test(jsrMirror?.treeSha256 ?? "") ||
    jsrMirror?.filesManifestSha256 !== jsrMirror?.treeSha256 ||
    !Number.isSafeInteger(jsrMirror?.fileCount) ||
    jsrMirror.fileCount < 1 ||
    !Number.isSafeInteger(jsrMirror?.bytes) ||
    jsrMirror.bytes < 1 ||
    jsrMirror?.moduleImportMetaAbsent !== true ||
    builder?.edgeRuntimeIndexDigest !== STAGING_CMS_PUBLIC_HOTFIX.edgeRuntimeIndexDigest ||
    builder?.edgeRuntimeAmd64Digest !== STAGING_CMS_PUBLIC_HOTFIX.edgeRuntimeAmd64Digest ||
    builder?.platform !== "linux/amd64" ||
    builder?.bundleCommandSha256 !==
      sha256Bytes(Buffer.from(STAGING_CMS_PUBLIC_HOTFIX.bundleCommand, "utf8")) ||
    builder?.unbundleCommandSha256 !==
      sha256Bytes(Buffer.from(STAGING_CMS_PUBLIC_HOTFIX.unbundleCommand, "utf8")) ||
    builder?.builderScriptSha256 !== STAGING_CMS_PUBLIC_HOTFIX.builderScriptSha256 ||
    builder?.checksum !== "sha256" ||
    builder?.lockFrozen !== true ||
    !hasExpectedCandidateEszipStructure(inspection) ||
    !Number.isSafeInteger(inspection?.sourceBytes) ||
    inspection.sourceBytes < 1 ||
    !Number.isSafeInteger(inspection?.sourceMapBytes) ||
    inspection.sourceMapBytes < 0 ||
    !Number.isSafeInteger(inspection?.bytes) ||
    inspection.bytes < 1 ||
    !SHA256.test(inspection?.sha256 ?? "")
  )
    violations.push("candidate_provenance_identity_invalid");
  const builds = [
    ["online", "default", provenance?.builds?.online],
    ["offline", "none", provenance?.builds?.offline],
  ];
  for (const [mode, network, build] of builds) {
    const nonEmptyFileCount =
      Number.isSafeInteger(build?.unbundledFileCount) &&
      Number.isSafeInteger(build?.unbundledZeroByteFileCount)
        ? build.unbundledFileCount - build.unbundledZeroByteFileCount
        : -1;
    if (
      build?.mode !== mode ||
      build?.network !== network ||
      build?.attestationFile !== `${mode}-build-attestation.env` ||
      !SHA256.test(build?.attestationSha256 ?? "") ||
      build?.unbundledFilesFile !== `${mode}-unbundled-files.sha256` ||
      !SHA256.test(build?.unbundledFilesSha256 ?? "") ||
      !Number.isSafeInteger(build?.unbundledFileCount) ||
      build.unbundledFileCount < 1 ||
      build.unbundledFileCount > STAGING_CMS_PUBLIC_HOTFIX.maximumArtifactFileCount ||
      !Number.isSafeInteger(build?.unbundledTotalBytes) ||
      build.unbundledTotalBytes < 0 ||
      build.unbundledTotalBytes > STAGING_CMS_PUBLIC_HOTFIX.maximumArtifactTreeBytes ||
      !Number.isSafeInteger(build?.unbundledZeroByteFileCount) ||
      build.unbundledZeroByteFileCount < 0 ||
      build.unbundledZeroByteFileCount > build.unbundledFileCount ||
      !Number.isSafeInteger(build?.unbundledLargestFileBytes) ||
      build.unbundledLargestFileBytes < 0 ||
      build.unbundledLargestFileBytes > STAGING_CMS_PUBLIC_HOTFIX.maximumArtifactFileBytes ||
      build.unbundledLargestFileBytes > build.unbundledTotalBytes ||
      nonEmptyFileCount < 0 ||
      build.unbundledTotalBytes < nonEmptyFileCount ||
      (nonEmptyFileCount > 0 &&
        (build.unbundledLargestFileBytes > build.unbundledTotalBytes - (nonEmptyFileCount - 1) ||
          build.unbundledLargestFileBytes * nonEmptyFileCount < build.unbundledTotalBytes)) ||
      (build.unbundledTotalBytes === 0) !== (build.unbundledZeroByteFileCount === build.unbundledFileCount) ||
      build.unbundledTotalBytes > 0 !== build.unbundledLargestFileBytes > 0 ||
      build?.rawEszipSha256 !== inspection?.sha256 ||
      build?.rawEszipBytes !== inspection?.bytes
    )
      violations.push(`candidate_provenance_${mode}_invalid`);
  }
  if (
    provenance?.builds?.online?.rawEszipSha256 !== provenance?.builds?.offline?.rawEszipSha256 ||
    provenance?.builds?.online?.rawEszipBytes !== provenance?.builds?.offline?.rawEszipBytes ||
    provenance?.builds?.online?.unbundledFilesSha256 !== provenance?.builds?.offline?.unbundledFilesSha256 ||
    provenance?.builds?.online?.unbundledFileCount !== provenance?.builds?.offline?.unbundledFileCount ||
    provenance?.builds?.online?.unbundledTotalBytes !== provenance?.builds?.offline?.unbundledTotalBytes ||
    provenance?.builds?.online?.unbundledZeroByteFileCount !==
      provenance?.builds?.offline?.unbundledZeroByteFileCount ||
    provenance?.builds?.online?.unbundledLargestFileBytes !==
      provenance?.builds?.offline?.unbundledLargestFileBytes
  )
    violations.push("candidate_provenance_reproducibility_invalid");
  if (rawEszip !== undefined) {
    try {
      const actual = inspectEszipV2(rawEszip);
      if (!sameCanonical(actual, inspection)) violations.push("candidate_provenance_eszip_mismatch");
    } catch {
      violations.push("candidate_provenance_eszip_invalid");
    }
  }
  return { valid: violations.length === 0, violations: [...new Set(violations)] };
}

export function validateCandidateBuildEvidenceFiles(provenance, evidence) {
  const violations = [];
  const provenanceResult = validateCandidateBuildProvenance(provenance);
  violations.push(...provenanceResult.violations);
  const expectedAttestationKeys = [
    "BUNDLE_COMMAND_SHA256",
    "BUILDER_SCRIPT_SHA256",
    "BUNDLE_DENO_LOCK_EVIDENCE_JSON",
    "BUNDLE_DENO_LOCK_NPM_ROOT_SPECIFIERS",
    "BUNDLE_DENO_LOCK_SHA256",
    "CANDIDATE_SHA",
    "DENO_CONFIG_SHA256",
    "EDGE_RUNTIME_AMD64_DIGEST",
    "EDGE_RUNTIME_INDEX_DIGEST",
    "ESZIP_VALIDATED",
    "EVENT",
    "IMPORT_MAP_SHA256",
    "INPUT_FILE_COUNT",
    "INPUT_FILES_MANIFEST_SHA256",
    "INPUT_MANIFEST_SHA256",
    "INPUT_TREE_SHA256",
    "JSR_MIRROR_BYTES",
    "JSR_MIRROR_FILE_COUNT",
    "JSR_MIRROR_FILES_MANIFEST_SHA256",
    "JSR_MIRROR_MANIFEST_SHA256",
    "JSR_MIRROR_TREE_SHA256",
    "JSR_URL",
    "MODE",
    "NETWORK",
    "PLATFORM",
    "RAW_ESZIP_BYTES",
    "RAW_ESZIP_SHA256",
    "SCHEMA_VERSION",
    "SOURCE_SHA256",
    "SOURCE_DENO_LOCK_SHA256",
    "UNBUNDLED_COMMAND_SHA256",
    "UNBUNDLED_FILE_COUNT",
    "UNBUNDLED_FILES_SHA256",
    "UNBUNDLED_LARGEST_FILE_BYTES",
    "UNBUNDLED_TOTAL_BYTES",
    "UNBUNDLED_ZERO_BYTE_FILE_COUNT",
  ].sort();
  for (const mode of ["online", "offline"]) {
    const build = provenance?.builds?.[mode];
    let attestation;
    let unbundledFiles;
    try {
      attestation = Buffer.from(evidence?.[mode]?.attestation);
      unbundledFiles = Buffer.from(evidence?.[mode]?.unbundledFiles);
    } catch {
      violations.push(`candidate_evidence_${mode}_missing`);
      continue;
    }
    let attestationValues;
    try {
      const text = exactUtf8(attestation);
      if (!text.endsWith("\n") || /\r|\0/.test(text)) throw new Error("invalid");
      attestationValues = {};
      for (const line of text.slice(0, -1).split("\n")) {
        const match = /^([A-Z][A-Z0-9_]*)=([^\n]*)$/.exec(line);
        if (!match || Object.hasOwn(attestationValues, match[1])) throw new Error("invalid");
        attestationValues[match[1]] = match[2];
      }
    } catch {
      attestationValues = null;
    }
    const network = mode === "online" ? "default" : "none";
    const expectedAttestation = {
      BUNDLE_COMMAND_SHA256: provenance?.builder?.bundleCommandSha256,
      BUILDER_SCRIPT_SHA256: provenance?.builder?.builderScriptSha256,
      BUNDLE_DENO_LOCK_SHA256: provenance?.input?.bundleDenoLockSha256,
      BUNDLE_DENO_LOCK_NPM_ROOT_SPECIFIERS: JSON.stringify(
        provenance?.input?.bundleDenoLock?.npmRootSpecifiers,
      ),
      BUNDLE_DENO_LOCK_EVIDENCE_JSON: JSON.stringify(provenance?.input?.bundleDenoLock),
      CANDIDATE_SHA: STAGING_CMS_PUBLIC_HOTFIX.hotfixSha,
      DENO_CONFIG_SHA256: provenance?.input?.denoConfigSha256,
      EDGE_RUNTIME_AMD64_DIGEST: provenance?.builder?.edgeRuntimeAmd64Digest,
      EDGE_RUNTIME_INDEX_DIGEST: provenance?.builder?.edgeRuntimeIndexDigest,
      ESZIP_VALIDATED: "true",
      EVENT: "g12.staging.cms_public_hotfix.bundle_attestation",
      IMPORT_MAP_SHA256: provenance?.input?.importMapSha256,
      INPUT_FILE_COUNT: String(provenance?.input?.fileCount),
      INPUT_FILES_MANIFEST_SHA256: provenance?.input?.filesManifestSha256,
      INPUT_MANIFEST_SHA256: provenance?.input?.manifestSha256,
      INPUT_TREE_SHA256: provenance?.input?.treeSha256,
      JSR_MIRROR_BYTES: String(provenance?.input?.jsrMirror?.bytes),
      JSR_MIRROR_FILE_COUNT: String(provenance?.input?.jsrMirror?.fileCount),
      JSR_MIRROR_FILES_MANIFEST_SHA256: provenance?.input?.jsrMirror?.filesManifestSha256,
      JSR_MIRROR_MANIFEST_SHA256: provenance?.input?.jsrMirror?.manifestSha256,
      JSR_MIRROR_TREE_SHA256: provenance?.input?.jsrMirror?.treeSha256,
      JSR_URL: provenance?.input?.jsrMirror?.runtimeUrl,
      MODE: mode,
      NETWORK: network,
      PLATFORM: provenance?.builder?.platform,
      RAW_ESZIP_BYTES: String(build?.rawEszipBytes),
      RAW_ESZIP_SHA256: build?.rawEszipSha256,
      SCHEMA_VERSION: "1",
      SOURCE_SHA256: STAGING_CMS_PUBLIC_HOTFIX.candidateSourceSha256,
      SOURCE_DENO_LOCK_SHA256: provenance?.input?.sourceDenoLockSha256,
      UNBUNDLED_COMMAND_SHA256: provenance?.builder?.unbundleCommandSha256,
      UNBUNDLED_FILE_COUNT: String(build?.unbundledFileCount),
      UNBUNDLED_FILES_SHA256: build?.unbundledFilesSha256,
      UNBUNDLED_LARGEST_FILE_BYTES: String(build?.unbundledLargestFileBytes),
      UNBUNDLED_TOTAL_BYTES: String(build?.unbundledTotalBytes),
      UNBUNDLED_ZERO_BYTE_FILE_COUNT: String(build?.unbundledZeroByteFileCount),
    };
    if (
      attestation.byteLength < 1 ||
      attestation.byteLength > 16_384 ||
      attestation[attestation.byteLength - 1] !== 10 ||
      sha256Bytes(attestation) !== build?.attestationSha256 ||
      !attestationValues ||
      JSON.stringify(Object.keys(attestationValues).sort()) !== JSON.stringify(expectedAttestationKeys) ||
      !sameCanonical(attestationValues, expectedAttestation)
    )
      violations.push(`candidate_evidence_${mode}_attestation_invalid`);
    let manifestLines = [];
    let manifestStructureValid = true;
    try {
      const manifestText = exactUtf8(unbundledFiles);
      if (!manifestText.endsWith("\n") || /\r|\0/.test(manifestText)) throw new Error("invalid");
      manifestLines = manifestText.slice(0, -1).split("\n");
      const paths = [];
      let zeroByteFileCount = 0;
      for (const line of manifestLines) {
        const match = /^([a-f0-9]{64}) {2}\.\/(.+)$/.exec(line);
        const path = match?.[2] ?? "";
        if (!match) throw new Error("invalid");
        assertArtifactTreePath(path);
        if (paths.length > 0 && Buffer.compare(Buffer.from(paths.at(-1)), Buffer.from(path)) >= 0)
          throw new Error("invalid");
        if (match[1] === sha256Bytes(Buffer.alloc(0))) zeroByteFileCount += 1;
        paths.push(path);
      }
      if (zeroByteFileCount !== build?.unbundledZeroByteFileCount) throw new Error("invalid");
    } catch {
      manifestStructureValid = false;
    }
    if (
      unbundledFiles.byteLength < 1 ||
      unbundledFiles.byteLength > 20_000_000 ||
      sha256Bytes(unbundledFiles) !== build?.unbundledFilesSha256 ||
      manifestLines.length !== build?.unbundledFileCount ||
      manifestLines.length > STAGING_CMS_PUBLIC_HOTFIX.maximumArtifactFileCount ||
      !manifestStructureValid
    )
      violations.push(`candidate_evidence_${mode}_unbundled_invalid`);
  }
  return { valid: violations.length === 0, violations: [...new Set(violations)] };
}

export function frameRawEszip(rawEszip) {
  const raw = Buffer.from(rawEszip);
  inspectEszipV2(raw);
  let compressed;
  try {
    compressed = brotliCompressSync(raw, {
      maxOutputLength: STAGING_CMS_PUBLIC_HOTFIX.maximumWireBundleBytes - EZBR_MAGIC.byteLength,
      params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 6 },
    });
  } catch (error) {
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_BUNDLE_SIZE_REFUSED", { cause: error });
  }
  assertWireBundleByteLength(EZBR_MAGIC.byteLength + compressed.byteLength);
  return Buffer.concat([EZBR_MAGIC, compressed]);
}

export function reconcileDownloadedBundleBody(downloadedBody, expectedSha256) {
  if (!SHA256.test(String(expectedSha256 ?? "")))
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_BASELINE_DIGEST_REFUSED");
  const downloaded = Buffer.from(downloadedBody);
  const framed = downloaded.subarray(0, EZBR_MAGIC.byteLength).equals(EZBR_MAGIC);
  if (framed) assertWireBundleByteLength(downloaded.byteLength);
  else assertRawEszipByteLength(downloaded.byteLength);
  let rawEszip;
  let deploymentBody;
  if (framed) {
    if (!exactDigest(sha256Bytes(downloaded), expectedSha256))
      throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_BASELINE_BODY_MISMATCH");
    try {
      rawEszip = brotliDecompressSync(downloaded.subarray(EZBR_MAGIC.byteLength), {
        maxOutputLength: STAGING_CMS_PUBLIC_HOTFIX.maximumRawEszipBytes,
      });
    } catch (error) {
      throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_BASELINE_EZBR_REFUSED", { cause: error });
    }
    inspectEszipV2(rawEszip);
    deploymentBody = Buffer.from(downloaded);
  } else {
    rawEszip = downloaded;
    inspectEszipV2(rawEszip);
    deploymentBody = frameRawEszip(rawEszip);
  }
  if (!exactDigest(sha256Bytes(deploymentBody), expectedSha256))
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_BASELINE_BODY_MISMATCH");
  return {
    rawEszip: Buffer.from(rawEszip),
    deploymentBody,
    deploymentSha256: sha256Bytes(deploymentBody),
  };
}

export function normalizeFunctionTuple(record) {
  const verifyJwt = record?.verify_jwt ?? record?.verifyJwt;
  const importMap = record?.import_map ?? record?.importMap;
  return {
    id: String(record?.id ?? "").toLowerCase(),
    name: String(record?.name ?? ""),
    slug: String(record?.slug ?? ""),
    status: String(record?.status ?? "").toUpperCase(),
    verifyJwt: nullableBoolean(verifyJwt),
    version: Number(record?.version ?? 0),
    bundleSha256: String(record?.ezbr_sha256 ?? record?.bundleSha256 ?? "").toLowerCase(),
    createdAt: normalizedTimestamp(record?.created_at ?? record?.createdAt),
    updatedAt: normalizedTimestamp(record?.updated_at ?? record?.updatedAt),
    entrypointPath: fileUrl(record?.entrypoint_path ?? record?.entrypointPath),
    importMap: nullableBoolean(importMap),
    importMapPath: fileUrl(record?.import_map_path ?? record?.importMapPath),
  };
}

function tupleViolations(tuple, expectedPublic) {
  const violations = [];
  if (!UUID.test(tuple.id)) violations.push(`${tuple.name || "unknown"}:id_invalid`);
  if (!/^[a-z][a-z0-9-]*$/.test(tuple.name) || tuple.slug !== tuple.name)
    violations.push(`${tuple.name || "unknown"}:name_invalid`);
  if (tuple.status !== "ACTIVE") violations.push(`${tuple.name}:inactive`);
  if (!Number.isSafeInteger(tuple.version) || tuple.version < 1)
    violations.push(`${tuple.name}:version_invalid`);
  if (!SHA256.test(tuple.bundleSha256)) violations.push(`${tuple.name}:bundle_invalid`);
  if (!tuple.createdAt || !tuple.updatedAt) violations.push(`${tuple.name}:timestamp_invalid`);
  if (!tuple.entrypointPath || !tuple.importMapPath) violations.push(`${tuple.name}:metadata_path_invalid`);
  if (tuple.verifyJwt !== !expectedPublic) violations.push(`${tuple.name}:verify_jwt_invalid`);
  if (tuple.name === STAGING_CMS_PUBLIC_HOTFIX.functionSlug && tuple.importMap !== true)
    violations.push(`${tuple.name}:import_map_invalid`);
  return violations;
}

export function functionInventorySnapshot(
  payload,
  { expectedNames = PRODUCTION_FUNCTIONS, publicFunctions = PUBLIC_FUNCTIONS } = {},
) {
  const input = Array.isArray(payload) ? payload : (payload?.functions ?? []);
  const records = input
    .map(normalizeFunctionTuple)
    .sort((left, right) => left.name.localeCompare(right.name));
  const violations = [];
  const expected = [...expectedNames].sort();
  if (JSON.stringify(records.map((record) => record.name)) !== JSON.stringify(expected))
    violations.push("inventory_names_invalid");
  for (const record of records) violations.push(...tupleViolations(record, publicFunctions.has(record.name)));
  const target = records.find((record) => record.name === STAGING_CMS_PUBLIC_HOTFIX.functionSlug);
  const nonTarget = records.filter((record) => record.name !== STAGING_CMS_PUBLIC_HOTFIX.functionSlug);
  return {
    valid: violations.length === 0,
    violations: [...new Set(violations)],
    records,
    target,
    nonTarget,
    inventorySha256: canonicalSha256(records),
    nonTargetSha256: canonicalSha256(nonTarget),
  };
}

export function sameFunctionTuple(left, right, { ignoreVersion = false, ignoreUpdatedAt = false } = {}) {
  const leftTuple = normalizeFunctionTuple(left);
  const rightTuple = normalizeFunctionTuple(right);
  if (ignoreVersion) {
    delete leftTuple.version;
    delete rightTuple.version;
  }
  if (ignoreUpdatedAt) {
    delete leftTuple.updatedAt;
    delete rightTuple.updatedAt;
  }
  return canonicalBytes(leftTuple).equals(canonicalBytes(rightTuple));
}

export function assertTrustedBaselineTuple(tuple, expected = STAGING_CMS_PUBLIC_HOTFIX.baselineFunction) {
  const value = normalizeFunctionTuple(tuple);
  const violations = [];
  for (const [key, expectedValue] of Object.entries(expected))
    if (value[key] !== expectedValue) violations.push(`baseline_${key}_mismatch`);
  if (value.name !== STAGING_CMS_PUBLIC_HOTFIX.functionSlug || value.slug !== value.name)
    violations.push("baseline_slug_mismatch");
  if (!value.entrypointPath || !value.importMapPath || value.importMap !== true)
    violations.push("baseline_metadata_mismatch");
  if (violations.length > 0)
    throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_BASELINE_REFUSED:${violations.join(",")}`);
  return value;
}

function probeEnvelopeViolations(report) {
  const violations = [];
  if (
    report?.schemaVersion !== 1 ||
    report?.event !== "g12.rollout.probe" ||
    report?.probeProfile !== "full" ||
    report?.origin !== STAGING_CMS_PUBLIC_HOTFIX.origin ||
    report?.candidateSha !== STAGING_CMS_PUBLIC_HOTFIX.rollbackSha ||
    report?.environment !== "staging" ||
    report?.sampleCount !== 20 ||
    report?.warmupSamplesPerRoute !== 20 ||
    report?.measuredResponses !== 82 ||
    report?.requestTimeoutMs !== 10_000 ||
    report?.availabilityPercent !== 100 ||
    report?.http5xxRatePercent !== 0 ||
    report?.releaseHeadersExact !== true ||
    report?.healthContractValid !== true ||
    report?.manifestReleaseExact !== true ||
    report?.nonProductionNoindexValid !== true ||
    report?.cspPolicyValid !== true
  )
    violations.push("probe_envelope_invalid");
  const expectedRoutes = ["/", "/admin/login", "/contato", "/produtos"];
  if (JSON.stringify(Object.keys(report?.routeMetrics ?? {}).sort()) !== JSON.stringify(expectedRoutes))
    violations.push("probe_routes_invalid");
  for (const [route, metric] of Object.entries(report?.routeMetrics ?? {})) {
    if (
      metric?.samples !== 20 ||
      metric?.availabilityPercent !== 100 ||
      !Number.isFinite(metric?.p50Ms) ||
      !Number.isFinite(metric?.p95Ms) ||
      !Number.isFinite(metric?.maxMs) ||
      metric.p50Ms < 0 ||
      metric.p50Ms > metric.p95Ms ||
      metric.p95Ms > metric.maxMs
    )
      violations.push(`probe_route_invalid:${route}`);
  }
  const maximumRouteLatency = Math.max(
    ...Object.values(report?.routeMetrics ?? {}).map((metric) => Number(metric?.maxMs)),
  );
  if (
    !Number.isFinite(report?.publicP95Ms) ||
    report.publicP95Ms < 0 ||
    !Number.isFinite(maximumRouteLatency) ||
    report.publicP95Ms > maximumRouteLatency
  )
    violations.push("probe_public_p95_invalid");
  return violations;
}

export function validateHotfixPreProbe(report) {
  const violations = probeEnvelopeViolations(report);
  const reported = Array.isArray(report?.violations) ? report.violations : null;
  const acceptedKnownTail =
    report?.outcome === "pause" &&
    report?.routeBudgetsValid === false &&
    JSON.stringify(reported) === JSON.stringify(["route_latency_budget_exceeded:/contato"]) &&
    Object.entries(report?.routeMetrics ?? {}).every(
      ([route, metric]) => route === "/contato" || metric.p95Ms <= 1_500,
    ) &&
    report?.publicP95Ms <= 1_500 &&
    report?.routeMetrics?.["/contato"]?.p50Ms <= 1_500 &&
    report?.routeMetrics?.["/contato"]?.p95Ms > 1_500;
  const acceptedPass =
    report?.outcome === "pass" && report?.routeBudgetsValid === true && reported?.length === 0;
  if (acceptedPass) {
    const strict = validateHotfixFullProbe(report);
    violations.push(...strict.violations);
  } else if (acceptedKnownTail) {
    const normalized = structuredClone(report);
    normalized.routeMetrics["/contato"].p95Ms = 1_500;
    normalized.publicP95Ms = Math.min(report.publicP95Ms, 1_500);
    normalized.routeBudgetsValid = true;
    normalized.outcome = "pass";
    normalized.violations = [];
    const strict = validateHotfixFullProbe(normalized);
    violations.push(...strict.violations.map((item) => `known_tail_${item}`));
  } else {
    violations.push("pre_probe_outcome_refused");
  }
  return { valid: violations.length === 0, violations: [...new Set(violations)] };
}

export function validateHotfixFullProbe(report) {
  const strict = validatePublicBridgeRolloutProbe(report, {
    candidateSha: STAGING_CMS_PUBLIC_HOTFIX.rollbackSha,
    environment: "staging",
    origin: STAGING_CMS_PUBLIC_HOTFIX.origin,
    probeProfile: "full",
  });
  const violations = [...strict.violations, ...probeEnvelopeViolations(report)];
  return { valid: violations.length === 0, violations: [...new Set(violations)] };
}

export function validateCmsPublicHotfixCanary(report, expected = {}) {
  const violations = [];
  const startedAt = normalizedTimestamp(report?.startedAt);
  const completedAt = normalizedTimestamp(report?.completedAt);
  const expectedClassification = {
    promoted: "candidate-receipted",
    restored: "rollback-receipted",
    baseline: "baseline",
  }[report?.outcome];
  if (
    report?.schemaVersion !== 1 ||
    report?.event !== "g12.staging.cms_public_hotfix.cms_public_canary" ||
    report?.projectRef !== STAGING_CMS_PUBLIC_HOTFIX.projectRef ||
    report?.functionUrl !==
      `https://${STAGING_CMS_PUBLIC_HOTFIX.projectRef}.supabase.co/functions/v1/${STAGING_CMS_PUBLIC_HOTFIX.functionSlug}` ||
    report?.origin !== STAGING_CMS_PUBLIC_HOTFIX.origin ||
    !["promoted", "restored", "baseline"].includes(report?.outcome) ||
    report?.classification !== expectedClassification ||
    !SHA256.test(report?.stateSha256 ?? "") ||
    report?.warmupSamples !== 20 ||
    report?.measuredSamples !== 20 ||
    report?.managedPath !== "/contato" ||
    !startedAt ||
    !completedAt ||
    Date.parse(completedAt) < Date.parse(startedAt) ||
    Date.parse(completedAt) - Date.parse(startedAt) > 20 * 60_000
  )
    violations.push("cms_public_canary_identity_invalid");
  if (expected.state && report?.stateSha256 !== canonicalSha256(expected.state))
    violations.push("cms_public_canary_state_mismatch");
  const metrics = report?.managedLatency;
  const latencyBudget =
    report?.outcome === "promoted" ? { p95Ms: 1_500, maxMs: 5_000 } : { p95Ms: 10_000, maxMs: 10_000 };
  if (
    metrics?.samples !== 20 ||
    !Number.isFinite(metrics?.p50Ms) ||
    !Number.isFinite(metrics?.p95Ms) ||
    !Number.isFinite(metrics?.maxMs) ||
    metrics.p50Ms < 0 ||
    metrics.p50Ms > metrics.p95Ms ||
    metrics.p95Ms > metrics.maxMs ||
    metrics.p95Ms > latencyBudget.p95Ms ||
    metrics.maxMs > latencyBudget.maxMs
  )
    violations.push("cms_public_canary_latency_invalid");
  const expectedScenarios = {
    managed: { status: 200, kind: "page", cache: "private, no-store", cors: "*", json: true },
    fallback: {
      status: 200,
      kind: "fallback",
      cache: "public, max-age=0, must-revalidate",
      cors: "*",
      json: true,
    },
    managedRoute: {
      status: 200,
      kind: "route",
      cache: "public, max-age=0, must-revalidate",
      cors: "*",
      json: true,
    },
    legacyHit: {
      status: 200,
      kind: "route",
      cache: "public, max-age=0, must-revalidate",
      cors: "*",
      json: true,
    },
    legacyMiss: { status: 404, kind: "not-found", cache: "no-store", cors: "*", json: true },
    options: { status: 200, kind: "empty", cache: "no-store", cors: "*", json: false },
  };
  if (!sameCanonical(report?.scenarios, expectedScenarios))
    violations.push("cms_public_canary_scenarios_invalid");
  const target = normalizeFunctionTuple(report?.target);
  if (
    target.name !== STAGING_CMS_PUBLIC_HOTFIX.functionSlug ||
    target.slug !== target.name ||
    !UUID.test(target.id) ||
    !SHA256.test(target.bundleSha256)
  )
    violations.push("cms_public_canary_target_invalid");
  if (expected.outcome && report?.outcome !== expected.outcome)
    violations.push("cms_public_canary_outcome_mismatch");
  if (expected.classification && report?.classification !== expected.classification)
    violations.push("cms_public_canary_classification_mismatch");
  if (expected.target && !sameFunctionTuple(target, expected.target))
    violations.push("cms_public_canary_target_mismatch");
  if (expected.minimumStartedAt) {
    const minimum = normalizedTimestamp(expected.minimumStartedAt);
    if (!minimum || !startedAt || Date.parse(startedAt) < Date.parse(minimum))
      violations.push("cms_public_canary_order_invalid");
  }
  if (expected.maximumCompletedAt) {
    const maximum = normalizedTimestamp(expected.maximumCompletedAt);
    if (!maximum || !completedAt || Date.parse(completedAt) > Date.parse(maximum))
      violations.push("cms_public_canary_completion_invalid");
  }
  return { valid: violations.length === 0, violations: [...new Set(violations)] };
}

export function validateTrustedBaselineEvidence({ run, jobs, artifact, probe, inventory, receipt }) {
  const expected = STAGING_CMS_PUBLIC_HOTFIX.trustedBaseline;
  const sourceBaseline = STAGING_CMS_PUBLIC_HOTFIX.sourceBaselineFunction;
  const violations = [];
  const artifactExpiry = normalizedTimestamp(artifact?.expires_at);
  if (
    String(run?.id ?? "") !== expected.runId ||
    Number(run?.run_attempt) !== expected.runAttempt ||
    run?.name !== "Deploy staging" ||
    run?.path !== ".github/workflows/deploy-staging.yml" ||
    run?.event !== "workflow_dispatch" ||
    run?.status !== "completed" ||
    run?.conclusion !== "failure" ||
    run?.head_branch !== "main" ||
    run?.head_sha !== STAGING_CMS_PUBLIC_HOTFIX.rollbackSha ||
    run?.repository?.full_name !== STAGING_CMS_PUBLIC_HOTFIX.repository ||
    run?.head_repository?.full_name !== STAGING_CMS_PUBLIC_HOTFIX.repository ||
    String(run?.actor?.login ?? "").toLowerCase() !== "vnd93" ||
    String(run?.triggering_actor?.login ?? "").toLowerCase() !== "vnd93"
  )
    violations.push("trusted_run_invalid");
  const normalizedJobs = (jobs?.jobs ?? jobs ?? [])
    .map((job) => ({
      name: job.name,
      status: job.status,
      conclusion: job.conclusion,
      runAttempt: job.run_attempt,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  if (
    JSON.stringify(normalizedJobs) !==
    JSON.stringify([
      { name: "deploy", status: "completed", conclusion: "failure", runAttempt: 1 },
      { name: "diagnostic", status: "completed", conclusion: "skipped", runAttempt: 1 },
      { name: "finalize", status: "completed", conclusion: "success", runAttempt: 1 },
    ])
  )
    violations.push("trusted_jobs_invalid");
  if (
    String(artifact?.id ?? "") !== expected.artifactId ||
    artifact?.name !== expected.artifactName ||
    artifact?.digest !== expected.artifactDigest ||
    artifact?.expired !== false ||
    !Number.isSafeInteger(artifact?.size_in_bytes) ||
    artifact.size_in_bytes < 1 ||
    !artifactExpiry ||
    Date.parse(artifactExpiry) <= Date.now() ||
    String(artifact?.workflow_run?.id ?? "") !== expected.runId ||
    artifact?.workflow_run?.head_branch !== "main" ||
    artifact?.workflow_run?.head_sha !== STAGING_CMS_PUBLIC_HOTFIX.rollbackSha
  )
    violations.push("trusted_artifact_invalid");
  const probeResult = validateHotfixFullProbe(probe);
  violations.push(...probeResult.violations.map((item) => `trusted_${item}`));
  const snapshot = functionInventorySnapshot(inventory);
  if (!snapshot.valid) violations.push(...snapshot.violations.map((item) => `trusted_${item}`));
  try {
    assertTrustedBaselineTuple(snapshot.target, sourceBaseline);
  } catch {
    violations.push("trusted_baseline_tuple_invalid");
  }
  const receiptRows = Array.isArray(receipt?.deployments) ? receipt.deployments : [];
  const targetReceipt = receiptRows.filter((row) => row?.name === STAGING_CMS_PUBLIC_HOTFIX.functionSlug);
  if (
    receipt?.schemaVersion !== 1 ||
    receipt?.event !== "g12.staging.functions.deployment_verified" ||
    receipt?.candidateSha !== STAGING_CMS_PUBLIC_HOTFIX.rollbackSha ||
    receipt?.projectRef !== STAGING_CMS_PUBLIC_HOTFIX.projectRef ||
    receipt?.target !== "candidate" ||
    targetReceipt.length !== 1 ||
    targetReceipt[0]?.sourceSha256 !== STAGING_CMS_PUBLIC_HOTFIX.baselineSourceSha256 ||
    targetReceipt[0]?.bundleSha256 !== sourceBaseline.bundleSha256 ||
    targetReceipt[0]?.version !== sourceBaseline.version ||
    targetReceipt[0]?.updatedAt !== sourceBaseline.updatedAt ||
    targetReceipt[0]?.verifyJwt !== false
  )
    violations.push("trusted_function_receipt_invalid");
  return { valid: violations.length === 0, violations: [...new Set(violations)], snapshot };
}

export function validateRecoveredBaselineEvidence({
  run,
  jobs,
  terminalArtifact,
  receiptArtifact,
  terminal,
  probe,
  canary,
  probeProof,
  receipt,
  sourceSnapshot,
  fileDigests,
  key,
}) {
  const expected = STAGING_CMS_PUBLIC_HOTFIX.recoveredBaseline;
  const currentBaseline = STAGING_CMS_PUBLIC_HOTFIX.baselineFunction;
  const sourceBaseline = STAGING_CMS_PUBLIC_HOTFIX.sourceBaselineFunction;
  const violations = [];
  if (
    String(run?.id ?? "") !== expected.runId ||
    Number(run?.run_attempt) !== expected.runAttempt ||
    run?.name !== expected.workflowName ||
    run?.path !== expected.workflowPath ||
    run?.event !== "workflow_dispatch" ||
    run?.status !== "completed" ||
    run?.conclusion !== "success" ||
    run?.head_branch !== "main" ||
    run?.head_sha !== expected.controlSha ||
    run?.repository?.full_name !== STAGING_CMS_PUBLIC_HOTFIX.repository ||
    run?.head_repository?.full_name !== STAGING_CMS_PUBLIC_HOTFIX.repository ||
    String(run?.actor?.login ?? "").toLowerCase() !== "vnd93" ||
    String(run?.triggering_actor?.login ?? "").toLowerCase() !== "vnd93"
  )
    violations.push("recovered_run_invalid");
  const normalizedJobs = (jobs?.jobs ?? jobs ?? [])
    .map((job) => ({
      name: job.name,
      status: job.status,
      conclusion: job.conclusion,
      runAttempt: job.run_attempt,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  if (
    JSON.stringify(normalizedJobs) !==
    JSON.stringify([
      {
        name: expected.jobName,
        status: "completed",
        conclusion: "success",
        runAttempt: expected.runAttempt,
      },
    ])
  )
    violations.push("recovered_jobs_invalid");
  const artifactValid = (artifact, { id, name, digest }) => {
    const expiresAt = normalizedTimestamp(artifact?.expires_at);
    return (
      String(artifact?.id ?? "") === id &&
      artifact?.name === name &&
      artifact?.digest === digest &&
      artifact?.expired === false &&
      Number.isSafeInteger(artifact?.size_in_bytes) &&
      artifact.size_in_bytes > 0 &&
      expiresAt &&
      Date.parse(expiresAt) > Date.now() &&
      String(artifact?.workflow_run?.id ?? "") === expected.runId &&
      artifact?.workflow_run?.head_branch === "main" &&
      artifact?.workflow_run?.head_sha === expected.controlSha
    );
  };
  if (
    !artifactValid(terminalArtifact, {
      id: expected.terminalArtifactId,
      name: expected.terminalArtifactName,
      digest: expected.terminalArtifactDigest,
    })
  )
    violations.push("recovered_terminal_artifact_invalid");
  if (
    !artifactValid(receiptArtifact, {
      id: expected.receiptArtifactId,
      name: expected.receiptArtifactName,
      digest: expected.receiptArtifactDigest,
    })
  )
    violations.push("recovered_receipt_artifact_invalid");

  const source = functionInventorySnapshot(sourceSnapshot?.records ?? []);
  if (
    !source.valid ||
    source.inventorySha256 !== sourceSnapshot?.inventorySha256 ||
    source.nonTargetSha256 !== sourceSnapshot?.nonTargetSha256 ||
    !sameFunctionTuple(source.target, sourceBaseline)
  )
    violations.push("recovered_source_snapshot_invalid");
  const recoveredRecords = source.records.map((record) =>
    record.name === STAGING_CMS_PUBLIC_HOTFIX.functionSlug ? normalizeFunctionTuple(currentBaseline) : record,
  );
  const snapshot = functionInventorySnapshot(recoveredRecords);
  if (!snapshot.valid || !sameFunctionTuple(snapshot.target, currentBaseline))
    violations.push("recovered_inventory_invalid");

  const executor = {
    runId: expected.runId,
    runAttempt: expected.runAttempt,
    runSha: expected.controlSha,
    controlSha: STAGING_CMS_PUBLIC_HOTFIX.recoveryIncident.parentControlSha,
    workflowPath: expected.workflowPath,
  };
  const receiptResult = verifyHotfixReceipt(receipt, key, {
    action: "rollback",
    completedBy: executor,
    stateBaselineFunction: sourceBaseline,
  });
  violations.push(...receiptResult.violations.map((item) => `recovered_${item}`));
  const state = receiptResult.receipt?.state;
  const appliedAt = receiptResult.receipt?.appliedAt;
  if (
    receiptResult.receipt?.workflow?.runId !== STAGING_CMS_PUBLIC_HOTFIX.recoveryIncident.parentRunId ||
    receiptResult.receipt?.workflow?.runAttempt !==
      STAGING_CMS_PUBLIC_HOTFIX.recoveryIncident.parentRunAttempt ||
    receiptResult.receipt?.workflow?.controlSha !==
      STAGING_CMS_PUBLIC_HOTFIX.recoveryIncident.parentControlSha ||
    !sameFunctionTuple(receiptResult.receipt?.after, currentBaseline) ||
    receiptResult.receipt?.nonTargetSha256 !== snapshot.nonTargetSha256
  )
    violations.push("recovered_receipt_identity_invalid");

  for (const [name, value] of Object.entries(fileDigests ?? {}))
    if (!SHA256.test(value ?? "")) violations.push(`recovered_${name}_digest_invalid`);
  const receiptSha256 = safeCanonicalSha256(receipt);
  if (
    terminal?.probeSha256 !== fileDigests?.probe ||
    terminal?.cmsPublicCanarySha256 !== fileDigests?.canary ||
    terminal?.probeProofSha256 !== fileDigests?.probeProof ||
    terminal?.receiptSha256 !== receiptSha256 ||
    terminal?.liveObservation?.nonTargetSha256 !== snapshot.nonTargetSha256
  )
    violations.push("recovered_terminal_chain_invalid");
  const probeResult = validateHotfixFullProbe(probe);
  violations.push(...probeResult.violations.map((item) => `recovered_${item}`));
  const canaryResult = validateCmsPublicHotfixCanary(canary, {
    state,
    outcome: "restored",
    target: currentBaseline,
    minimumStartedAt: appliedAt,
    maximumCompletedAt: terminal?.completedAt,
  });
  violations.push(...canaryResult.violations.map((item) => `recovered_${item}`));
  const proofResult = verifyHotfixProbeProof(probeProof, key, {
    state,
    executor,
    outcome: "restored",
    packageManifestSha256: terminal?.packageManifestSha256,
    probeSha256: fileDigests?.probe,
    cmsPublicCanarySha256: fileDigests?.canary,
    classification: "rollback-receipted",
    nonTargetSha256: snapshot.nonTargetSha256,
    rollbackIntentSha256: receiptResult.receipt?.intentSha256,
    receiptSha256,
    target: currentBaseline,
    minimumStartedAt: appliedAt,
  });
  violations.push(...proofResult.violations.map((item) => `recovered_${item}`));
  const proofCompletedAt = normalizedTimestamp(proofResult.proof?.completedAt);
  const terminalObservedAt = normalizedTimestamp(terminal?.liveObservation?.observedAt);
  if (
    !proofCompletedAt ||
    !terminalObservedAt ||
    Date.parse(terminalObservedAt) < Date.parse(proofCompletedAt)
  )
    violations.push("recovered_terminal_order_invalid");
  const terminalResult = validateHotfixTerminalEvidence(terminal, {
    state,
    stateBaselineFunction: sourceBaseline,
    outcome: "restored",
    packageManifestSha256: state?.recoveryArtifact?.packageManifestSha256,
    probeSha256: fileDigests?.probe,
    cmsPublicCanarySha256: fileDigests?.canary,
    probeProofSha256: fileDigests?.probeProof,
    receiptSha256,
    live: currentBaseline,
  });
  violations.push(...terminalResult.violations.map((item) => `recovered_${item}`));
  return { valid: violations.length === 0, violations: [...new Set(violations)], snapshot };
}

export function buildRecoveryPackageManifest({ baseline, candidate, inventory }) {
  const baselineBody = Buffer.from(baseline.body);
  const candidateBody = Buffer.from(candidate.body);
  const baselineTuple = assertTrustedBaselineTuple(baseline.tuple);
  const snapshot = functionInventorySnapshot(inventory);
  if (!snapshot.valid)
    throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_INVENTORY_REFUSED:${snapshot.violations}`);
  if (!sameFunctionTuple(snapshot.target, baselineTuple))
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_BASELINE_INVENTORY_MISMATCH");
  if (!exactDigest(sha256Bytes(baselineBody), baselineTuple.bundleSha256))
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_BASELINE_PACKAGE_MISMATCH");
  if (!SHA256.test(candidate.sha256) || !exactDigest(sha256Bytes(candidateBody), candidate.sha256))
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_CANDIDATE_PACKAGE_MISMATCH");
  reconcileDownloadedBundleBody(baselineBody, baselineTuple.bundleSha256);
  const candidateBundle = reconcileDownloadedBundleBody(candidateBody, candidate.sha256);
  if (candidate.sourceSha256 !== STAGING_CMS_PUBLIC_HOTFIX.candidateSourceSha256)
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_CANDIDATE_SOURCE_MISMATCH");
  const provenance = validateCandidateBuildProvenance(candidate.provenance, {
    rawEszip: candidateBundle.rawEszip,
  });
  if (!provenance.valid)
    throw new Error(
      `G12_STAGING_CMS_PUBLIC_HOTFIX_CANDIDATE_PROVENANCE_REFUSED:${provenance.violations.join(",")}`,
    );
  return {
    schemaVersion: 1,
    event: "g12.staging.cms_public_hotfix.recovery_package",
    repository: STAGING_CMS_PUBLIC_HOTFIX.repository,
    release: {
      hotfixSha: STAGING_CMS_PUBLIC_HOTFIX.hotfixSha,
      parentSha: STAGING_CMS_PUBLIC_HOTFIX.hotfixParentSha,
      rollbackSha: STAGING_CMS_PUBLIC_HOTFIX.rollbackSha,
    },
    target: { environment: "staging", projectRef: STAGING_CMS_PUBLIC_HOTFIX.projectRef, slug: "cms-public" },
    source: {
      baselineSha256: STAGING_CMS_PUBLIC_HOTFIX.baselineSourceSha256,
      candidateSha256: STAGING_CMS_PUBLIC_HOTFIX.candidateSourceSha256,
      sourceDenoLockSha256: STAGING_CMS_PUBLIC_HOTFIX.sourceDenoLockSha256,
      bundleDenoLockSha256: STAGING_CMS_PUBLIC_HOTFIX.bundleDenoLockSha256,
      bundleDenoLock: structuredClone(CMS_PUBLIC_BUNDLE_LOCK.evidence),
      importMapSha256: STAGING_CMS_PUBLIC_HOTFIX.importMapSha256,
    },
    builder: {
      edgeRuntimeIndexDigest: STAGING_CMS_PUBLIC_HOTFIX.edgeRuntimeIndexDigest,
      edgeRuntimeAmd64Digest: STAGING_CMS_PUBLIC_HOTFIX.edgeRuntimeAmd64Digest,
      lockFrozen: true,
      platform: "linux/amd64",
    },
    baseline: {
      file: "baseline-body.ezbr",
      sha256: sha256Bytes(baselineBody),
      bytes: baselineBody.byteLength,
      tuple: baselineTuple,
    },
    candidate: {
      file: "candidate-body.ezbr",
      sha256: sha256Bytes(candidateBody),
      bytes: candidateBody.byteLength,
      entrypointPath: STAGING_CMS_PUBLIC_HOTFIX.candidateEntrypointPath,
      importMapPath: STAGING_CMS_PUBLIC_HOTFIX.candidateImportMapPath,
      verifyJwt: false,
      bundleDenoLock: structuredClone(CMS_PUBLIC_BUNDLE_LOCK.evidence),
      provenance: candidate.provenance,
    },
    inventory: {
      file: "baseline-inventory.json",
      sha256: snapshot.inventorySha256,
      nonTargetSha256: snapshot.nonTargetSha256,
      count: snapshot.records.length,
    },
  };
}

export function validateRecoveryPackage({ manifest, baselineBody, candidateBody, inventory, buildEvidence }) {
  const violations = [];
  if (
    manifest?.schemaVersion !== 1 ||
    manifest?.event !== "g12.staging.cms_public_hotfix.recovery_package" ||
    manifest?.repository !== STAGING_CMS_PUBLIC_HOTFIX.repository ||
    manifest?.release?.hotfixSha !== STAGING_CMS_PUBLIC_HOTFIX.hotfixSha ||
    manifest?.release?.parentSha !== STAGING_CMS_PUBLIC_HOTFIX.hotfixParentSha ||
    manifest?.release?.rollbackSha !== STAGING_CMS_PUBLIC_HOTFIX.rollbackSha ||
    manifest?.target?.environment !== "staging" ||
    manifest?.target?.projectRef !== STAGING_CMS_PUBLIC_HOTFIX.projectRef ||
    manifest?.target?.slug !== STAGING_CMS_PUBLIC_HOTFIX.functionSlug ||
    manifest?.source?.baselineSha256 !== STAGING_CMS_PUBLIC_HOTFIX.baselineSourceSha256 ||
    manifest?.source?.candidateSha256 !== STAGING_CMS_PUBLIC_HOTFIX.candidateSourceSha256 ||
    manifest?.source?.sourceDenoLockSha256 !== STAGING_CMS_PUBLIC_HOTFIX.sourceDenoLockSha256 ||
    manifest?.source?.bundleDenoLockSha256 !== STAGING_CMS_PUBLIC_HOTFIX.bundleDenoLockSha256 ||
    !sameCanonical(manifest?.source?.bundleDenoLock, CMS_PUBLIC_BUNDLE_LOCK.evidence) ||
    manifest?.source?.importMapSha256 !== STAGING_CMS_PUBLIC_HOTFIX.importMapSha256 ||
    manifest?.builder?.edgeRuntimeIndexDigest !== STAGING_CMS_PUBLIC_HOTFIX.edgeRuntimeIndexDigest ||
    manifest?.builder?.edgeRuntimeAmd64Digest !== STAGING_CMS_PUBLIC_HOTFIX.edgeRuntimeAmd64Digest ||
    manifest?.builder?.lockFrozen !== true ||
    manifest?.builder?.platform !== "linux/amd64" ||
    manifest?.inventory?.file !== "baseline-inventory.json" ||
    manifest?.candidate?.entrypointPath !== STAGING_CMS_PUBLIC_HOTFIX.candidateEntrypointPath ||
    manifest?.candidate?.importMapPath !== STAGING_CMS_PUBLIC_HOTFIX.candidateImportMapPath ||
    manifest?.candidate?.verifyJwt !== false ||
    !sameCanonical(manifest?.candidate?.bundleDenoLock, CMS_PUBLIC_BUNDLE_LOCK.evidence) ||
    manifest?.candidate?.sha256 === manifest?.baseline?.sha256 ||
    !Number.isSafeInteger(manifest?.baseline?.bytes) ||
    manifest.baseline.bytes < 32 ||
    manifest.baseline.bytes > STAGING_CMS_PUBLIC_HOTFIX.maximumWireBundleBytes ||
    !Number.isSafeInteger(manifest?.candidate?.bytes) ||
    manifest.candidate.bytes < 32 ||
    manifest.candidate.bytes > STAGING_CMS_PUBLIC_HOTFIX.maximumWireBundleBytes
  )
    violations.push("package_identity_invalid");
  const snapshot = functionInventorySnapshot(inventory);
  if (!snapshot.valid) violations.push(...snapshot.violations);
  if (manifest?.inventory?.count !== snapshot.records.length)
    violations.push("package_inventory_count_invalid");
  if (manifest?.inventory?.sha256 !== snapshot.inventorySha256)
    violations.push("package_inventory_digest_invalid");
  if (manifest?.inventory?.nonTargetSha256 !== snapshot.nonTargetSha256)
    violations.push("package_non_target_digest_invalid");
  const bodies = [
    ["baseline", Buffer.from(baselineBody)],
    ["candidate", Buffer.from(candidateBody)],
  ];
  for (const [name, body] of bodies) {
    if (
      manifest?.[name]?.file !== `${name}-body.ezbr` ||
      manifest?.[name]?.sha256 !== sha256Bytes(body) ||
      manifest?.[name]?.bytes !== body.byteLength ||
      !body.subarray(0, EZBR_MAGIC.byteLength).equals(EZBR_MAGIC)
    )
      violations.push(`package_${name}_body_invalid`);
    try {
      reconcileDownloadedBundleBody(body, manifest?.[name]?.sha256);
    } catch {
      violations.push(`package_${name}_eszip_invalid`);
    }
  }
  try {
    const candidateBundle = reconcileDownloadedBundleBody(
      Buffer.from(candidateBody),
      manifest?.candidate?.sha256,
    );
    const provenance = validateCandidateBuildProvenance(manifest?.candidate?.provenance, {
      rawEszip: candidateBundle.rawEszip,
    });
    if (!provenance.valid) violations.push(...provenance.violations.map((item) => `package_${item}`));
  } catch {
    violations.push("package_candidate_provenance_invalid");
  }
  const buildEvidenceResult = validateCandidateBuildEvidenceFiles(
    manifest?.candidate?.provenance,
    buildEvidence,
  );
  if (!buildEvidenceResult.valid)
    violations.push(...buildEvidenceResult.violations.map((item) => `package_${item}`));
  try {
    assertTrustedBaselineTuple(manifest?.baseline?.tuple);
  } catch {
    violations.push("package_baseline_tuple_invalid");
  }
  if (!sameFunctionTuple(snapshot.target, manifest?.baseline?.tuple))
    violations.push("package_baseline_inventory_mismatch");
  return { valid: violations.length === 0, violations: [...new Set(violations)], snapshot };
}

export function buildHotfixRecoveryState({ workflow, artifact, manifest }) {
  const state = {
    schemaVersion: 1,
    event: "g12.staging.cms_public_hotfix.prepared",
    workflow: {
      runId: String(workflow?.runId ?? ""),
      runAttempt: Number(workflow?.runAttempt),
      controlSha: String(workflow?.controlSha ?? ""),
      path: STAGING_CMS_PUBLIC_HOTFIX.workflowPath,
    },
    release: manifest.release,
    target: manifest.target,
    trustedBaseline: STAGING_CMS_PUBLIC_HOTFIX.trustedBaseline,
    recoveryArtifact: {
      id: String(artifact?.id ?? ""),
      name: String(artifact?.name ?? ""),
      digest: String(artifact?.digest ?? ""),
      packageManifestSha256: canonicalSha256(manifest),
    },
    baseline: {
      sourceSha256: manifest.source.baselineSha256,
      bodySha256: manifest.baseline.sha256,
      tuple: manifest.baseline.tuple,
      inventorySha256: manifest.inventory.sha256,
      nonTargetSha256: manifest.inventory.nonTargetSha256,
    },
    candidate: {
      sourceSha256: manifest.source.candidateSha256,
      bodySha256: manifest.candidate.sha256,
      entrypointPath: manifest.candidate.entrypointPath,
      importMapPath: manifest.candidate.importMapPath,
      verifyJwt: false,
      edgeRuntimeAmd64Digest: manifest.builder.edgeRuntimeAmd64Digest,
      lockFrozen: manifest.builder.lockFrozen,
    },
  };
  const result = validateHotfixRecoveryState(state);
  if (!result.valid)
    throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_STATE_REFUSED:${result.violations.join(",")}`);
  return state;
}

export function validateHotfixRecoveryState(state, expected = {}) {
  const violations = [];
  const baselineFunction = expected.baselineFunction ?? STAGING_CMS_PUBLIC_HOTFIX.baselineFunction;
  if (
    state?.schemaVersion !== 1 ||
    state?.event !== "g12.staging.cms_public_hotfix.prepared" ||
    typeof state?.workflow?.runId !== "string" ||
    !POSITIVE_INTEGER.test(state.workflow.runId) ||
    !Number.isSafeInteger(state?.workflow?.runAttempt) ||
    state.workflow.runAttempt < 1 ||
    !FULL_SHA.test(state?.workflow?.controlSha ?? "") ||
    state?.workflow?.path !== STAGING_CMS_PUBLIC_HOTFIX.workflowPath ||
    state?.release?.hotfixSha !== STAGING_CMS_PUBLIC_HOTFIX.hotfixSha ||
    state?.release?.parentSha !== STAGING_CMS_PUBLIC_HOTFIX.hotfixParentSha ||
    state?.release?.rollbackSha !== STAGING_CMS_PUBLIC_HOTFIX.rollbackSha ||
    state?.target?.environment !== "staging" ||
    state?.target?.projectRef !== STAGING_CMS_PUBLIC_HOTFIX.projectRef ||
    state?.target?.slug !== STAGING_CMS_PUBLIC_HOTFIX.functionSlug ||
    JSON.stringify(state?.trustedBaseline) !== JSON.stringify(STAGING_CMS_PUBLIC_HOTFIX.trustedBaseline) ||
    typeof state?.recoveryArtifact?.id !== "string" ||
    !POSITIVE_INTEGER.test(state.recoveryArtifact.id) ||
    state?.recoveryArtifact?.name !==
      `staging-cms-public-hotfix-recovery-${state?.workflow?.runId}-${state?.workflow?.runAttempt}` ||
    !/^sha256:[a-f0-9]{64}$/.test(state?.recoveryArtifact?.digest ?? "") ||
    !SHA256.test(state?.recoveryArtifact?.packageManifestSha256 ?? "") ||
    state?.baseline?.sourceSha256 !== STAGING_CMS_PUBLIC_HOTFIX.baselineSourceSha256 ||
    state?.baseline?.bodySha256 !== baselineFunction.bundleSha256 ||
    state?.candidate?.sourceSha256 !== STAGING_CMS_PUBLIC_HOTFIX.candidateSourceSha256 ||
    !SHA256.test(state?.candidate?.bodySha256 ?? "") ||
    state?.candidate?.bodySha256 === state?.baseline?.bodySha256 ||
    state?.candidate?.entrypointPath !== STAGING_CMS_PUBLIC_HOTFIX.candidateEntrypointPath ||
    state?.candidate?.importMapPath !== STAGING_CMS_PUBLIC_HOTFIX.candidateImportMapPath ||
    state?.candidate?.verifyJwt !== false ||
    state?.candidate?.edgeRuntimeAmd64Digest !== STAGING_CMS_PUBLIC_HOTFIX.edgeRuntimeAmd64Digest ||
    state?.candidate?.lockFrozen !== true
  )
    violations.push("state_identity_invalid");
  try {
    assertTrustedBaselineTuple(state?.baseline?.tuple, baselineFunction);
  } catch {
    violations.push("state_baseline_invalid");
  }
  if (
    !SHA256.test(state?.baseline?.inventorySha256 ?? "") ||
    !SHA256.test(state?.baseline?.nonTargetSha256 ?? "")
  )
    violations.push("state_inventory_invalid");
  if (expected.runId && String(state?.workflow?.runId) !== String(expected.runId))
    violations.push("state_run_id_mismatch");
  if (expected.runAttempt && Number(state?.workflow?.runAttempt) !== Number(expected.runAttempt))
    violations.push("state_run_attempt_mismatch");
  if (expected.controlSha && state?.workflow?.controlSha !== expected.controlSha)
    violations.push("state_control_sha_mismatch");
  return { valid: violations.length === 0, violations: [...new Set(violations)] };
}

function expectedIntentTuple(action, state, before) {
  const baseline = normalizeFunctionTuple(state?.baseline?.tuple);
  if (action === "candidate") {
    return {
      ...baseline,
      version: baseline.version + 1,
      bundleSha256: state?.candidate?.bodySha256,
      updatedAt: "",
      entrypointPath: state?.candidate?.entrypointPath,
      importMap: true,
      importMapPath: state?.candidate?.importMapPath,
      verifyJwt: false,
    };
  }
  return { ...baseline, version: Number(before?.version) + 1, updatedAt: "" };
}

function tupleMatchesIntentShape(actual, expected) {
  const value = normalizeFunctionTuple(actual);
  const target = normalizeFunctionTuple(expected);
  return (
    value.id === target.id &&
    value.name === target.name &&
    value.slug === target.slug &&
    value.status === target.status &&
    value.verifyJwt === target.verifyJwt &&
    value.version === target.version &&
    value.bundleSha256 === target.bundleSha256 &&
    value.createdAt === target.createdAt &&
    value.entrypointPath === target.entrypointPath &&
    value.importMap === target.importMap &&
    value.importMapPath === target.importMapPath
  );
}

function candidateTupleMatches(actual, state) {
  const baseline = normalizeFunctionTuple(state?.baseline?.tuple);
  const expected = expectedIntentTuple("candidate", state, baseline);
  const value = normalizeFunctionTuple(actual);
  return (
    tupleMatchesIntentShape(value, expected) &&
    Boolean(value.updatedAt) &&
    Date.parse(value.updatedAt) > Date.parse(baseline.updatedAt)
  );
}

function validateIntentPayload(intent, { state, action, live, preparedBy } = {}) {
  const violations = [];
  const boundState = intent?.state ?? state;
  const stateResult = validateHotfixRecoveryState(boundState);
  if (!stateResult.valid) violations.push(...stateResult.violations.map((item) => "intent_" + item));
  if (state && (!intent?.state || !sameCanonical(intent.state, state)))
    violations.push("intent_state_mismatch");
  const selectedAction = intent?.action;
  if (
    intent?.schemaVersion !== 1 ||
    intent?.event !== "g12.staging.cms_public_hotfix." + selectedAction + "_intent" ||
    !["candidate", "rollback"].includes(selectedAction) ||
    (action && selectedAction !== action) ||
    intent?.workflow?.runId !== boundState?.workflow?.runId ||
    intent?.workflow?.runAttempt !== boundState?.workflow?.runAttempt ||
    intent?.workflow?.controlSha !== boundState?.workflow?.controlSha ||
    !sameCanonical(intent?.workflow, boundState?.workflow) ||
    intent?.projectRef !== STAGING_CMS_PUBLIC_HOTFIX.projectRef ||
    intent?.slug !== STAGING_CMS_PUBLIC_HOTFIX.functionSlug ||
    !POSITIVE_INTEGER.test(String(intent?.preparedBy?.runId ?? "")) ||
    !Number.isSafeInteger(intent?.preparedBy?.runAttempt) ||
    intent.preparedBy.runAttempt < 1 ||
    !FULL_SHA.test(intent?.preparedBy?.runSha ?? "") ||
    intent?.preparedBy?.controlSha !== boundState?.workflow?.controlSha ||
    ![STAGING_CMS_PUBLIC_HOTFIX.workflowPath, STAGING_CMS_PUBLIC_HOTFIX.watchdogPath].includes(
      intent?.preparedBy?.workflowPath,
    ) ||
    !normalizedTimestamp(intent?.preparedAt)
  )
    violations.push("intent_identity_invalid");
  if (
    preparedBy &&
    (String(intent?.preparedBy?.runId) !== String(preparedBy.runId) ||
      Number(intent?.preparedBy?.runAttempt) !== Number(preparedBy.runAttempt) ||
      intent?.preparedBy?.runSha !== preparedBy.runSha ||
      intent?.preparedBy?.controlSha !== preparedBy.controlSha ||
      intent?.preparedBy?.workflowPath !== preparedBy.workflowPath)
  )
    violations.push("intent_preparer_mismatch");
  if (
    selectedAction === "candidate" &&
    (intent?.preparedBy?.workflowPath !== STAGING_CMS_PUBLIC_HOTFIX.workflowPath ||
      String(intent?.preparedBy?.runId) !== String(boundState?.workflow?.runId) ||
      Number(intent?.preparedBy?.runAttempt) !== Number(boundState?.workflow?.runAttempt) ||
      intent?.preparedBy?.runSha !== boundState?.workflow?.controlSha)
  )
    violations.push("intent_candidate_role_invalid");
  const before = normalizeFunctionTuple(intent?.before);
  const expected = normalizeFunctionTuple(intent?.expected);
  if (selectedAction === "candidate") {
    if (!sameFunctionTuple(before, boundState?.baseline?.tuple))
      violations.push("intent_candidate_before_invalid");
    if (!tupleMatchesIntentShape(expected, expectedIntentTuple("candidate", boundState, before)))
      violations.push("intent_candidate_expected_invalid");
  } else if (selectedAction === "rollback") {
    if (!candidateTupleMatches(before, boundState)) violations.push("intent_rollback_before_invalid");
    if (!tupleMatchesIntentShape(expected, expectedIntentTuple("rollback", boundState, before)))
      violations.push("intent_rollback_expected_invalid");
  }
  if (live && !sameFunctionTuple(before, live)) violations.push("intent_live_mismatch");
  return { valid: violations.length === 0, violations: [...new Set(violations)] };
}

export function sealHotfixIntent(intent, key) {
  const result = validateIntentPayload(intent);
  if (!result.valid)
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_INTENT_REFUSED:" + result.violations.join(","));
  const unsigned = {
    schemaVersion: 1,
    event: intent.event,
    workflow: intent.workflow,
    intent,
    intentSha256: canonicalSha256(intent),
  };
  return { ...unsigned, hmacSha256: hmac(unsigned, key) };
}

export function verifyHotfixIntent(wrapper, key, expected = {}) {
  const violations = [];
  const { hmacSha256, ...unsigned } = wrapper && typeof wrapper === "object" ? wrapper : {};
  if (
    unsigned?.schemaVersion !== 1 ||
    unsigned?.event !== unsigned?.intent?.event ||
    !sameCanonical(unsigned?.workflow, unsigned?.intent?.workflow) ||
    !exactDigest(unsigned?.intentSha256, safeCanonicalSha256(unsigned?.intent))
  )
    violations.push("intent_wrapper_invalid");
  let expectedHmac = "";
  try {
    expectedHmac = hmac(unsigned, key);
  } catch {
    violations.push("intent_hmac_key_invalid");
  }
  if (!exactDigest(hmacSha256, expectedHmac)) violations.push("intent_hmac_invalid");
  const payload = validateIntentPayload(unsigned?.intent, expected);
  violations.push(...payload.violations);
  return {
    valid: violations.length === 0,
    violations: [...new Set(violations)],
    intent: unsigned?.intent,
  };
}

export function classifyHotfixLiveState({
  state,
  inventory,
  candidateIntent,
  rollbackIntent,
  candidateReceipt,
  rollbackReceipt,
}) {
  const stateResult = validateHotfixRecoveryState(state);
  if (!stateResult.valid) return { classification: "state-invalid", violations: stateResult.violations };
  const snapshot = functionInventorySnapshot(inventory);
  if (!snapshot.valid) return { classification: "external-drift", violations: snapshot.violations };
  if (snapshot.nonTargetSha256 !== state.baseline.nonTargetSha256)
    return { classification: "external-drift", violations: ["non_target_inventory_changed"] };
  const live = snapshot.target;
  const baseline = normalizeFunctionTuple(state.baseline.tuple);
  let verifiedCandidateIntent;
  if (candidateIntent) {
    verifiedCandidateIntent = verifyHotfixIntent(
      candidateIntent.wrapper ?? candidateIntent,
      candidateIntent.key,
      { state, action: "candidate" },
    );
    if (!verifiedCandidateIntent.valid)
      return {
        classification: "candidate-intent-invalid",
        violations: verifiedCandidateIntent.violations,
        snapshot,
      };
  }
  let verifiedRollbackIntent;
  if (rollbackIntent) {
    verifiedRollbackIntent = verifyHotfixIntent(
      rollbackIntent.wrapper ?? rollbackIntent,
      rollbackIntent.key,
      { state, action: "rollback" },
    );
    if (!verifiedRollbackIntent.valid)
      return {
        classification: "rollback-intent-invalid",
        violations: verifiedRollbackIntent.violations,
        snapshot,
      };
  }
  if (sameFunctionTuple(live, baseline))
    return {
      classification: rollbackIntent
        ? "baseline-with-rollback-intent"
        : candidateIntent
          ? "baseline-with-candidate-intent"
          : "baseline",
      violations: [],
      snapshot,
    };

  const baseIdentityMatches =
    live.id === baseline.id &&
    live.name === baseline.name &&
    live.slug === baseline.slug &&
    live.createdAt === baseline.createdAt;
  const candidateExact =
    baseIdentityMatches &&
    live.version === baseline.version + 1 &&
    live.bundleSha256 === state.candidate.bodySha256 &&
    live.status === "ACTIVE" &&
    live.verifyJwt === false &&
    live.importMap === true &&
    live.entrypointPath === state.candidate.entrypointPath &&
    live.importMapPath === state.candidate.importMapPath &&
    Date.parse(live.updatedAt) > Date.parse(baseline.updatedAt);
  if (candidateExact) {
    if (!candidateIntent)
      return {
        classification: "external-drift",
        violations: ["candidate_intent_missing"],
        snapshot,
      };
    if (candidateReceipt) {
      const receipt = verifyHotfixReceipt(
        candidateReceipt.wrapper ?? candidateReceipt,
        candidateReceipt.key,
        {
          state,
          action: "candidate",
          intent: candidateIntent.wrapper ?? candidateIntent,
          live,
        },
      );
      if (!receipt.valid)
        return { classification: "candidate-receipt-invalid", violations: receipt.violations, snapshot };
    }
    return {
      classification: rollbackIntent
        ? "candidate-with-rollback-intent"
        : candidateReceipt
          ? "candidate-receipted"
          : "candidate-intended",
      violations: [],
      snapshot,
    };
  }

  const rollbackExactShape =
    baseIdentityMatches &&
    live.version === baseline.version + 2 &&
    live.bundleSha256 === baseline.bundleSha256 &&
    live.status === baseline.status &&
    live.verifyJwt === baseline.verifyJwt &&
    live.importMap === baseline.importMap &&
    live.entrypointPath === baseline.entrypointPath &&
    live.importMapPath === baseline.importMapPath &&
    Date.parse(live.updatedAt) > Date.parse(baseline.updatedAt);
  if (rollbackExactShape) {
    if (!rollbackIntent)
      return {
        classification: "ambiguous-after-rollback",
        violations: ["rollback_intent_missing"],
        snapshot,
      };
    if (!rollbackReceipt) return { classification: "rollback-intended", violations: [], snapshot };
    const receipt = verifyHotfixReceipt(rollbackReceipt.wrapper ?? rollbackReceipt, rollbackReceipt.key, {
      state,
      action: "rollback",
      intent: rollbackIntent.wrapper ?? rollbackIntent,
      live,
    });
    return receipt.valid
      ? { classification: "rollback-receipted", violations: [], snapshot }
      : { classification: "rollback-receipt-invalid", violations: receipt.violations, snapshot };
  }
  return { classification: "external-drift", violations: ["target_tuple_unowned"], snapshot };
}

function validateReceiptPayload(
  receipt,
  { state, action, intent, live, completedBy, stateBaselineFunction } = {},
) {
  const violations = [];
  const stateResult = validateHotfixRecoveryState(receipt?.state ?? state, {
    baselineFunction: stateBaselineFunction,
  });
  if (!stateResult.valid) violations.push(...stateResult.violations.map((item) => `receipt_${item}`));
  const boundState = receipt?.state ?? state;
  if (state && (!receipt?.state || !sameCanonical(receipt.state, state)))
    violations.push("receipt_state_mismatch");
  if (
    receipt?.schemaVersion !== 1 ||
    receipt?.event !== `g12.staging.cms_public_hotfix.${receipt?.action}_applied` ||
    !["candidate", "rollback"].includes(receipt?.action) ||
    (action && receipt?.action !== action) ||
    receipt?.workflow?.runId !== boundState?.workflow?.runId ||
    receipt?.workflow?.runAttempt !== boundState?.workflow?.runAttempt ||
    receipt?.workflow?.controlSha !== boundState?.workflow?.controlSha ||
    !sameCanonical(receipt?.workflow, boundState?.workflow) ||
    receipt?.projectRef !== STAGING_CMS_PUBLIC_HOTFIX.projectRef ||
    receipt?.slug !== STAGING_CMS_PUBLIC_HOTFIX.functionSlug ||
    !SHA256.test(receipt?.intentSha256 ?? "") ||
    !normalizedTimestamp(receipt?.intentPreparedAt) ||
    !POSITIVE_INTEGER.test(String(receipt?.preparedBy?.runId ?? "")) ||
    !Number.isSafeInteger(receipt?.preparedBy?.runAttempt) ||
    receipt.preparedBy.runAttempt < 1 ||
    !FULL_SHA.test(receipt?.preparedBy?.runSha ?? "") ||
    receipt?.preparedBy?.controlSha !== boundState?.workflow?.controlSha ||
    ![STAGING_CMS_PUBLIC_HOTFIX.workflowPath, STAGING_CMS_PUBLIC_HOTFIX.watchdogPath].includes(
      receipt?.preparedBy?.workflowPath,
    ) ||
    !POSITIVE_INTEGER.test(String(receipt?.completedBy?.runId ?? "")) ||
    !Number.isSafeInteger(receipt?.completedBy?.runAttempt) ||
    receipt.completedBy.runAttempt < 1 ||
    !FULL_SHA.test(receipt?.completedBy?.runSha ?? "") ||
    receipt?.completedBy?.controlSha !== boundState?.workflow?.controlSha ||
    ![STAGING_CMS_PUBLIC_HOTFIX.workflowPath, STAGING_CMS_PUBLIC_HOTFIX.watchdogPath].includes(
      receipt?.completedBy?.workflowPath,
    ) ||
    !["patched", "reconciled"].includes(receipt?.completionMode) ||
    receipt?.nonTargetSha256 !== boundState?.baseline?.nonTargetSha256 ||
    !normalizedTimestamp(receipt?.appliedAt)
  )
    violations.push("receipt_identity_invalid");
  if (
    completedBy &&
    (String(receipt?.completedBy?.runId) !== String(completedBy.runId) ||
      Number(receipt?.completedBy?.runAttempt) !== Number(completedBy.runAttempt) ||
      receipt?.completedBy?.runSha !== completedBy.runSha ||
      receipt?.completedBy?.controlSha !== completedBy.controlSha ||
      receipt?.completedBy?.workflowPath !== completedBy.workflowPath)
  )
    violations.push("receipt_completer_mismatch");
  if (intent) {
    if (receipt?.intentSha256 !== safeCanonicalSha256(intent)) violations.push("receipt_intent_mismatch");
    const intentPayload = intent?.intent ?? intent;
    if (
      intentPayload?.action !== receipt?.action ||
      !sameCanonical(intentPayload?.workflow, receipt?.workflow) ||
      !sameCanonical(intentPayload?.preparedBy, receipt?.preparedBy) ||
      normalizedTimestamp(intentPayload?.preparedAt) !== normalizedTimestamp(receipt?.intentPreparedAt) ||
      Date.parse(receipt?.appliedAt ?? "") < Date.parse(intentPayload?.preparedAt ?? "")
    )
      violations.push("receipt_intent_order_invalid");
  }
  const before = normalizeFunctionTuple(receipt?.before);
  const after = normalizeFunctionTuple(receipt?.after);
  if (receipt?.action === "candidate") {
    if (
      receipt?.completionMode !== "patched" ||
      !sameCanonical(receipt?.completedBy, receipt?.preparedBy) ||
      receipt?.preparedBy?.workflowPath !== STAGING_CMS_PUBLIC_HOTFIX.workflowPath ||
      receipt?.completedBy?.workflowPath !== STAGING_CMS_PUBLIC_HOTFIX.workflowPath ||
      String(receipt?.completedBy?.runId) !== String(boundState?.workflow?.runId) ||
      Number(receipt?.completedBy?.runAttempt) !== Number(boundState?.workflow?.runAttempt) ||
      receipt?.completedBy?.runSha !== boundState?.workflow?.controlSha
    )
      violations.push("receipt_candidate_executor_invalid");
    if (!sameFunctionTuple(before, boundState?.baseline?.tuple)) violations.push("receipt_before_invalid");
    if (
      after.id !== before.id ||
      after.name !== before.name ||
      after.slug !== before.slug ||
      after.status !== "ACTIVE" ||
      after.createdAt !== before.createdAt ||
      after.version !== before.version + 1 ||
      after.bundleSha256 !== boundState?.candidate?.bodySha256 ||
      after.entrypointPath !== boundState?.candidate?.entrypointPath ||
      after.importMapPath !== boundState?.candidate?.importMapPath ||
      after.importMap !== true ||
      after.verifyJwt !== false ||
      Date.parse(after.updatedAt) <= Date.parse(before.updatedAt)
    )
      violations.push("receipt_candidate_after_invalid");
  } else if (receipt?.action === "rollback") {
    if (!["patched", "reconciled"].includes(receipt?.completionMode))
      violations.push("receipt_rollback_completion_invalid");
    const baseline = normalizeFunctionTuple(boundState?.baseline?.tuple);
    if (
      before.id !== baseline.id ||
      before.name !== baseline.name ||
      before.slug !== baseline.slug ||
      before.status !== "ACTIVE" ||
      before.createdAt !== baseline.createdAt ||
      before.version !== baseline.version + 1 ||
      before.bundleSha256 !== boundState?.candidate?.bodySha256 ||
      before.entrypointPath !== boundState?.candidate?.entrypointPath ||
      before.importMapPath !== boundState?.candidate?.importMapPath ||
      before.importMap !== true ||
      before.verifyJwt !== false ||
      Date.parse(before.updatedAt) <= Date.parse(baseline.updatedAt)
    )
      violations.push("receipt_rollback_before_invalid");
    if (
      after.version !== before.version + 1 ||
      after.bundleSha256 !== baseline.bundleSha256 ||
      !sameFunctionTuple(after, baseline, { ignoreVersion: true, ignoreUpdatedAt: true }) ||
      Date.parse(after.updatedAt) <= Date.parse(before.updatedAt)
    )
      violations.push("receipt_rollback_after_invalid");
  }
  if (live && !sameFunctionTuple(after, live)) violations.push("receipt_live_mismatch");
  return { valid: violations.length === 0, violations: [...new Set(violations)] };
}

export function sealHotfixReceipt(receipt, key, expected = {}) {
  const result = validateReceiptPayload(receipt, expected);
  if (!result.valid)
    throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_RECEIPT_REFUSED:${result.violations.join(",")}`);
  const unsigned = {
    schemaVersion: 1,
    event: "g12.staging.cms_public_hotfix.receipt.sealed",
    receipt,
    receiptSha256: canonicalSha256(receipt),
  };
  return { ...unsigned, hmacSha256: hmac(unsigned, key) };
}

export function verifyHotfixReceipt(wrapper, key, expected = {}) {
  const violations = [];
  const { hmacSha256, ...unsigned } = wrapper && typeof wrapper === "object" ? wrapper : {};
  if (
    unsigned?.schemaVersion !== 1 ||
    unsigned?.event !== "g12.staging.cms_public_hotfix.receipt.sealed" ||
    !exactDigest(unsigned?.receiptSha256, safeCanonicalSha256(unsigned?.receipt))
  )
    violations.push("receipt_wrapper_invalid");
  let expectedHmac = "";
  try {
    expectedHmac = hmac(unsigned, key);
  } catch {
    violations.push("receipt_hmac_key_invalid");
  }
  if (!exactDigest(hmacSha256, expectedHmac)) violations.push("receipt_hmac_invalid");
  const payload = validateReceiptPayload(unsigned?.receipt, expected);
  violations.push(...payload.violations);
  return { valid: violations.length === 0, violations: [...new Set(violations)], receipt: unsigned?.receipt };
}

function validateProbeProofPayload(proof, expected = {}) {
  const violations = [];
  const startedAt = normalizedTimestamp(proof?.startedAt);
  const completedAt = normalizedTimestamp(proof?.completedAt);
  const expectedClassification = {
    promoted: "candidate-receipted",
    restored: "rollback-receipted",
    baseline: "baseline",
  }[proof?.outcome];
  if (
    proof?.schemaVersion !== 1 ||
    proof?.event !== "g12.staging.cms_public_hotfix.probe_verified" ||
    proof?.mode !== "full" ||
    !["promoted", "restored", "baseline"].includes(proof?.outcome) ||
    proof?.classification !== expectedClassification ||
    !POSITIVE_INTEGER.test(String(proof?.executor?.runId ?? "")) ||
    !Number.isSafeInteger(proof?.executor?.runAttempt) ||
    proof.executor.runAttempt < 1 ||
    !FULL_SHA.test(proof?.executor?.runSha ?? "") ||
    !FULL_SHA.test(proof?.executor?.controlSha ?? "") ||
    ![STAGING_CMS_PUBLIC_HOTFIX.workflowPath, STAGING_CMS_PUBLIC_HOTFIX.watchdogPath].includes(
      proof?.executor?.workflowPath,
    ) ||
    !SHA256.test(proof?.stateSha256 ?? "") ||
    !SHA256.test(proof?.packageManifestSha256 ?? "") ||
    !SHA256.test(proof?.probeSha256 ?? "") ||
    !SHA256.test(proof?.cmsPublicCanarySha256 ?? "") ||
    !SHA256.test(proof?.nonTargetSha256 ?? "") ||
    !startedAt ||
    !completedAt ||
    Date.parse(completedAt) < Date.parse(startedAt) ||
    Date.parse(completedAt) - Date.parse(startedAt) > 20 * 60_000
  )
    violations.push("probe_proof_identity_invalid");
  const target = normalizeFunctionTuple(proof?.target);
  if (
    target.name !== STAGING_CMS_PUBLIC_HOTFIX.functionSlug ||
    target.slug !== target.name ||
    !UUID.test(target.id) ||
    !SHA256.test(target.bundleSha256) ||
    !target.updatedAt
  )
    violations.push("probe_proof_target_invalid");
  if (
    proof?.outcome === "baseline" &&
    (proof?.candidateIntentSha256 !== null ||
      proof?.rollbackIntentSha256 !== null ||
      proof?.receiptSha256 !== null)
  )
    violations.push("probe_proof_baseline_chain_invalid");
  if (
    proof?.outcome === "promoted" &&
    (!SHA256.test(proof?.candidateIntentSha256 ?? "") ||
      proof?.rollbackIntentSha256 !== null ||
      !SHA256.test(proof?.receiptSha256 ?? ""))
  )
    violations.push("probe_proof_candidate_chain_invalid");
  if (
    proof?.outcome === "promoted" &&
    (proof?.executor?.workflowPath !== STAGING_CMS_PUBLIC_HOTFIX.workflowPath ||
      String(proof?.executor?.runId) !== String(proof?.workflow?.runId) ||
      Number(proof?.executor?.runAttempt) !== Number(proof?.workflow?.runAttempt) ||
      proof?.executor?.runSha !== proof?.workflow?.controlSha)
  )
    violations.push("probe_proof_candidate_role_invalid");
  if (
    proof?.outcome === "restored" &&
    (!SHA256.test(proof?.candidateIntentSha256 ?? "") ||
      !SHA256.test(proof?.rollbackIntentSha256 ?? "") ||
      !SHA256.test(proof?.receiptSha256 ?? ""))
  )
    violations.push("probe_proof_rollback_chain_invalid");
  if (expected.state) {
    if (proof?.stateSha256 !== canonicalSha256(expected.state)) violations.push("probe_proof_state_mismatch");
    if (!sameCanonical(proof?.workflow, expected.state?.workflow))
      violations.push("probe_proof_workflow_mismatch");
    if (proof?.executor?.controlSha !== expected.state?.workflow?.controlSha)
      violations.push("probe_proof_executor_control_sha_mismatch");
  }
  if (expected.executor && !sameCanonical(proof?.executor, expected.executor))
    violations.push("probe_proof_executor_mismatch");
  for (const [name, value] of [
    ["outcome", expected.outcome],
    ["packageManifestSha256", expected.packageManifestSha256],
    ["probeSha256", expected.probeSha256],
    ["cmsPublicCanarySha256", expected.cmsPublicCanarySha256],
    ["classification", expected.classification],
    ["nonTargetSha256", expected.nonTargetSha256],
    ["candidateIntentSha256", expected.candidateIntentSha256],
    ["rollbackIntentSha256", expected.rollbackIntentSha256],
    ["receiptSha256", expected.receiptSha256],
  ])
    if (value !== undefined && proof?.[name] !== value)
      violations.push(
        `probe_proof_${name.replaceAll(/[A-Z]/g, (character) => `_${character.toLowerCase()}`)}_mismatch`,
      );
  if (expected.target && !sameFunctionTuple(proof?.target, expected.target))
    violations.push("probe_proof_target_mismatch");
  if (expected.minimumStartedAt) {
    const minimum = normalizedTimestamp(expected.minimumStartedAt);
    if (!minimum || !startedAt || Date.parse(startedAt) < Date.parse(minimum))
      violations.push("probe_proof_order_invalid");
  }
  return { valid: violations.length === 0, violations: [...new Set(violations)] };
}

export function sealHotfixProbeProof(proof, key) {
  const result = validateProbeProofPayload(proof);
  if (!result.valid)
    throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_PROBE_PROOF_REFUSED:${result.violations.join(",")}`);
  const unsigned = {
    schemaVersion: 1,
    event: "g12.staging.cms_public_hotfix.probe_proof.sealed",
    proof,
    proofSha256: canonicalSha256(proof),
  };
  return { ...unsigned, hmacSha256: hmac(unsigned, key) };
}

export function verifyHotfixProbeProof(wrapper, key, expected = {}) {
  const violations = [];
  const { hmacSha256, ...unsigned } = wrapper && typeof wrapper === "object" ? wrapper : {};
  if (
    unsigned?.schemaVersion !== 1 ||
    unsigned?.event !== "g12.staging.cms_public_hotfix.probe_proof.sealed" ||
    !exactDigest(unsigned?.proofSha256, safeCanonicalSha256(unsigned?.proof))
  )
    violations.push("probe_proof_wrapper_invalid");
  let expectedHmac = "";
  try {
    expectedHmac = hmac(unsigned, key);
  } catch {
    violations.push("probe_proof_hmac_key_invalid");
  }
  if (!exactDigest(hmacSha256, expectedHmac)) violations.push("probe_proof_hmac_invalid");
  const payload = validateProbeProofPayload(unsigned?.proof, expected);
  violations.push(...payload.violations);
  return {
    valid: violations.length === 0,
    violations: [...new Set(violations)],
    proof: unsigned?.proof,
  };
}

export function validateHotfixTerminalEvidence(report, expected = {}) {
  const violations = [];
  const outcome = report?.outcome;
  const expectedClassification = {
    promoted: "candidate-receipted",
    restored: "rollback-receipted",
    baseline: "baseline",
  }[outcome];
  const observedAt = normalizedTimestamp(report?.liveObservation?.observedAt);
  const completedAt = normalizedTimestamp(report?.completedAt);
  const state = expected.state;
  if (
    report?.schemaVersion !== 1 ||
    report?.event !== "g12.staging.cms_public_hotfix.terminal" ||
    !expectedClassification ||
    report?.liveObservation?.classification !== expectedClassification ||
    !SHA256.test(report?.packageManifestSha256 ?? "") ||
    !SHA256.test(report?.probeSha256 ?? "") ||
    !SHA256.test(report?.cmsPublicCanarySha256 ?? "") ||
    !SHA256.test(report?.probeProofSha256 ?? "") ||
    !SHA256.test(report?.liveObservation?.nonTargetSha256 ?? "") ||
    !SHA256.test(report?.liveObservation?.bodySha256 ?? "") ||
    !observedAt ||
    !completedAt ||
    Date.parse(completedAt) < Date.parse(observedAt) ||
    Date.parse(completedAt) - Date.parse(observedAt) > 20 * 60_000 ||
    report?.productionMutations !== 0 ||
    report?.nonTargetFunctionMutations !== 0
  )
    violations.push("terminal_identity_invalid");
  if (outcome === "baseline" && report?.receiptSha256 !== null)
    violations.push("terminal_baseline_receipt_invalid");
  if (["promoted", "restored"].includes(outcome) && !SHA256.test(report?.receiptSha256 ?? ""))
    violations.push("terminal_receipt_invalid");
  if (state) {
    const stateResult = validateHotfixRecoveryState(state, {
      baselineFunction: expected.stateBaselineFunction,
    });
    if (!stateResult.valid) violations.push(...stateResult.violations.map((item) => `terminal_${item}`));
    if (
      !sameCanonical(report?.workflow, state.workflow) ||
      !sameCanonical(report?.release, state.release) ||
      !sameCanonical(report?.target, state.target) ||
      !sameCanonical(report?.recoveryArtifact, state.recoveryArtifact) ||
      report?.liveObservation?.nonTargetSha256 !== state.baseline.nonTargetSha256
    )
      violations.push("terminal_state_mismatch");
    const expectedBodySha256 =
      outcome === "promoted" ? state.candidate.bodySha256 : state.baseline.bodySha256;
    if (report?.liveObservation?.bodySha256 !== expectedBodySha256) violations.push("terminal_body_mismatch");
  }
  for (const [name, value] of [
    ["outcome", expected.outcome],
    ["packageManifestSha256", expected.packageManifestSha256],
    ["probeSha256", expected.probeSha256],
    ["cmsPublicCanarySha256", expected.cmsPublicCanarySha256],
    ["probeProofSha256", expected.probeProofSha256],
    ["receiptSha256", expected.receiptSha256],
  ])
    if (value !== undefined && report?.[name] !== value)
      violations.push(
        `terminal_${name.replaceAll(/[A-Z]/g, (character) => `_${character.toLowerCase()}`)}_mismatch`,
      );
  if (
    expected.live &&
    !sameFunctionTuple(normalizeFunctionTuple(report?.liveObservation?.target), expected.live)
  )
    violations.push("terminal_live_target_mismatch");
  return { valid: violations.length === 0, violations: [...new Set(violations)] };
}

export function assertExactSourceIdentity({
  candidateSource,
  parentSource,
  rollbackSource,
  lockDigests,
  importMapDigests,
}) {
  const violations = [];
  if (candidateSource !== STAGING_CMS_PUBLIC_HOTFIX.candidateSourceSha256)
    violations.push("candidate_source_invalid");
  if (
    parentSource !== STAGING_CMS_PUBLIC_HOTFIX.baselineSourceSha256 ||
    rollbackSource !== STAGING_CMS_PUBLIC_HOTFIX.baselineSourceSha256
  )
    violations.push("baseline_source_invalid");
  if (
    !Array.isArray(lockDigests) ||
    lockDigests.length !== 3 ||
    lockDigests.some((value) => value !== STAGING_CMS_PUBLIC_HOTFIX.sourceDenoLockSha256)
  )
    violations.push("deno_lock_invalid");
  if (
    !Array.isArray(importMapDigests) ||
    importMapDigests.length !== 3 ||
    importMapDigests.some((value) => value !== STAGING_CMS_PUBLIC_HOTFIX.importMapSha256)
  )
    violations.push("import_map_invalid");
  if (violations.length > 0)
    throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_SOURCE_REFUSED:${violations.join(",")}`);
  return true;
}
