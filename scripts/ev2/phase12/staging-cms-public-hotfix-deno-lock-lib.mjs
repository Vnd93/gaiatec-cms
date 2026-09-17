import { createHash } from "node:crypto";

const DEPENDENCY_FIELDS = Object.freeze(["dependencies", "optionalDependencies", "optionalPeers"]);

const EXPECTED_SPECIFIERS = Object.freeze({
  "jsr:@supabase/functions-js@*": "2.112.4",
  "jsr:@supabase/supabase-js@2": "2.112.4",
  "npm:@supabase/auth-js@2.112.4": "2.112.4",
  "npm:@supabase/functions-js@2.112.4": "2.112.4",
  "npm:@supabase/postgrest-js@2.112.4": "2.112.4",
  "npm:@supabase/realtime-js@2.112.4": "2.112.4",
  "npm:@supabase/storage-js@2.112.4": "2.112.4",
  "npm:openai@^4.52.5": "4.104.0_zod@4.4.3",
  "npm:zod@4.4.3": "4.4.3",
});

const EXPECTED_JSR_KEYS = Object.freeze(["@supabase/functions-js@2.112.4", "@supabase/supabase-js@2.112.4"]);

const EXPECTED_NPM_ROOT_SPECIFIERS = Object.freeze(
  Object.keys(EXPECTED_SPECIFIERS)
    .filter((specifier) => specifier.startsWith("npm:"))
    .sort(),
);

const EXPECTED_WORKSPACE_DEPENDENCIES = Object.freeze(["npm:zod@4.4.3"]);

const BUNDLE_LOCK_EVIDENCE = Object.freeze({
  specifierCount: 9,
  jsrPackageCount: 2,
  npmPackageCount: 48,
  dependencyEdgeCount: 59,
  serializedBytes: 10_817,
  npmRootSpecifiers: EXPECTED_NPM_ROOT_SPECIFIERS,
  workspaceDependencies: EXPECTED_WORKSPACE_DEPENDENCIES,
});

export const CMS_PUBLIC_BUNDLE_LOCK = Object.freeze({
  sourceSha256: "26a8ec603c63c1f9d25fdb1b0c020216d982878c4c5c756467bc29008dd4ba2a",
  sha256: "33a32976525fedb037b7b96123119d49af0abe41a90f1b6e0459e9c9b4fecc6f",
  serializedBytes: 10_817,
  specifierCount: 9,
  jsrPackageCount: 2,
  npmPackageCount: 48,
  dependencyEdgeCount: 59,
  specifiers: EXPECTED_SPECIFIERS,
  jsrKeys: EXPECTED_JSR_KEYS,
  npmRootSpecifiers: EXPECTED_NPM_ROOT_SPECIFIERS,
  workspaceDependencies: EXPECTED_WORKSPACE_DEPENDENCIES,
  evidence: BUNDLE_LOCK_EVIDENCE,
});

