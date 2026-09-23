import { createHash } from "node:crypto";

import {
  assertCmsPublicBundleLock,
  CMS_PUBLIC_BUNDLE_LOCK,
  projectCmsPublicBundleLock,
  serializeCmsPublicBundleLock,
} from "./staging-cms-public-hotfix-deno-lock-lib.mjs";

const DEPENDENCY_FIELDS = Object.freeze(["dependencies", "optionalDependencies", "optionalPeers"]);
const FORBIDDEN_FULL_LOCK_PACKAGES = Object.freeze([
  "@cloudflare/workerd-*",
  "@esbuild/*",
  "@img/sharp*",
  "@jsquash/*",
  "@playwright/*",
  "@radix-ui/*",
  "playwright",
  "playwright-core",
  "sharp",
  "vite",
  "vitest",
  "workerd",
  "wrangler",
]);
const REQUIRED_PDF_PACKAGES = Object.freeze([
  "@pdf-lib/standard-fonts@1.0.0",
  "@pdf-lib/upng@1.0.1",
  "pako@1.0.11",
  "pdf-lib@1.17.1",
  "tslib@1.14.1",
]);

export const ALL_EDGE_RUNTIME_SOURCE_LOCK = Object.freeze({
  path: "scripts/ev2/phase12/all-edge-runtime-source-deno.lock",
  generatedWithDeno: "2.5.6",
  sha256: "4cace1fb9c74b0e11514c20d90c322d1cf084af62221d7455372cda99bdbb1e6",
  serializedBytes: 11_836,
  specifierCount: 10,
  jsrPackageCount: 2,
  npmPackageCount: 53,
  dependencyEdgeCount: 65,
  pdfSpecifier: "npm:pdf-lib@1.17.1",
  pdfVersion: "1.17.1",
  requiredPdfPackages: REQUIRED_PDF_PACKAGES,
  forbiddenFullLockPackages: FORBIDDEN_FULL_LOCK_PACKAGES,
});

export const ALL_EDGE_RUNTIME_LOCK_PROFILES = Object.freeze({
  standard: Object.freeze({
    id: "standard",
    sha256: CMS_PUBLIC_BUNDLE_LOCK.sha256,
    serializedBytes: CMS_PUBLIC_BUNDLE_LOCK.serializedBytes,
    specifierCount: CMS_PUBLIC_BUNDLE_LOCK.specifierCount,
    jsrPackageCount: CMS_PUBLIC_BUNDLE_LOCK.jsrPackageCount,
    npmPackageCount: CMS_PUBLIC_BUNDLE_LOCK.npmPackageCount,
    dependencyEdgeCount: CMS_PUBLIC_BUNDLE_LOCK.dependencyEdgeCount,
  }),
  pdf: Object.freeze({
    id: "pdf",
    sha256: ALL_EDGE_RUNTIME_SOURCE_LOCK.sha256,
    serializedBytes: ALL_EDGE_RUNTIME_SOURCE_LOCK.serializedBytes,
    specifierCount: ALL_EDGE_RUNTIME_SOURCE_LOCK.specifierCount,
    jsrPackageCount: ALL_EDGE_RUNTIME_SOURCE_LOCK.jsrPackageCount,
    npmPackageCount: ALL_EDGE_RUNTIME_SOURCE_LOCK.npmPackageCount,
    dependencyEdgeCount: ALL_EDGE_RUNTIME_SOURCE_LOCK.dependencyEdgeCount,
  }),
});

export const ALL_EDGE_RUNTIME_FUNCTION_LOCK_PROFILE_IDS = Object.freeze({
  "cms-ai": "standard",
  "cms-ai-execute": "standard",
  "cms-attributes": "standard",
  "cms-bulk": "standard",
  "cms-collaboration": "standard",
  "cms-content": "standard",
  "cms-controlled-vocabularies": "standard",
  "cms-documents": "standard",
  "cms-drafts-v2": "standard",
  "cms-leads": "standard",
  "cms-master-data": "standard",
  "cms-media": "standard",
  "cms-outbox-worker": "standard",
  "cms-pim": "standard",
  "cms-preview": "standard",
  "cms-public": "standard",
  "cms-quality": "standard",
  "cms-recovery": "standard",
  "cms-releases": "standard",
  "cms-scopes": "standard",
  "cms-search-admin": "standard",
  "cms-session": "standard",
  "cms-sites": "standard",
  "cms-system": "standard",
  "cms-users": "standard",
  "cms-visual": "standard",
  "lead-capture": "standard",
  "rdo-command": "pdf",
  "rdo-invite": "standard",
  "rdo-notify": "standard",
  "rdo-otp": "standard",
  "rdo-sign": "pdf",
  "rdo-team": "standard",
  "submit-contact": "standard",
});

