import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

test("EV2.2 shadow storage is private, additive and outside public projection", async () => {
  const sql = await read("supabase/migrations/0038_ev2_progressive_drafts.sql");
  for (const table of ["cms_content_drafts_v2", "cms_draft_v2_command_receipts", "cms_draft_v2_events"]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql, /CMS_DRAFT_V2_FEATURE_DISABLED/);
  assert.match(sql, /CMS_DRAFT_V2_CONFLICT/);
  assert.match(sql, /octet_length\(v_fields::text\) > 1048576/);
  assert.match(sql, /to service_role/);
  assert.doesNotMatch(sql, /insert into public\.cms_published_projection/i);
  assert.doesNotMatch(sql, /alter table public\.cms_content_drafts\s/i);
  assert.doesNotMatch(sql, /drop table|drop column|truncate/i);
});

test("domain conflicts do not use the retriable serialization SQLSTATE", async () => {
  const hotfix = await read("supabase/migrations/0039_ev2_draft_conflict_sqlstate.sql");
  const databaseTest = await read("supabase/tests/rls_ev2_phase2_progressive_drafts.test.sql");
  assert.match(hotfix, /expected 3 SQLSTATE occurrences/);
  assert.match(hotfix, /ERRCODE = ''P0001''/);
  assert.match(databaseTest, /'P0001',[\s\S]+CMS_DRAFT_V2_CONFLICT/);
});

test("draft boundary enforces server scope, flag, idempotency and safe conflict details", async () => {
  const edge = await read("supabase/functions/cms-drafts-v2/index.ts");
  for (const evidence of [
    "authenticateCms",
    "readJsonLimited",
    "consumeRateLimit",
    "X-Idempotency-Key",
    "cms_evaluate_feature_flag",
    "cms_execute_draft_v2_command",
    "cms_get_draft_v2",
    "currentVersion",
    "diffRef",
    "preserved",
    "production_not_available_in_ev2_2",
  ]) {
    assert.match(edge, new RegExp(evidence));
  }
  assert.match(edge, /CMS_ENVIRONMENT/);
  assert.match(edge, /canonicalize/);
});

test("draft, review and publication contracts are distinct", async () => {
  const contract = await read("src/shared/contracts/ev2-draft.ts");
  assert.match(contract, /Ev2DraftSchema/);
  assert.match(contract, /Ev2ReviewDraftSchema/);
  assert.match(contract, /Ev2PublishSchema = CmsContentPayloadSchema/);
  assert.match(contract, /expectedVersion is required/);
  assert.match(contract, /unsafe field key/);
});

test("autosave preserves local work and exposes recoverable states", async () => {
  const [hook, backup, status] = await Promise.all([
    read("src/admin/hooks/useProgressiveDraftAutosave.ts"),
    read("src/admin/hooks/useDraftBackup.ts"),
    read("src/admin/components/ProgressiveDraftStatus.tsx"),
  ]);
  assert.match(hook, /debounceMs = 2_000/);
  assert.match(hook, /progressiveDraftRetryDelay/);
  assert.match(hook, /caught\.status === 409/);
  assert.match(hook, /navigator\.onLine/);
  assert.match(backup, /window\.localStorage/);
  assert.match(backup, /environment/);
  assert.match(status, /Nenhuma alteração foi\s+sobrescrita/);
  assert.match(status, /não está ativa ou expirou/);
  assert.match(status, /editor legado está ativo/);
  assert.match(status, /aria-live="polite"/);
});

test("product adapter remains doubly gated and picker base is reusable", async () => {
  const [editor, picker] = await Promise.all([
    read("src/admin/pages/AdminProductEditorPage.tsx"),
    read("src/admin/components/EntityPicker.tsx"),
  ]);
  assert.match(editor, /isEv2FeatureEnabled\(profile, "ev2\.draft_v2"\)/);
  assert.match(editor, /useProgressiveDraftAutosave/);
  assert.match(editor, /ProgressiveDraftStatus/);
  assert.match(picker, /role="combobox"/);
  assert.match(picker, /aria-controls/);
});

test("G2 approval is evidence-backed and keeps production blocked", async () => {
  const gate = await read("docs/ev2/fase-2/GATE_G2.md");
  assert.match(gate, /G2 APROVADO PARA INICIAR EV2\.3 — PRODUÇÃO CONTINUA BLOQUEADA/);
  assert.match(gate, /2\/2 recuperaram o rascunho/);
  assert.match(gate, /15\/15 cenários/);
  assert.match(gate, /33662108812/);
  assert.match(gate, /não autoriza produção/i);
});

test("staging canary is explicit and rollback always disables the candidate adapter", async () => {
  const deploy = await read(".github/workflows/deploy-staging.yml");
  const preview = await read(".github/workflows/preview.yml");
  const rollback = await read(".github/workflows/rollback-staging.yml");
  assert.match(deploy, /ev2_draft_v2_candidate:/);
  assert.match(deploy, /VITE_CMS_ENVIRONMENT: staging/);
  assert.match(deploy, /VITE_EV2_DRAFT_V2_CANDIDATE: \$\{\{ inputs\.ev2_draft_v2_candidate \}\}/);
  assert.match(preview, /VITE_CMS_ENVIRONMENT: staging/);
  assert.match(preview, /workflow_dispatch:[\s\S]+expected_sha:[\s\S]+ev2_draft_v2_candidate:/);
  assert.match(preview, /github\.ref_name == 'ev2\/desenvolvimento-fases-1-a-12'/);
  assert.match(
    preview,
    /environment: \$\{\{ github\.event_name == 'workflow_dispatch' && 'staging' \|\| 'preview' \}\}/,
  );
  assert.match(preview, /git rev-parse HEAD.+inputs\.expected_sha/);
  assert.match(preview, /--branch \$\{\{ github\.event_name == 'workflow_dispatch' && 'ev2-g2-canary'/);
  assert.match(rollback, /VITE_CMS_ENVIRONMENT: staging/);
  assert.match(rollback, /VITE_EV2_DRAFT_V2_CANDIDATE: ["']false["']/);
});

test("remote canary is staging-pinned, synthetic, conflict-aware and self-cleaning", async () => {
  const canary = await read("scripts/ev2/phase2/staging-canary.ps1");
  assert.match(canary, /glcqsosxwgmlhzgcsnzv/);
  assert.match(canary, /GAIATEC CMS Staging/);
  assert.match(canary, /@example\.invalid/);
  assert.match(canary, /empty_draft_created/);
  assert.match(canary, /create_idempotent_replay/);
  assert.match(canary, /stale_conflict_preserves_work/);
  assert.match(canary, /anonymous_shadow_read_denied/);
  assert.match(canary, /production_rejected/);
  assert.match(canary, /scoped_kill_switch_effective/);
  assert.match(canary, /delete from public\.cms_content_drafts_v2 where created_by/);
});
