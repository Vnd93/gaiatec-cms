import { describe, expect, it } from "vitest";

import { isCanonicalDocumentWriteFence } from "../../supabase/functions/_shared/cms-document-confirmation";

describe("canonical document confirmation refusal", () => {
  it.each(["PT409", "40001"])("recognizes the exact fence with %s during rollout", (code) => {
    expect(
      isCanonicalDocumentWriteFence({ code, message: "CMS_DOCUMENT_CANONICAL_WRITE_FENCE_ACTIVE" }),
    ).toBe(true);
  });

  it.each([
    null,
    { code: "40001", message: "could not serialize access due to concurrent update" },
    { code: "PT409", message: "CMS_DOCUMENT_LOCK_CONFLICT" },
    { code: "42501", message: "CMS_DOCUMENT_CANONICAL_WRITE_FENCE_ACTIVE" },
    { code: "PT409", message: "CMS_DOCUMENT_CANONICAL_WRITE_FENCE_ACTIVE_OTHER" },
    { code: "PT409", message: "prefix CMS_DOCUMENT_CANONICAL_WRITE_FENCE_ACTIVE" },
    { message: "CMS_DOCUMENT_CANONICAL_WRITE_FENCE_ACTIVE" },
  ])("never hides an unrelated refusal as scheduled cleanup: %j", (error) => {
    expect(isCanonicalDocumentWriteFence(error)).toBe(false);
  });
});
