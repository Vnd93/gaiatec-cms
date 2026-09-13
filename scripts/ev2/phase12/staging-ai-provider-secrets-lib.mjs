import { createHash } from "node:crypto";

export const STAGING_OPENROUTER_MODEL = "inclusionai/ling-3.0-flash-vl:free";
export const STAGING_AI_EXTERNAL_PROVIDER_ENABLED = "true";

const digest = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const clean = (value) => (typeof value === "string" ? value.trim().toLowerCase() : "");

function inventory(payload) {
  const records = Array.isArray(payload) ? payload : Array.isArray(payload?.secrets) ? payload.secrets : [];
  const duplicates = [];
  const byName = new Map();
  for (const record of records) {
    const name = typeof record?.name === "string" ? record.name.trim() : "";
    if (!name) continue;
    if (byName.has(name)) duplicates.push(name);
    byName.set(name, clean(record?.value ?? record?.digest));
  }
  return { byName, duplicates };
}

export function evaluateStagingAiProviderSecretTransition(beforePayload, afterPayload) {
  const before = inventory(beforePayload);
  const after = inventory(afterPayload);
  const violations = [];
  const apiKeyBefore = before.byName.get("OPENROUTER_API_KEY") ?? "";
  const apiKeyAfter = after.byName.get("OPENROUTER_API_KEY") ?? "";
  if (before.duplicates.length || after.duplicates.length) violations.push("secret_inventory_ambiguous");
  if (!/^[a-f0-9]{64}$/.test(apiKeyBefore)) violations.push("openrouter_api_key_missing_before");
  if (apiKeyAfter !== apiKeyBefore) violations.push("openrouter_api_key_changed");
  if (after.byName.get("OPENROUTER_MODEL") !== digest(STAGING_OPENROUTER_MODEL))
    violations.push("openrouter_model_digest_mismatch");
  if (after.byName.get("CMS_AI_EXTERNAL_PROVIDER_ENABLED") !== digest(STAGING_AI_EXTERNAL_PROVIDER_ENABLED))
    violations.push("external_provider_switch_digest_mismatch");
  return {
    valid: violations.length === 0,
    violations,
    modelDigest: digest(STAGING_OPENROUTER_MODEL),
    switchDigest: digest(STAGING_AI_EXTERNAL_PROVIDER_ENABLED),
    apiKeyPreserved: apiKeyAfter === apiKeyBefore && /^[a-f0-9]{64}$/.test(apiKeyBefore),
  };
}
