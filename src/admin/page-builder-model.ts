import type { CmsPageBlock, CmsPageContent } from "@/shared/contracts/cms-content";

export type ManagedPageType = "page" | "homepage";
export type ManagedPageTemplate = "standard" | "institutional" | "landing" | "sector" | "application";

export const PAGE_BLOCK_LABELS = {
  hero: "Hero",
  rich_text: "Texto",
  image: "Imagem",
  gallery: "Galeria",
  benefit_grid: "Grade de benefícios",
  content_grid: "Grade de conteúdo",
  steps: "Etapas",
  metrics: "Métricas",
  testimonial: "Depoimento",
  faq: "Perguntas frequentes",
  form: "Formulário",
  cta: "Chamada para ação",
  related_content: "Conteúdo relacionado",
  split_content: "Conteúdo dividido",
  logo_cloud: "Nuvem de marcas",
  tabs: "Abas",
  comparison_table: "Tabela comparativa",
  alert: "Aviso",
  timeline: "Linha do tempo",
  link_list: "Lista de links",
} satisfies Record<CmsPageBlock["type"], string>;

export const PAGE_BUILDER_BLOCK_TYPES = [
  "hero",
  "rich_text",
  "image",
  "gallery",
  "benefit_grid",
  "content_grid",
  "steps",
  "metrics",
  "testimonial",
  "faq",
  "form",
  "cta",
  "related_content",
] as const satisfies readonly CmsPageBlock["type"][];

export type PageBuilderBlockType = (typeof PAGE_BUILDER_BLOCK_TYPES)[number];

export const MANAGED_PAGE_TEMPLATES = [
  {
    name: "Institucional padrão",
    key: "institutional",
    title: "Nova página",
    pageKind: "institutional",
    templateKey: "standard",
    blockTypes: ["hero", "rich_text", "cta"],
  },
  {
    name: "Landing de campanha",
    key: "landing",
    title: "Nova landing page",
    pageKind: "landing",
    templateKey: "landing",
    blockTypes: ["hero", "benefit_grid", "form"],
  },
  {
    name: "Página de setor",
    key: "sector",
    title: "Nova página de setor",
    pageKind: "thematic",
    templateKey: "technical",
    blockTypes: ["hero", "content_grid", "cta"],
  },
  {
    name: "Página de aplicação",
    key: "application",
    title: "Nova página de aplicação",
    pageKind: "thematic",
    templateKey: "technical",
    blockTypes: ["hero", "steps", "cta"],
  },
] as const satisfies readonly {
  name: string;
  key: Exclude<ManagedPageTemplate, "standard">;
  title: string;
  pageKind: "institutional" | "landing" | "thematic";
  templateKey: "standard" | "landing" | "technical";
  blockTypes: readonly PageBuilderBlockType[];
}[];

const id = () => crypto.randomUUID();

export type PageBlockReferences = {
  assetId?: string;
  relatedItemId?: string;
  form?: PublishedFormOption;
};

export type PublishedFormOption = {
  id: string;
  formKey: string;
  versionId: string;
  title: string;
};

export function publishedFormForBlock(
  block: CmsPageBlock,
  forms: readonly PublishedFormOption[],
): PublishedFormOption | null {
  if (block.type !== "form") return null;
  return (
    forms.find(
      (form) =>
        form.id === block.data.formId &&
        form.versionId === block.data.formVersionId &&
        form.formKey === block.data.formKey,
    ) ?? null
  );
}

export function governedFormBindingIssue(
  blocks: readonly CmsPageBlock[],
  forms: readonly PublishedFormOption[],
): string | null {
  const formBlocks = blocks.filter(
    (block): block is Extract<CmsPageBlock, { type: "form" }> => block.type === "form",
  );
  if (!formBlocks.length) return null;
  if (!forms.length)
    return "Nenhum formulário publicado está disponível. Publique uma versão em Marketing > Formulários antes de salvar esta página.";
  const invalidIndex = formBlocks.findIndex((block) => !publishedFormForBlock(block, forms));
  if (invalidIndex < 0) return null;
  return `O bloco de formulário ${invalidIndex + 1} não está vinculado à versão publicada atual. Selecione novamente o formulário antes de salvar ou publicar.`;
}

