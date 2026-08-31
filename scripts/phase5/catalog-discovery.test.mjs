import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = (p) => readFile(p, "utf8");
test("F5 migration is clean-room and guarded", async () => {
  const sql = await read("supabase/migrations/0025_fase5_catalog_discovery.sql");
  assert.match(sql, /Nenhum conteudo/);
  assert.match(sql, /CMS_F5_ORPHAN_RELATION/);
  assert.match(sql, /enable row level security/g);
  assert.doesNotMatch(sql, /insert into public\.cms_content_items/i);
});
test("all F5 consumers and admin editors are routed", async () => {
  const routes = await read("src/app/routes.tsx");
  for (const route of [
    "industrias",
    "aplicacoes",
    "solucoes",
    "servicos",
    "AdminDiscoveryPage",
    "AdminSearchGovernancePage",
  ])
    assert.match(routes, new RegExp(route));
  const diagnostics = await read("src/admin/pages/AdminDiagnosticsPage.tsx");
  assert.match(diagnostics, /cms_discovery_projection/);
  for (const type of ["service", "industry", "application", "solution"])
    assert.match(diagnostics, new RegExp(type));
});
test("institutional editor is structured for efficient operation", async () => {
  const page = await read("src/admin/pages/AdminDiscoveryPage.tsx");
  const editor = await read("src/admin/components/DiscoveryContentEditor.tsx");
  const styles = await read("src/admin/admin.css");
  assert.match(page, /DiscoveryContentEditor/);
  for (const section of ["Conteúdo", "Busca, CTA e SEO", "Mídia e relações", "Governança", "Avançado"])
    assert.match(editor, new RegExp(section));
  for (const field of ["Título público", "Resumo", "Texto do botão", "Título SEO", "JSON governado"])
    assert.match(editor, new RegExp(field));
  assert.match(styles, /\.admin-field-grid/);
  assert.match(styles, /\.admin-workflow-bar/);
});
test("unified search uses only published projection", async () => {
  const fn = await read("supabase/functions/cms-public/index.ts");
  assert.match(fn, /cms_published_projection/);
  assert.match(fn, /cms_search_synonyms/);
  assert.match(fn, /cms_search_events/);
  assert.doesNotMatch(fn, /products\.ts|servicesList|deteccaoGas/);
});
test("gas detection decision preserves technical model", async () => {
  const contract = await read("src/shared/contracts/cms-content.ts");
  assert.match(contract, /integrated_master_catalog/);
  assert.match(contract, /gasDetectionModel/);
});
test("autocomplete exposes an operable combobox without nested main landmarks", async () => {
  const search = await read("src/public/pages/CmsSearchPage.tsx");
  assert.match(search, /role="combobox"/);
  assert.match(search, /role="listbox"/);
  assert.match(search, /aria-activedescendant/);
  assert.match(search, /ArrowDown/);
  assert.match(search, /ArrowUp/);
  assert.doesNotMatch(search, /<main/);
  for (const page of ["CmsDiscoveryListPage.tsx", "CmsDiscoveryDetailPage.tsx"])
    assert.doesNotMatch(await read(`src/public/pages/${page}`), /<main/);
});
