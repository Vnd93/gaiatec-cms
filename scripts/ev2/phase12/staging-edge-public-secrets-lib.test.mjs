import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  evaluateStagingEdgePublicSecretTransition,
  expectedStagingEdgePublicSecrets,
  STAGING_EDGE_PUBLIC_SECRET_NAMES,
  validateStagingEdgeSecretInventory,
} from "./staging-edge-public-secrets-lib.mjs";

const candidateSha = "a".repeat(40);
const digest = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const record = (name, value) => ({ name, value: digest(value) });

function validTransition() {
  const expected = expectedStagingEdgePublicSecrets(candidateSha);
  const before = [record("OPENROUTER_API_KEY", "private-runtime-value")];
  const after = [...before, ...STAGING_EDGE_PUBLIC_SECRET_NAMES.map((name) => record(name, expected[name]))];
  return { before, after };
}

test("the staging Edge public contract is exact and binds CMS_RELEASE_SHA", () => {
  const expected = expectedStagingEdgePublicSecrets(candidateSha);
  assert.deepEqual(Object.keys(expected).sort(), [...STAGING_EDGE_PUBLIC_SECRET_NAMES]);
  assert.equal(expected.CMS_RELEASE_SHA, candidateSha);
  assert.equal(expected.CMS_ENVIRONMENT, "staging");
  assert.equal(expected.CONTACT_CAPTCHA_ALWAYS, "true");
  assert.throws(
    () => expectedStagingEdgePublicSecrets("not-a-sha"),
    /G12_STAGING_EDGE_PUBLIC_SECRET_CANDIDATE_SHA_REFUSED/,
  );
});

test("the transition accepts exact managed digests and preserves every unmanaged digest", () => {
  const { before, after } = validTransition();
  assert.deepEqual(validateStagingEdgeSecretInventory(before), {
    valid: true,
    violations: [],
    secretCount: 1,
  });
  const result = evaluateStagingEdgePublicSecretTransition(before, after, candidateSha);
  assert.equal(result.valid, true);
  assert.deepEqual(result.violations, []);
  assert.equal(result.unmanagedSecretCount, 1);
  assert.equal(result.unmanagedSecretsPreserved, true);
  assert.deepEqual(Object.keys(result.expectedDigests).sort(), [...STAGING_EDGE_PUBLIC_SECRET_NAMES]);
});

test("the transition fails closed on digest drift, ambiguous inventory, or any unmanaged change", () => {
  const { before, after } = validTransition();
  const drifted = structuredClone(after);
  drifted.find(({ name }) => name === "CMS_ENVIRONMENT").value = digest("production");
  assert.deepEqual(evaluateStagingEdgePublicSecretTransition(before, drifted, candidateSha).violations, [
    "managed_digest_mismatch:CMS_ENVIRONMENT",
  ]);

  const duplicate = [...after, after[0]];
  assert.equal(
    evaluateStagingEdgePublicSecretTransition(before, duplicate, candidateSha).violations.includes(
      "secret_inventory_ambiguous",
    ),
    true,
  );

  const changedPrivate = structuredClone(after);
  changedPrivate[0].value = digest("different-private-value");
  assert.equal(
    evaluateStagingEdgePublicSecretTransition(before, changedPrivate, candidateSha).violations.includes(
      "unmanaged_digest_changed",
    ),
    true,
  );

  const addedPrivate = [...after, record("UNEXPECTED_PRIVATE_SECRET", "private")];
  assert.equal(
    evaluateStagingEdgePublicSecretTransition(before, addedPrivate, candidateSha).violations.includes(
      "unmanaged_inventory_changed",
    ),
    true,
  );

  const invalid = structuredClone(after);
  invalid.push({ name: "BROKEN", value: "not-a-digest" });
  assert.equal(validateStagingEdgeSecretInventory(invalid).valid, false);
  assert.equal(
    evaluateStagingEdgePublicSecretTransition(before, invalid, candidateSha).violations.includes(
      "secret_inventory_invalid",
    ),
    true,
  );
});
