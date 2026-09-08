import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const signOut = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({
  permissions: ["cms:products.read", "cms:posts.read", "cms:pages.read"],
}));

vi.mock("@/admin/auth/AdminAuthContext", () => ({
  useAdminAuth: () => ({
    signOut,
    user: { email: "operador@gaiatec.com.br", user_metadata: { display_name: "Operador GAIATEC" } },
    profile: {
      roles: ["editor"],
      permissions: authState.permissions,
      ev2Capabilities: undefined,
    },
  }),
}));

import { AdminShell } from "@/admin/components/AdminShell";

function Destination() {
  const location = useLocation();
  return <output aria-label="Destino atual">{`${location.pathname}${location.search}`}</output>;
}

describe("shell administrativo achatado", () => {
  beforeEach(() => {
    localStorage.clear();
    signOut.mockClear();
    authState.permissions = ["cms:products.read", "cms:posts.read", "cms:pages.read"];
  });

  it("recolhe e expande a sidebar preservando a preferência", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route path="/admin" element={<AdminShell />}>
            <Route index element={<Destination />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    const collapse = screen.getByRole("button", { name: "Recolher menu administrativo" });
    await user.click(collapse);
    expect(screen.getByRole("button", { name: "Expandir menu administrativo" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(localStorage.getItem("gaiatec.admin.sidebar-collapsed")).toBe("true");
  });

  it("isola o conteúdo, prende o foco e restaura o acionador no menu móvel", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route path="/admin" element={<AdminShell />}>
            <Route index element={<Destination />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    const trigger = screen.getByRole("button", { name: "Abrir menu administrativo" });
    await user.click(trigger);
    const drawer = screen.getByRole("dialog", { name: "Menu principal do CMS" });
    const close = within(drawer).getByRole("button", { name: "Fechar menu administrativo" });
    expect(drawer).toHaveAttribute("aria-modal", "true");
    expect(container.querySelector("main")).toHaveAttribute("inert");
    expect(close).toHaveFocus();

    const last = within(drawer).getByRole("button", { name: "Sair" });
    last.focus();
    await user.tab();
    expect(screen.getByRole("link", { name: "CMS GAIATEC — visão geral" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Menu principal do CMS" })).not.toBeInTheDocument();
    expect(container.querySelector("main")).not.toHaveAttribute("inert");
    expect(trigger).toHaveFocus();
  });

  it("leva a busca global para Produtos com teclado e Enter", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route path="/admin" element={<AdminShell />}>
            <Route path="*" element={<Destination />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    await user.keyboard("{Control>}k{/Control}");
    const search = screen.getByRole("searchbox", { name: "Busca global no CMS — conteúdo permitido" });
    expect(search).toHaveFocus();
    await user.type(search, "medidor de vazão{Enter}");
    expect(screen.getByRole("status", { name: "Destino atual" })).toHaveTextContent(
      "/admin/produtos?q=medidor%20de%20vaz%C3%A3o",
    );
  });

  it("expõe ferramentas operacionais junto do catálogo quando permitidas", () => {
    authState.permissions = [
      "cms:products.read",
      "cms:products.edit",
      "cms:vocabularies.read",
      "cms:search.read",
    ];
    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route path="/admin" element={<AdminShell />}>
            <Route index element={<Destination />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Cadastro em massa" })).toHaveAttribute(
      "href",
      "/admin/produtos/importacao",
    );
    expect(screen.getByRole("link", { name: "Listas mestras" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Busca e sinônimos" })).toBeInTheDocument();
  });

  it("não monta a rota direta quando falta a permissão correspondente", () => {
    authState.permissions = ["cms:products.read"];
    render(
      <MemoryRouter initialEntries={["/admin/usuarios"]}>
        <Routes>
          <Route path="/admin" element={<AdminShell />}>
            <Route path="usuarios" element={<Destination />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Acesso negado" })).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Destino atual" })).not.toBeInTheDocument();
  });
});
