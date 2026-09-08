import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0087_cms_runtime_integrity_repairs.sql", "utf8");
const sessionEdge = readFileSync("supabase/functions/cms-session/index.ts", "utf8");

describe("CMS runtime integrity repairs", () => {
  it("keeps login evidence append-only and derives MFA from critical permissions", () => {
    const sessionRepair = migration.slice(
      migration.indexOf("create or replace function private.cms_resolve_session_core_0087"),
      migration.indexOf("-- The authoritative visual wrappers"),
    );

    expect(sessionRepair).toContain("insert into public.cms_login_events");
    expect(sessionRepair).not.toContain("update public.cms_login_events");
    expect(sessionRepair).toContain("permission.critical");
    expect(sessionRepair).toContain("p_event_type is null");
    expect(sessionRepair).toContain("p_aal is null");
    expect(sessionRepair).toContain("cardinality(role_keys) > 0");
    expect(sessionRepair).toContain("public.cms_rbac_scope_capability(");
    expect(sessionRepair).toContain("public.cms_resolve_scoped_access(");
    expect(sessionRepair).toContain("'rbacScoped'");
    expect(sessionRepair).toContain("'rbacScopeReasonCode'");
    expect(sessionRepair).toMatch(
      /private\.cms_resolve_session_core_0087\([\s\S]+p_user_id, p_event_type, p_environment, p_aal/,
    );
    const leaseLockAt = sessionRepair.indexOf(
      "private.cms_system_lock_actor_scope(p_user_id, p_environment)",
    );
    const advisoryLockAt = sessionRepair.indexOf("'cms:scoped-super:' || 'main' || ':' || p_environment");
    const profileLockAt = sessionRepair.indexOf("select profile.status into profile_status");
    expect(leaseLockAt).toBeGreaterThanOrEqual(0);
    expect(advisoryLockAt).toBeGreaterThan(leaseLockAt);
    expect(profileLockAt).toBeGreaterThan(advisoryLockAt);
  });

  it("reuses the atomic session decision instead of re-resolving RBAC", () => {
    const atomicBranchAt = sessionEdge.indexOf("if (hasAtomicScopeResolution) {");
    const compatibilityBranchAt = sessionEdge.indexOf("  } else {", atomicBranchAt);
    const manifestAt = sessionEdge.indexOf("let ev2Capabilities", compatibilityBranchAt);
    expect(atomicBranchAt).toBeGreaterThanOrEqual(0);
    expect(compatibilityBranchAt).toBeGreaterThan(atomicBranchAt);
    expect(manifestAt).toBeGreaterThan(compatibilityBranchAt);
    expect(sessionEdge.slice(atomicBranchAt, compatibilityBranchAt)).not.toContain("admin.rpc(");
    expect(sessionEdge.slice(compatibilityBranchAt, manifestAt)).toContain('"cms_rbac_scope_capability"');
    expect(sessionEdge.slice(compatibilityBranchAt, manifestAt)).toContain('"cms_resolve_scoped_access"');
  });

  it("fences scoped access and resolves its effective grant from one snapshot", () => {
    const scopedAccessRepair = migration.slice(
      migration.indexOf("create or replace function public.cms_resolve_scoped_access("),
      migration.indexOf("-- The authoritative visual wrappers"),
    );
    const leaseLockAt = scopedAccessRepair.indexOf(
      "private.cms_system_lock_actor_scope(p_actor_id, p_environment)",
    );
    const advisoryLockAt = scopedAccessRepair.indexOf(
      "'cms:scoped-super:' || p_site_key || ':' || p_environment",
    );
    const snapshotAt = scopedAccessRepair.indexOf("with effective_assignment as materialized");
    expect(leaseLockAt).toBeGreaterThanOrEqual(0);
    expect(advisoryLockAt).toBeGreaterThan(leaseLockAt);
    expect(snapshotAt).toBeGreaterThan(advisoryLockAt);
    expect(scopedAccessRepair).toContain("bool_or(permission.critical)");
  });

  it("validates visual and site input plus AAL2 before availability resolution", () => {
    const commandRepair = migration.slice(
      migration.indexOf("-- The authoritative visual wrappers"),
      migration.indexOf("-- Collaboration/release/bulk cleanup"),
    );
    for (const [invalid, mfa, availability] of [
      ["CMS_VISUAL_COMMAND_INVALID", "CMS_VISUAL_MFA_REQUIRED", "private.cms_visual_assert_available"],
      ["CMS_SITES_COMMAND_INVALID", "CMS_SITES_MFA_REQUIRED", "private.cms_sites_assert_available"],
    ]) {
      const invalidAt = commandRepair.indexOf(invalid);
      const mfaAt = commandRepair.indexOf(mfa, invalidAt);
      const availabilityAt = commandRepair.indexOf(availability, mfaAt);
      expect(invalidAt).toBeGreaterThanOrEqual(0);
      expect(mfaAt).toBeGreaterThan(invalidAt);
      expect(availabilityAt).toBeGreaterThan(mfaAt);
    }
    expect(commandRepair.match(/or p_action is null/g)).toHaveLength(2);
    expect(commandRepair.match(/or p_environment is null/g)).toHaveLength(2);
    expect(commandRepair.match(/or p_site_key is distinct from 'main'/g)).toHaveLength(2);
    expect(commandRepair.match(/if p_aal is distinct from 'aal2' then/g)).toHaveLength(2);
  });

  it("restores CRB mutation context on success and error and keeps its trigger owner-only", () => {
    const crbRepair = migration.slice(
      migration.indexOf("-- Collaboration/release/bulk cleanup"),
      migration.indexOf("revoke all on function public.cms_resolve_session_unscoped_0070"),
    );
    const restore =
      /set_config\(\s*'cms\.qa_mutation_actor_id',\s*coalesce\(v_previous_actor, ''\),\s*true\s*\)/g;

    expect(crbRepair).toContain("v_previous_actor text := current_setting('cms.qa_mutation_actor_id', true)");
    expect(crbRepair.match(restore)?.length).toBeGreaterThanOrEqual(2);
    expect(crbRepair).toContain("exception when others then");
    expect(crbRepair).toContain("CMS_QA_CRB_CONTEXT_POSTCONDITION_FAILED");
    expect(crbRepair).toContain("proc_row.prosecdef");
    expect(crbRepair).toContain("proc_row.prosrc");
    expect(crbRepair).toContain("lang_row.lanname");
    expect(crbRepair).toContain("proc_row.proconfig");
    expect(crbRepair).toContain("42cf04573ac27b48140b96b7dd4706b1ceee61838dc44983ebe7089e6d0afc4d");
    expect(crbRepair).toContain("fbe2c71fb695023b953a871c5f132e2dcf6b65a78265eb27441bda8cf1ef038f");
    expect(migration).toContain(
      "revoke all on function private.cms_crb_terminalize_qa_graph()\n  from public, anon, authenticated, service_role",
    );
  });

  it("exposes only the scoped repaired RPCs to service_role", () => {
    const coreRevoke = migration.lastIndexOf("revoke all on function private.cms_resolve_session_core_0087(");
    expect(coreRevoke).toBeGreaterThanOrEqual(0);
    expect(
      migration.indexOf("grant execute on function private.cms_resolve_session_core_0087(", coreRevoke),
    ).toBe(-1);

    for (const signature of [
      "public.cms_resolve_session_scoped(",
      "public.cms_resolve_scoped_access(",
      "public.cms_execute_visual_command(",
      "public.cms_execute_site_command(",
    ]) {
      const revokeAt = migration.lastIndexOf(`revoke all on function ${signature}`);
      const grantAt = migration.indexOf(`grant execute on function ${signature}`, revokeAt);
      expect(revokeAt).toBeGreaterThanOrEqual(0);
      expect(grantAt).toBeGreaterThan(revokeAt);
    }
  });
});
