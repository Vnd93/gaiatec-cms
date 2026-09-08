import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = "supabase/migrations/0011_fase3_cms_user_commands.sql";
const functionPath = "supabase/functions/cms-users/index.ts";

test("CMS user commands stay server-side, audited and idempotent", async () => {
  const sql = (await readFile(migrationPath, "utf8")).toLowerCase();
  assert.match(sql, /create table public\.cms_command_receipts/);
  assert.match(sql, /primary key \(actor_id, action, idempotency_key\)/);
  assert.match(sql, /alter table public\.cms_command_receipts enable row level security/);
  assert.match(sql, /revoke all on table public\.cms_command_receipts from public, anon, authenticated/);
  assert.match(sql, /insert into public\.cms_audit_log/);
  assert.match(sql, /cms_actor_authorized/);
  assert.match(sql, /cms_reserve_user_command/);
  assert.match(sql, /cms_apply_user_command/);
});

test("CMS user commands protect MFA, last super admin and active sessions", async () => {
  const sql = (await readFile(migrationPath, "utf8")).toLowerCase();
  assert.match(sql, /p_aal = 'aal2'/);
  assert.match(sql, /cms_last_super_admin/);
  assert.match(sql, /cms_self_role_change_denied/);
  assert.match(sql, /cms_self_suspend_denied/);
  assert.match(sql, /sessions_valid_after/);
  assert.match(sql, /session_revoked/);
});

test("CMS Edge Function validates identity, origin, input and rate limits", async () => {
  const source = (await readFile(functionPath, "utf8")).toLowerCase();
  assert.match(source, /isallowedorigin/);
  assert.match(source, /auth\.getuser\(token\)/);
  assert.match(source, /verifiedclaims/);
  assert.match(source, /consume ratelimit|consumeratelimit/);
  assert.match(source, /cms_apply_user_command/);
  assert.match(source, /inviteuserbyemail/);
  assert.match(source, /findexistingauthuserbyemail/);
  assert.match(source, /listusers/);
  assert.match(source, /existing_identity/);
  assert.match(source, /cms_invitation_nonce/);
  assert.match(source, /deleteuser/);
  assert.match(source, /cms_admin_origin/);
  assert.doesNotMatch(source, /rdo_user_access/);
});
