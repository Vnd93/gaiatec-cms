import { expect, test, type Page } from "@playwright/test";

async function mockProductCatalog(page: Page) {
  await page.route("**/functions/v1/cms-public?**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("type") !== "products") return route.continue();
    const category = "Instrumentos de Medição";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            item_id: "20000000-0000-4000-8000-000000000001",
            revision_id: "20000000-0000-4000-8000-000000000002",
            slug: "produto-e2e-controlado",
            payload: {
              contentType: "product",
              title: "Produto E2E controlado",
              summary: "Produto sintético exclusivo do teste local.",
              pilotState: "homologated",
              commercial: {
                shortDescription: "Descrição pública para validar filtros e comparação.",
                valueProposition: "Teste local.",
                benefits: [],
                differentiators: [],
              },
              classification: { segment: category, category: "Medição de Vazão", family: "Clamp-On" },
              controlledClassification: {
                productCategory: { slug: "instrumentos-medicao", label: category },
                applicationMagnitude: { slug: "medicao-vazao", label: "Medição de Vazão" },
                technology: { slug: "ultrassonico", label: "Ultrassônico" },
                installationOperation: { slug: "clamp-on", label: "Clamp-On" },
                monitoredElement: { slug: "liquidos", label: "Líquidos" },
              },
              models: [{ id: "modelo-e2e", model: "MODELO-E2E", status: "active", variants: [] }],
              specifications: [],
              media: [],
              documents: [],
              blocks: [],
            },
            seo: {},
            content_version: 1,
            etag: "e2e-v1",
            published_at: "2026-08-30T12:00:00.000Z",
          },
        ],
        total: 1,
        facets: {
          productCategory: [category],
          applicationMagnitude: ["Medição de Vazão"],
          technology: ["Ultrassônico"],
          installationOperation: ["Clamp-On"],
          monitoredElement: ["Líquidos"],
        },
        query: "",
      }),
    });
  });
}

test("product catalog preserves filters, cards and comparison flow", async ({ page }) => {
  await mockProductCatalog(page);
  await page.goto("/produtos", { waitUntil: "networkidle" });

  await expect(page.getByRole("heading", { name: /encontre o equipamento certo/i })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Filtros do catálogo" })).toBeVisible();

  const card = page.locator(".catalog-product-card").first();
  await expect(card).toBeVisible();
  await expect(card.getByRole("link", { name: /ver detalhes técnicos/i })).toBeVisible();

  const compare = card.getByRole("button", { name: /adicionar .* à comparação/i });
  await compare.click();
  await expect(card.getByRole("button", { name: /remover .* da comparação/i })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.getByRole("complementary", { name: "Produtos selecionados para comparação" }),
  ).toBeVisible();

  const category = page.getByLabel("Categoria de produto");
  const categoryValue = await category.locator("option").nth(1).textContent();
  expect(categoryValue).toBeTruthy();
  await category.selectOption({ label: categoryValue ?? "" });
  await expect(page).toHaveURL(/productCategory=/);
  await expect(page.getByLabel("Filtros ativos")).toContainText(categoryValue ?? "");

  expect(await page.locator("body").evaluate((body) => body.scrollWidth <= body.clientWidth + 1)).toBe(true);
});

test("product catalog remains usable on a narrow viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "mobile layout");
  await mockProductCatalog(page);
  await page.goto("/produtos", { waitUntil: "networkidle" });

  const card = page.locator(".catalog-product-card").first();
  await expect(card).toBeVisible();

  const viewportWidth = page.viewportSize()?.width ?? 0;
  const cardBox = await card.boundingBox();
  const filterBox = await page.getByRole("complementary", { name: "Filtros do catálogo" }).boundingBox();

  expect(cardBox).not.toBeNull();
  expect(filterBox).not.toBeNull();
  expect(cardBox?.width ?? Infinity).toBeLessThanOrEqual(viewportWidth);
  expect(filterBox?.width ?? Infinity).toBeLessThanOrEqual(viewportWidth);
  expect(await page.locator("main").count()).toBe(1);
  expect(await page.locator("body").evaluate((body) => body.scrollWidth <= body.clientWidth + 1)).toBe(true);
});
