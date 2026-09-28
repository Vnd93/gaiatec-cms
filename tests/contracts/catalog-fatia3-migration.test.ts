import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0109_catalog_fatia_3_relations.sql", "utf8");
const pgTap = readFileSync("supabase/tests/rls_catalog_fatia3_relations.test.sql", "utf8");

describe("catalog slice 3 relations", () => {
  it("materializes typed relation history without loading catalog data", () => {
    expect(migration).toContain("create table public.cms_catalog_product_relation_revisions");
    expect(migration).toContain("create table public.cms_catalog_product_hierarchy_revisions");
    expect(migration).toContain("create table public.cms_catalog_composition_units");
    expect(migration).toContain("CMS_CATALOG_RELATION_CYCLE");
    expect(migration).toContain("CMS_CATALOG_NESTED_KIT");
    expect(migration).toContain("CMS_CATALOG_RELATION_DUPLICATE");
    expect(migration).toContain("CMS_CATALOG_SYMMETRIC_RELATION_CANONICAL_ORDER");
    expect(migration).not.toMatch(/insert\s+into\s+public\.cms_catalog_(products|taxonomy_terms)\b/i);
    expect(migration).not.toMatch(/logs\.all/i);
  });

  it("keeps composition and inheritance fail-closed", () => {
    expect(migration).toContain("quantity is not null and unit_code is not null");
    expect(migration).toContain("quantity is null and unit_code is null");
    expect(migration).toContain("create or replace view public.cms_catalog_effective_relations");
    expect(migration).toContain("with (security_invoker = true)");
    expect(migration).toContain("precedence_rank = 1");
    expect(migration).toContain("relation_origin_product_id");
    expect(migration).toContain("current_setting('cms.catalog_relation_command', true) = 'on'");
    expect(migration).toContain("CMS_CATALOG_FEATURE_DISABLED");
    expect(migration).toContain("cms_catalog_relation_revision_immutable");
    expect(migration).toContain("cms_catalog_hierarchy_revision_immutable");
  });

  it("backs the migration with exact pgTAP accounting", () => {
    const planned = Number(/select plan\((\d+)\);/.exec(pgTap)?.[1]);
    const asserted = pgTap.match(/^select (?:ok|is|isnt|has_table|has_view)\(/gm)?.length ?? 0;
    expect(planned).toBe(asserted);
    expect(pgTap).toContain("fatia 3 migration does not load relations");
    expect(pgTap).toContain("relations remain disabled by default");
    expect(pgTap).toContain("relation histories expose no delete policy");
  });
});
