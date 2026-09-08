import {
  managementRequest,
  PRODUCTION_PROJECT_REF,
  PRODUCTION_REDIRECT_ALLOW_LIST,
  PRODUCTION_SITE_ORIGIN,
} from "./production-backend-lib.mjs";

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (process.env.PRODUCTION_SUPABASE_PROJECT_REF !== PRODUCTION_PROJECT_REF || !token)
  throw new Error("G12_PRODUCTION_AUTH_CONFIG_BLOCKED");

const path = `/v1/projects/${PRODUCTION_PROJECT_REF}/config/auth`;
const verifyOnly = process.argv.includes("--verify-only");
if (!verifyOnly)
  await managementRequest(path, {
    method: "PATCH",
    token,
    body: {
      site_url: PRODUCTION_SITE_ORIGIN,
      uri_allow_list: PRODUCTION_REDIRECT_ALLOW_LIST.join(","),
      disable_signup: true,
    },
  });

const config = await managementRequest(path, { token });
const valid =
  config.site_url === PRODUCTION_SITE_ORIGIN &&
  config.uri_allow_list === PRODUCTION_REDIRECT_ALLOW_LIST.join(",") &&
  config.disable_signup === true;
if (!valid) throw new Error("G12_PRODUCTION_AUTH_CONFIG_VERIFICATION_FAILED");

console.log(
  JSON.stringify({
    event: "g12.production.auth_config.verified",
    siteUrl: config.site_url,
    redirectAllowList: PRODUCTION_REDIRECT_ALLOW_LIST,
    publicSignupDisabled: true,
    mode: verifyOnly ? "verify-only" : "configure-and-verify",
  }),
);
