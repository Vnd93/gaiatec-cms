import {
  CmsProductContentSchema,
  type CmsProductContent,
  type CmsProductFieldVisibility,
} from "@/shared/contracts/cms-content";

export const BULK_IMPORT_LIMIT = 500;
export const BULK_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const BULK_TEMPLATE_VERSION = "GAIATEC-CMS-PRODUTOS-v1";

export type BulkTableRow = Record<string, string>;
export type BulkWorkbookTables = {
  products: BulkTableRow[];
  models: BulkTableRow[];
  specifications: BulkTableRow[];
};
export type BulkImportError = { sheet: string; row: number; field: string; message: string };
export type BulkProductCommandRow = { sourceRow: number; slug: string; payload: CmsProductContent };

export const bulkRequiredHeaders = {
  products: [
    "template_versao",
    "slug",
    "titulo",
    "marca",
    "marca_slug",
    "fabricante",
    "fabricante_slug",
    "linha",
    "linha_slug",
    "segmento",
    "categoria",
    "familia",
    "funcao",
    "tecnologia",
    "descricao_curta",
    "proposta_valor",
    "beneficios",
    "owner_portfolio",
    "revisor_tecnico",
    "revisor_comercial",
    "revisor_editorial",
  ],
  models: ["produto_slug", "modelo_comercial", "referencia_fabricante", "sku", "variante", "codigo_variante"],
  specifications: ["produto_slug", "chave", "rotulo", "tipo", "valor"],
} as const;

const splitList = (value: string) =>
  value
    .split("|")
    .map((entry) => entry.trim())
    .filter(Boolean);
const visible = (value: string, fallback: "public" | "internal") => {
  const normalized = value.trim().toLowerCase();
  if (["publico", "público", "public"].includes(normalized)) return "public" as const;
  if (["interno", "internal", "somente interno"].includes(normalized)) return "internal" as const;
  return fallback;
};
const yes = (value: string, fallback = false) => {
  if (!value.trim()) return fallback;
  return ["sim", "s", "true", "1", "yes"].includes(value.trim().toLowerCase());
};
const optional = (value: string) => (value.trim() ? value.trim() : undefined);
const decimal = (value: string) =>
  Number(value.includes(",") && !value.includes(".") ? value.replace(",", ".") : value);

function specificationValue(type: string, value: string) {
  if (type === "number") return decimal(value);
  if (type === "boolean") return yes(value);
  if (type === "enum") return splitList(value);
  if (type === "range") {
    const [min, max] = splitList(value).map(decimal);
    return { min, max };
  }
  return value.trim();
}

function fieldVisibility(row: BulkTableRow): CmsProductFieldVisibility {
  return {
    brand: visible(row.visibilidade_marca ?? "", "public"),
    manufacturer: visible(row.visibilidade_fabricante ?? "", "internal"),
    productLine: visible(row.visibilidade_linha ?? "", "public"),
    commercialModel: visible(row.visibilidade_modelo_comercial ?? "", "public"),
    manufacturerReference: visible(row.visibilidade_referencia_fabricante ?? "", "internal"),
    sku: visible(row.visibilidade_sku ?? "", "internal"),
    classification: visible(row.visibilidade_classificacao ?? "", "public"),
    function: visible(row.visibilidade_funcao ?? "", "public"),
    technology: visible(row.visibilidade_tecnologia ?? "", "public"),
    specifications: visible(row.visibilidade_especificacoes ?? "", "public"),
    relations: visible(row.visibilidade_relacoes ?? "", "public"),
    documents: visible(row.visibilidade_documentos ?? "", "public"),
  };
}

