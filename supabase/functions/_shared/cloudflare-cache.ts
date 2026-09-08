const CLOUDFLARE_API_ORIGIN = "https://api.cloudflare.com";
const PRODUCTION_ENVIRONMENT = "production";

export type CloudflareCacheInvalidation = {
  ok: boolean;
  required: boolean;
  attempted: boolean;
  code: string | null;
  strategy: "origin-revalidation" | "cloudflare-purge-all";
  httpStatus?: number;
};

export async function invalidateCloudflareCache({
  environment,
  zoneId,
  apiToken,
  fetchImpl = fetch,
}: {
  environment?: string;
  zoneId?: string;
  apiToken?: string;
  fetchImpl?: typeof fetch;
}): Promise<CloudflareCacheInvalidation> {
  if (environment !== PRODUCTION_ENVIRONMENT)
    return {
      ok: true,
      required: false,
      attempted: false,
      code: null,
      strategy: "origin-revalidation",
    };

  if (!/^[a-f0-9]{32}$/i.test(zoneId ?? "") || (apiToken ?? "").trim().length < 32)
    return {
      ok: true,
      required: false,
      attempted: false,
      code: null,
      strategy: "origin-revalidation",
    };

  try {
    const response = await fetchImpl(
      `${CLOUDFLARE_API_ORIGIN}/client/v4/zones/${zoneId}/purge_cache`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ purge_everything: true }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    const result = (await response.json().catch(() => null)) as { success?: boolean } | null;
    if (!response.ok || result?.success !== true)
      return {
        ok: false,
        required: true,
        attempted: true,
        code: "cloudflare_cache_invalidation_rejected",
        strategy: "cloudflare-purge-all",
        httpStatus: response.status,
      };
    return {
      ok: true,
      required: true,
      attempted: true,
      code: null,
      strategy: "cloudflare-purge-all",
      httpStatus: response.status,
    };
  } catch {
    return {
      ok: false,
      required: true,
      attempted: true,
      code: "cloudflare_cache_invalidation_unavailable",
      strategy: "cloudflare-purge-all",
    };
  }
}
