import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  AdminAlert,
  ConfirmDialog,
  DataTable,
  FilterBar,
  PageHeader,
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
      <StepTabs
        label="Etapas"
        active="a"
        onChange={onChange}
        steps={[
          { id: "a", label: "Identificação" },
          { id: "b", label: "SEO" },
        ]}
      />,
    );
    const first = screen.getByRole("tab", { name: /Identificação/ });
    await user.click(first);
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith("b");
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
});
