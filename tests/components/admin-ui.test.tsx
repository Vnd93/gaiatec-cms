import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import {
  AdminAlert,
  AdminToast,
  ConfirmDialog,
  DataTable,
  FilterBar,
  PageHeader,
  ModuleTabs,
  RecordDrawer,
  RelationMatrix,
  StatePanel,
  StepTabs,
} from "@/admin/components/AdminUI";

describe("sistema compartilhado do admin", () => {
  it("expõe cabeçalho, filtros, caption e estado com semântica operacional", () => {
    render(
      <>
        <PageHeader title="Produtos" eyebrow="Catálogo" description="Gerencie os produtos novos." />
        <FilterBar summary="1 resultado">
          <label>
            Busca
            <input />
          </label>
        </FilterBar>
        <DataTable caption="Produtos do CMS">
          <tbody>
            <tr>
              <td>Produto sintético</td>
            </tr>
          </tbody>
        </DataTable>
        <StatePanel kind="warning" title="Revisão necessária" description="Corrija os campos indicados." />
        <AdminAlert tone="success">Rascunho salvo.</AdminAlert>
      </>,
    );
    expect(screen.getByRole("heading", { name: "Produtos" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Busca e filtros" })).toBeInTheDocument();
    expect(screen.getByText("Produtos do CMS")).toBeInTheDocument();
    expect(screen.getAllByRole("status")).toHaveLength(2);
  });

  it("move etapas com setas e anuncia a seleção", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <>
        <StepTabs
          idPrefix="editor"
          label="Etapas"
          active="a"
          onChange={onChange}
          steps={[
            { id: "a", label: "Identificação" },
            { id: "b", label: "SEO" },
          ]}
        />
        <section id="editor-panel-a" role="tabpanel" aria-labelledby="editor-tab-a">
          Identificação ativa
        </section>
      </>,
    );
    const first = screen.getByRole("tab", { name: /Identificação/ });
    expect(first).toHaveAttribute("aria-controls", "editor-panel-a");
    expect(screen.getByRole("tabpanel", { name: /Identificação/ })).toBeInTheDocument();
    await user.click(first);
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith("b");
    await user.keyboard("{Home}");
    expect(onChange).toHaveBeenLastCalledWith("a");
  });

  it("confirma ações críticas com foco inicial no cancelamento e Escape", async () => {
    const user = userEvent.setup();
    const cancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Arquivar página?"
        description="A página sairá das listagens ativas."
        confirmLabel="Arquivar página"
        dangerous
        onConfirm={vi.fn()}
        onCancel={cancel}
      />,
    );
    expect(screen.getByRole("button", { name: "Cancelar" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("isola o fundo, prende o foco no diálogo em portal e o devolve ao acionador", async () => {
    const user = userEvent.setup();
    const trigger = document.createElement("button");
    trigger.textContent = "Abrir confirmação";
    document.body.append(trigger);
    trigger.focus();
    const cancel = vi.fn();
    const { container, rerender } = render(
      <ConfirmDialog
        open
        title="Confirmar publicação?"
        description="A versão ficará pública."
        confirmLabel="Publicar"
        onConfirm={vi.fn()}
        onCancel={cancel}
      />,
    );

    const dialog = screen.getByRole("alertdialog", { name: "Confirmar publicação?" });
    expect(dialog.closest("[data-admin-modal-layer]")?.parentElement).toBe(document.body);
    expect(container).toHaveAttribute("inert");
    const close = screen.getByRole("button", { name: "Fechar confirmação" });
    const confirm = screen.getByRole("button", { name: "Publicar" });
    close.focus();
    await user.tab({ shift: true });
    expect(confirm).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();

    rerender(
      <ConfirmDialog
        open={false}
        title="Confirmar publicação?"
        description="A versão ficará pública."
        confirmLabel="Publicar"
        onConfirm={vi.fn()}
        onCancel={cancel}
      />,
    );
    expect(container).not.toHaveAttribute("inert");
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it("abre drawer com foco, ação de ficha completa e fechamento por Escape", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    render(
      <RecordDrawer
        open
        eyebrow="PRODUTO"
        title="FlowMag 400"
        address="/produtos/flowmag-400"
        status="Publicado"
        fields={[{ label: "Categoria", value: "Vazão" }]}
        summary="Medidor eletromagnético."
        primary={<button>Abrir editor completo</button>}
        onClose={close}
      />,
    );
    expect(screen.getByRole("dialog", { name: "FlowMag 400" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Fechar resumo" }).at(-1)).toHaveFocus();
    expect(screen.getByRole("button", { name: "Abrir editor completo" })).toBeEnabled();
    await user.keyboard("{Escape}");
    expect(close).toHaveBeenCalledOnce();
  });

  it("mantém a tabulação dentro do drawer em portal e restaura o foco ao fechar", async () => {
    const user = userEvent.setup();
    const trigger = document.createElement("button");
    trigger.textContent = "Abrir resumo";
    document.body.append(trigger);
    trigger.focus();
    const close = vi.fn();
    const props = {
      eyebrow: "PRODUTO",
      title: "Produto homologado",
      primary: <button>Abrir editor completo</button>,
      onClose: close,
    };
    const { container, rerender } = render(<RecordDrawer open {...props} />);

    const dialog = screen.getByRole("dialog", { name: "Produto homologado" });
    expect(dialog.closest("[data-admin-modal-layer]")?.parentElement).toBe(document.body);
    expect(container).toHaveAttribute("inert");
    const dialogClose = screen.getAllByRole("button", { name: "Fechar resumo" }).at(-1)!;
    const primary = screen.getByRole("button", { name: "Abrir editor completo" });
    dialogClose.focus();
    await user.tab({ shift: true });
    expect(primary).toHaveFocus();
    await user.tab();
    expect(dialogClose).toHaveFocus();

    rerender(<RecordDrawer open={false} {...props} />);
    expect(container).not.toHaveAttribute("inert");
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it("marca a aba interna correspondente à rota", () => {
    render(
      <MemoryRouter initialEntries={["/admin/produtos?tab=listas"]}>
        <ModuleTabs
          label="Ferramentas de Produtos"
          items={[
            { label: "Catálogo", to: "/admin/produtos", end: true },
            { label: "Listas mestras", to: "/admin/produtos?tab=listas", end: true },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Listas mestras" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Catálogo" })).not.toHaveAttribute("aria-current");
  });

  it("dispensa toast automaticamente e mantém fechamento manual", () => {
    vi.useFakeTimers();
    const dismiss = vi.fn();
    render(<AdminToast message="Rascunho salvo." duration={2600} onDismiss={dismiss} />);
    expect(screen.getByRole("status")).toHaveTextContent("Rascunho salvo.");
    act(() => vi.advanceTimersByTime(2600));
    expect(dismiss).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("altera uma célula da matriz com nome acessível e estado pressionado", async () => {
    const user = userEvent.setup();
    const toggle = vi.fn();
    render(
      <RelationMatrix
        rowLabel="Aplicação"
        columnLabel="Produto"
        rows={[{ id: "eta", label: "ETA" }]}
        columns={[{ id: "flow", label: "FlowMag" }]}
        linked={() => false}
        onToggle={toggle}
      />,
    );
    const cell = screen.getByRole("button", { name: "Adicionar vínculo entre ETA e FlowMag" });
    expect(cell).toHaveAttribute("aria-pressed", "false");
    await user.click(cell);
    expect(toggle).toHaveBeenCalledWith("eta", "flow", true);
  });
});
