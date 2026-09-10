import assert from "node:assert/strict";
import test from "node:test";

import {
  authFailureIdentity,
  canaryFailureIdentity,
  canaryFailureStage,
} from "./canary-failure-identity.mjs";

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

test("carries the auth service status and slug without carrying anything else", () => {
  assert.equal(authFailureIdentity({ status: 422, code: "invalid_totp" }), "422:invalid_totp");
  assert.equal(
    authFailureIdentity({ status: 429, code: "over_request_rate_limit" }),
    "429:over_request_rate_limit",
  );
  assert.equal(authFailureIdentity({ status: 0, code: "session_incomplete" }), "0:session_incomplete");

  // A free-text message, an address or a token fragment must never ride along in the slug.
  assert.equal(
    authFailureIdentity({ status: 400, code: "Invalid TOTP for pedro@example.com" }),
    "400:unknown",
  );
  assert.equal(authFailureIdentity({ status: 400, code: "sbp_secret_value" }), "400:unknown");
  assert.equal(authFailureIdentity({ status: 999, code: "invalid_totp" }), "0:invalid_totp");
  assert.equal(authFailureIdentity(undefined), "0:unknown");

  // The result has to survive the coded-failure filter, otherwise the diagnosis is dropped.
  const coded = `G12_STAGING_SYNTHETIC_MFA_VERIFY_FAILED:${authFailureIdentity({ status: 422, code: "invalid_totp" })}`;
  assert.equal(canaryFailureIdentity(new Error(coded)), coded);
});

test("the MFA retry waits for a new TOTP window instead of resending the same code", async () => {
  const { readFile } = await import("node:fs/promises");
  const canary = await readFile("scripts/ev2/phase12/staging-migrations-canary.mjs", "utf8");
  const start = canary.indexOf("G12_STAGING_SYNTHETIC_MFA_ENROLL_FAILED");
  const loop = canary.slice(start, canary.indexOf("G12_STAGING_SYNTHETIC_MFA_VERIFY_FAILED", start));

  // A retry inside the same 30 second window sends an identical code and proves nothing.
  assert.match(loop, /Math\.floor\(clock \/ 30_000\) \+ 1\) \* 30_000/);
  assert.doesNotMatch(loop, /setTimeout\(resolve, attempt \* 1000\)/);
});

test("a failed teardown names the closer and keeps attempting the rest", async () => {
  const { readFile } = await import("node:fs/promises");
  const canary = await readFile("scripts/ev2/phase12/staging-migrations-canary.mjs", "utf8");
  const start = canary.indexOf("async function closeFixtures()");
  const closeFixtures = canary.slice(start, canary.indexOf("async function residue()", start));

  // The old teardown swallowed every closer identically, so a failure said only that something failed.
  assert.doesNotMatch(closeFixtures, /catch \{/);
  assert.match(closeFixtures, /closer: close\.name/);
  assert.match(closeFixtures, /canaryFailureIdentity\(error\)/);
  assert.match(closeFixtures, /FIXTURE_CLOSE_FAILED:\$\{fixtureCloseFailures\[0\]\.closer\}/);

  // One broken closer must not leave the remaining ones unattempted, so the loop cannot rethrow early.
  assert.ok(
    closeFixtures.indexOf("catch (error)") < closeFixtures.indexOf("if (fixtureCloseFailures.length)"),
  );

  // The detail has to reach the report, not just the thrown message.
  assert.match(canary, /^\s*fixtureCloseFailures,$/m);
});

test("a timed out call says how long it was given, and the neutralization gets a measured budget", async () => {
  const { readFile } = await import("node:fs/promises");
  const canary = await readFile("scripts/ev2/phase12/staging-migrations-canary.mjs", "utf8");

  // A bare TimeoutError cannot tell a slow operation from a stuck one; the elapsed budget can.
  assert.match(canary, /G12_STAGING_HTTP_TIMEOUT:\$\{method\}/);
  assert.match(canary, /signal: AbortSignal\.timeout\(timeoutMs\)/);
  assert.match(canary, /elapsedMs: Date\.now\(\) - startedAt/);

  // The longer budget is deliberate, bounded and applies only to the neutralization teardown.
  assert.match(canary, /timeoutMs = 45_000/);
  const overrides = [...canary.matchAll(/timeoutMs: (\d[\d_]*)/g)].map((m) => m[1]);
  assert.deepEqual(overrides, ["120_000"]);
  const close = canary.slice(canary.indexOf("async function closeDocumentFixture()"));
  assert.match(close.slice(0, 1500), /timeoutMs: 120_000/);

  // The measurement has to reach the report, otherwise the run proves nothing about the duration.
  assert.match(canary, /documentNeutralizationMs = neutralized\.elapsedMs/);
  assert.match(canary, /^\s*documentNeutralizationMs,$/m);

  // The coded timeout must survive the sanitizer so the diagnosis is not dropped.
  const coded = "G12_STAGING_HTTP_TIMEOUT:POST:/functions/v1/cms-documents:120001";
  assert.equal(canaryFailureIdentity(new Error(coded)), coded);
});
