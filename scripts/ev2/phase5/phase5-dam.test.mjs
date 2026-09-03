import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

test("EV2.5 migration is additive, private and fail-closed", async () => {
  const sql = await read("supabase/migrations/0043_ev2_dam.sql");
  for (const table of [
    "cms_dam_collections",
    "cms_dam_tags",
    "cms_dam_collection_assets",
    "cms_dam_asset_tags",
    "cms_dam_crops",
    "cms_dam_replacements",
    "cms_dam_gc_jobs",
    "cms_dam_command_receipts",
    "cms_dam_events",
  ]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql, /cms_evaluate_feature_flag[\s\S]+ev2\.dam/);
  assert.match(sql, /cms:media\.edit/);
  assert.match(sql, /CMS_DAM_PRODUCTION_GATED/);
  assert.match(sql, /from public, anon, authenticated/);
  assert.doesNotMatch(sql, /drop table|drop column|truncate/i);
  assert.doesNotMatch(sql, /insert into public\.cms_published_projection/i);
});

test("rights, usages, replacement and retained GC preserve public integrity", async () => {
  const sql = await read("supabase/migrations/0043_ev2_dam.sql");
  for (const evidence of [
    "rights_expires_at",
    "reservation_hash",
    "cms_dam_asset_publishable",
    "cms_validate_dam_publication",
    "CMS_MEDIA_IN_USE",
    "impact_snapshot",
    "cms_resolve_dam_asset",
    "rollback_replacement",
    "CMS_DAM_REPLACEMENT_CHAIN_FORBIDDEN",
    "now() + interval '30 days'",
    "cms_prepare_dam_gc",
    "CMS_DAM_RETENTION_ACTIVE",
  ])
    assert.match(sql, new RegExp(evidence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(sql, /delete from public\.cms_media_assets where id = v_asset\.id/);
  assert.match(sql, /status = 'processing', attempts = attempts \+ 1/);
});

test("cms-media v2 is authenticated, rate-limited, idempotent and keeps v1 actions", async () => {
  const edge = await read("supabase/functions/cms-media/index.ts");
  for (const evidence of [
    "authenticateCms",
    "consumeRateLimit",
    "cms_evaluate_feature_flag",
    'p_flag_key: "ev2.dam"',
    "CMS_DAM_PRODUCTION_GATED",
    "CMS_ENVIRONMENT",
    '"cms:media.edit"',
    "X-Idempotency-Key",
    "cms_execute_dam_command",
    "cms_finalize_dam_asset",
    "cms_prepare_dam_gc",
    "match_asset",
    "preview_replacement",
    "finalize_upload",
  ])
    assert.match(edge, new RegExp(evidence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(edge, /V1Input/);
  assert.match(edge, /z\.literal\("create"\)/);
  assert.match(edge, /raster-signature-v2/);
  assert.match(edge, /80_000_000/);
  assert.match(edge, /replacementCount/);
  assert.match(edge, /"pending", "failed", "processing", "blocked"/);
  assert.doesNotMatch(edge, /SUPABASE_SERVICE_ROLE_KEY\s*=/);
});

test("public and preview media resolution honor reversible replacement and live rights", async () => {
  const [resolver, publicApi, preview] = await Promise.all([
    read("supabase/functions/_shared/cms-media-resolution.ts"),
    read("supabase/functions/cms-public/index.ts"),
    read("supabase/functions/cms-preview/index.ts"),
  ]);
  assert.match(resolver, /cms_dam_replacements/);
  assert.match(resolver, /rights_expires_at/);
  assert.match(resolver, /Date\.parse\(asset\.rights_expires_at\)/);
  assert.match(resolver, /processing_status === "ready"/);
  assert.match(resolver, /scan_status === "clean"/);
  assert.match(publicApi, /resolveMediaAssets/);
  assert.match(preview, /resolveMediaAssets/);
});

test("DAM UI is candidate-gated and picker works inside the editor", async () => {
  const [page, legacyPage, picker, editor, contract] = await Promise.all([
    read("src/admin/pages/AdminDamPage.tsx"),
    read("src/admin/pages/AdminMediaPage.tsx"),
    read("src/admin/components/DamPicker.tsx"),
    read("src/admin/pages/AdminEditorPage.tsx"),
    read("src/shared/contracts/ev2-dam.ts"),
  ]);
  assert.match(legacyPage, /VITE_EV2_DAM_CANDIDATE/);
  assert.match(page, /action: "capability"/);
  assert.match(page, /action: "match_asset"/);
  assert.match(page, /action: "preview_replacement"/);
  assert.match(page, /action: "save_crop"/);
  assert.match(page, /action: "archive_asset"/);
  assert.match(picker, /Enviar nova imagem sem sair/);
  assert.match(editor, /<DamPicker/);
  assert.match(contract, /ExpectedVersionEnvelopeSchema/);
  assert.match(contract, /rollback_replacement/);
});

test("EV2.5 rollout artifacts remain isolated from production", async () => {
  const [workflow, canary, gate] = await Promise.all([
    read(".github/workflows/preview-ev2-phase5.yml"),
    read("scripts/ev2/phase5/staging-canary.mjs"),
    read("docs/ev2/fase-5/GATE_G5.md"),
  ]);
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /expected_sha/);
  assert.match(workflow, /VITE_EV2_DAM_CANDIDATE/);
  assert.match(workflow, /--branch ev2-g5-canary/);
  assert.doesNotMatch(workflow, /deploy-production|gaiatec-website/);
  assert.match(canary, /glcqsosxwgmlhzgcsnzv/);
  assert.match(canary, /GAIATEC CMS Staging/);
  assert.match(canary, /ev2-g5-canary/);
  assert.match(canary, /mfa\.verify/);
  assert.match(canary, /jobId: targetJobs\.json\[0\]\.id/);
  assert.match(canary, /syntheticResidue: 0/);
  assert.doesNotMatch(canary, /gaiatec-website|cms_environment.*production/i);
  assert.match(gate, /G5 APROVADO/);
  assert.match(gate, /Produção:[\s*]+bloqueada/i);
});
