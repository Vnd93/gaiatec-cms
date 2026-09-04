import { validateProductionConfig } from "./release-guard-lib.mjs";

const result = validateProductionConfig({
  supabaseProjectRef: process.env.PRODUCTION_SUPABASE_PROJECT_REF,
  supabaseUrl: process.env.PRODUCTION_SUPABASE_URL,
  supabaseAnonKey: process.env.PRODUCTION_SUPABASE_ANON_KEY,
  siteOrigin: process.env.PRODUCTION_SITE_ORIGIN,
  cloudflareProject: process.env.PRODUCTION_CLOUDFLARE_PROJECT,
});
if (!result.valid) throw new Error(`G12_PRODUCTION_CONFIG_BLOCKED:${result.violations.join(",")}`);
console.log(
  JSON.stringify({
    event: "g12.production.config.verified",
    projectRefConfigured: true,
    siteOrigin: process.env.PRODUCTION_SITE_ORIGIN,
    cloudflareProject: process.env.PRODUCTION_CLOUDFLARE_PROJECT,
  }),
);
