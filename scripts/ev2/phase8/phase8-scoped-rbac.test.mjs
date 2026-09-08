import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

test("EV2.8 migration is additive, private and disabled by default", async () => {
  const sql = await read("supabase/migrations/0047_ev2_scoped_rbac.sql");
  for (const table of ["cms_scoped_role_assignments", "cms_policy_decisions", "cms_scope_command_receipts"]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql, /ev2\.rbac_scoped/);
  assert.match(sql, /revoke all on table[\s\S]+from public, anon, authenticated/);
  assert.match(sql, /grant all on table[\s\S]+to service_role/);
  assert.doesNotMatch(sql, /drop table|truncate|default_enabled\s*=\s*true/i);
});

test("central authorization switches only for one individual non-production override", async () => {
  const sql = await read("supabase/migrations/0047_ev2_scoped_rbac.sql");
  assert.match(sql, /create or replace function private\.cms_actor_authorization_result/);
  assert.match(sql, /create or replace function public\.cms_actor_authorized/);
  assert.match(sql, /create or replace function private\.cms_has_permission/);
  assert.match(sql, /scope_type = 'user'/);
  assert.match(sql, /v_user_count > 1/);
  assert.match(sql, /broad_activation_not_supported/);
  assert.match(sql, /production_not_available/);
  assert.match(sql, /scope_context_ambiguous/);
  assert.match(sql, /user_override_off/);
});

test("grants enforce scope, delegation, segregation, concurrency and idempotency", async () => {
  const sql = await read("supabase/migrations/0047_ev2_scoped_rbac.sql");
  for (const evidence of [
    "grant_type in ('direct', 'delegated')",
    "expires_at <= granted_at + interval '30 days'",
    "CMS_SCOPE_SELF_ELEVATION_DENIED",
    "CMS_SCOPE_LAST_SUPER_ADMIN",
    "CMS_SCOPE_ALREADY_ACTIVE",
    "CMS_SCOPE_IDEMPOTENCY_CONFLICT",
    "CMS_SCOPE_COMMAND_IN_PROGRESS",
    "CMS_SCOPE_CONFLICT",
    "on conflict do nothing",
    "for update",
    "pg_advisory_xact_lock",
    "lock_version = lock_version + 1",
  ])
    assert.match(sql, new RegExp(evidence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(sql, /v_grant_type = 'delegated'/);
  assert.match(sql, /v_role_key = 'super_admin'/);
  assert.match(sql, /p_environment not in \('local', 'staging'\)/);
});

test("policy decisions persist allow and deny without exposing session identifiers", async () => {
  const sql = await read("supabase/migrations/0047_ev2_scoped_rbac.sql");
  assert.match(sql, /create trigger cms_policy_decisions_immutable/);
  assert.match(sql, /encode\(extensions\.digest\(p_session_id, 'sha256'\), 'hex'\)/);
  assert.match(sql, /case when v_allowed then 'allow' else 'deny' end/);
  assert.match(sql, /permission_unknown/);
  assert.match(sql, /mfa_required/);
  assert.match(sql, /target_type/);
  assert.match(sql, /target_id/);
  assert.match(sql, /correlation_id/);
  assert.doesNotMatch(sql, /session_id\s+text\s+not null/);
});

test("cms-scopes validates envelopes, authentication, MFA and transport status", async () => {
  const edge = await read("supabase/functions/cms-scopes/index.ts");
  assert.match(edge, /\.strict\(\)\s*\.superRefine/);
  assert.match(edge, /authenticateCms\(req\)/);
  assert.match(edge, /CMS_SCOPE_PRODUCTION_GATED/);
  assert.match(edge, /CMS_SCOPE_AAL2_REQUIRED/);
  assert.match(edge, /mfaRequired \? 412 : 403/);
  assert.match(edge, /X-Idempotency-Key/);
  assert.match(edge, /CMS_SCOPE_IDEMPOTENCY_REQUIRED/);
  assert.match(edge, /error\.code === "PT409"/);
  assert.match(edge, /consumeRateLimit/);
  assert.doesNotMatch(edge, /SUPABASE_SERVICE_ROLE_KEY\s*=/);
});

test("candidate UI and session consume scoped access without replacing v1", async () => {
  const [page, panel, auth, api, session, contract] = await Promise.all([
    read("src/admin/pages/AdminUsersPage.tsx"),
    read("src/admin/components/ScopedAccessPanel.tsx"),
    read("src/admin/auth/AdminAuthContext.tsx"),
    read("src/admin/api/cms-api.ts"),
    read("supabase/functions/cms-session/index.ts"),
    read("src/shared/contracts/ev2-rbac.ts"),
  ]);
  assert.match(page, /ScopedAccessPanel/);
  assert.doesNotMatch(page, /rbacScoped/);
  assert.match(panel, /isEv2FeatureEnabled\(profile, "ev2\.rbac_scoped"\)/);
  assert.match(panel, /Nova concessão/);
  assert.match(panel, /Temporária \/ delegada/);
  assert.match(panel, /Simular decisão da sessão/);
  assert.match(panel, /expectedVersion/);
  assert.match(auth, /rbacScoped\?: boolean/);
  assert.match(api, /cms-scopes/);
  assert.match(session, /cms_rbac_scope_capability/);
  assert.match(session, /cms_resolve_scoped_access/);
  assert.match(contract, /Ev2PolicyDecisionSchema/);
  assert.match(page, /usersCommand/);
});

test("rehearsal, canary and workflow remain fail-closed", async () => {
  const [rehearsal, canary, workflow] = await Promise.all([
    read("scripts/ev2/phase8/validate-migration.mjs"),
    read("scripts/ev2/phase8/staging-canary.mjs"),
    read(".github/workflows/preview-ev2-phase8.yml"),
  ]);
  assert.match(rehearsal, /G8_MIGRATION_REHEARSAL_PASS/);
  assert.match(canary, /individual_override_only/);
  assert.match(canary, /broad_override_fail_closed/);
  assert.match(canary, /delegation_expiry_enforced/);
  assert.match(canary, /policy_decisions_complete/);
  assert.match(canary, /productionMutations: 0/);
  assert.match(canary, /syntheticResidue: 0/);
  assert.match(workflow, /expected_sha/);
  assert.match(workflow, /VITE_EV2_RBAC_SCOPED_CANDIDATE/);
  assert.match(workflow, /ev2-g8-canary/);
});
