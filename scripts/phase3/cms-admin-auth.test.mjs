import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = "supabase/migrations/0012_fase3_cms_admin_auth.sql";
const functionPath = "supabase/functions/cms-session/index.ts";
const contextPath = "src/admin/auth/AdminAuthContext.tsx";
const routesPath = "src/app/routes.tsx";

test("CMS session resolution stays server-side and fail-closed", async () => {
  const sql = (await readFile(migrationPath, "utf8")).toLowerCase();
  assert.match(sql, /create function public\.cms_resolve_session/);
  assert.match(sql, /security definer/);
  assert.match(sql, /cms_session_revoked/);
  assert.match(sql, /sessions_valid_after/);
  assert.match(sql, /revoke all on function public\.cms_resolve_session[\s\S]*authenticated/);
  assert.match(sql, /grant execute[\s\S]*to service_role/);
  assert.doesNotMatch(sql, /insert into auth\.users/);
});

test("CMS invitation activation and login auditing are atomic", async () => {
  const sql = (await readFile(migrationPath, "utf8")).toLowerCase();
  assert.match(sql, /profile_status = 'invited'/);
  assert.match(sql, /set status = 'active'/);
  assert.match(sql, /insert into public\.cms_login_events/);
  assert.match(sql, /cms_login_events_session_event_uidx/);
  assert.match(sql, /insert into public\.cms_audit_log/);
  assert.match(sql, /mfa_required/);
  assert.match(sql, /p_aal = 'aal2'/);
});

test("CMS session function verifies JWT, origin and rate limit", async () => {
  const source = (await readFile(functionPath, "utf8")).toLowerCase();
  assert.match(source, /isallowedorigin/);
  assert.match(source, /auth\.getuser\(token\)/);
  assert.match(source, /verifiedclaims/);
  assert.match(source, /consumeratelimit/);
  assert.match(source, /cms_resolve_session/);
  assert.doesNotMatch(source, /password|access_token|refresh_token/);
});

test("Admin frontend provides closed login, recovery and MFA routes", async () => {
  const [context, routes] = await Promise.all([readFile(contextPath, "utf8"), readFile(routesPath, "utf8")]);
  assert.match(context, /signInWithPassword/);
  assert.match(context, /resetPasswordForEmail/);
  assert.match(context, /mfa\.enroll/);
  assert.match(context, /mfa\.challenge/);
  assert.match(context, /mfa\.verify/);
  assert.match(context, /getAuthenticatorAssuranceLevel/);
  assert.match(routes, /path: "\/admin"/);
  assert.match(routes, /RequireAdminAuth/);
  assert.match(routes, /recuperar-senha/);
  assert.match(routes, /definir-senha/);
});
