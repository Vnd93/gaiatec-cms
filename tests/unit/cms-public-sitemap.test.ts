import { describe, expect, it } from "vitest";

import { buildPublicSitemapXml } from "../../supabase/functions/_shared/cms-public-sitemap";

const publishedAt = "2026-09-07T12:00:00.000Z";

describe("public sitemap wire boundary", () => {
  it("materializes only canonical public routes without editorial identifiers", () => {
    const sitemap = buildPublicSitemapXml(
      [
        { content_type: "product", slug: "transmissor-pressao", published_at: publishedAt },
        {
          content_type: "page",
          route: { path: "/sobre" },
          published_at: "2026-09-06T12:00:00+00:00",
        },
        { content_type: "homepage", route: { path: "/" }, published_at: publishedAt },
      ],
      "https://www.gaiatecsistemas.com.br",
    );

    expect(sitemap).toContain("https://www.gaiatecsistemas.com.br/produtos/transmissor-pressao");
    expect(sitemap).toContain("https://www.gaiatecsistemas.com.br/sobre");
    expect(sitemap).toContain("<lastmod>2026-09-06T12:00:00.000Z</lastmod>");
    expect(sitemap).not.toMatch(/item_id|revision_id|storage|sha256|correlation|lock/i);
  });

  it.each([
    [
      "UUID in a routed page",
      [
        {
          content_type: "page",
          route: { path: "/91000000-0000-4000-8000-000000000001" },
          published_at: publishedAt,
        },
      ],
    ],
    [
      "embedded digest in a slug",
      [{ content_type: "product", slug: `produto-${"a".repeat(40)}`, published_at: publishedAt }],
    ],
    ["malformed date", [{ content_type: "product", slug: "produto", published_at: "not-a-date" }]],
    [
      "duplicate route",
      [
        { content_type: "page", route: { path: "/sobre" }, published_at: publishedAt },
        { content_type: "page", route: { path: "/sobre" }, published_at: publishedAt },
      ],
    ],
    ["unsupported type", [{ content_type: "navigation", route: { path: "/" }, published_at: publishedAt }]],
  ])("fails closed when a row is unsafe: %s", (_label, rows) => {
    expect(buildPublicSitemapXml(rows, "https://gaiatecsistemas.com.br")).toBeNull();
  });

  it.each([
    "http://gaiatecsistemas.com.br",
    "https://localhost",
    "https://127.0.0.1",
    "https://user:password@gaiatecsistemas.com.br",
    "https://gaiatecsistemas.com.br/private",
    "https://91000000-0000-4000-8000-000000000001.example.com",
  ])("rejects a non-public canonical origin: %s", (origin) => {
    expect(buildPublicSitemapXml([], origin)).toBeNull();
  });
});
