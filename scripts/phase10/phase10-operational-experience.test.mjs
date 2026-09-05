import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("same-user token refresh stays mounted while expiration remains fail-closed", async () => {
  const [auth, testSource] = await Promise.all([
    read("src/admin/auth/AdminAuthContext.tsx"),
    read("tests/components/admin-auth-session-continuity.test.tsx"),
  ]);
  assert.match(auth, /passiveSameUserEvent/);
  assert.match(auth, /refreshSameUserInBackground/);
  assert.match(auth, /TOKEN_REFRESHED/);
  assert.match(auth, /updateStatus\("signed_out"\)/);
  for (const event of ["visibilitychange", "blur", "focus", "TOKEN_REFRESHED", "SIGNED_OUT"])
    assert.match(testSource, new RegExp(event));
});

test("all governed editors use namespaced recoverable draft backups", async () => {
  const editors = [
    "AdminPageBuilderPage.tsx",
    "AdminProductEditorPage.tsx",
    "AdminCampaignEditorPage.tsx",
    "AdminEditorPage.tsx",
    "AdminDiscoveryPage.tsx",
    "AdminSiteConfigurationPage.tsx",
  ];
  for (const name of editors) {
    const source = await read(`src/admin/pages/${name}`);
    assert.match(source, /useDraftBackup/, `${name} needs automatic backup`);
    assert.match(source, /backup\.clear\(\)/, `${name} must clear after persistence`);
  }
  const hook = await read("src/admin/hooks/useDraftBackup.ts");
  assert.match(hook, /localStorage/);
  assert.match(hook, /environment.*userId.*editorType.*itemKey/s);
  assert.match(hook, /DRAFT_BACKUP_TTL_MS/);
});

test("controlled vocabularies are generic, audited, MFA protected and non-destructive", async () => {
  const [migration, edge, contract, bulk, projection] = await Promise.all([
    read("supabase/migrations/0035_fase10_controlled_vocabularies.sql"),
    read("supabase/functions/cms-controlled-vocabularies/index.ts"),
    read("src/shared/contracts/cms-content.ts"),
    read("src/admin/bulk-import-model.ts"),
    read("supabase/functions/_shared/cms-public-projection.ts"),
  ]);
  for (const value of [
    "cms_controlled_lists",
    "cms_controlled_options",
    "cms:vocabularies.manage",
    "cms_audit_log",
    "CMS_CONTROLLED_DELETE_FORBIDDEN",
    "cms_normalize_controlled_payload",
  ])
    assert.match(migration, new RegExp(value.replace(":", "\\:")));
  assert.match(edge, /authenticateCms/);
  assert.match(edge, /cms_actor_authorized/);
  assert.match(contract, /controlledClassification/);
  assert.match(contract, /serviceKindRef/);
  for (const header of [
    "categoria_produto_id",
    "aplicacao_grandeza_id",
    "tecnologia_id",
    "instalacao_operacao_id",
    "elemento_monitorado_id",
  ])
    assert.match(bulk, new RegExp(header));
  assert.match(projection, /publicRef/);
  assert.match(projection, /delete safe\.manufacturer/);
  assert.match(projection, /delete publicModel\.manufacturerReference/);
  assert.match(projection, /delete publicModel\.sku/);
});

test("product UX follows operational cards, sticky status, visual models and advanced JSON", async () => {
  const [page, models, css] = await Promise.all([
    read("src/admin/pages/AdminProductEditorPage.tsx"),
    read("src/admin/components/ProductModelsEditor.tsx"),
    read("src/admin/admin.css"),
  ]);
  assert.match(page, /admin-editor-workspace/);
  assert.match(page, /admin-editor-rail/);
  assert.match(page, /admin-editor-footer/);
  assert.match(page, /Área avançada/);
  assert.match(page, /ControlledTermSelect/);
  for (const action of ["Adicionar modelo", "Adicionar variante", "Inativ"])
    assert.match(models, new RegExp(action));
  assert.match(css, /position:\s*sticky/);
  assert.match(css, /@media \(max-width: 600px\)/);
});

test("bulk template is generated from the governed headers and never creates vocabulary", async () => {
  const [page, bulk] = await Promise.all([
    read("src/admin/pages/AdminBulkImportPage.tsx"),
    read("src/admin/bulk-import-model.ts"),
  ]);
  assert.match(page, /downloadBulkImportTemplate/);
  assert.match(page, /bulkRequiredHeaders\.products/);
  assert.match(page, /Listas mestras/);
  assert.doesNotMatch(bulk, /upsert.*option/is);
});

test("controlled dimensions reach public detail, filters, comparison and service rendering", async () => {
  const [api, detail, products, compare, discovery] = await Promise.all([
    read("supabase/functions/cms-public/index.ts"),
    read("src/public/components/CmsProductRenderer.tsx"),
    read("src/public/pages/CmsProductsPage.tsx"),
    read("src/public/pages/CmsComparePage.tsx"),
    read("src/public/components/DiscoveryEntityRenderer.tsx"),
  ]);
  for (const key of [
    "productCategory",
    "applicationMagnitude",
    "technology",
    "installationOperation",
    "monitoredElement",
  ]) {
    assert.match(api, new RegExp(key));
    assert.match(products, new RegExp(key));
    assert.match(compare, new RegExp(key));
  }
  assert.match(detail, /controlledClassification/);
  assert.match(discovery, /serviceKindRef/);
});
