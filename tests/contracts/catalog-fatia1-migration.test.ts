import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0107_catalog_fatia_1_foundation.sql", "utf8");
const pgTap = readFileSync("supabase/tests/rls_catalog_fatia1_foundation.test.sql", "utf8");

describe("catalog slice 1 foundation", () => {
  it("is additive, empty and fail-closed by default", () => {
    expect(migration).toContain("create table public.cms_catalog_products");
    expect(migration).toContain("create table public.cms_catalog_taxonomy_terms");
    expect(migration).toContain("alter table public.cms_catalog_products enable row level security");
    expect(migration).toContain("insert into public.cms_feature_flags");
    expect(migration).toContain("'ev2.catalog_v1'");
    expect(migration).toContain("on conflict (flag_key) do nothing");
    expect(migration).not.toMatch(/insert\s+into\s+public\.cms_catalog_(products|taxonomy_terms)/i);
    expect(migration).not.toMatch(/lifecycle_status\s+text[^;]*published/i);
    expect(migration).not.toMatch(/logs\.all/i);
  });

  it("keeps commercial fields out and protects mutations", () => {
    expect(migration).toContain(
      "not (content ?| array['sku', 'price', 'stock', 'inventory', 'availability'])",
    );
    expect(migration).toContain("CMS_CATALOG_REVISION_CONFLICT");
    expect(migration).toContain("CMS_CATALOG_TAXONOMY_CYCLE");
    expect(migration).toContain("CMS_CATALOG_TAXONOMY_PARENT_TYPE_MISMATCH");
    expect(migration).toContain("CMS_CATALOG_TERM_KIND_MISMATCH");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("cms_catalog_audit_events_immutable");
    expect(migration).toContain("revoke all on table");
    expect(migration).toContain("grant select, insert, update on table");
  });

  it("backs the migration with structural pgTAP coverage", () => {
    const planned = Number(/select plan\((\d+)\);/.exec(pgTap)?.[1]);
    const asserted = pgTap.match(/^select (?:ok|is|isnt|has_table)\(/gm)?.length ?? 0;
    expect(planned).toBe(asserted);
    expect(pgTap).toContain("foundation migration does not load products");
    expect(pgTap).toContain("catalog foundation exposes no delete policy");
    expect(pgTap).toContain("catalog flag remains default-off");
  });
});
