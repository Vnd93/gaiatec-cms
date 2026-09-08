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

  it("accepts governed GTIN/NCM metadata and rejects invalid or orphaned identifiers", () => {
    const governed = {
      ...structuredClone(validProduct),
      externalIdentifiers: [
        {
          id: "10000000-0000-4000-8000-000000000010",
          owner: { type: "product" },
          kind: "gtin",
          value: "7891234567890",
          issuer: "GS1",
          visibility: "public",
          sourceType: "manual",
        },
        {
          id: "10000000-0000-4000-8000-000000000011",
          owner: { type: "model", id: validProduct.models[0].id },
          kind: "ncm",
          value: "90261029",
          visibility: "internal",
          sourceType: "manual",
        },
      ],
    };
    expect(CmsContentPayloadSchema.safeParse(governed).success).toBe(true);

    const invalidGtin = structuredClone(governed);
    invalidGtin.externalIdentifiers[0].value = "123";
    expect(CmsContentPayloadSchema.safeParse(invalidGtin).success).toBe(false);

    const orphaned = {
      ...structuredClone(governed),
      externalIdentifiers: governed.externalIdentifiers.map((identifier, index) =>
        index === 1
          ? {
              ...identifier,
              owner: { type: "model" as const, id: "10000000-0000-4000-8000-000000009999" },
            }
          : structuredClone(identifier),
      ),
    };
    expect(CmsContentPayloadSchema.safeParse(orphaned).success).toBe(false);
  });

  it("rejects duplicated product graph identities, codes and SKUs case-insensitively", () => {
    const duplicateModel = structuredClone(validProduct);
    duplicateModel.models.push({
      ...structuredClone(validProduct.models[0]),
      model: "Outro modelo",
      manufacturerReference: "OUTRA-REF",
      sku: "OUTRO-SKU",
      variants: [
        {
          ...structuredClone(validProduct.models[0].variants[0]),
          id: "10000000-0000-4000-8000-000000000099",
          code: "OUTRO-CODIGO",
        },
      ],
    });
    expect(CmsContentPayloadSchema.safeParse(duplicateModel).success).toBe(false);

    const duplicateVariant = structuredClone(validProduct);
    duplicateVariant.models[0].variants.push({
      ...structuredClone(validProduct.models[0].variants[0]),
      code: "OUTRO-CODIGO",
      order: 1,
    });
    expect(CmsContentPayloadSchema.safeParse(duplicateVariant).success).toBe(false);

    const duplicateVariantCode = structuredClone(validProduct);
    duplicateVariantCode.models[0].variants.push({
      id: "10000000-0000-4000-8000-000000000098",
      name: "Outra variante",
      code: validProduct.models[0].variants[0].code.toLocaleLowerCase("pt-BR"),
      order: 1,
    });
    expect(CmsContentPayloadSchema.safeParse(duplicateVariantCode).success).toBe(false);

    const duplicateSku = structuredClone(validProduct);
    (duplicateSku.models[0].variants as Array<Record<string, unknown>>)[0].sku =
      validProduct.models[0].sku.toLocaleLowerCase("pt-BR");
    expect(CmsContentPayloadSchema.safeParse(duplicateSku).success).toBe(false);

    const repeatedCodeAcrossModels = structuredClone(validProduct);
    repeatedCodeAcrossModels.models.push({
      id: "10000000-0000-4000-8000-000000000097",
      model: "Outro modelo",
      manufacturerReference: "OUTRA-REF",
      sku: "OUTRO-SKU",
      status: "active",
      variants: [
        {
          id: "10000000-0000-4000-8000-000000000096",
          name: "Variante do outro modelo",
          code: validProduct.models[0].variants[0].code.toLocaleLowerCase("pt-BR"),
          order: 0,
        },
      ],
    });
    expect(CmsContentPayloadSchema.safeParse(repeatedCodeAcrossModels).success).toBe(true);

    const repeatedScopedAttribute = {
      ...structuredClone(validProduct),
      specifications: [
        {
          ...structuredClone(validProduct.specifications[0]),
          id: "10000000-0000-4000-8000-000000000091",
          scope: "model" as const,
          ownerId: validProduct.models[0].id,
        },
        {
          ...structuredClone(validProduct.specifications[0]),
          id: "10000000-0000-4000-8000-000000000092",
          scope: "variant" as const,
          ownerId: validProduct.models[0].variants[0].id,
        },
      ],
    };
    expect(CmsContentPayloadSchema.safeParse(repeatedScopedAttribute).success).toBe(true);

    const implicitProductOwner = structuredClone(validProduct) as Record<string, unknown>;
    (implicitProductOwner.specifications as Array<Record<string, unknown>>)[0].ownerId =
      validProduct.models[0].id;
    expect(CmsContentPayloadSchema.safeParse(implicitProductOwner).success).toBe(false);
  });

  it("rejects technical values that disagree with their declared type and incomplete homologation", () => {
    const invalidValues: Array<[string, unknown]> = [
      ["text", 10],
      ["number", "dez"],
      ["boolean", "true"],
      ["enum", "IP65"],
      ["range", [0, 10]],
    ];
    for (const [type, value] of invalidValues) {
      const invalid = structuredClone(validProduct) as Record<string, unknown>;
      const specification = (invalid.specifications as Array<Record<string, unknown>>)[0];
      specification.type = type;
      specification.value = value;
      expect(CmsContentPayloadSchema.safeParse(invalid).success).toBe(false);
    }

    const incompleteHomologation = structuredClone(validProduct) as Record<string, unknown>;
    (incompleteHomologation.specifications as Array<Record<string, unknown>>)[0].homologated = true;
    expect(CmsContentPayloadSchema.safeParse(incompleteHomologation).success).toBe(false);

    const importedWithoutEvidence = structuredClone(validProduct) as Record<string, unknown>;
    (importedWithoutEvidence.specifications as Array<Record<string, unknown>>)[0].sourceType = "import";
    expect(CmsContentPayloadSchema.safeParse(importedWithoutEvidence).success).toBe(false);
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

  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "blob:https://gaiatecsistemas.com.br/fixture",
    "http://manufacturer.example.test/manual.pdf",
    "https://user:secret@manufacturer.example.test/manual.pdf",
    "https://localhost/manual.pdf",
    "https://127.0.0.1/manual.pdf",
    "https://192.168.10.20/manual.pdf",
  ])("rejects a non-official external URL: %s", (unsafeUrl) => {
    const manufacturer = structuredClone(validProduct);
    manufacturer.manufacturer.officialUrl = unsafeUrl;
    expect(CmsContentPayloadSchema.safeParse(manufacturer).success).toBe(false);

    const document = {
      ...structuredClone(validProduct),
      documents: [
        {
          id: "10000000-0000-4000-8000-000000000004",
          kind: "manual",
          title: "Manual externo",
          officialUrl: unsafeUrl,
          sha256: "b".repeat(64),
          revision: "1",
          language: "pt-BR",
          visibility: "public",
          rightsConfirmed: true,
        },
      ],
    };
    expect(CmsContentPayloadSchema.safeParse(document).success).toBe(false);
  });

  it("rejects a governed storage path whose filename is not a PDF", () => {
    const document = {
      ...structuredClone(validProduct),
      documents: [
        {
          id: "10000000-0000-4000-8000-000000000004",
          kind: "manual",
          title: "Arquivo enganoso",
          storagePath: "cms-documents/10000000-0000-4000-8000-000000000004/manual.exe",
          sha256: "b".repeat(64),
          revision: "1",
          language: "pt-BR",
          visibility: "public",
          rightsConfirmed: true,
        },
      ],
    };
    expect(CmsContentPayloadSchema.safeParse(document).success).toBe(false);
  });

  it("rejects an ambiguous document with both official and governed locations", () => {
    const document = {
      ...structuredClone(validProduct),
      documents: [
        {
          id: "10000000-0000-4000-8000-000000000004",
          kind: "manual",
          title: "Manual ambíguo",
          officialUrl: "https://manufacturer.example.test/manual.pdf",
          storagePath: "cms-documents/10000000-0000-4000-8000-000000000004/manual.pdf",
          sha256: "b".repeat(64),
          revision: "1",
          language: "pt-BR",
          visibility: "public",
          rightsConfirmed: true,
        },
      ],
    };
    expect(CmsContentPayloadSchema.safeParse(document).success).toBe(false);
  });

  it("rejects duplicated document identities and a governed path owned by another id", () => {
    const baseDocument = {
      id: "10000000-0000-4000-8000-000000000004",
      kind: "manual",
      title: "Manual governado",
      storagePath: "cms-documents/10000000-0000-4000-8000-000000000004/manual.pdf",
      sha256: "b".repeat(64),
      revision: "1",
      language: "pt-BR",
      visibility: "public",
      rightsConfirmed: true,
    };
    expect(
      CmsContentPayloadSchema.safeParse({
        ...structuredClone(validProduct),
        documents: [baseDocument, baseDocument],
      }).success,
    ).toBe(false);
    expect(
      CmsContentPayloadSchema.safeParse({
        ...structuredClone(validProduct),
        documents: [
          {
            ...baseDocument,
            storagePath: "cms-documents/10000000-0000-4000-8000-000000000099/manual.pdf",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("blocks indexing before portfolio homologation", () => {
    const invalid = structuredClone(validProduct);
    invalid.seo.indexable = true;
    expect(CmsContentPayloadSchema.safeParse(invalid).success).toBe(false);
  });
});
