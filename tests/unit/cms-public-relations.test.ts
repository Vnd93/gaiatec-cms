import { describe, expect, it } from "vitest";

import {
  PUBLIC_RELATION_LIMIT,
  publicRelationIds,
} from "../../supabase/functions/_shared/cms-public-relations";

const relationId = (index: number) => `85000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

describe("public relation aggregation", () => {
  it("combines and deduplicates general and block relations without changing order", () => {
    expect(
      publicRelationIds({
        relations: { productIds: [relationId(1), relationId(2)] },
        blocks: [
          {
            type: "related_content",
            data: { itemIds: [relationId(2).toUpperCase(), relationId(3)] },
          },
        ],
      }),
    ).toEqual([relationId(1), relationId(2), relationId(3)]);
  });

  it("accepts exactly 500 distinct relations and rejects the 501st", () => {
    const exact = Array.from({ length: PUBLIC_RELATION_LIMIT }, (_, index) => relationId(index + 1));
    expect(publicRelationIds({ relations: { productIds: exact } })).toHaveLength(500);
    expect(() => publicRelationIds({ relations: { productIds: [...exact, relationId(501)] } })).toThrow(
      "CMS_PUBLIC_RELATION_LIMIT_EXCEEDED",
    );
  });

  it.each([
    { relations: [] },
    { relations: { productIds: "not-an-array" } },
    { relations: { productIds: ["not-a-uuid"] } },
    { blocks: "not-an-array" },
    { blocks: [{ type: "related_content", data: { itemIds: "not-an-array" } }] },
  ])("rejects malformed relation candidates instead of filtering them: %#", (payload) => {
    expect(() => publicRelationIds(payload)).toThrow("CMS_PUBLIC_RELATION_INVALID");
  });
});
