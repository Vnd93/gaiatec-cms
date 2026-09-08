import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");

test("F6 migration is clean-room, governed and reversible", async () => {
  const sql = await read("supabase/migrations/0026_fase6_site_builder.sql");
  assert.match(sql, /nenhum conteudo editorial ou midia/i);
  assert.doesNotMatch(sql, /insert into public\.cms_content_items/i);
  assert.doesNotMatch(sql, /insert into public\.cms_media_assets/i);
  for (const evidence of [
    "cms_validate_site_builder_publication",
    "CMS_ROUTE_RESERVED_OR_INVALID",
    "CMS_PAGE_APPROVAL_REQUIRED",
    "CMS_MEDIA_NOT_READY",
    "CMS_PLACEMENT_TARGET_NOT_PUBLISHED",
    "cms_unpublish_archived_site_content",
    "cms_route_rules",
    "cms_hard_delete_draft",
    "cms_editorial_command_receipts",
    "cms:homepage.read",
    "cms:homepage.edit",
    "cms:homepage.publish",
    "relation_key",
  ])
    assert.match(sql, new RegExp(evidence));
  assert.doesNotMatch(sql, /if route_path<>'\/' then/i);
});

test("visual builder and global administration have public consumers", async () => {
  const routes = await read("src/app/routes.tsx");
  const renderer = await read("src/public/components/CmsPageRenderer.tsx");
  const shell = await read("src/public/site-shell-context.tsx");
  const publicApi = await read("supabase/functions/cms-public/index.ts");
  const previewApi = await read("supabase/functions/cms-preview/index.ts");
  for (const route of [
    "AdminPagesPage",
    "AdminPageBuilderPage",
    "AdminSiteConfigurationPage",
    "CmsManagedPageRoute",
  ])
    assert.match(routes, new RegExp(route));
  for (const block of ["hero", "rich_text", "gallery", "benefit_grid", "faq", "form", "related_content"])
    assert.match(renderer, new RegExp(block));
  assert.match(shell, /getPublishedSiteShell/);
  assert.match(publicApi, /page-by-path/);
  assert.match(publicApi, /site-shell/);
  assert.match(publicApi, /activePlacements/);
  assert.match(publicApi, /media_alt/);
  assert.match(previewApi, /blockAssetIds/);
  assert.match(previewApi, /media_alt/);
});

test("preview preflight explicitly permits its authenticated GET consumer", async () => {
  const [previewApi, sharedSecurity] = await Promise.all([
    read("supabase/functions/cms-preview/index.ts"),
    read("supabase/functions/_shared/security.ts"),
  ]);
  assert.match(previewApi, /req\.method === "GET"/);
  assert.match(sharedSecurity, /"Access-Control-Allow-Methods": "GET, POST, OPTIONS"/);
});

test("active global shell no longer consumes the discontinued admin data hooks", async () => {
  for (const file of [
    "src/app/components/Header.tsx",
    "src/app/components/Footer.tsx",
    "src/app/components/ContactSection.tsx",
  ]) {
    const source = await read(file);
    assert.doesNotMatch(source, /useMenu|useContactInfo|SiteMenuItem/);
    assert.match(source, /usePublishedSiteShell/);
  }
});

