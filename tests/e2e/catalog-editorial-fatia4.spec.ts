import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const editorialPath = "/catalogo/tecnologia/medicao-vazao";

test("@catalog-fatia4 server-owned capability keeps editorial route closed by default", async ({ page }) => {
  const editorialRequests: string[] = [];
  await page.route("**/functions/v1/cms-public?**", async (route) => {
    const url = new URL(route.request().url());
    const type = url.searchParams.get("type");
    if (type === "catalog-capability") {
      return route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ key: "ev2.catalog_v1", enabled: false, source: "default" }),
      });
    }
    if (type === "catalog-editorial-term") {
      editorialRequests.push(url.toString());
      return route.fulfill({
        status: 500,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ error: "editorial payload must not be requested while disabled" }),
      });
    }
    return route.continue();
  });

  const response = await page.goto(editorialPath, { waitUntil: "load" });
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Conteúdo não disponível" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/i);
  expect(editorialRequests).toEqual([]);
});

test("@catalog-fatia4 malformed capability fails closed without editorial fetch", async ({ page }) => {
  const editorialRequests: string[] = [];
  await page.route("**/functions/v1/cms-public?**", async (route) => {
    const url = new URL(route.request().url());
    const type = url.searchParams.get("type");
    if (type === "catalog-capability") {
      return route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ key: "ev2.catalog_v1", enabled: true, source: "unexpected" }),
      });
    }
    if (type === "catalog-editorial-term") editorialRequests.push(url.toString());
    return route.continue();
  });

  const response = await page.goto(editorialPath, { waitUntil: "load" });
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Conteúdo não disponível" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/i);
  expect(editorialRequests).toEqual([]);
});
