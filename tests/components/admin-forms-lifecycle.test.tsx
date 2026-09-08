import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminFormsPage from "@/admin/pages/AdminFormsPage";

const formId = "92000000-0000-4000-8000-000000000001";
const versionId = "92000000-0000-4000-8000-000000000002";
const correlationId = "92000000-0000-4000-8000-000000000099";

const mocks = vi.hoisted(() => ({
  rows: [] as Array<Record<string, any>>,
  leadCommand: vi.fn(),
  session: { access_token: "test-token", user: { id: "92000000-0000-4000-8000-000000000010" } },
  profile: { permissions: ["cms:forms.read", "cms:forms.edit", "cms:forms.publish"] },
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => {
      const query: Record<string, any> = {};
      query.select = () => query;
      query.order = () => query;
      query.then = (
        resolve: (result: { data: Array<Record<string, any>>; error: null }) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => Promise.resolve({ data: mocks.rows, error: null }).then(resolve, reject);
      return query;
    },
  },
}));

vi.mock("@/admin/auth/AdminAuthContext", () => ({
  useAdminAuth: () => ({ session: mocks.session, profile: mocks.profile }),
}));

vi.mock("@/admin/api/cms-api", () => ({ leadCommand: mocks.leadCommand }));
vi.mock("@/admin/components/UnsavedChangesGuard", () => ({
  UnsavedChangesGuard: ({ dirty }: { dirty: boolean }) => (
    <div data-testid="forms-dirty">{String(dirty)}</div>
  ),
}));

function formRow(status: "published" | "retired") {
  return {
    id: formId,
    form_key: "qa-formulario",
    title: "Formulário sintético",
    purpose: "Validar a retirada governada.",
    status,
    active_version_id: status === "published" ? versionId : null,
    lock_version: status === "published" ? 4 : 5,
    cms_form_versions: [
      {
        id: versionId,
        version: 1,
        status: status === "published" ? "published" : "retired",
        definition: {
          fields: [
            {
              id: "92000000-0000-4000-8000-000000000003",
              key: "email",
              label: "E-mail",
              type: "email",
              required: true,
              maxLength: 254,
              options: [],
              personalData: true,
              order: 0,
            },
          ],
          successMessage: "Recebido.",
          submitLabel: "Enviar",
        },
        consent_text: "Aceito o tratamento dos dados sintéticos.",
        consent_version: "qa-v1",
        privacy_path: "/politica-de-privacidade",
        sla_minutes: 60,
        retention_days: 30,
      },
    ],
  };
}

async function openForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: /Formulário sintético/ }));
  await user.click(screen.getByRole("button", { name: "Ver ficha completa" }));
}

