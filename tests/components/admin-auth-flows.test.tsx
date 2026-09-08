import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  value: {
    status: "signed_out",
    session: null as unknown,
    user: null as { email?: string } | null,
    signIn: vi.fn(async () => ({ error: null as string | null })),
    requestRecovery: vi.fn(async () => ({ error: null as string | null })),
    updatePassword: vi.fn(async () => ({ error: null as string | null })),
    beginMfaEnrollment: vi.fn(),
    verifyMfa: vi.fn(async () => ({ error: null as string | null })),
    signOut: vi.fn(),
    retryAccess: vi.fn(async () => undefined),
  },
}));

vi.mock("@/admin/auth/AdminAuthContext", () => ({
  useAdminAuth: () => auth.value,
}));

import AdminLoginPage from "@/admin/pages/LoginPage";
import AdminMfaPage from "@/admin/pages/MfaPage";
import AdminRecoveryPage from "@/admin/pages/RecoveryPage";
import AdminSetPasswordPage from "@/admin/pages/SetPasswordPage";
import { RequireAdminAuth } from "@/admin/auth/RequireAdminAuth";

describe("fluxos de autenticação administrativa", () => {
  beforeEach(() => {
    auth.value.status = "signed_out";
    auth.value.session = null;
    auth.value.user = null;
    auth.value.signIn.mockReset().mockResolvedValue({ error: null });
    auth.value.requestRecovery.mockReset().mockResolvedValue({ error: null });
    auth.value.updatePassword.mockReset().mockResolvedValue({ error: null });
    auth.value.beginMfaEnrollment.mockReset();
    auth.value.verifyMfa.mockReset().mockResolvedValue({ error: null });
    auth.value.signOut.mockReset();
    auth.value.retryAccess.mockReset().mockResolvedValue(undefined);
  });

  it("identifica a sessão sem convite e permite revalidar uma concessão nominal", async () => {
    const user = userEvent.setup();
    auth.value.status = "unauthorized";
    auth.value.user = { email: "operador@gaiatec.com.br" };
    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <RequireAdminAuth>
          <p>Área protegida</p>
        </RequireAdminAuth>
      </MemoryRouter>,
    );

    expect(screen.getByText("operador@gaiatec.com.br")).toBeInTheDocument();
    expect(screen.queryByText("Área protegida")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Verificar acesso novamente" }));
    expect(auth.value.retryAccess).toHaveBeenCalledTimes(1);
  });

  it("envia as credenciais e oferece recuperação sem revelar a existência da conta", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/admin/login",
            state: { reason: "session_required", from: "/admin/produtos/importacao" },
          },
        ]}
      >
        <Routes>
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin/recuperar-senha" element={<AdminRecoveryPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getByText("Sua sessão não está ativa. Entre novamente para acessar a área solicitada."),
    ).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "E-mail corporativo" }), "operador@gaiatec.com.br");
    await user.type(screen.getByLabelText("Senha"), "senha-segura");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(auth.value.signIn).toHaveBeenCalledWith("operador@gaiatec.com.br", "senha-segura");

    await user.click(screen.getByRole("link", { name: "Esqueci minha senha" }));
    await user.type(screen.getByRole("textbox", { name: "E-mail corporativo" }), "operador@gaiatec.com.br");
    await user.click(screen.getByRole("button", { name: "Solicitar link" }));
    expect(auth.value.requestRecovery).toHaveBeenCalledWith("operador@gaiatec.com.br");
    expect(
      await screen.findByText("Solicitação recebida. Verifique a caixa de entrada e o spam."),
    ).toBeInTheDocument();
  });

  it("explica a falta de perfil CMS depois que o Auth aceita as credenciais", async () => {
    const user = userEvent.setup();
    auth.value.signIn.mockImplementationOnce(async () => {
      auth.value.status = "unauthorized";
      auth.value.session = { user: { id: "rdo-only" } };
      auth.value.user = { email: "operador-rdo@gaiatec.com.br" };
      return { error: null };
    });
    render(
      <MemoryRouter initialEntries={["/admin/login"]}>
        <Routes>
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route
            path="/admin"
            element={
              <RequireAdminAuth>
                <p>Área protegida</p>
              </RequireAdminAuth>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(screen.getByRole("textbox", { name: "E-mail corporativo" }), "rdo@gaiatec.com.br");
    await user.type(screen.getByLabelText("Senha"), "senha-correta-no-rdo");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(
      await screen.findByRole("heading", { name: "Acesso administrativo não autorizado" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/O acesso ao RDO não concede acesso administrativo/)).toBeInTheDocument();
    expect(screen.queryByText("Área protegida")).not.toBeInTheDocument();
  });

  it("preserva somente o destino administrativo seguro durante login e MFA", () => {
    auth.value.status = "mfa_challenge";
    auth.value.session = { user: { id: "operador" } };
    const view = render(
      <MemoryRouter
        initialEntries={[{ pathname: "/admin/mfa", state: { from: "/admin/produtos/importacao" } }]}
      >
        <Routes>
          <Route path="/admin/mfa" element={<AdminMfaPage />} />
          <Route path="/admin/produtos/importacao" element={<p>Destino protegido restaurado</p>} />
        </Routes>
      </MemoryRouter>,
    );
    auth.value.status = "ready";
    view.rerender(
      <MemoryRouter
        initialEntries={[{ pathname: "/admin/mfa", state: { from: "/admin/produtos/importacao" } }]}
      >
        <Routes>
          <Route path="/admin/mfa" element={<AdminMfaPage />} />
          <Route path="/admin/produtos/importacao" element={<p>Destino protegido restaurado</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("Destino protegido restaurado")).toBeInTheDocument();
  });

  it("preserva a rota protegida ao exigir MFA durante a restauração da sessão", () => {
    auth.value.status = "mfa_challenge";
    auth.value.session = { user: { id: "operador" } };
    const tree = () => (
      <MemoryRouter initialEntries={["/admin/produtos/importacao?lote=1#validacao"]}>
        <Routes>
          <Route path="/admin/mfa" element={<AdminMfaPage />} />
          <Route
            path="/admin/produtos/importacao"
            element={
              <RequireAdminAuth>
                <p>Importação protegida restaurada</p>
              </RequireAdminAuth>
            }
          />
        </Routes>
      </MemoryRouter>
    );
    const view = render(tree());
    expect(screen.getByRole("heading", { name: "Confirmar sua identidade" })).toBeInTheDocument();

    auth.value.status = "ready";
    view.rerender(tree());

    expect(screen.getByText("Importação protegida restaurada")).toBeInTheDocument();
  });

  it("valida a nova senha e só conclui com uma sessão de convite ou recuperação", async () => {
    const user = userEvent.setup();
    auth.value.status = "password_update";
    auth.value.session = { user: { id: "recuperacao" } };
    render(
      <MemoryRouter initialEntries={["/admin/definir-senha"]}>
        <Routes>
          <Route path="/admin/definir-senha" element={<AdminSetPasswordPage />} />
          <Route path="/admin" element={<p>Painel protegido</p>} />
        </Routes>
      </MemoryRouter>,
    );

    const password = screen.getByLabelText("Nova senha");
    const confirmation = screen.getByLabelText("Confirmar senha");
    await user.type(password, "Curta!1");
    await user.type(confirmation, "Curta!1");
    expect(password).toHaveAttribute("minlength", "12");
    await user.click(screen.getByRole("button", { name: "Salvar senha" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Use pelo menos 12 caracteres.");
    expect(auth.value.updatePassword).not.toHaveBeenCalled();

    await user.clear(password);
    await user.clear(confirmation);
    await user.type(password, "FraseSegura!123");
    await user.type(confirmation, "FraseDiferente!123");
    await user.click(screen.getByRole("button", { name: "Salvar senha" }));
    expect(screen.getByRole("alert")).toHaveTextContent("As senhas não coincidem.");
    expect(auth.value.updatePassword).not.toHaveBeenCalled();

    await user.clear(confirmation);
    await user.type(confirmation, "FraseSegura!123");
    await user.click(screen.getByRole("button", { name: "Salvar senha" }));
    expect(auth.value.updatePassword).toHaveBeenCalledWith("FraseSegura!123");
    expect(await screen.findByText("Painel protegido")).toBeInTheDocument();
  });

  it("recupera a tela de nova senha após falha inesperada sem expor detalhes técnicos", async () => {
    const user = userEvent.setup();
    auth.value.status = "password_update";
    auth.value.session = { user: { id: "recuperacao" } };
    auth.value.updatePassword.mockRejectedValueOnce(
      new Error("PGRST500 correlation_id=70000000-0000-4000-8000-000000000001"),
    );
    render(
      <MemoryRouter initialEntries={["/admin/definir-senha"]}>
        <AdminSetPasswordPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText("Nova senha"), "FraseSegura!123");
    await user.type(screen.getByLabelText("Confirmar senha"), "FraseSegura!123");
    await user.click(screen.getByRole("button", { name: "Salvar senha" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível salvar a nova senha. Tente novamente.",
    );
    expect(screen.getByRole("button", { name: "Salvar senha" })).toBeEnabled();
    expect(screen.queryByText(/PGRST|correlation_id|70000000/)).not.toBeInTheDocument();
  });

  it("aceita somente seis dígitos no desafio TOTP e permite sair", async () => {
    const user = userEvent.setup();
    auth.value.status = "mfa_challenge";
    auth.value.session = { user: { id: "operador" } };
    render(
      <MemoryRouter initialEntries={["/admin/mfa"]}>
        <Routes>
          <Route path="/admin/mfa" element={<AdminMfaPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const code = screen.getByRole("textbox", { name: "Código de 6 dígitos" });
    const submit = screen.getByRole("button", { name: "Verificar e entrar" });
    expect(submit).toBeDisabled();
    await user.type(code, "12a34567");
    expect(code).toHaveValue("123456");
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(auth.value.verifyMfa).toHaveBeenCalledWith("123456", undefined);
    await user.click(screen.getByRole("button", { name: "Cancelar e sair" }));
    expect(auth.value.signOut).toHaveBeenCalledTimes(1);
  });
});
