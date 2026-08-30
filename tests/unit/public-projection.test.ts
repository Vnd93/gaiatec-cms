import { describe, expect, it } from "vitest";
import {
  containsInternalProductValue,
  sanitizePublicPayload,
  sanitizePublicSeo,
} from "../../supabase/functions/_shared/cms-public-projection";

describe("public CMS projection", () => {
  it("removes hidden blocks and private document metadata before the response", () => {
    const source = {
      title: "Conteúdo sintético",
      blocks: [
        { id: "visible", type: "rich_text", hidden: false, data: { text: "Público" } },
        { id: "internal", type: "rich_text", hidden: true, data: { text: "Interno" } },
      ],
      documents: [
        {
          id: "public-document",
          title: "Documento público",
          visibility: "public",
          storagePath: "cms-documents/private.pdf",
          sha256: "a".repeat(64),
          rightsConfirmed: true,
        },
        {
          id: "private-document",
          title: "Documento privado",
          visibility: "private",
          storagePath: "cms-documents/internal.pdf",
          sha256: "b".repeat(64),
          rightsConfirmed: true,
        },
      ],
    };

    const result = sanitizePublicPayload(source);

    expect(result.blocks).toEqual([source.blocks[0]]);
    expect(result.documents).toEqual([
      { id: "public-document", title: "Documento público", visibility: "public" },
    ]);
    expect(source.blocks).toHaveLength(2);
    expect(source.documents).toHaveLength(2);
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
          variants: [{ id: "variante", name: "Padrão", code: "CODIGO-INTERNO" }],
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
});

function sourceProduct() {
  return {
    contentType: "product",
    manufacturer: { name: "OEM interno", slug: "oem-interno" },
    models: [{ manufacturerReference: "REF-OEM", sku: "SKU-INTERNO", variants: [] }],
  };
}
