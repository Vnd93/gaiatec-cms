import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0064_cms_qa_mutation_compensation.sql", "utf8");
const pgTap = readFileSync("supabase/tests/rls_qa_mutation_compensation.test.sql", "utf8");

describe("persistent QA mutation compensation", () => {
  it("captures every governed singleton layer before the first exact-lease mutation", () => {
    expect(migration).toContain("private.cms_qa_global_mutation_journal");
    expect(migration).toContain("baseline_item jsonb not null");
    expect(migration).toContain("baseline_draft jsonb not null");
    expect(migration).toContain("baseline_projection jsonb not null");
    expect(migration).toContain("baseline_publication jsonb not null");
    expect(migration).toContain("private.cms_qa_actor_marker_is_exact(");
    expect(migration).toContain("v_lease.expires_at <= clock_timestamp()");
    for (const trigger of [
      "cms_qa_global_item_before_mutation",
      "cms_qa_global_draft_before_mutation",
      "cms_qa_global_projection_before_mutation",
      "cms_qa_global_publication_before_mutation",
    ]) {
      expect(migration).toContain(trigger);
    }
    expect(migration).toMatch(
      /create unique index cms_qa_global_mutation_one_open_item_idx[\s\S]*where status in \('active', 'external_conflict'\)/,
    );
  });

  it("tracks QA revisions and restores only after a locked CAS decision", () => {
    expect(migration).toContain("private.cms_qa_global_mutation_revisions");
    expect(migration).toContain("cms_qa_global_revision_track");
    expect(migration).toMatch(/where item\.id = v_candidate\.item_id for update/);
    expect(migration).toContain("v_current_state_hash <> v_journal.qa_state_hash");
    expect(migration).toContain("CMS_QA_GLOBAL_CAS_CONFLICT");
    expect(migration).toContain("CMS_QA_GLOBAL_EXTERNAL_CONFLICT");
    expect(migration).toContain("CMS_QA_GLOBAL_RESTORE_INTEGRITY");
    expect(migration).toContain("v_current_logical_hash = v_journal.baseline_logical_hash");
    expect(migration).toContain("'baseline_already_present'");
    expect(migration).toContain("current_setting('cms.qa_mutation_actor', true)");
    expect(migration).toContain("and pg_trigger_depth() > 1");
    expect(migration).toMatch(
      /before update of status on private\.cms_qa_actor_leases[\s\S]*cms_prepare_qa_actor_terminal_compensation/,
    );
  });

  it("archives durable governed records and removes synthetic natural-key residue", () => {
    for (const marker of [
      "update public.cms_media_assets asset",
      "update public.cms_dam_collections collection",
      "update public.cms_dam_replacements replacement",
      "update public.cms_pim_products product",
      "update public.cms_pim_models model",
      "update public.cms_pim_variants variant",
      "update public.cms_pim_skus sku",
      "update public.cms_pim_product_master_links link",
      "update public.cms_pim_attribute_values attribute_value",
      "update public.cms_pim_provenance provenance",
      "where version.status <> 'retired'",
      "update public.cms_master_entities entity",
      "update public.cms_master_compatibilities compatibility",
      "delete from public.cms_dam_collection_assets link",
      "delete from public.cms_dam_asset_tags link",
      "delete from public.cms_dam_crops crop",
      "delete from public.cms_dam_tags tag",
      "and not exists (\n      select 1 from public.cms_dam_asset_tags link where link.tag_id = tag.id",
      "'qa_relationships_detached'",
      "'qa_orphan_tag_removed'",
      "insert into public.cms_dam_gc_jobs",
      "'damGcJobsScheduled', v_dam_gc_jobs_scheduled",
      "CMS_QA_DAM_EXTERNAL_CONFLICT",
      "CMS_QA_PIM_EXTERNAL_CONFLICT",
      "CMS_QA_MASTER_EXTERNAL_CONFLICT",
      "CMS_QA_DOMAIN_CLEANUP_INCOMPLETE",
    ]) {
      expect(migration).toContain(marker);
    }

    const domainCompensation = migration.slice(
      migration.indexOf("create or replace function private.cms_compensate_qa_domain_residue"),
      migration.indexOf("create or replace function private.cms_prepare_qa_actor_terminal_compensation"),
    );
    expect(domainCompensation).not.toMatch(
      /delete\s+from\s+public\.(?:cms_media_assets|cms_dam_(?:collections|replacements|events)|cms_pim_(?:products|models|variants|skus|product_master_links|provenance)|cms_master_(?:entities|compatibilities|data_events))/i,
    );
    expect(domainCompensation).toMatch(
      /delete from public\.cms_dam_collection_assets link\s+where link\.created_by = p_actor_id;/,
    );
    expect(domainCompensation).toMatch(
      /delete from public\.cms_dam_asset_tags link\s+where link\.created_by = p_actor_id;/,
    );
    expect(domainCompensation).toMatch(
      /delete from public\.cms_dam_crops crop\s+where crop\.created_by = p_actor_id and crop\.updated_by = p_actor_id;/,
    );
    expect(domainCompensation).toContain(
      "lock table public.cms_dam_replacements in share row exclusive mode",
    );
    expect(domainCompensation).toMatch(
      /on conflict \(asset_id\) where status in \('pending', 'processing', 'blocked', 'failed'\)\s+do nothing/,
    );
    expect(domainCompensation).toContain("'cms:qa.domain_residue_compensated'");
    expect(domainCompensation).not.toMatch(/'payload'\s*,|'baseline'\s*,/);
  });

  it("executes death, pre-restored baseline and external-conflict scenarios in pgTAP", () => {
    for (const marker of [
      "QA publication interrupted after commit",
      "a simulated runner death restores the exact persistent baseline by CAS",
      "a logical baseline already restored through the UI is recognized",
      "recognition does not replace the immutable manual restore revision",
      "baseline recognition still requeues deterministic public cache invalidation",
      "the row trigger persistently marks a concurrent external mutation",
      "nested publication and projection deletes inherit the exact QA actor",
      "CAS compensation fails explicitly instead of overwriting an external operator",
      "the external operator state is left byte-for-byte untouched",
      "the second QA-created tag is removed after cross-scope adoption was rejected",
      "an external DAM relationship aborts cleanup before the synthetic asset is archived",
      "an externally edited PIM product aborts cleanup without overwriting it",
      "an externally edited master-data entity aborts cleanup without overwriting it",
    ]) {
      expect(pgTap).toContain(marker);
    }
    expect(pgTap).toContain("select plan(66)");
    expect(pgTap).toContain("select * from finish()");
    expect(pgTap).toContain("rollback;");
  });

  it("keeps private snapshot payloads out of the public immutable audit evidence", () => {
    expect(migration).toContain("revoke all on table private.cms_qa_global_mutation_journal");
    expect(migration).toContain("from public, anon, authenticated, service_role");
    expect(migration).toContain("'cms:qa.global_snapshot_compensated'");
    expect(migration).toContain("'trackedQaRevisions', v_revision_count");
    expect(migration).not.toMatch(
      /'cms:qa\.global_snapshot_compensated'[\s\S]{0,1000}baseline_(?:item|draft|projection|publication)/,
    );
  });
});
