import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => {
  let callback: (event: string, session: any) => void = () => undefined;
  const session = (userId = "user-a", token = "token-a") => ({
    access_token: token,
    refresh_token: "refresh",
    expires_in: 3600,
    token_type: "bearer",
    user: { id: userId, email: "editor@gaiatec.test" },
  });
  return {
    session,
    emit: (event: string, value: any) => callback(event, value),
    supabase: {
      auth: {
        getSession: vi.fn(async () => ({ data: { session: session() } })),
        onAuthStateChange: vi.fn((next: any) => {
          callback = next;
          return { data: { subscription: { unsubscribe: vi.fn() } } };
        }),
        signOut: vi.fn(async () => ({ error: null })),
        mfa: {
          listFactors: vi.fn(async () => ({ data: { totp: [], all: [] } })),
          getAuthenticatorAssuranceLevel: vi.fn(async () => ({ data: { currentLevel: "aal2" } })),
        },
      },
    },
  };
});

vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "http://supabase.test",
  SUPABASE_ANON_KEY: "anon",
  supabase: authMock.supabase,
}));

import { AdminAuthProvider, useAdminAuth } from "@/admin/auth/AdminAuthContext";
import { isEv2FeatureEnabled } from "@/admin/ev2-runtime";
import { RequireAdminAuth } from "@/admin/auth/RequireAdminAuth";

function EditorHarness() {
  const location = useLocation();
  const { profile } = useAdminAuth();
  return (
    <div>
      <h1>Editor preservado</h1>
      <span data-testid="route">{location.pathname}</span>
      <span data-testid="ev2-dam">{isEv2FeatureEnabled(profile, "ev2.dam") ? "enabled" : "disabled"}</span>
      <label>
        Nome
        <input />
      </label>
      <div role="tablist">
        <button role="tab">Identificação</button>
        <button role="tab" aria-selected="true">
          Classificação
        </button>
      </div>
    </div>
  );
}

function App() {
  return (
    <MemoryRouter initialEntries={["/admin/produtos/produto-a"]}>
      <AdminAuthProvider>
        <Routes>
          <Route path="/admin/login" element={<h1>Login seguro</h1>} />
          <Route
            path="/admin/produtos/:id"
            element={
              <RequireAdminAuth>
                <EditorHarness />
              </RequireAdminAuth>
            }
          />
        </Routes>
      </AdminAuthProvider>
    </MemoryRouter>
  );
}

describe("continuidade segura da sessão administrativa", () => {
  beforeEach(() => {
    authMock.supabase.auth.getSession.mockResolvedValue({ data: { session: authMock.session() } });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              userId: "user-a",
              status: "active",
              roles: ["editor"],
              permissions: ["cms:products.edit"],
              mfaRequired: false,
              mfaVerified: true,
              accessGranted: true,
              activated: false,
              ev2Capabilities: {
                schemaVersion: 1,
                status: "ready",
                environment: "local",
                siteKey: "main",
                evaluatedAt: new Date().toISOString(),
                capabilities: {
                  "ev2.dam": {
                    schemaVersion: 1,
                    key: "ev2.dam",
                    enabled: true,
                    source: "override",
                    evaluatedAt: new Date().toISOString(),
                  },
                },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );
  });

  it("preserva rota, tab e valores durante visibilitychange, foco e TOKEN_REFRESHED do mesmo usuário", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Editor preservado" })).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Nome" }), "Rascunho em preenchimento");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("blur"));
      window.dispatchEvent(new Event("focus"));
      authMock.emit("TOKEN_REFRESHED", authMock.session("user-a", "token-renovado"));
    });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Validando acesso")).not.toBeInTheDocument();
    expect(screen.getByTestId("route")).toHaveTextContent("/admin/produtos/produto-a");
    expect(screen.getByRole("tab", { name: "Classificação" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("textbox", { name: "Nome" })).toHaveValue("Rascunho em preenchimento");
  });

  it("continua fail-closed quando a sessão expira ou sai", async () => {
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Editor preservado" })).toBeInTheDocument();
    act(() => authMock.emit("SIGNED_OUT", null));
    expect(await screen.findByRole("heading", { name: "Login seguro" })).toBeInTheDocument();
  });

  it("preserva uma sessão já autorizada quando a renovação sofre falha transitória", async () => {
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Editor preservado" })).toBeInTheDocument();
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Muitas tentativas." }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }),
    );

    act(() => authMock.emit("TOKEN_REFRESHED", authMock.session("user-a", "token-renovado")));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("heading", { name: "Editor preservado" })).toBeInTheDocument();
    expect(screen.queryByText("Acesso administrativo não autorizado")).not.toBeInTheDocument();
    expect(screen.getByTestId("ev2-dam")).toHaveTextContent("disabled");
  });

  it("distingue indisponibilidade transitória de falta de permissão na validação inicial", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Muitas tentativas." }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Validação de acesso temporariamente indisponível" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
    expect(screen.queryByText("Acesso administrativo não autorizado")).not.toBeInTheDocument();
  });
});
