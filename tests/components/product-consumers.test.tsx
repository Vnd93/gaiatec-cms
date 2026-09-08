import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SUPABASE_URL } from "../../src/lib/supabase";
import { CmsProductRenderer } from "../../src/public/components/CmsProductRenderer";
import { comprehensiveProductPayload } from "../fixtures/product-payload";

describe("product field consumers", () => {
  it("renders the editorial preview without exposing restricted fields or governance internals", () => {
    const product = comprehensiveProductPayload();
    render(
      <CmsProductRenderer
        payload={product}
        preview
        mediaUrls={{
          "large.webp": "https://media.example.test/primary.webp",
          [`${product.media[1].assetId}:large.webp`]: "https://media.example.test/gallery.webp",
        }}
        documentUrls={{
          [product.documents[0].id]: "https://documents.example.test/public.pdf",
          [product.documents[1].id]: "https://documents.example.test/private.pdf",
        }}
      />,
    );
    for (const value of [
      "Marca Comercial",
      "MODELO-COMERCIAL",
      "Subcategoria",
      "Função do produto",
      "Diferencial único",
      "Variante B",
      "7891234567890",
      "Documento público",
      "Resumo da pré-visualização",
      "Informações restritas e registros de governança permanecem nas áreas autorizadas do CMS",
    ])
      expect(screen.getAllByText(new RegExp(value, "i")).length).toBeGreaterThan(0);

    for (const restrictedValue of [
      "REF-OEM-01",
      "OEM a confirmar",
      "SKU-01-A",
      "90261029",
      "Documento privado",
      "sinônimo completo",
      "Autorização de teste",
      "Owner do portfólio",
      "official_manufacturer",
      "C:\\fontes\\public.pdf",
    ])
      expect(document.body).not.toHaveTextContent(restrictedValue);
    expect(document.body.textContent).not.toMatch(
      /SHA-256|visibilidade:|Proveniência completa|owner comercial/i,
    );
  });

  it("keeps executable URLs inert even when an API-bypassed draft reaches preview", () => {
    const product = comprehensiveProductPayload();
    const unsafe = product as unknown as {
      manufacturer: { name: string; officialUrl: unknown };
      documents: Array<Record<string, unknown>>;
      blocks: Array<Record<string, unknown>>;
    };
    unsafe.manufacturer.officialUrl = "javascript:alert(document.domain)";
    unsafe.documents[0].officialUrl = ["data:text/html,<script>alert(1)</script>"];
    unsafe.blocks = [
      {
        id: crypto.randomUUID(),
        type: "cta",
        data: { label: "CTA adulterado", href: "//attacker.example.test" },
      },
    ];

    render(
      <CmsProductRenderer
        payload={product}
        preview
        documentUrls={{
          [product.documents[0].id]: "http://127.0.0.1/private.pdf",
          [product.documents[1].id]: "javascript:alert(1)",
        }}
        mediaUrls={{
          [`${product.media[0].assetId}:large.webp`]:
            "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>",
        }}
        relatedItems={[
          { kind: "service", title: "Relação adulterada", path: "//attacker.example.test/coleta" },
        ]}
      />,
    );

    expect(screen.queryByRole("link", { name: product.manufacturer.name })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: product.documents[0].title })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "CTA adulterado" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Relação adulterada" })).not.toBeInTheDocument();
    expect(
      document.querySelector('[href^="javascript:"], [href^="data:"], [href^="//"], [href*="127.0.0.1"]'),
    ).toBeNull();
    expect(document.querySelector('img[src^="data:"]')).toBeNull();
  });

  it("preserva mídia e documento assinados pelo backend governado no preview privado", () => {
    const product = comprehensiveProductPayload();
    const token = "preview-signature-value";
    const supabaseOrigin = SUPABASE_URL.replace(/\/$/, "");
    render(
      <CmsProductRenderer
        payload={product}
        preview
        mediaUrls={{
          [`${product.media[0].assetId}:large.webp`]: `${supabaseOrigin}/storage/v1/object/sign/cms-media-private/preview.webp?token=${token}`,
        }}
        documentUrls={{
          [product.documents[0].id]:
            `${supabaseOrigin}/storage/v1/object/sign/cms-documents-private/preview.pdf?token=${token}`,
        }}
      />,
    );

    expect(screen.getByRole("img", { name: product.media[0].alt })).toBeVisible();
    expect(screen.getByRole("link", { name: new RegExp(product.documents[0].title) })).toHaveAttribute(
      "href",
      expect.stringContaining("/storage/v1/object/sign/cms-documents-private/"),
    );
  });
});
