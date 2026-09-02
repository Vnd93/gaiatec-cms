import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

test("EV2.3 storage is additive, private and normalized", async () => {
  const sql = await read("supabase/migrations/0040_ev2_master_data.sql");
  for (const table of [
    "cms_master_entities",
    "cms_master_entity_aliases",
    "cms_master_relation_rules",
    "cms_master_compatibilities",
    "cms_master_data_command_receipts",
    "cms_master_data_events",
  ]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql, /cms_normalize_master_name/);
  assert.match(sql, /cms_master_entities_domain_active_uidx/);
  assert.match(sql, /CMS_MASTER_DATA_FEATURE_DISABLED/);
  assert.match(sql, /to service_role/);
  assert.doesNotMatch(sql, /drop table|drop column|truncate/i);
  assert.doesNotMatch(sql, /insert into public\.cms_published_projection/i);
});

test("merges preserve stable identities and are explicitly reversible", async () => {
  const sql = await read("supabase/migrations/0040_ev2_master_data.sql");
  assert.match(sql, /merged_into_id uuid references public\.cms_master_entities/);
  assert.match(sql, /p_action = 'restore_merge'/);
  assert.match(sql, /entity_merge_restored/);
  assert.match(sql, /CMS_MASTER_DATA_RESTORE_INVALID/);
  assert.match(sql, /CMS_MASTER_DATA_DELETE_FORBIDDEN/);
  assert.doesNotMatch(sql, /delete from public\.cms_master_/i);
});

test("Edge boundary fails closed and derives identity from the authenticated session", async () => {
  const edge = await read("supabase/functions/cms-master-data/index.ts");
  for (const evidence of [
    "authenticateCms",
    "readJsonLimited",
    "consumeRateLimit",
    "X-Idempotency-Key",
    "cms_evaluate_feature_flag",
    "cms_execute_master_data_command",
    "CMS_MASTER_DATA_PRODUCTION_GATED",
    "CMS_ENVIRONMENT",
    "canonicalize",
  ]) {
    assert.match(edge, new RegExp(evidence));
  }
  assert.doesNotMatch(edge, /SUPABASE_SERVICE_ROLE_KEY\s*=/);
  assert.match(edge, /mergedIntoId/);
  assert.match(edge, /merged_into_id/);
});

test("contracts require concurrency and dependent options preserve incompatibilities", async () => {
  const [contract, model] = await Promise.all([
    read("src/shared/contracts/ev2-master-data.ts"),
    read("src/admin/master-data-model.ts"),
  ]);
  assert.match(contract, /Ev2MasterDataCommandSchema/);
  assert.match(contract, /expectedVersion is required/);
  assert.match(contract, /restore_merge/);
  assert.match(contract, /category_monitored_element/);
  assert.match(model, /preservedIncompatibilities/);
  assert.match(model, /não é compatível/);
  assert.match(model, /não pode ser escolhido novamente/);
});

test("admin UI is doubly gated and consumes server relation rules", async () => {
  const [page, routes, navigation] = await Promise.all([
    read("src/admin/pages/AdminMasterDataPage.tsx"),
    read("src/app/routes.tsx"),
    read("src/admin/admin-navigation.ts"),
  ]);
  assert.match(page, /VITE_EV2_MASTER_DATA_CANDIDATE/);
  assert.match(page, /action: "capability"/);
  assert.match(page, /action: "list_rules"/);
  assert.match(page, /action: "get_dependencies"/);
  assert.match(page, /restore_merge/);
  assert.match(routes, /path: "dados-mestres"/);
  assert.match(navigation, /cms:masterdata\.read/);
  assert.doesNotMatch(page, /category_technology.*targetType/s);
});

test("Gate G3 records the approved canary without widening rollout", async () => {
  const [gate, databaseTest, canary, workflow] = await Promise.all([
    read("docs/ev2/fase-3/GATE_G3.md"),
    read("supabase/tests/rls_ev2_phase3_master_data.test.sql"),
    read("scripts/ev2/phase3/staging-canary.ps1"),
    read(".github/workflows/preview-ev2-phase3.yml"),
  ]);
  assert.match(databaseTest, /select plan\(37\)/);
  assert.match(databaseTest, /inactive values cannot receive new active compatibility links/);
  assert.match(databaseTest, /a merge can be restored without reconstructing references/);
  assert.match(gate, /G3 APROVADO/);
  assert.match(gate, /21\/21/);
  assert.match(gate, /zero referências órfãs/i);
  assert.match(gate, /nenhuma.*alteração em produção ocorreu/i);
  assert.match(gate, /185\/185 testes pgTAP/);
  assert.match(gate, /33666515308/);
  assert.match(canary, /glcqsosxwgmlhzgcsnzv/);
  assert.match(canary, /@example\.invalid/);
  assert.match(canary, /inactive_target_hidden_but_history_preserved/);
  assert.match(canary, /anonymous_master_read_denied/);
  assert.match(canary, /delete from public\.cms_master_entities where created_by/);
  assert.match(canary, /synthetic_cleanup_verified/);
  assert.match(canary, /Canary funcional aprovado, mas limpeza sintética falhou/);
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /VITE_EV2_MASTER_DATA_CANDIDATE: \$\{\{ inputs\.ev2_master_data_candidate \}\}/);
  assert.match(workflow, /--branch ev2-g3-canary/);
  assert.match(workflow, /inputs\.ev2_master_data_candidate \}\}" = "true"/);
  assert.doesNotMatch(workflow, /on:\s+push:/);
});