function refuse(label) {
  throw new Error(`G12_ALL_EDGE_RUNTIME_BUNDLE_LOCK_${label}_REFUSED`);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function dependencyEdgeCount(lock) {
  return Object.values(lock.npm).reduce(
    (total, entry) =>
      total + DEPENDENCY_FIELDS.reduce((entryTotal, field) => entryTotal + (entry[field] ?? []).length, 0),
    0,
  );
}

function packageNameFromId(packageId) {
  const versionSeparator = packageId.startsWith("@") ? packageId.lastIndexOf("@") : packageId.indexOf("@");
  return versionSeparator > 0 ? packageId.slice(0, versionSeparator) : packageId;
}

function hasPackage(lock, packagePattern) {
  const prefix = packagePattern.endsWith("*") ? packagePattern.slice(0, -1) : null;
  return Object.keys(lock.npm).some((packageId) => {
    const packageName = packageNameFromId(packageId);
    return prefix === null ? packageName === packagePattern : packageName.startsWith(prefix);
  });
}

export function serializeAllEdgeRuntimeSourceLock(lock) {
  return Buffer.from(`${JSON.stringify(lock, null, 2)}\n`, "utf8");
}

export function assertAllEdgeRuntimeSourceLock(lock) {
  if (
    !isRecord(lock) ||
    JSON.stringify(Object.keys(lock).sort()) !==
      JSON.stringify(["jsr", "npm", "specifiers", "version", "workspace"]) ||
    lock.version !== "5" ||
    !isRecord(lock.specifiers) ||
    !isRecord(lock.jsr) ||
    !isRecord(lock.npm) ||
    JSON.stringify(lock.workspace) !== JSON.stringify({ dependencies: ["npm:zod@4.4.3"] }) ||
    lock.specifiers[ALL_EDGE_RUNTIME_SOURCE_LOCK.pdfSpecifier] !== ALL_EDGE_RUNTIME_SOURCE_LOCK.pdfVersion ||
    Object.keys(lock.specifiers).length !== ALL_EDGE_RUNTIME_SOURCE_LOCK.specifierCount ||
    Object.keys(lock.jsr).length !== ALL_EDGE_RUNTIME_SOURCE_LOCK.jsrPackageCount ||
    Object.keys(lock.npm).length !== ALL_EDGE_RUNTIME_SOURCE_LOCK.npmPackageCount ||
    dependencyEdgeCount(lock) !== ALL_EDGE_RUNTIME_SOURCE_LOCK.dependencyEdgeCount ||
    REQUIRED_PDF_PACKAGES.some((packageId) => !Object.hasOwn(lock.npm, packageId)) ||
    FORBIDDEN_FULL_LOCK_PACKAGES.some((packageName) => hasPackage(lock, packageName))
  )
    refuse("SOURCE_SHAPE");
  const bytes = serializeAllEdgeRuntimeSourceLock(lock);
  if (
    bytes.byteLength !== ALL_EDGE_RUNTIME_SOURCE_LOCK.serializedBytes ||
    sha256(bytes) !== ALL_EDGE_RUNTIME_SOURCE_LOCK.sha256
  )
    refuse("SOURCE_IDENTITY");
  return lock;
}

export function allEdgeRuntimeLockProfile(functionName) {
  if (typeof functionName !== "string" || !/^[a-z0-9-]+$/.test(functionName)) refuse("FUNCTION_NAME");
  const profileId = ALL_EDGE_RUNTIME_FUNCTION_LOCK_PROFILE_IDS[functionName];
  if (!profileId) refuse("FUNCTION_INVENTORY");
  return ALL_EDGE_RUNTIME_LOCK_PROFILES[profileId];
}

export function materializeAllEdgeRuntimeBundleLock({ rootLock, sourceLock, functionName }) {
  const profile = allEdgeRuntimeLockProfile(functionName);
  if (profile.id === "pdf") {
    const lock = assertAllEdgeRuntimeSourceLock(sourceLock);
    return { profile, lock, bytes: serializeAllEdgeRuntimeSourceLock(lock) };
  }
  const lock = assertCmsPublicBundleLock(projectCmsPublicBundleLock(rootLock));
  return { profile, lock, bytes: serializeCmsPublicBundleLock(lock) };
}

export function allEdgeRuntimeDenoConfig() {
  return {
    imports: { zod: "npm:zod@4.4.3" },
    lock: { path: "./deno.lock", frozen: true },
    nodeModulesDir: "none",
  };
}

export function allEdgeRuntimeBundleLockEvidence(lock, bytes, profile) {
  if (
    !isRecord(profile) ||
    !Object.hasOwn(ALL_EDGE_RUNTIME_LOCK_PROFILES, profile.id) ||
    profile !== ALL_EDGE_RUNTIME_LOCK_PROFILES[profile.id] ||
    !Buffer.isBuffer(bytes)
  )
    refuse("PROFILE");
  const validatedLock =
    profile.id === "pdf" ? assertAllEdgeRuntimeSourceLock(lock) : assertCmsPublicBundleLock(lock);
  const canonicalBytes =
    profile.id === "pdf"
      ? serializeAllEdgeRuntimeSourceLock(validatedLock)
      : serializeCmsPublicBundleLock(validatedLock);
  if (!canonicalBytes.equals(bytes)) refuse("PROFILE_BYTES");
  const evidence = {
    profileId: profile.id,
    sha256: sha256(bytes),
    serializedBytes: bytes.byteLength,
    specifierCount: Object.keys(lock.specifiers).length,
    jsrPackageCount: Object.keys(lock.jsr).length,
    npmPackageCount: Object.keys(lock.npm).length,
    dependencyEdgeCount: dependencyEdgeCount(lock),
  };
  if (
    evidence.sha256 !== profile.sha256 ||
    evidence.serializedBytes !== profile.serializedBytes ||
    evidence.specifierCount !== profile.specifierCount ||
    evidence.jsrPackageCount !== profile.jsrPackageCount ||
    evidence.npmPackageCount !== profile.npmPackageCount ||
    evidence.dependencyEdgeCount !== profile.dependencyEdgeCount
  )
    refuse("PROFILE_IDENTITY");
  return evidence;
}
