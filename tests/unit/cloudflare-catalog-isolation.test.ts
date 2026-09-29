import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error The deployed Cloudflare module intentionally remains plain JavaScript.
import * as workerModule from "../../cloudflare/_worker.js";
const worker = workerModule.default;
const origin = "https://catalog-test.pages.dev";
const environment = (enabled = false) => ({
  CMS_CATALOG_V1: enabled ? "true" : "false",
  CMS_PUBLIC_API: "https://project-ref.supabase.co/functions/v1/cms-public",
  CMS_PUBLIC_ANON_KEY: "public-test-key",
  CF_PAGES_BRANCH: "main",
  CF_PAGES_COMMIT_SHA: "a".repeat(40),
  ASSETS: {
    fetch: async () =>
      new Response("<!doctype html><html><head><title>Catalog</title></head><body></body></html>", {
        headers: { "Content-Type": "text/html" },
      }),
  },
});
afterEach(() => vi.unstubAllGlobals());
describe("isolated catalog routes and rollback", () => {
  it("is closed by default without probing the public or legacy reader", async () => {
    const network = vi.fn();
    vi.stubGlobal("fetch", network);
    const response = await worker.fetch(new Request(`${origin}/catalogo/tecnologia/fixture`), environment());
    expect(response.status).toBe(404);
    expect(response.headers.get("X-Robots-Tag")).toContain("noindex");
    expect(network).not.toHaveBeenCalled();
  });
  it("returns a real 301 only for a same-family governed destination", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ kind: "redirect", status: 301, path: "/catalogo/tecnologia/replacement" }),
      ),
    );
    const response = await worker.fetch(
      new Request(`${origin}/catalogo/tecnologia/fixture`),
      environment(true),
    );
    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe("/catalogo/tecnologia/replacement");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
  it.each(["https://evil.test/page", "/catalogo/industria/other", "/catalogo/tecnologia/fixture"])(
    "rejects unsafe/cyclic redirect %s",
    async (path) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => Response.json({ kind: "redirect", status: 301, path })),
      );
      const response = await worker.fetch(
        new Request(`${origin}/catalogo/tecnologia/fixture`),
        environment(true),
      );
      expect(response.status).toBe(503);
      expect(response.headers.get("Location")).toBeNull();
    },
  );
  it("never falls back to legacy on backend failure", async () => {
    const network = vi.fn(async (_input: RequestInfo | URL) => new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", network);
    const response = await worker.fetch(new Request(`${origin}/catalogo/itens/fixture`), environment(true));
    expect(response.status).toBe(503);
    expect(network).toHaveBeenCalledTimes(1);
    expect(new URL(String(network.mock.calls[0]?.[0])).searchParams.get("type")).toBe("catalog-product");
  });
  it("serves only the isolated approved sitemap projection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ items: [{ path: "/catalogo/tecnologia/fixture" }] })),
    );
    const response = await worker.fetch(new Request(`${origin}/sitemap-catalogo.xml`), environment(true));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(await response.text()).toContain(`<loc>${origin}/catalogo/tecnologia/fixture</loc>`);
  });
});
