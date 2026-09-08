import { afterEach, describe, expect, it, vi } from "vitest";

// @ts-expect-error The deployed Cloudflare module intentionally remains plain JavaScript.
import * as workerModule from "../../cloudflare/_worker.js";

const worker = workerModule.default;
const { compatiblePublicRouteRule, legacyMetadataPage, publicAssetCompatibilityResponse } = workerModule;

const apiEndpoint = "https://project-ref.supabase.co/functions/v1/cms-public";
const assetId = "93000000-0000-4000-8000-000000000001";
const documentId = "93000000-0000-4000-8000-000000000002";
const revisionId = "93000000-0000-4000-8000-000000000003";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const signed = (bucket: string, path: string, token = "private-token-never-reflected") =>
  `https://project-ref.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=${token}`;

function legacyProduct(overrides: Record<string, unknown> = {}) {
  return {
    item_id: "93000000-0000-4000-8000-000000000004",
    revision_id: revisionId,
    content_type: "product",
    slug: "produto-legacy",
    payload: {
      title: "Produto legado",
      media: [{ assetId, role: "primary", alt: "Produto em campo" }],
      documents: [
        {
          id: documentId,
          kind: "manual",
          title: "Manual técnico",
          revision: "A",
          language: "pt-BR",
          visibility: "public",
        },
      ],
    },
    seo: {
      title: "Produto legado | GAIATEC",
      description: "Produto público controlado.",
      canonicalPath: "/produtos/produto-legacy",
      indexable: true,
      ogImageId: assetId,
    },
    path: "/produtos/produto-legacy",
    published_at: "2026-09-08T09:00:00.000Z",
    media_urls: {
      [`${assetId}:large.webp`]: signed("cms-media-private", `${assetId}/large.webp`),
    },
    media_alt: { [assetId]: "Produto em campo" },
    document_urls: {
      [documentId]: signed("cms-documents-private", `${documentId}/manual.pdf`),
    },
    ...overrides,
  };
}

const assetRequest = (type: "media" | "document", extra = "") =>
  new Request(
    `https://gaiatecsistemas.com.br/__cms-public-asset?type=${type}&kind=product&slug=produto-legacy&path=%2Fprodutos%2Fproduto-legacy&${
      type === "media" ? "slot=primary" : "position=1"
    }${extra}`,
  );

const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
const pdf = new TextEncoder().encode("%PDF-1.7\ncontrolled fixture");

afterEach(() => vi.unstubAllGlobals());

