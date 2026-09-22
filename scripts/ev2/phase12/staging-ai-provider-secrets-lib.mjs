import { createHash } from "node:crypto";

export const STAGING_OPENROUTER_MODEL = "inclusionai/ling-3.0-flash-vl:free";
export const STAGING_AI_EXTERNAL_PROVIDER_ENABLED = "true";

const digest = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const clean = (value) => (typeof value === "string" ? value.trim().toLowerCase() : "");
const SHA256 = /^[a-f0-9]{64}$/;
const MANAGED_SECRET_NAMES = new Set(["OPENROUTER_MODEL", "CMS_AI_EXTERNAL_PROVIDER_ENABLED"]);

function inventory(payload) {
  const records = Array.isArray(payload) ? payload : Array.isArray(payload?.secrets) ? payload.secrets : null;
  if (!records) return { byName: new Map(), duplicates: [], invalid: ["payload"] };
  const duplicates = [];
  const invalid = [];
  const byName = new Map();
  for (const [index, record] of records.entries()) {
    const name = typeof record?.name === "string" ? record.name.trim() : "";
    const secretDigest = clean(record?.value ?? record?.digest);
    if (!name || !SHA256.test(secretDigest)) {
      invalid.push(String(index));
      continue;
    }
    if (byName.has(name)) duplicates.push(name);
    byName.set(name, secretDigest);
  }
  return { byName, duplicates, invalid };
}

export function validateStagingAiProviderSecretInventory(payload) {
  const inspected = inventory(payload);
  const violations = [];
  if (inspected.duplicates.length) violations.push("secret_inventory_ambiguous");
  if (inspected.invalid.length) violations.push("secret_inventory_invalid");
  if (!SHA256.test(inspected.byName.get("OPENROUTER_API_KEY") ?? ""))
    violations.push("openrouter_api_key_missing");
  return {
    valid: violations.length === 0,
    violations,
    secretCount: inspected.byName.size,
  };
}

export function evaluateStagingAiProviderSecretTransition(beforePayload, afterPayload) {
  const before = inventory(beforePayload);
  const after = inventory(afterPayload);
  const violations = [];
  const apiKeyBefore = before.byName.get("OPENROUTER_API_KEY") ?? "";
  const apiKeyAfter = after.byName.get("OPENROUTER_API_KEY") ?? "";
  if (before.duplicates.length || after.duplicates.length) violations.push("secret_inventory_ambiguous");
  if (before.invalid.length || after.invalid.length) violations.push("secret_inventory_invalid");
  if (!SHA256.test(apiKeyBefore)) violations.push("openrouter_api_key_missing_before");
  if (apiKeyAfter !== apiKeyBefore) violations.push("openrouter_api_key_changed");
  if (after.byName.get("OPENROUTER_MODEL") !== digest(STAGING_OPENROUTER_MODEL))
    violations.push("openrouter_model_digest_mismatch");
  if (after.byName.get("CMS_AI_EXTERNAL_PROVIDER_ENABLED") !== digest(STAGING_AI_EXTERNAL_PROVIDER_ENABLED))
    violations.push("external_provider_switch_digest_mismatch");

  const beforeUnmanaged = [...before.byName]
    .filter(([name]) => !MANAGED_SECRET_NAMES.has(name))
    .sort(([left], [right]) => left.localeCompare(right));
  const afterUnmanaged = [...after.byName]
    .filter(([name]) => !MANAGED_SECRET_NAMES.has(name))
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
    modelDigest: digest(STAGING_OPENROUTER_MODEL),
    switchDigest: digest(STAGING_AI_EXTERNAL_PROVIDER_ENABLED),
    apiKeyPreserved: apiKeyAfter === apiKeyBefore && SHA256.test(apiKeyBefore),
    unmanagedSecretCount: beforeUnmanaged.length,
    unmanagedSecretsPreserved:
      !violations.includes("unmanaged_inventory_changed") && !violations.includes("unmanaged_digest_changed"),
  };
}
