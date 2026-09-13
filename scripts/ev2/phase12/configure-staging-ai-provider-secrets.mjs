import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  evaluateStagingAiProviderSecretTransition,
  STAGING_AI_EXTERNAL_PROVIDER_ENABLED,
  STAGING_OPENROUTER_MODEL,
} from "./staging-ai-provider-secrets-lib.mjs";

const STAGING_PROJECT_REF = "glcqsosxwgmlhzgcsnzv";
if (process.env.STAGING_SUPABASE_PROJECT_REF !== STAGING_PROJECT_REF || !process.env.SUPABASE_ACCESS_TOKEN)
  throw new Error("G12_STAGING_AI_PROVIDER_SECRET_CONFIGURATION_BLOCKED");

function supabase(args, capture = false) {
  const result = spawnSync("supabase", args, {
    encoding: "utf8",
    env: process.env,
    stdio: capture ? ["ignore", "pipe", "ignore"] : ["ignore", "ignore", "ignore"],
    timeout: 5 * 60 * 1000,
  });
  if (result.error || result.status !== 0)
    throw new Error(`G12_STAGING_AI_PROVIDER_SECRET_CLI_FAILED:${args[0] ?? "unknown"}`);
  return result.stdout ?? "";
}

function listSecrets() {
  return JSON.parse(
    supabase(["secrets", "list", "--project-ref", STAGING_PROJECT_REF, "--output", "json"], true),
  );
}

const temporaryDirectory = await mkdtemp(join(tmpdir(), "g12-staging-ai-provider-"));
const envFile = join(temporaryDirectory, "provider.env");
try {
  const before = listSecrets();
  await writeFile(
    envFile,
    `OPENROUTER_MODEL=${JSON.stringify(STAGING_OPENROUTER_MODEL)}\nCMS_AI_EXTERNAL_PROVIDER_ENABLED=${JSON.stringify(STAGING_AI_EXTERNAL_PROVIDER_ENABLED)}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  supabase(["secrets", "set", "--project-ref", STAGING_PROJECT_REF, "--env-file", envFile]);
  const result = evaluateStagingAiProviderSecretTransition(before, listSecrets());
  if (!result.valid)
    throw new Error(`G12_STAGING_AI_PROVIDER_SECRET_VERIFICATION_FAILED:${result.violations.join(",")}`);
  console.log(
    JSON.stringify({
      event: "g12.staging.ai_provider_secrets.verified",
      model: STAGING_OPENROUTER_MODEL,
      modelDigest: result.modelDigest,
      switchDigest: result.switchDigest,
      apiKeyPreserved: result.apiKeyPreserved,
      valuesDisclosed: 0,
    }),
  );
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
