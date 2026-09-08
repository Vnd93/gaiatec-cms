import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0076_cms_system_rbac_authoritative_scope.sql", "utf8");
const systemEdge = readFileSync("supabase/functions/cms-system/index.ts", "utf8");
const scopesEdge = readFileSync("supabase/functions/cms-scopes/index.ts", "utf8");
const pgTap = readFileSync("supabase/tests/rls_cms_system_rbac_scope.test.sql", "utf8");
const usersPage = readFileSync("src/admin/pages/AdminUsersPage.tsx", "utf8");
const scopedAccessPanel = readFileSync("src/admin/components/ScopedAccessPanel.tsx", "utf8");
const browserCycle = readFileSync("tests/e2e/cms-admin-ops-cycles.spec.ts", "utf8");
const inventory = readFileSync("scripts/qa/cms-coverage-inventory.mjs", "utf8");

describe("authoritative system assurance and scoped RBAC boundary", () => {
  it("binds every actor reference to an exact active authoritative QA run", () => {
    expect(migration).toContain("private.cms_system_actor_reference_allowed");
    expect(migration).toContain("private.cms_user_actor_target_scope_allowed");
    expect(migration).toContain("private.cms_user_actor_context_active");
    expect(migration).toContain("owner.run_tag = caller.run_tag");
    expect(migration).toContain("owner.candidate_sha = caller.candidate_sha");
    expect(migration).toContain("owner.environment = caller.environment");
    expect(migration).toContain("private.cms_qa_actor_marker_is_exact(");
  });

  it("makes every historical global RBAC and system entry point unreachable", () => {
    for (const name of [
      "cms_rbac_scope_capability_unscoped_0076",
      "cms_resolve_scoped_access_unscoped_0076",
      "cms_evaluate_scoped_permission_unscoped_0076",
      "cms_get_scoped_assignments_unscoped_0076",
      "cms_get_policy_decisions_unscoped_0076",
      "cms_execute_scope_command_unscoped_0076",
      "cms_system_capability_unscoped_0076",
      "cms_get_system_snapshot_unscoped_0076",
      "cms_execute_system_command_unscoped_0076",
    ]) {
      expect(migration).toContain(name);
      expect(migration).toMatch(new RegExp(`revoke all on function public\\.${name}[\\s\\S]+service_role`));
    }
  });

  it("validates policy targets before writing an immutable decision", () => {
    expect(migration).toMatch(
      /cms_evaluate_scoped_permission[\s\S]+cms_system_policy_target_scope_allowed[\s\S]+cms_evaluate_scoped_permission_unscoped_0076/,
    );
    expect(migration).toContain("CMS_POLICY_TARGET_FORBIDDEN");
    expect(migration).toContain("when 'profile'");
    expect(migration).toContain("when 'content_item'");
    expect(migration).toContain("when 'work_task'");
    expect(migration).toContain("when 'lead'");
  });

  it("serializes leases before receipts and resource rows", () => {
    expect(migration).toMatch(
      /cms_execute_scope_command[\s\S]+cms_system_lock_actor_scope[\s\S]+cms:scoped-super:[\s\S]+cms_scope_command_receipts[\s\S]+for update[\s\S]+cms_scoped_role_assignments[\s\S]+for update/,
    );
    expect(migration).toMatch(
      /cms_system_lock_actor_scope[\s\S]+cms_lock_active_qa_actor_leases\(v_actor_ids\)/,
    );
    expect(migration).toMatch(
      /cms_execute_system_command[\s\S]+cms_assurance_runs run[\s\S]+cms_lock_active_qa_actor_leases[\s\S]+cms_assurance_runs run[\s\S]+for update/,
    );
    expect(migration).toContain("CMS_SCOPE_IDEMPOTENCY_CONFLICT");
    expect(migration).toContain("CMS_SYSTEM_IDEMPOTENCY_CONFLICT");
  });

  it("counts the last super administrator only inside the actor domain", () => {
    expect(migration).toMatch(
      /v_other_supers[\s\S]+private\.cms_system_assignment_scope_allowed[\s\S]+CMS_SCOPE_LAST_SUPER_ADMIN/,
    );
    expect(pgTap).toContain("last-super guard is filtered through the authoritative assignment scope");
  });

  it("binds QA assurance reports and peer review to the exact candidate", () => {
    expect(migration).toContain("run.candidate_sha = caller.candidate_sha");
    expect(migration).toContain("lease.candidate_sha = p_payload ->> 'candidateSha'");
    expect(migration).toContain("run.created_at between owner.created_at and owner.expires_at");
    expect(migration).toContain("CMS_SYSTEM_CANDIDATE_FORBIDDEN");
    expect(migration).toContain("CMS_SYSTEM_RUN_NOT_FOUND");
  });

  it("calculates all snapshot aggregates over scoped domain rows", () => {
    expect(migration).toMatch(/cms_publication_outbox[\s\S]+cms_content_item_graph_scope_allowed/);
    expect(migration).toMatch(/cms_lead_outbox[\s\S]+cms_lead_scope_allowed/);
    expect(migration).toMatch(/cms_collaboration_outbox[\s\S]+cms_crb_task_scope_allowed/);
    expect(migration).toMatch(/cms_operational_events[\s\S]+cms_system_operational_event_scope_allowed/);
    expect(migration).toContain("audit.actor_id is null or not private.cms_system_actor_ever_qa");
  });

  it("keeps policy governance visible to corporate auditors without leaking session hashes", () => {
    expect(migration).toMatch(
      /cms_system_policy_decision_scope_allowed[\s\S]+when private\.cms_system_actor_ever_qa[\s\S]+else true/,
    );
    expect(migration).not.toMatch(/'sessionIdHash'|'session_id_hash'/);
    expect(migration).toContain("'[redacted]'");
  });

  it("applies defense-in-depth RLS and bounded terminal cleanup", () => {
    for (const policy of [
      "cms_scoped_role_assignments_authoritative_read",
      "cms_policy_decisions_authoritative_read",
      "cms_scope_receipts_authoritative_read",
      "cms_assurance_runs_authoritative_read",
      "cms_assurance_events_authoritative_read",
      "cms_system_receipts_authoritative_read",
      "cms_operational_events_authoritative_read",
    ]) {
      expect(migration).toContain(`create policy ${policy}`);
    }
    expect(migration).toContain("private.cms_system_rbac_terminal_cleanup");
    expect(migration).toContain("zzzz_cms_system_rbac_terminal_cleanup");
    expect(migration).toContain("status='aborted'");
    expect(migration).not.toMatch(/delete from public\.cms_(audit_log|policy_decisions|assurance_events)/);
  });

  it("fails closed when the Edge deployment environment is absent", () => {
    expect(systemEdge).toContain("isConfiguredCmsEnvironment(deploymentEnvironment)");
    expect(systemEdge).not.toContain('CMS_ENVIRONMENT") ?? "production"');
    expect(systemEdge).toContain('rpc("cms_get_system_snapshot_limited"');
    expect(systemEdge).toContain('rpc("cms_execute_system_command_limited"');
    expect(scopesEdge).toContain("isConfiguredCmsEnvironment(configuredEnvironment)");
    expect(scopesEdge).toContain('rpc("cms_get_scoped_assignments"');
    expect(scopesEdge).toContain('rpc("cms_get_policy_decisions"');
  });

  it("mantém papéis globais somente leitura e edita acesso apenas pelo fluxo escopado real", () => {
    expect(usersPage).toContain('item.roles.map(roleLabel).join(", ") || "Nenhum"');
    expect(usersPage).toContain("Gerencie permissões detalhadas em Acesso por escopo.");
    expect(usersPage).toContain("<ScopedAccessPanel users={items} />");
    expect(usersPage).not.toContain('action: "set_roles"');
    expect(usersPage).not.toContain("Salvar papéis");
    expect(usersPage).not.toContain("roleDrafts");
    expect(inventory).toContain(
      "o ramo de mutação global foi removido e concessão, avaliação e revogação são inventariadas exclusivamente em ScopedAccessPanel",
    );
    expect(scopedAccessPanel).toContain('aria-label="Nova concessão no escopo"');
    expect(scopedAccessPanel).toContain('aria-label="Simular decisão da sessão"');
    for (const marker of [
      "scoped_rbac_grant_evaluate_revoke_regrant",
      'waitForEdgeAction(page, "cms-scopes", "grant")',
      'waitForEdgeAction(page, "cms-scopes", "evaluate")',
      'waitForEdgeAction(page, "cms-scopes", "revoke")',
      'controlName: "Revogar esta concessão escopada?"',
      "recordPersistedAdminFields",
    ]) {
      expect(browserCycle).toContain(marker);
    }
    expect(browserCycle).toContain("Exercise every rendered role above, but bind the semantic scenario once");
    expect(browserCycle.match(/fieldName: "Superadministrador"/g)).toHaveLength(1);
    expect(browserCycle).not.toContain("...initialRoleControls.map((role)");
  });
});
