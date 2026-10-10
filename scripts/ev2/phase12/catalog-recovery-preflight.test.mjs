import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  catalogRecoveryPreflightSql,
  CATALOG_RECOVERY_OWNER_ONLY_FUNCTIONS,
} from "./catalog-recovery-preflight.mjs";

test("recovery preflight requires private ACL, committed preparation, PID and all enabled fences", () => {
  const sql = catalogRecoveryPreflightSql("catalog_qa_recovery_0118_exact");
  assert.equal(CATALOG_RECOVERY_OWNER_ONLY_FUNCTIONS.length, 7);
  for (const signature of CATALOG_RECOVERY_OWNER_ONLY_FUNCTIONS) assert.ok(sql.includes(signature));
  for (const boundary of [
    "relrowsecurity",
    "has_table_privilege",
    "compensation_pid",
    "prepared_xid",
    "t.tgtype=23",
    "count(*)=6",
    "t.tgenabled='O'",
    "zzy_catalog_durable_terminal_recovery",
  ]) {
    assert.ok(sql.includes(boundary), boundary);
  }
  assert.match(sql, /false\) as catalog_qa_recovery_0118_exact$/);
  assert.throws(() => catalogRecoveryPreflightSql("unsafe;alias"), /ALIAS_REFUSED/);
});

test("staging verifier and migration canary enforce recovery preflight", () => {
  for (const file of ["verify-staging-database.mjs", "staging-migrations-canary.mjs"]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(source, /catalogRecoveryPreflightSql\("catalog_qa_recovery_0118_exact"\)/);
    assert.ok(source.includes('"catalog_qa_recovery_0118_exact"'));
  }
});
