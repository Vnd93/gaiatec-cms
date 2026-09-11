import { expect, test, type Page } from "@playwright/test";

// O bloqueio NAO e necessario para a interceptacao funcionar: medido contra o alias publicado, com
// o service worker ativo em escopo "/" e controlando a pagina, o `page.route` interceptou cms-public
// normalmente e o spec passou nos dois projetos. Ele fica porque remove o service worker como
// variavel de um spec que intercepta rede, e porque e a convencao do repositorio -- a mesma de
// cms-admin-ops-cycles, cms-secondary-ui-cycles, cms-auth-invite-recovery e do preflight de producao.
test.use({ serviceWorkers: "block" });

const governedImageUrl =
  "https://media.gaiatec-qa.invalid/functions/v1/cms-public?type=media&kind=product&slug=produto-imagem-governada&slot=primary";
const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=",
  "base64",
);

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
            kind: "product",
            slug: "produto-e2e-controlado",
            path: "/produtos/produto-e2e-controlado",
            payload: {
              title: "Produto E2E controlado",
              summary: "Produto sintético exclusivo do teste local.",
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
              models: [{ model: "MODELO-E2E", status: "active", variants: [] }],
              specifications: [],
              media: [],
              documents: [],
              blocks: [],
            },
            seo: {
              title: "Produto E2E controlado | GAIATEC",
              description: "Produto sintético para validar filtros e comparação no navegador local.",
              canonicalPath: "/produtos/produto-e2e-controlado",
              indexable: false,
            },
            publishedAt: "2026-08-30T12:00:00.000Z",
            relatedItems: [],
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

async function mockPublishedProductWithGovernedImage(page: Page) {
  await page.route("**/functions/v1/cms-public?**", async (route) => {
    const url = new URL(route.request().url());
    const type = url.searchParams.get("type");
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify(body),
      });

    if (type === "media") {
      return route.fulfill({
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "image/png",
          "Cross-Origin-Resource-Policy": "cross-origin",
        },
        body: onePixelPng,
      });
    }
    if (type === "detail") {
      return json({
        kind: "product",
        slug: "produto-imagem-governada",
        path: "/produtos/produto-imagem-governada",
        payload: {
          title: "Produto com imagem governada",
          summary: "Publicação sintética para validar entrega cross-site de mídia.",
          commercial: {
            shortDescription: "Imagem entregue pelo proxy público governado.",
            valueProposition: "Validação exclusiva do navegador local.",
            benefits: [],
            differentiators: [],
          },
          media: [
            {
              role: "primary",
              alt: "Imagem pública governada",
              image: { src: governedImageUrl, alt: "Imagem pública governada" },
            },
          ],
          models: [],
          specifications: [],
          documents: [],
          blocks: [],
        },
        seo: {
          title: "Produto com imagem governada | GAIATEC",
          description: "Publicação sintética para validar entrega segura de mídia.",
          canonicalPath: "/produtos/produto-imagem-governada",
          indexable: false,
        },
        publishedAt: "2026-09-08T12:00:00.000Z",
        relatedItems: [],
      });
    }
    if (type === "site-shell") return json({ navigation: null, settings: null, placements: null });
    if (type === "campaign-placements") return json({ items: [] });
    if (type === "form") return route.fulfill({ status: 204 });
    return json({ error: "Fixture pública ausente." }, 404);
  });
}

test("product catalog preserves filters, cards and comparison flow", async ({ page }) => {
  await mockProductCatalog(page);
  await page.goto("/produtos", { waitUntil: "load" });

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
  await page.goto("/produtos", { waitUntil: "load" });

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

test("published governed image loads cross-site without a CORP browser failure", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "cross-site delivery contract");
  const corpConsoleFailures: string[] = [];
  const corpRequestFailures: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /corp|not.?same.?site|blocked by response/i.test(message.text())) {
      corpConsoleFailures.push(message.text());
    }
  });
  page.on("requestfailed", (request) => {
    if (request.url() === governedImageUrl) {
      corpRequestFailures.push(request.failure()?.errorText ?? "unknown image request failure");
    }
  });
  await mockPublishedProductWithGovernedImage(page);

  const mediaResponsePromise = page.waitForResponse((response) => response.url() === governedImageUrl);
  await page.goto("/produtos/produto-imagem-governada", { waitUntil: "load" });
  const mediaResponse = await mediaResponsePromise;
  const image = page.getByRole("img", { name: "Imagem pública governada" });

  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  expect(mediaResponse.headers()["cross-origin-resource-policy"]).toBe("cross-origin");
  expect(corpConsoleFailures).toEqual([]);
  expect(corpRequestFailures).toEqual([]);
});
