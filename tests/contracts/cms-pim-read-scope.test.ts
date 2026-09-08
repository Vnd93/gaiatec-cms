import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0067_cms_pim_authoritative_read_scope.sql", "utf8");
const edge = readFileSync("supabase/functions/cms-pim/index.ts", "utf8");
const pgTap = readFileSync("supabase/tests/rls_cms_pim_read_scope.test.sql", "utf8");

describe("authoritative PIM read segregation", () => {
  it("classifies QA identities only through the private server-side lease", () => {
    expect(migration).toMatch(
      /exists \(\s*select 1\s*from private\.cms_qa_actor_leases any_lease\s*where any_lease\.actor_id = p_actor_id/s,
    );
    expect(migration).toContain("lease.environment = p_environment");
    expect(migration).toContain("lease.status = 'active'");
    expect(migration).toContain("lease.expires_at > statement_timestamp()");
    expect(migration).toContain("p_row_at >= lease.created_at");
    expect(migration).toContain("private.cms_qa_actor_marker_is_exact(");
    expect(migration).toMatch(
      /else not exists \(\s*select 1\s*from private\.cms_qa_actor_leases row_actor_lease/s,
    );
    expect(edge).not.toMatch(/user_metadata|raw_user_meta_data/);
  });

  it("fails closed for mixed product graphs and auxiliary master data", () => {
    for (const table of [
      "cms_pim_product_master_links",
      "cms_pim_models",
      "cms_pim_variants",
      "cms_pim_skus",
      "cms_pim_external_identifiers",
      "cms_pim_attribute_values",
      "cms_pim_provenance",
      "cms_content_items",
      "cms_master_entities",
      "cms_pim_attribute_definitions",
      "cms_pim_units",
    ]) {
      expect(migration).toContain(table);
    }
    expect(migration).toContain("lease.run_tag = marker.source_ref");
    expect(migration).toContain("cms_pim_master_entities_scoped");
    expect(migration).toContain("cms_pim_product_graph_scope_allowed");
  });

  it("routes list, get and preview through scoped RPCs and retires legacy mutations", () => {
    expect(edge).toContain('rpc("cms_actor_scope_context"');
    expect(edge).toContain('rpc("cms_pim_list_products_scoped"');
    expect(edge).toContain('rpc("cms_pim_get_product_scoped"');
    expect(edge).toContain('rpc("cms_pim_master_entities_scoped"');
    expect(edge).not.toContain('.from("cms_pim_products")');
    expect(edge).not.toContain('.from("cms_master_entities")');
    expect(edge).toContain('throw new Error("CMS_PIM_NOT_FOUND")');
    expect(edge).toContain("CMS_PIM_LEGACY_READ_ONLY");
    expect(edge).toContain('canonicalWriter: "cms-content"');
    expect(edge).not.toContain('rpc("cms_execute_pim_command"');
  });

  it("keeps scoped RPCs behind service_role and covers IDOR in pgTAP", () => {
    for (const rpc of [
      "cms_actor_scope_context(uuid,text)",
      "cms_pim_product_read_allowed(uuid,uuid,text,text)",
      "cms_pim_list_products_scoped(uuid,text,text,text,boolean,integer)",
      "cms_pim_get_product_scoped(uuid,uuid,text,text)",
      "cms_pim_master_entities_scoped(uuid,text,text,uuid[])",
    ]) {
      expect(migration).toContain(`grant execute on function public.${rpc}`);
    }
    expect(pgTap).toContain("select plan(27)");
    expect(pgTap).toContain("legacy graph writes fail closed outside the migration-owner test harness");
    expect(pgTap).toContain("session_user=current_user");
    expect(pgTap).toContain("select set_config('cms.pim_consolidating', 'off', true)");
    expect(pgTap).toContain("a QA actor cannot read a corporate product by UUID");
    expect(pgTap).toContain("a QA actor cannot read another QA run by UUID");
    expect(pgTap).toContain("corporate get makes a QA UUID indistinguishable from missing");
    expect(pgTap).toContain("one cross-run child hides the entire product graph");
    expect(pgTap).toContain("select * from finish()");
    expect(pgTap).toContain("rollback;");
  });
});