test("editor rejects arbitrary executable markup and keeps structured block controls", async () => {
  const contract = await read("src/shared/contracts/cms-content.ts");
  const editor = await read("src/admin/components/PageBlockEditor.tsx");
  const renderer = await read("src/public/components/CmsPageRenderer.tsx");
  assert.doesNotMatch(contract, /custom_html|custom_css|custom_js/);
  assert.doesNotMatch(renderer, /dangerouslySetInnerHTML|eval\(/);
  assert.doesNotMatch(editor, /JSON\.parse|JSON\.stringify/);
  assert.match(editor, /onMove/);
  assert.match(editor, /onDuplicate/);
  assert.match(editor, /onRemove/);
});

test("retired routes and scheduled placements are resolved by the public integration", async () => {
  const publicApi = await read("supabase/functions/cms-public/index.ts");
  const route = await read("src/public/pages/CmsManagedPageRoute.tsx");
  const placements = await read("src/public/components/SitePlacements.tsx");
  const products = await read("src/public/pages/CmsProductsPage.tsx");
  const worker = await read("cloudflare/_worker.js");
  assert.match(publicApi, /cms_route_rules/);
  assert.match(route, /resolution\.kind === "route"/);
  assert.match(route, /resolution\.rule\.status === 410/);
  assert.match(placements, /global_announcement/);
  assert.match(placements, /home_featured/);
  assert.match(products, /catalog_featured/);
  assert.match(worker, /type: "page-by-path"/);
  assert.match(worker, /resolution\.kind === "page"/);
  assert.match(worker, /status === 404 \|\| status === 410/);
  assert.match(worker, /injectPageMetadata/);
  assert.match(worker, /paginas/);
  assert.match(worker, /site/);
  assert.match(worker, /new AbortController\(\)/);
  assert.match(worker, /setTimeout\(\(\) => controller\.abort\(\), 5_000\)/);
  assert.match(worker, /signal: controller\.signal/);
  assert.match(worker, /clearTimeout\(timeout\)/);
});

test("edge serves managed pages with initial SEO and real retirement statuses", async () => {
  const source = (await read("cloudflare/_worker.js"))
    .replace("__CMS_PUBLIC_API__", "https://example.supabase.co/functions/v1/cms-public")
    .replace("__CMS_PUBLIC_ANON_KEY__", "anon-test-key");
  const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  const originalFetch = globalThis.fetch;
  const html =
    '<!doctype html><html><head><title>Base</title><meta name="description" content="base"><meta name="robots" content="index, follow"><link rel="canonical" href="https://gaiatecsistemas.com.br/"></head><body><div id="root"></div></body></html>';
  const env = {
    PUBLIC_SITE_ORIGIN: "https://gaiatecsistemas.com.br",
    CF_PAGES_BRANCH: "main",
    CF_PAGES_COMMIT_SHA: "a".repeat(40),
    ASSETS: {
      fetch: async (request) =>
        new URL(request.url).pathname.endsWith(".xlsx")
          ? new Response("xlsx-template", {
              headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              },
            })
          : new Response(html, { headers: { "Content-Type": "text/html" } }),
    },
  };
  const sitemapRequests = [];
  let sitemapFailure = null;

  globalThis.fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const type = url.searchParams.get("type");
    const path = url.searchParams.get("path");
    if (type === "sitemap") {
      if (sitemapFailure === "network") throw new TypeError("network unavailable");
      if (sitemapFailure === "unavailable")
        return Response.json({ error: "temporarily unavailable" }, { status: 503 });
      if (sitemapFailure === "missing") return Response.json({ error: "not found" }, { status: 404 });
      sitemapRequests.push(url.searchParams.get("contentTypes"));
      return new Response('<?xml version="1.0"?><urlset></urlset>', {
        headers: { "Content-Type": "application/xml" },
      });
    }
    if (type === "detail" && url.searchParams.get("slug") === "medidor-qa")
      return Response.json({
        kind: "product",
        payload: {
          title: "Medidor QA",
          summary: "Produto sintético publicado pelo CMS.",
          brand: { name: "GAIATEC" },
          manufacturer: { name: "Fabricante QA" },
          models: [{ model: "GT-QA", sku: "QA-001" }],
          controlledClassification: { productCategory: { label: "Instrumentação" } },
          specifications: [
            { label: "Faixa nominal", type: "range", value: { min: 0, max: 10 }, unit: "bar" },
            { label: "Saídas", type: "enum", value: ["4–20 mA", "Modbus"] },
            { label: "Certificado", type: "boolean", value: true },
          ],
        },
        seo: {
          title: "Medidor QA | GAIATEC",
          description: "Produto sintético publicado pelo CMS.",
          canonicalPath: "/produtos/medidor-qa",
          indexable: true,
        },
        publishedAt: "2026-09-07T12:00:00.000Z",
      });
    if (type === "detail" && url.searchParams.get("slug") === "produto-indisponivel")
      return Response.json({ error: "temporarily unavailable" }, { status: 503 });
    if (
      type === "detail" &&
      ["produto-antigo", "produto-retirado", "produto-redirect-indisponivel"].includes(
        url.searchParams.get("slug"),
      )
    )
      return Response.json({ error: "not found" }, { status: 404 });
    if (type === "post-detail" && ["artigo-antigo", "artigo-retirado"].includes(url.searchParams.get("slug")))
      return Response.json({ error: "not found" }, { status: 404 });
    if (type === "post-detail" && url.searchParams.get("slug") === "artigo-qa")
      return Response.json({
        kind: "post",
        payload: { title: "Artigo QA", summary: "Conteúdo técnico para validação." },
        seo: {
          title: "Artigo QA | GAIATEC",
          description: "Conteúdo técnico para validação.",
          canonicalPath: "/blog/artigo-qa",
          indexable: true,
        },
        publishedAt: "2026-09-07T12:00:00.000Z",
      });
    if (type === "redirect" && path === "/blog/artigo-antigo")
      return Response.json({ status: 301, destinationPath: "/blog/artigo-novo" });
    if (type === "redirect" && path === "/blog/artigo-retirado")
      return Response.json({ status: 410, destinationPath: null });
    if (type === "redirect" && path === "/produtos/produto-antigo")
      return Response.json({ status: 301, destinationPath: "/produtos/produto-novo" });
    if (type === "redirect" && path === "/produtos/produto-retirado")
      return Response.json({ status: 410, destinationPath: null });
    if (type === "redirect" && path === "/produtos/produto-redirect-indisponivel")
      return Response.json({ error: "temporarily unavailable" }, { status: 503 });
    if (
      url.searchParams.get("type") === "entity-detail" &&
      url.searchParams.get("contentType") === "solution" &&
      url.searchParams.get("slug") === "instrumentacao-monitoramento-remoto"
    )
      return Response.json({
        kind: "solution",
        payload: { title: "Instrumentação e monitoramento remoto" },
        seo: {
          title: "Instrumentação e monitoramento remoto | GAIATEC",
          description: "Solução integrada publicada pelo CMS.",
          canonicalPath: "/solucoes/instrumentacao-monitoramento-remoto",
          indexable: true,
        },
        publishedAt: "2026-09-07T12:00:00.000Z",
      });
    if (
      type === "entity-detail" &&
      ["servico-antigo", "solucao-retirada", "industria-redirect-sem-rede"].includes(
        url.searchParams.get("slug"),
      )
    )
      return Response.json({ error: "not found" }, { status: 404 });
    if (type === "redirect" && path === "/servicos/servico-antigo")
      return Response.json({ status: 302, destinationPath: "/servicos/servico-novo" });
    if (type === "redirect" && path === "/solucoes/solucao-retirada")
      return Response.json({ status: 410, destinationPath: null });
    if (type === "redirect" && path === "/industrias/industria-redirect-sem-rede")
      throw new TypeError("network unavailable");
    if (type === "campaign-by-path" && path === "/campanhas/campanha-antiga")
      return Response.json({
        kind: "route",
        rule: { status: 301, destinationPath: "/campanhas/campanha-nova" },
      });
    if (type === "campaign-by-path" && path === "/campanhas/campanha-retirada")
      return Response.json({ kind: "route", rule: { status: 410, destinationPath: null } });
    if (path === "/pagina-retirada")
      return Response.json({ kind: "route", rule: { status: 410, destinationPath: null } });
    if (path === "/pagina-antiga")
      return Response.json({ kind: "route", rule: { status: 301, destinationPath: "/pagina-nova" } });
    if (path === "/pagina-nova")
      return Response.json({
        kind: "page",
        page: {
          payload: { title: "Página nova" },
          seo: {
            title: "Página nova | GAIATEC",
            description: "Descrição publicada pelo CMS.",
            canonicalPath: "/pagina-nova",
            indexable: true,
          },
          publishedAt: "2026-09-07T12:00:00.000Z",
        },
      });
    if (type === "page-by-path" && path === "/pagina-backend-indisponivel")
      return Response.json({ error: "temporarily unavailable" }, { status: 503 });
    if (type === "page-by-path" && path === "/pagina-sem-rede") throw new TypeError("network unavailable");
    if (type === "redirect" && path === "/redirect-backend-indisponivel")
      return Response.json({ error: "temporarily unavailable" }, { status: 503 });
    return Response.json({ kind: "fallback" });
  };

  try {
    const page = await module.default.fetch(new Request("https://gaiatecsistemas.com.br/pagina-nova"), env);
    const body = await page.text();
    assert.equal(page.status, 200);
    assert.match(body, /<title>Página nova \| GAIATEC<\/title>/);
    assert.match(body, /Descrição publicada pelo CMS/);
    assert.match(body, /rel="canonical" href="https:\/\/gaiatecsistemas\.com\.br\/pagina-nova"/);
    assert.match(body, /data-cms-page/);

    const discovery = await module.default.fetch(
      new Request("https://gaiatecsistemas.com.br/solucoes/instrumentacao-monitoramento-remoto"),
      env,
    );
    const discoveryBody = await discovery.text();
    assert.equal(discovery.status, 200);
    assert.match(discoveryBody, /<title>Instrumentação e monitoramento remoto \| GAIATEC<\/title>/);
    assert.match(discoveryBody, /Solução integrada publicada pelo CMS/);

    const product = await module.default.fetch(
      new Request("https://gaiatecsistemas.com.br/produtos/medidor-qa"),
      env,
    );
    const productBody = await product.text();
    assert.equal(product.status, 200);
    assert.equal(product.headers.get("cache-control"), "public, max-age=0, must-revalidate");
    assert.match(productBody, /<title>Medidor QA \| GAIATEC<\/title>/);
    assert.match(
      productBody,
      /rel="canonical" href="https:\/\/gaiatecsistemas\.com\.br\/produtos\/medidor-qa"/,
    );
    const productSchema = JSON.parse(
      productBody.match(/<script type="application\/ld\+json" data-cms-page>(.*?)<\/script>/)?.[1] ?? "{}",
    );
    assert.equal(productSchema["@type"], "Product");
    assert.equal(productSchema.name, "Medidor QA");
    assert.deepEqual(productSchema.additionalProperty[0].value, {
      "@type": "QuantitativeValue",
      minValue: 0,
      maxValue: 10,
      unitText: "bar",
    });
    assert.equal(productSchema.additionalProperty[0].unitText, undefined);
    assert.equal(productSchema.additionalProperty[1].value, "4–20 mA, Modbus");
    assert.equal(productSchema.additionalProperty[2].value, "Sim");
    assert.doesNotMatch(productBody, /\{\\?"min\\?"|\[\\?"4/);

    const article = await module.default.fetch(
      new Request("https://gaiatecsistemas.com.br/blog/artigo-qa"),
      env,
    );
    const articleBody = await article.text();
    assert.equal(article.status, 200);
    const articleSchema = JSON.parse(
      articleBody.match(/<script type="application\/ld\+json" data-cms-page>(.*?)<\/script>/)?.[1] ?? "{}",
    );
    assert.equal(articleSchema["@type"], "Article");
    assert.equal(articleSchema.datePublished, "2026-09-07T12:00:00.000Z");

    const unavailableProduct = await module.default.fetch(
      new Request("https://gaiatecsistemas.com.br/produtos/produto-indisponivel"),
      env,
    );
    assert.equal(unavailableProduct.status, 503);
    assert.equal(unavailableProduct.headers.get("cache-control"), "no-store, max-age=0");
    assert.match(unavailableProduct.headers.get("x-robots-tag") ?? "", /noindex/);

    const discoveryCollection = await module.default.fetch(
      new Request("https://gaiatecsistemas.com.br/solucoes"),
      env,
    );
    assert.equal(discoveryCollection.status, 200);

    const retired = await module.default.fetch(
      new Request("https://gaiatecsistemas.com.br/pagina-retirada"),
      env,
    );
    assert.equal(retired.status, 410);
    assert.match(retired.headers.get("x-robots-tag") ?? "", /noindex/);

    const redirect = await module.default.fetch(
      new Request("https://gaiatecsistemas.com.br/pagina-antiga"),
      env,
    );
    assert.equal(redirect.status, 301);
    assert.equal(redirect.headers.get("location"), "/pagina-nova");
    for (const header of [
      "strict-transport-security",
      "x-content-type-options",
      "x-frame-options",
      "referrer-policy",
      "permissions-policy",
      "cross-origin-opener-policy",
      "content-security-policy",
    ])
      assert.ok(redirect.headers.get(header), `redirect is missing ${header}`);
    assert.equal(redirect.headers.get("cache-control"), "public, max-age=0, must-revalidate");

    const blogRedirect = await module.default.fetch(
      new Request("https://gaiatecsistemas.com.br/blog/artigo-antigo"),
      env,
    );
    assert.equal(blogRedirect.status, 301);
    assert.equal(blogRedirect.headers.get("location"), "/blog/artigo-novo");

    const retiredBlog = await module.default.fetch(
      new Request("https://gaiatecsistemas.com.br/blog/artigo-retirado"),
      env,
    );
    assert.equal(retiredBlog.status, 410);
    assert.match(retiredBlog.headers.get("x-robots-tag") ?? "", /noindex/);

    const productRedirect = await module.default.fetch(
      new Request("https://gaiatecsistemas.com.br/produtos/produto-antigo"),
      env,
    );
    assert.equal(productRedirect.status, 301);
    assert.equal(productRedirect.headers.get("location"), "/produtos/produto-novo");

    const retiredProduct = await module.default.fetch(
      new Request("https://gaiatecsistemas.com.br/produtos/produto-retirado"),
      env,
    );
    assert.equal(retiredProduct.status, 410);
    assert.match(retiredProduct.headers.get("x-robots-tag") ?? "", /noindex/);

    const discoveryRedirect = await module.default.fetch(
      new Request("https://gaiatecsistemas.com.br/servicos/servico-antigo"),
      env,
    );
    assert.equal(discoveryRedirect.status, 302);
    assert.equal(discoveryRedirect.headers.get("location"), "/servicos/servico-novo");

    const retiredDiscovery = await module.default.fetch(
      new Request("https://gaiatecsistemas.com.br/solucoes/solucao-retirada"),
      env,
    );
    assert.equal(retiredDiscovery.status, 410);
    assert.match(retiredDiscovery.headers.get("x-robots-tag") ?? "", /noindex/);

    const campaignRedirect = await module.default.fetch(
      new Request("https://gaiatecsistemas.com.br/campanhas/campanha-antiga"),
      env,
    );
    assert.equal(campaignRedirect.status, 301);
    assert.equal(campaignRedirect.headers.get("location"), "/campanhas/campanha-nova");

    const retiredCampaign = await module.default.fetch(
      new Request("https://gaiatecsistemas.com.br/campanhas/campanha-retirada"),
      env,
    );
    assert.equal(retiredCampaign.status, 410);
    assert.match(retiredCampaign.headers.get("x-robots-tag") ?? "", /noindex/);

    for (const unavailablePath of [
      "/pagina-backend-indisponivel",
      "/pagina-sem-rede",
      "/redirect-backend-indisponivel",
      "/produtos/produto-redirect-indisponivel",
      "/industrias/industria-redirect-sem-rede",
    ]) {
      const unavailable = await module.default.fetch(
        new Request(`https://gaiatecsistemas.com.br${unavailablePath}`),
        env,
      );
      assert.equal(unavailable.status, 503, unavailablePath);
      assert.equal(unavailable.headers.get("cache-control"), "no-store, max-age=0");
      assert.match(unavailable.headers.get("x-robots-tag") ?? "", /noindex/);
    }

    const staticRedirect = await module.default.fetch(
      new Request("https://gaiatecsistemas.com.br/setores"),
      env,
    );
    assert.equal(staticRedirect.status, 301);
    assert.equal(staticRedirect.headers.get("location"), "/industrias");
    assert.ok(staticRedirect.headers.get("strict-transport-security"));

    for (const path of [
      "/sitemap.xml",
      "/sitemap-produtos.xml",
      "/sitemap-blog.xml",
      "/sitemap-conteudo.xml",
    ]) {
      const sitemap = await module.default.fetch(new Request(`https://gaiatecsistemas.com.br${path}`), env);
      assert.equal(sitemap.status, 200);
      assert.match(sitemap.headers.get("content-type") ?? "", /xml/);
    }
    assert.deepEqual(sitemapRequests, [
      null,
      "product",
      "post",
      "service,industry,application,solution,campaign,page,homepage",
    ]);

    for (const failureMode of ["unavailable", "network"]) {
      sitemapFailure = failureMode;
      const unavailableSitemap = await module.default.fetch(
        new Request("https://gaiatecsistemas.com.br/sitemap.xml"),
        env,
      );
      assert.equal(unavailableSitemap.status, 503, failureMode);
      assert.equal(unavailableSitemap.headers.get("cache-control"), "no-store, max-age=0");
      assert.match(unavailableSitemap.headers.get("x-robots-tag") ?? "", /noindex/);
    }
    sitemapFailure = "missing";
    const missingSitemap = await module.default.fetch(
      new Request("https://gaiatecsistemas.com.br/sitemap.xml"),
      env,
    );
    assert.equal(missingSitemap.status, 404);
    sitemapFailure = null;

    const admin = await module.default.fetch(
      new Request("https://gaiatecsistemas.com.br/admin/paginas"),
      env,
    );
    assert.equal(admin.status, 200);
    assert.match(admin.headers.get("cache-control") ?? "", /no-store/);

    const bulkAdmin = await module.default.fetch(
      new Request("https://gaiatecsistemas.com.br/admin/produtos/importacao"),
      env,
    );
    assert.equal(bulkAdmin.status, 200);
    assert.match(bulkAdmin.headers.get("cache-control") ?? "", /no-store/);

    const visualStudioAdmin = await module.default.fetch(
      new Request("https://gaiatecsistemas.com.br/admin/estudio-visual/49000000-0000-4000-8000-000000000201"),
      env,
    );
    assert.equal(visualStudioAdmin.status, 200);
    assert.match(visualStudioAdmin.headers.get("cache-control") ?? "", /no-store/);

    const sitesAdmin = await module.default.fetch(
      new Request("https://gaiatecsistemas.com.br/admin/sites"),
      env,
    );
    assert.equal(sitesAdmin.status, 200);
    assert.match(sitesAdmin.headers.get("cache-control") ?? "", /no-store/);
    const aiAdmin = await module.default.fetch(
      new Request("https://gaiatecsistemas.com.br/admin/assistente"),
      env,
    );
    assert.equal(aiAdmin.status, 200);
    assert.match(aiAdmin.headers.get("cache-control") ?? "", /no-store/);

    const invalidVisualStudioAdmin = await module.default.fetch(
      new Request("https://gaiatecsistemas.com.br/admin/estudio-visual/not-a-uuid"),
      env,
    );
    assert.equal(invalidVisualStudioAdmin.status, 404);

    const workbook = await module.default.fetch(
      new Request("https://gaiatecsistemas.com.br/modelos/GAIATEC-CMS-Cadastro-em-Massa-v1.xlsx"),
      env,
    );
    assert.equal(workbook.status, 200);
    assert.equal(await workbook.text(), "xlsx-template");
    assert.match(workbook.headers.get("content-type") ?? "", /spreadsheetml/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
