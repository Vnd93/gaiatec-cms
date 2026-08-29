import type { CmsPageBlock, CmsPageContent } from "@/shared/contracts/cms-content";

export type ManagedPageType = "page" | "homepage";

const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();

export function createPageBlock(type: CmsPageBlock["type"]): CmsPageBlock {
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
        data: { assetId: id(), alt: "Descreva a imagem", fit: "cover" },
      };
    case "gallery":
      return { ...base, type, width: "wide", data: { heading: "Galeria", assetIds: [id()], columns: 3 } };
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
      return { ...base, type, data: { heading: "Veja também", itemIds: [id()], presentation: "cards" } };
  }
}

export function createInitialPagePayload(contentType: ManagedPageType): CmsPageContent {
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
        pageKind: "institutional",
        templateKey: "standard",
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
  const title = `${payload.title.slice(0, 170)} — cópia`;
  return {
    ...structuredClone(payload),
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
