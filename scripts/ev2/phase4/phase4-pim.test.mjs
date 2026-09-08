import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

test("EV2.4 migration is additive, private and preserves v1", async () => {
  const sql = await read("supabase/migrations/0041_ev2_pim_core.sql");
  for (const table of [
    "cms_pim_products",
    "cms_pim_product_master_links",
    "cms_pim_models",
    "cms_pim_variants",
    "cms_pim_skus",
    "cms_pim_external_identifiers",
    "cms_pim_units",
    "cms_pim_attribute_definitions",
    "cms_pim_attribute_sets",
    "cms_pim_attribute_set_versions",
    "cms_pim_attribute_set_definitions",
    "cms_pim_attribute_values",
    "cms_pim_provenance",
    "cms_pim_command_receipts",
    "cms_pim_events",
  ]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`));
    assert.match(sql, new RegExp(`'${table}'`));
  }
  assert.match(sql, /enable row level security/);
  assert.match(sql, /from public,anon,authenticated/);
  assert.match(sql, /to service_role/);
  assert.doesNotMatch(sql, /revoke all on all tables/i);
  assert.doesNotMatch(sql, /drop table|drop column|truncate/i);
  assert.doesNotMatch(sql, /insert into public\.cms_published_projection|update public\.cms_content_items/i);
});

test("identity, SKU, units and historical v2 evidence remain traceable", async () => {
  const [sql, hotfix, historicalDatabaseTest, currentDatabaseTest] = await Promise.all([
    read("supabase/migrations/0041_ev2_pim_core.sql"),
    read("supabase/migrations/0042_ev2_pim_conflict_sqlstate.sql"),
    read("supabase/tests/historical/rls_ev2_phase4_pim_mutating_v2.sql.txt"),
    read("supabase/tests/rls_ev2_phase4_pim.test.sql"),
  ]);
  for (const evidence of [
    "cms_pim_models_mpn_active_uidx",
    "cms_pim_skus_code_uidx",
    "cms_pim_skus_owner_active_uidx",
    "cms_pim_sku_immutable",
    "CMS_PIM_DELETE_FORBIDDEN",
    "CMS_PIM_IDEMPOTENCY_CONFLICT",
    "CMS_PIM_CONFLICT",
    "CMS_PIM_COMPATIBILITY_INVALID",
    "CMS_PIM_RANGE_INVALID",
    "factor_to_canonical",
    "cms_pim_attribute_values_numeric_idx",
    "cms_pim_attribute_sets_active_category_uidx",
  ]) {
    assert.match(sql, new RegExp(evidence));
  }
  assert.match(sql, /coalesce\(p_payload->>'mode',''\) not in \('create','update'\)/);
  assert.match(sql, /p_payload->>'mode' <> 'create'/);
  assert.match(sql, /p_payload->>'mode' <> 'update'/);
  assert.match(hotfix, /v_matches <> 2/);
  assert.match(hotfix, /ERRCODE = ''P0001''/);
  assert.match(historicalDatabaseTest, /'P0001',\s*'CMS_PIM_CONFLICT'/);
  assert.match(historicalDatabaseTest, /HISTORICAL ONLY/);
  assert.match(currentDatabaseTest, /CMS_PIM_LEGACY_READ_ONLY/);
  assert.match(currentDatabaseTest, /cms-content consolidation in migration 0078/i);
});

test("PIM and attribute Edge boundaries are authenticated and production-gated", async () => {
  const [pim, attributes] = await Promise.all([
    read("supabase/functions/cms-pim/index.ts"),
    read("supabase/functions/cms-attributes/index.ts"),
  ]);
  for (const [source, prefix] of [
    [pim, "CMS_PIM"],
    [attributes, "CMS_ATTRIBUTES"],
  ]) {
    assert.match(source, /authenticateCms/);
    assert.match(source, /consumeRateLimit/);
    assert.match(source, /cms_evaluate_feature_flag/);
    assert.match(source, /CMS_ENVIRONMENT/);
    assert.match(source, new RegExp(`${prefix}_PRODUCTION_GATED`));
    assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY\s*=/);
  }
  assert.match(pim, /contentItemId: row\.content_item_id \?\? undefined/);
  assert.match(pim, /sourceSha256: entry\.source_sha256 \?\? undefined/);
  assert.match(pim, /typeof errorRecord\.message === "string"/);
  assert.match(pim, /\["P0001", "40001", "23505"\]\.includes\(databaseCode\)/);
  assert.doesNotMatch(pim, /canonicalMin:/);
  assert.doesNotMatch(attributes, /\.insert\(|\.update\(|\.delete\(/);
});

test("guided editor uses strict contracts, attribute sets and adapter v1", async () => {
  const [contract, page, adapter, pimEdge, hardening, routes, navigation] = await Promise.all([
    read("src/shared/contracts/ev2-pim.ts"),
    read("src/admin/pages/AdminPimPage.tsx"),
    read("src/admin/pim-v1-adapter.ts"),
    read("supabase/functions/cms-pim/index.ts"),
    read("supabase/migrations/0060_cms_pim_publication_integrity.sql"),
    read("src/app/routes.tsx"),
    read("src/admin/admin-navigation.ts"),
  ]);
  assert.match(contract, /mode: z\.enum\(\["create", "update"\]\)/);
  assert.match(contract, /expectedVersion is required/);
  assert.match(contract, /Ev2PimAttributeCatalogResultSchema/);
  assert.match(page, /isEv2FeatureEnabled\(profile, "ev2\.pim_v2"\)/);
  assert.match(page, /attributesCommand/);
  assert.match(page, /Visão especializada de produtos/);
  assert.match(page, /consulta o mesmo cadastro oficial de Produtos/);
  assert.match(page, /Abrir cadastro completo/);
  assert.match(page, /Reconciliação autoritativa do produto legado/);
  assert.doesNotMatch(page, /<label>\s*(?:UUID|JSON)/i);
  assert.match(adapter, /pimGraphToV1/);
  assert.match(adapter, /comparePimV1Projection/);
  assert.match(adapter, /CMS_PIM_ACTIVE_SKU_REQUIRED/);
  assert.match(adapter, /CMS_PIM_PUBLIC_DATA_REQUIRED/);
  assert.doesNotMatch(adapter, /["']PENDENTE["']/);
  assert.doesNotMatch(adapter, /Marca não informada|Linha geral|Não informado/);
  assert.match(pimEdge, /CMS_PIM_ACTIVE_SKU_REQUIRED/);
  assert.match(pimEdge, /CMS_PIM_PUBLIC_DATA_REQUIRED/);
  assert.doesNotMatch(pimEdge, /["']PENDENTE["']/);
  assert.doesNotMatch(pimEdge, /Marca não informada|Linha geral|Não informado/);
  assert.match(hardening, /cms_require_pim_active_skus_for_publication/);
  assert.match(hardening, /CMS_PIM_ACTIVE_SKU_REQUIRED/);
  assert.match(hardening, /CMS_PIM_PUBLIC_DATA_REQUIRED/);
  assert.match(hardening, /sku\.status = 'active'/);
  assert.match(hardening, /variant\.status = 'active'/);
  assert.match(hardening, /sku_variant\.status = 'active'/);
  assert.match(hardening, /jsonb_array_length\(v_payload_models\) <> v_active_model_count/);
  assert.match(hardening, /count\(distinct lower\(payload_model\.value ->> 'id'\)\)/);
  assert.match(hardening, /payload_model\.value ->> 'model' is distinct from model\.name/);
  assert.match(hardening, /payload_model\.value ->> 'manufacturerReference'/);
  assert.match(hardening, /payload_variant\.value ->> 'code'/);
  assert.match(hardening, /sku\.product_id = v_pim_product_id/);
  assert.match(routes, /path: "pim"/);
  assert.match(navigation, /cms:pim\.read/);
});

test("G4 executable database checks enforce the canonical 0078 cutover", async () => {
  const [databaseTest, consolidationTest] = await Promise.all([
    read("supabase/tests/rls_ev2_phase4_pim.test.sql"),
    read("supabase/tests/rls_cms_product_pim_consolidation.test.sql"),
  ]);
  assert.match(databaseTest, /select plan\(20\)/);
  for (const action of ["save_product", "generate_sku", "archive_product"])
    assert.match(databaseTest, new RegExp(`${action}[\\s\\S]*CMS_PIM_LEGACY_READ_ONLY`));
  assert.match(databaseTest, /service role cannot insert legacy products directly/);
  assert.match(databaseTest, /canonical identifiers are claimed atomically at publication/);
  assert.match(consolidationTest, /select plan\(55\)/);
  assert.match(consolidationTest, /a second product cannot publish the same normalized SKU/);
  assert.match(consolidationTest, /required metadata cannot be forged false/);
  assert.match(consolidationTest, /terminal QA transition cleans shared-container product options/);
});

test("EV2.4 canary is SHA-pinned, synthetic, isolated and fail-closed", async () => {
  const [script, workflow] = await Promise.all([
    read("scripts/ev2/phase4/staging-canary.ps1"),
    read(".github/workflows/preview-ev2-phase4.yml"),
  ]);
  for (const evidence of [
    'ExpectedName = "GAIATEC CMS Staging"',
    'ExpectedRegion = "us-east-2"',
    'phase = "ev2-g4"',
    'flag_key = "ev2.pim_v2"',
    'scope_type = "user"',
    "AddMinutes(30)",
    'New-Envelope -Environment "production"',
    "synthetic_cleanup_verified",
    "Canary funcional aprovado, mas limpeza sintética falhou",
  ]) {
    assert.match(script, new RegExp(evidence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(workflow, /expected_sha/);
  assert.match(workflow, /VITE_EV2_PIM_CANDIDATE/);
  assert.match(workflow, /pages deploy dist --project-name gaiatec-cms-staging --branch ev2-g4-canary/);
  assert.doesNotMatch(workflow, /deploy-production|gaiatec-website/);
});
