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
  it.each(["", "Invalid Slug", "-invalid", "invalid-", "invalid--slug", "invalid/slug"])(
    "does not submit an invalid manual slug %j",
    async (slug) => {
      const user = userEvent.setup();
      mount();
      await user.click(await screen.findByRole("button", { name: "Novo produto" }));
      await user.type(screen.getByRole("textbox", { name: "Nome" }), "Synthetic draft");
      if (slug) await user.type(screen.getByRole("textbox", { name: "Slug" }), slug);
      await user.click(screen.getByRole("button", { name: "Salvar rascunho" }));
      expect(screen.getByRole("textbox", { name: "Slug" })).toBeInvalid();
      expect(mock.execute).not.toHaveBeenCalled();
      expect(mock.read).toHaveBeenCalledTimes(1);
    },
  );
  it("requires a name and retains explicit input length boundaries", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole("button", { name: "Novo produto" }));
    await user.type(screen.getByRole("textbox", { name: "Slug" }), "synthetic-draft");
    await user.click(screen.getByRole("button", { name: "Salvar rascunho" }));
    expect(screen.getByRole("textbox", { name: "Nome" })).toBeInvalid();
    for (const [name, maximum] of [
      ["Nome", "240"],
      ["Slug", "160"],
      ["Resumo", "600"],
      ["Descrição", "20000"],
    ]) {
      expect(screen.getByRole("textbox", { name })).toHaveAttribute("maxlength", maximum);
    }
    expect(mock.execute).not.toHaveBeenCalled();
  });
  it("keeps an authorized reader unable to edit or administer", async () => {
    mock.read.mockResolvedValue({ ...workspace, permissions: { edit: false, administer: false } });
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole("button", { name: /Original product · Rascunho/ }));
    expect(screen.getByRole("textbox", { name: "Nome" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Salvar rascunho" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Novo produto" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publicar revisão" })).not.toBeInTheDocument();
    expect(mock.execute).not.toHaveBeenCalled();
  });
  it.each([403, 422])("preserves attempted input after a definite %i rejection", async (status) => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole("button", { name: /Original product · Rascunho/ }));
    await user.clear(screen.getByRole("textbox", { name: "Nome" }));
    await user.type(screen.getByRole("textbox", { name: "Nome" }), "Rejected attempt");
    mock.execute.mockRejectedValueOnce(new CatalogWorkspaceError(status, status === 403 ? "42501" : "23514"));
    await user.click(screen.getByRole("button", { name: "Salvar rascunho" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("textbox", { name: "Nome" })).toHaveValue("Rejected attempt");
    expect(screen.queryByRole("region", { name: "Comparação de versões" })).not.toBeInTheDocument();
    expect(mock.execute).toHaveBeenCalledTimes(1);
    expect(mock.read).toHaveBeenCalledTimes(1);
  });
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
  it("provides accessible names for manual form controls", async () => {
    mount();
    await screen.findByRole("button", { name: "Novo produto" });
    for (const role of ["textbox", "combobox"] as const) {
      for (const control of screen.getAllByRole(role)) expect(control).toHaveAccessibleName();
    }
    expect(screen.getByRole("combobox", { name: "Tipo" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Categoria / Família principal" })).toBeInTheDocument();
  });
  it("blocks further mutations after an unknown 503 outcome without retrying", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole("button", { name: /Original product · Rascunho/ }));
    await user.type(screen.getByRole("textbox", { name: "Nome" }), " attempted");
    mock.execute.mockRejectedValueOnce(new CatalogWorkspaceError(503, "unavailable"));
    await user.click(screen.getByRole("button", { name: "Salvar rascunho" }));
    await screen.findByText(/Operações bloqueadas até recarregar/);
    expect(screen.getByRole("textbox", { name: "Nome" })).toHaveValue("Original product attempted");
    await user.click(screen.getByRole("button", { name: "Salvar rascunho" }));
    expect(mock.execute).toHaveBeenCalledTimes(1);
    expect(mock.read).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Marcar como pronto" })).toBeDisabled();
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
  it("keeps duplicate input editable without creating a revision-comparison flow", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole("button", { name: "Novo produto" }));
    await user.type(screen.getByRole("textbox", { name: "Nome" }), "Duplicate attempt");
    await user.type(screen.getByRole("textbox", { name: "Slug" }), product.slug);
    mock.execute.mockRejectedValueOnce(new CatalogWorkspaceError(409, "23505"));
    await user.click(screen.getByRole("button", { name: "Salvar rascunho" }));
    await screen.findByText("Este slug ou vínculo já está em uso. Revise os valores antes de salvar.");
    expect(screen.queryByRole("region", { name: "Comparação de versões" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Slug" })).toHaveValue(product.slug);
    expect(screen.getByRole("button", { name: "Salvar rascunho" })).toBeEnabled();
    expect(mock.read).toHaveBeenCalledTimes(1);
    expect(mock.execute).toHaveBeenCalledTimes(1);
  });
});
