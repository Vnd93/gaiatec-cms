import { render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MANAGED_PAGE_TEMPLATES, PAGE_BUILDER_BLOCK_TYPES } from "@/admin/page-builder-model";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: mocks.from },
}));

vi.mock("@/admin/auth/AdminAuthContext", () => ({
  useAdminAuth: () => ({
    profile: {
      roles: ["editor"],
      permissions: ["cms:pages.read", "cms:pages.edit"],
      ev2Capabilities: undefined,
    },
  }),
}));

import AdminPagesPage from "@/admin/pages/AdminPagesPage";

const pages = [
  {
    id: "page-alpha",
    slug: "alfa",
    content_type: "page",
    workflow_status: "draft",
    updated_at: "2026-09-06T12:00:00.000Z",
    cms_content_drafts: {
      payload: {
        title: "Página Alfa",
        route: { path: "/alfa" },
        blocks: [{ type: "hero" }, { type: "hero" }, { type: "faq" }, { type: "image" }],
      },
    },
  },
  {
    id: "page-beta",
    slug: "beta",
    content_type: "page",
    workflow_status: "published",
    updated_at: "2026-09-06T13:00:00.000Z",
    cms_content_drafts: {
      payload: {
        title: "Página Beta",
        route: { path: "/beta" },
        blocks: [{ type: "hero" }, { type: "related_content" }],
      },
    },
  },
];

function createRequest() {
  const result = { data: pages, error: null };
  const request: Record<string, ReturnType<typeof vi.fn>> & {
    then?: Promise<typeof result>["then"];
  } = {};
  for (const method of ["select", "in", "order", "eq"]) request[method] = vi.fn(() => request);
  request.then = (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected);
  return request;
}

function renderPage(path: string) {
  const router = createMemoryRouter([{ path: "/admin/paginas", element: <AdminPagesPage /> }], {
    initialEntries: [path],
  });
  render(<RouterProvider router={router} />);
}

describe("integridade do catálogo de páginas", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.from.mockImplementation(() => createRequest());
  });

  it("remove o tema sem persistência e deriva os modelos do catálogo canônico", async () => {
    renderPage("/admin/paginas?tab=modelos");

    await waitFor(() => expect(mocks.from).toHaveBeenCalledWith("cms_content_items"));
    expect(screen.queryByRole("link", { name: "Tema do site" })).not.toBeInTheDocument();
    expect(screen.queryByText("Cores da marca")).not.toBeInTheDocument();
    expect(screen.getAllByText("3 blocos · estrutura aprovada")).toHaveLength(MANAGED_PAGE_TEMPLATES.length);
    for (const template of MANAGED_PAGE_TEMPLATES) {
      const card = screen.getByRole("heading", { name: template.name }).closest("article");
      expect(card).not.toBeNull();
      expect(within(card!).getByRole("link", { name: "Usar modelo" })).toHaveAttribute(
        "href",
        `/admin/paginas/novo?type=page&template=${template.key}`,
      );
    }
  });

  it("calcula uso por rascunho e não oferece atalhos que exigem referências ausentes", async () => {
    renderPage("/admin/paginas?tab=blocos");

    const heroCard = (await screen.findByRole("heading", { name: "Hero" })).closest("article");
    const faqCard = screen.getByRole("heading", { name: "Perguntas frequentes" }).closest("article");
    const imageCard = screen.getByRole("heading", { name: "Imagem" }).closest("article");
    const relationCard = screen.getByRole("heading", { name: "Conteúdo relacionado" }).closest("article");
    expect(screen.getAllByRole("article")).toHaveLength(PAGE_BUILDER_BLOCK_TYPES.length);
    expect(within(heroCard!).getByText("Usado em 2 páginas")).toBeInTheDocument();
    expect(within(faqCard!).getByText("Usado em 1 página")).toBeInTheDocument();
    expect(within(heroCard!).getByRole("link", { name: "Usar em nova página" })).toHaveAttribute(
      "href",
      "/admin/paginas/novo?type=page&block=hero",
    );
    expect(within(imageCard!).queryByRole("link")).not.toBeInTheDocument();
    expect(
      within(imageCard!).getByText(/disponível no editor após selecionar uma mídia/i),
    ).toBeInTheDocument();
    expect(within(relationCard!).queryByRole("link")).not.toBeInTheDocument();
    expect(
      within(relationCard!).getByText(/disponível no editor após selecionar um conteúdo relacionado/i),
    ).toBeInTheDocument();
  });

  it("traduz os estados editoriais recebidos sem expor valores internos", async () => {
    renderPage("/admin/paginas");

    expect(await screen.findByText("Rascunho")).toBeInTheDocument();
    expect(screen.getByText("Publicada")).toBeInTheDocument();
    expect(screen.queryByText(/^draft$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^published$/i)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Páginas e página inicial" })).toBeInTheDocument();
  });
});
