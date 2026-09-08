import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildProductionFunctionSecrets,
  evaluateProductionCloudflareBinding,
  evaluateProductionFunctionSecretInventory,
  PRODUCTION_FUNCTION_SECRET_NAMES,
  serializeProductionFunctionSecrets,
} from "./production-function-secrets-lib.mjs";
import { productionCloudflareApprovalTarget } from "./production-backend-lib.mjs";

function validEnvironment() {
  const environment = {
    PRODUCTION_SUPABASE_PROJECT_REF: "chfuhctnhqgyjowkvllv",
    SUPABASE_ACCESS_TOKEN: `sbp_${"a".repeat(32)}`,
    ALLOWED_ORIGINS: "https://gaiatecsistemas.com.br,https://www.gaiatecsistemas.com.br",
    TURNSTILE_ALLOWED_HOSTNAMES: "gaiatecsistemas.com.br,www.gaiatecsistemas.com.br",
    RATE_LIMIT_SALT: "1".repeat(64),
    EVIDENCE_SALT: "2".repeat(64),
    LEAD_EVIDENCE_SALT: "3".repeat(64),
    TURNSTILE_SECRET_KEY: "turnstile-secret",
    RESEND_API_KEY: `re_${"r".repeat(24)}`,
    EMAIL_FROM: "GAIATEC <no-reply@gaiatecsistemas.com>",
    LEAD_NOTIFICATION_TO: "leads@gaiatecsistemas.com",
    OUTBOX_WORKER_SECRET: "4".repeat(64),
    OPENROUTER_API_KEY: `sk-or-${"o".repeat(24)}`,
    OPENROUTER_MODEL: "nvidia/nemotron-3.5-lightning:free",
    CMS_EV2_PRODUCTION_ENABLED: "true",
    CMS_AI_EXTERNAL_PROVIDER_ENABLED: "true",
    CLOUDFLARE_ACCOUNT_ID: "6".repeat(32),
    CLOUDFLARE_ZONE_ID: "5".repeat(32),
    CLOUDFLARE_CACHE_PURGE_TOKEN_ID: "7".repeat(32),
    CLOUDFLARE_CACHE_PURGE_TOKEN: "cloudflare-dedicated-cache-purge-token-value",
  };
  environment.APPROVED_EMAIL_FROM_SHA256 = createHash("sha256").update(environment.EMAIL_FROM).digest("hex");
  environment.APPROVED_LEAD_NOTIFICATION_TO_SHA256 = createHash("sha256")
    .update(environment.LEAD_NOTIFICATION_TO)
    .digest("hex");
  environment.APPROVED_CLOUDFLARE_TARGET_SHA256 = createHash("sha256")
    .update(
      productionCloudflareApprovalTarget({
        accountId: environment.CLOUDFLARE_ACCOUNT_ID,
        zoneId: environment.CLOUDFLARE_ZONE_ID,
        cachePurgeTokenId: environment.CLOUDFLARE_CACHE_PURGE_TOKEN_ID,
      }),
    )
    .digest("hex");
  return environment;
}

test("production function secret set is exact, production-bound and safe to serialize", () => {
  const env = validEnvironment();
  const secrets = buildProductionFunctionSecrets(env);
  assert.deepEqual(Object.keys(secrets), PRODUCTION_FUNCTION_SECRET_NAMES);
  assert.equal(secrets.CMS_AI_EXTERNAL_PROVIDER_ENABLED, "true");
  assert.equal(secrets.CONTACT_CAPTCHA_ALWAYS, "true");
  assert.equal(secrets.TURNSTILE_EXPECTED_ACTION, "lead_capture");
  const serialized = serializeProductionFunctionSecrets(secrets);
  assert.equal(serialized.split("\n").filter(Boolean).length, PRODUCTION_FUNCTION_SECRET_NAMES.length);
  assert.doesNotMatch(serialized, /SUPABASE_ACCESS_TOKEN|sbp_/);
});

test("function secret configuration rejects origin widening and env-file injection", () => {
  assert.throws(
    () =>
      buildProductionFunctionSecrets({
        ...validEnvironment(),
        ALLOWED_ORIGINS: "https://gaiatecsistemas.com.br,https://branch.pages.dev",
      }),
    /allowed_origins_invalid/,
  );
  assert.throws(
    () =>
      buildProductionFunctionSecrets({
        ...validEnvironment(),
        RESEND_API_KEY: `re_valid\nUNSAFE=value`,
      }),
    /resend_api_key_invalid/,
  );
  assert.throws(
    () =>
      buildProductionFunctionSecrets({
        ...validEnvironment(),
        TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
      }),
    /turnstile_test_credential_forbidden/,
  );
});

