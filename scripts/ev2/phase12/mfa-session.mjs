// supabase-js returns the tokens of a verified MFA challenge at the top level of `data`, as
// AuthMFAVerifyResponseData, not nested under `data.session`. Reading only `data.session` therefore
// yields an empty refresh token on every successful verification, and no amount of retrying can
// recover from that: the verification succeeded, the extraction did not. Both shapes are accepted so
// the canary keeps working if a future release nests the session again.
export function mfaSessionTokens(response) {
  const data = response?.data ?? null;
  const nested = data?.session ?? null;
  const accessToken = nested?.access_token ?? data?.access_token ?? "";
  const refreshToken = nested?.refresh_token ?? data?.refresh_token ?? "";
  const usable = (value) => typeof value === "string" && value.length > 0;
  return {
    accessToken: usable(accessToken) ? accessToken : "",
    refreshToken: usable(refreshToken) ? refreshToken : "",
    complete: Boolean(response && !response.error && usable(accessToken) && usable(refreshToken)),
  };
}
