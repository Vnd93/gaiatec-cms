import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CmsProductRenderer } from "../../src/public/components/CmsProductRenderer";
import { comprehensiveProductPayload } from "../fixtures/product-payload";

describe("product field consumers", () => {
  it("renders identification, commercial content, typed data, media, documents, relations and governance in preview", () => {
    const product = comprehensiveProductPayload();
    render(
      <CmsProductRenderer
        payload={product}
        preview
        mediaUrls={{
          "large.webp": "https://media.example.test/primary.webp",
          [`${product.media[1].assetId}:large.webp`]: "https://media.example.test/gallery.webp",
        }}
        documentUrls={{ [product.documents[1].id]: "https://documents.example.test/private.pdf" }}
      />,
    );
    for (const value of [
      "Marca Comercial",
      "MODELO-COMERCIAL",
      "REF-OEM-01",
      "OEM a confirmar",
      "Subcategoria",
      "Função do produto",
      "Diferencial único",
      "Variante B",
      "Documento privado",
      "sinônimo completo",
      "Autorização de teste",
      "Owner do portfólio",
    ])
      expect(screen.getAllByText(new RegExp(value, "i")).length).toBeGreaterThan(0);
  });
});
