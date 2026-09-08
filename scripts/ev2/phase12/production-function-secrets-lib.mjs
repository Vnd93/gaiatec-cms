import { createHash, timingSafeEqual } from "node:crypto";

import {
  productionCloudflareApprovalTarget,
  PRODUCTION_OPENROUTER_MODEL,
  PRODUCTION_PROJECT_REF,
  PRODUCTION_SITE_ORIGIN,
  PRODUCTION_TURNSTILE_HOSTNAMES,
  TURNSTILE_TEST_SECRET_KEYS,
} from "./production-backend-lib.mjs";

export const PRODUCTION_FUNCTION_SECRET_NAMES = [
  "ALLOWED_ORIGINS",
  "TURNSTILE_ALLOWED_HOSTNAMES",
  "PUBLIC_SITE_ORIGIN",
  "RATE_LIMIT_SALT",
  "EVIDENCE_SALT",
  "LEAD_EVIDENCE_SALT",
  "TURNSTILE_SECRET_KEY",
  "TURNSTILE_EXPECTED_ACTION",
  "CONTACT_CAPTCHA_ALWAYS",
  "CONTACT_NOTIFY_EMAIL",
  "CONTACT_FROM_EMAIL",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "LEAD_NOTIFICATION_TO",
  "CMS_ENVIRONMENT",
  "CMS_ADMIN_ORIGIN",
  "CMS_ADMIN_URL",
  "OUTBOX_WORKER_SECRET",
  "CMS_EV2_PRODUCTION_ENABLED",
  "CMS_AI_EXTERNAL_PROVIDER_ENABLED",
  "OPENROUTER_API_KEY",
  "OPENROUTER_MODEL",
  "CLOUDFLARE_ZONE_ID",
  "CLOUDFLARE_CACHE_PURGE_TOKEN",
];

const EXPECTED_ORIGINS = [PRODUCTION_SITE_ORIGIN, "https://www.gaiatecsistemas.com.br"];
const SUPABASE_MANAGED_SECRET_NAMES = new Set([
  "SUPABASE_ANON_KEY",
  "SUPABASE_DB_URL",
  "SUPABASE_JWKS",
  "SUPABASE_PUBLISHABLE_KEYS",
  "SUPABASE_SECRET_KEYS",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_URL",
]);

