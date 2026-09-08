import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DiscoveryContentEditor } from "../../src/admin/components/DiscoveryContentEditor";
import { industryPayload, servicePayload } from "../fixtures/discovery-payloads";

describe("editor estruturado de conteúdo institucional", () => {
  it("organiza o cadastro em seções operacionais sem expor editor de JSON", async () => {
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

    await user.click(screen.getByRole("tab", { name: "Busca e divulgação" }));
    expect(screen.getByLabelText(/^Título para busca/)).toHaveValue("Entidade sintética F5 | GAIATEC");
    expect(screen.getByLabelText("Texto do botão")).toHaveValue("CTA sintético");

    await user.click(screen.getByRole("tab", { name: "Aprovação" }));
    expect(screen.getByLabelText("Situação da aprovação")).toHaveValue("synthetic_test");
    expect(screen.getByLabelText("Responsável operacional")).toHaveValue("Owner sintético");
    expect(screen.queryByRole("tab", { name: "Avançado" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("JSON governado")).not.toBeInTheDocument();
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
        generateAddressFromTitle
        contractValid
      />,
    );

    fireEvent.change(screen.getByLabelText("Título público"), { target: { value: "Serviço revisado" } });
    expect(onChange).toHaveBeenCalled();
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: "Serviço revisado",
        seo: expect.objectContaining({ canonicalPath: "/servicos/servico-revisado" }),
      }),
    );
    expect(onSlugChange).toHaveBeenLastCalledWith("servico-revisado");
    expect(screen.queryByText(/UUID/i)).not.toBeInTheDocument();
  });

  it("edita a ordem pública da indústria como parte da revisão governada", () => {
    const onChange = vi.fn();
    render(
      <DiscoveryContentEditor
        kind="industry"
        payload={industryPayload}
        slug="industria-sintetica"
        onChange={onChange}
        onSlugChange={vi.fn()}
        contractValid
      />,
    );

    expect(screen.getByLabelText("Ordem no site")).toHaveValue(10);
    fireEvent.change(screen.getByLabelText("Ordem no site"), { target: { value: "3" } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ displayOrder: 3 }));
  });
});