function refuse(label) {
  throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_BUNDLE_LOCK_${label}_REFUSED`);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (isRecord(value))
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}

function sameCanonical(left, right) {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function sortedSelection(source, keys, label) {
  if (!isRecord(source)) refuse(label);
  return Object.fromEntries(
    [...keys].sort().map((key) => {
      if (!Object.hasOwn(source, key)) refuse(label);
      return [key, structuredClone(source[key])];
    }),
  );
}

function npmPackageName(packageId) {
  if (typeof packageId !== "string" || packageId.length < 3) refuse("NPM_PACKAGE_ID");
  const delimiter = packageId.startsWith("@") ? packageId.indexOf("@", 1) : packageId.indexOf("@");
  if (delimiter < 1) refuse("NPM_PACKAGE_ID");
  return packageId.slice(0, delimiter);
}

function npmSpecifierName(specifier) {
  if (typeof specifier !== "string" || !specifier.startsWith("npm:")) refuse("NPM_SPECIFIER");
  const requirement = specifier.slice("npm:".length);
  const delimiter = requirement.startsWith("@") ? requirement.indexOf("@", 1) : requirement.indexOf("@");
  if (delimiter < 1) refuse("NPM_SPECIFIER");
  return requirement.slice(0, delimiter);
}

function indexNpmPackages(npm) {
  if (!isRecord(npm)) refuse("NPM_MAP");
  const byName = new Map();
  for (const packageId of Object.keys(npm)) {
    const name = npmPackageName(packageId);
    const packageIds = byName.get(name) ?? [];
    packageIds.push(packageId);
    byName.set(name, packageIds);
  }
  for (const packageIds of byName.values()) packageIds.sort();
  return byName;
}

function resolveNpmDependency(npm, byName, dependency) {
  if (typeof dependency !== "string" || dependency.length < 1) refuse("NPM_DEPENDENCY");
  const requirement = dependency.startsWith("npm:") ? dependency.slice("npm:".length) : dependency;
  if (Object.hasOwn(npm, requirement)) return requirement;
  const aliasDelimiter = requirement.indexOf("@npm:");
  if (aliasDelimiter > 0) {
    const aliasTarget = requirement.slice(aliasDelimiter + "@npm:".length);
    if (Object.hasOwn(npm, aliasTarget)) return aliasTarget;
    const aliasName = npmPackageName(aliasTarget);
    const aliasCandidates = byName.get(aliasName) ?? [];
    if (aliasCandidates.length === 1) return aliasCandidates[0];
    refuse("NPM_ALIAS");
  }
  const candidates = byName.get(requirement) ?? [];
  if (candidates.length !== 1) refuse("NPM_DEPENDENCY");
  return candidates[0];
}

function npmRootFromSpecifier(npm, specifier, resolved) {
  const packageId = `${npmSpecifierName(specifier)}@${resolved}`;
  if (!Object.hasOwn(npm, packageId)) refuse("NPM_ROOT");
  return packageId;
}

function dependencyValues(entry) {
  if (!isRecord(entry)) refuse("NPM_ENTRY");
  const values = [];
  for (const field of DEPENDENCY_FIELDS) {
    const dependencies = entry[field] ?? [];
    if (!Array.isArray(dependencies) || dependencies.some((value) => typeof value !== "string"))
      refuse("NPM_ENTRY");
    values.push(...dependencies);
  }
  return values;
}

function validateProjectedLock(projected, source, selectedPackageIds, dependencyEdgeCount) {
  if (
    JSON.stringify(Object.keys(projected).sort()) !==
      JSON.stringify(["jsr", "npm", "specifiers", "version", "workspace"]) ||
    projected.version !== "5" ||
    !sameCanonical(projected.specifiers, EXPECTED_SPECIFIERS) ||
    JSON.stringify(Object.keys(projected.jsr)) !== JSON.stringify([...EXPECTED_JSR_KEYS].sort()) ||
    JSON.stringify(projected.workspace) !==
      JSON.stringify({ dependencies: [...EXPECTED_WORKSPACE_DEPENDENCIES] }) ||
    Object.keys(projected.specifiers).length !== CMS_PUBLIC_BUNDLE_LOCK.specifierCount ||
    Object.keys(projected.jsr).length !== CMS_PUBLIC_BUNDLE_LOCK.jsrPackageCount ||
    Object.keys(projected.npm).length !== CMS_PUBLIC_BUNDLE_LOCK.npmPackageCount ||
    dependencyEdgeCount !== CMS_PUBLIC_BUNDLE_LOCK.dependencyEdgeCount ||
    JSON.stringify(Object.keys(projected.npm)) !== JSON.stringify([...selectedPackageIds].sort())
  )
    refuse("SHAPE");
  for (const [specifier, value] of Object.entries(projected.specifiers)) {
    if (source.specifiers[specifier] !== value) refuse("SPECIFIER_IDENTITY");
  }
  for (const [packageId, value] of Object.entries(projected.jsr)) {
    if (!sameCanonical(source.jsr[packageId], value)) refuse("JSR_IDENTITY");
  }
  for (const [packageId, value] of Object.entries(projected.npm)) {
    if (!sameCanonical(source.npm[packageId], value)) refuse("NPM_IDENTITY");
  }
  const bytes = serializeCmsPublicBundleLock(projected);
  if (
    bytes.byteLength !== CMS_PUBLIC_BUNDLE_LOCK.serializedBytes ||
    createHash("sha256").update(bytes).digest("hex") !== CMS_PUBLIC_BUNDLE_LOCK.sha256
  )
    refuse("IDENTITY");
  return projected;
}

export function serializeCmsPublicBundleLock(lock) {
  return Buffer.from(`${JSON.stringify(lock, null, 2)}\n`, "utf8");
}

export function assertCmsPublicBundleLock(lock) {
  if (
    !isRecord(lock) ||
    JSON.stringify(Object.keys(lock).sort()) !==
      JSON.stringify(["jsr", "npm", "specifiers", "version", "workspace"])
  )
    refuse("SHAPE");
  const bytes = serializeCmsPublicBundleLock(lock);
  if (
    bytes.byteLength !== CMS_PUBLIC_BUNDLE_LOCK.serializedBytes ||
    createHash("sha256").update(bytes).digest("hex") !== CMS_PUBLIC_BUNDLE_LOCK.sha256
  )
    refuse("IDENTITY");
  return lock;
}

export function projectCmsPublicBundleLock(source) {
  if (
    !isRecord(source) ||
    JSON.stringify(Object.keys(source).sort()) !==
      JSON.stringify(["jsr", "npm", "specifiers", "version", "workspace"]) ||
    source.version !== "5" ||
    !isRecord(source.specifiers) ||
    !isRecord(source.jsr) ||
    !isRecord(source.npm)
  )
    refuse("SOURCE");
  for (const [specifier, expected] of Object.entries(EXPECTED_SPECIFIERS)) {
    if (source.specifiers[specifier] !== expected) refuse("SPECIFIER");
  }
  const specifiers = sortedSelection(source.specifiers, Object.keys(EXPECTED_SPECIFIERS), "SPECIFIER");
  const jsr = sortedSelection(source.jsr, EXPECTED_JSR_KEYS, "JSR");
  const byName = indexNpmPackages(source.npm);
  const pending = [];
  for (const [specifier, resolved] of Object.entries(specifiers)) {
    if (specifier.startsWith("npm:")) pending.push(npmRootFromSpecifier(source.npm, specifier, resolved));
  }
  for (const entry of Object.values(jsr)) {
    for (const dependency of dependencyValues(entry))
      pending.push(resolveNpmDependency(source.npm, byName, dependency));
  }
  const selectedPackageIds = new Set();
  let dependencyEdgeCount = 0;
  while (pending.length > 0) {
    const packageId = pending.shift();
    if (selectedPackageIds.has(packageId)) continue;
    const entry = source.npm[packageId];
    if (!isRecord(entry)) refuse("NPM_ENTRY");
    selectedPackageIds.add(packageId);
    for (const dependency of dependencyValues(entry)) {
      dependencyEdgeCount += 1;
      pending.push(resolveNpmDependency(source.npm, byName, dependency));
    }
  }
  const npm = sortedSelection(source.npm, selectedPackageIds, "NPM_ENTRY");
  const projected = {
    version: "5",
    specifiers,
    jsr,
    npm,
    workspace: { dependencies: [...EXPECTED_WORKSPACE_DEPENDENCIES] },
  };
  return validateProjectedLock(projected, source, selectedPackageIds, dependencyEdgeCount);
}
