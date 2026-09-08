import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminBulkImportPage, { normalizeBulkImportErrors } from "@/admin/pages/AdminBulkImportPage";

const mocks = vi.hoisted(() => ({
  session: { access_token: "test" },
  controlledVocabularyCommand: vi.fn(),
}));

const controlledLists = [
  "product.category",
  "product.application_magnitude",
  "product.technology",
  "product.installation_operation",
  "product.monitored_element",
].map((listKey, index) => ({
  id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  list_key: listKey,
  entity_type: "product",
  dimension_key: listKey,
  label: listKey,
  description: "Lista controlada sintética",
  public_visible: true,
  active: true,
  sort_order: index,
  updated_at: "2026-09-07T12:00:00.000Z",
  options: [
    {
      id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      slug: `opcao-${index + 1}`,
      label: `Opção ${index + 1}`,
      description: "Opção controlada sintética",
      public_visible: true,
      active: true,
      sort_order: 0,
      updated_at: "2026-09-07T12:00:00.000Z",
    },
  ],
}));

vi.mock("@/admin/auth/AdminAuthContext", () => ({
  useAdminAuth: () => ({
    session: mocks.session,
    profile: { permissions: ["cms:products.edit"] },
  }),
}));

vi.mock("@/admin/api/cms-api", () => ({
  bulkImportCommand: vi.fn(),
  controlledVocabularyCommand: mocks.controlledVocabularyCommand,
}));

describe("cadastro em massa em quatro etapas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.controlledVocabularyCommand.mockResolvedValue({ items: controlledLists });
  });

  it("exige declaração de origem antes de habilitar o arquivo", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/admin/produtos/importacao"]}>
        <AdminBulkImportPage />
      </MemoryRouter>,
    );

    for (const name of ["Arquivo", "Validação", "Dry-run", "Confirmação"])
      expect(screen.getByRole("tab", { name: new RegExp(name) })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Arquivo/ })).toHaveAttribute(
      "aria-controls",
      "bulk-import-panel-file",
    );
    expect(screen.getByRole("tabpanel", { name: /Arquivo/ })).toHaveAttribute("id", "bulk-import-panel-file");

    const file = screen.getByLabelText(/Arquivo `.xlsx`/);
    expect(file).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /Declaro que o arquivo/ }));
    await waitFor(() => expect(file).toBeEnabled());
  });

  it("não mostra detalhes técnicos quando as listas mestras falham", async () => {
    mocks.controlledVocabularyCommand.mockRejectedValueOnce(
      new Error('[{"code":"invalid_type","path":["items",0,"list_key"],"expected":"string"}]'),
    );

    render(
      <MemoryRouter initialEntries={["/admin/produtos/importacao"]}>
        <AdminBulkImportPage />
      </MemoryRouter>,
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Não foi possível carregar as listas mestras de produtos.");
    expect(alert).not.toHaveTextContent(/invalid_type|list_key|expected|path/i);
  });

  it("projeta erros estruturados do servidor apenas para campos e mensagens operacionais", () => {
    expect(
      normalizeBulkImportErrors([
        {
          sheet: "private_table",
          row: 2,
          field: "payload.internal_id",
          message: 'PGRST116: {"itemId":"45000000-0000-4000-8000-000000000001","path":"/storage/v1/private"}',
        },
        {
          sheet: "Produtos",
          row: 3,
          field: "slug",
          message: "O slug já existe no CMS.",
        },
      ]),
    ).toEqual([
      {
        sheet: "Produtos",
        row: 2,
        field: "Dados da linha",
        message: "Revise os dados desta linha antes de continuar.",
      },
      {
        sheet: "Produtos",
        row: 3,
        field: "Endereço público",
        message: "Um endereço público do arquivo já está em uso.",
      },
    ]);
  });
});
