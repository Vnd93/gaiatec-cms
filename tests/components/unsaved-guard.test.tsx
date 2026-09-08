import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, Link, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { UnsavedChangesGuard } from "@/admin/components/UnsavedChangesGuard";

describe("proteção de alterações não salvas", () => {
  it("mantém o editor aberto até o operador confirmar a saída", async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        {
          path: "/editar",
          element: (
            <>
              <h1>Editor aberto</h1>
              <UnsavedChangesGuard dirty />
              <Link to="/lista">Voltar à lista</Link>
            </>
          ),
        },
        { path: "/lista", element: <h1>Lista</h1> },
      ],
      { initialEntries: ["/editar"] },
    );
    render(<RouterProvider router={router} />);

    await user.click(screen.getByRole("link", { name: "Voltar à lista" }));
    expect(screen.getByRole("alertdialog", { name: "Sair sem salvar?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continuar editando" }));
    expect(screen.getByRole("heading", { name: "Editor aberto" })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Voltar à lista" }));
    await user.click(screen.getByRole("button", { name: "Sair sem salvar" }));
    expect(await screen.findByRole("heading", { name: "Lista" })).toBeInTheDocument();
  });

  it("mantém o foco no diálogo, fecha por Escape e devolve o foco ao link", async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        {
          path: "/editar",
          element: (
            <>
              <h1>Editor aberto</h1>
              <UnsavedChangesGuard dirty />
              <Link to="/lista">Voltar à lista</Link>
            </>
          ),
        },
        { path: "/lista", element: <h1>Lista</h1> },
      ],
      { initialEntries: ["/editar"] },
    );
    const { container } = render(<RouterProvider router={router} />);
    const link = screen.getByRole("link", { name: "Voltar à lista" });

    await user.click(link);
    const dialog = screen.getByRole("alertdialog", { name: "Sair sem salvar?" });
    expect(dialog.closest("[data-admin-modal-layer]")?.parentElement).toBe(document.body);
    expect(container).toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "Continuar editando" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog", { name: "Sair sem salvar?" })).not.toBeInTheDocument();
    expect(container).not.toHaveAttribute("inert");
    expect(link).toHaveFocus();
  });
});
