import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import CmsProductsPage from "../../src/public/pages/CmsProductsPage";
import { comprehensiveProductPayload } from "../fixtures/product-payload";

const catalogMocks = vi.hoisted(() => ({
  getPublishedProducts: vi.fn(),
}));

vi.mock("../../src/public/catalog-api", () => ({
  getPublishedProducts: catalogMocks.getPublishedProducts,
}));

function collection() {
  const payload = comprehensiveProductPayload();
  return {
    items: [
      {
        item_id: "20000000-0000-4000-8000-000000000001",
        revision_id: "20000000-0000-4000-8000-000000000002",
        slug: "produto-completo-de-teste",
        payload,
        seo: payload.seo,
        content_version: 1,
        etag: "produto-completo-v1",
        published_at: "2026-08-29T12:00:00.000Z",
        media_urls: { "medium.webp": "https://media.example.test/product.webp" },
      },
    ],
    total: 1,
    facets: {
      segment: [payload.classification.segment],
      category: [payload.classification.category],
      family: [payload.classification.family],
      technology: [payload.technology],
    },
    query: "",
  };
}

describe("CMS products page", () => {
  it("keeps the CMS collection connected to the redesigned filters and product card", async () => {
    catalogMocks.getPublishedProducts.mockResolvedValue(collection());
    const { container } = render(
      <MemoryRouter initialEntries={["/produtos"]}>
        <CmsProductsPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: /encontre o equipamento certo para sua aplicação/i }),
    ).toBeInTheDocument();
    expect(container.querySelector("main")).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Produto completo de teste" })).toBeVisible();
    expect(screen.getByText("1 produto encontrado")).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Categoria" })).toHaveValue("");

    fireEvent.change(screen.getByRole("combobox", { name: "Categoria" }), {
      target: { value: "Categoria" },
    });
    await waitFor(() =>
      expect(catalogMocks.getPublishedProducts).toHaveBeenLastCalledWith({ category: "Categoria" }),
    );
    expect(screen.getByRole("button", { name: /categoria: categoria/i })).toBeVisible();
  });

  it("submits search terms and exposes an accessible comparison tray", async () => {
    catalogMocks.getPublishedProducts.mockResolvedValue(collection());
    render(
      <MemoryRouter initialEntries={["/produtos"]}>
        <CmsProductsPage />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Produto completo de teste" });
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar no catálogo" }), {
      target: { value: "MODELO-COMERCIAL" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^buscar$/i }));
    await waitFor(() =>
      expect(catalogMocks.getPublishedProducts).toHaveBeenLastCalledWith({ q: "MODELO-COMERCIAL" }),
    );

    fireEvent.click(screen.getByRole("button", { name: /adicionar produto completo de teste/i }));
    expect(screen.getByRole("complementary", { name: /produtos selecionados/i })).toBeVisible();
    expect(screen.getByText("1 de 4 selecionado")).toBeVisible();
    expect(screen.getByText(/selecione mais um produto/i)).toBeVisible();
  });
});
