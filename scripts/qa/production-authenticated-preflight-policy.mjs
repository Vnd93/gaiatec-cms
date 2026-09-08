const FULL_SHA = /^[a-f0-9]{40}$/;
const BASE32 = /^[A-Z2-7]+=*$/i;
const PRODUCTION_ORIGIN = "https://gaiatecsistemas.com.br";
const PRODUCTION_SUPABASE_ORIGIN = "https://chfuhctnhqgyjowkvllv.supabase.co";

function exactOrigin(value, errorCode) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(errorCode);
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) throw new Error(errorCode);
  return parsed.origin;
}

export function authenticatedPreflightPolicy(configuration) {
  const required = configuration.required ?? "true";
  if (required !== "true") {
    throw new Error("QA_CMS_PRODUCTION_PREFLIGHT_REQUIRED");
  }
  if (!FULL_SHA.test(configuration.candidateSha ?? "")) {
    throw new Error("QA_CMS_PRODUCTION_PREFLIGHT_SHA_INVALID");
  }
  const previewOrigin = exactOrigin(
    configuration.previewUrl ?? "",
    "QA_CMS_PRODUCTION_PREFLIGHT_PREVIEW_INVALID",
  );
  if (!/^https:\/\/[a-z0-9-]+\.gaiatec-website\.pages\.dev$/.test(previewOrigin)) {
    throw new Error("QA_CMS_PRODUCTION_PREFLIGHT_PREVIEW_REFUSED");
  }
  if (
    exactOrigin(configuration.productionOrigin ?? "", "QA_CMS_PRODUCTION_PREFLIGHT_ORIGIN_INVALID") !==
      PRODUCTION_ORIGIN ||
    exactOrigin(configuration.supabaseUrl ?? "", "QA_CMS_PRODUCTION_PREFLIGHT_BACKEND_INVALID") !==
      PRODUCTION_SUPABASE_ORIGIN
  ) {
    throw new Error("QA_CMS_PRODUCTION_PREFLIGHT_TARGET_REFUSED");
  }

  const domain = (configuration.allowedEmailDomain || "gaiatecsistemas.com.br").toLowerCase();
  const email = (configuration.email || "").trim().toLowerCase();
  if (
    !/^[a-z0-9.-]+$/.test(domain) ||
    !email.endsWith(`@${domain}`) ||
    !configuration.password ||
    configuration.password.length < 8 ||
    !BASE32.test(configuration.totpSecret || "") ||
    (configuration.totpSecret || "").replace(/=+$/, "").length < 16 ||
    !configuration.anonKey
  ) {
    throw new Error("QA_CMS_PRODUCTION_PREFLIGHT_CREDENTIALS_REQUIRED");
  }

  return {
    enabled: true,
    evidence: {
      schemaVersion: 1,
      event: "g12.production.authenticated_readonly_preflight",
      status: "pending",
      policyRequired: true,
      candidateSha: configuration.candidateSha,
      shell: "exact-sealed-cloudflare-preview-mapped-under-production-origin",
      backend: "supabase-production-real",
      cmsMutations: 0,
      credentialsPersisted: false,
      tokensPersisted: false,
      rawBrowserArtifacts: "disabled",
    },
  };
}

export const AUTHENTICATED_PREFLIGHT_PRODUCTION_ORIGIN = PRODUCTION_ORIGIN;
export const AUTHENTICATED_PREFLIGHT_SUPABASE_ORIGIN = PRODUCTION_SUPABASE_ORIGIN;
