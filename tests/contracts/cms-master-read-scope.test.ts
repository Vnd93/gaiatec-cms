import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0068_cms_master_authoritative_read_scope.sql", "utf8");
const edge = readFileSync("supabase/functions/cms-master-data/index.ts", "utf8");
const pgTap = readFileSync("supabase/tests/rls_cms_master_read_scope.test.sql", "utf8");

describe("authoritative master-data read segregation", () => {
  it("uses the generic lease boundary and exact QA run provenance", () => {
    expect(migration).toContain("private.cms_actor_row_scope_allowed(");
    expect(migration).toContain("private.cms_qa_actor_leases any_lease");
    expect(migration).toContain("p_source_ref = lease.run_tag");
    expect(migration).toContain("private.cms_qa_actor_marker_is_exact(");
    expect(migration).toContain("private.cms_master_entity_scope_allowed(");
    expect(migration).toContain("cms_master_entity_aliases alias");
  });

  it("moves every privileged master read behind scoped RPCs", () => {
    expect(edge).toContain('rpc("cms_actor_scope_context"');
    expect(edge).toContain('rpc("cms_master_list_entities_scoped"');
    expect(edge).toContain('rpc("cms_master_list_rules_scoped"');
    expect(edge).toContain('rpc("cms_master_get_dependencies_scoped"');
    expect(edge).not.toContain('.from("cms_master_entities")');
    expect(edge).not.toContain('.from("cms_master_entity_aliases")');
    expect(edge).not.toContain('.from("cms_master_relation_rules")');
    expect(edge).not.toContain('.from("cms_master_compatibilities")');
    expect(edge).toContain("CMS_MASTER_DATA_QA_SCOPE_INACTIVE");
  });

  it("keeps all scoped readers callable only by the trusted service role", () => {
    for (const rpc of [
      "cms_master_list_rules_scoped(uuid,text)",
      "cms_master_list_entities_scoped(uuid,text,text,text,text,boolean,integer)",
      "cms_master_get_dependencies_scoped(uuid,text,text,text,uuid,boolean)",
    ]) {
      expect(migration).toContain(`revoke all on function public.${rpc}`);
      expect(migration).toContain(`grant execute on function public.${rpc}`);
    }
  });

  it("covers natural-key leakage, UUID IDOR and mixed graphs in pgTAP", () => {
    expect(pgTap).toContain("select plan(30)");
    expect(pgTap).toContain("corporate search cannot discover QA natural keys");
    expect(pgTap).toContain("QA dependency IDOR cannot address a corporate source");
    expect(pgTap).toContain("QA dependency IDOR cannot address another run source");
    expect(pgTap).toContain("a compatibility with another run marker is fail-closed");
    expect(pgTap).toContain("one cross-run alias hides the entire entity graph");
    expect(pgTap).toContain("select * from finish()");
    expect(pgTap).toContain("rollback;");
  });
});
