import { describe, expect, it } from "vitest";
import {
  flattenPublicSearchValues,
  publicBlockSearchValues,
} from "../../supabase/functions/_shared/cms-public-search";

describe("public CMS search text", () => {
  it("indexes nested public model, SKU, variant and specification values without object coercion", () => {
    const values = flattenPublicSearchValues({
      title: "Medidor sintético",
      models: [
        {
          model: "GX-900",
          manufacturerReference: "MPN-42",
          sku: "SKU-PUBLICO",
          variants: [{ name: "Alta pressão", code: "VAR-HP", sku: "SKU-VARIANTE" }],
        },
      ],
      specifications: [{ label: "Faixa", value: { min: 0, max: 250 }, unit: "bar" }],
    });
    const text = values.join(" ");

    expect(text).toContain("GX-900");
    expect(text).toContain("MPN-42");
    expect(text).toContain("SKU-PUBLICO");
    expect(text).toContain("VAR-HP");
    expect(text).toContain("SKU-VARIANTE");
    expect(text).toContain("250");
    expect(text).toContain("bar");
    expect(text).not.toContain("[object Object]");
  });

  it("indexes only semantic block text and ignores technical block or asset identities", () => {
    const blockId = "59000000-0000-4000-8000-000000000001";
    const assetId = "59000000-0000-4000-8000-000000000002";
    const values = publicBlockSearchValues([
      { id: blockId, type: "rich_text", data: { text: "Conteúdo técnico público" } },
      {
        id: blockId,
        type: "image",
        data: { assetId, alt: "Sensor instalado", caption: "Linha de processo" },
      },
      { id: blockId, type: "cta", data: { label: "Falar com especialista", href: "/contato" } },
      { id: blockId, type: "gallery", data: { assetIds: [assetId] } },
    ]).join(" ");

    expect(values).toContain("Conteúdo técnico público");
    expect(values).toContain("Sensor instalado");
    expect(values).toContain("Falar com especialista");
    expect(values).not.toContain(blockId);
    expect(values).not.toContain(assetId);
    expect(values).not.toContain("/contato");
  });
});
