import type { CmsPageBlock, CmsPageContent } from "@/shared/contracts/cms-content";

export type ManagedPageType = "page" | "homepage";
export type ManagedPageTemplate = "standard" | "institutional" | "landing" | "sector" | "application";

const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();

export type PageBlockReferences = {
  assetId?: string;
  relatedItemId?: string;
};

export function pageBlockReferenceRequirement(type: CmsPageBlock["type"]): "media" | "relation" | null {
  if (["image", "gallery", "split_content", "logo_cloud"].includes(type)) return "media";
  if (type === "related_content") return "relation";
  return null;
}

function requiredReference(value: string | undefined, label: string) {
  if (!value) throw new Error(`Selecione ao menos ${label} antes de adicionar este componente.`);
  return value;
}

export function createPageBlock(
  type: CmsPageBlock["type"],
  references: PageBlockReferences = {},
): CmsPageBlock {
  const base = { id: id(), hidden: false, width: "content" as const, tone: "light" as const };
  switch (type) {
    case "hero":
      return {
        ...base,
        type,
        width: "full",
        tone: "dark",
        data: {
          eyebrow: "NOVA PÁGINA",
          title: "Título principal",
          text: "Apresente aqui o objetivo desta página.",
          primaryCta: { label: "Falar com especialista", href: "/contato" },
          alignment: "left",
        },
      };
    case "rich_text":
      return { ...base, type, data: { heading: "Nova seção", text: "Escreva o conteúdo desta seção." } };
    case "image":
      return {
        ...base,
        type,
        width: "wide",
        data: {
          assetId: requiredReference(references.assetId, "uma mídia válida"),
          alt: "Descreva a imagem",
          fit: "cover",
        },
      };
    case "gallery":
      return {
        ...base,
        type,
        width: "wide",
        data: {
          heading: "Galeria",
          assetIds: [requiredReference(references.assetId, "uma mídia válida")],
          columns: 3,
        },
      };
    case "benefit_grid":
      return {
        ...base,
        type,
        data: {
          heading: "Benefícios",
          items: [{ id: id(), title: "Benefício", text: "Explique o benefício." }],
        },
      };
    case "content_grid":
      return {
        ...base,
        type,
        width: "wide",
        data: {
          heading: "Conteúdos relacionados",
          items: [{ id: id(), title: "Conteúdo", text: "Resumo do conteúdo." }],
          columns: 3,
        },
      };
    case "steps":
      return {
        ...base,
        type,
        data: {
          heading: "Como funciona",
          items: [{ id: id(), title: "Primeira etapa", text: "Descreva a etapa." }],
        },
      };
    case "metrics":
      return {
        ...base,
        type,
        tone: "dark",
        data: { heading: "Resultados", items: [{ id: id(), value: "0", label: "Métrica" }] },
      };
    case "testimonial":
      return {
        ...base,
        type,
        tone: "muted",
        data: { quote: "Depoimento autorizado.", author: "Nome do autor" },
      };
    case "faq":
      return {
        ...base,
        type,
        data: {
          heading: "Perguntas frequentes",
          items: [{ id: id(), question: "Pergunta", answer: "Resposta" }],
        },
      };
    case "form":
      return {
        ...base,
        type,
        tone: "muted",
        data: {
          heading: "Fale com a GAIATEC",
          text: "Envie os dados da sua necessidade.",
          formKey: "contact",
          buttonLabel: "Abrir formulário",
        },
      };
    case "cta":
      return {
        ...base,
        type,
        tone: "brand",
        data: {
          heading: "Pronto para conversar?",
          text: "Nossa equipe está à disposição.",
          link: { label: "Entrar em contato", href: "/contato" },
        },
      };
    case "related_content":
      return {
        ...base,
        type,
        data: {
          heading: "Veja também",
          itemIds: [requiredReference(references.relatedItemId, "um conteúdo relacionado válido")],
          presentation: "cards",
        },
      };
    case "split_content":
      return {
        ...base,
        type,
        width: "wide",
        data: {
          eyebrow: "DESTAQUE",
          heading: "Conteúdo em evidência",
          text: "Apresente o contexto e a principal mensagem desta seção.",
          assetId: requiredReference(references.assetId, "uma mídia válida"),
          alt: "Descreva a imagem",
          imagePosition: "left",
        },
      };
    case "logo_cloud":
      return {
        ...base,
        type,
        width: "wide",
        data: {
          heading: "Marcas e parceiros",
          items: [
            {
              id: id(),
              assetId: requiredReference(references.assetId, "uma mídia válida"),
              alt: "Nome da marca ou do parceiro",
            },
          ],
        },
      };
    case "tabs":
      return {
        ...base,
        type,
        data: {
          heading: "Informações organizadas",
          items: [
            { id: id(), label: "Visão geral", heading: "Visão geral", text: "Conteúdo da primeira aba." },
            { id: id(), label: "Detalhes", heading: "Detalhes", text: "Conteúdo da segunda aba." },
          ],
        },
      };
    case "comparison_table":
      return {
        ...base,
        type,
        width: "wide",
        data: {
          heading: "Comparação",
          caption: "Compare as opções disponíveis.",
          columns: ["Opção A", "Opção B"],
          rows: [{ id: id(), label: "Característica", values: ["Valor A", "Valor B"] }],
        },
      };
    case "alert":
      return {
        ...base,
        type,
        tone: "muted",
        data: {
          heading: "Informação importante",
          text: "Explique de forma objetiva o que o visitante precisa saber.",
          severity: "info",
        },
      };
    case "timeline":
      return {
        ...base,
        type,
        data: {
          heading: "Linha do tempo",
          items: [
            { id: id(), label: "Etapa 1", title: "Primeiro marco", text: "Descrição do marco." },
            { id: id(), label: "Etapa 2", title: "Segundo marco", text: "Descrição do marco." },
          ],
        },
      };
    case "link_list":
      return {
        ...base,
        type,
        data: {
          heading: "Links úteis",
          items: [{ id: id(), label: "Saiba mais", href: "/contato", description: "Descrição do destino." }],
        },
      };
  }
}

