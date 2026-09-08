import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CmsPageBlock } from "../../src/shared/contracts/cms-content";
import { PageBlockEditor } from "../../src/admin/components/PageBlockEditor";
import { createPageBlock, type PublishedFormOption } from "../../src/admin/page-builder-model";

const forms: PublishedFormOption[] = [
  {
    id: "71000000-0000-4000-8000-000000000001",
    formKey: "contato-tecnico",
    versionId: "72000000-0000-4000-8000-000000000001",
    title: "Contato técnico",
  },
  {
    id: "71000000-0000-4000-8000-000000000002",
    formKey: "orcamento",
    versionId: "72000000-0000-4000-8000-000000000002",
    title: "Solicitar orçamento",
  },
];

function renderEditor(
  block: CmsPageBlock = createPageBlock("form", { form: forms[0] }),
  onChange = vi.fn(),
  availableForms = forms,
) {
  render(
    <PageBlockEditor
      block={block}
      index={0}
      total={1}
      media={[]}
      relations={[]}
      forms={availableForms}
      onChange={onChange}
      onRemove={vi.fn()}
      onDuplicate={vi.fn()}
      onMove={vi.fn()}
    />,
  );
  return onChange;
}

describe("vínculo governado do bloco de formulário", () => {
  it("usa um rótulo humano para o tipo do bloco", () => {
    renderEditor(createPageBlock("rich_text"));

    expect(screen.getByText("1. Texto")).toBeVisible();
    expect(screen.queryByText(/rich_text|rich text/i)).not.toBeInTheDocument();
  });

  it("representa o vínculo exato e troca chave, definição e versão atomicamente", async () => {
    const user = userEvent.setup();
    const onChange = renderEditor();
    const select = screen.getByRole("combobox", {
      name: "Formulário publicado",
    });

    expect(select).toHaveValue(forms[0].id);
    expect(
      screen.getByText(`A versão publicada atual de “${forms[0].title}” será usada no site.`),
    ).toBeInTheDocument();

    await user.selectOptions(select, forms[1].id);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toMatchObject({
      type: "form",
      data: {
        formKey: forms[1].formKey,
        formId: forms[1].id,
        formVersionId: forms[1].versionId,
      },
    });
  });

  it("não apresenta um fallback legado como se fosse um vínculo publicável", () => {
    renderEditor(createPageBlock("form"));

    const select = screen.getByRole("combobox", {
      name: "Formulário publicado",
    });
    expect(select).toHaveValue("__invalid__");
    expect(select).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Este bloco ainda não possui um vínculo publicável");
    expect(screen.queryByRole("option", { name: "contact" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "newsletter" })).not.toBeInTheDocument();
  });

  it("explica o bloqueio quando nenhuma versão publicada está disponível", () => {
    renderEditor(createPageBlock("form"), vi.fn(), []);

    expect(screen.getByRole("alert")).toHaveTextContent("Nenhum formulário publicado está disponível");
    expect(screen.getByRole("combobox", { name: "Formulário publicado" })).toBeInvalid();
  });

  it("gera o link interno por um controle semântico e não exige código manual", async () => {
    const user = userEvent.setup();
    const block = {
      ...createPageBlock("rich_text"),
      data: { text: "Conteúdo", heading: "Dados técnicos" },
    } as CmsPageBlock;
    const onChange = renderEditor(block);

    expect(screen.queryByPlaceholderText("nome-da-secao")).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Permitir link direto para esta seção" }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ anchor: "dados-tecnicos" }));
  });
});
