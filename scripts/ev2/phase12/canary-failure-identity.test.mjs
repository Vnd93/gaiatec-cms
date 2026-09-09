import assert from "node:assert/strict";
import test from "node:test";

import { canaryFailureIdentity, canaryFailureStage } from "./canary-failure-identity.mjs";

test("reports the coded failure identity the canary helpers already produce", () => {
  // This is the shape request() throws, and it is exactly what a diagnosis needs: verb, path, status.
  assert.equal(
    canaryFailureIdentity(new Error("G12_STAGING_HTTP_FAILED:POST:/auth/v1/admin/users:429")),
    "G12_STAGING_HTTP_FAILED:POST:/auth/v1/admin/users:429",
  );
  assert.equal(
    canaryFailureIdentity(new Error("G12_STAGING_SYNTHETIC_ACTOR_INVALID")),
    "G12_STAGING_SYNTHETIC_ACTOR_INVALID",
  );
  assert.equal(canaryFailureIdentity(null), null);
  assert.equal(canaryFailureIdentity(undefined), null);
});

test("never echoes a message that is not a code", () => {
  // A driver or network error can carry a URL with a query string, an address or a token fragment.
  const leaks = [
    "connect ECONNREFUSED 10.0.0.1:5432",
    "request to https://x.supabase.co/rest/v1/t?apikey=sbp_secret failed",
    "duplicate key value violates unique constraint on user pedro@example.com",
    "invalid input syntax for uuid: 3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  ];
  for (const message of leaks) {
    const identity = canaryFailureIdentity(new Error(message));
    assert.equal(identity, "UNCODED_FAILURE:Error");
    assert.doesNotMatch(identity, /@|apikey|sbp_|\d+\.\d+\.\d+\.\d+/);
  }

  const named = new TypeError("fetch failed for https://x/y?token=abc");
  assert.equal(canaryFailureIdentity(named), "UNCODED_FAILURE:TypeError");

  // A hostile or malformed error class name is not reflected either.
  const hostile = new Error("boom");
  hostile.name = "Error: apikey=sbp_secret";
  assert.equal(canaryFailureIdentity(hostile), "UNCODED_FAILURE:Error");
});

test("separates a canary that stopped early from one whose checks disagreed", () => {
  const failure = new Error("G12_STAGING_SYNTHETIC_ACTOR_INVALID");
  assert.equal(canaryFailureStage({ operationError: failure, cleanupError: undefined }), "operation");
  assert.equal(canaryFailureStage({ operationError: undefined, cleanupError: failure }), "cleanup");
  assert.equal(
    canaryFailureStage({ operationError: failure, cleanupError: failure }),
    "operation-and-cleanup",
  );
  assert.equal(canaryFailureStage({ operationError: undefined, cleanupError: undefined }), null);
});
