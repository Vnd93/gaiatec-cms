import {
  CmsProductContentSchema,
  type CmsProductContent,
  type CmsProductFieldVisibility,
} from "@/shared/contracts/cms-content";
import { humanValidationMessage, humanValidationPath } from "./validation-field-label";

export const BULK_IMPORT_LIMIT = 500;
export const BULK_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const BULK_TEMPLATE_VERSION = "GAIATEC-CMS-PRODUTOS-v2";

export type BulkTableRow = Record<string, string>;
export type BulkWorkbookTables = {
  products: BulkTableRow[];
  models: BulkTableRow[];
  specifications: BulkTableRow[];
};
export type BulkImportError = { sheet: string; row: number; field: string; message: string };
export type BulkProductCommandRow = { sourceRow: number; slug: string; payload: CmsProductContent };
export type BulkVocabularyOption = {
  id: string;
  slug: string;
  label: string;
  active: boolean;
  sort_order?: number;
};
export type BulkVocabularyList = {
  list_key: string;
  label: string;
  active: boolean;
  options: BulkVocabularyOption[];
};

export const bulkControlledDimensions = [
  {
    column: "categoria_produto",
    listKey: "product.category",
    payloadKey: "productCategory",
    label: "Categoria do produto",
  },
  {
    column: "aplicacao_grandeza",
    listKey: "product.application_magnitude",
    payloadKey: "applicationMagnitude",
    label: "Aplicação ou grandeza",
  },
  {
    column: "tecnologia",
    listKey: "product.technology",
    payloadKey: "technology",
    label: "Tecnologia",
  },
  {
    column: "instalacao_operacao",
    listKey: "product.installation_operation",
    payloadKey: "installationOperation",
    label: "Instalação ou operação",
  },
  {
    column: "elemento_monitorado",
    listKey: "product.monitored_element",
    payloadKey: "monitoredElement",
    label: "Elemento monitorado",
  },
] as const;

type BulkControlledPayloadKey = (typeof bulkControlledDimensions)[number]["payloadKey"];
type BulkControlledRefs = Record<BulkControlledPayloadKey, { id: string; slug: string; label: string }>;

export const bulkRequiredHeaders = {
  products: [
    "template_versao",
    "referencia_produto",
    "titulo",
    "marca",
    "fabricante",
    "linha",
    "categoria_produto",
    "aplicacao_grandeza",
    "tecnologia",
    "instalacao_operacao",
    "elemento_monitorado",
    "funcao",
    "descricao_curta",
    "proposta_valor",
    "beneficios",
    "owner_portfolio",
    "revisor_tecnico",
    "revisor_comercial",
    "revisor_editorial",
  ],
  models: [
    "produto_referencia",
    "modelo_comercial",
    "referencia_fabricante",
    "sku",
    "variante",
    "codigo_variante",
  ],
  specifications: ["produto_referencia", "chave", "rotulo", "tipo", "valor"],
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

const normalizedLookup = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");

const slugify = (value: string) =>
  normalizedLookup(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

function productSlug(reference: string, title: string) {
  const result = slugify(`${reference} ${title}`).slice(0, 160).replace(/-+$/g, "");
  return result;
}

export function bulkVocabularyOptionDisplay(option: Pick<BulkVocabularyOption, "label" | "slug">) {
  return `${option.label} [${option.slug}]`;
}

export function missingBulkVocabularyLabels(vocabularies: BulkVocabularyList[]) {
  return bulkControlledDimensions
    .filter((dimension) => {
      const list = vocabularies.find(
        (candidate) => candidate.list_key === dimension.listKey && candidate.active,
      );
      return !list?.options.some((option) => option.active);
    })
    .map((dimension) => dimension.label);
}

function resolveControlledTerm(
  value: string,
  dimension: (typeof bulkControlledDimensions)[number],
  vocabularies: BulkVocabularyList[],
): { ok: true; value: { id: string; slug: string; label: string } } | { ok: false; error: string } {
  const list = vocabularies.find((candidate) => candidate.list_key === dimension.listKey && candidate.active);
  const options = (list?.options ?? []).filter((option) => option.active);
  const lookup = normalizedLookup(value);
  const matches = options.filter((option) =>
    [option.label, option.slug, bulkVocabularyOptionDisplay(option)].some(
      (candidate) => normalizedLookup(candidate) === lookup,
    ),
  );
  if (matches.length === 1) {
    const [match] = matches;
    return { ok: true, value: { id: match.id, slug: match.slug, label: match.label } };
  }
  const examples = options
    .slice()
    .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))
    .slice(0, 3)
    .map(bulkVocabularyOptionDisplay)
    .join(", ");
  return {
    ok: false,
    error:
      matches.length > 1
        ? `Nome ambíguo em ${dimension.label}. Use a opção completa com o código entre colchetes.`
        : options.length
          ? `Opção não encontrada em ${dimension.label}.${examples ? ` Exemplos válidos: ${examples}.` : ""}`
          : `${dimension.label} está indisponível. Atualize as listas mestras e tente novamente.`,
  };
}

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

