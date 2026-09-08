import { describe, expect, it } from "vitest";
import {
  containsInternalProductValue,
  omitUnresolvedGovernedDocuments,
  projectPublicPayloadFields as sanitizePublicPayload,
  sanitizePublicPayload as sanitizeValidatedPublicPayload,
  sanitizePublicSeo,
} from "../../supabase/functions/_shared/cms-public-projection";
import { comprehensiveProductPayload } from "../fixtures/product-payload";

describe("public CMS projection", () => {
  it("removes hidden blocks and private document metadata before the response", () => {
    const publicDocumentId = "57000000-0000-4000-8000-000000000001";
    const source = {
      contentType: "product",
      title: "Conteúdo sintético",
      blocks: [
        { id: "visible", type: "rich_text", hidden: false, data: { text: "Público" } },
        { id: "internal", type: "rich_text", hidden: true, data: { text: "Interno" } },
      ],
      documents: [
        {
          id: publicDocumentId,
          kind: "manual",
          title: "Documento público",
          visibility: "public",
          storagePath: `cms-documents/${publicDocumentId}/manual.pdf`,
          sha256: "a".repeat(64),
          revision: "1",
          language: "pt-BR",
          rightsConfirmed: true,
        },
        {
          id: "57000000-0000-4000-8000-000000000002",
          kind: "manual",
          title: "Documento privado",
          visibility: "private",
          storagePath: "cms-documents/57000000-0000-4000-8000-000000000002/internal.pdf",
          sha256: "b".repeat(64),
          revision: "1",
          language: "pt-BR",
          rightsConfirmed: true,
        },
      ],
    };

    const result = sanitizePublicPayload(source);

    expect(result.blocks).toEqual([source.blocks[0]]);
    expect(result.documents).toEqual([
      {
        id: publicDocumentId,
        kind: "manual",
        title: "Documento público",
        revision: "1",
        language: "pt-BR",
        visibility: "public",
      },
    ]);
    expect(source.blocks).toHaveLength(2);
    expect(source.documents).toHaveLength(2);
  });

  it("omits an unresolved governed document instead of falling back to a legacy URL", () => {
    const governedDocumentId = "57000000-0000-4000-8000-000000000003";
    const source = {
      contentType: "product",
      documents: [
        {
          id: governedDocumentId,
          kind: "manual",
          title: "Manual governado",
          storagePath: `cms-documents/${governedDocumentId}/manual.pdf`,
          sha256: "a".repeat(64),
          revision: "1",
          language: "pt-BR",
          visibility: "public",
          rightsConfirmed: true,
        },
        {
          id: "57000000-0000-4000-8000-000000000004",
          kind: "manual",
          title: "Manual externo legado",
          officialUrl: "https://manufacturer.example.test/manual.pdf",
          sha256: "b".repeat(64),
          revision: "1",
          language: "pt-BR",
          visibility: "public",
          rightsConfirmed: true,
        },
      ],
    };
    const sanitized = sanitizePublicPayload(source);

    expect(omitUnresolvedGovernedDocuments(sanitized, source, {}).documents).toEqual([]);
    expect(
      omitUnresolvedGovernedDocuments(sanitized, source, {
        [governedDocumentId]: "https://signed.example.test/manual.pdf",
      }).documents.map((document: { id: string }) => document.id),
    ).toEqual([governedDocumentId]);
  });

  it("fails closed for oversized or duplicated public document collections", () => {
    const document = (id: string) => ({
      id,
      kind: "manual",
      title: "Manual governado",
      storagePath: `cms-documents/${id}/manual.pdf`,
      sha256: "b".repeat(64),
      revision: "1",
      language: "pt-BR",
      visibility: "public",
      rightsConfirmed: true,
    });
    const duplicateId = "57000000-0000-4000-8000-000000000006";
    expect(
      sanitizePublicPayload({
        contentType: "product",
        documents: [document(duplicateId), document(duplicateId)],
      }).documents,
    ).toEqual([]);
    expect(
      sanitizePublicPayload({
        contentType: "product",
        documents: Array.from({ length: 31 }, (_, index) =>
          document(`57000000-0000-4000-8000-${String(index + 100).padStart(12, "0")}`),
        ),
      }).documents,
    ).toEqual([]);
  });

  it("removes executable or credentialed official URLs from untrusted projections", () => {
    for (const officialUrl of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "blob:https://gaiatecsistemas.com.br/fixture",
      "http://manufacturer.example.test/manual.pdf",
      "https://user:secret@manufacturer.example.test/manual.pdf",
      "https://localhost/manual.pdf",
      "https://127.0.0.1/manual.pdf",
      "https://192.168.10.20/manual.pdf",
      ["javascript:alert(1)"],
      { href: "javascript:alert(1)" },
    ]) {
      const result = sanitizePublicPayload({
        contentType: "product",
        fieldVisibility: { manufacturer: "public" },
        manufacturer: { name: "Fabricante", slug: "fabricante", officialUrl },
        documents: [
          {
            id: "57000000-0000-4000-8000-000000000005",
            kind: "manual",
            title: "Documento externo",
            visibility: "public",
            officialUrl,
            sha256: "c".repeat(64),
            revision: "1",
            language: "pt-BR",
            rightsConfirmed: true,
          },
        ],
      });
      expect(result.manufacturer).toEqual({ name: "Fabricante", slug: "fabricante" });
      expect(result.documents).toEqual([]);
    }
  });

  it("drops a malformed legacy external document instead of exposing it to the renderer", () => {
    const result = sanitizePublicPayload({
      contentType: "product",
      documents: [
        {
          id: "57000000-0000-4000-8000-000000000099",
          kind: "manual",
          title: { unexpected: "object" },
          officialUrl: "https://manufacturer.example.test/manual.pdf",
          sha256: "d".repeat(64),
          revision: "1",
          language: "pt-BR",
          visibility: "public",
          rightsConfirmed: true,
        },
      ],
    });
    expect(result.documents).toEqual([]);
  });

  it("keeps internal product fields out of the public payload by default", () => {
    const result = sanitizePublicPayload({
      contentType: "product",
      title: "Produto sintético",
      brand: { name: "GATFLOW", slug: "gatflow" },
      manufacturer: { name: "OEM interno", slug: "oem-interno", officialUrl: "https://oem.test" },
      productLine: { name: "Linha", slug: "linha" },
      models: [
        {
          id: "modelo",
          model: "MODELO-COMERCIAL",
          manufacturerReference: "REF-OEM",
          sku: "SKU-INTERNO",
          variants: [{ id: "variante", name: "Padrão", code: "CODIGO-INTERNO", sku: "SKU-VARIANTE" }],
        },
      ],
      externalIdentifiers: [
        {
          id: "identificador-publico",
          owner: { type: "product" },
          kind: "gtin",
          value: "7891234567890",
          issuer: "GS1",
          visibility: "public",
          sourceType: "manual",
          sourceRef: "fonte que não deve ser pública",
        },
        {
          id: "identificador-interno",
          owner: { type: "product" },
          kind: "ncm",
          value: "90261029",
          visibility: "internal",
          sourceType: "manual",
        },
        {
          id: "identificador-modelo-publico",
          owner: { type: "model", id: "modelo" },
          kind: "erp",
          value: "ERP-PUBLICO",
          visibility: "public",
          sourceType: "manual",
        },
      ],
      blocks: [{ id: "texto", type: "rich_text", data: { text: "Referência REF-OEM" } }],
      documents: [
        {
          id: "manual-interno",
          title: "Manual REF-OEM",
          visibility: "public",
          storagePath: "documentos/REF-OEM.pdf",
        },
      ],
      search: { synonyms: ["Produto REF-OEM", "medidor público"], keywords: ["CODIGO-INTERNO"] },
      provenance: [{ sourcePath: "C:/interno/REF-OEM.pdf" }],
      approval: { technicalReviewer: "Responsável interno" },
      fieldVisibility: {
        brand: "public",
        manufacturer: "internal",
        productLine: "public",
        commercialModel: "public",
        manufacturerReference: "internal",
        sku: "internal",
      },
    });

    expect(result.brand).toEqual({ name: "GATFLOW", slug: "gatflow" });
    expect(result.productLine).toEqual({ name: "Linha", slug: "linha" });
    expect(result.manufacturer).toBeUndefined();
    expect(result.models).toEqual([
      { id: "modelo", model: "MODELO-COMERCIAL", variants: [{ id: "variante", name: "Padrão" }] },
    ]);
    expect(result.externalIdentifiers).toEqual([
      { kind: "gtin", value: "7891234567890", issuer: "GS1", ownerType: "product" },
      {
        kind: "erp",
        value: "ERP-PUBLICO",
        ownerType: "model",
        ownerLabel: "MODELO-COMERCIAL",
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("identificador-publico");
    expect(JSON.stringify(result)).not.toContain("90261029");
    expect(JSON.stringify(result)).not.toContain("fonte que não deve ser pública");
    expect(result.blocks[0].data.text).toBe("Referência informação interna");
    expect(result.search).toBeUndefined();
    expect(result.documents).toEqual([]);
    expect(result.provenance).toBeUndefined();
    expect(result.approval).toBeUndefined();
    expect(result.fieldVisibility).toBeUndefined();

    const searchable = sanitizePublicPayload(
      {
        contentType: "product",
        manufacturer: { name: "OEM interno", slug: "oem-interno" },
        models: [{ manufacturerReference: "REF-OEM", sku: "SKU-INTERNO", variants: [] }],
        search: { synonyms: ["Produto REF-OEM", "medidor público"], keywords: ["SKU-INTERNO"] },
      },
      { includeSearchMetadata: true },
    );
    expect(searchable.search).toEqual({ synonyms: ["medidor público"], keywords: [] });
    expect(sanitizePublicSeo({ title: "Produto REF-OEM" }, sourceProduct())).toEqual({
      title: "Produto informação interna",
    });
    expect(containsInternalProductValue("documentos/REF-OEM.pdf", sourceProduct())).toBe(true);
    expect(containsInternalProductValue("documentos/manual-publico.pdf", sourceProduct())).toBe(false);
  });

  it("publishes only explicitly homologated specification fields from a strict allowlist", () => {
    const result = sanitizePublicPayload({
      contentType: "product",
      fieldVisibility: { specifications: "public" },
      models: [
        {
          id: "58000000-0000-4000-8000-000000000203",
          model: "GX-100",
          manufacturerReference: "REF-INTERNA",
          sku: "SKU-INTERNO",
          status: "active",
          variants: [],
        },
      ],
      specifications: [
        {
          id: "57000000-0000-4000-8000-000000000201",
          key: "faixa-medicao",
          label: "Faixa de medição",
          type: "number",
          value: 100,
          unit: "bar",
          required: true,
          filterable: true,
          comparable: true,
          searchable: true,
          definitionId: "57000000-0000-4000-8000-000000000202",
          scope: "model",
          ownerId: "58000000-0000-4000-8000-000000000203",
          sourceType: "legacy",
          sourceRef: "C:\\segredo\\fonte.xlsx",
          confidence: 0.2,
          homologated: true,
        },
        {
          id: "57000000-0000-4000-8000-000000000204",
          key: "sem-homologacao",
          label: "Sem homologação explícita",
          type: "text",
          value: "não publicar",
          required: false,
          filterable: false,
          comparable: false,
          searchable: false,
        },
      ],
    });

    expect(result.specifications).toEqual([
      {
        key: "faixa-medicao",
        label: "Faixa de medição",
        type: "number",
        value: 100,
        unit: "bar",
        scope: "model",
        ownerLabel: "GX-100",
        required: true,
        filterable: true,
        comparable: true,
        searchable: true,
      },
    ]);
    expect(JSON.stringify(result)).not.toMatch(
      /definitionId|ownerId|sourceType|sourceRef|confidence|homologated|57000000|segredo/i,
    );
  });

  it("disambiguates equal variant names without exposing their internal owners", () => {
    const model = (modelId: string, variantId: string, modelName: string) => ({
      id: modelId,
      model: modelName,
      manufacturerReference: `REF-${modelName}`,
      sku: `SKU-${modelName}`,
      status: "active",
      variants: [{ id: variantId, name: "DN50", code: `COD-${modelName}`, order: 0 }],
    });
    const specification = (id: string, ownerId: string, value: number) => ({
      id,
      key: "faixa",
      label: "Faixa",
      type: "number",
      value,
      required: true,
      filterable: true,
      comparable: true,
      searchable: true,
      scope: "variant",
      ownerId,
      sourceType: "manual",
      confidence: 1,
      homologated: true,
    });
    const result = sanitizePublicPayload({
      contentType: "product",
      fieldVisibility: { commercialModel: "internal", specifications: "public" },
      models: [
        model("59000000-0000-4000-8000-000000000001", "59000000-0000-4000-8000-000000000011", "A"),
        model("59000000-0000-4000-8000-000000000002", "59000000-0000-4000-8000-000000000012", "B"),
      ],
      specifications: [
        specification("59000000-0000-4000-8000-000000000021", "59000000-0000-4000-8000-000000000011", 10),
        specification("59000000-0000-4000-8000-000000000022", "59000000-0000-4000-8000-000000000012", 20),
      ],
    });

    expect(result.specifications.map((entry: { ownerLabel: string }) => entry.ownerLabel)).toEqual([
      "Modelo 1 · Variante 1: DN50",
      "Modelo 2 · Variante 1: DN50",
    ]);
    expect(JSON.stringify(result.specifications)).not.toContain("59000000");
  });

  it("disambiguates homonymous variants within the same model", () => {
    const firstVariantId = "59100000-0000-4000-8000-000000000011";
    const secondVariantId = "59100000-0000-4000-8000-000000000012";
    const specification = (id: string, ownerId: string, value: number) => ({
      id,
      key: "faixa",
      label: "Faixa",
      type: "number",
      value,
      required: true,
      filterable: true,
      comparable: true,
      searchable: true,
      scope: "variant",
      ownerId,
      sourceType: "manual",
      confidence: 1,
      homologated: true,
    });
    const result = sanitizePublicPayload({
      contentType: "product",
      fieldVisibility: { commercialModel: "internal", specifications: "public" },
      models: [
        {
          id: "59100000-0000-4000-8000-000000000001",
          model: "A",
          manufacturerReference: "REF-A",
          sku: "SKU-A",
          status: "active",
          variants: [
            { id: firstVariantId, name: "DN50", code: "COD-1", order: 0 },
            { id: secondVariantId, name: "DN50", code: "COD-2", order: 1 },
          ],
        },
      ],
      specifications: [
        specification("59100000-0000-4000-8000-000000000021", firstVariantId, 10),
        specification("59100000-0000-4000-8000-000000000022", secondVariantId, 20),
      ],
    });

    expect(result.specifications.map((entry: { ownerLabel: string }) => entry.ownerLabel)).toEqual([
      "Modelo 1 · Variante 1: DN50",
      "Modelo 1 · Variante 2: DN50",
    ]);
    expect(new Set(result.specifications.map((entry: { ownerLabel: string }) => entry.ownerLabel)).size).toBe(
      2,
    );
    expect(JSON.stringify(result.specifications)).not.toContain("59100000");
  });

  it("projects only visible controlled labels and never stable internal IDs", () => {
    const result = sanitizePublicPayload({
      contentType: "product",
      controlledClassification: {
        productCategory: {
          id: crypto.randomUUID(),
          slug: "instrumentos-medicao",
          label: "Instrumentos de Medição",
          publicVisible: true,
        },
        applicationMagnitude: {
          id: crypto.randomUUID(),
          slug: "medicao-vazao",
          label: "Medição de Vazão",
          publicVisible: true,
        },
        technology: {
          id: crypto.randomUUID(),
          slug: "ultrassonico",
          label: "Ultrassônico",
          publicVisible: false,
        },
        installationOperation: {
          id: crypto.randomUUID(),
          slug: "clamp-on",
          label: "Clamp-On",
          publicVisible: true,
        },
        monitoredElement: {
          id: crypto.randomUUID(),
          slug: "liquidos",
          label: "Líquidos",
          publicVisible: true,
        },
      },
      fieldVisibility: { classification: "public", technology: "public" },
    });

    expect(result.controlledClassification).toEqual({
      productCategory: { slug: "instrumentos-medicao", label: "Instrumentos de Medição" },
      applicationMagnitude: { slug: "medicao-vazao", label: "Medição de Vazão" },
      installationOperation: { slug: "clamp-on", label: "Clamp-On" },
      monitoredElement: { slug: "liquidos", label: "Líquidos" },
    });
    expect(JSON.stringify(result)).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27,}/);
    expect(JSON.stringify(result)).not.toContain("publicVisible");
  });

  it.each([
    ["product", { brand: { name: "GAIATEC", slug: "gaiatec" } }],
    ["service", { scope: "Escopo público" }],
    ["industry", { marketName: "Mercado público" }],
    ["application", { process: "Processo público" }],
    ["solution", { approach: "Abordagem pública" }],
    ["post", { excerpt: "Resumo público" }],
    ["page", { route: { path: "/pagina-publica" } }],
    ["homepage", { route: { path: "/" } }],
    ["navigation", { items: [{ id: "menu-publico", label: "Menu público" }] }],
    ["site_settings", { company: { name: "GAIATEC" } }],
    ["placement", { placements: [{ id: "destaque-publico", enabled: true }] }],
    ["campaign", { campaignKind: "institutional" }],
  ] as const)("uses a fail-closed public allowlist for %s", (contentType, publicFields) => {
    const sentinel = `INTERNAL-SENTINEL-${contentType}`;
    const result = sanitizePublicPayload({
      schemaVersion: 1,
      consumerId: `cms.${contentType}.v1`,
      contentType,
      title: "Título público",
      ...publicFields,
      provenance: [
        {
          sourcePath: sentinel,
          sourceSha256: sentinel,
          authorizationReference: sentinel,
          commercialOwner: sentinel,
          technicalOwner: sentinel,
        },
      ],
      approval: {
        businessOwner: sentinel,
        technicalReviewer: sentinel,
        editorialReviewer: sentinel,
      },
      governanceState: sentinel,
      pilotState: sentinel,
      fieldVisibility: { internalOnly: sentinel },
      search: { synonyms: [sentinel], keywords: [sentinel] },
      visual: { branchId: sentinel, documentHash: sentinel },
      storagePath: sentinel,
      sha256: sentinel,
      owner: sentinel,
      internalOnly: sentinel,
    });

    expect(result.contentType).toBe(contentType);
    expect(result.title).toBe("Título público");
    expect(JSON.stringify(result)).not.toContain(sentinel);
    expect(result).not.toHaveProperty("provenance");
    expect(result).not.toHaveProperty("approval");
    expect(result).not.toHaveProperty("governanceState");
    expect(result).not.toHaveProperty("pilotState");
    expect(result).not.toHaveProperty("fieldVisibility");
    expect(result).not.toHaveProperty("search");
    expect(result).not.toHaveProperty("visual");
    expect(result).not.toHaveProperty("storagePath");
    expect(result).not.toHaveProperty("sha256");
    expect(result).not.toHaveProperty("owner");
    expect(result).not.toHaveProperty("internalOnly");
    for (const [field, value] of Object.entries(publicFields)) expect(result[field]).toEqual(value);
  });

  it("rejects payloads without a recognized public content type", () => {
    expect(sanitizePublicPayload({ title: "Não classificado", secret: "internal" })).toEqual({});
    expect(sanitizePublicPayload({ contentType: "unknown", title: "Não classificado" })).toEqual({});
  });

  it("validates the complete canonical contract and preserves legacy products without external documents", () => {
    const product = comprehensiveProductPayload();
    const externalDocument = {
      ...product.documents[0],
      storagePath: undefined,
      officialUrl: "https://manufacturer.example.test/manual.pdf",
    };
    const legacy = {
      ...product,
      documents: [externalDocument, product.documents[1]],
    };
    const result = sanitizeValidatedPublicPayload(legacy);

    expect(result.title).toBe(product.title);
    expect(result.documents).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("manufacturer.example.test/manual.pdf");
    expect(sanitizeValidatedPublicPayload({ ...product, models: { malformed: true } })).toEqual({});
  });
});

function sourceProduct() {
  return {
    contentType: "product",
    manufacturer: { name: "OEM interno", slug: "oem-interno" },
    models: [{ manufacturerReference: "REF-OEM", sku: "SKU-INTERNO", variants: [] }],
  };
}
