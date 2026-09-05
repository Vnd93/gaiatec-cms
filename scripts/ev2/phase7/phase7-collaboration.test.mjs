import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

test("EV2.7 migration is additive, private and fail-closed", async () => {
  const sql = await read("supabase/migrations/0045_ev2_collaboration_release_bulk.sql");
  for (const table of [
    "cms_release_items",
    "cms_release_validation_runs",
    "cms_release_validations",
    "cms_release_approvals",
    "cms_release_snapshots",
    "cms_work_tasks",
    "cms_work_comments",
    "cms_work_mentions",
    "cms_saved_inbox_views",
    "cms_work_task_events",
    "cms_collaboration_outbox",
    "cms_bulk_jobs",
    "cms_bulk_job_items",
    "cms_ev2_command_receipts",
  ]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql, /ev2\.collaboration_bulk/);
  assert.match(sql, /revoke all on table[\s\S]+from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.cms_execute_release_v2_command[\s\S]+to service_role/);
  assert.doesNotMatch(sql, /drop table|truncate|default_enabled\s*=\s*true/i);
});

test("composed release freezes revisions and publishes or compensates atomically", async () => {
  const [sql, edge] = await Promise.all([
    read("supabase/migrations/0045_ev2_collaboration_release_bulk.sql"),
    read("supabase/functions/cms-releases/index.ts"),
  ]);
  for (const evidence of [
    "cms_release_plan_hash",
    "frozen_hash",
    "cms_release_snapshots",
    "for update of ci",
    "dependency.order",
    "CMS_RELEASE_SEGREGATION_CONFLICT",
    "CMS_RELEASE_ITEM_GATE_CHANGED",
    "jsonb_populate_record",
    "partialWrites",
    "cms_publish_due_releases",
  ])
    assert.match(sql, new RegExp(evidence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(sql, /v_release\.created_by = p_actor_id/);
  assert.match(sql, /status = 'published'[\s\S]+cms_publication_outbox/);
  assert.match(sql, /status = 'rolled_back'[\s\S]+rpo', 0/);
  assert.match(edge, /ComposedReleaseCommand/);
  assert.match(edge, /schemaVersion: z\.literal\(2\)/);
  assert.match(edge, /CMS_RELEASE_V2_FAILURE/);
  assert.match(edge, /production_not_available_in_ev2_7/);
});

test("inbox keeps stable anchors, optimistic locks, mentions and delivery failures visible", async () => {
  const [sql, edge] = await Promise.all([
    read("supabase/migrations/0045_ev2_collaboration_release_bulk.sql"),
    read("supabase/functions/cms-collaboration/index.ts"),
  ]);
  assert.match(sql, /anchor jsonb not null/);
  assert.match(sql, /lock_version bigint not null default 1/);
  assert.match(sql, /cms_work_mentions/);
  assert.match(sql, /cms_collaboration_outbox/);
  assert.match(sql, /delivery_failure/);
  assert.match(sql, /CMS_WORK_TASK_CONFLICT/);
  assert.match(sql, /'comments'.+'history'/s);
  assert.match(sql, /cms_collaboration_outbox_mention_once_idx/);
  assert.match(edge, /Anchor/);
  assert.match(edge, /mentions: z\.array\(Uuid\)\.max\(50\)/);
  assert.match(edge, /CMS_COLLABORATION_PRODUCTION_GATED/);
});

test("bulk jobs enforce dry-run, item errors, idempotency and all-or-nothing execution", async () => {
  const [sql, edge] = await Promise.all([
    read("supabase/migrations/0045_ev2_collaboration_release_bulk.sql"),
    read("supabase/functions/cms-bulk/index.ts"),
  ]);
  assert.match(sql, /target_count between 1 and 500/);
  assert.match(sql, /atomic boolean not null default true check \(atomic is true\)/);
  assert.match(sql, /'writes', 0/);
  assert.match(sql, /CMS_BULK_CONFLICT/);
  assert.match(sql, /expectedReleaseVersion/);
  assert.match(sql, /expectedUpdatedAt/);
  assert.match(sql, /cms_ev2_command_receipts/);
  assert.match(edge, /z\.array\(Target\)\.min\(1\)\.max\(500\)/);
  assert.match(edge, /action: z\.enum\(\["capability", "list", "dry_run", "execute", "cancel"\]\)/);
  assert.doesNotMatch(edge, /cms_published_projection/);
});

test("business conflicts use a non-retryable HTTP transport code", async () => {
  const [migration, releases, collaboration, bulk] = await Promise.all([
    read("supabase/migrations/0046_ev2_conflict_transport_hardening.sql"),
    read("supabase/functions/cms-releases/index.ts"),
    read("supabase/functions/cms-collaboration/index.ts"),
    read("supabase/functions/cms-bulk/index.ts"),
  ]);
  for (const procedure of [
    "cms_execute_release_v2_command",
    "cms_execute_collaboration_command",
    "cms_execute_bulk_command",
  ])
    assert.match(migration, new RegExp(procedure));
  assert.match(migration, /pg_get_functiondef/);
  assert.match(migration, /'''PT409'''/);
  assert.doesNotMatch(migration, /drop function|default_enabled\s*=\s*true/i);
  for (const edge of [releases, collaboration, bulk]) assert.match(edge, /error\.code === "PT409"/);
});

test("candidate UI, worker and canary expose the governed workflow without changing v1", async () => {
  const [page, routes, navigation, api, worker, canary, rehearsal] = await Promise.all([
    read("src/admin/pages/AdminWorkPage.tsx"),
    read("src/app/routes.tsx"),
    read("src/admin/admin-navigation.ts"),
    read("src/admin/api/cms-api.ts"),
    read("supabase/functions/cms-outbox-worker/index.ts"),
    read("scripts/ev2/phase7/staging-canary.mjs"),
    read("scripts/ev2/phase7/validate-migration.mjs"),
  ]);
  assert.match(page, /isEv2FeatureEnabled\(profile, "ev2\.collaboration_bulk"\)/);
  assert.match(page, /Validar sem alterar/);
  assert.match(page, /Publicar conjunto/);
  assert.match(page, /Reverter release/);
  assert.match(routes, /path: "meu-trabalho"/);
  assert.match(navigation, /cms:collaboration\.read/);
  assert.match(api, /cms-collaboration/);
  assert.match(api, /cms-bulk/);
  assert.match(worker, /cms_publish_due_releases/);
  assert.match(worker, /cms_claim_collaboration_outbox/);
  assert.match(canary, /two_synthetic_mfa_actors/);
  assert.match(canary, /second_item_failure_zero_partial_change/);
  assert.match(canary, /bulk_change_after_dry_run_blocks_all_targets/);
  assert.match(canary, /in_app_notification_delivered/);
  assert.match(canary, /external_notification_failure_visible/);
  assert.match(canary, /outbox_worker_secret_required/);
  assert.match(canary, /rollback_rpo0_under_5_minutes/);
  assert.match(canary, /productionMutations: 0/);
  assert.match(canary, /syntheticResidue: 0/);
  assert.match(rehearsal, /G7_MIGRATION_REHEARSAL_PASS/);
});
