import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0069_cms_content_authoritative_scope.sql", "utf8");
const contentEdge = readFileSync("supabase/functions/cms-content/index.ts", "utf8");
const draftsEdge = readFileSync("supabase/functions/cms-drafts-v2/index.ts", "utf8");
const qualityEdge = readFileSync("supabase/functions/cms-quality/index.ts", "utf8");
const searchEdge = readFileSync("supabase/functions/cms-search-admin/index.ts", "utf8");
const pgTap = readFileSync("supabase/tests/rls_cms_content_scope.test.sql", "utf8");

describe("authoritative content, quality and search actor scope", () => {
  it("derives QA scope only from exact server-side leases", () => {
    expect(migration).toContain("private.cms_content_actor_row_scope_allowed");
    expect(migration).toContain("caller.status = 'active'");
    expect(migration).toContain("row_actor.status = 'active'");
    expect(migration).toContain("caller.expires_at > statement_timestamp()");
    expect(migration).toContain("row_actor.run_tag = caller.run_tag");
    expect(migration).toContain("row_actor.candidate_sha = caller.candidate_sha");
    expect(migration).toContain("private.cms_qa_actor_marker_is_exact(");
    expect(migration).toMatch(/else not exists \(\s*select 1 from private\.cms_qa_actor_leases row_history/s);
    for (const edge of [contentEdge, qualityEdge, searchEdge]) {
      expect(edge).toContain('rpc("cms_actor_scope_context"');
      expect(edge).not.toMatch(/user_metadata|raw_user_meta_data/);
    }
  });

  it("fails closed over the entire content graph and embedded references", () => {
    for (const marker of [
      "cms_content_drafts",
      "cms_content_revisions",
      "cms_content_approvals",
      "cms_content_taxonomy",
      "cms_publications",
      "cms_quality_runs",
      "cms_quality_waivers",
      "cms_media_usages",
      "cms_document_actor_scope_allowed",
      "cms_content_payload_controlled_scope_allowed",
      "cms_content_payload_link_scope_allowed",
      "cms_content_payload_form_scope_allowed",
    ]) {
      expect(migration).toContain(marker);
    }
    expect(migration).toContain("CMS_CONTENT_SCOPE_FORBIDDEN");
    expect(migration).toContain("CMS_CONTENT_SCOPE_RACE");
    expect(migration).toContain("private.cms_lock_active_qa_actor_leases(");
    expect(migration).toMatch(
      /cms_lock_content_item_for_actor[\s\S]+for update[\s\S]+cms_content_item_graph_scope_allowed/,
    );
  });

  it("keeps the singleton exception bound to the 0064 CAS journal", () => {
    expect(migration).toMatch(
      /content_type in \('navigation', 'site_settings'\)[\s\S]+cms_qa_global_mutation_journal/,
    );
    expect(migration).toContain("journal.status in ('active', 'external_conflict')");
    expect(migration).toContain("journal.actor_id <> p_actor_id");
    expect(pgTap).toContain("a QA singleton change is captured under its exact server-side lease");
    expect(pgTap).toContain("QA cannot read a corporate page by UUID");
    expect(pgTap).toContain("another QA run cannot observe an in-flight singleton mutation");
  });

  it("wraps every deployed editorial and preview mutation behind scope locks", () => {
    for (const original of [
      "cms_execute_editorial_command_unscoped_0069",
      "cms_reopen_site_builder_unscoped_0069",
      "cms_hard_delete_draft_unscoped_0069",
      "cms_retire_managed_page_unscoped_0069",
      "cms_sync_blog_taxonomy_unscoped_0069",
      "cms_execute_draft_v2_command_unscoped_0069",
      "cms_record_quality_run_unscoped_0069",
      "cms_publish_due_schedule_unscoped_0069",
    ]) {
      expect(migration).toContain(original);
      expect(migration).toMatch(
        new RegExp(`revoke all on function public\\.${original}[\\s\\S]+service_role`),
      );
    }
    expect(migration).toContain("create or replace function public.cms_issue_preview(");
    expect(migration).toMatch(/cms_issue_preview[\s\S]+cms_lock_content_item_for_actor[\s\S]+for share/);
    expect(migration).toContain("p_expires_at > v_lease.expires_at");
    expect(migration).toMatch(/cms_sync_blog_taxonomy[\s\S]+pg_advisory_xact_lock[\s\S]+cms-blog-taxonomy:/);
    expect(pgTap).toContain("blog taxonomy creation uses a canonical advisory fence");
  });

  it("routes content reads, controlled normalization and taxonomy lookup through scoped RPCs", () => {
    expect(contentEdge).toContain('rpc("cms_content_read_bundle_scoped"');
    expect(contentEdge).toMatch(/rpc\(\s*"cms_normalize_controlled_payload_scoped"/);
    expect(contentEdge).toMatch(/rpc\(\s*"cms_blog_taxonomy_resolve_scoped"/);
    expect(contentEdge).not.toContain('.from("cms_content_drafts")');
    expect(contentEdge).not.toContain('.from("cms_content_revisions")');
    expect(contentEdge).not.toContain('.from("cms_quality_waivers")');
    expect(contentEdge).not.toContain('.from("cms_blog_authors")');
    expect(contentEdge).not.toContain('.from("cms_blog_categories")');
    expect(contentEdge).not.toContain('.from("cms_blog_tags")');
  });

  it("keeps progressive drafts within the same run and lease", () => {
    expect(migration).toContain("create function public.cms_execute_draft_v2_command(");
    expect(migration).toContain("create or replace function public.cms_get_draft_v2(");
    expect(migration).toMatch(
      /cms_execute_draft_v2_command[\s\S]+v_locked\.created_by[\s\S]+v_locked\.updated_by/,
    );
    expect(migration).toContain("CMS_DRAFT_V2_SCOPE_RACE");
    expect(draftsEdge).toContain('rpc("cms_get_draft_v2"');
    expect(draftsEdge).toContain('rpc("cms_execute_draft_v2_command"');
    expect(draftsEdge).toContain('rpc("cms_draft_v2_conflict_scoped"');
    expect(draftsEdge).not.toContain('.from("cms_content_drafts_v2")');
    expect(draftsEdge).not.toContain('.from("cms_draft_v2_events")');
  });

  it("removes global service-role reads and writes from the quality flow", () => {
    expect(qualityEdge).toContain('rpc("cms_content_read_bundle_scoped"');
    expect(qualityEdge).toContain('rpc("cms_quality_list_runs_scoped"');
    expect(qualityEdge.match(/rpc\("cms_execute_quality_command_scoped"/g)).toHaveLength(2);
    expect(qualityEdge).not.toContain('.from("cms_content_items")');
    expect(qualityEdge).not.toContain('.from("cms_content_drafts")');
    expect(qualityEdge).not.toContain('.from("cms_quality_runs")');
    expect(qualityEdge).not.toContain('.from("cms_quality_waivers")');
    expect(qualityEdge).not.toContain('.from("cms_quality_command_receipts")');
    expect(migration).toContain("cms_quality_receipt_scope_pair_check");
    expect(migration).toContain("qualityReceiptsRemoved");
  });

  it("scopes admin search, governance and prevents QA global reindex", () => {
    expect(searchEdge).toContain("CMS_SEARCH_LEGACY_DISABLED");
    expect(searchEdge).toContain('rpc("cms_search_admin_scoped"');
    expect(searchEdge).toContain('rpc("cms_search_governance_list_scoped"');
    expect(searchEdge.match(/rpc\("cms_search_governance_command_scoped"/g)).toHaveLength(2);
    expect(searchEdge).toContain('rpc("cms_search_begin_global_reindex"');
    expect(searchEdge).toContain('rpc("cms_search_finish_global_reindex"');
    expect(migration).toMatch(
      /cms_search_global_operation_allowed[\s\S]+not exists\([\s\S]+cms_qa_actor_leases/,
    );
    expect(migration).toMatch(/matching_synonyms[\s\S]+cms_content_actor_row_scope_allowed/);
    expect(migration).toMatch(/governed_rule[\s\S]+cms_content_actor_row_scope_allowed/);
    expect(pgTap).toContain("QA can never start a global reindex that touches corporate content");
  });

  it("applies the same graph predicate to direct PostgREST reads and cleanup", () => {
    for (const policy of [
      "cms_content_items_authorized_read",
      "cms_content_drafts_authorized_read",
      "cms_content_revisions_authorized_read",
      "cms_projection_authorized_read",
      "cms_quality_runs_read",
      "cms_quality_findings_read",
      "cms_quality_waivers_read",
      "cms_search_synonyms_cms_read",
      "cms_search_rules_read",
      "cms_search_jobs_read",
    ]) {
      expect(migration).toContain(`create policy ${policy}`);
    }
    expect(migration).toContain("private.cms_cleanup_qa_content_before_terminal");
    expect(migration).toContain("zz_cms_cleanup_qa_content_before_terminal");
    expect(migration).toContain("item.created_by=old.actor_id");
    expect(migration).toContain("status='failed',error_code='cms_qa_lease_terminal'");
    expect(pgTap).toContain("direct PostgREST QA reads expose only same-run content");
    expect(pgTap).toContain("select * from finish()");
    expect(pgTap).toContain("rollback;");
  });
});
