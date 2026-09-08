import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DiscoveryContentEditor } from "../../src/admin/components/DiscoveryContentEditor";
import { ProductSpecificationsEditor } from "../../src/admin/components/ProductSemanticEditors";

const baseDiscoveryPayload = {
  title: "Cadastro controlado",
  blocks: [],
  media: [],
  relations: {},
  search: { keywords: [], synonyms: [] },
  seo: {},
  approval: {},
};

describe("segurança da linguagem nos editores semânticos", () => {
  it("não mostra detalhes técnicos recebidos ao carregar atributos", () => {
    render(
      <ProductSpecificationsEditor
        value="[]"
        catalogError='{"schemaVersion":2,"correlationId":"45000000-0000-4000-8000-000000000001"}'
        onChange={vi.fn()}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Não foi possível carregar os atributos desta categoria.");
    expect(alert).not.toHaveTextContent(/schemaVersion|correlationId|45000000/);
  });

  it("não mostra detalhes técnicos recebidos na validação do conteúdo", () => {
    render(
      <DiscoveryContentEditor
        kind="industry"
        payload={baseDiscoveryPayload}
        slug="cadastro-controlado"
        onChange={vi.fn()}
        onSlugChange={vi.fn()}
        contractValid={false}
        contractIssue="PGRST116 correlationId=45000000-0000-4000-8000-000000000001"
      />,
    );

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Revise os campos indicados antes de salvar.");
    expect(status).not.toHaveTextContent(/PGRST|correlationId|45000000/);
  });

  it("aceita somente categorias controladas e preserva a referência internamente", () => {
    const onChange = vi.fn();
    render(
      <DiscoveryContentEditor
        kind="service"
        payload={{ ...baseDiscoveryPayload, serviceKind: "Categoria anterior" }}
        slug="cadastro-controlado"
        onChange={onChange}
        onSlugChange={vi.fn()}
        contractValid
        serviceKindOptions={[
          {
            id: "45000000-0000-4000-8000-000000000001",
            slug: "assistencia-tecnica",
            label: "Assistência técnica",
            description: "",
            public_visible: true,
            active: true,
            sort_order: 0,
            updated_at: "2026-09-08T00:00:00.000Z",
          },
        ]}
      />,
    );

    const category = screen.getByLabelText("Categoria do serviço");
    expect(category.tagName).toBe("SELECT");
    fireEvent.change(category, { target: { value: "Assistência técnica" } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        serviceKind: "Assistência técnica",
        serviceKindRef: {
          id: "45000000-0000-4000-8000-000000000001",
          slug: "assistencia-tecnica",
          label: "Assistência técnica",
        },
      }),
    );
  });
});
