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
  assert.match(route, /resolution\.rule\.status_code === 410/);
  assert.match(placements, /global_announcement/);
  assert.match(placements, /home_featured/);
  assert.match(products, /catalog_featured/);
  assert.match(worker, /type: "page-by-path"/);
  assert.match(worker, /resolution\.kind === "page"/);
  assert.match(worker, /status === 404 \|\| status === 410/);
  assert.match(worker, /injectPageMetadata/);
  assert.match(worker, /paginas/);
  assert.match(worker, /site/);
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

  globalThis.fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const path = url.searchParams.get("path");
    if (path === "/pagina-retirada")
      return Response.json({ kind: "route", rule: { status_code: 410, destination_path: null } });
    if (path === "/pagina-antiga")
      return Response.json({ kind: "route", rule: { status_code: 301, destination_path: "/pagina-nova" } });
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
          media_urls: {},
        },
      });
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