test("function secret inventory requires exact digests, timestamps, cardinality and allowlist", () => {
  const expectedSecrets = buildProductionFunctionSecrets(validEnvironment());
  const timestamp = "2026-09-07T12:00:00.000Z";
  const complete = [
    ...PRODUCTION_FUNCTION_SECRET_NAMES.map((name) => ({
      name,
      digest: createHash("sha256").update(expectedSecrets[name]).digest("hex"),
      updated_at: timestamp,
    })),
    { name: "SUPABASE_URL", digest: "a".repeat(64), updated_at: timestamp },
  ];
  const context = { expectedSecrets, mutationStartedAt: timestamp };
  const result = evaluateProductionFunctionSecretInventory(complete, context);
  assert.equal(result.valid, true);
  assert.deepEqual(result.violations, []);
  assert.deepEqual(result.missing, []);
  assert.equal(result.configuredCount, PRODUCTION_FUNCTION_SECRET_NAMES.length);
  const incomplete = complete.filter((record) => record.name !== "OUTBOX_WORKER_SECRET");
  const missing = evaluateProductionFunctionSecretInventory({ secrets: incomplete }, context);
  assert.equal(missing.valid, false);
  assert.deepEqual(missing.missing, ["OUTBOX_WORKER_SECRET"]);

  const malformed = [
    ...complete,
    complete[0],
    { name: "UNMANAGED_SECRET", digest: "b".repeat(64), updated_at: timestamp },
  ].map((record, index) =>
    index === 1 ? { ...record, digest: "0".repeat(64), updated_at: "2020-01-01T00:00:00Z" } : record,
  );
  const rejected = evaluateProductionFunctionSecretInventory(malformed, context);
  assert.equal(rejected.valid, false);
  assert.match(rejected.violations.join(","), /duplicate/);
  assert.match(rejected.violations.join(","), /UNMANAGED_SECRET:unexpected/);
  assert.match(rejected.violations.join(","), /digest_mismatch/);
  assert.match(rejected.violations.join(","), /not_updated_by_mutation/);
});

test("mailbox values and AI switch must match the immutable approval/environment binding", () => {
  assert.throws(
    () =>
      buildProductionFunctionSecrets({ ...validEnvironment(), APPROVED_EMAIL_FROM_SHA256: "0".repeat(64) }),
    /email_from_approval_mismatch/,
  );
  assert.throws(
    () =>
      buildProductionFunctionSecrets({ ...validEnvironment(), CMS_AI_EXTERNAL_PROVIDER_ENABLED: "false" }),
    /external_ai_provider_switch_invalid/,
  );
  assert.throws(
    () =>
      buildProductionFunctionSecrets({
        ...validEnvironment(),
        CLOUDFLARE_CACHE_PURGE_TOKEN_ID: "8".repeat(32),
      }),
    /cloudflare_target_approval_mismatch/,
  );
});

test("Cloudflare purge credential is bound to the exact active token, account and zone", () => {
  const binding = {
    zonePayload: {
      result: [
        {
          id: "5".repeat(32),
          name: "gaiatecsistemas.com.br",
          status: "active",
          account: { id: "6".repeat(32) },
        },
      ],
      result_info: { total_count: 1 },
    },
    tokenPayload: { result: { id: "7".repeat(32), status: "active" } },
    expectedAccountId: "6".repeat(32),
    expectedZoneId: "5".repeat(32),
    expectedPurgeTokenId: "7".repeat(32),
    discoveryToken: "pages-token-with-zone-read-capability-long",
    purgeToken: "dedicated-cache-purge-only-token-long",
  };
  assert.deepEqual(evaluateProductionCloudflareBinding(binding), { valid: true, violations: [] });
  assert.match(
    evaluateProductionCloudflareBinding({
      ...binding,
      expectedZoneId: "8".repeat(32),
      expectedPurgeTokenId: "9".repeat(32),
      purgeToken: binding.discoveryToken,
    }).violations.join(","),
    /cloudflare_tokens_not_separated.*cloudflare_zone_binding_invalid.*cloudflare_purge_token_binding_invalid/,
  );
});

test("account-owned Cloudflare token is verified through the account endpoint", async () => {
  const configurator = await readFile(
    new URL("./configure-production-function-secrets.mjs", import.meta.url),
    "utf8",
  );
  assert.match(configurator, /cloudflare\(`\/accounts\/\$\{accountId\}\/tokens\/verify`, purgeToken\)/);
  assert.doesNotMatch(configurator, /\/user\/tokens\/verify/);
});
