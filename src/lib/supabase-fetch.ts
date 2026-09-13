function requestTarget(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof input === "string" || input instanceof URL) return "GET";
  return input.method.toUpperCase();
}

/**
 * auth-js intentionally does not read successful logout response bodies. Waiting for a cloned
 * body here keeps the original Response available to the SDK while ensuring the network request
 * has finished before auth-js clears the local session and the application leaves the admin UI.
 */
export function createDurableSupabaseFetch(
  supabaseUrl: string,
  baseFetch: typeof fetch = (...args) => globalThis.fetch(...args),
): typeof fetch {
  const expectedOrigin = new URL(supabaseUrl).origin;

  return async (input, init) => {
    const response = await baseFetch(input, init);
    let url: URL;
    try {
      url = new URL(requestTarget(input));
    } catch {
      return response;
    }

    const isLocalAuthLogout =
      requestMethod(input, init) === "POST" &&
      url.origin === expectedOrigin &&
      url.pathname === "/auth/v1/logout" &&
      url.search === "?scope=local";

    if (isLocalAuthLogout) await response.clone().arrayBuffer();
    return response;
  };
}
