import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminCampaignEditorPage from "@/admin/pages/AdminCampaignEditorPage";
import AdminDiscoveryPage from "@/admin/pages/AdminDiscoveryPage";
import { createPageBlock } from "@/admin/page-builder-model";
import { solutionPayload } from "../fixtures/discovery-payloads";

const mocks = vi.hoisted(() => ({
  loaded: null as null | Record<string, any>,
  listRows: [] as Record<string, any>[],
  editorialCommand: vi.fn(),
  issuePreview: vi.fn(),
  clearBackup: vi.fn(),
  session: { access_token: "test-token", user: { id: "91000000-0000-4000-8000-000000000001" } },
  profile: {
    permissions: [
      "cms:solutions.edit",
      "cms:solutions.approve",
      "cms:solutions.publish",
      "cms:industries.read",
      "cms:industries.edit",
      "cms:industries.approve",
      "cms:industries.publish",
      "cms:campaigns.edit",
      "cms:campaigns.approve",
      "cms:campaigns.publish",
    ],
  },
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => {
      const listResult = {
        data: table === "cms_content_items" ? mocks.listRows : [],
        error: null,
      };
      const query: Record<string, any> = {};
      query.select = () => query;
      query.eq = () => query;
      query.in = () => query;
      query.not = () => query;
      query.neq = () => query;
      query.order = () => Promise.resolve(listResult);
      query.single = () =>
        Promise.resolve({ data: table === "cms_content_items" ? mocks.loaded : null, error: null });
      query.then = (resolve: (value: typeof listResult) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(listResult).then(resolve, reject);
      return query;
    },
  },
}));

vi.mock("@/admin/auth/AdminAuthContext", () => ({
  useAdminAuth: () => ({ session: mocks.session, profile: mocks.profile }),
}));

