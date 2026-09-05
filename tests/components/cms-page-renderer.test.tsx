import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { CmsPageContent } from "../../src/shared/contracts/cms-content";
import { CmsPageRenderer } from "../../src/public/components/CmsPageRenderer";

vi.mock("../../src/public/catalog-api", () => ({
  getPublishedForm: () =>
    Promise.resolve({
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
          type: "textarea",
          required: true,
          maxLength: 500,
          options: [],
          personalData: false,
          order: 0,
        },
      ],
      consent: {
        required: true,
        text: "Aceito o tratamento dos dados sintéticos.",
        version: "sintetico-v1",
        privacyPath: "/politica-de-privacidade",
      },
      slaMinutes: 60,
      retentionDays: 30,
      successMessage: "Solicitação recebida.",
      submitLabel: "Enviar solicitação",
      status: "published",
    }),
}));

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
        formKey: "lead",
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
        itemIds: ["61000000-0000-4000-8000-000000000005"],
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
              item_id: "61000000-0000-4000-8000-000000000005",
              content_type: "service",
              title: "Serviço relacionado",
              path: "/servicos/relacionado",
            },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Página visual sintética" })).toBeVisible();
    expect(screen.getByText("O conteúdo é editável?")).toBeVisible();
    expect(screen.getByRole("img", { name: "Instrumento em bancada" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Solicite uma análise" })).toBeVisible();
    expect(await screen.findByRole("button", { name: "Enviar solicitação" })).toBeVisible();
    expect(screen.getByRole("link", { name: /serviço relacionado/i })).toHaveAttribute(
      "href",
      "/servicos/relacionado",
    );
    expect(container.querySelector("main")).not.toBeInTheDocument();
    expect(container.querySelector("[dangerouslySetInnerHTML]")).not.toBeInTheDocument();
  });
});
