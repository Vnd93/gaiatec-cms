const FAILURE_PATH_UUID_SEGMENT = /\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}(?=\/|$)/gi;
const AUTH_USER_RESIDUE_FAILURE_PATH = "/auth/v1/admin/users/_uuid";
const AUTH_USER_RESIDUE_RETRY_DELAYS_MS = [1_000, 2_000];

export function failurePath(url) {
  return new URL(url).pathname.replace(FAILURE_PATH_UUID_SEGMENT, "/_uuid");
}

export async function fetchStagingCanaryText(
  url,
  { method, headers, body, timeoutMs, fetchImpl = fetch, clock = Date.now },
) {
  const startedAt = clock();
  const safePath = failurePath(url);
  try {
    const response = await fetchImpl(url, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    return { response, text, elapsedMs: clock() - startedAt };
  } catch (error) {
    // The response body can time out after fetch() has already resolved with its headers. Normalize
    // both phases so retry policy and published evidence see the same bounded, identifier-safe code.
    if (error?.name === "TimeoutError" || error?.name === "AbortError")
      throw new Error(`G12_STAGING_HTTP_TIMEOUT:${method}:${safePath}:${clock() - startedAt}`, {
        cause: error,
      });
    throw error;
  }
}

export function isRetryableAuthUserResidueRead(error) {
  const message = typeof error?.message === "string" ? error.message : "";
  return (
    message === `G12_STAGING_HTTP_FAILED:GET:${AUTH_USER_RESIDUE_FAILURE_PATH}:504` ||
    new RegExp(`^G12_STAGING_HTTP_TIMEOUT:GET:${AUTH_USER_RESIDUE_FAILURE_PATH}:\\d+$`).test(message)
  );
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function retryAuthUserResidueRead(read, pause = wait) {
  for (let attempt = 0; attempt <= AUTH_USER_RESIDUE_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await read();
    } catch (error) {
      if (attempt === AUTH_USER_RESIDUE_RETRY_DELAYS_MS.length || !isRetryableAuthUserResidueRead(error))
        throw error;
      await pause(AUTH_USER_RESIDUE_RETRY_DELAYS_MS[attempt]);
    }
  }
  throw new Error("G12_STAGING_AUTH_USER_RESIDUE_UNAVAILABLE");
}
