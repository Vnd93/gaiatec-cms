import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminEditorPage from "@/admin/pages/AdminEditorPage";
import AdminProductEditorPage from "@/admin/pages/AdminProductEditorPage";
import { comprehensiveProductPayload } from "../fixtures/product-payload";

const mocks = vi.hoisted(() => ({
  loaded: null as null | Record<string, unknown>,
  editorialCommand: vi.fn(),
  clearBackup: vi.fn(),
  session: { access_token: "test-token", user: { id: "90000000-0000-4000-8000-000000000001" } },
  profile: {
    permissions: [
      "cms:posts.edit",
      "cms:posts.approve",
      "cms:posts.publish",
      "cms:products.edit",
      "cms:products.approve",
      "cms:products.publish",
    ],
  },
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        order: () => Promise.resolve({ data: [], error: null }),
        single: () =>
          Promise.resolve({
            data: table === "cms_content_items" ? mocks.loaded : null,
            error: null,
          }),
      };
      return query;
    },
  },
}));

vi.mock("@/admin/auth/AdminAuthContext", () => ({
  useAdminAuth: () => ({
    session: mocks.session,
    profile: mocks.profile,
    user: { id: mocks.session.user.id, email: "qa@example.test" },
  }),
}));

vi.mock("@/admin/api/cms-api", () => ({
  attributesCommand: vi.fn().mockResolvedValue({
    schemaVersion: 1,
    commandId: "90000000-0000-4000-8000-000000000090",
    correlationId: "90000000-0000-4000-8000-000000000091",
    attributeSet: null,
    definitions: [],
    units: [],
  }),
  controlledVocabularyCommand: vi.fn().mockResolvedValue({ items: [] }),
  editorialCommand: mocks.editorialCommand,
  issuePreview: vi.fn(),
}));

vi.mock("@/admin/hooks/useDraftBackup", () => ({
  useDraftBackup: () => ({
    recoverable: null,
    lastSavedAt: null,
    state: "idle",
    restore: vi.fn(),
    discard: vi.fn(),
    clear: mocks.clearBackup,
  }),
}));

vi.mock("@/admin/hooks/useProgressiveDraftAutosave", () => ({
  useProgressiveDraftAutosave: () => ({
    active: false,
    status: "disabled",
    fallbackReason: null,
    draftId: null,
    lockVersion: null,
    lastSavedAt: null,
    correlationId: null,
    currentVersion: null,
    diffRef: null,
    recoverable: null,
    restoreServerVersion: vi.fn(),
    keepLocalVersion: vi.fn(),
    retry: vi.fn(),
    flush: vi.fn().mockResolvedValue(false),
  }),
}));

vi.mock("@/admin/components/UnsavedChangesGuard", () => ({ UnsavedChangesGuard: () => null }));
vi.mock("@/admin/ev2-runtime", () => ({
  cmsEnvironment: () => "local",
  isEv2FeatureEnabled: () => false,
}));