describe("Cloudflare public asset compatibility bridge", () => {
  it("proxies an f48 media slot without reflecting its UUID or signed token", async () => {
    const row = legacyProduct();
    const fetchPublic = vi.fn().mockResolvedValueOnce(json(row)).mockResolvedValueOnce(json(row));
    const storageFetch = vi.fn().mockResolvedValue(
      new Response(webp, {
        status: 200,
        headers: { "Content-Type": "image/webp", "Content-Length": String(webp.byteLength) },
      }),
    );
    vi.stubGlobal("fetch", storageFetch);

    const response = await publicAssetCompatibilityResponse(assetRequest("media"), fetchPublic, apiEndpoint);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/webp");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=0, must-revalidate");
    expect((await response.arrayBuffer()).byteLength).toBe(webp.byteLength);
    expect(fetchPublic).toHaveBeenNthCalledWith(1, {
      type: "detail",
      contentType: "product",
      slug: "produto-legacy",
    });
    expect(JSON.stringify(fetchPublic.mock.calls)).not.toContain(assetId);
    expect([...response.headers.entries()].join(" ")).not.toMatch(/private-token|93000000-/);
    expect(storageFetch).toHaveBeenCalledTimes(1);
    expect(storageFetch.mock.calls[0]?.[1]).toMatchObject({ redirect: "error" });
  });

  it("proxies an f48 governed PDF by public position with no-store semantics", async () => {
    const row = legacyProduct();
    const fetchPublic = vi.fn().mockResolvedValueOnce(json(row)).mockResolvedValueOnce(json(row));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(pdf, {
          status: 200,
          headers: { "Content-Type": "application/pdf", "Content-Length": String(pdf.byteLength) },
        }),
      ),
    );

    const response = await publicAssetCompatibilityResponse(
      assetRequest("document"),
      fetchPublic,
      apiEndpoint,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="Manual-tecnico.pdf"');
    expect([...response.headers.entries()].join(" ")).not.toMatch(/private-token|93000000-/);
  });

  it("preserves the PDF sandbox through the complete Worker response path", async () => {
    const row = legacyProduct();
    const network = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      if (url.pathname.startsWith("/storage/v1/object/sign/"))
        return new Response(pdf, {
          status: 200,
          headers: { "Content-Type": "application/pdf", "Content-Length": String(pdf.byteLength) },
        });
      return json(row);
    });
    vi.stubGlobal("fetch", network);
    const response = await worker.fetch(assetRequest("document"), {
      CMS_PUBLIC_API: apiEndpoint,
      CMS_PUBLIC_ANON_KEY: "public-anon-test-key",
      CF_PAGES_BRANCH: "main",
      CF_PAGES_COMMIT_SHA: "a".repeat(40),
      ASSETS: { fetch: vi.fn() },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Security-Policy")).toBe(
      "default-src 'none'; object-src 'none'; frame-ancestors 'none'; sandbox",
    );
    expect(response.headers.get("Content-Security-Policy-Report-Only")).toBeNull();
    expect(network).toHaveBeenCalledTimes(3);
  });

  it("passes candidate bytes through the controlled response without a legacy retry", async () => {
    const fetchPublic = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          kind: "product",
          slug: "produto-legacy",
          path: "/produtos/produto-legacy",
          payload: { title: "Produto" },
          seo: {
            title: "Produto | GAIATEC",
            description: "Produto público.",
            canonicalPath: "/produtos/produto-legacy",
            indexable: true,
          },
          publishedAt: "2026-09-08T09:00:00.000Z",
        }),
      )
      .mockResolvedValueOnce(
        new Response(webp, {
          status: 200,
          headers: { "Content-Type": "image/webp" },
        }),
      );
    const storageFetch = vi.fn();
    vi.stubGlobal("fetch", storageFetch);

    const response = await publicAssetCompatibilityResponse(assetRequest("media"), fetchPublic, apiEndpoint);

    expect(response.status).toBe(200);
    expect(fetchPublic).toHaveBeenCalledTimes(2);
    expect(fetchPublic).toHaveBeenNthCalledWith(1, {
      type: "detail",
      contentType: "product",
      slug: "produto-legacy",
    });
    expect(fetchPublic).toHaveBeenNthCalledWith(2, {
      type: "media",
      kind: "product",
      slug: "produto-legacy",
      slot: "primary",
    });
    expect(storageFetch).not.toHaveBeenCalled();
  });

  it("fails closed for extra selectors and an off-origin signed URL", async () => {
    const neverCalled = vi.fn();
    const malformed = await publicAssetCompatibilityResponse(
      assetRequest("media", "&slot=social"),
      neverCalled,
      apiEndpoint,
    );
    expect(malformed.status).toBe(404);
    expect(neverCalled).not.toHaveBeenCalled();

    const poisoned = legacyProduct({
      media_urls: {
        [`${assetId}:large.webp`]:
          "https://attacker.example/storage/v1/object/sign/cms-media-private/file.webp?token=stolen",
      },
    });
    const fetchPublic = vi.fn().mockResolvedValueOnce(json(poisoned));
    const storageFetch = vi.fn();
    vi.stubGlobal("fetch", storageFetch);

    const response = await publicAssetCompatibilityResponse(assetRequest("media"), fetchPublic, apiEndpoint);
    expect(response.status).toBe(404);
    expect(storageFetch).not.toHaveBeenCalled();
  });

  it("keeps an exact-resource outage unavailable without falling back to a collection", async () => {
    const fetchPublic = vi.fn().mockResolvedValueOnce(json({ error: "indisponível" }, 503));
    const storageFetch = vi.fn();
    vi.stubGlobal("fetch", storageFetch);

    const response = await publicAssetCompatibilityResponse(assetRequest("media"), fetchPublic, apiEndpoint);
    expect(response.status).toBe(503);
    expect(fetchPublic).toHaveBeenCalledTimes(1);
    expect(fetchPublic).toHaveBeenCalledWith({
      type: "detail",
      contentType: "product",
      slug: "produto-legacy",
    });
    expect(storageFetch).not.toHaveBeenCalled();
  });

  it("rejects executable MIME and an oversized candidate before exposing bytes", async () => {
    const row = legacyProduct();
    const legacyFetch = vi.fn().mockResolvedValueOnce(json(row));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response("<script>alert(1)</script>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
      ),
    );
    const executable = await publicAssetCompatibilityResponse(
      assetRequest("media"),
      legacyFetch,
      apiEndpoint,
    );
    expect(executable.status).toBe(503);

    const candidateFetch = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          kind: "product",
          slug: "produto-legacy",
          path: "/produtos/produto-legacy",
          payload: { title: "Produto" },
          seo: {
            title: "Produto | GAIATEC",
            description: "Produto público.",
            canonicalPath: "/produtos/produto-legacy",
            indexable: true,
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(webp, {
          status: 200,
          headers: { "Content-Type": "image/webp", "Content-Length": "20000001" },
        }),
      );
    const oversized = await publicAssetCompatibilityResponse(
      assetRequest("media"),
      candidateFetch,
      apiEndpoint,
    );
    expect(oversized.status).toBe(503);
  });

  it("mints a semantic OG URL for f48 SSR metadata without exposing storage data", () => {
    const page = legacyMetadataPage(
      legacyProduct(),
      new URL("https://gaiatecsistemas.com.br/produtos/produto-legacy"),
    ) as Record<string, any>;
    expect(page.kind).toBe("product");
    expect(page.publishedAt).toBe("2026-09-08T09:00:00.000Z");
    expect(page.seo.socialImage).toBe(
      "https://gaiatecsistemas.com.br/__cms-public-asset?type=media&kind=product&slug=produto-legacy&path=%2Fprodutos%2Fproduto-legacy&slot=social",
    );
    expect(page.seo.socialImage).not.toMatch(/93000000-|token|storage\/v1/i);
  });

  it("normalizes f48 SSR kind and publication date even when no OG image exists", () => {
    const legacy = legacyProduct({ media_urls: {}, media_alt: {}, document_urls: {} });
    delete (legacy.seo as { ogImageId?: string }).ogImageId;
    const page = legacyMetadataPage(
      legacy,
      new URL("https://gaiatecsistemas.com.br/produtos/produto-legacy"),
    ) as Record<string, any>;
    expect(page.kind).toBe("product");
    expect(page.publishedAt).toBe("2026-09-08T09:00:00.000Z");
    expect(page.seo).not.toHaveProperty("socialImage");
  });
});

describe("Cloudflare route-rule expand/contract compatibility", () => {
  it("accepts exact camel and snake contracts and rejects open redirects or hybrids", () => {
    expect(compatiblePublicRouteRule({ destinationPath: "/destino", status: 301 })).toEqual({
      destinationPath: "/destino",
      status: 301,
    });
    expect(compatiblePublicRouteRule({ destination_path: null, status_code: 410 })).toEqual({
      destinationPath: null,
      status: 410,
    });
    expect(
      compatiblePublicRouteRule({ destination_path: "https://evil.example", status_code: 301 }),
    ).toBeNull();
    expect(
      compatiblePublicRouteRule({ destinationPath: "/destino", status: 301, status_code: 301 }),
    ).toBeNull();
  });
});
