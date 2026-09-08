import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { mockCmsPublicFallbacks } from "./cms-public-mock";

test.beforeEach(async ({ page, baseURL }) => {
  if (!baseURL?.includes("pages.dev")) await mockCmsPublicFallbacks(page);
});

const routes = [
  { path: "/", status: 200 },
  { path: "/produtos", status: 200 },
  { path: "/servicos", status: 200 },
  { path: "/industrias", status: 200 },
  { path: "/aplicacoes", status: 200 },
  { path: "/solucoes", status: 200 },
  { path: "/contato", status: 200 },
  { path: "/blog", status: 200 },
  { path: "/campanhas/campanha-sintetica-inexistente", status: 200, edgeStatus: 404 },
  { path: "/relatorio-de-obra/login", status: 200 },
  { path: "/admin/login", status: 200 },
  { path: "/admin/recuperar-senha", status: 200 },
];

for (const route of routes) {
  test(`smoke ${route.path}`, async ({ page, baseURL }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        const location = message.location().url;
        consoleErrors.push(location ? `${message.text()} @ ${location}` : message.text());
      }
    });

    const response = await page.goto(route.path, { waitUntil: "networkidle" });
    const edgeRuntime = Boolean(process.env.PLAYWRIGHT_EDGE || baseURL?.includes("pages.dev"));
    const expectedStatus =
      edgeRuntime && "edgeStatus" in route ? (route.edgeStatus ?? route.status) : route.status;
    expect(response?.status()).toBe(expectedStatus);
    await expect(page.locator("h1").first()).toBeVisible();
    expect(await page.locator("body").evaluate((body) => body.scrollWidth <= body.clientWidth + 1)).toBe(
      true,
    );
    const unexpectedConsoleErrors =
      expectedStatus >= 400
        ? consoleErrors.filter((message) => !message.endsWith(`@ ${page.url()}`))
        : consoleErrors;
    expect(unexpectedConsoleErrors).toEqual([]);
  });
}

test("@a11y critical public journeys have no serious automated violations", async ({ page }) => {
  // Six complete axe scans against the remote edge can legitimately exceed the
  // default 30 s even after every route has rendered.
  test.setTimeout(60_000);
  for (const route of [
    "/",
    "/contato",
    "/produtos",
    "/solucoes",
    "/blog",
    "/campanhas/campanha-sintetica-inexistente",
  ]) {
    await page.goto(route, { waitUntil: "networkidle" });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? ""),
    );
    expect(serious, `${route}: ${serious.map((item) => item.id).join(", ")}`).toEqual([]);
  }
});

test("staging exposes the clean-room launch projection", async ({ page, baseURL }) => {
  test.skip(!baseURL?.includes("pages.dev"), "published projection is verified against staging");
  for (const [path, heading] of [
    ["/", "Tecnologia aplicada a processos e operações"],
    ["/sobre", "Engenharia orientada ao contexto da operação"],
    ["/politica-de-privacidade", "Privacidade e tratamento de dados"],
    ["/biodigestor", "Biodigestão com escopo técnico definido"],
    ["/deteccao-de-gas", "A tecnologia depende do cenário de risco"],
    ["/servicos/instalacao-de-medidores", "Instalação de Medidores"],
    ["/industrias/saneamento", "Saneamento"],
    ["/industrias/telemetria", "Telemetria e Operações Remotas"],
    ["/aplicacoes/medicao-estacoes-agua-esgoto", "Medição em Estações de Água e Esgoto"],
    ["/solucoes/instrumentacao-monitoramento-remoto", "Instrumentação e Monitoramento Remoto"],
  ] as const) {
    const response = await page.goto(path, { waitUntil: "networkidle" });
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    expect(await page.locator("body").evaluate((body) => body.scrollWidth <= body.clientWidth + 1)).toBe(
      true,
    );
  }
});

test("staging retires legacy gas detail routes and redirects replaced sectors", async ({
  request,
  baseURL,
}) => {
  test.skip(!baseURL?.includes("pages.dev"), "edge status is verified only against Cloudflare staging");
  const retired = await request.get("/deteccao-de-gas/deteccao-movel/s800", { maxRedirects: 0 });
  expect(retired.status()).toBe(404);
  expect(retired.headers()["x-robots-tag"]).toContain("noindex");
  const redirected = await request.get("/setores/telemetria", { maxRedirects: 0 });
  expect(redirected.status()).toBe(301);
  expect(redirected.headers().location).toBe("/industrias/telemetria");
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

test("new and consolidated admin routes remain fail-closed", async ({ page }) => {
  for (const route of [
    "/admin/assistente",
    "/admin/qualidade",
    "/admin/auditoria",
    "/admin/produtos/importacao",
    "/admin/listas-mestras",
    "/admin/busca",
    "/admin/meu-trabalho",
  ]) {
    // Stop waiting as soon as the protected document is committed: React may
    // replace it with /admin/login before the original load event on fast mobile
    // runs, which is the expected security behavior rather than a navigation error.
    await page.goto(route, { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/admin\/login$/);
  }
});

test("@a11y admin authentication keeps visible focus, contrast and reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/admin/login", { waitUntil: "networkidle" });
  const email = page.getByLabel("E-mail corporativo");
  await email.focus();
  await expect(email).toBeFocused();
  const focusStyle = await email.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outline: style.outlineStyle, width: style.outlineWidth, shadow: style.boxShadow };
  });
  expect(focusStyle.outline !== "none" || focusStyle.shadow !== "none").toBe(true);
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? "")),
  ).toEqual([]);
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
