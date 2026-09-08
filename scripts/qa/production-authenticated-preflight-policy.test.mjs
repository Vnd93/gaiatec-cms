import assert from "node:assert/strict";
import test from "node:test";

import { authenticatedPreflightPolicy } from "./production-authenticated-preflight-policy.mjs";

const SHA = "a".repeat(40);
const base = {
  required: "true",
  candidateSha: SHA,
  previewUrl: "https://abc123.gaiatec-website.pages.dev",
  productionOrigin: "https://gaiatecsistemas.com.br",
  supabaseUrl: "https://chfuhctnhqgyjowkvllv.supabase.co",
  anonKey: "masked-anon-key",
  email: "operador@gaiatecsistemas.com.br",
  password: "masked-password",
  totpSecret: "JBSWY3DPEHPK3PXP",
};

test("authenticated production preflight is mandatory and never serializes credentials", () => {
  const enabled = authenticatedPreflightPolicy(base);
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.evidence.status, "pending");
  assert.equal(enabled.evidence.policyRequired, true);
  assert.equal(enabled.evidence.credentialsPersisted, false);
  assert.equal(enabled.evidence.tokensPersisted, false);
  const serialized = JSON.stringify(enabled);
  for (const secret of [base.email, base.password, base.totpSecret, base.anonKey]) {
    assert.equal(serialized.includes(secret), false);
  }

  assert.throws(
    () => authenticatedPreflightPolicy({ ...base, required: "false" }),
    /QA_CMS_PRODUCTION_PREFLIGHT_REQUIRED/,
  );
});

test("required preflight fails closed for missing credentials or non-corporate identity", () => {
  assert.throws(
    () => authenticatedPreflightPolicy({ ...base, password: "" }),
    /QA_CMS_PRODUCTION_PREFLIGHT_CREDENTIALS_REQUIRED/,
  );
  assert.throws(
    () => authenticatedPreflightPolicy({ ...base, email: "operator@example.com" }),
    /QA_CMS_PRODUCTION_PREFLIGHT_CREDENTIALS_REQUIRED/,
  );
  assert.throws(
    () => authenticatedPreflightPolicy({ ...base, totpSecret: "not-base32" }),
    /QA_CMS_PRODUCTION_PREFLIGHT_CREDENTIALS_REQUIRED/,
  );
});

test("preflight refuses staging, live-shell and unbound preview targets", () => {
  assert.throws(
    () => authenticatedPreflightPolicy({ ...base, supabaseUrl: "https://glcqsosxwgmlhzgcsnzv.supabase.co" }),
    /QA_CMS_PRODUCTION_PREFLIGHT_TARGET_REFUSED/,
  );
  assert.throws(
    () => authenticatedPreflightPolicy({ ...base, previewUrl: "https://gaiatecsistemas.com.br" }),
    /QA_CMS_PRODUCTION_PREFLIGHT_PREVIEW_REFUSED/,
  );
  assert.throws(
    () => authenticatedPreflightPolicy({ ...base, previewUrl: "https://attacker.example" }),
    /QA_CMS_PRODUCTION_PREFLIGHT_PREVIEW_REFUSED/,
  );
});
