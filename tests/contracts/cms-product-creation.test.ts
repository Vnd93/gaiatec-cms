import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { productPromotionReceipt } from "../e2e/cms-product-creation";
import { comprehensiveProductPayload } from "../fixtures/product-payload";

const id = (n: number) => `90000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function fixture() {
  return {
    status: 200,
    environment: "staging" as const,
    request: {
      action: "promote",
      draftId: id(1),
      slug: "produto-qa",
      reason: "Cadastro sintético isolado",
      envelope: {
        schemaVersion: 1,
        commandId: id(2),
        correlationId: id(3),
        occurredAt: "2026-10-06T02:00:00.000Z",
        actorContext: { environment: "staging", siteKey: "main" },
        expectedVersion: 7,
      },
      payload: comprehensiveProductPayload(),
    },
    response: {
      schemaVersion: 1,
      commandId: id(2),
      correlationId: id(3),
      draftId: id(1),
      status: "promoted",
      itemId: id(4),
      lockVersion: 8,
      savedAt: "2026-10-06T02:00:01.000Z",
      replayed: false,
    },
  };
}

describe("isolated browser product promotion evidence", () => {
  it("requires a complete atomic promotion receipt bound to the request and environment", () => {
    expect(productPromotionReceipt(fixture())).toBe(id(4));
  });
  it.each([
    { status: "active" },
    { status: "draft" },
    { status: "discarded" },
    { replayed: true },
    { itemId: undefined },
    { itemId: "not-a-uuid" },
    { draftId: id(5) },
    { commandId: id(5) },
    { correlationId: id(5) },
    { lockVersion: 7 },
    { lockVersion: 9 },
    { savedAt: "invalid" },
  ])("rejects an unrelated or incomplete receipt %j", (patch) => {
    const input = fixture();
    expect(() => productPromotionReceipt({ ...input, response: { ...input.response, ...patch } })).toThrow(
      "CMS_PRODUCT_PROMOTION_RECEIPT_INVALID",
    );
  });
  it.each([302, 401, 403, 409, 422, 500])("rejects HTTP %i regardless of the response body", (status) => {
    expect(() => productPromotionReceipt({ ...fixture(), status })).toThrow(
      "CMS_PRODUCT_PROMOTION_RECEIPT_INVALID",
    );
  });
  it("rejects a different environment, missing CAS or incomplete product", () => {
    const input = fixture();
    for (const request of [
      {
        ...input.request,
        envelope: { ...input.request.envelope, actorContext: { environment: "production", siteKey: "main" } },
      },
      { ...input.request, envelope: { ...input.request.envelope, expectedVersion: undefined } },
      { ...input.request, payload: { ...input.request.payload, provenance: [] } },
      { ...input.request, action: "create" },
    ])
      expect(() => productPromotionReceipt({ ...input, request })).toThrow(
        "CMS_PRODUCT_PROMOTION_RECEIPT_INVALID",
      );
  });
  it("reports only a fixed diagnostic, never raw response content", () => {
    expect(() =>
      productPromotionReceipt({ ...fixture(), response: { error: "SENSITIVE_SENTINEL" } }),
    ).toThrowError(/^CMS_PRODUCT_PROMOTION_RECEIPT_INVALID$/);
  });
  it("restores server work and uses the promotion path for both product creations", () => {
    const helper = readFileSync("tests/e2e/cms-product-creation.ts", "utf8");
    const coverage = readFileSync("tests/e2e/cms-final-coverage.spec.ts", "utf8");
    expect(helper).toContain('name: "Restaurar versão do servidor"');
    expect(helper).not.toContain("Manter versão deste navegador");
    expect(helper).toContain('url.pathname !== "/functions/v1/cms-drafts-v2"');
    expect(helper).toContain("url.origin !== expectedApiOrigin");
    expect(helper).toContain('postDataJSON()?.action === "promote"');
    expect(helper).toContain('not.toContainText("Alterações não salvas"');
    expect(coverage.match(/await clickSyntheticProductCreation\(/g)).toHaveLength(2);
    expect(coverage).toMatch(
      /async function fillSyntheticProductForCreate[^]*?await prepareSyntheticProductDraft\(page\)/,
    );
  });
});