export function buildBulkProductRows(tables: BulkWorkbookTables, vocabularies: BulkVocabularyList[]) {
  const errors: BulkImportError[] = [];
  const rows: BulkProductCommandRow[] = [];
  if (tables.products.length > BULK_IMPORT_LIMIT)
    errors.push({
      sheet: "Produtos",
      row: 1,
      field: "referencia_produto",
      message: `Limite de ${BULK_IMPORT_LIMIT} produtos por lote.`,
    });

  const references = new Set<string>();
  const slugs = new Set<string>();
  tables.products.slice(0, BULK_IMPORT_LIMIT).forEach((product, index) => {
    const sourceRow = index + 2;
    const reference = product.referencia_produto?.trim() ?? "";
    const referenceKey = normalizedLookup(reference);
    const slug = productSlug(reference, product.titulo?.trim() ?? "");
    if (product.template_versao !== BULK_TEMPLATE_VERSION)
      errors.push({
        sheet: "Produtos",
        row: sourceRow,
        field: "template_versao",
        message: "Versão da planilha não reconhecida.",
      });
    if (!reference)
      errors.push({
        sheet: "Produtos",
        row: sourceRow,
        field: "referencia_produto",
        message: "Informe a referência comercial, código ERP ou referência do fabricante.",
      });
    if (reference.length > 120)
      errors.push({
        sheet: "Produtos",
        row: sourceRow,
        field: "referencia_produto",
        message: "A referência comercial deve ter no máximo 120 caracteres.",
      });
    if (references.has(referenceKey))
      errors.push({
        sheet: "Produtos",
        row: sourceRow,
        field: "referencia_produto",
        message: "Referência comercial duplicada no lote.",
      });
    references.add(referenceKey);
    if (!slug)
      errors.push({
        sheet: "Produtos",
        row: sourceRow,
        field: "referencia_produto",
        message: "A referência e o título precisam conter ao menos uma letra ou número.",
      });
    if (slugs.has(slug))
      errors.push({
        sheet: "Produtos",
        row: sourceRow,
        field: "referencia_produto",
        message: "A referência gera o mesmo endereço de outro produto no lote.",
      });
    slugs.add(slug);

    const modelRows = tables.models.filter(
      (row) => normalizedLookup(row.produto_referencia ?? "") === referenceKey,
    );
    const specificationRows = tables.specifications.filter(
      (row) => normalizedLookup(row.produto_referencia ?? "") === referenceKey,
    );
    if (!modelRows.length)
      errors.push({
        sheet: "Modelos",
        row: 1,
        field: "produto_referencia",
        message: `Nenhum modelo informado para ${reference || `linha ${sourceRow}`}.`,
      });
    if (!specificationRows.length)
      errors.push({
        sheet: "Especificacoes",
        row: 1,
        field: "produto_referencia",
        message: `Nenhuma especificação informada para ${reference || `linha ${sourceRow}`}.`,
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
    const controlledRefs = {} as BulkControlledRefs;
    let controlledValid = true;
    for (const dimension of bulkControlledDimensions) {
      const resolved = resolveControlledTerm(product[dimension.column] ?? "", dimension, vocabularies);
      if (!resolved.ok) {
        controlledValid = false;
        errors.push({
          sheet: "Produtos",
          row: sourceRow,
          field: dimension.column,
          message: resolved.error,
        });
      } else {
        controlledRefs[dimension.payloadKey] = resolved.value;
      }
    }
    if (!controlledValid) return;
    const payloadCandidate = {
      schemaVersion: 1,
      consumerId: "cms.catalog-product.v1",
      contentType: "product",
      pilotState: "awaiting_owner",
      fieldVisibility: fieldVisibility(product),
      title: product.titulo?.trim() ?? "",
      ...(optional(product.resumo ?? "") ? { summary: optional(product.resumo ?? "") } : {}),
      brand: { name: product.marca?.trim() ?? "", slug: slugify(product.marca ?? "") },
      manufacturer: {
        name: product.fabricante?.trim() ?? "",
        slug: slugify(product.fabricante ?? ""),
        ...(optional(product.fabricante_url ?? "")
          ? { officialUrl: optional(product.fabricante_url ?? "") }
          : {}),
      },
      productLine: { name: product.linha?.trim() ?? "", slug: slugify(product.linha ?? "") },
      classification: {
        segment: "Resolvido no servidor",
        category: "Resolvido no servidor",
        ...(optional(product.subcategoria ?? "")
          ? { subcategory: optional(product.subcategoria ?? "") }
          : {}),
        family: "Resolvido no servidor",
      },
      controlledClassification: {
        productCategory: controlledRefs.productCategory,
        applicationMagnitude: controlledRefs.applicationMagnitude,
        technology: controlledRefs.technology,
        installationOperation: controlledRefs.installationOperation,
        monitoredElement: controlledRefs.monitoredElement,
      },
      commercial: {
        shortDescription: product.descricao_curta?.trim() ?? "",
        valueProposition: product.proposta_valor?.trim() ?? "",
        benefits: splitList(product.beneficios ?? ""),
        differentiators: splitList(product.diferenciais ?? ""),
      },
      function: product.funcao?.trim() ?? "",
      technology: "Resolvido no servidor",
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
          field: humanValidationPath(issue.path),
          message: humanValidationMessage(issue),
        }),
      );
      return;
    }
    rows.push({ sourceRow, slug, payload: parsed.data });
  });

  const known = new Set(tables.products.map((row) => normalizedLookup(row.referencia_produto ?? "")));
  (["Modelos", tables.models] as const)[1].forEach((row, index) => {
    if (!known.has(normalizedLookup(row.produto_referencia ?? "")))
      errors.push({
        sheet: "Modelos",
        row: index + 2,
        field: "produto_referencia",
        message: "Produto não existe na aba Produtos.",
      });
  });
  (["Especificacoes", tables.specifications] as const)[1].forEach((row, index) => {
    if (!known.has(normalizedLookup(row.produto_referencia ?? "")))
      errors.push({
        sheet: "Especificacoes",
        row: index + 2,
        field: "produto_referencia",
        message: "Produto não existe na aba Produtos.",
      });
  });
  return { rows, errors };
}
