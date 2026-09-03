import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

test("EV2.6 migration is additive, private and fail-closed", async () => {
  const sql = await read("supabase/migrations/0044_ev2_search_quality.sql");
  for (const table of [
    "cms_search_rules",
    "cms_search_documents",
    "cms_search_index_jobs",
    "cms_quality_rulesets",
    "cms_quality_runs",
    "cms_quality_findings",
    "cms_quality_waivers",
    "cms_quality_command_receipts",
  ]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql, /revoke all on public\.cms_search_rules[\s\S]+from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.cms_search_v2[\s\S]+to service_role/);
  assert.match(sql, /cms_record_quality_run[\s\S]+grant execute[\s\S]+to service_role/);
  assert.match(sql, /cms_projection_invalidate_search/);
  assert.doesNotMatch(sql, /insert into public\.cms_published_projection|truncate|drop table/i);
});

test("search index is shadowed, governed and only accepts homologated technical values", async () => {
  const [edge, migration] = await Promise.all([
    read("supabase/functions/cms-search-admin/index.ts"),
    read("supabase/migrations/0044_ev2_search_quality.sql"),
  ]);
  for (const evidence of [
    "sanitizePublicPayload",
    "cms_search_documents",
    'eq("homologated", true)',
    "cms_search_index_jobs",
    "upsert_rule",
    "reindex",
    "cms:search.reindex",
    "CMS_SEARCH_PRODUCTION_GATED",
  ])
    assert.match(edge, new RegExp(evidence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(edge, /readPermission/);
  assert.match(edge, /upsert_synonym/);
  assert.match(edge, /\[featureResult, access\] = await Promise\.all/);
  assert.match(edge, /\.range\(offset, offset \+ pageSize - 1\)/);
  assert.match(migration, /jsonb_array_elements_text[\s\S]+selected\.value/);
  assert.doesNotMatch(edge, /SUPABASE_SERVICE_ROLE_KEY\s*=/);
});

test("public v2 search avoids full-projection scan and v1 remains available", async () => {
  const [edge, seo] = await Promise.all([
    read("supabase/functions/cms-public/index.ts"),
    read("supabase/functions/_shared/cms-seo-defaults.ts"),
  ]);
  assert.match(edge, /type === "search-v2"/);
  assert.match(edge, /client\.rpc\("cms_search_v2"/);
  assert.match(edge, /cms_search_rules/);
  assert.match(edge, /EdgeRuntime\.waitUntil\(analytics\)/);
  assert.match(edge, /type === "search"/);
  assert.match(edge, /sanitizePublicPayload/);
  assert.match(edge, /deterministicSeoDefaults/);
  assert.match(seo, /canonicalPath/);
  assert.match(seo, /ogTitle/);
});

test("manual and scheduled publications refresh the sanitized index", async () => {
  const [content, worker, indexer] = await Promise.all([
    read("supabase/functions/cms-content/index.ts"),
    read("supabase/functions/cms-outbox-worker/index.ts"),
    read("supabase/functions/_shared/cms-search-index.ts"),
  ]);
  assert.match(content, /syncPublicSearchDocument/);
  assert.match(worker, /syncPublicSearchDocument/);
  assert.match(worker, /searchIndexFailed/);
  assert.match(indexer, /sanitizePublicPayload/);
  assert.match(indexer, /eq\("homologated", true\)/);
});

test("quality is deterministic, idempotent and blocks candidate publication", async () => {
  const [quality, rules, content] = await Promise.all([
    read("supabase/functions/cms-quality/index.ts"),
    read("supabase/functions/_shared/cms-quality-rules.ts"),
    read("supabase/functions/cms-content/index.ts"),
  ]);
  for (const evidence of [
    "cms_quality_command_receipts",
    "X-Idempotency-Key",
    "cms_evaluate_feature_flag",
    "CMS_QUALITY_PRODUCTION_GATED",
    "cms:quality.waive",
  ])
    assert.match(quality, new RegExp(evidence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const category of ["seo", "accessibility", "links", "media", "content", "pim"])
    assert.match(rules, new RegExp(`"${category}"`));
  assert.match(content, /CMS_QUALITY_BLOCKED/);
  assert.match(content, /cms_record_quality_run/);
  assert.match(content, /capability\?\.enabled === true/);
});

test("candidate UI exposes facets, governance, quality, bundle and isolated canary controls", async () => {
  const [publicSearch, adminSearch, qualityPage, routes, navigation, config, budget, canary, rehearsal] =
    await Promise.all([
      read("src/public/pages/CmsSearchPage.tsx"),
      read("src/admin/pages/AdminSearchGovernancePage.tsx"),
      read("src/admin/pages/AdminQualityPage.tsx"),
      read("src/app/routes.tsx"),
      read("src/admin/admin-navigation.ts"),
      read("vite.config.ts"),
      read("scripts/ev2/phase6/bundle-budget.mjs"),
      read("scripts/ev2/phase6/staging-canary.mjs"),
      read("scripts/ev2/phase6/validate-migration.mjs"),
    ]);
  assert.match(publicSearch, /Filtros técnicos disponíveis/);
  assert.match(adminSearch, /Relevância governada/);
  assert.match(qualityPage, /Centro de Qualidade/);
  assert.match(routes, /path: "qualidade"/);
  assert.match(navigation, /cms:quality\.read/);
  assert.match(config, /manifest: true/);
  assert.match(budget, /Excel\/PDF must remain outside every initial entry graph/);
  assert.match(canary, /synthetic_mfa_aal2/);
  assert.match(canary, /productionMutations: 0/);
  assert.match(canary, /syntheticResidue: 0/);
  assert.match(rehearsal, /G6_MIGRATION_REHEARSAL_PASS/);
});
