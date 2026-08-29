import { expect, test } from "@playwright/test";

test("product catalog preserves filters, cards and comparison flow", async ({ page }) => {
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

  const category = page.getByLabel("Categoria");
  const categoryValue = await category.locator("option").nth(1).textContent();
  expect(categoryValue).toBeTruthy();
  await category.selectOption({ label: categoryValue ?? "" });
  await expect(page).toHaveURL(/category=/);
  await expect(page.getByLabel("Filtros ativos")).toContainText(categoryValue ?? "");

  expect(await page.locator("body").evaluate((body) => body.scrollWidth <= body.clientWidth + 1)).toBe(true);
});

test("product catalog remains usable on a narrow viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "mobile layout");
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
