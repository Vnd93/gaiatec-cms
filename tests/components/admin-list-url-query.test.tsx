import { act, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
      permissions: ["cms:pages.read", "cms:products.read"],
      ev2Capabilities: undefined,
    },
  }),
}));

import AdminPagesPage from "@/admin/pages/AdminPagesPage";
import AdminProductsPage from "@/admin/pages/AdminProductsPage";
import AdminContentPage from "@/admin/pages/AdminContentPage";

type QueryResult = { data: unknown[]; error: null };

function createRequest(result: QueryResult) {
  const request: Record<string, ReturnType<typeof vi.fn>> & {
    then?: Promise<QueryResult>["then"];
  } = {};
  for (const method of ["select", "in", "order", "eq", "or", "ilike", "range"]) {
    request[method] = vi.fn(() => request);
  }
  request.limit = vi.fn(() => Promise.resolve(result));
  request.then = (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected);
  return request;
}

function renderRoute(path: string, routePath: string, element: React.ReactNode) {
  const router = createMemoryRouter([{ path: routePath, element }], { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

describe("busca das listagens sincronizada com a URL", () => {
  beforeEach(() => {
    mocks.from.mockReset();
  });

  it("atualiza e limpa consecutivamente o filtro de páginas sem remontar a rota", async () => {
    mocks.from.mockImplementation(() =>
      createRequest({
        data: [
          {
            id: "page-alpha",
            slug: "alfa",
            content_type: "page",
            workflow_status: "draft",
            updated_at: "2026-09-06T12:00:00.000Z",
            cms_content_drafts: { payload: { title: "Página Alfa", route: { path: "/alfa" } } },
          },
          {
            id: "page-beta",
            slug: "beta",
            content_type: "page",
            workflow_status: "draft",
            updated_at: "2026-09-06T12:00:00.000Z",
            cms_content_drafts: { payload: { title: "Página Beta", route: { path: "/beta" } } },
          },
        ],
        error: null,
      }),
    );
    const router = renderRoute("/admin/paginas?q=alfa", "/admin/paginas", <AdminPagesPage />);
    const search = screen.getByRole("textbox", { name: "Buscar página" });

    expect(search).toHaveValue("alfa");
    expect(await screen.findByText("Página Alfa")).toBeInTheDocument();
    expect(screen.queryByText("Página Beta")).not.toBeInTheDocument();

    await act(async () => {
      await router.navigate("/admin/paginas?q=beta");
    });
    await waitFor(() => expect(search).toHaveValue("beta"));
    expect(screen.getByText("Página Beta")).toBeInTheDocument();
    expect(screen.queryByText("Página Alfa")).not.toBeInTheDocument();

    await act(async () => {
      await router.navigate("/admin/paginas?q=sem-resultado");
    });
    await waitFor(() => expect(search).toHaveValue("sem-resultado"));
    expect(screen.getByRole("heading", { name: "Nenhuma página encontrada" })).toBeInTheDocument();

    await act(async () => {
      await router.navigate("/admin/paginas");
    });
    await waitFor(() => expect(search).toHaveValue(""));
    expect(screen.getByText("Página Alfa")).toBeInTheDocument();
    expect(screen.getByText("Página Beta")).toBeInTheDocument();
  });

  it("refaz consecutivamente a busca de produtos quando q muda na mesma rota", async () => {
    const itemRequests: ReturnType<typeof createRequest>[] = [];
    const draftRequests: ReturnType<typeof createRequest>[] = [];
    mocks.from.mockImplementation((table: string) => {
      const request = createRequest({ data: [], error: null });
      if (table === "cms_content_drafts") draftRequests.push(request);
      else itemRequests.push(request);
      return request;
    });
    const router = renderRoute("/admin/produtos?q=primeiro", "/admin/produtos", <AdminProductsPage />);
    const search = screen.getByRole("searchbox", { name: "Buscar por nome ou fabricante" });

    expect(search).toHaveValue("primeiro");
    await waitFor(() => expect(draftRequests).toHaveLength(1));
    expect(draftRequests[0].or).toHaveBeenCalledWith(
      "payload->>title.ilike.%primeiro%,payload->manufacturer->>name.ilike.%primeiro%",
    );

    await act(async () => {
      await router.navigate("/admin/produtos?q=segundo");
    });
    await waitFor(() => expect(search).toHaveValue("segundo"));
    await waitFor(() => expect(draftRequests).toHaveLength(2));
    expect(draftRequests[1].or).toHaveBeenCalledWith(
      "payload->>title.ilike.%segundo%,payload->manufacturer->>name.ilike.%segundo%",
    );

    await act(async () => {
      await router.navigate("/admin/produtos?q=terceiro");
    });
    await waitFor(() => expect(search).toHaveValue("terceiro"));
    await waitFor(() => expect(draftRequests).toHaveLength(3));
    expect(draftRequests[2].or).toHaveBeenCalledWith(
      "payload->>title.ilike.%terceiro%,payload->manufacturer->>name.ilike.%terceiro%",
    );

    await act(async () => {
      await router.navigate("/admin/produtos");
    });
    await waitFor(() => expect(search).toHaveValue(""));
    await waitFor(() => expect(itemRequests).toHaveLength(4));
  });

  it("pesquisa artigos pelo título sem exigir o endereço técnico", async () => {
    const itemRequests: ReturnType<typeof createRequest>[] = [];
    const draftRequests: ReturnType<typeof createRequest>[] = [];
    mocks.from.mockImplementation((table: string) => {
      const request = createRequest({ data: [], error: null });
      if (table === "cms_content_drafts") draftRequests.push(request);
      else itemRequests.push(request);
      return request;
    });

    renderRoute("/admin/conteudo?q=inspecao", "/admin/conteudo", <AdminContentPage />);
    const search = screen.getByRole("textbox", { name: "Buscar por título" });

    expect(search).toHaveValue("inspecao");
    await waitFor(() => expect(draftRequests).toHaveLength(1));
    expect(draftRequests[0].ilike).toHaveBeenCalledWith("payload->>title", "%inspecao%");
    expect(screen.queryByText(/identificador da URL/i)).not.toBeInTheDocument();
    await waitFor(() => expect(itemRequests).toHaveLength(1));
  });
});
