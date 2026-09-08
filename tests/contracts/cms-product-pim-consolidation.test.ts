import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0078_cms_product_pim_consolidation.sql", "utf8");
const pimEdge = readFileSync("supabase/functions/cms-pim/index.ts", "utf8");
const attributesEdge = readFileSync("supabase/functions/cms-attributes/index.ts", "utf8");
const adapter = readFileSync("src/admin/pim-v1-adapter.ts", "utf8");
const adminPim = readFileSync("src/admin/pages/AdminPimPage.tsx", "utf8");
const pgTap = readFileSync("supabase/tests/rls_cms_product_pim_consolidation.test.sql", "utf8");

describe("canonical product/PIM consolidation", () => {
  it("tombstones every legacy mutation while preserving scoped reads", () => {
    expect(migration).toContain("CMS_PIM_LEGACY_READ_ONLY");
    expect(migration).toContain("p_action not in ('save_product', 'generate_sku', 'archive_product')");
    expect(pimEdge).toContain('canonicalWriter: "cms-content"');
    expect(pimEdge).not.toContain('rpc("cms_execute_pim_command"');
    expect(migration).not.toMatch(/delete\s+from\s+public\.cms_pim_/i);
  });

  it("claims canonical SKU and identifier identities only at publication", () => {
    expect(migration).toContain("cms_product_canonical_sku_registry");
    expect(migration).toContain("cms_product_canonical_identifier_registry");
    expect(migration).toMatch(
      /create trigger cms_claim_product_identifiers_0078[\s\S]+on public\.cms_published_projection/,
    );
    expect(migration).not.toMatch(/cms_claim_product_identifiers_0078[\s\S]{0,160}cms_content_drafts/);
    expect(migration).toContain("registry.first_owner_type = v_owner_type");
    expect(migration).toContain("registry.first_owner_id is not distinct from v_owner_id");
    expect(migration).toContain("canonical_identifiers");
    expect(migration).toContain("identifier #>> '{owner,type}' = 'model'");
    expect(migration).toContain("identifier #>> '{owner,type}' = 'variant'");
  });

  it("keeps corporate and exact QA namespaces disjoint and cleans terminal QA claims", () => {
    expect(migration).toContain("when lease.actor_id is null then 'corporate'");
    expect(migration).toContain("'qa:%s:%s:%s'");
    expect(migration).toContain("cms_00_product_registry_terminal_cleanup_0078");
    expect(migration).toContain("cms_product_canonical_registry_cleanup_events");
    expect(migration).toContain("claimsSha256");
    expect(migration).toContain("peer.expires_at > statement_timestamp()");
  });

  it("resolves controlled options and master entities in-scope without trusting IDs", () => {
    expect(migration).toContain("cms_resolve_controlled_master_entity_0078");
    expect(migration).toContain("cms_pim_master_controlled_options_scoped");
    expect(migration).toContain("count(distinct entity.id)");
    expect(migration).toContain("where match_count = 1");
    expect(migration).toContain("'controlled_category'");
    expect(migration).toContain("'master_category'");
    expect(attributesEdge).toContain("controlledCategory:");
    expect(attributesEdge).toContain("masterCategory:");
    expect(attributesEdge).toContain('rpc("cms_product_attributes_catalog_scoped"');
    expect(pimEdge).toContain('rpc("cms_pim_master_controlled_options_scoped"');
  });

  it("shares only five immutable product-list containers while keeping every option run-scoped", () => {
    for (const listKey of [
      "product.category",
      "product.application_magnitude",
      "product.technology",
      "product.installation_operation",
      "product.monitored_element",
    ]) {
      expect(migration).toContain(`'${listKey}'`);
    }
    expect(migration).toContain("cms_product_shared_controlled_list_allowed_0078");
    expect(migration).toContain("cms_product_controlled_option_scope_allowed_0078");
    expect(migration).toContain("cms_manage_controlled_vocabulary_scoped_pre_0078");
    expect(migration).toContain("cms_prepare_qa_actor_terminal_product_shared_vocab_cleanup");
    expect(migration).toContain("CMS_QA_PRODUCT_OPTION_REFERENCE_ACTIVE");
    expect(pgTap).toContain("a sixth corporate list key is never a shared QA container");
    expect(pgTap).toContain("a QA product cannot adopt a corporate option");
    expect(pgTap).toContain("a QA product cannot adopt an option from another run");
    expect(pgTap).toContain("corporate vocabulary reads exclude every ever-QA option");
    expect(pgTap).toContain("terminal cleanup leaves zero QA controlled-option residue");
  });

  it("validates governed attribute metadata, owner, requiredness, type, enum, range and unit", () => {
    for (const evidence of [
      "select definition.*, member.required as member_required into v_definition",
      "v_specification -> 'required' is distinct from to_jsonb(v_definition.member_required)",
      "case when v_definition.data_type = 'decimal'",
      "cms_pim_validate_attribute_value",
      "cms_pim_attribute_definition_scope_allowed",
      "cms_pim_attribute_set_scope_allowed",
      "coalesce(v_specification ->> 'scope', 'product')",
      "CMS_PIM_CANONICAL_ATTRIBUTE_INVALID",
    ]) {
      expect(migration).toContain(evidence);
    }
    expect(migration).toContain("if not (v_specification ? 'definitionId') then return false");
    expect(migration).not.toContain("select definition, member.required into v_definition, v_required");
  });

  it("materializes model-scoped variants and owner-scoped attributes", () => {
    expect(migration).toContain("cms_product_variant_projection_item_model_code_uidx");
    expect(migration).toContain("cms_product_attribute_projection_scoped_uidx");
    expect(migration).toContain("definition_id, owner_scope, owner_id");
    expect(migration).toContain("coalesce(nullif(variant ->> 'sku', ''), model ->> 'sku')");
    expect(migration).toContain("coalesce(spec ->> 'scope', 'product')");
    expect(migration).toContain("revoke select on table public.cms_product_attribute_projection");
  });

  it("provides an audited server-derived reconciliation plan and a CAS command", () => {
    const reconcileStart = migration.indexOf("create function public.cms_reconcile_legacy_pim_product(");
    const reconcileEnd = migration.indexOf(
      "revoke all on function public.cms_reconcile_legacy_pim_product(",
      reconcileStart,
    );
    const reconcileFunction = migration.slice(reconcileStart, reconcileEnd);
    const matchCapture = reconcileFunction.indexOf("v_matched_by := case");
    const firstProductUpdate = reconcileFunction.indexOf("update public.cms_pim_products");

    expect(migration).toContain("cms_get_pim_reconciliation_plan");
    expect(migration).toContain("legacySnapshotSha256");
    expect(migration).toContain("CMS_PIM_RECONCILIATION_ACK_REQUIRED");
    expect(migration).toContain("p_acknowledged_legacy_sha256 is null");
    expect(migration).toContain("p_acknowledged_legacy_sha256 is distinct from v_legacy_sha");
    expect(migration).toContain("v_product.lock_version <> p_expected_product_version");
    expect(migration).toContain("v_draft.lock_version <> p_expected_draft_version");
    expect(reconcileStart).toBeGreaterThan(-1);
    expect(reconcileEnd).toBeGreaterThan(reconcileStart);
    expect(matchCapture).toBeGreaterThan(-1);
    expect(matchCapture).toBeLessThan(firstProductUpdate);
    expect(reconcileFunction).toContain("v_product.id, v_item.id, v_matched_by,");
    expect(reconcileFunction).toContain("'matchedBy', v_matched_by");
    expect(pgTap).toContain(
      "manual reconciliation freezes original slug or content-item match evidence before mutation",
    );
    expect(pimEdge).toContain('action: z.literal("get_reconciliation_plan")');
    expect(adminPim).toContain("Resumo de integridade do cadastro anterior");
    expect(adminPim).toContain("Detalhes técnicos de integridade");
    expect(adminPim).not.toContain("Hash imutável do legado");
    expect(adminPim).toContain("acknowledgedLegacySha256: reconciliationPlan.legacySnapshotSha256");
  });

  it("does not invent adapter identities or silently omit legacy graph members", () => {
    expect(pimEdge).toContain('const sku = String(skuByOwner.get(model.id) ?? "").trim()');
    expect(pimEdge).toContain('sku: String(skuByOwner.get(variant.id) ?? "").trim()');
    expect(pimEdge).toContain("CMS_PIM_PROVENANCE_UNREPRESENTABLE");
    expect(pimEdge).toContain("CMS_PIM_IDENTIFIER_OWNER_UNREPRESENTABLE");
    expect(adapter).toContain("requiredControlledOption");
    expect(adapter).toContain("definitionId: attribute.definitionId");
    expect(adapter).toContain("externalIdentifiers: product.externalIdentifiers.map");
    expect(adapter).toContain("provenance: product.provenance.map");
  });

  it("backs the adversarial cases with direct database tests", () => {
    for (const evidence of [
      "a draft does not reserve a global SKU",
      "a second product cannot publish the same normalized SKU",
      "an external identifier cannot name an orphan model UUID",
      "a number definition rejects a string value",
      "an enum definition rejects a value outside enum_options",
      "a range definition rejects min greater than max",
      "required metadata cannot be forged false",
      "same variant code is allowed in two different models",
      "scoped attributes materialize for product, model and variant owners",
      "a NULL acknowledged hash cannot retire divergent legacy data",
      "terminal QA cleanup removes every canonical identity claim",
    ]) {
      expect(pgTap).toContain(evidence);
    }
    expect(pgTap).toContain("select * from finish()");
    expect(pgTap).toContain("rollback;");
  });
});
