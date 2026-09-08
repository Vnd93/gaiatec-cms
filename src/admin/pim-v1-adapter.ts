import type { CmsProductContent } from "@/shared/contracts/cms-content";
import type { Ev2PimProductInput } from "@/shared/contracts/ev2-pim";
import { operatorErrorMessage } from "./operator-error-message";

type MasterLabel = { id: string; name: string; slug?: string };
export type PimMasterLabels = Record<string, MasterLabel>;
export type PimControlledOptions = Record<string, { id: string; slug: string; label: string }>;
export type PimAttributeDefinitions = Record<
  string,
  {
    attributeKey: string;
    label: string;
    dataType: "text" | "boolean" | "decimal" | "enum" | "range";
    required: boolean;
    filterable: boolean;
    comparable: boolean;
    searchable: boolean;
  }
>;

export type PimProjectionErrorCode =
  | "CMS_PIM_PUBLIC_DATA_REQUIRED"
  | "CMS_PIM_ACTIVE_SKU_REQUIRED"
  | "CMS_PIM_ATTRIBUTE_INVALID"
  | "CMS_PIM_ATTRIBUTE_OWNER_INVALID"
  | "CMS_PIM_IDENTIFIER_OWNER_UNREPRESENTABLE"
  | "CMS_PIM_IDENTIFIER_OWNER_INVALID"
  | "CMS_PIM_PROVENANCE_UNREPRESENTABLE";

export class PimProjectionError extends Error {
  readonly code: PimProjectionErrorCode;

  constructor(code: PimProjectionErrorCode, message: string) {
    super(
      operatorErrorMessage(message, {
        fallback: "Revise os dados do produto antes de continuar.",
      }),
    );
    this.name = "PimProjectionError";
    this.code = code;
  }
}

function projectionError(code: PimProjectionErrorCode, message: string): never {
  throw new PimProjectionError(code, message);
}

const unique = <T>(values: T[]) => [...new Set(values)];
const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function requiredLabel(labels: PimMasterLabels, id: string, dimension: string): MasterLabel {
  const label = labels[id];
  if (!label)
    projectionError(
      "CMS_PIM_PUBLIC_DATA_REQUIRED",
      `Revise o campo de ${dimension}; a opção selecionada não está disponível.`,
    );
  return label;
}

function requiredControlledOption(options: PimControlledOptions, masterId: string, dimension: string) {
  const option = options[masterId];
  if (!option)
    projectionError(
      "CMS_PIM_PUBLIC_DATA_REQUIRED",
      `Revise a classificação de ${dimension}; a opção selecionada não está disponível.`,
    );
  return option;
}

function requiredPublicId(value: string | undefined, field: string) {
  if (!value)
    projectionError("CMS_PIM_PUBLIC_DATA_REQUIRED", `Informe ${field} antes de publicar o produto.`);
  return value;
}

function requiredPublicText(value: string | undefined, field: string) {
  const normalized = value?.trim();
  if (!normalized)
    projectionError("CMS_PIM_PUBLIC_DATA_REQUIRED", `Informe ${field} antes de publicar o produto.`);
  return normalized;
}

