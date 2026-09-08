import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0066_cms_deployed_command_actor_context.sql", "utf8");
const pgTap = readFileSync("supabase/tests/rls_cms_deployed_command_actor_context.test.sql", "utf8");

describe("deployed command actor context rollout", () => {
  it("patches every already-deployed mutation RPC without rewriting its historical migration", () => {
    for (const signature of [
      "public.cms_execute_master_data_command",
      "public.cms_execute_pim_command",
      "public.cms_execute_dam_command",
    ]) {
      expect(migration).toContain(signature);
    }
    expect(migration).toContain("pg_get_functiondef");
    expect(migration).toContain("cms.qa_mutation_actor_id");
    expect(migration).toContain("set_config");
    expect(migration).toContain("CMS_QA_COMMAND_ACTOR_CONTEXT_NOT_INSTALLED");
  });

  it("keeps retired natural keys reusable and the teardown relation deferrable", () => {
    expect(migration).toContain("cms_master_entities_name_active_uidx");
    expect(migration).toContain("cms_master_entities_domain_active_uidx");
    expect(migration).toContain("cms_pim_attribute_definitions_active_key_uidx");
    expect(migration).toContain("cms_pim_attribute_sets_active_name_uidx");
    expect(migration).toContain("deferrable initially immediate");
  });

  it("has an executable database contract for all three installed definitions", () => {
    expect(pgTap).toContain("select plan(12)");
    expect(pgTap).toContain("cms_execute_master_data_command");
    expect(pgTap).toContain("cms_execute_pim_command");
    expect(pgTap).toContain("cms_execute_dam_command");
    expect(pgTap).toContain("set_config(''cms.qa_mutation_actor_id'', p_actor_id::text, true)");
    expect(pgTap).toContain("select * from finish()");
    expect(pgTap).toContain("rollback;");
  });
});
