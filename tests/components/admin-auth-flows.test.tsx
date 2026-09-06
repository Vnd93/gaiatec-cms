import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  value: {
    status: "signed_out",
    session: null as unknown,
    signIn: vi.fn(async () => ({ error: null as string | null })),
    requestRecovery: vi.fn(async () => ({ error: null as string | null })),
    beginMfaEnrollment: vi.fn(),
    verifyMfa: vi.fn(async () => ({ error: null as string | null })),
    signOut: vi.fn(),
  },
}));

vi.mock("@/admin/auth/AdminAuthContext", () => ({
  useAdminAuth: () => auth.value,
}));

import AdminLoginPage from "@/admin/pages/LoginPage";
import AdminMfaPage from "@/admin/pages/MfaPage";
import AdminRecoveryPage from "@/admin/pages/RecoveryPage";

describe("fluxos de autenticação administrativa", () => {
  beforeEach(() => {
    auth.value.status = "signed_out";
    auth.value.session = null;
    auth.value.signIn.mockClear();
    auth.value.requestRecovery.mockClear();
    auth.value.verifyMfa.mockClear();
  });

  it("envia as credenciais e oferece recuperação sem revelar a existência da conta", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={[{ pathname: "/admin/login", state: { reason: "session_required" } }]}>
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
