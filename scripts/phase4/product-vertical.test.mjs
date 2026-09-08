import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = (path) => readFile(path, "utf8");

test("F4 product contract covers the full clean-room vertical", async () => {
  const [contract, migration, hardening, roundTrip] = await Promise.all([
    read("src/shared/contracts/cms-content.ts"),
    read("supabase/migrations/0019_fase4_product_vertical.sql"),
    read("supabase/migrations/0021_fase4_authorized_pilot_hardening.sql"),
    read("supabase/migrations/0024_fase4_product_identity_and_roundtrip.sql"),
  ]);
  for (const marker of [
    "manufacturer",
    "brand",
    "manufacturerReference",
    "productLine",
    "classification",
    "models",
    "variants",
    "specifications",
    "media",
    "documents",
    "relations",
    "search",
    "redirects",
    "approval",
    "provenance",
  ])
    assert.match(contract, new RegExp(marker));
  assert.match(migration, /cms\.catalog-product\.v1/);
  assert.match(migration, /cms_product_variant_projection/);
  assert.match(migration, /cms_product_attribute_projection/);
  assert.match(migration, /CMS_PRODUCT_RELATION_UNPUBLISHED/);
  assert.match(contract, /sourcePath/);
  assert.match(contract, /authorizationReference/);
  assert.match(contract, /storagePath/);
  assert.match(hardening, /cms-documents-private/);
  assert.match(hardening, /security invoker/i);
  assert.match(roundTrip, /brand_name/);
  assert.match(roundTrip, /manufacturer_reference/);
  assert.match(roundTrip, /storage_path/);
  assert.match(roundTrip, /required boolean/);
  assert.doesNotMatch(
    migration,
    /insert\s+into\s+public\.cms_(?:content_items|published_projection|media_assets)/i,
  );
});

test("F4 admin editor exposes every governed section and workflow", async () => {
  const [editor, list, modelsEditor] = await Promise.all([
    read("src/admin/pages/AdminProductEditorPage.tsx"),
    read("src/admin/pages/AdminProductsPage.tsx"),
    read("src/admin/components/ProductModelsEditor.tsx"),
  ]);
  for (const label of ["Dados essenciais", "Modelos", "Mídia", "SEO e publicação"])
    assert.match(editor, new RegExp(label));
  assert.match(editor, /Preview fiel/);
  assert.match(editor, /Restaurar como nova revisão/);
  assert.match(editor, /cms:products\.approve/);
  assert.match(editor, /Modelos, variantes e atributos técnicos/);
  assert.match(editor, /mantidos uma única vez na etapa Modelos/);
  assert.match(editor, /Especificações/);
  assert.match(editor, /ProductModelsEditor/);
  assert.doesNotMatch(editor, /<label>\s*(?:UUID|JSON)/i);
  assert.match(modelsEditor, /Referência do fabricante/);
  assert.match(modelsEditor, /Código comercial da variante/);
  assert.match(editor, /onKeyDown/);
  assert.match(editor, /ArrowRight/);
  assert.match(editor, /role="tabpanel"/);
  assert.match(list, /Catálogo editorial vazio/);
  assert.match(list, /anterior é consultado/i);
});

test("F4 public consumers share only the published projection", async () => {
  const files = await Promise.all(
    [
      "src/public/pages/CmsProductsPage.tsx",
      "src/public/pages/CmsProductPage.tsx",
      "src/public/pages/CmsComparePage.tsx",
      "src/public/pages/CmsSearchPage.tsx",
      "src/public/components/ProductCard.tsx",
      "src/public/components/CmsProductRenderer.tsx",
      "src/public/catalog-seo.ts",
      "supabase/functions/cms-public/index.ts",
    ].map(read),
  );
  const source = files.join("\n");
  for (const marker of [
    "cms_published_projection",
    'type === "sitemap"',
    'type === "redirect"',
    "Product",
    "canonical",
    "compar",
    "facets",
    "noindex,follow",
    "Relações",
    "Documentos",
  ])
    assert.match(source, new RegExp(marker, "i"));
  assert.doesNotMatch(source, /app\/data\/products|site-content|deteccaoGas|fallback hardcoded/i);
});

test("F4 product collections remain isolated from discovery content", async () => {
  const client = await read("src/public/catalog-api.ts");
  const publicApi = await read("supabase/functions/cms-public/index.ts");
  assert.match(client, /type: "products", contentType: "product"/);
  assert.match(publicApi, /type === "products" \? "product" : null/);
});

test("public sitemap applies the content-type partition requested by the Worker", async () => {
  const publicApi = await read("supabase/functions/cms-public/index.ts");
  assert.match(publicApi, /url\.searchParams\.get\("contentTypes"\)/);
  assert.match(publicApi, /\.in\("content_type", sitemapTypes\)/);
  assert.doesNotMatch(publicApi, /requestedTypes\.includes\(row\.content_type\)/);
});

test("F4 route and security boundaries include products, search, preview and admin", async () => {
  const [routes, worker] = await Promise.all([read("src/app/routes.tsx"), read("cloudflare/_worker.js")]);
  assert.match(routes, /CmsProductsPage/);
  assert.match(routes, /CmsProductPage/);
  assert.match(routes, /CmsComparePage/);
  assert.match(routes, /CmsSearchPage/);
  assert.match(worker, /produtos\(\?:\\\/novo/);
  assert.match(worker, /private, no-store/);
  assert.match(worker, /noindex, nofollow, noarchive/);
});