export function buildBulkProductRows(tables: BulkWorkbookTables) {
  const errors: BulkImportError[] = [];
  const rows: BulkProductCommandRow[] = [];
  if (tables.products.length > BULK_IMPORT_LIMIT)
    errors.push({
      sheet: "Produtos",
      row: 1,
      field: "slug",
      message: `Limite de ${BULK_IMPORT_LIMIT} produtos por lote.`,
    });

  const slugs = new Set<string>();
  tables.products.slice(0, BULK_IMPORT_LIMIT).forEach((product, index) => {
    const sourceRow = index + 2;
    const slug = product.slug?.trim() ?? "";
    if (product.template_versao !== BULK_TEMPLATE_VERSION)
      errors.push({
        sheet: "Produtos",
        row: sourceRow,
        field: "template_versao",
        message: "Versão da planilha não reconhecida.",
      });
    if (slugs.has(slug))
      errors.push({ sheet: "Produtos", row: sourceRow, field: "slug", message: "Slug duplicado no lote." });
    slugs.add(slug);

    const modelRows = tables.models.filter((row) => row.produto_slug?.trim() === slug);
    const specificationRows = tables.specifications.filter((row) => row.produto_slug?.trim() === slug);
    if (!modelRows.length)
      errors.push({
        sheet: "Modelos",
        row: 1,
        field: "produto_slug",
        message: `Nenhum modelo informado para ${slug || `linha ${sourceRow}`}.`,
      });
    if (!specificationRows.length)
      errors.push({
        sheet: "Especificacoes",
        row: 1,
        field: "produto_slug",
        message: `Nenhuma especificação informada para ${slug || `linha ${sourceRow}`}.`,
      });

    const modelGroups = new Map<string, BulkTableRow[]>();
    modelRows.forEach((model) => {
      const key = [model.modelo_comercial, model.referencia_fabricante, model.sku].join("\u0000");
      modelGroups.set(key, [...(modelGroups.get(key) ?? []), model]);
    });
    const models = [...modelGroups.values()].map((group) => ({
      id: crypto.randomUUID(),
      model: group[0].modelo_comercial?.trim() ?? "",
      manufacturerReference: group[0].referencia_fabricante?.trim() ?? "",
      sku: group[0].sku?.trim() ?? "",
      status:
        group[0].status?.trim().toLowerCase() === "descontinuado"
          ? ("discontinued" as const)
          : ("active" as const),
      variants: group.map((model, variantIndex) => ({
        id: crypto.randomUUID(),
        name: model.variante?.trim() ?? "",
        code: model.codigo_variante?.trim() ?? "",
        order: variantIndex,
      })),
    }));
    const specifications = specificationRows.map((specification) => {
      const type = specification.tipo?.trim().toLowerCase() as
        "text" | "number" | "boolean" | "enum" | "range";
      return {
        id: crypto.randomUUID(),
        key: specification.chave?.trim() ?? "",
        label: specification.rotulo?.trim() ?? "",
        type,
        value: specificationValue(type, specification.valor ?? ""),
        ...(optional(specification.unidade ?? "") ? { unit: optional(specification.unidade ?? "") } : {}),
        required: yes(specification.obrigatorio ?? "", true),
        filterable: yes(specification.filtravel ?? ""),
        comparable: yes(specification.comparavel ?? "", true),
        searchable: yes(specification.pesquisavel ?? "", true),
      };
    });
    const body = product.descricao_completa?.trim() || product.descricao_curta?.trim() || "";
    const sourceKind =
      product.fonte_tipo === "fabricante_oficial"
        ? "official_manufacturer"
        : product.fonte_tipo === "empresa_oficial"
          ? "official_company"
          : "owner_authored";
    const payloadCandidate = {
      schemaVersion: 1,
      consumerId: "cms.catalog-product.v1",
      contentType: "product",
      pilotState: "awaiting_owner",
      fieldVisibility: fieldVisibility(product),
      title: product.titulo?.trim() ?? "",
      ...(optional(product.resumo ?? "") ? { summary: optional(product.resumo ?? "") } : {}),
      brand: { name: product.marca?.trim() ?? "", slug: product.marca_slug?.trim() ?? "" },
      manufacturer: {
        name: product.fabricante?.trim() ?? "",
        slug: product.fabricante_slug?.trim() ?? "",
        ...(optional(product.fabricante_url ?? "")
          ? { officialUrl: optional(product.fabricante_url ?? "") }
          : {}),
      },
      productLine: { name: product.linha?.trim() ?? "", slug: product.linha_slug?.trim() ?? "" },
      classification: {
        segment: product.segmento?.trim() ?? "",
        category: product.categoria?.trim() ?? "",
        ...(optional(product.subcategoria ?? "")
          ? { subcategory: optional(product.subcategoria ?? "") }
          : {}),
        family: product.familia?.trim() ?? "",
      },
      commercial: {
        shortDescription: product.descricao_curta?.trim() ?? "",
        valueProposition: product.proposta_valor?.trim() ?? "",
        benefits: splitList(product.beneficios ?? ""),
        differentiators: splitList(product.diferenciais ?? ""),
      },
      function: product.funcao?.trim() ?? "",
      technology: product.tecnologia?.trim() ?? "",
      models,
      specifications,
      media: [],
      documents: [],
      relations: { productIds: [], applicationIds: [], sectorIds: [], serviceIds: [] },
      search: {
        synonyms: splitList(product.sinonimos ?? ""),
        keywords: splitList(product.palavras_chave ?? ""),
      },
      redirects: [],
      blocks: [{ id: crypto.randomUUID(), type: "rich_text", data: { text: body } }],
      seo: {
        title: product.seo_titulo?.trim() || `${product.titulo?.trim() ?? "Produto"} | GAIATEC`,
        description: product.seo_descricao?.trim() || product.descricao_curta?.trim() || "",
        canonicalPath: `/produtos/${slug}`,
        indexable: false,
      },
      provenance: [
        {
          sourceKind,
          ...(optional(product.fonte_url ?? "") ? { sourceUrl: optional(product.fonte_url ?? "") } : {}),
          ...(optional(product.fonte_sha256 ?? "")
            ? { sourceSha256: optional(product.fonte_sha256 ?? "") }
            : {}),
          authorizationReference: product.autorizacao_referencia?.trim() || "CADASTRO-MASSA-CMS",
          authorizationDate: product.autorizacao_data?.trim() || new Date().toISOString().slice(0, 10),
          rightsScope: product.escopo_direitos?.trim() || "Cadastro novo preparado para o CMS GAIATEC",
          rightsConfirmed: true,
          commercialOwner: product.owner_portfolio?.trim() ?? "",
          technicalOwner: product.revisor_tecnico?.trim() ?? "",
          verifiedAt: new Date().toISOString(),
        },
      ],
      approval: {
        portfolioOwner: product.owner_portfolio?.trim() ?? "",
        technicalReviewer: product.revisor_tecnico?.trim() ?? "",
        commercialReviewer: product.revisor_comercial?.trim() ?? "",
        editorialReviewer: product.revisor_editorial?.trim() ?? "",
      },
    };
    const parsed = CmsProductContentSchema.safeParse(payloadCandidate);
    if (!parsed.success) {
      parsed.error.issues.slice(0, 12).forEach((issue) =>
        errors.push({
          sheet: "Produtos",
          row: sourceRow,
          field: issue.path.join("."),
          message: issue.message,
        }),
      );
      return;
    }
    rows.push({ sourceRow, slug, payload: parsed.data });
  });

  const known = new Set(tables.products.map((row) => row.slug?.trim()));
  (["Modelos", tables.models] as const)[1].forEach((row, index) => {
    if (!known.has(row.produto_slug?.trim()))
      errors.push({
        sheet: "Modelos",
        row: index + 2,
        field: "produto_slug",
        message: "Produto não existe na aba Produtos.",
      });
  });
  (["Especificacoes", tables.specifications] as const)[1].forEach((row, index) => {
    if (!known.has(row.produto_slug?.trim()))
      errors.push({
        sheet: "Especificacoes",
        row: index + 2,
        field: "produto_slug",
        message: "Produto não existe na aba Produtos.",
      });
  });
  return { rows, errors };
}
