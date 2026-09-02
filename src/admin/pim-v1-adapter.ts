import type { CmsProductContent } from "@/shared/contracts/cms-content";
import type { Ev2PimProductInput } from "@/shared/contracts/ev2-pim";

type MasterLabel = { id: string; name: string; slug?: string };
export type PimMasterLabels = Record<string, MasterLabel>;

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
  if (!label) throw new Error(`Referência ${dimension} não resolvida no catálogo mestre.`);
  return label;
}

export function pimGraphToV1(
  product: Ev2PimProductInput,
  base: CmsProductContent,
  labels: PimMasterLabels,
  skuByOwner: Record<string, string> = {},
): CmsProductContent {
  const manufacturer = requiredLabel(labels, product.masterData.manufacturerId, "fabricante");
  const brand = product.masterData.brandId
    ? requiredLabel(labels, product.masterData.brandId, "marca")
    : { id: "unidentified-brand", name: "Marca não informada", slug: "marca-nao-informada" };
  const line = product.masterData.lineId
    ? requiredLabel(labels, product.masterData.lineId, "linha")
    : { id: manufacturer.id, name: "Linha geral", slug: "linha-geral" };
  const category = requiredLabel(labels, product.masterData.categoryId, "categoria");
  const magnitude = product.masterData.magnitudeIds[0]
    ? requiredLabel(labels, product.masterData.magnitudeIds[0], "grandeza")
    : category;
  const technology = product.masterData.technologyIds[0]
    ? requiredLabel(labels, product.masterData.technologyIds[0], "tecnologia")
    : category;
  const installation = product.masterData.installationIds[0]
    ? requiredLabel(labels, product.masterData.installationIds[0], "instalação")
    : category;
  const monitored = requiredLabel(labels, product.masterData.monitoredElementIds[0], "elemento monitorado");

  const specifications: CmsProductContent["specifications"] = product.attributes.map((attribute) => {
    const definitionLabel =
      labels[attribute.definitionId]?.name ?? `Atributo ${attribute.definitionId.slice(0, 8)}`;
    const value = attribute.value;
    const type =
      typeof value === "boolean"
        ? "boolean"
        : typeof value === "number"
          ? "number"
          : Array.isArray(value)
            ? "enum"
            : typeof value === "object"
              ? "range"
              : "text";
    return {
      id: attribute.id,
      key: slugify(definitionLabel) || `atributo-${attribute.id.slice(0, 8)}`,
      label: definitionLabel,
      type,
      value,
      ...(attribute.unitCode ? { unit: attribute.unitCode } : {}),
      required: false,
      filterable: attribute.homologated,
      comparable: attribute.homologated,
      searchable: attribute.homologated,
    };
  });

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
      productCategory: {
        id: category.id,
        slug: category.slug ?? slugify(category.name),
        label: category.name,
      },
      applicationMagnitude: {
        id: magnitude.id,
        slug: magnitude.slug ?? slugify(magnitude.name),
        label: magnitude.name,
      },
      technology: {
        id: technology.id,
        slug: technology.slug ?? slugify(technology.name),
        label: technology.name,
      },
      installationOperation: {
        id: installation.id,
        slug: installation.slug ?? slugify(installation.name),
        label: installation.name,
      },
      monitoredElement: {
        id: monitored.id,
        slug: monitored.slug ?? slugify(monitored.name),
        label: monitored.name,
      },
    },
    commercial: {
      ...base.commercial,
      valueProposition: product.valueProposition || base.commercial.valueProposition,
    },
    technology: unique(
      product.masterData.technologyIds.map((id) => requiredLabel(labels, id, "tecnologia").name),
    ).join(", "),
    models: product.models.map((model) => ({
      id: model.id,
      model: model.name,
      manufacturerReference: model.mpn ?? "Não informado",
      sku:
        skuByOwner[model.id] ??
        model.variants.map((variant) => skuByOwner[variant.id]).find(Boolean) ??
        "PENDENTE",
      status: model.status,
      variants: model.variants.length
        ? model.variants.map((variant) => ({
            id: variant.id,
            name: variant.name,
            code: variant.code || variant.axes.map((axis) => axis.optionKey).join("-"),
            order: variant.position,
          }))
        : [{ id: model.id, name: model.name, code: model.mpn ?? model.name, order: model.position }],
    })),
    specifications: specifications.length ? specifications : base.specifications,
  };
}

export function comparePimV1Projection(expected: CmsProductContent, actual: CmsProductContent) {
  const keys = [
    "title",
    "brand",
    "manufacturer",
    "productLine",
    "classification",
    "controlledClassification",
    "technology",
    "models",
    "specifications",
  ] as const;
  return keys.flatMap((key) =>
    JSON.stringify(expected[key]) === JSON.stringify(actual[key])
      ? []
      : [{ path: key, expected: expected[key], actual: actual[key] }],
  );
}
