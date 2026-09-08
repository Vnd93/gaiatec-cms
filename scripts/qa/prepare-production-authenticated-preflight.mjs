import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import { authenticatedPreflightPolicy } from "./production-authenticated-preflight-policy.mjs";

const outputPath = resolve(
  process.env.QA_CMS_PRODUCTION_PREFLIGHT_REPORT_PATH ?? "outputs/cms-production-readonly-preflight.json",
);
const relativeOutput = relative(process.cwd(), outputPath);
if (
  isAbsolute(relativeOutput) ||
  !relativeOutput ||
  relativeOutput === ".." ||
  relativeOutput.startsWith("../") ||
  relativeOutput.startsWith("..\\")
) {
  throw new Error("QA_CMS_PRODUCTION_PREFLIGHT_REPORT_PATH_REFUSED");
}

const policy = authenticatedPreflightPolicy({
  required: process.env.QA_CMS_PRODUCTION_READONLY_PREFLIGHT_REQUIRED ?? "true",
  candidateSha: process.env.QA_CMS_EXPECTED_SHA,
  previewUrl: process.env.QA_CMS_SEALED_PREVIEW_URL,
  productionOrigin: process.env.PLAYWRIGHT_BASE_URL,
  supabaseUrl: process.env.QA_CMS_SUPABASE_URL,
  anonKey: process.env.QA_CMS_SUPABASE_ANON_KEY,
  email: process.env.QA_CMS_CORPORATE_EMAIL,
  password: process.env.QA_CMS_CORPORATE_PASSWORD,
  totpSecret: process.env.QA_CMS_CORPORATE_TOTP_SECRET,
  allowedEmailDomain: process.env.QA_CMS_CORPORATE_EMAIL_DOMAIN,
});

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(policy.evidence, null, 2)}\n`, {
  encoding: "utf8",
  mode: 0o600,
});
if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `enabled=${String(policy.enabled)}\n`, "utf8");
}
console.log(
  JSON.stringify({
    event: "g12.production.authenticated_readonly_preflight.policy_checked",
    candidateSha: policy.evidence.candidateSha,
    enabled: policy.enabled,
    secretsExposed: false,
  }),
);
