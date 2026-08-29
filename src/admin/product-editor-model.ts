import type { CmsProductContent } from "@/shared/contracts/cms-content";

export type ProductEditorTab =
  | "identificacao"
  | "classificacao"
  | "comercial"
  | "especificacoes"
  | "midia"
  | "documentos"
  | "relacoes"
  | "busca"
  | "seo"
  | "governanca"
  | "historico";

export type GovernedJsonField =
  | "modelsJson"
  | "specificationsJson"
  | "mediaJson"
  | "documentsJson"
  | "redirectsJson"
  | "blocksJson"
  | "provenanceJson";

export type GovernedJsonError = { field: GovernedJsonField; tab: ProductEditorTab; message: string };

const pretty = (value: unknown) => JSON.stringify(value, null, 2);
export const splitProductLines = (value: string) =>
  value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);

const localDateTime = (value?: string) => {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const isoDateTime = (value: string) => (value ? new Date(value).toISOString() : undefined);

export function createInitialProductDraft() {
  const modelId = crypto.randomUUID();
  const variantId = crypto.randomUUID();
  const specificationId = crypto.randomUUID();
  const blockId = crypto.randomUUID();
  return {
    slug: `produto-novo-${Date.now()}`,
    title: "",
    summary: "",
    brandName: "",
    brandSlug: "",
    manufacturerName: "",
    manufacturerSlug: "",
    manufacturerUrl: "",
    lineName: "",
    lineSlug: "",
    segment: "",
    category: "",
    subcategory: "",
    family: "",
    functionText: "",
    technology: "",
    commercialModel: "",
    manufacturerReference: "",
    modelsJson: pretty([
      {
        id: modelId,
        model: "",
        manufacturerReference: "",
        sku: "",
        status: "active",
        variants: [{ id: variantId, name: "", code: "", order: 0 }],
      },
    ]),
    shortDescription: "",
    valueProposition: "",
    benefits: "",
    differentiators: "",
    body: "",
    blocksJson: pretty([{ id: blockId, type: "rich_text", data: { text: "" } }]),
    specificationsJson: pretty([
      {
        id: specificationId,
        key: "",
        label: "",
        type: "text",
        value: "",
        required: true,
        filterable: true,
        comparable: true,
        searchable: true,
      },
    ]),
    mediaJson: "[]",
    documentsJson: "[]",
    productIds: "",
    applicationIds: "",
    sectorIds: "",
    serviceIds: "",
    synonyms: "",
    keywords: "",
    redirectsJson: "[]",
    seoTitle: "",
    seoDescription: "",
    canonicalPath: "",
    indexable: false,
    ogImageId: "",
    pilotState: "awaiting_owner",
    provenanceJson: "[]",
    portfolioOwner: "",
    technicalReviewer: "",
    commercialReviewer: "",
    editorialReviewer: "",
    homologatedAt: "",
    reason: "Cadastro manual do produto piloto",
  };
}

export type ProductEditorDraft = ReturnType<typeof createInitialProductDraft>;

export function hydrateProductDraft(
  product: CmsProductContent,
  slug: string,
  current = createInitialProductDraft(),
): ProductEditorDraft {
  const firstModel = product.models[0];
  const richText = product.blocks.find((block) => block.type === "rich_text");
  return {
    ...current,
    slug,
    title: product.title,
    summary: product.summary ?? "",
    brandName: product.brand.name,
    brandSlug: product.brand.slug,
    manufacturerName: product.manufacturer.name,
    manufacturerSlug: product.manufacturer.slug,
    manufacturerUrl: product.manufacturer.officialUrl ?? "",
    lineName: product.productLine.name,
    lineSlug: product.productLine.slug,
    segment: product.classification.segment,
    category: product.classification.category,
    subcategory: product.classification.subcategory ?? "",
    family: product.classification.family,
    functionText: product.function,
    technology: product.technology,
    commercialModel: firstModel?.model ?? "",
    manufacturerReference: firstModel?.manufacturerReference ?? "",
    modelsJson: pretty(product.models),
    shortDescription: product.commercial.shortDescription,
    valueProposition: product.commercial.valueProposition,
    benefits: product.commercial.benefits.join("\n"),
    differentiators: product.commercial.differentiators.join("\n"),
    body: richText?.data.text ?? "",
    blocksJson: pretty(product.blocks),
    specificationsJson: pretty(product.specifications),
    mediaJson: pretty(product.media),
    documentsJson: pretty(product.documents),
    productIds: product.relations.productIds.join("\n"),
    applicationIds: product.relations.applicationIds.join("\n"),
    sectorIds: product.relations.sectorIds.join("\n"),
    serviceIds: product.relations.serviceIds.join("\n"),
    synonyms: product.search.synonyms.join("\n"),
    keywords: product.search.keywords.join("\n"),
    redirectsJson: pretty(product.redirects),
    seoTitle: product.seo.title,
    seoDescription: product.seo.description,
    canonicalPath: product.seo.canonicalPath,
    indexable: product.seo.indexable,
    ogImageId: product.seo.ogImageId ?? "",
    pilotState: product.pilotState,
    provenanceJson: pretty(product.provenance),
    portfolioOwner: product.approval.portfolioOwner,
    technicalReviewer: product.approval.technicalReviewer,
    commercialReviewer: product.approval.commercialReviewer,
    editorialReviewer: product.approval.editorialReviewer,
    homologatedAt: localDateTime(product.approval.homologatedAt),
  };
}

const governedFields: Array<{ field: GovernedJsonField; tab: ProductEditorTab; label: string }> = [
  { field: "modelsJson", tab: "identificacao", label: "Modelos e variantes" },
  { field: "specificationsJson", tab: "especificacoes", label: "Atributos tipados" },
  { field: "mediaJson", tab: "midia", label: "Imagens" },
  { field: "documentsJson", tab: "documentos", label: "Documentos" },
  { field: "redirectsJson", tab: "seo", label: "Redirects" },
  { field: "blocksJson", tab: "comercial", label: "Blocos de conteúdo" },
  { field: "provenanceJson", tab: "governanca", label: "Proveniência" },
];

export function buildProductPayload(draft: ProductEditorDraft) {
  const parsed = {} as Record<GovernedJsonField, unknown[]>;
  const jsonErrors: GovernedJsonError[] = [];
  for (const definition of governedFields) {
    try {
      const value: unknown = JSON.parse(draft[definition.field]);
      if (!Array.isArray(value)) throw new Error("o valor deve ser uma lista JSON");
      parsed[definition.field] = value;
    } catch (error) {
      parsed[definition.field] = [];
      jsonErrors.push({
        field: definition.field,
        tab: definition.tab,
        message: `${definition.label}: ${error instanceof Error ? error.message : "JSON inválido"}.`,
      });
    }
  }

  const models = structuredClone(parsed.modelsJson) as Array<Record<string, unknown>>;
  if (models[0]) {
    models[0] = {
      ...models[0],
      model: draft.commercialModel,
      manufacturerReference: draft.manufacturerReference,
    };
  }
  const blocks = structuredClone(parsed.blocksJson) as Array<Record<string, unknown>>;
  const richText = blocks.find((block) => block.type === "rich_text");
  if (richText) richText.data = { ...((richText.data as Record<string, unknown>) ?? {}), text: draft.body };

  const payload = {
    schemaVersion: 1 as const,
    consumerId: "cms.catalog-product.v1" as const,
    contentType: "product" as const,
    pilotState: draft.pilotState,
    title: draft.title,
    ...(draft.summary ? { summary: draft.summary } : {}),
    brand: { name: draft.brandName, slug: draft.brandSlug },
    manufacturer: {
      name: draft.manufacturerName,
      slug: draft.manufacturerSlug,
      ...(draft.manufacturerUrl ? { officialUrl: draft.manufacturerUrl } : {}),
    },
    productLine: { name: draft.lineName, slug: draft.lineSlug },
    classification: {
      segment: draft.segment,
      category: draft.category,
      ...(draft.subcategory ? { subcategory: draft.subcategory } : {}),
      family: draft.family,
    },
    commercial: {
      shortDescription: draft.shortDescription,
      valueProposition: draft.valueProposition,
      benefits: splitProductLines(draft.benefits),
      differentiators: splitProductLines(draft.differentiators),
    },
    function: draft.functionText,
    technology: draft.technology,
    models,
    specifications: parsed.specificationsJson,
    media: parsed.mediaJson,
    documents: parsed.documentsJson,
    relations: {
      productIds: splitProductLines(draft.productIds),
      applicationIds: splitProductLines(draft.applicationIds),
      sectorIds: splitProductLines(draft.sectorIds),
      serviceIds: splitProductLines(draft.serviceIds),
    },
    search: { synonyms: splitProductLines(draft.synonyms), keywords: splitProductLines(draft.keywords) },
    redirects: parsed.redirectsJson,
    blocks,
    seo: {
      title: draft.seoTitle,
      description: draft.seoDescription,
      canonicalPath: draft.canonicalPath || `/produtos/${draft.slug}`,
      indexable: draft.indexable,
      ...(draft.ogImageId ? { ogImageId: draft.ogImageId } : {}),
    },
    provenance: parsed.provenanceJson,
    approval: {
      portfolioOwner: draft.portfolioOwner,
      technicalReviewer: draft.technicalReviewer,
      commercialReviewer: draft.commercialReviewer,
      editorialReviewer: draft.editorialReviewer,
      ...(draft.homologatedAt ? { homologatedAt: isoDateTime(draft.homologatedAt) } : {}),
    },
  };
  return {
    payload,
    jsonErrors,
    counts: Object.fromEntries(governedFields.map(({ field }) => [field, parsed[field].length])),
  };
}

export function tabForProductPath(path: PropertyKey[]): ProductEditorTab {
  const root = String(path[0] ?? "");
  if (["brand", "manufacturer", "productLine", "models", "title"].includes(root)) return "identificacao";
  if (["classification", "function", "technology"].includes(root)) return "classificacao";
  if (["commercial", "summary", "blocks"].includes(root)) return "comercial";
  if (root === "specifications") return "especificacoes";
  if (root === "media") return "midia";
  if (root === "documents") return "documentos";
  if (root === "relations") return "relacoes";
  if (root === "search") return "busca";
  if (["seo", "redirects"].includes(root)) return "seo";
  if (["provenance", "approval", "pilotState"].includes(root)) return "governanca";
  return "identificacao";
}
