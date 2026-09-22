import { createHash } from "node:crypto";

export const STAGING_EDGE_PUBLIC_ORIGINS = Object.freeze([
  "https://gaiatec-cms-staging.pages.dev",
  "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev",
  "https://ev2-g12-canary.gaiatec-cms-staging.pages.dev",
  "https://ev2-g16-csp-canary.gaiatec-cms-staging.pages.dev",
  "https://ev2-g12-rollback-compat.gaiatec-cms-staging.pages.dev",
]);

export const STAGING_EDGE_PUBLIC_HOSTNAMES = Object.freeze(
  STAGING_EDGE_PUBLIC_ORIGINS.map((origin) => new URL(origin).hostname),
);

export const STAGING_EDGE_ADMIN_ORIGIN = "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev";

export const STAGING_EDGE_PUBLIC_SECRET_NAMES = Object.freeze([
  "ALLOWED_ORIGINS",
  "CMS_ADMIN_ORIGIN",
  "CMS_ADMIN_URL",
  "CMS_ENVIRONMENT",
  "CMS_RELEASE_SHA",
  "CONTACT_CAPTCHA_ALWAYS",
  "PUBLIC_SITE_ORIGIN",
  "TURNSTILE_ALLOWED_HOSTNAMES",
  "TURNSTILE_EXPECTED_ACTION",
]);

const FULL_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const digest = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const cleanDigest = (value) => (typeof value === "string" ? value.trim().toLowerCase() : "");

export function expectedStagingEdgePublicSecrets(candidateSha) {
  if (!FULL_SHA.test(candidateSha ?? ""))
    throw new Error("G12_STAGING_EDGE_PUBLIC_SECRET_CANDIDATE_SHA_REFUSED");
  return Object.freeze({
    ALLOWED_ORIGINS: STAGING_EDGE_PUBLIC_ORIGINS.join(","),
    CMS_ADMIN_ORIGIN: STAGING_EDGE_ADMIN_ORIGIN,
    CMS_ADMIN_URL: `${STAGING_EDGE_ADMIN_ORIGIN}/admin`,
    CMS_ENVIRONMENT: "staging",
    CMS_RELEASE_SHA: candidateSha,
    CONTACT_CAPTCHA_ALWAYS: "true",
    PUBLIC_SITE_ORIGIN: STAGING_EDGE_ADMIN_ORIGIN,
    TURNSTILE_ALLOWED_HOSTNAMES: STAGING_EDGE_PUBLIC_HOSTNAMES.join(","),
    TURNSTILE_EXPECTED_ACTION: "lead_capture",
  });
}

function inventory(payload) {
  const records = Array.isArray(payload) ? payload : Array.isArray(payload?.secrets) ? payload.secrets : null;
  if (!records) return { byName: new Map(), duplicates: [], invalid: ["payload"] };
  const byName = new Map();
  const duplicates = [];
  const invalid = [];
  for (const [index, record] of records.entries()) {
    const name = typeof record?.name === "string" ? record.name.trim() : "";
    const secretDigest = cleanDigest(record?.value ?? record?.digest);
    if (!name || !SHA256.test(secretDigest)) {
      invalid.push(String(index));
      continue;
    }
    if (byName.has(name)) duplicates.push(name);
    byName.set(name, secretDigest);
  }
  return { byName, duplicates, invalid };
}

export function validateStagingEdgeSecretInventory(payload) {
  const inspected = inventory(payload);
  const violations = [];
  if (inspected.duplicates.length) violations.push("secret_inventory_ambiguous");
  if (inspected.invalid.length) violations.push("secret_inventory_invalid");
  return {
    valid: violations.length === 0,
    violations,
    secretCount: inspected.byName.size,
  };
}

export function evaluateStagingEdgePublicSecretTransition(beforePayload, afterPayload, candidateSha) {
  const expected = expectedStagingEdgePublicSecrets(candidateSha);
  const expectedDigests = Object.fromEntries(
    STAGING_EDGE_PUBLIC_SECRET_NAMES.map((name) => [name, digest(expected[name])]),
  );
  const managedNames = new Set(STAGING_EDGE_PUBLIC_SECRET_NAMES);
  const before = inventory(beforePayload);
  const after = inventory(afterPayload);
  const violations = [];
  if (before.duplicates.length || after.duplicates.length) violations.push("secret_inventory_ambiguous");
  if (before.invalid.length || after.invalid.length) violations.push("secret_inventory_invalid");

  for (const name of STAGING_EDGE_PUBLIC_SECRET_NAMES) {
    if (after.byName.get(name) !== expectedDigests[name]) violations.push(`managed_digest_mismatch:${name}`);
  }

  const beforeUnmanaged = [...before.byName]
    .filter(([name]) => !managedNames.has(name))
    .sort(([left], [right]) => left.localeCompare(right));
  const afterUnmanaged = [...after.byName]
    .filter(([name]) => !managedNames.has(name))
    .sort(([left], [right]) => left.localeCompare(right));
  if (
    JSON.stringify(beforeUnmanaged.map(([name]) => name)) !==
    JSON.stringify(afterUnmanaged.map(([name]) => name))
  ) {
    violations.push("unmanaged_inventory_changed");
  } else if (beforeUnmanaged.some(([name, value]) => after.byName.get(name) !== value)) {
    violations.push("unmanaged_digest_changed");
  }

  return {
    valid: violations.length === 0,
    violations,
    configuredNames: [...STAGING_EDGE_PUBLIC_SECRET_NAMES],
    expectedDigests,
    unmanagedSecretCount: beforeUnmanaged.length,
    unmanagedSecretsPreserved:
      !violations.includes("unmanaged_inventory_changed") && !violations.includes("unmanaged_digest_changed"),
  };
}
