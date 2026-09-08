import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0085_cms_public_relation_limit.sql", "utf8");
const edge = readFileSync("supabase/functions/cms-public/index.ts", "utf8");
const publicRelations = readFileSync("supabase/functions/_shared/cms-public-relations.ts", "utf8");
const pgTap = readFileSync("supabase/tests/rls_cms_public_relation_limit.test.sql", "utf8");

describe("public relation publication limit", () => {
  it("enforces an append-only database gate over the combined distinct relation graph", () => {
    for (const marker of [
      "cms_public_relation_ids_0085",
      "cms_public_relation_count_0085",
      "count(distinct relation_id)",
      "CMS_PUBLIC_RELATION_INVALID",
      "CMS_PUBLIC_RELATION_LIMIT_EXCEEDED",
      "cms_00_enforce_public_relation_limit_0085",
      "before insert or update of payload on public.cms_published_projection",
      "from public, anon, authenticated, service_role",
    ]) {
      expect(migration).toContain(marker);
    }
    expect(migration).toContain("p_payload -> 'relations'");
    expect(migration).toContain("v_block #> '{data,itemIds}'");
  });

  it("makes cms-public reject invalid or oversized data without truncating relations", () => {
    expect(edge).toContain("publicRelationIds(row.payload)");
    expect(edge).toContain("publicRelationIds(publicPayload)");
    expect(edge).toContain("uniqueIds.length > maximum");
    expect(publicRelations).toContain("target.size > PUBLIC_RELATION_LIMIT");
    expect(edge).toContain("CMS_PUBLIC_RELATION_INVALID");
    expect(edge).toContain("CMS_PUBLIC_RELATION_LIMIT_EXCEEDED");
    expect(edge).not.toContain(".slice(0, RELATED_ITEMS_LIMIT)");
    expect(edge).not.toContain("const RELATED_ITEMS_LIMIT = 500");
    const postsHandler = edge.slice(
      edge.indexOf('if (type === "posts")'),
      edge.indexOf('if (type === "post-detail")'),
    );
    expect(postsHandler).not.toContain("relationIdsFor");
    expect(postsHandler).not.toContain("loadProjectionRowsByIds");
  });

  it("covers the boundary, malformed candidates, deduplication and atomic residue in pgTAP", () => {
    for (const marker of [
      "exactly 500 aggregate distinct relations remain publishable",
      "the 501st aggregate relation is rejected atomically",
      "malformed general relation IDs fail closed",
      "malformed related-content candidates fail closed",
      "general and block relations are aggregated and deduplicated",
      "rejected projections leave no partial publication residue",
      "select * from finish()",
      "rollback;",
    ]) {
      expect(pgTap).toContain(marker);
    }
  });
});
