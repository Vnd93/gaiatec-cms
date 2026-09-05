import { describe, expect, it } from "vitest";
import { buildTopLevelDraftPatches, progressiveDraftRetryDelay } from "@/admin/progressive-draft-sync";

describe("progressive draft sync model", () => {
  it("creates deterministic field patches without resending unchanged fields", () => {
    expect(
      buildTopLevelDraftPatches(
        { title: "Anterior", unchanged: [1, 2], removeMe: true },
        { title: "Atual", unchanged: [1, 2], summary: "Novo" },
      ),
    ).toEqual([
      { operation: "remove", path: ["removeMe"] },
      { operation: "set", path: ["summary"], value: "Novo" },
      { operation: "set", path: ["title"], value: "Atual" },
    ]);
  });

  it("uses capped exponential retry without a request storm", () => {
    expect([0, 1, 2, 5, 20].map(progressiveDraftRetryDelay)).toEqual([1_000, 2_000, 4_000, 30_000, 30_000]);
  });
});
