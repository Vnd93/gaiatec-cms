export const STAGING_AUTH_PROJECT_REF = "glcqsosxwgmlhzgcsnzv";

export const STAGING_AUTH_SITE_ORIGIN = "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev";

export const STAGING_AUTH_REDIRECT_ALLOW_LIST = Object.freeze([
  "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev/**",
  "https://gaiatec-cms-staging.pages.dev/**",
]);

export function expectedStagingAuthPatch() {
  return {
    site_url: STAGING_AUTH_SITE_ORIGIN,
    uri_allow_list: STAGING_AUTH_REDIRECT_ALLOW_LIST.join(","),
    disable_signup: true,
  };
}

export function stagingAuthConfigIsExact(config) {
  const expected = expectedStagingAuthPatch();
  return (
    config?.site_url === expected.site_url &&
    config?.uri_allow_list === expected.uri_allow_list &&
    config?.disable_signup === expected.disable_signup
  );
}
