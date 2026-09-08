import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/0074_cms_visual_multisite_authoritative_scope.sql",
  "utf8",
);
const pgTap = readFileSync("supabase/tests/rls_cms_visual_multisite_scope.test.sql", "utf8");

describe("authoritative Visual Studio and multisite scope", () => {
  it("persists a server-derived immutable candidate marker", () => {
    expect(migration).toContain("add column if not exists qa_actor_id uuid");
    expect(migration).toContain("new.qa_run_tag := v_lease.run_tag");
    expect(migration).toContain("new.qa_candidate_sha := v_lease.candidate_sha");
    expect(migration).toContain("new.qa_environment := v_lease.environment");
    expect(migration).toContain("CMS_SITES_QA_MARKER_SPOOFED");
    expect(migration).toContain("CMS_SITES_QA_PROVENANCE_IMMUTABLE");
  });

  it("wraps every deployed visual and site RPC and revokes its preserved implementation", () => {
    for (const rpc of [
      "cms_get_visual_catalog",
      "cms_list_visual_branches",
      "cms_get_visual_document",
      "cms_execute_visual_command",
      "cms_get_site_registry",
      "cms_execute_site_command",
    ]) {
      expect(migration).toContain(`create function public.${rpc}`);
      expect(migration).toMatch(
        new RegExp(`revoke all on function public\\.${rpc}_unscoped_0074\\([\\s\\S]+?service_role;`),
      );
    }
  });

  it("uses lease-first graph locks and authoritative reference validation", () => {
    expect(migration).toContain("perform private.cms_lock_active_qa_actor_leases(v_actor_ids)");
    expect(migration).toContain("private.cms_lock_content_item_for_actor(");
    expect(migration).toContain("private.cms_content_item_graph_scope_allowed(");
    expect(migration).toContain("private.cms_visual_document_references_scope_allowed(");
    expect(migration).toContain("private.cms_visual_symbol_scope_allowed(");
    expect(migration).toContain("CMS_VISUAL_SCOPE_RACE");
    expect(migration).toContain("perform set_config('cms.qa_mutation_actor_id',p_actor_id::text,true)");
  });

  it("keeps only the canonical main catalog shared and excludes ever-QA corporate leakage", () => {
    expect(migration).toContain("private.cms_visual_main_catalog_row_allowed");
    expect(migration).toMatch(/site\.site_key='main'[\s\S]+site\.is_primary/);
    expect(migration).toContain("site.qa_actor_id=old.actor_id");
    expect(migration).toContain("history.actor_id in (v_site.created_by, v_site.updated_by)");
    expect(migration).toContain("p_allow_same_run_peer or p_actor_id = v_site.qa_actor_id");
  });

  it("installs defense-in-depth RLS and terminalizes actionable resources without deleting evidence", () => {
    for (const table of [
      "cms_sites",
      "cms_site_environments",
      "cms_site_domains",
      "cms_themes",
      "cms_design_tokens",
      "cms_component_definitions",
      "cms_component_versions",
      "cms_page_branches",
      "cms_visual_documents",
      "cms_visual_symbols",
      "cms_visual_snapshots",
      "cms_visual_events",
      "cms_visual_command_receipts",
      "cms_site_events",
      "cms_site_command_receipts",
    ]) {
      expect(migration).toContain(`'${table}'`);
    }
    expect(migration).toContain("zy_cms_prepare_qa_actor_terminal_visual_cleanup");
    expect(migration).toContain("status='abandoned'");
    expect(migration).toContain("status='suspended'");
    expect(migration).toContain("receipt.site_id is null and receipt.actor_id=old.actor_id");
    expect(migration).toContain("receipt.branch_id is null and receipt.actor_id=old.actor_id");
    expect(migration).toContain("documentsSnapshotsTokensRetainedInert");
    expect(migration).not.toMatch(/delete from public\.cms_(visual|site|design)/);
  });

  it("backs IDOR, forged-marker, stale-lease, peer and cleanup boundaries with pgTAP", () => {
    for (const evidence of [
      "same-run peer can read the complete visual branch graph",
      "cross-run branch UUID is rejected",
      "QA cannot adopt a corporate content item",
      "forged candidate marker is rejected",
      "candidate ownership is not broadened to a same-run peer",
      "expired visual actor lease is fail-closed",
      "corporate RLS excludes every ever-QA visual graph",
      "terminal cleanup abandons the QA visual branch",
      "terminal cleanup cancels an orphan visual reservation",
      "terminal cleanup cancels an orphan site reservation",
      "immutable snapshots survive as inert evidence",
    ]) {
      expect(pgTap).toContain(evidence);
    }
    expect(pgTap).toContain("set local role authenticated");
    expect(pgTap).toContain("select * from finish()");
    expect(pgTap).toContain("rollback;");
  });
});
