import assert from "node:assert/strict";
import test from "node:test";

import {
  expectedStagingAuthPatch,
  STAGING_AUTH_PROJECT_REF,
  STAGING_AUTH_REDIRECT_ALLOW_LIST,
  STAGING_AUTH_SITE_ORIGIN,
  stagingAuthConfigIsExact,
} from "./staging-auth-config-lib.mjs";

test("staging Auth is pinned to the exact CMS canary and closed signup", () => {
  assert.equal(STAGING_AUTH_PROJECT_REF, "glcqsosxwgmlhzgcsnzv");
  assert.equal(STAGING_AUTH_SITE_ORIGIN, "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev");
  assert.deepEqual(STAGING_AUTH_REDIRECT_ALLOW_LIST, [
    "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev/**",
    "https://gaiatec-cms-staging.pages.dev/**",
  ]);
  assert.ok(STAGING_AUTH_REDIRECT_ALLOW_LIST.every((entry) => !entry.includes("*.")));
  assert.deepEqual(expectedStagingAuthPatch(), {
    site_url: STAGING_AUTH_SITE_ORIGIN,
    uri_allow_list: STAGING_AUTH_REDIRECT_ALLOW_LIST.join(","),
    disable_signup: true,
  });
});

test("staging Auth verification fails closed on every altered binding", () => {
  const exact = expectedStagingAuthPatch();
  assert.equal(stagingAuthConfigIsExact(exact), true);
  assert.equal(stagingAuthConfigIsExact({ ...exact, disable_signup: false }), false);
  assert.equal(stagingAuthConfigIsExact({ ...exact, site_url: "https://example.invalid" }), false);
  assert.equal(
    stagingAuthConfigIsExact({ ...exact, uri_allow_list: `${exact.uri_allow_list},https://evil.invalid/**` }),
    false,
  );
  assert.equal(stagingAuthConfigIsExact(null), false);
});
