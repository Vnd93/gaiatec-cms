import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import CmsPreviewPage from "@/admin/pages/CmsPreviewPage";
import CmsPublishedPage from "@/admin/pages/CmsPublishedPage";

function renderRoute(path: string, route: string, element: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={route} element={element} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("erros das projeções CMS", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("não mostra data.error técnico devolvido pelo preview", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error:
                'PGRST116: {"itemId":"45000000-0000-4000-8000-000000000001","path":"/storage/v1/private"}',
            }),
            { status: 503, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );

    renderRoute("/preview/private-token", "/preview/:token", <CmsPreviewPage />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("O CMS está temporariamente indisponível");
    expect(alert).not.toHaveTextContent(/PGRST|itemId|45000000|storage/i);
  });

  it("não mostra JSON técnico devolvido pelo consumidor publicado", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: '{"code":"CMS_PUBLIC_FAILURE","schemaVersion":4,"lockVersion":8}',
            }),
            { status: 404, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );

    renderRoute("/cms/conteudo/inexistente", "/cms/conteudo/:slug", <CmsPublishedPage />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("O conteúdo solicitado não está mais disponível");
    expect(alert).not.toHaveTextContent(/CMS_|schemaVersion|lockVersion|code/i);
  });

  it.each([
    ["preview", "/preview/token", "/preview/:token", <CmsPreviewPage />],
    ["published", "/cms/conteudo/artigo", "/cms/conteudo/:slug", <CmsPublishedPage />],
  ])("falha fechada para resposta 2xx que não contém payload válido: %s", async (_, path, route, page) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"error":"unexpected internal shape"}', { status: 200 })),
    );

    renderRoute(path, route, page);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toMatch(/unexpected internal shape|error/i);
    expect(alert).toHaveTextContent(/Não foi possível carregar/);
  });
});
