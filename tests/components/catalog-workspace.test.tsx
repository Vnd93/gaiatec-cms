import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ read: vi.fn(), execute: vi.fn() }));
vi.mock("@/admin/auth/AdminAuthContext", () => ({
  useAdminAuth: () => ({
    session: { user: { id: "fixture" } },
    profile: { permissions: ["cms:catalog.read"] },
  }),
}));
vi.mock("@/admin/ev2-runtime", () => ({ cmsEnvironment: () => "local" }));
vi.mock("@/admin/api/catalog-workspace-api", async (original) => ({
  ...(await original<typeof import("@/admin/api/catalog-workspace-api")>()),
  readCatalogWorkspace: mock.read,
  executeCatalogWorkspaceCommand: mock.execute,
}));
import AdminCatalogWorkspacePage from "@/admin/pages/AdminCatalogWorkspacePage";
import { CatalogWorkspaceError } from "@/admin/api/catalog-workspace-api";
const product = {
  id: "c0110000-0000-4000-8000-000000000020",
  revision: 1,
  slug: "product",
  title: "Original product",
  content: { summary: "Summary", description: "Description" },
  catalog_entity_kind: "product",
  catalog_lifecycle_state: "active",
  publication_state: "draft",
  published_revision: null,
  primary_term_id: null,
  complementary_term_ids: [],
};
const workspace = {
  schemaVersion: 1,
  enabled: true,
  source: "override",
  permissions: { edit: true, administer: false },
  products: [product],
  terms: [],
  relations: [],
  hierarchy: [],
  effectiveRelations: [],
};
function mount() {
  return render(
    <RouterProvider router={createMemoryRouter([{ path: "/", element: <AdminCatalogWorkspacePage /> }])} />,
  );
}
beforeEach(() => {
  mock.read.mockReset().mockResolvedValue(workspace);
  mock.execute.mockReset().mockResolvedValue(undefined);
});
describe("catalog workspace user flows", () => {
  it("default-off shows no mutation controls", async () => {
    mock.read.mockResolvedValue({
      ...workspace,
      enabled: false,
      source: "default",
      products: [],
      permissions: { edit: false, administer: false },
    });
    mount();
    await screen.findByText(/novo catálogo está em preparação/i);
    expect(screen.queryByRole("button", { name: "Novo produto" })).not.toBeInTheDocument();
    expect(mock.execute).not.toHaveBeenCalled();
  });
  it("keeps attempted edits on 409 and requires review before reapplying", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole("button", { name: /Original product · Rascunho/ }));
    const title = screen.getByLabelText("Nome");
    await user.clear(title);
    await user.type(title, "My attempt");
    mock.execute.mockRejectedValueOnce(new CatalogWorkspaceError(409, "PT409"));
    mock.read.mockResolvedValue({
      ...workspace,
      products: [{ ...product, revision: 2, title: "Current product" }],
    });
    await user.click(screen.getByRole("button", { name: "Salvar rascunho" }));
    await screen.findByRole("region", { name: "Comparação de versões" });
    expect(title).toHaveValue("My attempt");
    expect(screen.getByRole("button", { name: "Salvar rascunho" })).toBeDisabled();
    expect(screen.getByText('"Current product"')).toBeInTheDocument();
    expect(mock.execute).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Manter edição para reaplicar e revisar" }));
    await user.click(screen.getByRole("button", { name: "Salvar rascunho" }));
    await waitFor(() => expect(mock.execute).toHaveBeenCalledTimes(2));
    expect(mock.execute.mock.calls[1][0]).toMatchObject({ expectedVersion: 2, title: "My attempt" });
  });
  it("blocks lifecycle actions while there are unsaved edits and hides administrator actions", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole("button", { name: /Original product · Rascunho/ }));
    await user.type(screen.getByLabelText("Nome"), " edited");
    expect(screen.getByRole("button", { name: "Marcar como pronto" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Publicar revisão" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Classificação e termos" })).toBeDisabled();
  });
});