const id = (suffix: number) => `90000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;

const postPayload = {
  schemaVersion: 1,
  consumerId: "cms.blog-article.v1",
  contentType: "post",
  title: "Artigo sintético publicado",
  summary: "Resumo sintético.",
  excerpt: "Resumo sintético.",
  authorName: "Autora sintética",
  author: { id: id(10), name: "Autora sintética", slug: "autora-sintetica" },
  category: { id: id(11), name: "Categoria sintética", slug: "categoria-sintetica" },
  tags: [{ id: id(12), name: "Teste local", slug: "teste-local" }],
  relations: { postIds: [], productIds: [], serviceIds: [], applicationIds: [], solutionIds: [] },
  readingMinutes: 4,
  blocks: [{ id: id(13), type: "rich_text", data: { text: "Texto sintético." } }],
  seo: {
    title: "Artigo sintético",
    description: "Descrição sintética do artigo técnico.",
    canonicalPath: "/blog/artigo-sintetico",
    indexable: false,
  },
  provenance: [
    {
      sourceKind: "owner_authored",
      rightsConfirmed: true,
      commercialOwner: "Owner sintético",
      technicalOwner: "Owner sintético",
      verifiedAt: "2026-09-06T12:00:00.000Z",
    },
  ],
};

function loadedItem(contentType: "post" | "product") {
  return {
    id: id(contentType === "post" ? 1 : 2),
    slug: contentType === "post" ? "artigo-sintetico" : "produto-completo",
    workflow_status: "published",
    updated_at: "2026-09-06T12:00:00.000Z",
    cms_content_drafts: {
      payload: contentType === "post" ? postPayload : comprehensiveProductPayload(),
      lock_version: contentType === "post" ? 7 : 11,
    },
    cms_content_revisions: [
      {
        id: id(contentType === "post" ? 21 : 22),
        revision_number: 1,
        reason: "Publicação sintética",
        created_at: "2026-09-06T12:00:00.000Z",
        payload: contentType === "post" ? postPayload : comprehensiveProductPayload(),
      },
    ],
  };
}

function renderRoute(path: string, element: React.ReactNode) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path={path
            .split("?")[0]
            .replace(id(2), ":id")
            .replace(id(1), ":id")
            .replace(/\/novo$/, "/:id")}
          element={element}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("arquivamento nos editores principais", () => {
  beforeEach(() => {
    mocks.loaded = null;
    mocks.clearBackup.mockReset();
    mocks.editorialCommand.mockReset();
    mocks.editorialCommand.mockImplementation(async (_session, body: Record<string, unknown>) => {
      if (body.action === "archive" && mocks.loaded) {
        mocks.loaded = { ...mocks.loaded, workflow_status: "archived" };
      }
      return {
        itemId: body.itemId,
        status: body.action === "archive" ? "archived" : "published",
        correlationId: id(99),
      };
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("inicia um artigo vazio e bloqueia persistência até conteúdo, SEO e direitos serem informados", async () => {
    const user = userEvent.setup();
    renderRoute("/admin/conteudo/novo", <AdminEditorPage />);

    expect(screen.getByRole("heading", { name: "Novo artigo" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Identificador da URL/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Título")).toHaveValue("");
    expect(screen.getByLabelText("Título nos resultados de busca")).toHaveValue("");
    expect(screen.getByLabelText("Responsável comercial")).toHaveValue("");
    expect(screen.getByLabelText("Confirmo os direitos para uso deste conteúdo")).not.toBeChecked();

    await user.type(screen.getByLabelText("Título"), "Artigo de homologação");
    expect(screen.getByLabelText("Endereço público gerado")).toHaveTextContent("/blog/artigo-de-homologacao");

    await user.click(screen.getByRole("button", { name: "Criar rascunho" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Revise os campos obrigatórios");
    expect(mocks.editorialCommand).not.toHaveBeenCalled();
  });

  it("abre uma nova versão e persiste a atualização de um artigo publicado pela interface", async () => {
    const user = userEvent.setup();
    mocks.loaded = loadedItem("post");
    renderRoute(`/admin/conteudo/${id(1)}`, <AdminEditorPage />);

    const title = await screen.findByLabelText("Título");
    expect(screen.getByText("Teste local")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Nova tag"), "Automação industrial");
    await user.click(screen.getByRole("button", { name: "Adicionar tag" }));
    expect(screen.getByText("Automação industrial")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remover tag Teste local" }));
    expect(screen.queryByRole("button", { name: "Remover tag Teste local" })).not.toBeInTheDocument();
    await user.clear(title);
    await user.type(title, "Artigo publicado atualizado");
    await user.click(screen.getByRole("button", { name: "Abrir nova versão e salvar" }));

    await waitFor(() => expect(mocks.editorialCommand).toHaveBeenCalledTimes(2));
    expect(mocks.editorialCommand).toHaveBeenNthCalledWith(
      1,
      mocks.session,
      expect.objectContaining({ action: "reopen", itemId: id(1), payload: null }),
    );
    expect(mocks.editorialCommand).toHaveBeenNthCalledWith(
      2,
      mocks.session,
      expect.objectContaining({
        action: "save",
        itemId: id(1),
        expectedLockVersion: 7,
        payload: expect.objectContaining({
          title: "Artigo publicado atualizado",
          tags: expect.arrayContaining([expect.objectContaining({ name: "Automação industrial" })]),
        }),
      }),
    );
    const savedPayload = mocks.editorialCommand.mock.calls[1][1].payload as { tags: Array<{ name: string }> };
    expect(savedPayload.tags).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Teste local" })]),
    );
  });

  it("despublica o artigo com item, lock e motivo do rascunho carregado", async () => {
    const user = userEvent.setup();
    mocks.loaded = loadedItem("post");
    renderRoute(`/admin/conteudo/${id(1)}`, <AdminEditorPage />);

    await user.click(await screen.findByRole("button", { name: "Despublicar e arquivar conteúdo" }));

    await waitFor(() =>
      expect(mocks.editorialCommand).toHaveBeenCalledWith(
        mocks.session,
        expect.objectContaining({
          action: "archive",
          itemId: id(1),
          contentType: null,
          payload: null,
          expectedLockVersion: 7,
          reason: "Criação ou atualização editorial",
        }),
      ),
    );
    expect(await screen.findByText(/Conteúdo despublicado e arquivado/)).toBeInTheDocument();
    expect(mocks.clearBackup).toHaveBeenCalled();
  });

  it("despublica o produto com permissão crítica e preserva a versão esperada", async () => {
    const user = userEvent.setup();
    mocks.loaded = loadedItem("product");
    renderRoute(`/admin/produtos/${id(2)}?etapa=seo`, <AdminProductEditorPage />);

    await user.click(await screen.findByRole("button", { name: "Despublicar e arquivar produto" }));

    await waitFor(() =>
      expect(mocks.editorialCommand).toHaveBeenCalledWith(
        mocks.session,
        expect.objectContaining({
          action: "archive",
          itemId: id(2),
          contentType: null,
          payload: null,
          expectedLockVersion: 11,
          reason: "Cadastro manual do produto piloto",
        }),
      ),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Produto despublicado e arquivado");
    expect(mocks.clearBackup).toHaveBeenCalled();
  });
});
