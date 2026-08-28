import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const routes = ["/", "/produtos", "/contato", "/blog", "/relatorio-de-obra/login"];

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
  for (const route of ["/", "/contato", "/produtos"]) {
    await page.goto(route, { waitUntil: "networkidle" });
    const results = await new AxeBuilder({ page }).disableRules(["color-contrast"]).analyze();
    const serious = results.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? ""),
    );
    expect(serious, `${route}: ${serious.map((item) => item.id).join(", ")}`).toEqual([]);
  }
});

test("missing hashed asset does not return the SPA shell on staging", async ({ request, baseURL }) => {
  test.skip(!baseURL?.includes("pages.dev"), "edge status is verified only against Cloudflare staging");
  const response = await request.get("/assets/fase-2-inexistente.js");
  expect(response.status()).toBe(404);
  expect(response.headers()["content-type"]).not.toContain("text/html");
});
