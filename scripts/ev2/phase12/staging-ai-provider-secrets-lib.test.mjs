import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  evaluateStagingAiProviderSecretTransition,
  STAGING_AI_EXTERNAL_PROVIDER_ENABLED,
  STAGING_OPENROUTER_MODEL,
} from "./staging-ai-provider-secrets-lib.mjs";

const digest = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const apiKeyDigest = "a".repeat(64);

test("staging changes only the model policy and preserves the existing provider credential", () => {
  const result = evaluateStagingAiProviderSecretTransition(
    [{ name: "OPENROUTER_API_KEY", value: apiKeyDigest }],
    [
      { name: "OPENROUTER_API_KEY", value: apiKeyDigest },
      { name: "OPENROUTER_MODEL", value: digest(STAGING_OPENROUTER_MODEL) },
      {
        name: "CMS_AI_EXTERNAL_PROVIDER_ENABLED",
        value: digest(STAGING_AI_EXTERNAL_PROVIDER_ENABLED),
      },
    ],
  );
  assert.equal(result.valid, true);
  assert.equal(result.apiKeyPreserved, true);
  assert.deepEqual(result.violations, []);
});

test("staging fails closed on a missing, changed or ambiguous provider credential", () => {
  for (const [before, after, expected] of [
    [[], [], "openrouter_api_key_missing_before"],
    [
      [{ name: "OPENROUTER_API_KEY", value: apiKeyDigest }],
      [{ name: "OPENROUTER_API_KEY", value: "b".repeat(64) }],
      "openrouter_api_key_changed",
    ],
    [
      [
        { name: "OPENROUTER_API_KEY", value: apiKeyDigest },
        { name: "OPENROUTER_API_KEY", value: apiKeyDigest },
      ],
      [{ name: "OPENROUTER_API_KEY", value: apiKeyDigest }],
      "secret_inventory_ambiguous",
    ],
  ]) {
    const result = evaluateStagingAiProviderSecretTransition(before, after);
    assert.equal(result.valid, false);
    assert.ok(result.violations.includes(expected));
  }
});

test("staging verifies both public policy values by digest", () => {
  const before = [{ name: "OPENROUTER_API_KEY", digest: apiKeyDigest }];
  const base = [
    { name: "OPENROUTER_API_KEY", digest: apiKeyDigest },
    { name: "OPENROUTER_MODEL", digest: digest(STAGING_OPENROUTER_MODEL) },
    {
      name: "CMS_AI_EXTERNAL_PROVIDER_ENABLED",
      digest: digest(STAGING_AI_EXTERNAL_PROVIDER_ENABLED),
    },
  ];
  assert.equal(evaluateStagingAiProviderSecretTransition(before, base).valid, true);
  assert.ok(
    evaluateStagingAiProviderSecretTransition(before, [
      ...base.filter(({ name }) => name !== "OPENROUTER_MODEL"),
      { name: "OPENROUTER_MODEL", digest: "c".repeat(64) },
    ]).violations.includes("openrouter_model_digest_mismatch"),
  );
  assert.ok(
    evaluateStagingAiProviderSecretTransition(before, [
      ...base.filter(({ name }) => name !== "CMS_AI_EXTERNAL_PROVIDER_ENABLED"),
      { name: "CMS_AI_EXTERNAL_PROVIDER_ENABLED", digest: "d".repeat(64) },
    ]).violations.includes("external_provider_switch_digest_mismatch"),
  );
});
