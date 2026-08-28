import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = "supabase/migrations/0010_fase3_cms_identity_rbac_audit.sql";

test("CMS identity foundation is fail-closed and independent from RDO", async () => {
  const sql = (await readFile(migrationPath, "utf8")).toLowerCase();
  const tables = [
    "cms_profiles",
    "cms_roles",
    "cms_permissions",
    "cms_user_roles",
    "cms_role_permissions",
    "cms_session_revocations",
    "cms_login_events",
    "cms_audit_log",
  ];

  for (const table of tables) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }

  assert.match(sql, /revoke all on table[\s\S]*from anon, authenticated/);
  const authenticatedGrants = sql
    .split(";")
    .filter((statement) => statement.includes("grant") && statement.includes("to authenticated"));
  for (const statement of authenticatedGrants) {
    assert.doesNotMatch(statement, /grant (insert|update|delete|all) on table/);
  }
  assert.doesNotMatch(sql, /\brdo_/);
  assert.doesNotMatch(sql, /disable row level security/);
});

test("CMS roles, MFA, sessions and immutable audit are explicit", async () => {
  const sql = (await readFile(migrationPath, "utf8")).toLowerCase();
  for (const role of ["super_admin", "admin", "marketing", "commercial", "technical", "editor", "reviewer"]) {
    assert.match(sql, new RegExp(`'${role}'`));
  }

  assert.match(sql, /cms_current_session_is_valid/);
  assert.match(sql, /cms_user_mfa_required/);
  assert.match(sql, /coalesce\(auth\.jwt\(\) ->> 'aal', 'aal1'\) = 'aal2'/);
  assert.match(sql, /cms_login_events_immutable/);
  assert.match(sql, /cms_audit_log_immutable/);
});

test("CMS registration stays closed and tests cover negative authorization", async () => {
  const config = await readFile("supabase/config.toml", "utf8");
  const rlsTest = (await readFile("supabase/tests/rls_fase3_cms.test.sql", "utf8")).toLowerCase();

  assert.match(config, /enable_signup = false/);
  assert.match(rlsTest, /rdo admin receives no cms scope/);
  assert.match(rlsTest, /revoked cms session is rejected/);
  assert.match(rlsTest, /authenticated user cannot forge audit events/);
  assert.match(rlsTest, /audit rows cannot be changed/);
  assert.match(rlsTest, /critical super admin permission requires mfa/);
  assert.match(rlsTest, /rollback;/);
});
