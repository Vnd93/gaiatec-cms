import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import {
  buildProductionFunctionSecrets,
  evaluateProductionCloudflareBinding,
  evaluateProductionFunctionSecretInventory,
  serializeProductionFunctionSecrets,
} from "./production-function-secrets-lib.mjs";

function runSupabase(arguments_, { capture = false } = {}) {
  const result = spawnSync("supabase", arguments_, {
    encoding: "utf8",
    env: process.env,
    stdio: capture ? ["ignore", "pipe", "pipe"] : ["ignore", "ignore", "pipe"],
    timeout: 5 * 60 * 1000,
  });
  if (result.error || result.status !== 0)
    throw new Error(`G12_PRODUCTION_FUNCTION_SECRETS_CLI_FAILED:${arguments_[1] ?? "unknown"}`);
  return result.stdout ?? "";
}

async function cloudflare(path, token, init = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success !== true)
    throw new Error(`G12_PRODUCTION_CLOUDFLARE_SECRET_BINDING_FAILED:${response.status}`);
  return payload;
}

async function resolveAndVerifyCloudflareBinding() {
  const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID ?? "");
  const expectedZoneId = String(process.env.CLOUDFLARE_ZONE_ID ?? "");
  const expectedPurgeTokenId = String(process.env.CLOUDFLARE_CACHE_PURGE_TOKEN_ID ?? "");
  const discoveryToken = String(process.env.CLOUDFLARE_API_TOKEN ?? "");
  const purgeToken = String(process.env.CLOUDFLARE_CACHE_PURGE_TOKEN ?? "");
  if (
    !/^[a-f0-9]{32}$/.test(accountId) ||
    !/^[a-f0-9]{32}$/.test(expectedZoneId) ||
    !/^[a-f0-9]{32}$/.test(expectedPurgeTokenId) ||
    discoveryToken.length < 30 ||
    purgeToken.length < 30 ||
    purgeToken === discoveryToken
  )
    throw new Error("G12_PRODUCTION_CLOUDFLARE_SECRET_BINDING_BLOCKED");
  const query = new URLSearchParams({
    name: "gaiatecsistemas.com.br",
    "account.id": accountId,
    status: "active",
    per_page: "2",
  });
  const [zonePayload, tokenPayload] = await Promise.all([
    cloudflare(`/zones?${query}`, discoveryToken),
    cloudflare(`/accounts/${accountId}/tokens/verify`, purgeToken),
  ]);
  const binding = evaluateProductionCloudflareBinding({
    zonePayload,
    tokenPayload,
    expectedAccountId: accountId,
    expectedZoneId,
    expectedPurgeTokenId,
    discoveryToken,
    purgeToken,
  });
  if (!binding.valid)
    throw new Error(`G12_PRODUCTION_CLOUDFLARE_BINDING_REFUSED:${binding.violations.join(",")}`);
  const runIdentity = `${process.env.GITHUB_RUN_ID ?? "local"}-${process.env.GITHUB_RUN_ATTEMPT ?? "1"}`;
  await cloudflare(`/zones/${expectedZoneId}/purge_cache`, purgeToken, {
    method: "POST",
    body: JSON.stringify({ files: [`https://gaiatecsistemas.com.br/__g12-purge-capability-${runIdentity}`] }),
  });
  return { zoneId: expectedZoneId, token: purgeToken };
}

const cloudflareBinding = await resolveAndVerifyCloudflareBinding();
const verifyOnly = process.argv.includes("--verify-only");
const secrets = buildProductionFunctionSecrets({
  ...process.env,
  CLOUDFLARE_ZONE_ID: cloudflareBinding.zoneId,
  CLOUDFLARE_CACHE_PURGE_TOKEN: cloudflareBinding.token,
});
const temporaryDirectory = await mkdtemp(join(tmpdir(), "g12-production-function-secrets-"));
const envFile = join(temporaryDirectory, "functions.env");

try {
  const beforeInventory = JSON.parse(
    runSupabase(
      ["secrets", "list", "--project-ref", process.env.PRODUCTION_SUPABASE_PROJECT_REF, "--output", "json"],
      { capture: true },
    ),
  );
  const mutationStartedAt = new Date().toISOString();
  if (!verifyOnly) {
    await writeFile(envFile, serializeProductionFunctionSecrets(secrets), { encoding: "utf8", mode: 0o600 });
    runSupabase([
      "secrets",
      "set",
      "--project-ref",
      process.env.PRODUCTION_SUPABASE_PROJECT_REF,
      "--env-file",
      envFile,
    ]);
  }
  const inventory = JSON.parse(
    runSupabase(
      ["secrets", "list", "--project-ref", process.env.PRODUCTION_SUPABASE_PROJECT_REF, "--output", "json"],
      { capture: true },
    ),
  );
  const result = evaluateProductionFunctionSecretInventory(inventory, {
    expectedSecrets: secrets,
    beforePayload: beforeInventory,
    mutationStartedAt,
  });
  if (!result.valid)
    throw new Error(`G12_PRODUCTION_FUNCTION_SECRETS_VERIFICATION_FAILED:${result.violations.join(",")}`);
  console.log(
    JSON.stringify({
      event: "g12.production.function_secrets.verified",
      configuredCount: result.configuredCount,
      exactDigestBindingsVerified: result.configuredCount,
      updatedAtVerified: true,
      externalAiProviderEnabled: secrets.CMS_AI_EXTERNAL_PROVIDER_ENABLED === "true",
      cachePurgeCredentialVerified: true,
      mode: verifyOnly ? "verify-only" : "configure-and-verify",
      valuesDisclosed: 0,
    }),
  );
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
