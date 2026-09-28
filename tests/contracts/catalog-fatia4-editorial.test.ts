import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync("src/app/routes.tsx", "utf8");
const pageSource = readFileSync("src/public/pages/CmsEditorialTermPage.tsx", "utf8");
const apiSource = readFileSync("src/public/catalog-api.ts", "utf8");

describe("catalog fatia 4 editorial boundaries", () => {
  it("registers only the three opt-in editorial term families", () => {
    expect(routeSource).toContain('path: "catalogo/tecnologia/:slug"');
    expect(routeSource).toContain('path: "catalogo/industria/:slug"');
    expect(routeSource).toContain('path: "catalogo/aplicacao/:slug"');
    expect(routeSource).not.toContain('path: "catalogo/produto/:slug"');
  });

  it("keeps the page and wire reader fail-closed by default", () => {
    expect(pageSource).toContain("buildFlag: import.meta.env.VITE_CATALOG_V1");
    expect(pageSource).toContain("capabilitySource: capability.source");
    expect(pageSource).toContain("indexable: false");
    expect(pageSource).toContain("getPublishedCatalogEditorialTerm(kind, slug)");
    expect(apiSource).toContain('type: "catalog-capability"');
    expect(apiSource).toContain('type: "catalog-editorial-term"');
    expect(apiSource).toContain("CatalogEditorialPublicTermSchema.safeParse");
  });

  it("does not introduce commercial fields into the editorial wire contract", () => {
    expect(pageSource).not.toMatch(/\b(?:sku|price|stock|inventory|availability|Offer)\b/);
    expect(apiSource).not.toContain("productId: result");
  });
});
