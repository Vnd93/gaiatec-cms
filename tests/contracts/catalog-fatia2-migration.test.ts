import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0108_catalog_fatia_2_publication.sql", "utf8");
const pgTap = readFileSync("supabase/tests/rls_catalog_fatia2_publication.test.sql", "utf8");

describe("catalog slice 2 publication", () => {
  it("materializes the revision state machine without loading or publishing data", () => {
    expect(migration).toContain("publication_state text not null default 'draft'");
    expect(migration).toContain("publication_state in ('draft', 'ready', 'published')");
    expect(migration).toContain("create table public.cms_catalog_product_snapshots");
    expect(migration).toContain("create table public.cms_catalog_publication_outbox");
    expect(migration).toContain("CMS_CATALOG_FEATURE_DISABLED");
    expect(migration).toContain("CMS_CATALOG_PRIMARY_TERM_REQUIRED");
    expect(migration).not.toMatch(/insert\s+into\s+public\.cms_catalog_(products|taxonomy_terms)\b/i);
    expect(migration).not.toMatch(/logs\.all/i);
  });

  it("keeps public state isolated and commercially fail-closed", () => {
    expect(migration).toContain("create view public.cms_catalog_current_snapshots");
    expect(migration).toContain("with (security_invoker = true)");
    expect(migration).toContain("cms_catalog_product_snapshots_public_read");
    expect(migration).toContain("cms_catalog_snapshot_internal_guard");
    expect(migration).toContain("CMS_CATALOG_SNAPSHOT_IMMUTABLE");
    expect(migration).toContain(
      "grant select (\n  snapshot_id, product_id, revision, slug, title, content, published_at\n)",
    );
    expect(migration).not.toContain("published_by, published_at\nfrom public.cms_catalog_product_snapshots");
    expect(migration).toContain(
      "not (content ?| array['sku', 'price', 'stock', 'inventory', 'availability'])",
    );
    expect(migration).toContain("cms_catalog_products_update");
    expect(migration).toContain("current_setting('cms.catalog_product_command', true) = 'on'");
    expect(migration).toContain("security definer");
  });

  it("backs the migration with structural pgTAP coverage", () => {
    const planned = Number(/select plan\((\d+)\);/.exec(pgTap)?.[1]);
    const asserted = pgTap.match(/^select (?:ok|is|isnt|has_table)\(/gm)?.length ?? 0;
    expect(planned).toBe(asserted);
    expect(pgTap).toContain("fatia 2 migration does not load snapshots");
    expect(pgTap).toContain("publication remains disabled by default");
    expect(pgTap).toContain("publication tables expose no delete policy");
  });
});