export function createInitialPagePayload(
  contentType: ManagedPageType,
  requestedTemplate: ManagedPageTemplate = "standard",
): CmsPageContent {
  const homepage = contentType === "homepage";
  const slug = homepage ? "homepage" : `pagina-${Date.now()}`;
  const route = homepage ? "/" : `/${slug}`;
  const common = {
    schemaVersion: 1 as const,
    title: homepage ? "Homepage GAIATEC" : "Nova página",
    summary: "Rascunho criado manualmente no site builder.",
    pageKind: homepage ? ("home" as const) : ("institutional" as const),
    templateKey: homepage ? ("home" as const) : ("standard" as const),
    route: {
      path: route,
      navigationLabel: homepage ? "Início" : "Nova página",
      breadcrumbLabel: homepage ? "Início" : "Nova página",
    },
    blocks: [createPageBlock("hero"), createPageBlock("rich_text"), createPageBlock("cta")],
    seo: {
      title: homepage ? "GAIATEC SISTEMAS" : "Nova página | GAIATEC",
      description: "Rascunho não indexável criado no novo CMS GAIATEC.",
      canonicalPath: route,
      indexable: false,
    },
    provenance: [
      {
        sourceKind: "owner_authored" as const,
        authorizationReference: "CADASTRO-MANUAL-CMS",
        authorizationDate: new Date().toISOString().slice(0, 10),
        rightsScope: "Conteúdo criado manualmente no novo CMS",
        rightsConfirmed: true as const,
        commercialOwner: "Administrador GAIATEC",
        technicalOwner: "Administrador GAIATEC",
        verifiedAt: now(),
      },
    ],
    governanceState: "synthetic_test" as const,
    relations: { productIds: [], serviceIds: [], industryIds: [], applicationIds: [], solutionIds: [] },
    retirement: { mode: "not_found" as const },
    approval: { businessOwner: "Administrador GAIATEC", editorialReviewer: "Revisor a definir" },
  };
  return homepage
    ? {
        ...common,
        consumerId: "cms.homepage-builder.v1",
        contentType: "homepage",
        pageKind: "home",
        templateKey: "home",
        route: { ...common.route, path: "/" },
      }
    : {
        ...common,
        consumerId: "cms.managed-page.v1",
        contentType: "page",
        pageKind:
          requestedTemplate === "landing"
            ? "landing"
            : requestedTemplate === "sector" || requestedTemplate === "application"
              ? "thematic"
              : "institutional",
        templateKey:
          requestedTemplate === "landing"
            ? "landing"
            : requestedTemplate === "sector" || requestedTemplate === "application"
              ? "technical"
              : "standard",
        title:
          requestedTemplate === "sector"
            ? "Nova página de setor"
            : requestedTemplate === "application"
              ? "Nova página de aplicação"
              : requestedTemplate === "landing"
                ? "Nova landing page"
                : "Nova página",
        blocks:
          requestedTemplate === "landing"
            ? [createPageBlock("hero"), createPageBlock("benefit_grid"), createPageBlock("form")]
            : requestedTemplate === "sector"
              ? [createPageBlock("hero"), createPageBlock("content_grid"), createPageBlock("cta")]
              : requestedTemplate === "application"
                ? [createPageBlock("hero"), createPageBlock("steps"), createPageBlock("cta")]
                : common.blocks,
      };
}