export function pimGraphToV1(
  product: Ev2PimProductInput,
  base: CmsProductContent,
  labels: PimMasterLabels,
  skuByOwner: Record<string, string> = {},
  controlledOptions: PimControlledOptions = {},
  attributeDefinitions: PimAttributeDefinitions = {},
): CmsProductContent {
  const manufacturer = requiredLabel(labels, product.masterData.manufacturerId, "fabricante");
  const brand = requiredLabel(labels, requiredPublicId(product.masterData.brandId, "a marca"), "marca");
  const line = requiredLabel(
    labels,
    requiredPublicId(product.masterData.lineId, "a linha de produto"),
    "linha",
  );
  const category = requiredLabel(labels, product.masterData.categoryId, "categoria");
  const magnitude = requiredLabel(
    labels,
    requiredPublicId(product.masterData.magnitudeIds[0], "ao menos uma grandeza"),
    "grandeza",
  );
  requiredLabel(
    labels,
    requiredPublicId(product.masterData.technologyIds[0], "ao menos uma tecnologia"),
    "tecnologia",
  );
  const installation = requiredLabel(
    labels,
    requiredPublicId(product.masterData.installationIds[0], "ao menos uma instalação/operação"),
    "instalação",
  );
  requiredLabel(
    labels,
    requiredPublicId(product.masterData.monitoredElementIds[0], "ao menos um elemento monitorado"),
    "elemento monitorado",
  );
  const categoryOption = requiredControlledOption(
    controlledOptions,
    product.masterData.categoryId,
    "categoria",
  );
  const magnitudeOption = requiredControlledOption(
    controlledOptions,
    product.masterData.magnitudeIds[0],
    "grandeza",
  );
  const technologyOption = requiredControlledOption(
    controlledOptions,
    product.masterData.technologyIds[0],
    "tecnologia",
  );
  const installationOption = requiredControlledOption(
    controlledOptions,
    product.masterData.installationIds[0],
    "instalação",
  );
  const monitoredOption = requiredControlledOption(
    controlledOptions,
    product.masterData.monitoredElementIds[0],
    "elemento monitorado",
  );
  const activeModels = product.models.filter((model) => model.status === "active");
  if (activeModels.length === 0) {
    projectionError(
      "CMS_PIM_ACTIVE_SKU_REQUIRED",
      "Ative ao menos um modelo com SKU antes de publicar o produto.",
    );
  }
  const activeModelIds = new Set(activeModels.map((model) => model.id.toLowerCase()));
  const activeVariantIds = new Set(
    activeModels.flatMap((model) =>
      model.variants
        .filter((variant) => variant.status === "active")
        .map((variant) => variant.id.toLowerCase()),
    ),
  );
  const ownerSurvives = (scope: "product" | "model" | "variant", ownerId?: string) =>
    scope === "product"
      ? !ownerId || ownerId.toLowerCase() === product.id.toLowerCase()
      : Boolean(
          ownerId &&
          (scope === "model"
            ? activeModelIds.has(ownerId.toLowerCase())
            : activeVariantIds.has(ownerId.toLowerCase())),
        );

  const resolveModelSku = (model: (typeof activeModels)[number]) => {
    const activeVariants = model.variants.filter((variant) => variant.status === "active");
    if (activeVariants.length === 0) {
      projectionError(
        "CMS_PIM_PUBLIC_DATA_REQUIRED",
        "Todo modelo ativo deve possuir ao menos uma variante ativa.",
      );
    }
    if (activeVariants.some((variant) => !skuByOwner[variant.id]?.trim())) {
      projectionError(
        "CMS_PIM_ACTIVE_SKU_REQUIRED",
        "Informe um SKU para cada variante ativa antes de publicar o produto.",
      );
    }
    const sku = skuByOwner[model.id]?.trim();
    if (!sku) {
      projectionError(
        "CMS_PIM_ACTIVE_SKU_REQUIRED",
        "Informe um SKU para cada modelo ativo antes de publicar o produto.",
      );
    }
    return { activeVariants, sku };
  };

  const specifications: CmsProductContent["specifications"] = product.attributes.map((attribute) => {
    const definition = attributeDefinitions[attribute.definitionId];
    if (!definition)
      projectionError(
        "CMS_PIM_ATTRIBUTE_INVALID",
        "Revise a definição dos atributos antes de publicar o produto.",
      );
    if (!ownerSurvives(attribute.scope, attribute.ownerId)) {
      projectionError(
        "CMS_PIM_ATTRIBUTE_OWNER_INVALID",
        "Um atributo está associado a um modelo ou variante inativo. Revise a associação.",
      );
    }
    return {
      id: attribute.id,
      key: definition.attributeKey,
      label: definition.label,
      type: definition.dataType === "decimal" ? "number" : definition.dataType,
      value: attribute.value,
      ...(attribute.unitCode ? { unit: attribute.unitCode } : {}),
      required: definition.required,
      filterable: definition.filterable,
      comparable: definition.comparable,
      searchable: definition.searchable,
      definitionId: attribute.definitionId,
      scope: attribute.scope,
      ...(attribute.scope === "product" ? {} : { ownerId: attribute.ownerId }),
      sourceType: attribute.sourceType,
      ...(attribute.sourceRef ? { sourceRef: attribute.sourceRef } : {}),
      confidence: attribute.confidence,
      homologated: attribute.homologated,
    };
  });
  const compatibleBaseSpecifications = base.specifications.filter((specification) =>
    ownerSurvives(specification.scope ?? "product", specification.ownerId),
  );

  return {
    ...base,
    title: product.name,
    summary: product.summary || base.summary,
    brand: { name: brand.name, slug: brand.slug ?? slugify(brand.name) },
    manufacturer: {
      ...base.manufacturer,
      name: manufacturer.name,
      slug: manufacturer.slug ?? slugify(manufacturer.name),
    },
    productLine: { name: line.name, slug: line.slug ?? slugify(line.name) },
    classification: {
      ...base.classification,
      segment: category.name,
      category: magnitude.name,
      family: installation.name,
    },
    controlledClassification: {
      productCategory: categoryOption,
      applicationMagnitude: magnitudeOption,
      technology: technologyOption,
      installationOperation: installationOption,
      monitoredElement: monitoredOption,
    },
    commercial: {
      ...base.commercial,
      valueProposition: product.valueProposition || base.commercial.valueProposition,
    },
    technology: unique(
      product.masterData.technologyIds.map((id) => requiredLabel(labels, id, "tecnologia").name),
    ).join(", "),
    models: activeModels.map((model) => {
      const { activeVariants, sku } = resolveModelSku(model);
      const manufacturerReference = requiredPublicText(
        model.mpn,
        "a referência do fabricante de cada modelo",
      );
      return {
        id: model.id,
        model: model.name,
        manufacturerReference,
        sku,
        status: model.status,
        variants: activeVariants.map((variant) => ({
          id: variant.id,
          name: variant.name,
          code: variant.code || variant.axes.map((axis) => axis.optionKey).join("-"),
          sku: skuByOwner[variant.id]!.trim(),
          order: variant.position,
        })),
      };
    }),
    specifications: specifications.length ? specifications : compatibleBaseSpecifications,
    externalIdentifiers: product.externalIdentifiers.map((identifier) => {
      if (identifier.ownerType === "sku") {
        projectionError(
          "CMS_PIM_IDENTIFIER_OWNER_UNREPRESENTABLE",
          "Um identificador está associado diretamente a um SKU. Associe-o ao produto, modelo ou variante.",
        );
      }
      if (!ownerSurvives(identifier.ownerType, identifier.ownerId)) {
        projectionError(
          "CMS_PIM_IDENTIFIER_OWNER_INVALID",
          "Um identificador está associado a um modelo ou variante inativo. Revise a associação.",
        );
      }
      return {
        id: identifier.id,
        owner:
          identifier.ownerType === "product"
            ? ({ type: "product" } as const)
            : ({ type: identifier.ownerType, id: identifier.ownerId } as const),
        kind: identifier.kind,
        value: identifier.value,
        ...(identifier.issuer ? { issuer: identifier.issuer } : {}),
        visibility: "internal" as const,
        sourceType: identifier.sourceType,
        ...(identifier.sourceRef ? { sourceRef: identifier.sourceRef } : {}),
      };
    }),
    provenance: product.provenance.map((source) => {
      const baseSource = base.provenance.find(
        (candidate) =>
          candidate.sourceKind === source.sourceKind &&
          [candidate.sourcePath, candidate.sourceUrl, candidate.authorizationReference].includes(
            source.sourceRef,
          ),
      );
      if (!baseSource || !source.rightsConfirmed || !source.verifiedAt) {
        projectionError(
          "CMS_PIM_PROVENANCE_UNREPRESENTABLE",
          "Confirme a fonte, os direitos de uso e a data de verificação antes de publicar o produto.",
        );
      }
      return {
        ...baseSource,
        ...(source.sourceSha256 ? { sourceSha256: source.sourceSha256 } : {}),
        rightsConfirmed: true as const,
        verifiedAt: source.verifiedAt,
      };
    }),
  };
}

export function comparePimV1Projection(expected: CmsProductContent, actual: CmsProductContent) {
  const keys = [
    "title",
    "summary",
    "brand",
    "manufacturer",
    "productLine",
    "classification",
    "controlledClassification",
    "technology",
    "models",
    "specifications",
    "commercial",
    "externalIdentifiers",
    "provenance",
  ] as const;
  return keys.flatMap((key) =>
    JSON.stringify(expected[key]) === JSON.stringify(actual[key])
      ? []
      : [{ path: key, expected: expected[key], actual: actual[key] }],
  );
}
