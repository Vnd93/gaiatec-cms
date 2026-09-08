import { describe, expect, it } from "vitest";
import {
  buildProductPayload,
  describeProductValidationIssue,
  hydrateProductDraft,
} from "../../src/admin/product-editor-model";
import { CmsProductContentSchema } from "../../src/shared/contracts/cms-content";
import { comprehensiveProductPayload } from "../fixtures/product-payload";

describe("product editor full-field round-trip", () => {
  it("hydrates and rebuilds every contract field without silent loss", () => {
    const original = comprehensiveProductPayload();
    const draft = hydrateProductDraft(original, "produto-completo");
    const rebuilt = buildProductPayload(draft);
    expect(rebuilt.jsonErrors).toEqual([]);
    expect(CmsProductContentSchema.parse(rebuilt.payload)).toEqual(original);
  });

  it("reports governed JSON failures in the corresponding editor tab", () => {
    const draft = hydrateProductDraft(comprehensiveProductPayload(), "produto-completo");
    draft.specificationsJson = "{ inválido";
    const rebuilt = buildProductPayload(draft);
    expect(rebuilt.jsonErrors[0]).toMatchObject({ field: "specificationsJson", tab: "especificacoes" });
  });

  it("keeps the semantic models editor as the only authority for model identity", () => {
    const draft = hydrateProductDraft(comprehensiveProductPayload(), "produto-completo");
    const models = JSON.parse(draft.modelsJson);
    models[0] = { ...models[0], model: "GATFLOW-B", manufacturerReference: "KF700E" };
    draft.modelsJson = JSON.stringify(models);
    const rebuilt = CmsProductContentSchema.parse(buildProductPayload(draft).payload);
    expect(rebuilt.models[0]).toMatchObject({ model: "GATFLOW-B", manufacturerReference: "KF700E" });
  });

  it("explains an empty rich-text block using the visible editor field", () => {
    expect(
      describeProductValidationIssue({
        path: ["blocks", 0, "data", "text"],
        message: "Invalid input",
      }),
    ).toBe("Conteúdo comercial → Descrição completa: preencha este campo antes de salvar o rascunho.");
  });
});