vi.mock("@/admin/api/cms-api", () => ({
  controlledVocabularyCommand: vi.fn().mockResolvedValue({ items: [] }),
  editorialCommand: mocks.editorialCommand,
  issuePreview: mocks.issuePreview,
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

vi.mock("@/admin/components/UnsavedChangesGuard", () => ({ UnsavedChangesGuard: () => null }));
vi.mock("@/admin/components/DiscoveryContentEditor", () => ({
  DiscoveryContentEditor: () => <div>Editor de descoberta</div>,
}));
vi.mock("@/admin/components/PageBlockEditor", () => ({ PageBlockEditor: () => <div>Editor de blocos</div> }));
vi.mock("@/admin/open-external-preview", () => ({
  openExternalAfterAsync: async (resolve: () => Promise<string>) => {
    await resolve();
    return { status: "opened" };
  },
}));

const id = (suffix: number) => `91000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;

const provenance = [
  {
    sourceKind: "owner_authored" as const,
    rightsConfirmed: true as const,
    commercialOwner: "Owner sintético",
    technicalOwner: "Owner sintético",
    verifiedAt: "2026-09-06T12:00:00.000Z",
  },
];

const campaignPayload = {
  schemaVersion: 1 as const,
  consumerId: "cms.campaign-landing.v1" as const,
  contentType: "campaign" as const,
  title: "Campanha sintética",
  summary: "Landing page sintética para teste local.",
  campaignKind: "lead_generation" as const,
  templateKey: "landing_conversion" as const,
  route: { path: "/campanhas/campanha-sintetica" },
  window: {
    startsAt: "2026-09-06T12:00:00.000Z",
    endsAt: "2026-09-13T12:00:00.000Z",
    timezone: "America/Sao_Paulo" as const,
  },
  blocks: [createPageBlock("hero"), createPageBlock("rich_text")],
  placements: [],
  tracking: {
    enabled: false,
    requiresConsent: true as const,
    provider: "internal" as const,
    eventName: "campaign-view",
  },
  expiry: { mode: "not_found" as const },
  relations: { productIds: [], serviceIds: [], solutionIds: [], pageIds: [] },
  seo: {
    title: "Campanha sintética",
    description: "Descrição sintética da campanha para validação.",
    canonicalPath: "/campanhas/campanha-sintetica",
    indexable: false,
  },
  provenance,
  governanceState: "synthetic_test" as const,
  approval: { businessOwner: "Owner", marketingReviewer: "Marketing", privacyReviewer: "Privacidade" },
};

function revision(suffix: number, number: number, payload: Record<string, unknown>) {
  return {
    id: id(suffix),
    revision_number: number,
    reason: `Revisão sintética ${number}`,
    created_at: `2026-09-0${number}T12:00:00.000Z`,
    payload,
  };
}

function discoveryItem(state: string) {
  return {
    id: id(10),
    slug: "solucao-sintetica",
    workflow_status: state,
    cms_content_drafts: { payload: solutionPayload, lock_version: 8 },
    cms_content_revisions: [revision(31, 1, solutionPayload)],
  };
}

function campaignItem(state: string) {
  return {
    id: id(20),
    slug: "campanha-sintetica",
    workflow_status: state,
    cms_content_drafts: { payload: campaignPayload, lock_version: 13 },
    cms_content_revisions: [revision(42, 2, campaignPayload), revision(41, 1, campaignPayload)],
  };
}

function renderAt(path: string, route: string, element: React.ReactNode) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={route} element={element} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("retirada e restauração de descoberta e campanhas", () => {
  beforeEach(() => {
    mocks.listRows = [];
    mocks.clearBackup.mockReset();
    mocks.issuePreview.mockReset().mockResolvedValue({ path: "/preview/sintetico" });
    mocks.editorialCommand.mockReset();
    mocks.editorialCommand.mockImplementation(async (_session, body: Record<string, unknown>) => {
      if (mocks.loaded && body.action === "archive") {
        mocks.loaded = { ...mocks.loaded, workflow_status: "archived" };
      }
      if (mocks.loaded && body.action === "restore") {
        mocks.loaded = { ...mocks.loaded, workflow_status: "published" };
      }
      return {
        itemId: body.itemId,
        status: body.action === "archive" ? "archived" : "published",
        correlationId: id(99),
      };
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("despublica uma solução preservando a versão esperada do rascunho", async () => {
    const user = userEvent.setup();
    mocks.loaded = discoveryItem("published");
    renderAt(
      `/admin/descoberta/solution/${id(10)}`,
      "/admin/descoberta/:contentType/:id",
      <AdminDiscoveryPage />,
    );

    await user.click(await screen.findByRole("button", { name: "Despublicar e arquivar solução" }));

    await waitFor(() =>
      expect(mocks.editorialCommand).toHaveBeenCalledWith(
        mocks.session,
        expect.objectContaining({
          action: "archive",
          itemId: id(10),
          contentType: "solution",
          expectedLockVersion: 8,
        }),
      ),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Conteúdo público retirado e item arquivado");
    expect(mocks.clearBackup).toHaveBeenCalled();
  });

  it("restaura uma revisão de descoberta somente a partir do estado arquivado", async () => {
    const user = userEvent.setup();
    mocks.loaded = discoveryItem("archived");
    renderAt(
      `/admin/descoberta/solution/${id(10)}`,
      "/admin/descoberta/:contentType/:id",
      <AdminDiscoveryPage />,
    );

    await user.click(await screen.findByRole("button", { name: "Restaurar" }));
    expect(mocks.editorialCommand).toHaveBeenCalledWith(
      mocks.session,
      expect.objectContaining({
        action: "restore",
        revisionId: id(31),
        expectedLockVersion: 8,
      }),
    );
  });

  it("mostra a ordem governada do site e conduz cada setor ao editor real", async () => {
    mocks.loaded = null;
    mocks.listRows = [
      {
        id: id(12),
        slug: "setor-segundo",
        workflow_status: "published",
        updated_at: "2026-09-06T12:00:00.000Z",
        cms_content_drafts: {
          payload: { ...solutionPayload, title: "Setor segundo", displayOrder: 20 },
          lock_version: 1,
        },
      },
      {
        id: id(11),
        slug: "setor-primeiro",
        workflow_status: "draft",
        updated_at: "2026-09-06T11:00:00.000Z",
        cms_content_drafts: {
          payload: { ...solutionPayload, title: "Setor primeiro", displayOrder: 1 },
          lock_version: 1,
        },
      },
    ];
    renderAt("/admin/descoberta/industry?tab=2", "/admin/descoberta/:contentType", <AdminDiscoveryPage />);

    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("Setor primeiro")).toBeVisible();
    expect(within(rows[0]).getByRole("link", { name: "Editar ordem" })).toHaveAttribute(
      "href",
      `/admin/descoberta/industry/${id(11)}`,
    );
    expect(screen.getByText(/só chega ao site depois do fluxo de revisão e publicação/)).toBeVisible();
  });

  it("inicia campanha operacional sem conteúdo, owners ou direitos presumidos", async () => {
    mocks.loaded = null;
    renderAt(
      "/admin/marketing/campanhas/novo",
      "/admin/marketing/campanhas/:id",
      <AdminCampaignEditorPage />,
    );

    expect(await screen.findByRole("heading", { name: "Nova campanha" })).toBeVisible();
    expect(screen.getByLabelText("Título")).toHaveValue("");
    expect(screen.getByLabelText("Resumo")).toHaveValue("");
    expect(screen.getByLabelText("Endereço público gerado")).toHaveTextContent("/campanhas/");
    expect(screen.queryByLabelText("Nome personalizado do endereço")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Estado editorial")).toHaveValue("awaiting_owner");
    expect(screen.getByLabelText("Responsável de negócio")).toHaveValue("");
    expect(screen.getByLabelText("Responsável comercial")).toHaveValue("");
    expect(screen.getByLabelText("Confirmo os direitos para uso desta campanha")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
  });

  it("gera o endereço pelo título e expõe escolhas da campanha em linguagem operacional", async () => {
    const user = userEvent.setup();
    mocks.loaded = null;
    renderAt(
      "/admin/marketing/campanhas/novo",
      "/admin/marketing/campanhas/:id",
      <AdminCampaignEditorPage />,
    );

    const title = await screen.findByLabelText("Título");
    await user.type(title, "Campanha Água & Óleo 2026");
    expect(screen.getByLabelText("Endereço público gerado")).toHaveTextContent(
      "/campanhas/campanha-agua-oleo-2026",
    );

    await user.click(screen.getByLabelText("Personalizar o endereço público"));
    const customAddress = screen.getByLabelText("Nome personalizado do endereço");
    await user.clear(customAddress);
    await user.type(customAddress, "Semana da Indústria");
    expect(screen.getByLabelText("Endereço público gerado")).toHaveTextContent(
      "/campanhas/semana-da-industria",
    );
    await user.clear(title);
    await user.type(title, "Campanha Renovada");
    expect(screen.getByLabelText("Endereço público gerado")).toHaveTextContent(
      "/campanhas/semana-da-industria",
    );
    await user.click(screen.getByLabelText("Personalizar o endereço público"));
    expect(screen.queryByLabelText("Nome personalizado do endereço")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Endereço público gerado")).toHaveTextContent(
      "/campanhas/campanha-renovada",
    );

    const blockType = screen.getByLabelText("Tipo de novo bloco");
    expect(within(blockType).getByRole("option", { name: "Destaque principal" })).toHaveValue("hero");
    expect(within(blockType).getByRole("option", { name: "Conteúdo relacionado" })).toHaveValue(
      "related_content",
    );

    await user.click(screen.getByRole("button", { name: "Novo posicionamento" }));
    expect(screen.getByLabelText("Local de exibição")).toHaveDisplayValue("Destaques da página inicial");
    expect(screen.getByLabelText("Onde mostrar")).toHaveDisplayValue("Todo o site");
    expect(screen.getByLabelText("Após expiração")).toHaveDisplayValue("Mostrar página não encontrada");
    expect(screen.getByLabelText("Ferramenta de medição")).toHaveDisplayValue("Medição interna da GAIATEC");
    expect(screen.getByText("Visualização da campanha")).toBeVisible();
    expect(document.body.textContent).not.toMatch(
      /home_featured|related_content|not_found|\bfallback\b|\bredirect\b|\btracking\b/i,
    );
  });

  it("despublica a campanha pelo comando editorial governado", async () => {
    const user = userEvent.setup();
    mocks.loaded = campaignItem("published");
    renderAt(
      `/admin/marketing/campanhas/${id(20)}`,
      "/admin/marketing/campanhas/:id",
      <AdminCampaignEditorPage />,
    );

    await user.click(await screen.findByRole("button", { name: "Despublicar e arquivar campanha" }));

    await waitFor(() =>
      expect(mocks.editorialCommand).toHaveBeenCalledWith(
        mocks.session,
        expect.objectContaining({
          action: "archive",
          itemId: id(20),
          contentType: null,
          expectedLockVersion: 13,
          reason: "Atualização da campanha",
        }),
      ),
    );
    expect(await screen.findByText(/Campanha despublicada e arquivada/)).toBeVisible();
  });

  it("expõe preview e restauração de revisão para campanha arquivada", async () => {
    const user = userEvent.setup();
    mocks.loaded = campaignItem("archived");
    renderAt(
      `/admin/marketing/campanhas/${id(20)}`,
      "/admin/marketing/campanhas/:id",
      <AdminCampaignEditorPage />,
    );

    expect(await screen.findByRole("heading", { name: "Histórico imutável" })).toBeVisible();
    await user.click(screen.getAllByRole("button", { name: "Preview desta revisão" })[0]);
    expect(mocks.issuePreview).toHaveBeenCalledWith(mocks.session, id(20), id(42));

    await user.click(screen.getAllByRole("button", { name: "Restaurar como nova revisão" })[0]);
    expect(mocks.editorialCommand).toHaveBeenCalledWith(
      mocks.session,
      expect.objectContaining({
        action: "restore",
        revisionId: id(42),
        expectedLockVersion: 13,
      }),
    );
  });
});
