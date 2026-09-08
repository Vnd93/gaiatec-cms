import type { Ev2PimProductInput } from "@/shared/contracts/ev2-pim";

export function slugifyPimName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 180);
}

export function createEmptyPimProduct(): Ev2PimProductInput {
  return {
    id: crypto.randomUUID(),
    name: "",
    slug: "",
    summary: "",
    valueProposition: "",
    status: "draft",
    sourceType: "manual",
    sourceRef: "",
    masterData: {
      manufacturerId: "",
      categoryId: "",
      magnitudeIds: [],
      technologyIds: [],
      installationIds: [],
      monitoredElementIds: [],
    },
    models: [
      {
        id: crypto.randomUUID(),
        name: "",
        status: "active",
        primary: true,
        position: 0,
        variants: [],
      },
    ],
    attributes: [],
    externalIdentifiers: [],
    provenance: [
      {
        id: crypto.randomUUID(),
        sourceKind: "owner_authored",
        sourceRef: "",
        confidence: 0,
        rightsConfirmed: false,
      },
    ],
  } as Ev2PimProductInput;
}

export function withGeneratedSlug(product: Ev2PimProductInput, name: string): Ev2PimProductInput {
  const previousGenerated = slugifyPimName(product.name);
  return {
    ...product,
    name,
    slug:
      !product.slug || product.slug === previousGenerated || product.slug === "produto-novo"
        ? slugifyPimName(name)
        : product.slug,
  };
}

export function addPimModel(product: Ev2PimProductInput): Ev2PimProductInput {
  return {
    ...product,
    models: [
      ...product.models,
      {
        id: crypto.randomUUID(),
        name: "",
        status: "active",
        primary: false,
        position: product.models.length,
        variants: [],
      },
    ],
  };
}

export function setPrimaryPimModel(product: Ev2PimProductInput, modelId: string): Ev2PimProductInput {
  return {
    ...product,
    models: product.models.map((model) => ({ ...model, primary: model.id === modelId })),
  };
}

export function addPimVariant(product: Ev2PimProductInput, modelId: string): Ev2PimProductInput {
  return {
    ...product,
    models: product.models.map((model) =>
      model.id === modelId
        ? {
            ...model,
            variants: [
              ...model.variants,
              {
                id: crypto.randomUUID(),
                name: "",
                code: "",
                status: "active",
                position: model.variants.length,
                axes: [
                  {
                    axisKey: "configuracao",
                    axisLabel: "Configuração",
                    optionKey: "opcao",
                    optionLabel: "Opção",
                  },
                ],
              },
            ],
          }
        : model,
    ),
  };
}
