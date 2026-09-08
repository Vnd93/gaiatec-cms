import { describe, expect, it } from "vitest";
import { createCmsSemanticActionLedger } from "../e2e/cms-semantic-action-ledger";

describe("CMS semantic action evidence ledger", () => {
  it("binds a successful backend response to one exact surface, name and occurrence", () => {
    const ledger = createCmsSemanticActionLedger();
    ledger.record({
      surfaceId: "users",
      controlName: "  Salvar   papéis ",
      controlOccurrence: 1,
      action: "set_roles",
      scenarioId: "roles-roundtrip",
      backendStatus: "updated",
      httpStatus: 200,
    });
    expect(ledger.snapshot()).toEqual([
      expect.objectContaining({
        surfaceId: "users",
        controlName: "Salvar papéis",
        controlOccurrence: 1,
        controlContractKey: "users|salvar-papeis|1",
        handlerExecuted: true,
        evidenceKind: "backend-response",
        httpStatus: 200,
        status: "passed",
      }),
    ]);
  });

  it("merges repeated proof for the same control without creating ambiguous evidence", () => {
    const ledger = createCmsSemanticActionLedger();
    for (const [action, scenarioId] of [
      ["suspend", "suspend-cycle"],
      ["suspend", "final-state"],
    ] as const) {
      ledger.record({
        surfaceId: "users",
        controlName: "Suspender",
        action,
        scenarioId,
        backendStatus: "suspended",
        httpStatus: 200,
      });
    }
    expect(ledger.snapshot()).toMatchObject([
      { actions: ["suspend"], scenarioIds: ["final-state", "suspend-cycle"] },
    ]);
  });

  it("refuses negative, synthetic or otherwise non-success backend results", () => {
    const ledger = createCmsSemanticActionLedger();
    expect(() =>
      ledger.record({
        surfaceId: "users",
        controlName: "Suspender",
        action: "suspend",
        scenarioId: "negative",
        backendStatus: "forbidden",
        httpStatus: 403,
      }),
    ).toThrow(/QA_CMS_SEMANTIC_ACTION_EVIDENCE_INVALID/);
  });
});
