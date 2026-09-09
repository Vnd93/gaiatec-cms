import assert from "node:assert/strict";
import test from "node:test";

import { mfaSessionTokens } from "./mfa-session.mjs";

// This is the shape @supabase/auth-js actually returns for mfa.verify: AuthMFAVerifyResponseData,
// with the tokens at the top level of data and no session wrapper.
const verified = {
  data: {
    access_token: "access-token-value",
    token_type: "bearer",
    expires_in: 3600,
    refresh_token: "refresh-token-value",
    user: { id: "00000000-0000-4000-8000-000000000001" },
  },
  error: null,
};

test("reads the tokens where the auth client actually puts them", () => {
  const tokens = mfaSessionTokens(verified);
  assert.equal(tokens.accessToken, "access-token-value");
  assert.equal(tokens.refreshToken, "refresh-token-value");
  assert.equal(tokens.complete, true);
});

test("still reads a nested session if a future release wraps it again", () => {
  const nested = {
    data: { session: { access_token: "nested-access", refresh_token: "nested-refresh" } },
    error: null,
  };
  const tokens = mfaSessionTokens(nested);
  assert.equal(tokens.accessToken, "nested-access");
  assert.equal(tokens.refreshToken, "nested-refresh");
  assert.equal(tokens.complete, true);
});

test("refuses to call a verification complete when a token is missing", () => {
  // The defect this replaces: reading only data.session left the refresh token empty on every
  // successful verification, so the canary retried a code that had already been accepted.
  const sessionOnly = { data: { access_token: "only-access" }, error: null };
  assert.equal(mfaSessionTokens(sessionOnly).refreshToken, "");
  assert.equal(mfaSessionTokens(sessionOnly).complete, false);

  assert.equal(mfaSessionTokens({ data: verified.data, error: { status: 422 } }).complete, false);
  assert.equal(mfaSessionTokens({ data: { access_token: "", refresh_token: "" } }).complete, false);
  assert.equal(mfaSessionTokens(null).complete, false);
  assert.equal(mfaSessionTokens(undefined).accessToken, "");
});
