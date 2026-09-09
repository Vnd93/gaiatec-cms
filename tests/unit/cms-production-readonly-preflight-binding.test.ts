import { describe, expect, it } from "vitest";

import { requireCanonicalFrontendCandidate } from "../e2e/cms-production-readonly-preflight-binding";

describe("production readonly preflight canonical frontend binding", () => {
  const candidateSha = "a".repeat(40);

  it("accepts the exact candidate already promoted by the frontend bridge", () => {
    expect(requireCanonicalFrontendCandidate(candidateSha, candidateSha)).toBe(candidateSha);
  });

  it("rejects a predecessor, malformed value, or different candidate", () => {
    for (const canonicalFrontendSha of ["b".repeat(40), "not-a-sha", ""]) {
      expect(() => requireCanonicalFrontendCandidate(candidateSha, canonicalFrontendSha)).toThrow(
        "QA_CMS_PRODUCTION_READONLY_PREFLIGHT_CANONICAL_BRIDGE_MISMATCH",
      );
    }
    expect(() => requireCanonicalFrontendCandidate("not-a-sha", candidateSha)).toThrow(
      "QA_CMS_PRODUCTION_READONLY_PREFLIGHT_CANONICAL_BRIDGE_MISMATCH",
    );
  });
});