const CLOUDFLARE_ID = /^[a-f0-9]{32}$/;

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function exactDigest(left, right) {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function clean(value) {
  return String(value ?? "").trim();
}

function rejectUnsafeValue(name, value) {
  if (!value || /[\r\n\0]/.test(value))
    throw new Error(`G12_PRODUCTION_FUNCTION_SECRETS_BLOCKED:${name.toLowerCase()}_invalid`);
  return value;
}

function exactCsv(value, expected, violation) {
  const actual = clean(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .sort();
  const target = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(target))
    throw new Error(`G12_PRODUCTION_FUNCTION_SECRETS_BLOCKED:${violation}`);
  return target.join(",");
}

export function buildProductionFunctionSecrets(env) {
  if (clean(env.PRODUCTION_SUPABASE_PROJECT_REF) !== PRODUCTION_PROJECT_REF)
    throw new Error("G12_PRODUCTION_FUNCTION_SECRETS_BLOCKED:production_project_ref_invalid");
  if (!clean(env.SUPABASE_ACCESS_TOKEN).startsWith("sbp_") || clean(env.SUPABASE_ACCESS_TOKEN).length < 24)
    throw new Error("G12_PRODUCTION_FUNCTION_SECRETS_BLOCKED:supabase_access_token_invalid");

  const allowedOrigins = exactCsv(env.ALLOWED_ORIGINS, EXPECTED_ORIGINS, "allowed_origins_invalid");
  const turnstileHostnames = exactCsv(
    clean(env.TURNSTILE_ALLOWED_HOSTNAMES).toLowerCase(),
    PRODUCTION_TURNSTILE_HOSTNAMES,
    "turnstile_allowed_hostnames_invalid",
  );
  const required = [
    "RATE_LIMIT_SALT",
    "EVIDENCE_SALT",
    "LEAD_EVIDENCE_SALT",
    "TURNSTILE_SECRET_KEY",
    "RESEND_API_KEY",
    "EMAIL_FROM",
    "LEAD_NOTIFICATION_TO",
    "OUTBOX_WORKER_SECRET",
    "OPENROUTER_API_KEY",
    "CLOUDFLARE_ZONE_ID",
    "CLOUDFLARE_CACHE_PURGE_TOKEN",
  ];
  const values = Object.fromEntries(
    required.map((name) => [name, rejectUnsafeValue(name, clean(env[name]))]),
  );
  for (const name of ["RATE_LIMIT_SALT", "EVIDENCE_SALT", "LEAD_EVIDENCE_SALT", "OUTBOX_WORKER_SECRET"]) {
    if (!/^[a-f0-9]{64}$/.test(values[name]))
      throw new Error(`G12_PRODUCTION_FUNCTION_SECRETS_BLOCKED:${name.toLowerCase()}_invalid`);
  }
  if (TURNSTILE_TEST_SECRET_KEYS.has(values.TURNSTILE_SECRET_KEY))
    throw new Error("G12_PRODUCTION_FUNCTION_SECRETS_BLOCKED:turnstile_test_credential_forbidden");
  if (!values.RESEND_API_KEY.startsWith("re_") || !values.OPENROUTER_API_KEY.startsWith("sk-or-"))
    throw new Error("G12_PRODUCTION_FUNCTION_SECRETS_BLOCKED:provider_credential_invalid");
  if (!/^[a-f0-9]{32}$/.test(values.CLOUDFLARE_ZONE_ID))
    throw new Error("G12_PRODUCTION_FUNCTION_SECRETS_BLOCKED:cloudflare_zone_id_invalid");
  if (values.CLOUDFLARE_CACHE_PURGE_TOKEN.length < 30)
    throw new Error("G12_PRODUCTION_FUNCTION_SECRETS_BLOCKED:cloudflare_cache_token_invalid");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.LEAD_NOTIFICATION_TO))
    throw new Error("G12_PRODUCTION_FUNCTION_SECRETS_BLOCKED:lead_notification_email_invalid");
  if (!/^.+<[^\s@]+@gaiatecsistemas\.com>$/.test(values.EMAIL_FROM))
    throw new Error("G12_PRODUCTION_FUNCTION_SECRETS_BLOCKED:email_from_invalid");
  if (clean(env.OPENROUTER_MODEL) !== PRODUCTION_OPENROUTER_MODEL)
    throw new Error("G12_PRODUCTION_FUNCTION_SECRETS_BLOCKED:openrouter_model_invalid");
  if (clean(env.CMS_EV2_PRODUCTION_ENABLED) !== "true")
    throw new Error("G12_PRODUCTION_FUNCTION_SECRETS_BLOCKED:ev2_production_switch_invalid");
  if (clean(env.CMS_AI_EXTERNAL_PROVIDER_ENABLED) !== "true")
    throw new Error("G12_PRODUCTION_FUNCTION_SECRETS_BLOCKED:external_ai_provider_switch_invalid");
  if (!exactDigest(sha256(values.EMAIL_FROM), clean(env.APPROVED_EMAIL_FROM_SHA256)))
    throw new Error("G12_PRODUCTION_FUNCTION_SECRETS_BLOCKED:email_from_approval_mismatch");
  if (!exactDigest(sha256(values.LEAD_NOTIFICATION_TO), clean(env.APPROVED_LEAD_NOTIFICATION_TO_SHA256)))
    throw new Error("G12_PRODUCTION_FUNCTION_SECRETS_BLOCKED:notification_to_approval_mismatch");
  const expectedCloudflareTarget = productionCloudflareApprovalTarget({
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    zoneId: values.CLOUDFLARE_ZONE_ID,
    cachePurgeTokenId: env.CLOUDFLARE_CACHE_PURGE_TOKEN_ID,
  });
  if (!exactDigest(sha256(expectedCloudflareTarget), clean(env.APPROVED_CLOUDFLARE_TARGET_SHA256)))
    throw new Error("G12_PRODUCTION_FUNCTION_SECRETS_BLOCKED:cloudflare_target_approval_mismatch");

  return {
    ALLOWED_ORIGINS: allowedOrigins,
    TURNSTILE_ALLOWED_HOSTNAMES: turnstileHostnames,
    PUBLIC_SITE_ORIGIN: PRODUCTION_SITE_ORIGIN,
    RATE_LIMIT_SALT: values.RATE_LIMIT_SALT,
    EVIDENCE_SALT: values.EVIDENCE_SALT,
    LEAD_EVIDENCE_SALT: values.LEAD_EVIDENCE_SALT,
    TURNSTILE_SECRET_KEY: values.TURNSTILE_SECRET_KEY,
    TURNSTILE_EXPECTED_ACTION: "lead_capture",
    CONTACT_CAPTCHA_ALWAYS: "true",
    CONTACT_NOTIFY_EMAIL: values.LEAD_NOTIFICATION_TO,
    CONTACT_FROM_EMAIL: values.EMAIL_FROM,
    RESEND_API_KEY: values.RESEND_API_KEY,
    EMAIL_FROM: values.EMAIL_FROM,
    LEAD_NOTIFICATION_TO: values.LEAD_NOTIFICATION_TO,
    CMS_ENVIRONMENT: "production",
    CMS_ADMIN_ORIGIN: PRODUCTION_SITE_ORIGIN,
    CMS_ADMIN_URL: `${PRODUCTION_SITE_ORIGIN}/admin`,
    OUTBOX_WORKER_SECRET: values.OUTBOX_WORKER_SECRET,
    CMS_EV2_PRODUCTION_ENABLED: clean(env.CMS_EV2_PRODUCTION_ENABLED),
    CMS_AI_EXTERNAL_PROVIDER_ENABLED: clean(env.CMS_AI_EXTERNAL_PROVIDER_ENABLED),
    OPENROUTER_API_KEY: values.OPENROUTER_API_KEY,
    OPENROUTER_MODEL: PRODUCTION_OPENROUTER_MODEL,
    CLOUDFLARE_ZONE_ID: values.CLOUDFLARE_ZONE_ID,
    CLOUDFLARE_CACHE_PURGE_TOKEN: values.CLOUDFLARE_CACHE_PURGE_TOKEN,
  };
}

