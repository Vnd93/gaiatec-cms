import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { CmsPageContent } from "../../src/shared/contracts/cms-content";
import { CmsPageRenderer } from "../../src/public/components/CmsPageRenderer";

const mocks = vi.hoisted(() => ({ getPublishedForm: vi.fn() }));

vi.mock("../../src/public/catalog-api", () => ({
  getPublishedForm: mocks.getPublishedForm,
}));

const publishedForm = {
  schemaVersion: 1,
  formId: "62000000-0000-4000-8000-000000000001",
  versionId: "62000000-0000-4000-8000-000000000002",
  version: 1,
  key: "contato-principal",
  title: "Contato sintético",
  purpose: "Validar o formulário governado.",
  fields: [
    {
      id: "62000000-0000-4000-8000-000000000003",
      key: "mensagem",
      label: "Mensagem",
      type: "textarea" as const,
      required: true,
      maxLength: 500,
      options: [],
      personalData: false,
      order: 0,
    },
  ],
  consent: {
    required: true as const,
    text: "Aceito o tratamento dos dados sintéticos.",
    version: "sintetico-v1",
    privacyPath: "/politica-de-privacidade",
  },
  slaMinutes: 60,
  retentionDays: 30,
  successMessage: "Solicitação recebida.",
  submitLabel: "Enviar solicitação",
  status: "published",
};

mocks.getPublishedForm.mockResolvedValue(publishedForm);

const payload = {
  consumerId: "cms.managed-page.v1",
  contentType: "page",
  schemaVersion: 1,
  title: "Página visual sintética",
  summary: "Resumo sintético",
  pageKind: "landing",
  templateKey: "landing",
  route: { path: "/pagina-visual" },
  blocks: [
    {
      id: "61000000-0000-4000-8000-000000000001",
      type: "hero",
      hidden: false,
      width: "wide",
      tone: "dark",
      data: {
        eyebrow: "SINTÉTICO",
        title: "Página visual sintética",
        text: "Conteúdo renderizado pelo CMS.",
        alignment: "left",
        primaryCta: { label: "Falar com a equipe", href: "/contato" },
      },
    },
    {
      id: "61000000-0000-4000-8000-000000000002",
      type: "gallery",
      hidden: false,
      width: "wide",
      tone: "light",
      data: {
        heading: "Galeria técnica",
        assetIds: ["61000000-0000-4000-8000-000000000007"],
        columns: 3,
      },
    },
    {
      id: "61000000-0000-4000-8000-000000000008",
      type: "faq",
      hidden: false,
      width: "content",
      tone: "light",
      data: {
        heading: "Perguntas frequentes",
        items: [
          {
            id: "61000000-0000-4000-8000-000000000003",
            question: "O conteúdo é editável?",
            answer: "Sim, pelo editor governado.",
          },
        ],
      },
    },
    {
      id: "61000000-0000-4000-8000-000000000006",
      type: "form",
      hidden: false,
      width: "full",
      tone: "light",
      data: {
        heading: "Solicite uma análise",
        text: "Conte os dados do processo.",
        formKey: "contato-principal",
        formId: "62000000-0000-4000-8000-000000000001",
        formVersionId: "62000000-0000-4000-8000-000000000002",
        formVersion: 1,
        buttonLabel: "Enviar solicitação",
      },
    },
    {
      id: "61000000-0000-4000-8000-000000000004",
      type: "related_content",
      hidden: false,
      width: "wide",
      tone: "muted",
      data: {
        heading: "Veja também",
        itemIds: ["/servicos/relacionado", "/conteudo/futuro"],
        presentation: "cards",
      },
    },
  ],
  seo: {
    title: "Página visual",
    description: "Teste visual do renderer público do CMS GAIATEC.",
    canonicalPath: "/pagina-visual",
    indexable: false,
  },
  provenance: [
    {
      sourceKind: "owner_authored",
      rightsConfirmed: true,
      commercialOwner: "Owner",
      technicalOwner: "Owner",
      verifiedAt: "2026-08-29T12:00:00.000Z",
    },
  ],
  governanceState: "synthetic_test",
  relations: { productIds: [], serviceIds: [], industryIds: [], applicationIds: [], solutionIds: [] },
  retirement: { mode: "not_found" },
  approval: { businessOwner: "Owner", editorialReviewer: "Revisor" },
} as CmsPageContent;

