import { validateProductionBackendConfig } from "./production-backend-lib.mjs";

const result = validateProductionBackendConfig(process.env);
if (!result.valid) throw new Error(`G12_PRODUCTION_BACKEND_CONFIG_BLOCKED:${result.violations.join(",")}`);

console.log(
  JSON.stringify({
    event: "g12.production.backend_config.verified",
    projectRef: process.env.PRODUCTION_SUPABASE_PROJECT_REF,
    siteOrigin: process.env.PRODUCTION_SITE_ORIGIN,
    externalAiProviderEnabled: process.env.CMS_AI_EXTERNAL_PROVIDER_ENABLED === "true",
    captchaRequired: process.env.CONTACT_CAPTCHA_ALWAYS === "true",
    protectedSecretsVerified: 11,
  }),
);
