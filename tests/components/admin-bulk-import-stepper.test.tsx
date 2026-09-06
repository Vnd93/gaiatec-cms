import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminBulkImportPage from "@/admin/pages/AdminBulkImportPage";

vi.mock("@/admin/auth/AdminAuthContext", () => ({
  useAdminAuth: () => ({
    session: { access_token: "test" },
    profile: { permissions: ["cms:products.edit"] },
  }),
}));

vi.mock("@/admin/api/cms-api", () => ({
  bulkImportCommand: vi.fn(),
}));

describe("cadastro em massa em quatro etapas", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exige declaração de origem antes de habilitar o arquivo", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/admin/produtos/importacao"]}>
        <AdminBulkImportPage />
      </MemoryRouter>,
    );

    for (const name of ["Arquivo", "Validação", "Dry-run", "Confirmação"])
      expect(screen.getByRole("tab", { name: new RegExp(name) })).toBeInTheDocument();

    const file = screen.getByLabelText(/Arquivo `.xlsx`/);
    expect(file).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /Declaro que o arquivo/ }));
    expect(file).toBeEnabled();
  });
});