describe("CMS page renderer", () => {
  it("renders governed blocks without creating a nested main landmark", async () => {
    const { container } = render(
      <MemoryRouter>
        <CmsPageRenderer
          payload={payload}
          mediaUrls={{
            "61000000-0000-4000-8000-000000000007:large.webp": "https://example.test/gallery.webp",
          }}
          mediaAlt={{ "61000000-0000-4000-8000-000000000007": "Instrumento em bancada" }}
          relatedItems={[
            {
              kind: "service",
              title: "Serviço relacionado",
              path: "/servicos/relacionado",
            },
            {
              kind: "future_internal_kind",
              title: "Conteúdo de tipo futuro",
              path: "/conteudo/futuro",
            },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Página visual sintética" })).toBeVisible();
    expect(screen.getByText("O conteúdo é editável?")).toBeVisible();
    expect(screen.getByRole("img", { name: "Instrumento em bancada" })).toBeVisible();
    expect(await screen.findByRole("heading", { name: "Solicite uma análise" })).toBeVisible();
    expect(await screen.findByRole("button", { name: "Enviar solicitação" })).toBeVisible();
    expect(mocks.getPublishedForm).toHaveBeenCalledWith("contato-principal", 1);
    expect(screen.getByRole("link", { name: /serviço relacionado/i })).toHaveAttribute(
      "href",
      "/servicos/relacionado",
    );
    expect(screen.getByText("Serviço", { exact: true })).toBeVisible();
    expect(screen.getByText("Conteúdo", { exact: true })).toBeVisible();
    expect(screen.queryByText("future_internal_kind")).not.toBeInTheDocument();
    expect(container.querySelector("main")).not.toBeInTheDocument();
    expect(container.querySelector("[dangerouslySetInnerHTML]")).not.toBeInTheDocument();
  });

  it("mantém destinos relativos à rede e hosts privados inertes no renderer público", () => {
    const hero = payload.blocks.find((block) => block.type === "hero");
    if (!hero || hero.type !== "hero") throw new Error("Fixture de hero ausente.");
    const unsafePayload = {
      ...payload,
      blocks: [
        {
          ...hero,
          data: {
            ...hero.data,
            primaryCta: { label: "Destino externo adulterado", href: "//attacker.invalid/coleta" },
            secondaryCta: { label: "Destino privado adulterado", href: "https://127.0.0.1/admin" },
          },
        },
        {
          id: "61000000-0000-4000-8000-000000000099",
          type: "cta",
          hidden: false,
          width: "wide",
          tone: "light",
          data: {
            heading: "Chamada adulterada",
            link: { label: "Travessia de caminho adulterada", href: "/../admin" },
          },
        },
      ],
    } as CmsPageContent;

    render(
      <MemoryRouter>
        <CmsPageRenderer payload={unsafePayload} />
      </MemoryRouter>,
    );

    expect(screen.getByText("Destino externo adulterado")).not.toHaveAttribute("href");
    expect(screen.getByText("Destino privado adulterado")).not.toHaveAttribute("href");
    expect(screen.getByText("Travessia de caminho adulterada")).not.toHaveAttribute("href");
    expect(document.querySelector('[href^="//"], [href*="127.0.0.1"], [href*=".."]')).toBeNull();
  });

  it("does not turn an unversioned legacy key into a live submission form", () => {
    mocks.getPublishedForm.mockClear();
    const formBlock = payload.blocks.find((block) => block.type === "form");
    if (!formBlock || formBlock.type !== "form") throw new Error("Fixture de formulário ausente.");
    const unboundPayload = {
      ...payload,
      blocks: [
        {
          ...formBlock,
          data: {
            heading: formBlock.data.heading,
            text: formBlock.data.text,
            formKey: "contact",
            buttonLabel: formBlock.data.buttonLabel,
          },
        },
      ],
    } as CmsPageContent;

    const { container } = render(
      <MemoryRouter>
        <CmsPageRenderer payload={unboundPayload} />
      </MemoryRouter>,
    );

    expect(mocks.getPublishedForm).not.toHaveBeenCalled();
    expect(container.querySelector("form")).not.toBeInTheDocument();
    expect(screen.getByText("Formulário temporariamente indisponível.", { exact: false })).toBeVisible();
    expect(screen.getByRole("link", { name: "Abrir página de contato" })).toHaveAttribute("href", "/contato");
  });

  it("does not resolve a raw UUID-only preview binding by the current form key", () => {
    mocks.getPublishedForm.mockClear();
    const formBlock = payload.blocks.find((block) => block.type === "form");
    if (!formBlock || formBlock.type !== "form") throw new Error("Fixture de formulário ausente.");
    const rawPreview = {
      ...payload,
      blocks: [
        {
          ...formBlock,
          data: {
            ...formBlock.data,
            formVersion: undefined,
          },
        },
      ],
    } as unknown as CmsPageContent;

    render(
      <MemoryRouter>
        <CmsPageRenderer payload={rawPreview} governedForm={publishedForm} preview />
      </MemoryRouter>,
    );

    expect(mocks.getPublishedForm).not.toHaveBeenCalled();
    expect(screen.getByText("Formulário temporariamente indisponível.", { exact: false })).toBeVisible();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });

  it("reuses an exact campaign form without looking it up again by key", async () => {
    mocks.getPublishedForm.mockClear();

    render(
      <MemoryRouter>
        <CmsPageRenderer payload={payload} governedForm={publishedForm} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("button", { name: "Enviar solicitação" })).toBeVisible();
    expect(mocks.getPublishedForm).not.toHaveBeenCalled();
  });

  it("loads the block binding when the campaign preloaded a different exact form", async () => {
    mocks.getPublishedForm.mockClear();
    const otherCampaignForm = { ...publishedForm, key: "formulario-principal", version: 7 };

    render(
      <MemoryRouter>
        <CmsPageRenderer payload={payload} governedForm={otherCampaignForm} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("button", { name: "Enviar solicitação" })).toBeVisible();
    expect(mocks.getPublishedForm).toHaveBeenCalledWith("contato-principal", 1);
  });

  it.each([
    ["a different key", { key: "formulario-divergente" }],
    ["a different version", { version: 2 }],
  ])("rejects a form lookup response with %s", async (_case, mismatch) => {
    mocks.getPublishedForm.mockClear();
    mocks.getPublishedForm.mockResolvedValueOnce({ ...publishedForm, ...mismatch });

    render(
      <MemoryRouter>
        <CmsPageRenderer payload={payload} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("Formulário temporariamente indisponível.", { exact: false }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Enviar solicitação" })).not.toBeInTheDocument();
  });

  it("preserves each related block selection and its editorial order", () => {
    const relatedBlock = payload.blocks.find((block) => block.type === "related_content");
    if (!relatedBlock || relatedBlock.type !== "related_content")
      throw new Error("Fixture de conteúdo relacionado ausente.");
    const relatedPayload = {
      blocks: [
        {
          ...relatedBlock,
          data: {
            ...relatedBlock.data,
            heading: "Bloco invertido",
            itemIds: ["/solucoes/segundo", "/servicos/primeiro"],
          },
        },
        {
          ...relatedBlock,
          id: "61000000-0000-4000-8000-000000000099",
          data: {
            ...relatedBlock.data,
            heading: "Bloco unitário",
            itemIds: ["/servicos/primeiro"],
          },
        },
        {
          ...relatedBlock,
          id: "61000000-0000-4000-8000-000000000098",
          data: {
            ...relatedBlock.data,
            heading: "Bloco sem referências públicas válidas",
            itemIds: [
              "61000000-0000-4000-8000-000000000005",
              "referencia-malformada",
              "/servicos/nao-resolvido",
            ],
          },
        },
      ],
    } as unknown as { blocks: CmsPageContent["blocks"] };

    render(
      <MemoryRouter>
        <CmsPageRenderer
          payload={relatedPayload}
          relatedItems={[
            { kind: "service", title: "Primeiro", path: "/servicos/primeiro" },
            { kind: "product", title: "Relação geral", path: "/produtos/relacao-geral" },
            { kind: "solution", title: "Segundo", path: "/solucoes/segundo" },
          ]}
        />
      </MemoryRouter>,
    );

    const inverted = screen.getByRole("heading", { level: 2, name: "Bloco invertido" }).closest("section");
    const single = screen.getByRole("heading", { level: 2, name: "Bloco unitário" }).closest("section");
    const unresolved = screen
      .getByRole("heading", { level: 2, name: "Bloco sem referências públicas válidas" })
      .closest("section");
    if (!inverted || !single || !unresolved) throw new Error("Blocos relacionados não renderizados.");
    expect(
      within(inverted)
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(["Segundo", "Primeiro"]);
    expect(
      within(single)
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(["Primeiro"]);
    expect(within(unresolved).getByText("Nenhum conteúdo relacionado está disponível.")).toBeVisible();
    expect(within(unresolved).queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByText("Relação geral")).not.toBeInTheDocument();
  });

  it("removes the previous form while a changed version binding is loading", async () => {
    const view = render(
      <MemoryRouter>
        <CmsPageRenderer payload={payload} />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("button", { name: "Enviar solicitação" })).toBeVisible();

    let resolveNext!: (value: typeof publishedForm) => void;
    mocks.getPublishedForm.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveNext = resolve;
      }),
    );
    const nextPayload = {
      ...payload,
      blocks: payload.blocks.map((block) =>
        block.type === "form"
          ? {
              ...block,
              data: {
                ...block.data,
                formKey: "orcamento",
                formId: "62000000-0000-4000-8000-000000000011",
                formVersionId: "62000000-0000-4000-8000-000000000012",
                formVersion: 2,
              },
            }
          : block,
      ),
    } as CmsPageContent;
    view.rerender(
      <MemoryRouter>
        <CmsPageRenderer payload={nextPayload} />
      </MemoryRouter>,
    );

    expect(screen.getByText("Carregando formulário…")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Enviar solicitação" })).not.toBeInTheDocument();
    resolveNext({
      ...publishedForm,
      formId: "62000000-0000-4000-8000-000000000011",
      versionId: "62000000-0000-4000-8000-000000000012",
      version: 2,
      key: "orcamento",
      submitLabel: "Solicitar orçamento",
    });
    expect(await screen.findByRole("button", { name: "Solicitar orçamento" })).toBeVisible();
  });
});
