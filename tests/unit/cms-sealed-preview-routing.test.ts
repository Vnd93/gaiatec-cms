import type { APIResponse, BrowserContext, Page } from "@playwright/test";
import { describe, expect, it, vi } from "vitest";
import {
  CMS_PRODUCTION_ORIGIN,
  assertSealedPreviewRoutingUsed,
  canonicalizedSealedPreviewRedirect,
  installSealedPreviewRouting,
  mappedSealedPreviewUrl,
  sealedPreviewApiGet,
  sealedPreviewDeploymentEnvironment,
  sealedPreviewRoutingConfiguration,
} from "../e2e/cms-sealed-preview-routing";

const sha = "a".repeat(40);
const previewOrigin = "https://a1b2c3d4.gaiatec-website.pages.dev";
const configuration = { canonicalOrigin: CMS_PRODUCTION_ORIGIN, previewOrigin, expectedSha: sha } as const;
const environment = {
  QA_CMS_TARGET_ENVIRONMENT: "production",
  QA_CMS_SEALED_PREVIEW_URL: previewOrigin,
  QA_CMS_EXPECTED_SHA: sha,
};

describe("sealed production preview routing", () => {
  it("is opt-in and refuses use outside the production gate", () => {
    expect(sealedPreviewRoutingConfiguration({})).toBeNull();
    expect(() =>
      sealedPreviewRoutingConfiguration({
        QA_CMS_TARGET_ENVIRONMENT: "staging",
        QA_CMS_SEALED_PREVIEW_URL: previewOrigin,
        QA_CMS_EXPECTED_SHA: sha,
      }),
    ).toThrow("QA_CMS_SEALED_PREVIEW_ENVIRONMENT_REFUSED");
  });

  it("accepts only the exact production Pages preview and full candidate SHA", () => {
    expect(
      sealedPreviewRoutingConfiguration({
        QA_CMS_TARGET_ENVIRONMENT: "production",
        QA_CMS_SEALED_PREVIEW_URL: previewOrigin,
        QA_CMS_EXPECTED_SHA: sha,
      }),
    ).toEqual(configuration);
    for (const value of [
      "https://gaiatecsistemas.com.br",
      "https://evil.example",
      "https://a1b2c3d4.gaiatec-website.pages.dev/path",
      "https://user:secret@a1b2c3d4.gaiatec-website.pages.dev",
    ]) {
      expect(() =>
        sealedPreviewRoutingConfiguration({
          QA_CMS_TARGET_ENVIRONMENT: "production",
          QA_CMS_SEALED_PREVIEW_URL: value,
          QA_CMS_EXPECTED_SHA: sha,
        }),
      ).toThrow(/QA_CMS_SEALED_PREVIEW_(?:ORIGIN_INVALID|ORIGIN_REFUSED)/);
    }
  });

  it("maps every first-party GET and HEAD without changing path or query", () => {
    expect(
      mappedSealedPreviewUrl(
        "https://gaiatecsistemas.com.br/admin/paginas?status=draft&order=asc",
        "GET",
        configuration,
      ),
    ).toBe(`${previewOrigin}/admin/paginas?status=draft&order=asc`);
    expect(
      mappedSealedPreviewUrl("https://gaiatecsistemas.com.br/assets/app.js", "HEAD", configuration),
    ).toBe(`${previewOrigin}/assets/app.js`);
    expect(mappedSealedPreviewUrl("https://gaiatecsistemas.com.br/admin", "POST", configuration)).toBeNull();
    expect(
      mappedSealedPreviewUrl("https://actor:secret@gaiatecsistemas.com.br/admin", "GET", configuration),
    ).toBeNull();
    expect(
      mappedSealedPreviewUrl("https://chfuhctnhqgyjowkvllv.supabase.co/rest/v1", "GET", configuration),
    ).toBeNull();
  });

  it("reports the honest preview deployment environment only for an enabled production map", () => {
    expect(sealedPreviewDeploymentEnvironment("production", environment)).toBe("production-preview");
    expect(sealedPreviewDeploymentEnvironment("staging", {})).toBe("staging");
    expect(sealedPreviewDeploymentEnvironment("production", {})).toBe("production");
  });

  it("rewrites internal redirects to the visible canonical origin and refuses external redirects", () => {
    const mappedRequest = `${previewOrigin}/setores?source=qa`;
    expect(canonicalizedSealedPreviewRedirect("/industrias", mappedRequest, configuration)).toBe(
      "https://gaiatecsistemas.com.br/industrias",
    );
    expect(
      canonicalizedSealedPreviewRedirect(
        `${previewOrigin}/admin/login?next=%2Fadmin`,
        mappedRequest,
        configuration,
      ),
    ).toBe("https://gaiatecsistemas.com.br/admin/login?next=%2Fadmin");
    expect(
      canonicalizedSealedPreviewRedirect("https://malicious.example/collect", mappedRequest, configuration),
    ).toBeNull();
    expect(
      canonicalizedSealedPreviewRedirect(
        `https://actor:secret@a1b2c3d4.gaiatec-website.pages.dev/admin`,
        mappedRequest,
        configuration,
      ),
    ).toBeNull();
  });

  it("preserves method/body, disables cache and proves the release header for a mapped request", async () => {
    let handler: ((route: never) => Promise<void>) | undefined;
    const context = {
      route: vi.fn(async (_pattern, candidate) => {
        handler = candidate;
      }),
    } as unknown as BrowserContext;
    await installSealedPreviewRouting(context, environment);
    const fetch = vi.fn(async () => ({
      url: () => `${previewOrigin}/admin/login`,
      status: () => 200,
      headers: () => ({ "x-release": sha, "cache-control": "public, max-age=60" }),
    }));
    const fulfill = vi.fn(async () => undefined);
    const abort = vi.fn(async () => undefined);
    const fallback = vi.fn(async () => undefined);
    const body = Buffer.from("preserved-request-body");
    await handler!({
      request: () => ({
        url: () => `${CMS_PRODUCTION_ORIGIN}/admin/login`,
        method: () => "GET",
        postDataBuffer: () => body,
        allHeaders: async () => ({ host: "gaiatecsistemas.com.br", "if-none-match": "cached" }),
      }),
      fetch,
      fulfill,
      abort,
      fallback,
    } as never);
    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        url: `${previewOrigin}/admin/login`,
        method: "GET",
        postData: body,
        maxRedirects: 0,
        headers: expect.objectContaining({
          "cache-control": "no-cache, no-store, max-age=0",
          pragma: "no-cache",
        }),
      }),
    );
    const [[fetchOptions]] = fetch.mock.calls as unknown as [[{ headers: Record<string, string> }]];
    expect(fetchOptions.headers).not.toHaveProperty("host");
    expect(fetchOptions.headers).not.toHaveProperty("if-none-match");
    expect(fulfill).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-release": sha,
          "cache-control": "private, no-store, max-age=0",
        }),
      }),
    );
    expect(abort).not.toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();
    expect(() => assertSealedPreviewRoutingUsed(context)).not.toThrow();
  });

  it("fails closed on a mismatched release or an external redirect", async () => {
    for (const response of [
      { status: 200, headers: { "x-release": "b".repeat(40) } },
      { status: 302, headers: { "x-release": sha, location: "https://external.example/collect" } },
      { status: 302, headers: { "x-release": sha } },
    ]) {
      let handler: ((route: never) => Promise<void>) | undefined;
      const context = {
        route: vi.fn(async (_pattern, candidate) => {
          handler = candidate;
        }),
      } as unknown as BrowserContext;
      await installSealedPreviewRouting(context, environment);
      const abort = vi.fn(async () => undefined);
      await expect(
        handler!({
          request: () => ({
            url: () => `${CMS_PRODUCTION_ORIGIN}/admin`,
            method: () => "HEAD",
            postDataBuffer: () => null,
            allHeaders: async () => ({}),
          }),
          fetch: async () => ({
            url: () => `${previewOrigin}/admin`,
            status: () => response.status,
            headers: () => response.headers,
          }),
          fulfill: async () => undefined,
          abort,
          fallback: async () => undefined,
        } as never),
      ).rejects.toThrow(
        /QA_CMS_SEALED_PREVIEW_(?:RELEASE_MISMATCH|EXTERNAL_REDIRECT_REFUSED|REDIRECT_LOCATION_MISSING)/,
      );
      expect(abort).toHaveBeenCalledWith("blockedbyclient");
    }
  });

  it("maps APIRequestContext GET redirects without allowing the hidden preview origin to escape", async () => {
    let routeHandler: ((route: never) => Promise<void>) | undefined;
    const context = {
      route: vi.fn(async (_pattern, candidate) => {
        routeHandler = candidate;
      }),
    } as unknown as BrowserContext;
    const response = (url: string, status: number, headers: Record<string, string>) =>
      ({
        url: () => url,
        status: () => status,
        headers: () => headers,
        text: async () => "ok",
        body: async () => Buffer.from("ok"),
        json: async () => ({ ok: true }),
      }) as unknown as APIResponse;
    const get = vi
      .fn()
      .mockResolvedValueOnce(
        response(`${previewOrigin}/admin`, 302, { "x-release": sha, location: "/admin/login" }),
      )
      .mockResolvedValueOnce(response(`${previewOrigin}/admin/login`, 200, { "x-release": sha }));
    const page = {
      context: () => context,
      request: { get },
    } as unknown as Page;
    const stats = await installSealedPreviewRouting(context, environment);
    expect(routeHandler).toBeTypeOf("function");

    const result = await sealedPreviewApiGet(page, "/admin", {
      headers: { "If-None-Match": "cached" },
    });
    expect(result.status()).toBe(200);
    expect(result.url()).toBe(`${CMS_PRODUCTION_ORIGIN}/admin/login`);
    expect(result.headers()["cache-control"]).toBe("private, no-store, max-age=0");
    expect(get).toHaveBeenNthCalledWith(
      1,
      `${previewOrigin}/admin`,
      expect.objectContaining({
        maxRedirects: 0,
        headers: expect.not.objectContaining({ "If-None-Match": "cached" }),
      }),
    );
    expect(get).toHaveBeenNthCalledWith(
      2,
      `${previewOrigin}/admin/login`,
      expect.objectContaining({ maxRedirects: 0 }),
    );
    expect(stats).toMatchObject({
      mappedRequests: 2,
      mappedGetRequests: 2,
      releaseVerifiedResponses: 2,
      rewrittenRedirects: 1,
      rejectedRedirects: 0,
      mappingFailures: 0,
    });
    expect(() => assertSealedPreviewRoutingUsed(context)).not.toThrow();
    stats!.mappedHeadRequests = 1;
    expect(() => assertSealedPreviewRoutingUsed(context)).toThrow("QA_CMS_SEALED_PREVIEW_ROUTING_NOT_PROVEN");
    stats!.mappedHeadRequests = 0;
  });

  it("refuses an external APIRequestContext redirect before following it", async () => {
    const context = { route: vi.fn(async () => undefined) } as unknown as BrowserContext;
    const get = vi.fn(
      async () =>
        ({
          url: () => `${previewOrigin}/admin`,
          status: () => 302,
          headers: () => ({ "x-release": sha, location: "https://external.example/collect" }),
        }) as unknown as APIResponse,
    );
    const page = { context: () => context, request: { get } } as unknown as Page;
    await installSealedPreviewRouting(context, environment);
    await expect(sealedPreviewApiGet(page, "/admin")).rejects.toThrow(
      "QA_CMS_SEALED_PREVIEW_EXTERNAL_REDIRECT_REFUSED",
    );
    expect(get).toHaveBeenCalledTimes(1);
    expect(() => assertSealedPreviewRoutingUsed(context)).toThrow("QA_CMS_SEALED_PREVIEW_ROUTING_NOT_PROVEN");
  });
});
