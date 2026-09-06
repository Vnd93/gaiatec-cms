export const PRODUCTION_PROJECT_REF = "chfuhctnhqgyjowkvllv";
export const PRODUCTION_SITE_ORIGIN = "https://gaiatecsistemas.com.br";
export const PRODUCTION_OPENROUTER_MODEL = "nvidia/nemotron-3.5-lightning:free";
export const PRODUCTION_REDIRECT_ALLOW_LIST = [
  "https://gaiatecsistemas.com.br/**",
  "https://www.gaiatecsistemas.com.br/**",
];

export const PUBLIC_FUNCTIONS = new Set(["cms-outbox-worker", "cms-preview", "cms-public", "lead-capture"]);

export const PRODUCTION_FUNCTIONS = [
  "cms-ai",
  "cms-ai-execute",
  "cms-attributes",
  "cms-bulk",
  "cms-collaboration",
  "cms-content",
  "cms-controlled-vocabularies",
  "cms-drafts-v2",
  "cms-leads",
  "cms-master-data",
  "cms-media",
  "cms-outbox-worker",
  "cms-pim",
  "cms-preview",
  "cms-public",
  "cms-quality",
  "cms-releases",
  "cms-scopes",
  "cms-search-admin",
  "cms-session",
  "cms-sites",
  "cms-system",
  "cms-users",
  "cms-visual",
  "lead-capture",
  "rdo-command",
  "rdo-invite",
  "rdo-notify",
  "rdo-otp",
  "rdo-sign",
  "rdo-team",
  "submit-contact",
];

const requiredSecretNames = [
  "EVIDENCE_SALT",
  "LEAD_EVIDENCE_SALT",
  "OUTBOX_WORKER_SECRET",
  "RATE_LIMIT_SALT",
];

function clean(value) {
  return String(value ?? "").trim();
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value));
}

function validateDatabaseUrl(value, projectRef) {
  try {
    const parsed = new URL(value);
    const directHost = `db.${projectRef}.supabase.co`;
    const isDirect = parsed.hostname === directHost && parsed.username === "postgres";
    const isPooler =
      parsed.hostname.endsWith(".pooler.supabase.com") && parsed.username === `postgres.${projectRef}`;
    return (
      ["postgres:", "postgresql:"].includes(parsed.protocol) &&
      (isDirect || isPooler) &&
      parsed.pathname === "/postgres" &&
      parsed.password.length >= 16 &&
      parsed.searchParams.get("sslmode") === "require"
    );
  } catch {
    return false;
  }
}

export function validateProductionBackendConfig(env) {
  const violations = [];
  const projectRef = clean(env.PRODUCTION_SUPABASE_PROJECT_REF);
  const siteOrigin = clean(env.PRODUCTION_SITE_ORIGIN).replace(/\/$/, "");
  const expectedApiUrl = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
  const origins = clean(env.ALLOWED_ORIGINS)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .sort();
  const expectedOrigins = [PRODUCTION_SITE_ORIGIN, "https://www.gaiatecsistemas.com.br"].sort();

  if (projectRef !== PRODUCTION_PROJECT_REF) violations.push("production_project_ref_invalid");
  if (clean(env.PRODUCTION_SUPABASE_URL).replace(/\/$/, "") !== expectedApiUrl)
    violations.push("production_api_url_invalid");
  if (!validateDatabaseUrl(clean(env.PRODUCTION_SUPABASE_DB_URL), projectRef))
    violations.push("production_database_url_invalid");
  if (clean(env.PRODUCTION_SUPABASE_ANON_KEY).length < 30) violations.push("production_anon_key_missing");
  if (!clean(env.SUPABASE_ACCESS_TOKEN).startsWith("sbp_") || clean(env.SUPABASE_ACCESS_TOKEN).length < 24)
    violations.push("supabase_access_token_invalid");
  if (siteOrigin !== PRODUCTION_SITE_ORIGIN) violations.push("production_site_origin_invalid");
  if (JSON.stringify(origins) !== JSON.stringify(expectedOrigins)) violations.push("allowed_origins_invalid");
  if (!clean(env.RESEND_API_KEY).startsWith("re_") || clean(env.RESEND_API_KEY).length < 20)
    violations.push("resend_api_key_invalid");
  if (!validEmail(env.LEAD_NOTIFICATION_TO)) violations.push("lead_notification_email_invalid");
  if (!/^.+<[^\s@]+@gaiatecsistemas\.com>$/.test(clean(env.EMAIL_FROM)))
    violations.push("email_from_invalid");
  if (clean(env.VITE_TURNSTILE_SITE_KEY).length < 10) violations.push("turnstile_site_key_missing");
  if (clean(env.TURNSTILE_SECRET_KEY).length < 10) violations.push("turnstile_secret_key_missing");
  if (clean(env.CMS_EV2_PRODUCTION_ENABLED) !== "true")
    violations.push("ev2_production_switch_must_be_enabled");
  if (clean(env.CMS_AI_EXTERNAL_PROVIDER_ENABLED) !== "true")
    violations.push("external_ai_provider_must_be_enabled");
  if (clean(env.OPENROUTER_MODEL) !== PRODUCTION_OPENROUTER_MODEL)
    violations.push("openrouter_model_invalid");
  if (!clean(env.OPENROUTER_API_KEY).startsWith("sk-or-") || clean(env.OPENROUTER_API_KEY).length < 24)
    violations.push("openrouter_api_key_invalid");
  if (clean(env.CONTACT_CAPTCHA_ALWAYS) !== "true") violations.push("contact_captcha_must_be_required");

  const secretValues = requiredSecretNames.map((name) => clean(env[name]));
  for (const [index, value] of secretValues.entries()) {
    if (!/^[a-f0-9]{64}$/.test(value)) violations.push(`${requiredSecretNames[index].toLowerCase()}_invalid`);
  }
  if (new Set(secretValues).size !== secretValues.length)
    violations.push("operational_secrets_must_be_unique");

  return { valid: violations.length === 0, violations };
}

export function escapeSqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export async function managementRequest(path, { method = "GET", token, body } = {}) {
  const response = await fetch(`https://api.supabase.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok)
    throw new Error(`SUPABASE_MANAGEMENT_REQUEST_FAILED:${method}:${path}:${response.status}`);
  return response.status === 204 ? null : response.json();
}

export function normalizeFunctionRecord(record) {
  return {
    name: String(record.name ?? record.slug ?? ""),
    status: String(record.status ?? "").toUpperCase(),
    verifyJwt: Boolean(record.verify_jwt ?? record.verifyJwt),
    version: Number(record.version ?? 0),
  };
}

export function evaluateFunctionInventory(payload) {
  const records = (Array.isArray(payload) ? payload : (payload.functions ?? [])).map(normalizeFunctionRecord);
  const byName = new Map(records.map((record) => [record.name, record]));
  const violations = [];
  for (const name of PRODUCTION_FUNCTIONS) {
    const record = byName.get(name);
    if (!record) violations.push(`${name}:missing`);
    else {
      if (record.status !== "ACTIVE") violations.push(`${name}:inactive`);
      if (record.version < 1) violations.push(`${name}:version_invalid`);
      if (record.verifyJwt === PUBLIC_FUNCTIONS.has(name)) violations.push(`${name}:verify_jwt_invalid`);
    }
  }
  for (const name of byName.keys()) {
    if (!PRODUCTION_FUNCTIONS.includes(name)) violations.push(`${name}:unexpected`);
  }
  return { valid: violations.length === 0, violations, records };
}
