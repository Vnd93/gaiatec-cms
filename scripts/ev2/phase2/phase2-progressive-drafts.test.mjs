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
  assert.match(status, /aria-live="polite"/);
});

test("product adapter remains doubly gated and picker base is reusable", async () => {
  const [editor, picker] = await Promise.all([
    read("src/admin/pages/AdminProductEditorPage.tsx"),
    read("src/admin/components/EntityPicker.tsx"),
  ]);
  assert.match(editor, /VITE_EV2_DRAFT_V2_CANDIDATE/);
  assert.match(editor, /useProgressiveDraftAutosave/);
  assert.match(editor, /ProgressiveDraftStatus/);
  assert.match(picker, /role="combobox"/);
  assert.match(picker, /aria-controls/);
});

test("G2 stays blocked until real human baseline and complete evidence exist", async () => {
  const gate = await read("docs/ev2/fase-2/GATE_G2.md");
  assert.match(gate, /CANDIDATO — NÃO APROVADO PARA EV2\.3/);
  assert.match(gate, /não será aprovado sem a sessão humana/i);
  assert.match(gate, /não autoriza.+produção/i);
});
