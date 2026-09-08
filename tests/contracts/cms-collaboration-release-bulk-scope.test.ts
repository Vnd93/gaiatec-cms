import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/0073_cms_collaboration_release_bulk_authoritative_scope.sql",
  "utf8",
);
const pgTap = readFileSync("supabase/tests/rls_cms_collaboration_release_bulk_scope.test.sql", "utf8");

describe("authoritative collaboration, release and bulk scope", () => {
  it("derives identity from immutable leases and permits only an active same-run peer", () => {
    expect(migration).toContain("private.cms_qa_actor_leases caller");
    expect(migration).toContain("subject.run_tag = caller.run_tag");
    expect(migration).toContain("subject.candidate_sha = caller.candidate_sha");
    expect(migration).toContain("subject.environment = caller.environment");
    expect(migration).toContain("subject.status = 'active'");
    expect(migration).toContain("subject.expires_at > statement_timestamp()");
    expect(migration).toContain("private.cms_qa_actor_marker_is_exact(");
    expect(migration).toContain("else not exists (");
  });

  it("puts every deployed RPC behind lease-first graph guards", () => {
    for (const rpc of [
      "cms_get_release_workspace",
      "cms_execute_release_v2_command",
      "cms_get_work_inbox",
      "cms_execute_collaboration_command",
      "cms_get_bulk_jobs",
      "cms_execute_bulk_command",
      "cms_publish_due_releases",
      "cms_claim_collaboration_outbox",
      "cms_finish_collaboration_outbox",
    ]) {
      expect(migration).toContain(`create function public.${rpc}`);
    }
    expect(migration).toContain("private.cms_crb_lock_actor_scope(");
    expect(migration).toContain("perform private.cms_lock_active_qa_actor_leases(v_actor_ids)");
    expect(migration).toContain("perform set_config('cms.qa_mutation_actor_id', p_actor_id::text, true)");
    expect(migration).toMatch(
      /cms_crb_guard_release_command[\s\S]+cms_content_item_graph_scope_allowed[\s\S]+dependency\.release_id = v_release_id/,
    );
    expect(migration).toMatch(
      /cms_crb_guard_collaboration_command[\s\S]+parent\.task_id = v_task_id[\s\S]+cms_crb_actor_identity_scope_allowed/,
    );
    expect(migration).toMatch(
      /cms_crb_guard_bulk_command[\s\S]+cms_crb_bulk_job_scope_allowed[\s\S]+for update/,
    );
  });

  it("removes every unscoped service-role escape hatch", () => {
    for (const rpc of [
      "cms_execute_release_v2_command_unscoped_0073",
      "cms_get_release_workspace_unscoped_0073",
      "cms_execute_collaboration_command_unscoped_0073",
      "cms_get_work_inbox_unscoped_0073",
      "cms_execute_bulk_command_unscoped_0073",
      "cms_get_bulk_jobs_unscoped_0073",
      "cms_publish_due_releases_unscoped_0073",
      "cms_claim_collaboration_outbox_unscoped_0073",
      "cms_finish_collaboration_outbox_unscoped_0073",
    ]) {
      expect(migration).toMatch(
        new RegExp(`revoke all on function public\\.${rpc}\\([\\s\\S]+?service_role;`),
      );
    }
    expect(migration).toMatch(
      /revoke all on function public\.cms_release_plan_hash\(uuid\)[\s\S]+service_role/,
    );
  });

  it("replaces direct RLS for every 0037 and 0045 table without touching audit-log policy", () => {
    for (const table of [
      "cms_feature_flags",
      "cms_feature_flag_overrides",
      "cms_release_packages",
      "cms_release_command_receipts",
      "cms_release_events",
      "cms_release_items",
      "cms_release_validation_runs",
      "cms_release_validations",
      "cms_release_approvals",
      "cms_release_snapshots",
      "cms_work_tasks",
      "cms_work_comments",
      "cms_work_mentions",
      "cms_saved_inbox_views",
      "cms_work_task_events",
      "cms_collaboration_outbox",
      "cms_bulk_jobs",
      "cms_bulk_job_items",
      "cms_ev2_command_receipts",
    ]) {
      expect(migration).toContain(`'${table}'`);
    }
    expect(migration).toContain("cms_release_packages_scoped_read");
    expect(migration).toContain("cms_work_tasks_scoped_read");
    expect(migration).toContain("cms_bulk_jobs_scoped_read");
    expect(migration).toContain("cms_audit_log is deliberately untouched");
    expect(migration).not.toMatch(/(drop|create) policy[^;]+cms_audit_log/i);
  });

  it("fences workers and terminalizes actionable QA residue without deleting evidence", () => {
    expect(migration).toContain("CMS_RELEASE_WORKER_SCOPE_FORBIDDEN");
    expect(migration).toContain("package.lock_version = v_release.lock_version");
    expect(migration).toContain("skippedOutOfScope");
    expect(migration).toContain("cms_prepare_qa_actor_terminal_crb_cleanup");
    expect(migration).toContain("status = 'dead_letter'");
    expect(migration).toContain("status = 'resolved'");
    expect(migration).toContain("status = 'canceled'");
    expect(migration).toContain("eventsApprovalsSnapshotsRetained");
    expect(migration).not.toMatch(/delete from public\.cms_release_(events|approvals|snapshots)/);
    expect(migration).not.toMatch(/delete from public\.cms_work_(comments|task_events)/);
  });

  it("backs the boundary with adversarial pgTAP coverage", () => {
    for (const evidence of [
      "same-run reviewer can inspect the operator release graph",
      "QA release UUID IDOR cannot read a corporate release",
      "tampered add-item payload cannot adopt corporate content",
      "cross-run assignee is rejected",
      "expired QA lease is fail-closed",
      "corporate direct reads exclude every ever-QA graph",
      "terminal cleanup leaves no actionable QA release",
      "immutable approval evidence survives terminal cleanup",
    ]) {
      expect(pgTap).toContain(evidence);
    }
    expect(pgTap).toContain("set local role authenticated");
    expect(pgTap).toContain("select * from finish()");
    expect(pgTap).toContain("rollback;");
  });
});