describe("ciclo de retirada dos formulários", () => {
  beforeEach(() => {
    mocks.rows = [formRow("published")];
    mocks.profile.permissions = ["cms:forms.read", "cms:forms.edit", "cms:forms.publish"];
    mocks.leadCommand.mockReset();
    mocks.leadCommand.mockImplementation(async (_session, command: Record<string, unknown>) => {
      if (command.action === "list_forms") return { items: mocks.rows };
      return {};
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("inicia um formulário realmente vazio e não persiste conteúdo editorial implícito", async () => {
    mocks.rows = [];
    const user = userEvent.setup();
    render(<AdminFormsPage />);

    await user.click(await screen.findByRole("button", { name: "Novo formulário" }));

    expect(screen.getByRole("textbox", { name: "Título" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Finalidade" })).toHaveValue("");
    expect(screen.queryByRole("textbox", { name: "Chave" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Rótulo" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Texto do consentimento" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Versão do consentimento" })).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "Política de privacidade" })).toHaveValue(
      "/politica-de-privacidade",
    );
    expect(screen.getByRole("spinbutton", { name: "Prazo de atendimento (minutos)" })).toHaveValue(null);
    expect(screen.getByRole("spinbutton", { name: "Retenção (dias)" })).toHaveValue(null);
    expect(screen.getByRole("textbox", { name: "Botão" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Confirmação" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Motivo" })).toHaveValue("");
    expect(screen.getByRole("checkbox", { name: "Obrigatório" })).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: "Salvar nova versão" }));
    expect(mocks.leadCommand).not.toHaveBeenCalledWith(
      mocks.session,
      expect.objectContaining({ action: "save_form" }),
    );
  });

  it("protege a edição ao trocar de formulário ou iniciar um novo e limpa o estado após salvar", async () => {
    const user = userEvent.setup();
    mocks.leadCommand.mockImplementation(async (_session, command: Record<string, unknown>) => {
      if (command.action === "list_forms") return { items: mocks.rows };
      return { formId, versionId, version: 2, correlationId };
    });
    render(<AdminFormsPage />);
    await openForm(user);

    const title = screen.getByRole("textbox", { name: "Título" });
    await user.clear(title);
    await user.type(title, "Alteração ainda não salva");
    expect(screen.getByTestId("forms-dirty")).toHaveTextContent("true");

    await user.click(screen.getByRole("button", { name: /Formulário sintético/ }));
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await user.click(screen.getByRole("button", { name: "Ver ficha completa" }));
    expect(window.confirm).toHaveBeenLastCalledWith(
      "Descartar as alterações não salvas? Esta ação substituirá o formulário que está em edição.",
    );
    expect(title).toHaveValue("Alteração ainda não salva");

    vi.mocked(window.confirm).mockReturnValueOnce(true);
    await user.click(screen.getByRole("button", { name: "Ver ficha completa" }));
    expect(screen.getByRole("textbox", { name: "Título" })).toHaveValue("Formulário sintético");
    expect(screen.getByTestId("forms-dirty")).toHaveTextContent("false");

    await user.type(screen.getByRole("textbox", { name: "Título" }), " ajustado");
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await user.click(screen.getByRole("button", { name: "Novo formulário" }));
    expect(screen.getByRole("textbox", { name: "Título" })).toHaveValue("Formulário sintético ajustado");
    vi.mocked(window.confirm).mockReturnValueOnce(true);
    await user.click(screen.getByRole("button", { name: "Novo formulário" }));
    expect(screen.getByRole("textbox", { name: "Título" })).toHaveValue("");
    expect(screen.getByTestId("forms-dirty")).toHaveTextContent("false");

    await openForm(user);
    await user.type(screen.getByRole("textbox", { name: "Título" }), " salvo");
    await user.type(screen.getByRole("textbox", { name: "Motivo" }), "Nova versão homologada");
    await user.click(screen.getByRole("button", { name: "Salvar nova versão" }));
    await waitFor(() => expect(screen.getByTestId("forms-dirty")).toHaveTextContent("false"));
  });

  it("mantém todos os controles mutáveis inativos sem cms:forms.edit", async () => {
    mocks.profile.permissions = ["cms:forms.read", "cms:forms.publish"];
    const user = userEvent.setup();
    const { container } = render(<AdminFormsPage />);
    await openForm(user);

    expect(screen.queryByRole("button", { name: "Novo formulário" })).not.toBeInTheDocument();
    const controls = container.querySelectorAll<
      HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("form button, form input, form select, form textarea");
    expect(controls.length).toBeGreaterThan(0);
    controls.forEach((control) => expect(control).toBeDisabled());
    expect(screen.getByTestId("forms-dirty")).toHaveTextContent("false");
  });

  it("despublica com lock otimista, motivo e confirmação", async () => {
    const user = userEvent.setup();
    mocks.leadCommand.mockImplementation(async (_session, command: Record<string, unknown>) => {
      if (command.action === "list_forms") return { items: mocks.rows };
      if (command.action === "archive_form") mocks.rows = [formRow("retired")];
      return { status: "retired", lockVersion: 5, correlationId };
    });
    render(<AdminFormsPage />);
    await openForm(user);
    await user.type(
      screen.getByRole("textbox", { name: /Motivo da retirada ou restauração/ }),
      "Retirada sintética final",
    );

    await user.click(screen.getByRole("button", { name: "Despublicar e arquivar formulário" }));

    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() =>
      expect(mocks.leadCommand).toHaveBeenCalledWith(
        mocks.session,
        expect.objectContaining({
          action: "archive_form",
          formId,
          expectedLockVersion: 4,
          reason: "Retirada sintética final",
        }),
      ),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Formulário despublicado e arquivado");
  });

  it("restaura explicitamente a versão retirada", async () => {
    const user = userEvent.setup();
    mocks.rows = [formRow("retired")];
    mocks.leadCommand.mockImplementation(async (_session, command: Record<string, unknown>) => {
      if (command.action === "list_forms") return { items: mocks.rows };
      if (command.action === "restore_form") mocks.rows = [formRow("published")];
      return { status: "published", lockVersion: 6, correlationId };
    });
    render(<AdminFormsPage />);
    await openForm(user);
    await user.type(
      screen.getByRole("textbox", { name: /Motivo da retirada ou restauração/ }),
      "Restaurar versão homologada",
    );

    await user.click(screen.getByRole("button", { name: "Restaurar versão 1 e publicar" }));

    expect(window.confirm).toHaveBeenCalledWith(
      "Restaurar versão 1? A versão voltará a receber leads no site público.",
    );
    await waitFor(() =>
      expect(mocks.leadCommand).toHaveBeenCalledWith(
        mocks.session,
        expect.objectContaining({
          action: "restore_form",
          formId,
          sourceVersionId: versionId,
          expectedLockVersion: 5,
          reason: "Restaurar versão homologada",
        }),
      ),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Versão restaurada e republicada");
  });

  it("não executa retirada sem motivo auditável", async () => {
    const user = userEvent.setup();
    mocks.leadCommand.mockImplementation(async (_session, command: Record<string, unknown>) => {
      if (command.action === "list_forms") return { items: mocks.rows };
      return { status: "retired", lockVersion: 5, correlationId };
    });
    render(<AdminFormsPage />);
    await openForm(user);

    await user.click(screen.getByRole("button", { name: "Despublicar e arquivar formulário" }));

    expect(
      await screen.findByText("Informe o motivo da retirada com pelo menos 3 caracteres."),
    ).toBeVisible();
    expect(mocks.leadCommand).not.toHaveBeenCalledWith(
      mocks.session,
      expect.objectContaining({ action: "archive_form" }),
    );
  });
});
