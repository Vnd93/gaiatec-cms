import { describe, expect, it } from "vitest";
import { CmsContentPayloadSchema } from "../../src/shared/contracts/cms-content";

const validProduct = {
  schemaVersion: 1,
  consumerId: "cms.synthetic-product.v1",
  contentType: "product",
  title: "Produto sintetico de contrato",
  summary: "Registro somente em memoria para validar o schema.",
  blocks: [],
  seo: {
    title: "Produto sintetico",
    description: "Descricao sintetica usada exclusivamente pelo teste de contrato.",
    canonicalPath: "/produtos/produto-sintetico",
    indexable: false,
  },
  provenance: [
    {
      sourceKind: "official_manufacturer",
      sourceUrl: "https://manufacturer.example.test/datasheet.pdf",
      sourceSha256: "a".repeat(64),
      rightsConfirmed: true,
      commercialOwner: "Owner comercial sintetico",
      technicalOwner: "Owner tecnico sintetico",
      verifiedAt: "2026-08-28T18:00:00.000Z",
    },
  ],
  manufacturer: "Fabricante sintetico",
  family: "Familia sintetica",
  model: "Modelo sintetico",
  function: "Validar o contrato runtime",
  technology: "Tecnologia sintetica",
  specifications: [{ key: "faixa", label: "Faixa", value: 100, unit: "un" }],
  relatedItemIds: [],
};

describe("CMS editorial runtime contract", () => {
  it("accepts a source-backed non-indexable product draft", () => {
    expect(CmsContentPayloadSchema.parse(validProduct)).toMatchObject({ contentType: "product" });
  });

  it("rejects external content without official URL and hash", () => {
    const invalid = structuredClone(validProduct);
    delete (invalid.provenance[0] as Partial<(typeof validProduct.provenance)[number]>).sourceSha256;
    expect(CmsContentPayloadSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects content that claims unconfirmed rights", () => {
    const invalid = structuredClone(validProduct) as Record<string, unknown>;
    (invalid.provenance as Array<Record<string, unknown>>)[0].rightsConfirmed = false;
    expect(CmsContentPayloadSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects unknown legacy fields", () => {
    expect(CmsContentPayloadSchema.safeParse({ ...validProduct, legacyId: "old-123" }).success).toBe(false);
  });
});
