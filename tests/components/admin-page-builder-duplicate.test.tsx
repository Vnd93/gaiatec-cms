import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CmsManagedPageContentSchema } from "@/shared/contracts/cms-content";

const mocks = vi.hoisted(() => ({
  editorialCommand: vi.fn(),
  clearBackup: vi.fn(),
  session: {
    access_token: "test-token",
    user: { id: "91000000-0000-4000-8000-000000000001" },
  },
}));

const id = (suffix: number) => `91000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;

const sourcePayload = CmsManagedPageContentSchema.parse({
  schemaVersion: 1,
  consumerId: "cms.managed-page.v1",
  contentType: "page",
  title: "Página origem",
  summary: "Página governada usada somente pela regressão de duplicação.",
  pageKind: "institutional",
  templateKey: "standard",
  route: {
    path: "/pagina-origem",
    navigationLabel: "Página origem",
    breadcrumbLabel: "Página origem",
  },
  blocks: [
    {
      id: id(10),
      type: "hero",
      hidden: false,
      width: "wide",
      tone: "dark",
      data: { title: "Página origem", text: "Conteúdo sintético.", alignment: "left" },
    },
  ],
  seo: {
    title: "Página origem | GAIATEC",
    description: "Página governada usada para validar a duplicação segura do site builder.",
    canonicalPath: "/pagina-origem",
    indexable: true,
  },
  provenance: [
    {
      sourceKind: "owner_authored",
      rightsConfirmed: true,
      commercialOwner: "Owner origem",
      technicalOwner: "Owner origem",
      verifiedAt: "2026-09-07T12:00:00.000Z",
    },
  ],
  governanceState: "homologated",
  relations: { productIds: [], serviceIds: [], industryIds: [], applicationIds: [], solutionIds: [] },
  retirement: { mode: "not_found" },
  approval: {
    businessOwner: "Owner origem",
    editorialReviewer: "Revisor origem",
    approvedAt: "2026-09-07T12:00:00.000Z",
  },
});

const loadedItem = {
  id: id(1),
  slug: "pagina-origem",
  content_type: "page",
  workflow_status: "published",
  scheduled_for: null,
  cms_content_drafts: { payload: sourcePayload, lock_version: 7 },
  cms_content_revisions: [
    {
      id: id(2),
      revision_number: 1,
      reason: "Publicação de origem",
      created_at: "2026-09-07T12:00:00.000Z",
      payload: sourcePayload,
    },
  ],
};

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => {
      const listResult = { data: [], error: null };
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        neq: () => query,
        not: () => query,
        order: () => Promise.resolve(listResult),
        single: () =>
          Promise.resolve({
            data: table === "cms_content_items" ? loadedItem : null,
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
    profile: {
      roles: ["editor"],
      permissions: ["cms:pages.read", "cms:pages.edit", "cms:pages.approve", "cms:pages.publish"],
    },
    user: { id: mocks.session.user.id, email: "qa@example.test" },
  }),
}));

vi.mock("@/admin/api/cms-api", () => ({
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

vi.mock("@/admin/components/UnsavedChangesGuard", () => ({ UnsavedChangesGuard: () => null }));
vi.mock("@/admin/ev2-runtime", () => ({ isEv2FeatureEnabled: () => false }));

import AdminPageBuilderPage from "@/admin/pages/AdminPageBuilderPage";

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function renderBuilder() {
  const router = createMemoryRouter(
    [
      {
        path: "/admin/paginas/:id",
        element: (
          <>
            <AdminPageBuilderPage />
            <LocationProbe />
          </>
        ),
      },
    ],
    { initialEntries: [`/admin/paginas/${loadedItem.id}`] },
  );
  render(<RouterProvider router={router} />);
}

describe("duplicação progressiva no site builder", () => {
  beforeEach(() => {
    mocks.clearBackup.mockReset();
    mocks.editorialCommand.mockReset();
    mocks.editorialCommand.mockResolvedValue({
      itemId: id(3),
      status: "draft",
      correlationId: id(99),
    });
  });

  it("não inventa governança nem persiste até a cópia incompleta ser concluída pela UI", async () => {
    const user = userEvent.setup();
    renderBuilder();

    await user.click(await screen.findByRole("button", { name: "Duplicar página" }));

    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/admin/paginas/novo?type=page"),
    );
    expect(mocks.editorialCommand).not.toHaveBeenCalled();
    expect(screen.getByText(/Cópia aberta como rascunho local incompleto/)).toBeInTheDocument();
    expect(screen.getByLabelText("Título administrativo e público")).toHaveValue("Página origem — cópia");
    expect(screen.getByLabelText("Endereço público gerado").textContent).toMatch(
      /^\/pagina-origem-copia-\d{8}$/,
    );
    expect(screen.getByText(/Rascunho com alterações não salvas/)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Governança" }));
    const rights = screen.getAllByLabelText("Direitos de uso confirmados");
    expect(rights).toHaveLength(2);
    expect(rights[0]).toBeChecked();
    expect(rights[1]).not.toBeChecked();
    expect(screen.getAllByLabelText("Owner comercial")[1]).toHaveValue("");
    expect(screen.getAllByLabelText("Owner técnico")[1]).toHaveValue("");
    expect(screen.getByRole("button", { name: "Criar página" })).toBeDisabled();

    await user.type(screen.getByLabelText("Owner de negócio"), "Owner da cópia");
    await user.type(screen.getByLabelText("Revisor editorial"), "Revisor da cópia");
    await user.type(screen.getAllByLabelText("Owner comercial")[1], "Owner da cópia");
    await user.type(screen.getAllByLabelText("Owner técnico")[1], "Owner técnico da cópia");
    await user.type(screen.getAllByLabelText("Verificado em")[1], "2026-09-07T13:00");
    await user.click(rights[1]);

    const create = screen.getByRole("button", { name: "Criar página" });
    await waitFor(() => expect(create).toBeEnabled());
    await user.click(create);
    await waitFor(() => expect(mocks.editorialCommand).toHaveBeenCalledTimes(1));

    const body = mocks.editorialCommand.mock.calls[0][1] as Record<string, unknown>;
    expect(body).toMatchObject({ action: "create", itemId: null, contentType: "page" });
    expect(CmsManagedPageContentSchema.safeParse(body.payload).success).toBe(true);
    expect(body.payload).toMatchObject({
      governanceState: "awaiting_owner",
      seo: { indexable: false },
      approval: { businessOwner: "Owner da cópia", editorialReviewer: "Revisor da cópia" },
      provenance: [
        expect.objectContaining({ rightsConfirmed: true, commercialOwner: "Owner origem" }),
        expect.objectContaining({ rightsConfirmed: true, commercialOwner: "Owner da cópia" }),
      ],
    });
  });
});
