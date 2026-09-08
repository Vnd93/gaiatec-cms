import type { APIRequestContext, APIResponse, BrowserContext, Page, Request, Route } from "@playwright/test";

export const CMS_PRODUCTION_ORIGIN = "https://gaiatecsistemas.com.br";

const FULL_SHA = /^[a-f0-9]{40}$/;
const PRODUCTION_PREVIEW_ORIGIN = /^https:\/\/[a-z0-9-]+\.gaiatec-website\.pages\.dev$/;

export type SealedPreviewRoutingConfiguration = {
  canonicalOrigin: typeof CMS_PRODUCTION_ORIGIN;
  previewOrigin: string;
  expectedSha: string;
};

export type SealedPreviewRoutingEvidence = {
  enabled: boolean;
  canonicalOrigin: string | null;
  previewOrigin: string | null;
  candidateSha: string | null;
  installedContexts: number;
  mappedRequests: number;
  mappedGetRequests: number;
  mappedHeadRequests: number;
  releaseVerifiedResponses: number;
  rewrittenRedirects: number;
  rejectedRedirects: number;
  mappingFailures: number;
  cachePolicy: "routing-disabled-http-cache-and-no-store" | "not-applicable";
  serviceWorkers: "blocked-by-context-contract" | "not-applicable";
};

type RoutingStats = {
  configuration: SealedPreviewRoutingConfiguration;
  mappedRequests: number;
  mappedGetRequests: number;
  mappedHeadRequests: number;
  releaseVerifiedResponses: number;
  rewrittenRedirects: number;
  rejectedRedirects: number;
  mappingFailures: number;
};

const installedContexts = new WeakMap<BrowserContext, RoutingStats | null>();
const installedStats: RoutingStats[] = [];

function exactOrigin(value: string, label: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`QA_CMS_SEALED_PREVIEW_${label}_INVALID`);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error(`QA_CMS_SEALED_PREVIEW_${label}_INVALID`);
  }
  return parsed.origin;
}

export function sealedPreviewRoutingConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): SealedPreviewRoutingConfiguration | null {
  const previewValue = environment.QA_CMS_SEALED_PREVIEW_URL?.trim() ?? "";
  if (!previewValue) return null;
  if (environment.QA_CMS_TARGET_ENVIRONMENT !== "production") {
    throw new Error("QA_CMS_SEALED_PREVIEW_ENVIRONMENT_REFUSED");
  }
  const expectedSha = environment.QA_CMS_EXPECTED_SHA ?? "";
  if (!FULL_SHA.test(expectedSha)) throw new Error("QA_CMS_SEALED_PREVIEW_SHA_INVALID");
  const previewOrigin = exactOrigin(previewValue, "ORIGIN");
  if (!PRODUCTION_PREVIEW_ORIGIN.test(previewOrigin) || previewOrigin === CMS_PRODUCTION_ORIGIN) {
    throw new Error("QA_CMS_SEALED_PREVIEW_ORIGIN_REFUSED");
  }
  return { canonicalOrigin: CMS_PRODUCTION_ORIGIN, previewOrigin, expectedSha };
}

export function mappedSealedPreviewUrl(
  requestUrl: string,
  method: string,
  configuration: SealedPreviewRoutingConfiguration,
) {
  const source = new URL(requestUrl);
  const normalizedMethod = method.toUpperCase();
  if (
    source.origin !== configuration.canonicalOrigin ||
    source.username ||
    source.password ||
    (normalizedMethod !== "GET" && normalizedMethod !== "HEAD")
  ) {
    return null;
  }
  return new URL(`${source.pathname}${source.search}`, configuration.previewOrigin).toString();
}

export function canonicalizedSealedPreviewRedirect(
  location: string,
  mappedRequestUrl: string,
  configuration: SealedPreviewRoutingConfiguration,
) {
  const destination = new URL(location, mappedRequestUrl);
  if (
    destination.username ||
    destination.password ||
    (destination.origin !== configuration.previewOrigin &&
      destination.origin !== configuration.canonicalOrigin)
  ) {
    return null;
  }
  return new URL(
    `${destination.pathname}${destination.search}${destination.hash}`,
    configuration.canonicalOrigin,
  ).toString();
}

function bodyFor(request: Request) {
  const value = request.postDataBuffer();
  return value === null ? undefined : value;
}

async function mappedRequestHeaders(request: Request) {
  const headers = await request.allHeaders();
  delete headers.host;
  delete headers["if-match"];
  delete headers["if-modified-since"];
  delete headers["if-none-match"];
  delete headers["if-unmodified-since"];
  headers["cache-control"] = "no-cache, no-store, max-age=0";
  headers.pragma = "no-cache";
  return headers;
}

