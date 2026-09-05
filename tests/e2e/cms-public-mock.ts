import type { Page } from "@playwright/test";

const emptyFacets = {
  productCategory: [],
  applicationMagnitude: [],
  technology: [],
  installationOperation: [],
  monitoredElement: [],
};

export async function mockCmsPublicFallbacks(page: Page): Promise<void> {
  await page.route("**/functions/v1/cms-public?**", async (route) => {
    const url = new URL(route.request().url());
    const type = url.searchParams.get("type") ?? "detail";
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify(body),
      });

    if (type === "form") return route.fulfill({ status: 204 });
    if (type === "site-shell") {
      return json({ navigation: null, settings: null, placements: null });
    }
    if (type === "campaign-placements") return json({ items: [] });
    if (type === "page-by-path" || type === "campaign-by-path") return json({ kind: "fallback" });
    if (type === "products") {
      return json({ items: [], total: 0, facets: emptyFacets, query: url.searchParams.get("q") ?? "" });
    }
    if (type === "posts") return json({ items: [], total: 0 });
    if (["search", "collection", "autocomplete"].includes(type)) {
      return json({
        items: [],
        total: 0,
        facets: emptyFacets,
        groups: {
          product: 0,
          service: 0,
          industry: 0,
          application: 0,
          solution: 0,
          page: 0,
          homepage: 0,
          post: 0,
        },
        query: url.searchParams.get("q") ?? "",
      });
    }
    return json({ error: "Fixture ausente no baseline local." }, 404);
  });
}