export function serializeProductionFunctionSecrets(secrets) {
  const actualNames = Object.keys(secrets).sort();
  const expectedNames = [...PRODUCTION_FUNCTION_SECRET_NAMES].sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames))
    throw new Error("G12_PRODUCTION_FUNCTION_SECRETS_BLOCKED:secret_inventory_invalid");
  return `${PRODUCTION_FUNCTION_SECRET_NAMES.map((name) => `${name}=${JSON.stringify(secrets[name])}`).join("\n")}\n`;
}

export function evaluateProductionCloudflareBinding({
  zonePayload,
  tokenPayload,
  expectedAccountId,
  expectedZoneId,
  expectedPurgeTokenId,
  discoveryToken,
  purgeToken,
}) {
  const violations = [];
  if (
    !CLOUDFLARE_ID.test(clean(expectedAccountId)) ||
    !CLOUDFLARE_ID.test(clean(expectedZoneId)) ||
    !CLOUDFLARE_ID.test(clean(expectedPurgeTokenId))
  )
    violations.push("cloudflare_binding_id_invalid");
  if (clean(discoveryToken).length < 30 || clean(purgeToken).length < 30 || discoveryToken === purgeToken)
    violations.push("cloudflare_tokens_not_separated");

  const zones = Array.isArray(zonePayload?.result) ? zonePayload.result : [];
  if (
    zones.length !== 1 ||
    zonePayload?.result_info?.total_count !== 1 ||
    zones[0]?.id !== expectedZoneId ||
    zones[0]?.name !== "gaiatecsistemas.com.br" ||
    zones[0]?.status !== "active" ||
    zones[0]?.account?.id !== expectedAccountId
  )
    violations.push("cloudflare_zone_binding_invalid");
  if (tokenPayload?.result?.id !== expectedPurgeTokenId || tokenPayload?.result?.status !== "active")
    violations.push("cloudflare_purge_token_binding_invalid");
  return { valid: violations.length === 0, violations };
}

function normalizeSecretInventory(payload) {
  return (Array.isArray(payload) ? payload : (payload?.secrets ?? [])).map((record) => ({
    name: clean(record?.name),
    digest: clean(record?.value ?? record?.digest).toLowerCase(),
    updatedAt: clean(record?.updated_at ?? record?.updatedAt),
  }));
}

export function evaluateProductionFunctionSecretInventory(
  payload,
  { expectedSecrets, beforePayload = [], mutationStartedAt } = {},
) {
  const records = normalizeSecretInventory(payload);
  const beforeRecords = normalizeSecretInventory(beforePayload);
  const beforeByName = new Map(beforeRecords.map((record) => [record.name, record]));
  const counts = new Map();
  for (const record of records) counts.set(record.name, (counts.get(record.name) ?? 0) + 1);

  const violations = [];
  const missing = PRODUCTION_FUNCTION_SECRET_NAMES.filter((name) => !counts.has(name));
  violations.push(...missing.map((name) => `${name}:missing`));
  for (const [name, count] of counts) {
    if (count !== 1) violations.push(`${name}:duplicate`);
    if (!PRODUCTION_FUNCTION_SECRET_NAMES.includes(name) && !SUPABASE_MANAGED_SECRET_NAMES.has(name))
      violations.push(`${name || "empty"}:unexpected`);
  }

  const startedAt = Date.parse(mutationStartedAt ?? "");
  if (!expectedSecrets || !Number.isFinite(startedAt)) violations.push("verification_context_invalid");
  else {
    const afterByName = new Map(records.map((record) => [record.name, record]));
    for (const name of PRODUCTION_FUNCTION_SECRET_NAMES) {
      const record = afterByName.get(name);
      if (!record) continue;
      const expectedDigest = sha256(String(expectedSecrets[name] ?? ""));
      if (!exactDigest(record.digest, expectedDigest)) violations.push(`${name}:digest_mismatch`);
      const updatedAt = Date.parse(record.updatedAt);
      if (!Number.isFinite(updatedAt)) violations.push(`${name}:updated_at_invalid`);
      const before = beforeByName.get(name);
      const changed = before?.digest !== record.digest;
      if (changed && updatedAt < startedAt - 5_000) violations.push(`${name}:not_updated_by_mutation`);
      if (before && Number.isFinite(Date.parse(before.updatedAt)) && updatedAt < Date.parse(before.updatedAt))
        violations.push(`${name}:updated_at_regressed`);
    }
  }

  return {
    valid: violations.length === 0,
    violations,
    missing,
    configuredCount: PRODUCTION_FUNCTION_SECRET_NAMES.length,
  };
}
