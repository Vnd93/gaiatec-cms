import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/0071_cms_attributes_vocab_authoritative_scope.sql",
  "utf8",
);
const productConsolidation = readFileSync(
  "supabase/migrations/0078_cms_product_pim_consolidation.sql",
  "utf8",
);
const attributesEdge = readFileSync("supabase/functions/cms-attributes/index.ts", "utf8");
const vocabEdge = readFileSync("supabase/functions/cms-controlled-vocabularies/index.ts", "utf8");
const vocabPage = readFileSync("src/admin/pages/AdminControlledVocabulariesPage.tsx", "utf8");
const pgTap = readFileSync("supabase/tests/rls_cms_attributes_vocab_scope.test.sql", "utf8");
const productPgTap = readFileSync("supabase/tests/rls_cms_product_pim_consolidation.test.sql", "utf8");

describe("authoritative attributes and vocabulary scope", () => {
  it("closes all service-role list reads behind lease-scoped RPCs", () => {
    expect(attributesEdge).toContain('rpc("cms_actor_scope_context"');
    expect(attributesEdge).toContain('rpc("cms_product_attributes_catalog_scoped"');
    expect(attributesEdge).not.toMatch(/\.from\("cms_pim_(?:units|attribute)/);
    expect(vocabEdge).toContain('rpc("cms_actor_scope_context"');
    expect(vocabEdge).toContain('rpc("cms_controlled_vocabularies_scoped"');
    expect(vocabEdge).not.toMatch(/\.from\("cms_controlled_/);
    expect(migration).toContain("revoke select on table public.cms_controlled_lists");
  });

  it("resolves the canonical controlled category to exactly one scoped master category", () => {
    expect(productConsolidation).toContain("cms_product_attributes_catalog_scoped");
    expect(productConsolidation).toContain("cms_resolve_controlled_master_entity_0078");
    expect(productConsolidation).toContain("count(distinct entity.id)");
    expect(productConsolidation).toContain("where match_count = 1");
    expect(productConsolidation).toContain("'controlled_category'");
    expect(productConsolidation).toContain("'master_category'");
    expect(attributesEdge).toContain("controlledCategory:");
    expect(attributesEdge).toContain("masterCategory:");
    expect(attributesEdge).toContain("p_category_option_id: categoryOptionId");
    expect(attributesEdge).toContain("listCatalog(identity, command.categoryId");
    expect(productPgTap).toContain(
      "controlled product category resolves to the exact scoped master category",
    );
  });

  it("fails closed for mixed attribute and controlled-vocabulary graphs", () => {
    for (const marker of [
      "cms_pim_unit_scope_allowed",
      "cms_pim_attribute_definition_scope_allowed",
      "cms_pim_attribute_set_scope_allowed",
      "cms_master_entity_scope_allowed",
      "cms_controlled_list_scope_allowed",
      "cms_actor_row_scope_allowed",
    ]) {
      expect(migration).toContain(marker);
    }
    expect(migration).toContain("cms_pim_attribute_set_definitions assignment");
    expect(migration).toContain("cms_controlled_options option");
  });

  it("uses actor-lease locking, optimistic CAS and scoped mutation RPCs", () => {
    expect(vocabEdge).toContain('rpc("cms_manage_controlled_vocabulary_scoped"');
    expect(vocabEdge).not.toContain('rpc("cms_manage_controlled_vocabulary"');
    expect(migration).toContain("private.cms_lock_active_qa_actor_leases(array[p_actor_id])");
    expect(migration).toContain("list.lock_version = v_expected_lock_version");
    expect(migration).toContain("option.lock_version = v_expected_lock_version");
    expect(migration).toContain("CMS_CONTROLLED_VERSION_CONFLICT");
    expect(vocabPage).toContain("lockVersion: current.lock_version");
    expect(vocabPage).toContain("lockVersion: option.lock_version");
  });

  it("compensates QA natural keys without weakening normal delete guards", () => {
    expect(migration).toContain("cms_prepare_qa_actor_terminal_vocab_cleanup");
    expect(migration).toContain("CMS_QA_CONTROLLED_VOCAB_EXTERNAL_CONFLICT");
    expect(migration).toContain("CMS_QA_CONTROLLED_VOCAB_EXTERNAL_REFERENCE");
    expect(migration).toContain("CMS_QA_CONTROLLED_VOCAB_CLEANUP_INCOMPLETE");
    expect(migration).toContain("current_setting('cms.qa_compensating', true) = 'on'");
    expect(migration).toContain("cms:qa.controlled_vocabulary_compensated");
  });

  it("keeps scoped public functions service-role-only and covers adversarial SQL cases", () => {
    for (const rpc of [
      "cms_attributes_catalog_scoped(uuid,text,text,uuid)",
      "cms_controlled_vocabularies_scoped(uuid,text,text,boolean,integer)",
      "cms_manage_controlled_vocabulary_scoped(uuid,text,text,jsonb,jsonb,text,text,timestamptz,uuid)",
    ]) {
      expect(migration).toContain(`revoke all on function public.${rpc}`);
      expect(migration).toContain(`grant execute on function public.${rpc}`);
    }
    expect(pgTap).toContain("corporate attribute units exclude QA natural keys");
    expect(pgTap).toContain("QA cannot mutate a corporate list by UUID");
    expect(pgTap).toContain("wrong optimistic version preserves the vocabulary row");
    expect(pgTap).toContain("terminal cleanup releases the QA natural key");
    expect(pgTap).toContain("select * from finish()");
    expect(pgTap).toContain("rollback;");
  });
});
