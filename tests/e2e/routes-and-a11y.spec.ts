import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const routes = [
  "/",
  "/produtos",
  "/contato",
  "/blog",
  "/campanhas/campanha-sintetica-inexistente",
  "/relatorio-de-obra/login",
  "/admin/login",
];

for (const route of routes) {
  test(`smoke ${route}`, async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    const response = await page.goto(route, { waitUntil: "networkidle" });
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
    expect(await page.locator("body").evaluate((body) => body.scrollWidth <= body.clientWidth + 1)).toBe(
      true,
    );
    expect(consoleErrors).toEqual([]);
  });
}

test("@a11y critical public journeys have no serious automated violations", async ({ page }) => {
  for (const route of ["/", "/contato", "/produtos", "/blog", "/campanhas/campanha-sintetica-inexistente"]) {
    await page.goto(route, { waitUntil: "networkidle" });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? ""),
    );
    expect(serious, `${route}: ${serious.map((item) => item.id).join(", ")}`).toEqual([]);
  }
});

test("@a11y keyboard skip link moves focus to main content", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  const skip = page.getByRole("link", { name: "Pular para o conteúdo principal" });
  await skip.focus();
  await skip.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  await expect(page).toHaveURL(/#main-content$/);
});

test("admin is fail-closed and private when signed out", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page.getByRole("heading", { name: /entrar no painel/i })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/i);
});

test("@a11y mobile menu closes with Escape and restores scrolling", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "mobile interaction");
  await page.goto("/", { waitUntil: "networkidle" });
  const menu = page.locator('button[aria-controls="mobile-navigation"]');
  await menu.click();
  await expect(page.getByRole("navigation", { name: "Menu principal mobile" })).toBeVisible();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Abrir menu" })).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("navigation", { name: "Menu principal mobile" })).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
});

test("missing hashed asset does not return the SPA shell on staging", async ({ request, baseURL }) => {
  test.skip(!baseURL?.includes("pages.dev"), "edge status is verified only against Cloudflare staging");
  const response = await request.get("/assets/fase-2-inexistente.js");
  expect(response.status()).toBe(404);
  expect(response.headers()["content-type"]).not.toContain("text/html");
});
