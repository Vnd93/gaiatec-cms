import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ capability: vi.fn(), read: vi.fn() }));
vi.mock("@/public/catalog-api", () => ({
  getCatalogCapability: mock.capability,
  getPublishedCatalogEditorialTerm: mock.read,
}));
import CmsEditorialTermPage from "@/public/pages/CmsEditorialTermPage";
beforeEach(() => {
  mock.capability.mockReset().mockResolvedValue({ key: "ev2.catalog_v1", enabled: true, source: "override" });
  mock.read.mockReset();
  vi.stubEnv("VITE_CATALOG_V1", "true");
});
afterEach(() => vi.unstubAllEnvs());
describe("real route parameter contract (component test, not UAT)", () => {
  it.each([
    ["tecnologia", "technology"],
    ["industria", "industry"],
    ["aplicacao", "application"],
  ])("loads %s with the fixed route segment", async (segment, kind) => {
    const path = `/catalogo/${segment}/fixture`;
    mock.read.mockResolvedValue({
      kind,
      slug: "fixture",
      path,
      title: "Editorial fixture",
      summary: "Summary",
      blocks: [{ heading: "Section", paragraphs: ["Paragraph"] }],
      products: [{ title: "Published product", summary: "Only snapshot", path: "/catalogo/itens/product" }],
      seo: { canonicalPath: path, indexable: false },
    });
    render(
      <RouterProvider
        router={createMemoryRouter(
          [{ path: `/catalogo/${segment}/:slug`, element: <CmsEditorialTermPage /> }],
          { initialEntries: [path] },
        )}
      />,
    );
    await screen.findByRole("heading", { name: "Editorial fixture" });
    expect(mock.read).toHaveBeenCalledWith(kind, "fixture");
    expect(screen.getByRole("link", { name: "Published product" })).toHaveAttribute(
      "href",
      "/catalogo/itens/product",
    );
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute(
      "content",
      expect.stringContaining("noindex"),
    );
  });
  it("does not fetch editorial content when the build flag remains off", async () => {
    vi.stubEnv("VITE_CATALOG_V1", "false");
    render(
      <RouterProvider
        router={createMemoryRouter(
          [{ path: "/catalogo/tecnologia/:slug", element: <CmsEditorialTermPage /> }],
          { initialEntries: ["/catalogo/tecnologia/fixture"] },
        )}
      />,
    );
    await screen.findByRole("heading", { name: "Conteúdo não disponível" });
    expect(mock.read).not.toHaveBeenCalled();
  });
});
