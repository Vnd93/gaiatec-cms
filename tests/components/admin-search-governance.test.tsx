import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminSearchGovernancePage from "@/admin/pages/AdminSearchGovernancePage";

const mocks = vi.hoisted(() => ({
  command: vi.fn(),
  session: { access_token: "test-token" },
  profile: { permissions: ["cms:search.manage"] },
}));

vi.mock("@/admin/auth/AdminAuthContext", () => ({
  useAdminAuth: () => ({ session: mocks.session, profile: mocks.profile }),
}));

vi.mock("@/admin/ev2-runtime", () => ({
  cmsEnvironment: () => "local",
  isEv2FeatureEnabled: () => false,
}));

vi.mock("@/admin/api/cms-api", () => ({
  searchGovernanceCommand: mocks.command,
}));

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/admin/catalogo/dados-mestres?tab=busca"]}>
      <AdminSearchGovernancePage />
    </MemoryRouter>,
  );
}

describe("governança de busca orientada ao operador", () => {
  beforeEach(() => {
    mocks.command.mockReset();
    mocks.command.mockImplementation(async (_session, body: { action: string }) => {
      if (body.action === "list") return { items: [] };
      return {};
    });
  });

  it("adiciona e remove variações individualmente e envia uma lista estruturada", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("heading", { name: "Termos equivalentes" });
    const save = screen.getByRole("button", { name: "Adicionar sinônimo" });
    expect(save).toBeDisabled();
    expect(screen.queryByText(/separad[ao]s? por vírgula/i)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Termo principal"), "medição");
    await user.type(screen.getByLabelText("Fonte ou autorização"), "Vocabulário comercial aprovado");
    await user.type(screen.getByLabelText("Nova variação"), "instrumentação");
    await user.click(screen.getByRole("button", { name: "Adicionar variação" }));
    await user.type(screen.getByLabelText("Nova variação"), "sensoriamento");
    await user.keyboard("{Enter}");

    expect(screen.getByRole("button", { name: "Remover variação instrumentação" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remover variação sensoriamento" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remover variação sensoriamento" }));
    expect(screen.queryByRole("button", { name: "Remover variação sensoriamento" })).not.toBeInTheDocument();

    await user.click(save);
    await waitFor(() =>
      expect(mocks.command).toHaveBeenCalledWith(
        mocks.session,
        expect.objectContaining({
          action: "upsert",
          canonicalTerm: "medição",
          aliases: ["instrumentação"],
          sourceReference: "Vocabulário comercial aprovado",
        }),
      ),
    );
  });
});
