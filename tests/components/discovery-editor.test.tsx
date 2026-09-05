import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DiscoveryContentEditor } from "../../src/admin/components/DiscoveryContentEditor";
import { servicePayload } from "../fixtures/discovery-payloads";

describe("editor estruturado de conteúdo institucional", () => {
  it("organiza o cadastro em seções operacionais sem expor o JSON na tela principal", async () => {
    const user = userEvent.setup();
    render(
      <DiscoveryContentEditor
        kind="service"
        payload={servicePayload}
        slug="servico-sintetico"
        onChange={vi.fn()}
        onSlugChange={vi.fn()}
        contractValid
      />,
    );

    expect(screen.getByRole("heading", { name: "Identificação e conteúdo público" })).toBeInTheDocument();
    expect(screen.getByLabelText("Título público")).toHaveValue("Entidade sintética F5");
    expect(screen.getByLabelText("Resumo")).toHaveValue("Resumo sintético para teste campo consumidor.");
    expect(screen.getByLabelText("Categoria do serviço")).toHaveValue("Categoria sintética");
    expect(screen.queryByLabelText("JSON governado")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Busca, CTA e SEO" }));
    expect(screen.getByLabelText(/^Título SEO/)).toHaveValue("Entidade sintética F5 | GAIATEC");
    expect(screen.getByLabelText("Texto do botão")).toHaveValue("CTA sintético");

    await user.click(screen.getByRole("tab", { name: "Governança" }));
    expect(screen.getByLabelText("Estado de governança")).toHaveValue("synthetic_test");
    expect(screen.getByLabelText("Responsável operacional")).toHaveValue("Owner sintético");

    await user.click(screen.getByRole("tab", { name: "Avançado" }));
    expect(screen.getByLabelText("JSON governado")).toBeInTheDocument();
    expect(screen.getByText(/Área técnica para manutenção excepcional/)).toBeInTheDocument();
  });

  it("propaga alterações de campos estruturados para o contrato governado", async () => {
    const onChange = vi.fn();
    const onSlugChange = vi.fn();
    render(
      <DiscoveryContentEditor
        kind="service"
        payload={servicePayload}
        slug="servico-sintetico"
        onChange={onChange}
        onSlugChange={onSlugChange}
        contractValid
      />,
    );

    fireEvent.change(screen.getByLabelText("Título público"), { target: { value: "Serviço revisado" } });
    expect(onChange).toHaveBeenCalled();
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Serviço revisado" }));

    fireEvent.change(screen.getByLabelText("Endereço amigável (slug)"), {
      target: { value: "servico-revisado" },
    });
    expect(onSlugChange).toHaveBeenLastCalledWith("servico-revisado");
  });
});