export function pageBlockReferenceRequirement(
  type: CmsPageBlock["type"],
): "media" | "relation" | "form" | null {
  if (["image", "gallery", "split_content", "logo_cloud"].includes(type)) return "media";
  if (type === "related_content") return "relation";
  if (type === "form") return "form";
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
          formKey: references.form?.formKey ?? "formulario-nao-vinculado",
          formId: references.form?.id,
          formVersionId: references.form?.versionId,
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

/**
 * Creates the form state used by the real editors. Unlike `createPageBlock`,
 * which is also used by contract fixtures, this helper never pre-populates
 * publishable copy. Required text stays empty so the shared schema keeps Save
 * disabled until an operator has deliberately authored every field.
 */
export function createEmptyPageBlock(
  type: CmsPageBlock["type"],
  references: PageBlockReferences = {},
): CmsPageBlock {
  const block = createPageBlock(type, references);
  switch (block.type) {
    case "hero":
      return { ...block, data: { title: "", alignment: block.data.alignment } };
    case "rich_text":
      return { ...block, data: { text: "" } };
    case "image":
      return { ...block, data: { ...block.data, alt: "" } };
    case "gallery":
      return { ...block, data: { assetIds: block.data.assetIds, columns: block.data.columns } };
    case "benefit_grid":
      return {
        ...block,
        data: { heading: "", items: block.data.items.map((item) => ({ ...item, title: "", text: "" })) },
      };
    case "content_grid":
      return {
        ...block,
        data: {
          heading: "",
          items: block.data.items.map((item) => ({ id: item.id, title: "" })),
          columns: block.data.columns,
        },
      };
    case "steps":
      return {
        ...block,
        data: { heading: "", items: block.data.items.map((item) => ({ ...item, title: "", text: "" })) },
      };
    case "metrics":
      return {
        ...block,
        data: { items: block.data.items.map((item) => ({ ...item, value: "", label: "" })) },
      };
    case "testimonial":
      return { ...block, data: { quote: "", author: "" } };
    case "faq":
      return {
        ...block,
        data: {
          heading: "",
          items: block.data.items.map((item) => ({ ...item, question: "", answer: "" })),
        },
      };
    case "form":
      return {
        ...block,
        data: {
          heading: "",
          formKey: block.data.formKey,
          formId: block.data.formId,
          formVersionId: block.data.formVersionId,
          buttonLabel: "",
        },
      };
    case "cta":
      return { ...block, data: { heading: "", link: { label: "", href: "" } } };
    case "related_content":
      return {
        ...block,
        data: { heading: "", itemIds: block.data.itemIds, presentation: block.data.presentation },
      };
    case "split_content":
      return {
        ...block,
        data: {
          heading: "",
          text: "",
          assetId: block.data.assetId,
          alt: "",
          imagePosition: block.data.imagePosition,
        },
      };
    case "logo_cloud":
      return {
        ...block,
        data: {
          items: block.data.items.map((item) => ({ id: item.id, assetId: item.assetId, alt: "" })),
        },
      };
    case "tabs":
      return {
        ...block,
        data: {
          items: block.data.items.map((item) => ({ ...item, label: "", heading: "", text: "" })),
        },
      };
    case "comparison_table":
      return {
        ...block,
        data: {
          heading: "",
          caption: "",
          columns: block.data.columns.map(() => ""),
          rows: block.data.rows.map((row) => ({ ...row, label: "", values: row.values.map(() => "") })),
        },
      };
    case "alert":
      return { ...block, data: { heading: "", text: "", severity: block.data.severity } };
    case "timeline":
      return {
        ...block,
        data: {
          heading: "",
          items: block.data.items.map((item) => ({ ...item, label: "", title: "", text: "" })),
        },
      };
    case "link_list":
      return {
        ...block,
        data: {
          heading: "",
          items: block.data.items.map((item) => ({ id: item.id, label: "", href: "" })),
        },
      };
  }
}

export function createInitialPagePayload(
  contentType: ManagedPageType,
  requestedTemplate: ManagedPageTemplate = "standard",
): CmsPageContent {
  const homepage = contentType === "homepage";
  const template =
    MANAGED_PAGE_TEMPLATES.find((candidate) => candidate.key === requestedTemplate) ??
    MANAGED_PAGE_TEMPLATES[0];
  const slug = homepage ? "homepage" : "";
  const route = homepage ? "/" : `/${slug}`;
  const common = {
    schemaVersion: 1 as const,
    title: "",
    summary: undefined,
    pageKind: homepage ? ("home" as const) : ("institutional" as const),
    templateKey: homepage ? ("home" as const) : ("standard" as const),
    route: {
      path: route,
      navigationLabel: homepage ? "Início" : undefined,
      breadcrumbLabel: homepage ? "Início" : undefined,
    },
    blocks: [createEmptyPageBlock("hero"), createEmptyPageBlock("rich_text"), createEmptyPageBlock("cta")],
    seo: {
      title: "",
      description: "",
      canonicalPath: route,
      indexable: false,
    },
    provenance: [
      {
        sourceKind: "owner_authored" as const,
        rightsConfirmed: false as true,
        commercialOwner: "",
        technicalOwner: "",
        verifiedAt: "",
      },
    ],
    governanceState: "awaiting_owner" as const,
    relations: { productIds: [], serviceIds: [], industryIds: [], applicationIds: [], solutionIds: [] },
    retirement: { mode: "not_found" as const },
    approval: { businessOwner: "", editorialReviewer: "" },
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
        pageKind: template.pageKind,
        templateKey: template.templateKey,
        blocks: template.blockTypes.map((type) => createEmptyPageBlock(type)),
      };
}

export function duplicatePageBlock(block: CmsPageBlock): CmsPageBlock {
  const copy = structuredClone(block);
  copy.id = id();
  delete copy.anchor;
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
        rightsConfirmed: false as true,
        commercialOwner: "",
        technicalOwner: "",
        verifiedAt: "",
      },
    ],
    governanceState: "awaiting_owner",
    retirement: { mode: "not_found" },
    approval: {
      businessOwner: "",
      editorialReviewer: "",
    },
  };
}

export const pageTypeMeta = {
  page: { label: "Página", permission: "cms:pages", slug: "pagina" },
  homepage: { label: "Homepage", permission: "cms:homepage", slug: "homepage" },
} as const;
