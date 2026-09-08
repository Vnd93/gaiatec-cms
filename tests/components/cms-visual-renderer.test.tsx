import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { CSSProperties } from "react";
import { describe, expect, it } from "vitest";
import type { CmsPageBlock } from "../../src/shared/contracts/cms-content";
import { CmsPageRenderer } from "../../src/public/components/CmsPageRenderer";

const id = (suffix: number) => `69000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
const layout = {
  desktop: { span: 12, hidden: false },
  tablet: { span: 8, hidden: false },
  mobile: { span: 4, hidden: false },
};
const base = { hidden: false, width: "wide" as const, tone: "light" as const, componentVersion: 1, layout };
const rendererCss = readFileSync(resolve(process.cwd(), "src/public/site-builder.css"), "utf8");

const blocks: CmsPageBlock[] = [
  {
    ...base,
    id: id(1),
    type: "split_content",
    data: {
      eyebrow: "DESTAQUE",
      heading: "Conteúdo dividido",
      text: "Texto ao lado da imagem.",
      assetId: id(2),
      alt: "Equipamento sintético",
      imagePosition: "left",
      link: { label: "Conhecer", href: "/contato" },
    },
  },
  {
    ...base,
    id: id(3),
    type: "logo_cloud",
    data: {
      heading: "Marcas homologadas",
      items: [{ id: id(4), assetId: id(5), alt: "Marca sintética", href: "https://example.test" }],
    },
  },
  {
    ...base,
    id: id(6),
    type: "tabs",
    data: {
      heading: "Detalhes por aba",
      items: [
        { id: id(7), label: "Visão geral", heading: "Resumo", text: "Conteúdo inicial." },
        { id: id(8), label: "Operação", heading: "Operação segura", text: "Conteúdo selecionado." },
      ],
    },
  },
  {
    ...base,
    id: id(9),
    type: "comparison_table",
    data: {
      heading: "Comparação técnica",
      caption: "Comparação entre modelos sintéticos",
      columns: ["Modelo A", "Modelo B"],
      rows: [{ id: id(10), label: "Faixa", values: ["10", "20"] }],
    },
  },
  {
    ...base,
    id: id(11),
    type: "alert",
    data: {
      heading: "Atenção operacional",
      text: "Valide a instalação antes do uso.",
      severity: "warning",
      link: { label: "Abrir contato", href: "/contato" },
    },
  },
  {
    ...base,
    id: id(12),
    type: "timeline",
    data: {
      heading: "Implantação",
      items: [
        { id: id(13), label: "Etapa 1", title: "Diagnóstico", text: "Análise inicial." },
        { id: id(14), label: "Etapa 2", title: "Comissionamento", text: "Validação final." },
      ],
    },
  },
  {
    ...base,
    id: id(15),
    type: "link_list",
    data: {
      heading: "Links úteis",
      items: [{ id: id(16), label: "Fale conosco", href: "/contato", description: "Canal oficial" }],
    },
  },
];

describe("EV2.9 visual public renderer", () => {
  it("renders the seven new components with semantic, responsive output", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter>
        <CmsPageRenderer
          payload={{ blocks }}
          mediaUrls={{
            [`${id(2)}:large.webp`]: "https://example.test/equipment.webp",
            [`${id(5)}:large.webp`]: "https://example.test/logo.webp",
          }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("img", { name: "Equipamento sintético" })).toBeVisible();
    expect(screen.getByRole("img", { name: "Marca sintética" })).toBeVisible();
    expect(screen.getByRole("table", { name: "Comparação entre modelos sintéticos" })).toBeVisible();
    expect(screen.getByRole("note")).toHaveTextContent("Atenção operacional");
    expect(screen.getByRole("heading", { name: "Implantação" })).toBeVisible();
    expect(screen.getByRole("link", { name: /Fale conosco/ })).toHaveAttribute("href", "/contato");

    const operation = screen.getByRole("tab", { name: "Operação" });
    expect(operation).toHaveAttribute("aria-selected", "false");
    await user.click(operation);
    expect(operation).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Conteúdo selecionado.");

    const first = container.querySelector(".cms-page-block--split_content");
    expect(first).not.toHaveAttribute("data-hidden-desktop");
    expect(first).not.toHaveAttribute("data-component-version");
    expect(first).toHaveStyle({ "--cms-span-desktop": "12" });
    expect(container.querySelector("script, iframe")).not.toBeInTheDocument();
  });

  it("renders governed groups, forced viewport and theme tokens in the candidate canvas", () => {
    const groupId = id(90);
    const grouped = blocks.slice(4, 6).map((block, index) => ({
      ...block,
      groupId,
      layout: {
        desktop: { span: 6, hidden: false },
        tablet: { span: 4, hidden: false },
        mobile: { span: 2, hidden: index === 1 },
      },
    })) as CmsPageBlock[];
    const { container } = render(
      <MemoryRouter>
        <CmsPageRenderer
          payload={{ blocks: grouped }}
          viewport="mobile"
          themeStyle={{ "--cms-brand": "#0757d8" } as CSSProperties}
        />
      </MemoryRouter>,
    );

    const page = container.querySelector(".cms-managed-page");
    expect(page).toHaveAttribute("data-cms-breakpoint", "mobile");
    expect(page).toHaveStyle({ "--cms-brand": "#0757d8" });
    const group = container.querySelector(".cms-page-visual-group");
    expect(group).toHaveClass("cms-page-visual-group");
    expect(group).not.toHaveAttribute("data-visual-group");
    expect(group?.children).toHaveLength(2);
    expect(group?.children[1]).toHaveAttribute("data-hidden-mobile", "true");
  });

  it("keeps the mobile grid when tablet-only visibility is restored and preserves brand contrast", () => {
    const responsiveBlock: CmsPageBlock = {
      ...blocks[6],
      tone: "brand",
      layout: {
        desktop: { span: 12, hidden: false },
        tablet: { span: 8, hidden: true },
        mobile: { span: 3, start: 2, hidden: false },
      },
    };
    const { container } = render(
      <MemoryRouter>
        <CmsPageRenderer payload={{ blocks: [responsiveBlock] }} viewport="mobile" />
      </MemoryRouter>,
    );

    const renderedBlock = container.querySelector(".cms-page-block--link_list");
    expect(renderedBlock).toHaveAttribute("data-hidden-tablet", "true");
    expect(renderedBlock).not.toHaveAttribute("data-hidden-mobile");
    expect(renderedBlock).toHaveClass("cms-page-block--visual", "cms-page-block--brand");
    expect(renderedBlock).toHaveStyle({ "--cms-span-mobile": "3", "--cms-start-mobile": "2" });

    expect(rendererCss).toMatch(
      /\.cms-managed-page > \.cms-page-block--visual\[data-hidden-tablet="true"\]:not\(\[data-hidden-mobile="true"\]\) \{\s*display: grid;/,
    );
    expect(rendererCss).toMatch(
      /\.cms-page-visual-group > \.cms-page-block\[data-hidden-tablet="true"\]:not\(\[data-hidden-mobile="true"\]\) \{\s*display: block;/,
    );
    expect(rendererCss).toMatch(
      /\.cms-managed-page\[data-cms-breakpoint="mobile"\]\s*> \.cms-page-block--visual\[data-hidden-tablet="true"\] \{\s*display: grid;/,
    );
    expect(rendererCss).toMatch(
      /\.cms-managed-page\[data-cms-breakpoint="mobile"\]\s+\.cms-page-visual-group\s*> \.cms-page-block\[data-hidden-tablet="true"\] \{\s*display: block;/,
    );
    expect(rendererCss).toMatch(
      /\.cms-page-block--brand \.cms-page-link-list a:focus-visible strong,[\s\S]*?\.cms-page-block--brand \.cms-page-link-list small,[\s\S]*?\{\s*color: #fff;/,
    );
  });
});