export function duplicatePageBlock(block: CmsPageBlock): CmsPageBlock {
  const copy = structuredClone(block);
  copy.id = id();
  if ("items" in copy.data && Array.isArray(copy.data.items))
    copy.data.items = copy.data.items.map((item) => ({ ...item, id: id() })) as never;
  return copy;
}

export function movePageBlock(blocks: CmsPageBlock[], index: number, offset: -1 | 1) {
  const target = index + offset;
  if (target < 0 || target >= blocks.length) return blocks;
  const next = blocks.slice();
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function duplicateManagedPagePayload(payload: CmsPageContent, slug: string): CmsPageContent {
  if (payload.contentType !== "page") throw new Error("A homepage é única e não pode ser duplicada.");
  if (payload.visual)
    throw new Error(
      "Páginas vinculadas ao Estúdio Visual não podem ser duplicadas pelo builder v1. Crie uma nova página e um novo branch visual.",
    );
  const title = `${payload.title.slice(0, 170)} — cópia`;
  const duplicated = structuredClone(payload);
  return {
    ...duplicated,
    title,
    route: {
      path: `/${slug}`,
      navigationLabel: title.slice(0, 80),
      breadcrumbLabel: title.slice(0, 80),
    },
    blocks: payload.blocks.map(duplicatePageBlock),
    seo: {
      ...payload.seo,
      title: `${payload.seo.title.slice(0, 58)} — cópia`.slice(0, 70),
      canonicalPath: `/${slug}`,
      indexable: false,
    },
    provenance: [
      ...payload.provenance.slice(-29),
      {
        sourceKind: "owner_authored",
        authorizationReference: "DUPLICACAO-MANUAL-CMS",
        authorizationDate: new Date().toISOString().slice(0, 10),
        rightsScope: "Página duplicada dentro do novo CMS",
        rightsConfirmed: true,
        commercialOwner: "Administrador GAIATEC",
        technicalOwner: "Administrador GAIATEC",
        verifiedAt: now(),
      },
    ],
    governanceState: "synthetic_test",
    retirement: { mode: "not_found" },
    approval: {
      businessOwner: payload.approval.businessOwner,
      editorialReviewer: payload.approval.editorialReviewer,
    },
  };
}

export const pageTypeMeta = {
  page: { label: "Página", permission: "cms:pages", slug: "pagina" },
  homepage: { label: "Homepage", permission: "cms:homepage", slug: "homepage" },
} as const;
