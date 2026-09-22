import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0105_cms_session_logout_fast_path.sql", "utf8");
const sessionEdge = readFileSync("supabase/functions/cms-session/index.ts", "utf8");
const authLifecycle = readFileSync("tests/e2e/cms-auth-lifecycle.spec.ts", "utf8");
const sessionSecuritySql = readFileSync(
  "supabase/tests/rls_cms_session_security_finalization.test.sql",
  "utf8",
);
const migrationManifest = readFileSync("scripts/ev2/phase12/migration-manifest-lib.mjs", "utf8");
const migrationCanary = readFileSync("scripts/ev2/phase12/staging-migrations-canary.mjs", "utf8");
const stagingDatabaseVerifier = readFileSync("scripts/ev2/phase12/verify-staging-database.mjs", "utf8");
const productionDatabaseVerifier = readFileSync("scripts/ev2/phase12/verify-production-database.mjs", "utf8");
const backendCompatibility = readFileSync(
  "scripts/ev2/phase12/verify-backend-forward-compatibility.mjs",
  "utf8",
);

describe("CMS session logout fast path", () => {
  it("keeps logout actor-fenced, atomic, append-only and independent from RBAC evaluation", () => {
    const helper = migration.slice(
      migration.indexOf("create or replace function private.cms_resolve_logout_core_0105"),
      migration.indexOf("revoke all on function private.cms_resolve_logout_core_0105"),
    );
    const actorLockAt = helper.indexOf("private.cms_system_lock_actor_scope");
    const profileLockAt = helper.indexOf("for update");
    const loginEventAt = helper.indexOf("insert into public.cms_login_events");
    const revocationAt = helper.indexOf("insert into public.cms_session_revocations");

    expect(actorLockAt).toBeGreaterThanOrEqual(0);
    expect(profileLockAt).toBeGreaterThan(actorLockAt);
    expect(loginEventAt).toBeGreaterThan(profileLockAt);
    expect(revocationAt).toBeGreaterThan(loginEventAt);
    expect(helper).toContain("on conflict (session_id_hash) do update");
    expect(helper).toContain("'accessGranted', false");
    expect(helper).toContain("'rbacScopeReasonCode', 'logout'");
    expect(helper).not.toContain("cms:scoped-super:");
    expect(helper).not.toContain("cms_rbac_scope_capability");
    expect(helper).not.toContain("cms_resolve_scoped_access");
    expect(helper).not.toContain("update public.cms_login_events");
  });

  it("routes only logout through the short path and preserves the full resolver for every other action", () => {
    const wrapper = migration.slice(
      migration.indexOf("create or replace function public.cms_resolve_session_scoped"),
      migration.indexOf("revoke all on function public.cms_resolve_session_scoped"),
    );
    const logoutBranchAt = wrapper.indexOf("if p_event_type = 'logout' then");
    const logoutCoreAt = wrapper.indexOf("private.cms_resolve_logout_core_0105", logoutBranchAt);
    const fullCoreAt = wrapper.indexOf("private.cms_resolve_session_core_0087", logoutCoreAt);

    expect(wrapper).toContain("private.cms_user_actor_context_active");
    expect(logoutBranchAt).toBeGreaterThanOrEqual(0);
    expect(logoutCoreAt).toBeGreaterThan(logoutBranchAt);
    expect(fullCoreAt).toBeGreaterThan(logoutCoreAt);
  });

  it("returns the committed logout receipt before any capability or manifest work", () => {
    const rpcAt = sessionEdge.indexOf('admin.rpc("cms_resolve_session_scoped"');
    const logoutReturnAt = sessionEdge.indexOf('if (action === "logout") return json(req, data);');
    const scopeResolutionAt = sessionEdge.indexOf("const atomicScopeReason", rpcAt);
    const manifestAt = sessionEdge.indexOf("let ev2Capabilities", scopeResolutionAt);

    expect(rpcAt).toBeGreaterThanOrEqual(0);
    expect(logoutReturnAt).toBeGreaterThan(rpcAt);
    expect(scopeResolutionAt).toBeGreaterThan(logoutReturnAt);
    expect(manifestAt).toBeGreaterThan(scopeResolutionAt);
  });

  it("keeps the helper owner-only and the public boundary service-role-only", () => {
    expect(migration).toContain(
      "revoke all on function private.cms_resolve_logout_core_0105(\n  uuid, text, text, text, timestamptz, uuid\n) from public, anon, authenticated, service_role",
    );
    expect(migration).not.toContain("grant execute on function private.cms_resolve_logout_core_0105");
    expect(migration).toContain(
      "grant execute on function public.cms_resolve_session_scoped(\n  uuid, text, text, text, text, timestamptz, uuid\n) to service_role",
    );
  });

  it("executes the non-reusable receipt, immutable event and atomic revocation in pgTAP", () => {
    expect(sessionSecuritySql).toContain("select plan(44);");
    expect(sessionSecuritySql).toContain("CMS logout returns a non-reusable receipt");
    expect(sessionSecuritySql).toContain("logout appends exactly one immutable login event");
    expect(sessionSecuritySql).toContain("logout atomically revokes the current CMS session id");
  });

  it("surfaces a privacy-safe named browser failure if logout ever regresses", () => {
    expect(authLifecycle).toContain("QA_CMS_AUTH_LOGOUT_HTTP_${cmsResponse.status()}");
    expect(authLifecycle).not.toContain("QA_CMS_AUTH_LOGOUT_HTTP_${await cmsResponse.text()}");
  });

  it("seals 0105 into rollback compatibility and every remote database verifier", () => {
    expect(migrationManifest).toContain('version: "0105"');
    expect(migrationManifest).toContain('file: "0105_cms_session_logout_fast_path.sql"');
    expect(backendCompatibility).toContain('"0105": [');
    expect(backendCompatibility).toContain('"supabase/tests/rls_cms_session_security_finalization.test.sql"');
    expect(backendCompatibility).toContain('"tests/contracts/cms-session-logout-fast-path.test.ts"');
    for (const verifier of [migrationCanary, stagingDatabaseVerifier, productionDatabaseVerifier]) {
      expect(verifier).toContain("session_logout_fast_path_0105_helper_locked");
      expect(verifier).toContain("session_logout_fast_path_0105_semantics_exact");
      expect(verifier).toContain("sessionLogoutFastPathSemanticSql");
    }
  });
});
