import { managementRequest } from "./production-backend-lib.mjs";
import {
  expectedStagingAuthPatch,
  STAGING_AUTH_PROJECT_REF,
  STAGING_AUTH_REDIRECT_ALLOW_LIST,
  STAGING_AUTH_SITE_ORIGIN,
  stagingAuthConfigIsExact,
} from "./staging-auth-config-lib.mjs";

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (process.env.STAGING_SUPABASE_PROJECT_REF !== STAGING_AUTH_PROJECT_REF || !token)
  throw new Error("G12_STAGING_AUTH_CONFIG_BLOCKED");

const path = `/v1/projects/${STAGING_AUTH_PROJECT_REF}/config/auth`;
const verifyOnly = process.argv.includes("--verify-only");
if (!verifyOnly) {
  await managementRequest(path, {
    method: "PATCH",
    token,
    body: expectedStagingAuthPatch(),
  });
}

const config = await managementRequest(path, { token });
if (!stagingAuthConfigIsExact(config)) throw new Error("G12_STAGING_AUTH_CONFIG_VERIFICATION_FAILED");

console.log(
  JSON.stringify({
    event: "g12.staging.auth_config.verified",
    siteUrl: STAGING_AUTH_SITE_ORIGIN,
    redirectAllowList: STAGING_AUTH_REDIRECT_ALLOW_LIST,
    publicSignupDisabled: true,
    mode: verifyOnly ? "verify-only" : "configure-and-verify",
  }),
);
