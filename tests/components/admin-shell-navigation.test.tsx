import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const signOut = vi.hoisted(() => vi.fn());

vi.mock("@/admin/auth/AdminAuthContext", () => ({
  useAdminAuth: () => ({
    signOut,
    user: { email: "operador@gaiatec.com.br", user_metadata: { display_name: "Operador GAIATEC" } },
    profile: {
      roles: ["editor"],
      permissions: ["cms:products.read", "cms:posts.read", "cms:pages.read"],
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
});
