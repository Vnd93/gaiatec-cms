import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CMS_BUSINESS_CONFLICT_TRANSPORT_0114,
  businessConflictTransportSemanticSql,
} from "./business-conflict-transport.mjs";

const migration = readFileSync("supabase/migrations/0114_cms_business_conflict_transport.sql", "utf8");
const database = readFileSync("supabase/tests/rls_cms_business_conflict_transport.test.sql", "utf8");

test("0114 binds exactly the same reviewed inventory in migration, pgTAP and remote gates", () => {
  const expected = CMS_BUSINESS_CONFLICT_TRANSPORT_0114;
  assert.equal(expected.length, 47);
  assert.equal(new Set(expected.map(([signature]) => signature)).size, 47);
  assert.equal(
    expected.reduce((sum, [, count]) => sum + count, 0),
    68,
  );
  const rows = (source) =>
    [...source.matchAll(/\('((?:public|private)\.cms_[a-z0-9_]+\([^']*\))', (\d+)\)/g)].map(
      ([, signature, count]) => [signature, Number(count)],
    );
  assert.deepEqual(rows(migration), expected);
  assert.deepEqual(rows(database), expected);
  assert.deepEqual(rows(businessConflictTransportSemanticSql("reviewed_conflicts")), expected);
});

test("migration changes only checked error literals and preserves all pg_proc attributes", () => {
  assert.ok(migration.startsWith("begin;"));
  assert.ok(migration.trimEnd().endsWith("commit;"));
  for (const required of [
    "CMS_CONFLICT_TRANSPORT_FUNCTION_MISSING",
    "CMS_CONFLICT_TRANSPORT_SOURCE_DRIFT",
    "CMS_CONFLICT_TRANSPORT_POSTCONDITION_DRIFT",
    "CMS_CONFLICT_TRANSPORT_INCOMPLETE",
    "v_raise_count <> v_target.occurrences",
    "position(v_new in v_before) > 0",
    "v_after := replace(v_before, v_old, v_new)",
    "v_security_after is distinct from v_security_before",
    "pg_get_functiondef(v_function::oid) is distinct from v_after",
  ])
    assert.ok(migration.includes(required), required);
  assert.equal((migration.match(/to_jsonb\(procedure_row\) - 'prosrc'/g) ?? []).length, 2);
  assert.doesNotMatch(migration, /\b(?:grant|revoke|drop|disable|truncate)\b/i);
  assert.doesNotMatch(migration, /when\s+(?:others|serialization_failure)|exception\s+when/i);
});

test("remote proof fails closed on missing functions, wrong counts and any new custom 40001", () => {
  const sql = businessConflictTransportSemanticSql("business_conflict_transport_0114_semantics_exact");
  for (const required of [
    "procedure_row.oid is null",
    "<> expected.occurrences",
    "'''PT409'''",
    "position('''40001''' in procedure_row.prosrc) > 0",
    "namespace.nspname in ('public', 'private')",
  ])
    assert.ok(sql.includes(required), required);
  for (const alias of ["", "x; select 1", "Bad", "a b"])
    assert.throws(() => businessConflictTransportSemanticSql(alias), /ALIAS_INVALID/);
  const canary = readFileSync("scripts/ev2/phase12/staging-migrations-canary.mjs", "utf8");
  assert.ok(canary.includes('"0114"'));
  assert.ok(
    canary.includes(
      'businessConflictTransportSemanticSql("business_conflict_transport_0114_semantics_exact")',
    ),
  );
  assert.ok(canary.includes("row?.business_conflict_transport_0114_semantics_exact === true"));
  const preflight = readFileSync("scripts/ev2/phase12/verify-staging-database.mjs", "utf8");
  assert.ok(
    preflight.includes(
      'businessConflictTransportSemanticSql("business_conflict_transport_0114_semantics_exact")',
    ),
  );
  assert.match(preflight, /const checks = \[[\s\S]*"business_conflict_transport_0114_semantics_exact"/);
});

test("real canary does not mistake a confirmation timeout for an observed canonical fence", () => {
  const canary = readFileSync("scripts/ev2/phase12/staging-migrations-canary.mjs", "utf8");
  const closer = canary.slice(
    canary.indexOf("async function closeDocumentFixture()"),
    canary.indexOf("async function closeMediaFixture()"),
  );
  assert.ok(closer.includes('canonicalCleanupReason === "canonical_write_fence"'));
  assert.ok(closer.includes('blobDisposition === "removed"'));
  assert.ok(closer.includes("documentNeutralizationMs = neutralized.elapsedMs"));
  assert.doesNotMatch(closer, /confirmation_deadline|allowed: \[200, 503\]/);
});
