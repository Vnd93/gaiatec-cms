import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

test("EV2.1 migration is additive, fail-closed and RLS protected", async () => {
  const sql = await read("supabase/migrations/0037_ev2_foundation_flags_release.sql");
  for (const table of [
    "cms_feature_flags",
    "cms_feature_flag_overrides",
    "cms_release_packages",
    "cms_release_command_receipts",
    "cms_release_events",
  ]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql, /default_enabled boolean not null default false check \(default_enabled is false\)/);
  assert.match(sql, /if v_flag\.kill_switch then/);
  assert.match(sql, /to service_role/);
  assert.doesNotMatch(sql, /drop table|drop column|truncate/i);
  assert.doesNotMatch(sql, /insert into public\.cms_content/i);
});

test("release skeleton enforces idempotency, concurrency, audit and empty plans", async () => {
  const sql = await read("supabase/migrations/0037_ev2_foundation_flags_release.sql");
  for (const evidence of [
    "CMS_RELEASE_IDEMPOTENCY_CONFLICT",
    "CMS_RELEASE_CONFLICT",
    "CMS_RELEASE_FEATURE_DISABLED",
    "cms_actor_authorized",
    "cms_release_events_immutable",
    "cms:releases.rollback",
    "p_expected_version",
    "p_request_hash",
  ]) {
    assert.match(sql, new RegExp(evidence.replace(/[.:]/g, "\\$&"), "i"));
  }
  assert.match(sql, /convert_to\('\[\]', 'UTF8'\)/);
  assert.match(sql, /p_environment not in \('local', 'staging'\)/);
});

test("cms-releases Edge boundary validates the v1 envelope and production gate", async () => {
  const edge = await read("supabase/functions/cms-releases/index.ts");
  for (const evidence of [
    "schemaVersion",
    "commandId",
    "correlationId",
    "expectedVersion",
    "X-Idempotency-Key",
    "cms_execute_release_command",
    "cms_get_release_package",
    "consumeRateLimit",
    "CMS_ENVIRONMENT",
    "server_scope_mismatch",
    "production_not_available_in_ev2_1",
  ]) {
    assert.match(edge, new RegExp(evidence));
  }
  assert.match(edge, /authenticateCms\(req\)/);
  assert.match(edge, /canonicalize/);
  assert.doesNotMatch(edge, /SUPABASE_SERVICE_ROLE_KEY\s*=/);
});

test("shared contracts stay strict and actor identity remains server-derived", async () => {
  const contract = await read("src/shared/contracts/ev2-foundation.ts");
  assert.match(contract, /Ev2CommandEnvelopeSchema/);
  assert.match(contract, /Ev2ReleaseCommandResultSchema/);
  assert.match(contract, /\.strict\(\)/);
  assert.doesNotMatch(contract, /actorId/);
  assert.match(contract, /"create", "status", "cancel", "rollback"/);
});