function mappedApiHeaders(headers: Record<string, string> | undefined) {
  const mapped = Object.fromEntries(
    Object.entries(headers ?? {}).filter(
      ([name]) =>
        !["host", "if-match", "if-modified-since", "if-none-match", "if-unmodified-since"].includes(
          name.toLowerCase(),
        ),
    ),
  );
  mapped["cache-control"] = "no-cache, no-store, max-age=0";
  mapped.pragma = "no-cache";
  return mapped;
}

function canonicalApiResponse(response: APIResponse, canonicalUrl: string, location?: string) {
  return new Proxy(response, {
    get(target, property) {
      if (property === "url") return () => canonicalUrl;
      if (property === "headers") {
        return () => ({
          ...target.headers(),
          "cache-control": "private, no-store, max-age=0",
          pragma: "no-cache",
          ...(location ? { location } : {}),
        });
      }
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function recordMappedResponse(stats: RoutingStats, response: APIResponse) {
  if (new URL(response.url()).origin !== stats.configuration.previewOrigin) {
    throw new Error("QA_CMS_SEALED_PREVIEW_RESPONSE_ORIGIN_REFUSED");
  }
  if (response.headers()["x-release"] !== stats.configuration.expectedSha) {
    throw new Error("QA_CMS_SEALED_PREVIEW_RELEASE_MISMATCH");
  }
  stats.releaseVerifiedResponses += 1;
}

async function handleMappedRequest(route: Route, stats: RoutingStats, mappedUrl: string) {
  const request = route.request();
  const method = request.method().toUpperCase();
  stats.mappedRequests += 1;
  if (method === "GET") stats.mappedGetRequests += 1;
  if (method === "HEAD") stats.mappedHeadRequests += 1;
  try {
    const response = await route.fetch({
      url: mappedUrl,
      method,
      headers: await mappedRequestHeaders(request),
      postData: bodyFor(request),
      maxRedirects: 0,
    });
    if (new URL(response.url()).origin !== stats.configuration.previewOrigin) {
      stats.mappingFailures += 1;
      await route.abort("blockedbyclient");
      throw new Error("QA_CMS_SEALED_PREVIEW_RESPONSE_ORIGIN_REFUSED");
    }
    const headers = response.headers();
    if (headers["x-release"] !== stats.configuration.expectedSha) {
      stats.mappingFailures += 1;
      await route.abort("blockedbyclient");
      throw new Error("QA_CMS_SEALED_PREVIEW_RELEASE_MISMATCH");
    }
    stats.releaseVerifiedResponses += 1;
    const isRedirect = response.status() >= 300 && response.status() < 400;
    const location = headers.location;
    if (isRedirect && !location) {
      stats.mappingFailures += 1;
      await route.abort("blockedbyclient");
      throw new Error("QA_CMS_SEALED_PREVIEW_REDIRECT_LOCATION_MISSING");
    }
    if (isRedirect && location) {
      const canonicalLocation = canonicalizedSealedPreviewRedirect(location, mappedUrl, stats.configuration);
      if (!canonicalLocation) {
        stats.rejectedRedirects += 1;
        await route.abort("blockedbyclient");
        throw new Error("QA_CMS_SEALED_PREVIEW_EXTERNAL_REDIRECT_REFUSED");
      }
      headers.location = canonicalLocation;
      stats.rewrittenRedirects += 1;
    }
    headers["cache-control"] = "private, no-store, max-age=0";
    headers.pragma = "no-cache";
    await route.fulfill({ response, headers });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith("QA_CMS_SEALED_PREVIEW_")) {
      stats.mappingFailures += 1;
    }
    throw error;
  }
}

export async function installSealedPreviewRouting(
  context: BrowserContext,
  environment: NodeJS.ProcessEnv = process.env,
) {
  if (installedContexts.has(context)) return installedContexts.get(context) ?? null;
  const configuration = sealedPreviewRoutingConfiguration(environment);
  if (!configuration) {
    installedContexts.set(context, null);
    return null;
  }
  const stats: RoutingStats = {
    configuration,
    mappedRequests: 0,
    mappedGetRequests: 0,
    mappedHeadRequests: 0,
    releaseVerifiedResponses: 0,
    rewrittenRedirects: 0,
    rejectedRedirects: 0,
    mappingFailures: 0,
  };
  installedContexts.set(context, stats);
  installedStats.push(stats);
  await context.route("**/*", async (route) => {
    const mappedUrl = mappedSealedPreviewUrl(route.request().url(), route.request().method(), configuration);
    if (!mappedUrl) {
      await route.fallback();
      return;
    }
    await handleMappedRequest(route, stats, mappedUrl);
  });
  return stats;
}

export async function sealedPreviewApiGet(
  page: Page,
  requestUrl: string,
  options: Parameters<APIRequestContext["get"]>[1] = {},
): Promise<APIResponse> {
  const stats = installedContexts.get(page.context());
  if (!stats) return page.request.get(requestUrl, options);
  let canonicalUrl = new URL(requestUrl, stats.configuration.canonicalOrigin).toString();
  let mappedUrl = mappedSealedPreviewUrl(canonicalUrl, "GET", stats.configuration);
  if (!mappedUrl) return page.request.get(requestUrl, options);
  const followRedirects = options.maxRedirects !== 0;
  const redirectLimit = followRedirects ? (options.maxRedirects ?? 20) : 0;

  for (let redirectCount = 0; ; redirectCount += 1) {
    stats.mappedRequests += 1;
    stats.mappedGetRequests += 1;
    try {
      const response = await page.request.get(mappedUrl, {
        ...options,
        headers: mappedApiHeaders(options.headers),
        maxRedirects: 0,
      });
      recordMappedResponse(stats, response);
      const location = response.headers().location;
      if (response.status() < 300 || response.status() >= 400) {
        return canonicalApiResponse(response, canonicalUrl);
      }
      if (!location) throw new Error("QA_CMS_SEALED_PREVIEW_REDIRECT_LOCATION_MISSING");
      const canonicalLocation = canonicalizedSealedPreviewRedirect(location, mappedUrl, stats.configuration);
      if (!canonicalLocation) {
        stats.rejectedRedirects += 1;
        throw new Error("QA_CMS_SEALED_PREVIEW_EXTERNAL_REDIRECT_REFUSED");
      }
      stats.rewrittenRedirects += 1;
      if (!followRedirects) return canonicalApiResponse(response, canonicalUrl, canonicalLocation);
      if (redirectCount >= redirectLimit) {
        throw new Error("QA_CMS_SEALED_PREVIEW_REDIRECT_LIMIT_EXCEEDED");
      }
      canonicalUrl = canonicalLocation;
      mappedUrl = mappedSealedPreviewUrl(canonicalUrl, "GET", stats.configuration);
      if (!mappedUrl) throw new Error("QA_CMS_SEALED_PREVIEW_REDIRECT_MAPPING_REFUSED");
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "QA_CMS_SEALED_PREVIEW_EXTERNAL_REDIRECT_REFUSED") {
        stats.mappingFailures += 1;
      }
      throw error;
    }
  }
}

export function sealedPreviewDeploymentEnvironment<T extends "staging" | "production">(
  environment: T,
  variables: NodeJS.ProcessEnv = process.env,
): T | "production-preview" {
  return sealedPreviewRoutingConfiguration(variables) && environment === "production"
    ? "production-preview"
    : environment;
}

export function assertSealedPreviewRoutingUsed(context: BrowserContext) {
  const stats = installedContexts.get(context);
  if (!stats) return;
  if (
    stats.mappedRequests < 1 ||
    stats.mappedGetRequests + stats.mappedHeadRequests !== stats.mappedRequests ||
    stats.releaseVerifiedResponses !== stats.mappedRequests ||
    stats.mappingFailures !== 0 ||
    stats.rejectedRedirects !== 0
  ) {
    throw new Error("QA_CMS_SEALED_PREVIEW_ROUTING_NOT_PROVEN");
  }
}

export function sealedPreviewRoutingEvidence(): SealedPreviewRoutingEvidence {
  const configuration = installedStats[0]?.configuration ?? null;
  const sum = (key: keyof Omit<RoutingStats, "configuration">) =>
    installedStats.reduce((total, stats) => total + stats[key], 0);
  return {
    enabled: Boolean(configuration),
    canonicalOrigin: configuration?.canonicalOrigin ?? null,
    previewOrigin: configuration?.previewOrigin ?? null,
    candidateSha: configuration?.expectedSha ?? null,
    installedContexts: installedStats.length,
    mappedRequests: sum("mappedRequests"),
    mappedGetRequests: sum("mappedGetRequests"),
    mappedHeadRequests: sum("mappedHeadRequests"),
    releaseVerifiedResponses: sum("releaseVerifiedResponses"),
    rewrittenRedirects: sum("rewrittenRedirects"),
    rejectedRedirects: sum("rejectedRedirects"),
    mappingFailures: sum("mappingFailures"),
    cachePolicy: configuration ? "routing-disabled-http-cache-and-no-store" : "not-applicable",
    serviceWorkers: configuration ? "blocked-by-context-contract" : "not-applicable",
  };
}
