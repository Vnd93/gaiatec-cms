import { describe, expect, it } from "vitest";
import { CmsContentPayloadSchema } from "../../src/shared/contracts/cms-content";

const validProduct = {
  schemaVersion: 1,
  consumerId: "cms.catalog-product.v1",
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
  pilotState: "synthetic_test",
  brand: { name: "Marca sintética", slug: "marca-sintetica" },
  manufacturer: {
    name: "Fabricante sintetico",
    slug: "fabricante-sintetico",
    officialUrl: "https://manufacturer.example.test",
  },
  productLine: { name: "Linha sintetica", slug: "linha-sintetica" },
  classification: {
    segment: "Segmento sintetico",
    category: "Categoria sintetica",
    family: "Familia sintetica",
  },
  commercial: {
    shortDescription: "Descrição curta sintética.",
    valueProposition: "Proposta sintética.",
    benefits: ["Benefício sintético"],
    differentiators: [],
  },
  function: "Validar o contrato runtime",
  technology: "Tecnologia sintetica",
  models: [
    {
      id: "10000000-0000-4000-8000-000000000001",
      model: "Modelo sintetico",
      manufacturerReference: "REF-SINTETICA",
      sku: "SKU-SINTETICO",
      status: "active",
      variants: [
        {
          id: "10000000-0000-4000-8000-000000000002",
          name: "Variante sintética",
          code: "VAR-SINT",
          order: 0,
        },
      ],
    },
  ],
  specifications: [
    {
      id: "10000000-0000-4000-8000-000000000003",
      key: "faixa",
      label: "Faixa",
      type: "number",
      value: 100,
      unit: "un",
      required: true,
      filterable: true,
      comparable: true,
      searchable: true,
    },
  ],
  media: [],
  documents: [],
  relations: { productIds: [], applicationIds: [], sectorIds: [], serviceIds: [] },
  search: { synonyms: ["termo sintético"], keywords: ["fixture"] },
  redirects: [],
  approval: {
    portfolioOwner: "Owner sintético",
    technicalReviewer: "Revisor sintético",
    commercialReviewer: "Revisor sintético",
    editorialReviewer: "Revisor sintético",
  },
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

  it("blocks indexing before portfolio homologation", () => {
    const invalid = structuredClone(validProduct);
    invalid.seo.indexable = true;
    expect(CmsContentPayloadSchema.safeParse(invalid).success).toBe(false);
  });
});
