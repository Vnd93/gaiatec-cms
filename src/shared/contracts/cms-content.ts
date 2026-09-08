import { z } from "zod";

export const CmsSlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(160);
const RequiredText = z.string().trim().min(1);
const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
function isPublicInternetHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    !host.includes(".") ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "::" ||
    host === "::1" ||
    /^(?:fc|fd|fe[89ab])/i.test(host)
  )
    return false;
  const ipv4 = host.split(".").map(Number);
  if (ipv4.length !== 4 || ipv4.some((part) => !Number.isInteger(part) || part < 0 || part > 255))
    return true;
  const [first, second] = ipv4;
  return !(
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    first >= 224
  );
}
export const CmsHttpUrlSchema = z
  .url()
  .max(500)
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return ["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password;
    } catch {
      return false;
    }
  }, "Somente URLs HTTP ou HTTPS são aceitas.");
export const CmsOfficialHttpsUrlSchema = CmsHttpUrlSchema.refine((value) => {
  const parsed = new URL(value);
  return parsed.protocol === "https:" && isPublicInternetHostname(parsed.hostname);
}, "URLs oficiais devem usar HTTPS e não podem conter credenciais.");
export const CmsConsumerIdSchema = z.string().regex(/^cms\.[a-z][a-z0-9_.-]+\.v[0-9]+$/);

export const CmsControlledTermRefSchema = z
  .object({
    id: z.uuid(),
    slug: CmsSlugSchema,
    label: RequiredText.max(160),
    publicVisible: z.boolean().optional(),
  })
  .strict();

export const CmsProvenanceSchema = z
  .object({
    sourceKind: z.enum(["official_manufacturer", "official_company", "owner_authored"]),
    sourceUrl: CmsOfficialHttpsUrlSchema.optional(),
    sourcePath: RequiredText.max(500).optional(),
    fileModifiedAt: z.iso.datetime().optional(),
    documentVersion: z.string().trim().min(1).max(80).optional(),
    documentDate: z.iso.date().optional(),
    sourceSha256: Sha256.optional(),
    authorizationReference: RequiredText.max(300).optional(),
    authorizationDate: z.iso.date().optional(),
    rightsScope: RequiredText.max(300).optional(),
    rightsConfirmed: z.literal(true),
    commercialOwner: RequiredText.max(120),
    technicalOwner: RequiredText.max(120),
    verifiedAt: z.iso.datetime(),
  })
  .strict()
  .refine(
    (value) =>
      value.sourceKind === "owner_authored" ||
      Boolean((value.sourceUrl || value.sourcePath) && value.sourceSha256),
    "Fontes externas exigem localização e hash do documento oficial.",
  );

export const CmsSeoSchema = z
  .object({
    title: RequiredText.max(70),
    description: RequiredText.max(170),
    canonicalPath: z.string().startsWith("/").max(200),
    indexable: z.boolean().default(false),
    ogImageId: z.uuid().optional(),
  })
  .strict();

const BlockBase = { id: z.uuid() };
export const CmsBlockSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...BlockBase,
      type: z.literal("rich_text"),
      data: z.object({ text: RequiredText.max(10000) }).strict(),
    })
    .strict(),
  z
    .object({
      ...BlockBase,
      type: z.literal("image"),
      data: z
        .object({
          assetId: z.uuid(),
          alt: RequiredText.max(300),
          caption: z.string().trim().max(500).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...BlockBase,
      type: z.literal("gallery"),
      data: z.object({ assetIds: z.array(z.uuid()).min(1).max(30) }).strict(),
    })
    .strict(),
  z
    .object({
      ...BlockBase,
      type: z.literal("cta"),
      data: z.object({ label: RequiredText.max(120), href: z.string().startsWith("/").max(300) }).strict(),
    })
    .strict(),
  z
    .object({
      ...BlockBase,
      type: z.literal("specifications"),
      data: z.object({ source: z.literal("typed-attributes") }).strict(),
    })
    .strict(),
  z
    .object({
      ...BlockBase,
      type: z.literal("related_content"),
      data: z.object({ state: z.string().trim().max(300).optional() }).strict(),
    })
    .strict(),
]);

const BaseContent = {
  schemaVersion: z.literal(1),
  consumerId: CmsConsumerIdSchema,
  title: RequiredText.max(180),
  summary: z.string().trim().max(500).optional(),
  blocks: z.array(CmsBlockSchema).max(80),
  seo: CmsSeoSchema,
  provenance: z.array(CmsProvenanceSchema).min(1).max(30),
};

export const CmsProductFieldVisibilitySchema = z
  .object({
    brand: z.enum(["public", "internal"]).default("public"),
    manufacturer: z.enum(["public", "internal"]).default("internal"),
    productLine: z.enum(["public", "internal"]).default("public"),
    commercialModel: z.enum(["public", "internal"]).default("public"),
    manufacturerReference: z.enum(["public", "internal"]).default("internal"),
    sku: z.enum(["public", "internal"]).default("internal"),
    classification: z.enum(["public", "internal"]).default("public"),
    function: z.enum(["public", "internal"]).default("public"),
    technology: z.enum(["public", "internal"]).default("public"),
    specifications: z.enum(["public", "internal"]).default("public"),
    relations: z.enum(["public", "internal"]).default("public"),
    documents: z.enum(["public", "internal"]).default("public"),
  })
  .strict()
  .default({
    brand: "public",
    manufacturer: "internal",
    productLine: "public",
    commercialModel: "public",
    manufacturerReference: "internal",
    sku: "internal",
    classification: "public",
    function: "public",
    technology: "public",
    specifications: "public",
    relations: "public",
    documents: "public",
  });

export const CmsProductContentSchema = z
  .object({
    ...BaseContent,
    contentType: z.literal("product"),
    pilotState: z.enum(["synthetic_test", "awaiting_owner", "homologated"]),
    fieldVisibility: CmsProductFieldVisibilitySchema,
    brand: z.object({ name: RequiredText.max(120), slug: CmsSlugSchema }).strict(),
    manufacturer: z
      .object({
        name: RequiredText.max(120),
        slug: CmsSlugSchema,
        officialUrl: CmsOfficialHttpsUrlSchema.optional(),
      })
      .strict(),
    productLine: z.object({ name: RequiredText.max(120), slug: CmsSlugSchema }).strict(),
    classification: z
      .object({
        segment: RequiredText.max(160),
        category: RequiredText.max(160),
        subcategory: z.string().trim().max(160).optional(),
        family: RequiredText.max(160),
      })
      .strict(),
    controlledClassification: z
      .object({
        productCategory: CmsControlledTermRefSchema,
        applicationMagnitude: CmsControlledTermRefSchema,
        technology: CmsControlledTermRefSchema,
        installationOperation: CmsControlledTermRefSchema,
        monitoredElement: CmsControlledTermRefSchema,
      })
      .strict()
      .optional(),
    commercial: z
      .object({
        shortDescription: RequiredText.max(500),
        valueProposition: RequiredText.max(500),
        benefits: z.array(RequiredText.max(300)).min(1).max(20),
        differentiators: z.array(RequiredText.max(300)).max(20).default([]),
      })
      .strict(),
    function: RequiredText.max(300),
    technology: RequiredText.max(160),
    models: z
      .array(
        z
          .object({
            id: z.uuid(),
            model: RequiredText.max(160),
            manufacturerReference: RequiredText.max(160),
            sku: RequiredText.max(120),
            status: z.enum(["active", "discontinued"]),
            variants: z
              .array(
                z
                  .object({
                    id: z.uuid(),
                    name: RequiredText.max(160),
                    code: RequiredText.max(120),
                    sku: RequiredText.max(120).optional(),
                    order: z.number().int().min(0).max(999),
                  })
                  .strict(),
              )
              .min(1)
              .max(100),
          })
          .strict(),
      )
      .min(1)
      .max(50),
    specifications: z
      .array(
        z
          .object({
            id: z.uuid(),
            key: CmsSlugSchema,
            label: RequiredText.max(120),
            type: z.enum(["text", "number", "boolean", "enum", "range"]),
            value: z.union([
              z.string().max(500),
              z.number().finite(),
              z.boolean(),
              z.array(z.string().trim().min(1).max(120)).max(30),
              z.object({ min: z.number().finite(), max: z.number().finite() }).strict(),
            ]),
            unit: z.string().trim().max(40).optional(),
            required: z.boolean(),
            filterable: z.boolean(),
            comparable: z.boolean(),
            searchable: z.boolean(),
            definitionId: z.uuid().optional(),
            scope: z.enum(["product", "model", "variant"]).optional(),
            ownerId: z.uuid().optional(),
            sourceType: z.enum(["manual", "import", "legacy"]).optional(),
            sourceRef: z.string().trim().max(300).optional(),
            confidence: z.number().min(0).max(1).optional(),
            homologated: z.boolean().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(200),
    externalIdentifiers: z
      .array(
        z
          .object({
            id: z.uuid(),
            owner: z.discriminatedUnion("type", [
              z.object({ type: z.literal("product") }).strict(),
              z.object({ type: z.literal("model"), id: z.uuid() }).strict(),
              z.object({ type: z.literal("variant"), id: z.uuid() }).strict(),
            ]),
            kind: z.enum(["erp", "gtin", "ncm", "other"]),
            value: RequiredText.max(180),
            issuer: z.string().trim().max(160).optional(),
            visibility: z.enum(["public", "internal"]).default("internal"),
            sourceType: z.enum(["manual", "import", "legacy"]).default("manual"),
            sourceRef: z.string().trim().max(300).optional(),
          })
          .strict()
          .superRefine((identifier, context) => {
            if (identifier.kind === "gtin" && !/^\d{8}(?:\d{4}(?:\d{1,2})?)?$/.test(identifier.value)) {
              context.addIssue({
                code: "custom",
                path: ["value"],
                message: "GTIN deve conter 8, 12, 13 ou 14 dígitos.",
              });
            }
            if (identifier.kind === "ncm" && !/^\d{8}$/.test(identifier.value)) {
              context.addIssue({ code: "custom", path: ["value"], message: "NCM deve conter 8 dígitos." });
            }
          }),
      )
      .max(100)
      .default([]),
    media: z
      .array(
        z
          .object({
            assetId: z.uuid(),
            role: z.enum(["primary", "gallery", "diagram"]),
            alt: RequiredText.max(300),
            caption: z.string().trim().max(500).optional(),
            order: z.number().int().min(0).max(999),
          })
          .strict(),
      )
      .max(30),
    documents: z
      .array(
        z
          .object({
            id: z.uuid().transform((value) => value.toLowerCase()),
            kind: z.enum(["datasheet", "manual", "certificate", "drawing", "software", "other"]),
            title: RequiredText.max(180),
            storagePath: z.string().regex(/^cms-documents\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+\.pdf$/),
            sha256: Sha256,
            revision: RequiredText.max(80),
            language: z
              .string()
              .trim()
              .regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/),
            visibility: z.enum(["public", "private"]),
            rightsConfirmed: z.literal(true),
          })
          .strict()
          .refine((value) => value.storagePath.split("/")[1]?.toLowerCase() === value.id.toLowerCase(), {
            message: "O caminho governado deve pertencer ao mesmo documento.",
          }),
      )
      .max(30)
      .superRefine((documents, context) => {
        const seen = new Set<string>();
        documents.forEach((document, index) => {
          const id = document.id.toLowerCase();
          if (seen.has(id)) {
            context.addIssue({
              code: "custom",
              path: [index, "id"],
              message: "Documento duplicado.",
            });
          }
          seen.add(id);
        });
      }),
    relations: z
      .object({
        productIds: z.array(z.uuid()).max(50),
        applicationIds: z.array(z.uuid()).max(50),
        sectorIds: z.array(z.uuid()).max(50),
        serviceIds: z.array(z.uuid()).max(50),
      })
      .strict(),
    search: z
      .object({
        synonyms: z.array(RequiredText.max(120)).max(50),
        keywords: z.array(RequiredText.max(120)).max(50),
      })
      .strict(),
    redirects: z
      .array(
        z
          .object({
            sourcePath: z.string().startsWith("/").max(200),
            statusCode: z.enum(["301", "302"]),
          })
          .strict(),
      )
      .max(30),
    approval: z
      .object({
        portfolioOwner: RequiredText.max(120),
        technicalReviewer: RequiredText.max(120),
        commercialReviewer: RequiredText.max(120),
        editorialReviewer: RequiredText.max(120),
        homologatedAt: z.iso.datetime().optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    const normalizeIdentity = (candidate: string) => candidate.trim().toLocaleLowerCase("pt-BR");
    const modelIds = new Set<string>();
    const variantIds = new Set<string>();
    const skus = new Set<string>();
    value.models.forEach((model, modelIndex) => {
      const variantCodes = new Set<string>();
      const modelId = normalizeIdentity(model.id);
      if (modelIds.has(modelId)) {
        context.addIssue({
          code: "custom",
          path: ["models", modelIndex, "id"],
          message: "Modelo duplicado.",
        });
      }
      modelIds.add(modelId);

      const modelSku = normalizeIdentity(model.sku);
      if (skus.has(modelSku)) {
        context.addIssue({
          code: "custom",
          path: ["models", modelIndex, "sku"],
          message: "SKU duplicado.",
        });
      }
      skus.add(modelSku);

      model.variants.forEach((variant, variantIndex) => {
        const variantId = normalizeIdentity(variant.id);
        if (variantIds.has(variantId)) {
          context.addIssue({
            code: "custom",
            path: ["models", modelIndex, "variants", variantIndex, "id"],
            message: "Variante duplicada.",
          });
        }
        variantIds.add(variantId);

        const variantCode = normalizeIdentity(variant.code);
        if (variantCodes.has(variantCode)) {
          context.addIssue({
            code: "custom",
            path: ["models", modelIndex, "variants", variantIndex, "code"],
            message: "Código de variante duplicado.",
          });
        }
        variantCodes.add(variantCode);

        if (variant.sku) {
          const variantSku = normalizeIdentity(variant.sku);
          if (skus.has(variantSku)) {
            context.addIssue({
              code: "custom",
              path: ["models", modelIndex, "variants", variantIndex, "sku"],
              message: "SKU duplicado.",
            });
          }
          skus.add(variantSku);
        }
      });
    });
    value.models.forEach((model, modelIndex) => {
      model.variants.forEach((variant, variantIndex) => {
        if (modelIds.has(normalizeIdentity(variant.id))) {
          context.addIssue({
            code: "custom",
            path: ["models", modelIndex, "variants", variantIndex, "id"],
            message: "Modelo e variante não podem compartilhar a mesma identidade.",
          });
        }
      });
    });
    const specificationIds = new Set<string>();
    const specificationIdentities = new Set<string>();
    value.specifications.forEach((specification, index) => {
      const specificationId = normalizeIdentity(specification.id);
      const specificationIdentity = [
        normalizeIdentity(specification.definitionId ?? specification.key),
        specification.scope ?? "product",
        specification.ownerId ? normalizeIdentity(specification.ownerId) : "product",
      ].join(":");
      if (specificationIds.has(specificationId)) {
        context.addIssue({
          code: "custom",
          path: ["specifications", index, "id"],
          message: "Atributo técnico duplicado.",
        });
      }
      if (specificationIdentities.has(specificationIdentity)) {
        context.addIssue({
          code: "custom",
          path: ["specifications", index, "key"],
          message: "Atributo técnico duplicado para o mesmo escopo.",
        });
      }
      specificationIds.add(specificationId);
      specificationIdentities.add(specificationIdentity);
      if (
        specification.type === "range" &&
        typeof specification.value === "object" &&
        !Array.isArray(specification.value) &&
        specification.value.min > specification.value.max
      ) {
        context.addIssue({
          code: "custom",
          path: ["specifications", index, "value"],
          message: "O limite mínimo não pode exceder o máximo.",
        });
      }
      const valueMatchesType =
        (specification.type === "text" && typeof specification.value === "string") ||
        (specification.type === "number" && typeof specification.value === "number") ||
        (specification.type === "boolean" && typeof specification.value === "boolean") ||
        (specification.type === "enum" && Array.isArray(specification.value)) ||
        (specification.type === "range" &&
          typeof specification.value === "object" &&
          !Array.isArray(specification.value));
      if (!valueMatchesType) {
        context.addIssue({
          code: "custom",
          path: ["specifications", index, "value"],
          message: "O valor não corresponde ao tipo do atributo técnico.",
        });
      }
      if (
        specification.homologated === true &&
        (!specification.definitionId ||
          !specification.scope ||
          !specification.sourceType ||
          specification.confidence === undefined)
      ) {
        context.addIssue({
          code: "custom",
          path: ["specifications", index],
          message: "Atributo homologado exige definição, escopo, origem e confiança governados.",
        });
      }
      if (["import", "legacy"].includes(specification.sourceType ?? "") && !specification.sourceRef?.trim()) {
        context.addIssue({
          code: "custom",
          path: ["specifications", index, "sourceRef"],
          message: "Importação ou base anterior exige evidência da origem.",
        });
      }
      if (
        specification.scope === "model" &&
        (!specification.ownerId || !modelIds.has(normalizeIdentity(specification.ownerId)))
      ) {
        context.addIssue({
          code: "custom",
          path: ["specifications", index, "ownerId"],
          message: "O modelo selecionado não pertence a este produto.",
        });
      }
      if (
        specification.scope === "variant" &&
        (!specification.ownerId || !variantIds.has(normalizeIdentity(specification.ownerId)))
      ) {
        context.addIssue({
          code: "custom",
          path: ["specifications", index, "ownerId"],
          message: "A variante selecionada não pertence a este produto.",
        });
      }
      if ((specification.scope ?? "product") === "product" && specification.ownerId) {
        context.addIssue({
          code: "custom",
          path: ["specifications", index, "ownerId"],
          message: "Atributo do produto não deve apontar para modelo ou variante.",
        });
      }
    });
    const identifierIds = new Set<string>();
    const identifierKeys = new Set<string>();
    value.externalIdentifiers.forEach((identifier, index) => {
      const identifierId = normalizeIdentity(identifier.id);
      if (identifierIds.has(identifierId)) {
        context.addIssue({
          code: "custom",
          path: ["externalIdentifiers", index, "id"],
          message: "Identificador comercial duplicado.",
        });
      }
      identifierIds.add(identifierId);
      if (identifier.owner.type === "model" && !modelIds.has(normalizeIdentity(identifier.owner.id))) {
        context.addIssue({
          code: "custom",
          path: ["externalIdentifiers", index, "owner"],
          message: "O modelo selecionado não pertence a este produto.",
        });
      }
      if (identifier.owner.type === "variant" && !variantIds.has(normalizeIdentity(identifier.owner.id))) {
        context.addIssue({
          code: "custom",
          path: ["externalIdentifiers", index, "owner"],
          message: "A variante selecionada não pertence a este produto.",
        });
      }
      const key = `${identifier.kind}:${identifier.value.toLocaleLowerCase("pt-BR")}`;
      if (identifierKeys.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["externalIdentifiers", index, "value"],
          message: "Identificador comercial duplicado.",
        });
      }
      identifierKeys.add(key);
    });
    if (value.pilotState === "homologated" && !value.approval.homologatedAt) {
      context.addIssue({
        code: "custom",
        path: ["approval", "homologatedAt"],
        message: "Homologação exige data.",
      });
    }
    if (value.seo.indexable && value.pilotState !== "homologated") {
      context.addIssue({
        code: "custom",
        path: ["seo", "indexable"],
        message: "Somente produto homologado pode ser indexável.",
      });
    }
  });

export const CmsServiceContentSchema = z
  .object({
    ...BaseContent,
    contentType: z.literal("service"),
    governanceState: z.enum(["synthetic_test", "awaiting_owner", "homologated"]),
    serviceKind: RequiredText.max(120),
    serviceKindRef: CmsControlledTermRefSchema.optional(),
    scope: RequiredText.max(3000),
    whenToHire: z.array(RequiredText.max(300)).min(1).max(30),
    deliverables: z.array(RequiredText.max(300)).min(1).max(50),
    prerequisites: z.array(RequiredText.max(300)).max(30),
    executionSteps: z.array(RequiredText.max(300)).min(1).max(30),
    media: z
      .array(
        z
          .object({
            assetId: z.uuid(),
            role: z.enum(["primary", "gallery", "diagram"]),
            alt: RequiredText.max(300),
            caption: z.string().trim().max(500).optional(),
            order: z.number().int().min(0).max(999),
          })
          .strict(),
      )
      .max(30),
    cta: z.object({ label: RequiredText.max(120), href: z.string().startsWith("/").max(300) }).strict(),
    relations: z
      .object({
        productIds: z.array(z.uuid()).max(100),
        industryIds: z.array(z.uuid()).max(100),
        applicationIds: z.array(z.uuid()).max(100),
        solutionIds: z.array(z.uuid()).max(100),
      })
      .strict(),
    search: z
      .object({
        synonyms: z.array(RequiredText.max(120)).max(50),
        keywords: z.array(RequiredText.max(120)).max(50),
      })
      .strict(),
    approval: z
      .object({
        operationalOwner: RequiredText.max(120),
        technicalReviewer: RequiredText.max(120),
        commercialReviewer: RequiredText.max(120),
        editorialReviewer: RequiredText.max(120),
        homologatedAt: z.iso.datetime().optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.governanceState === "homologated" && !value.approval.homologatedAt)
      context.addIssue({
        code: "custom",
        path: ["approval", "homologatedAt"],
        message: "Homologação exige data.",
      });
    if (value.seo.indexable && value.governanceState !== "homologated")
      context.addIssue({
        code: "custom",
        path: ["seo", "indexable"],
        message: "Somente serviço homologado pode ser indexável.",
      });
  });

const DiscoveryRelationsSchema = z
  .object({
    productIds: z.array(z.uuid()).max(100),
    serviceIds: z.array(z.uuid()).max(100),
    industryIds: z.array(z.uuid()).max(100),
    applicationIds: z.array(z.uuid()).max(100),
    solutionIds: z.array(z.uuid()).max(100),
  })
  .strict();
const DiscoverySearchSchema = z
  .object({
    synonyms: z.array(RequiredText.max(120)).max(50),
    keywords: z.array(RequiredText.max(120)).max(50),
  })
  .strict();
const DiscoveryApprovalSchema = z
  .object({
    businessOwner: RequiredText.max(120),
    technicalReviewer: RequiredText.max(120),
    commercialReviewer: RequiredText.max(120),
    editorialReviewer: RequiredText.max(120),
    homologatedAt: z.iso.datetime().optional(),
  })
  .strict();
const DiscoveryMediaSchema = z
  .array(
    z
      .object({
        assetId: z.uuid(),
        role: z.enum(["primary", "gallery", "diagram"]),
        alt: RequiredText.max(300),
        caption: z.string().trim().max(500).optional(),
        order: z.number().int().min(0).max(999),
      })
      .strict(),
  )
  .max(30);
const GovernedDiscovery = {
  governanceState: z.enum(["synthetic_test", "awaiting_owner", "homologated"]),
  media: DiscoveryMediaSchema,
  relations: DiscoveryRelationsSchema,
  search: DiscoverySearchSchema,
  approval: DiscoveryApprovalSchema,
};

export const CmsIndustryContentSchema = z
  .object({
    ...BaseContent,
    ...GovernedDiscovery,
    contentType: z.literal("industry"),
    displayOrder: z.number().int().min(0).max(999).default(999),
    marketName: RequiredText.max(160),
    challenges: z.array(RequiredText.max(500)).min(1).max(30),
    evidence: z.array(RequiredText.max(500)).min(1).max(30),
    processAreas: z.array(RequiredText.max(300)).min(1).max(50),
    cta: z.object({ label: RequiredText.max(120), href: z.string().startsWith("/").max(300) }).strict(),
  })
  .strict();

export const CmsApplicationContentSchema = z
  .object({
    ...BaseContent,
    ...GovernedDiscovery,
    contentType: z.literal("application"),
    process: RequiredText.max(1000),
    problem: RequiredText.max(1000),
    benefits: z.array(RequiredText.max(500)).min(1).max(30),
    points: z
      .array(
        z
          .object({
            id: z.uuid(),
            title: RequiredText.max(160),
            need: RequiredText.max(500),
            variable: RequiredText.max(160),
            function: RequiredText.max(500),
            technicalBenefit: RequiredText.max(500),
            operationalBenefit: RequiredText.max(500),
            conditions: z.string().trim().max(500).optional(),
            productIds: z.array(z.uuid()).max(30),
            serviceIds: z.array(z.uuid()).max(30),
          })
          .strict(),
      )
      .min(1)
      .max(50),
    cta: z.object({ label: RequiredText.max(120), href: z.string().startsWith("/").max(300) }).strict(),
  })
  .strict();

export const CmsSolutionContentSchema = z
  .object({
    ...BaseContent,
    ...GovernedDiscovery,
    contentType: z.literal("solution"),
    problem: RequiredText.max(1000),
    approach: RequiredText.max(3000),
    benefits: z.array(RequiredText.max(500)).min(1).max(30),
    components: z.array(RequiredText.max(300)).min(1).max(50),
    gasDetectionModel: z.enum(["not_applicable", "integrated_master_catalog"]),
    cta: z.object({ label: RequiredText.max(120), href: z.string().startsWith("/").max(300) }).strict(),
  })
  .strict();

export const CmsPostContentSchema = z
  .object({
    ...BaseContent,
    contentType: z.literal("post"),
    excerpt: RequiredText.max(500),
    authorName: RequiredText.max(120),
    author: z
      .object({
        id: z.uuid(),
        name: RequiredText.max(120),
        slug: CmsSlugSchema,
        role: z.string().trim().max(120).optional(),
        bio: z.string().trim().max(800).optional(),
      })
      .strict(),
    category: z.object({ id: z.uuid(), name: RequiredText.max(120), slug: CmsSlugSchema }).strict(),
    tags: z
      .array(z.object({ id: z.uuid(), name: RequiredText.max(80), slug: CmsSlugSchema }).strict())
      .max(20),
    relations: z
      .object({
        postIds: z.array(z.uuid()).max(30),
        productIds: z.array(z.uuid()).max(30),
        serviceIds: z.array(z.uuid()).max(30),
        applicationIds: z.array(z.uuid()).max(30),
        solutionIds: z.array(z.uuid()).max(30),
      })
      .strict(),
    readingMinutes: z.number().int().min(1).max(180),
    publishAfter: z.iso.datetime().optional(),
  })
  .strict();

export const CmsPublicPostContentSchema = CmsPostContentSchema.omit({ provenance: true });

const visualSpan = (columns: number) =>
  z
    .object({
      span: z.number().int().min(1).max(columns),
      start: z.number().int().min(1).max(columns).optional(),
      hidden: z.boolean(),
    })
    .strict()
    .refine((value) => !value.start || value.start + value.span - 1 <= columns, {
      message: `O componente precisa permanecer dentro das ${columns} colunas.`,
    });

export const CmsVisualLayoutSchema = z
  .object({
    desktop: visualSpan(12),
    tablet: visualSpan(8),
    mobile: visualSpan(4),
  })
  .strict();

const PageBlockBase = {
  id: z.uuid(),
  hidden: z.boolean().default(false),
  anchor: CmsSlugSchema.optional(),
  width: z.enum(["content", "wide", "full"]).default("content"),
  tone: z.enum(["light", "muted", "dark", "brand"]).default("light"),
  componentVersion: z.number().int().min(1).max(100).optional(),
  layout: CmsVisualLayoutSchema.optional(),
  groupId: z.uuid().optional(),
  symbolId: z.uuid().optional(),
};

const PageInternalPathSchema = z
  .string()
  .regex(/^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/?)*$/)
  .max(300);
const PageHttpUrlSchema = CmsHttpUrlSchema;
const PageHrefSchema = z.union([PageInternalPathSchema, PageHttpUrlSchema]);

const PageLinkSchema = z
  .object({
    label: RequiredText.max(120),
    href: PageHrefSchema,
  })
  .strict();

export const CmsPageBlockSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...PageBlockBase,
      type: z.literal("hero"),
      data: z
        .object({
          eyebrow: z.string().trim().max(120).optional(),
          title: RequiredText.max(220),
          text: z.string().trim().max(1200).optional(),
          primaryCta: PageLinkSchema.optional(),
          secondaryCta: PageLinkSchema.optional(),
          assetId: z.uuid().optional(),
          alt: z.string().trim().max(300).optional(),
          alignment: z.enum(["left", "center"]).default("left"),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...PageBlockBase,
      type: z.literal("rich_text"),
      data: z
        .object({
          eyebrow: z.string().trim().max(120).optional(),
          heading: z.string().trim().max(220).optional(),
          text: RequiredText.max(20000),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...PageBlockBase,
      type: z.literal("image"),
      data: z
        .object({
          assetId: z.uuid(),
          alt: RequiredText.max(300),
          caption: z.string().trim().max(500).optional(),
          fit: z.enum(["cover", "contain"]).default("cover"),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...PageBlockBase,
      type: z.literal("gallery"),
      data: z
        .object({
          heading: z.string().trim().max(220).optional(),
          assetIds: z.array(z.uuid()).min(1).max(24),
          columns: z.number().int().min(2).max(4).default(3),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...PageBlockBase,
      type: z.literal("benefit_grid"),
      data: z
        .object({
          eyebrow: z.string().trim().max(120).optional(),
          heading: RequiredText.max(220),
          items: z
            .array(
              z.object({ id: z.uuid(), title: RequiredText.max(160), text: RequiredText.max(800) }).strict(),
            )
            .min(1)
            .max(12),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...PageBlockBase,
      type: z.literal("content_grid"),
      data: z
        .object({
          eyebrow: z.string().trim().max(120).optional(),
          heading: RequiredText.max(220),
          items: z
            .array(
              z
                .object({
                  id: z.uuid(),
                  title: RequiredText.max(160),
                  text: z.string().trim().max(800).optional(),
                  href: PageInternalPathSchema.optional(),
                  assetId: z.uuid().optional(),
                })
                .strict(),
            )
            .min(1)
            .max(24),
          columns: z.number().int().min(2).max(4).default(3),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...PageBlockBase,
      type: z.literal("steps"),
      data: z
        .object({
          heading: RequiredText.max(220),
          items: z
            .array(
              z.object({ id: z.uuid(), title: RequiredText.max(160), text: RequiredText.max(800) }).strict(),
            )
            .min(1)
            .max(20),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...PageBlockBase,
      type: z.literal("metrics"),
      data: z
        .object({
          heading: z.string().trim().max(220).optional(),
          items: z
            .array(
              z.object({ id: z.uuid(), value: RequiredText.max(80), label: RequiredText.max(160) }).strict(),
            )
            .min(1)
            .max(12),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...PageBlockBase,
      type: z.literal("testimonial"),
      data: z
        .object({
          quote: RequiredText.max(2000),
          author: RequiredText.max(160),
          role: z.string().trim().max(160).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...PageBlockBase,
      type: z.literal("faq"),
      data: z
        .object({
          heading: RequiredText.max(220),
          items: z
            .array(
              z
                .object({ id: z.uuid(), question: RequiredText.max(300), answer: RequiredText.max(3000) })
                .strict(),
            )
            .min(1)
            .max(30),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...PageBlockBase,
      type: z.literal("form"),
      data: z
        .object({
          heading: RequiredText.max(220),
          text: z.string().trim().max(1000).optional(),
          formKey: CmsSlugSchema,
          formId: z.uuid().optional(),
          formVersionId: z.uuid().optional(),
          buttonLabel: RequiredText.max(120),
        })
        .strict()
        .superRefine((value, context) => {
          if (Boolean(value.formId) !== Boolean(value.formVersionId))
            context.addIssue({
              code: "custom",
              path: [value.formId ? "formVersionId" : "formId"],
              message: "Formulário governado exige definição e versão juntas.",
            });
        }),
    })
    .strict(),
  z
    .object({
      ...PageBlockBase,
      type: z.literal("cta"),
      data: z
        .object({
          heading: RequiredText.max(220),
          text: z.string().trim().max(1000).optional(),
          link: PageLinkSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...PageBlockBase,
      type: z.literal("related_content"),
      data: z
        .object({
          heading: RequiredText.max(220),
          itemIds: z.array(z.uuid()).min(1).max(24),
          presentation: z.enum(["cards", "list"]).default("cards"),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...PageBlockBase,
      type: z.literal("split_content"),
      data: z
        .object({
          eyebrow: z.string().trim().max(120).optional(),
          heading: RequiredText.max(220),
          text: RequiredText.max(5000),
          assetId: z.uuid(),
          alt: RequiredText.max(300),
          imagePosition: z.enum(["left", "right"]),
          link: PageLinkSchema.optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...PageBlockBase,
      type: z.literal("logo_cloud"),
      data: z
        .object({
          heading: z.string().trim().max(220).optional(),
          items: z
            .array(
              z
                .object({
                  id: z.uuid(),
                  assetId: z.uuid(),
                  alt: RequiredText.max(300),
                  href: PageHrefSchema.optional(),
                })
                .strict(),
            )
            .min(1)
            .max(24),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...PageBlockBase,
      type: z.literal("tabs"),
      data: z
        .object({
          heading: z.string().trim().max(220).optional(),
          items: z
            .array(
              z
                .object({
                  id: z.uuid(),
                  label: RequiredText.max(80),
                  heading: RequiredText.max(180),
                  text: RequiredText.max(3000),
                })
                .strict(),
            )
            .min(2)
            .max(8),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...PageBlockBase,
      type: z.literal("comparison_table"),
      data: z
        .object({
          heading: RequiredText.max(220),
          caption: RequiredText.max(500),
          columns: z.array(RequiredText.max(100)).min(2).max(5),
          rows: z
            .array(
              z
                .object({
                  id: z.uuid(),
                  label: RequiredText.max(160),
                  values: z.array(z.string().trim().max(500)).min(2).max(5),
                })
                .strict(),
            )
            .min(1)
            .max(30),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...PageBlockBase,
      type: z.literal("alert"),
      data: z
        .object({
          heading: RequiredText.max(180),
          text: RequiredText.max(2000),
          severity: z.enum(["info", "success", "warning"]),
          link: PageLinkSchema.optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...PageBlockBase,
      type: z.literal("timeline"),
      data: z
        .object({
          heading: RequiredText.max(220),
          items: z
            .array(
              z
                .object({
                  id: z.uuid(),
                  label: RequiredText.max(80),
                  title: RequiredText.max(180),
                  text: RequiredText.max(1500),
                })
                .strict(),
            )
            .min(2)
            .max(20),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...PageBlockBase,
      type: z.literal("link_list"),
      data: z
        .object({
          heading: RequiredText.max(220),
          items: z
            .array(
              z
                .object({
                  id: z.uuid(),
                  label: RequiredText.max(160),
                  href: PageHrefSchema,
                  description: z.string().trim().max(500).optional(),
                })
                .strict(),
            )
            .min(1)
            .max(30),
        })
        .strict(),
    })
    .strict(),
]);

const ManagedPageBase = {
  schemaVersion: z.literal(1),
  title: RequiredText.max(180),
  summary: z.string().trim().max(500).optional(),
  pageKind: z.enum(["institutional", "thematic", "landing", "campaign", "home"]),
  templateKey: z.enum(["standard", "editorial", "landing", "technical", "home"]).default("standard"),
  visual: z
    .object({
      schemaVersion: z.literal(1),
      branchId: z.uuid(),
      documentHash: Sha256,
      registryVersion: z.literal(1),
      themeKey: CmsSlugSchema,
      mode: z.enum(["guided", "designer"]),
      grid: z.object({ desktop: z.literal(12), tablet: z.literal(8), mobile: z.literal(4) }).strict(),
    })
    .strict()
    .optional(),
  route: z
    .object({
      path: z
        .string()
        .regex(/^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/?)*$/)
        .max(200)
        .refine((path) => path !== "/", "A rota raiz é exclusiva da homepage."),
      navigationLabel: z.string().trim().max(80).optional(),
      breadcrumbLabel: z.string().trim().max(80).optional(),
    })
    .strict(),
  blocks: z.array(CmsPageBlockSchema).min(1).max(80),
  seo: CmsSeoSchema,
  provenance: z.array(CmsProvenanceSchema).min(1).max(30),
  governanceState: z.enum(["synthetic_test", "awaiting_owner", "homologated"]),
  relations: z
    .object({
      productIds: z.array(z.uuid()).max(100),
      serviceIds: z.array(z.uuid()).max(100),
      industryIds: z.array(z.uuid()).max(100),
      applicationIds: z.array(z.uuid()).max(100),
      solutionIds: z.array(z.uuid()).max(100),
    })
    .strict(),
  retirement: z
    .object({
      mode: z.enum(["not_found", "gone", "redirect"]),
      destinationPath: z
        .string()
        .regex(/^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/?)*$/)
        .max(300)
        .optional(),
    })
    .strict(),
  approval: z
    .object({
      businessOwner: RequiredText.max(120),
      editorialReviewer: RequiredText.max(120),
      approvedAt: z.iso.datetime().optional(),
    })
    .strict(),
};

function validateManagedPage(
  value: {
    governanceState: string;
    route: { path: string };
    seo: { indexable: boolean; canonicalPath: string };
    retirement: { mode: string; destinationPath?: string };
    approval: { approvedAt?: string };
    visual?: { schemaVersion: number };
    blocks: Array<{
      type: string;
      data: unknown;
      componentVersion?: number;
      layout?: unknown;
    }>;
  },
  context: z.RefinementCtx,
) {
  if (
    /^\/(?:admin|preview|relatorio-de-obra|assets|functions|cms|produtos|servicos|industrias|aplicacoes|solucoes|busca|blog|campanhas)(?:\/|$)/.test(
      value.route.path,
    )
  )
    context.addIssue({
      code: "custom",
      path: ["route", "path"],
      message: "Este prefixo é reservado por uma função estrutural do site.",
    });
  if (value.seo.indexable && value.governanceState !== "homologated")
    context.addIssue({
      code: "custom",
      path: ["seo", "indexable"],
      message: "Somente página homologada pode ser indexável.",
    });
  if (value.governanceState === "homologated" && !value.approval.approvedAt)
    context.addIssue({
      code: "custom",
      path: ["approval", "approvedAt"],
      message: "Página homologada exige data de aprovação.",
    });
  if (value.seo.canonicalPath !== value.route.path)
    context.addIssue({
      code: "custom",
      path: ["seo", "canonicalPath"],
      message: "O canonical deve ser idêntico à rota pública.",
    });
  if (value.retirement.mode === "redirect" && !value.retirement.destinationPath)
    context.addIssue({
      code: "custom",
      path: ["retirement", "destinationPath"],
      message: "Retirada com redirect exige destino.",
    });
  if (
    value.retirement.mode === "redirect" &&
    value.retirement.destinationPath?.replace(/\/$/, "") === value.route.path.replace(/\/$/, "")
  )
    context.addIssue({
      code: "custom",
      path: ["retirement", "destinationPath"],
      message: "O redirecionamento não pode apontar para a própria página.",
    });
  value.blocks.forEach((block, index) => {
    const data = block.data as { assetId?: string; alt?: string };
    if (block.type === "hero" && data.assetId && !data.alt?.trim())
      context.addIssue({
        code: "custom",
        path: ["blocks", index, "data", "alt"],
        message: "Hero com imagem exige texto alternativo.",
      });
    const visualOnly = [
      "split_content",
      "logo_cloud",
      "tabs",
      "comparison_table",
      "alert",
      "timeline",
      "link_list",
    ];
    if (visualOnly.includes(block.type) && !value.visual)
      context.addIssue({
        code: "custom",
        path: ["blocks", index, "type"],
        message: "Este componente exige um documento do Estúdio Visual.",
      });
    if (value.visual && (block.componentVersion !== 1 || !block.layout))
      context.addIssue({
        code: "custom",
        path: ["blocks", index, "layout"],
        message: "Documento visual exige versão e layout explícitos nos três breakpoints.",
      });
    if (block.type === "comparison_table") {
      const table = block.data as { columns?: unknown[]; rows?: Array<{ values?: unknown[] }> };
      if (table.rows?.some((row) => row.values?.length !== table.columns?.length))
        context.addIssue({
          code: "custom",
          path: ["blocks", index, "data", "rows"],
          message: "Cada linha da comparação deve ter um valor por coluna.",
        });
    }
  });
}

export const CmsManagedPageContentSchema = z
  .object({
    ...ManagedPageBase,
    consumerId: z.literal("cms.managed-page.v1"),
    contentType: z.literal("page"),
  })
  .strict()
  .superRefine(validateManagedPage);

export const CmsHomepageContentSchema = z
  .object({
    ...ManagedPageBase,
    consumerId: z.literal("cms.homepage-builder.v1"),
    contentType: z.literal("homepage"),
    pageKind: z.literal("home"),
    templateKey: z.literal("home"),
    route: z
      .object({
        path: z.literal("/"),
        navigationLabel: z.string().trim().max(80).optional(),
        breadcrumbLabel: z.string().trim().max(80).optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine(validateManagedPage);

const SiteDocumentBase = {
  schemaVersion: z.literal(1),
  title: RequiredText.max(180),
  blocks: z.array(z.never()).max(0),
  seo: CmsSeoSchema,
  provenance: z.array(CmsProvenanceSchema).min(1).max(30),
};

export const CmsNavigationContentSchema = z
  .object({
    ...SiteDocumentBase,
    consumerId: z.literal("cms.site-navigation.v1"),
    contentType: z.literal("navigation"),
    items: z
      .array(
        z
          .object({
            id: z.uuid(),
            parentId: z.uuid().nullable(),
            location: z.enum(["header", "footer"]),
            label: RequiredText.max(80),
            href: PageHrefSchema,
            order: z.number().int().min(0).max(999),
            newTab: z.boolean().default(false),
            visible: z.boolean().default(true),
          })
          .strict(),
      )
      .max(200),
  })
  .strict()
  .superRefine((value, context) => {
    const itemById = new Map(value.items.map((item) => [item.id, item]));
    const seenIds = new Set<string>();
    for (const [index, item] of value.items.entries()) {
      if (seenIds.has(item.id))
        context.addIssue({
          code: "custom",
          path: ["items", index, "id"],
          message: "Identificador de menu duplicado.",
        });
      seenIds.add(item.id);
      if (item.parentId && !itemById.has(item.parentId))
        context.addIssue({
          code: "custom",
          path: ["items", index, "parentId"],
          message: "Item pai inexistente.",
        });
      if (!item.parentId) continue;
      const parent = itemById.get(item.parentId);
      if (parent && parent.location !== item.location)
        context.addIssue({
          code: "custom",
          path: ["items", index, "parentId"],
          message: "Item pai deve pertencer ao mesmo local do menu.",
        });
      const ancestors = new Set([item.id]);
      let cursor: string | null = item.parentId;
      let depth = 0;
      while (cursor) {
        if (ancestors.has(cursor)) {
          context.addIssue({
            code: "custom",
            path: ["items", index, "parentId"],
            message: "O menu não pode conter ciclos.",
          });
          break;
        }
        ancestors.add(cursor);
        depth += 1;
        cursor = itemById.get(cursor)?.parentId ?? null;
      }
      if (depth > 2)
        context.addIssue({
          code: "custom",
          path: ["items", index, "parentId"],
          message: "O menu aceita no máximo três níveis.",
        });
    }
  });

export const CmsSiteSettingsContentSchema = z
  .object({
    ...SiteDocumentBase,
    consumerId: z.literal("cms.site-settings.v1"),
    contentType: z.literal("site_settings"),
    company: z
      .object({
        name: RequiredText.max(160),
        legalName: z.string().trim().max(200).optional(),
        phone: z.string().trim().max(40),
        whatsapp: z.string().trim().max(40),
        email: z.email().max(254),
        address: z.string().trim().max(500),
      })
      .strict(),
    socialLinks: z
      .array(z.object({ id: z.uuid(), network: RequiredText.max(50), url: PageHttpUrlSchema }).strict())
      .max(20),
    defaultCta: PageLinkSchema,
  })
  .strict();

export const CmsPlacementContentSchema = z
  .object({
    ...SiteDocumentBase,
    consumerId: z.literal("cms.site-placements.v1"),
    contentType: z.literal("placement"),
    placements: z
      .array(
        z
          .object({
            id: z.uuid(),
            slot: z.enum(["home_hero", "home_featured", "catalog_featured", "global_announcement"]),
            targetType: z.enum(["product", "service", "industry", "application", "solution", "page"]),
            targetId: z.uuid(),
            label: z.string().trim().max(120).optional(),
            startsAt: z.iso.datetime(),
            endsAt: z.iso.datetime(),
            priority: z.number().int().min(0).max(999),
            enabled: z.boolean(),
          })
          .strict()
          .refine(
            (item) => new Date(item.endsAt) > new Date(item.startsAt),
            "Término deve ser posterior ao início.",
          ),
      )
      .max(100),
  })
  .strict();

export const CmsFormFieldSchema = z
  .object({
    id: z.uuid(),
    key: CmsSlugSchema,
    label: RequiredText.max(120),
    type: z.enum(["text", "email", "tel", "textarea", "select", "checkbox", "hidden"]),
    required: z.boolean(),
    maxLength: z.number().int().min(1).max(5000).optional(),
    options: z.array(RequiredText.max(120)).max(50).default([]),
    personalData: z.boolean().default(false),
    order: z.number().int().min(0).max(999),
  })
  .strict();

export const CmsFormVersionSchema = z
  .object({
    schemaVersion: z.literal(1),
    formId: z.uuid(),
    versionId: z.uuid(),
    version: z.number().int().min(1),
    key: CmsSlugSchema,
    title: RequiredText.max(180),
    purpose: RequiredText.max(500),
    fields: z.array(CmsFormFieldSchema).min(1).max(50),
    consent: z
      .object({
        required: z.literal(true),
        text: RequiredText.max(2000),
        version: RequiredText.max(80),
        privacyPath: PageInternalPathSchema,
      })
      .strict(),
    slaMinutes: z.number().int().min(5).max(525600),
    retentionDays: z.number().int().min(1).max(3650),
    successMessage: RequiredText.max(500),
    submitLabel: RequiredText.max(120),
    status: z.enum(["draft", "published", "retired"]),
  })
  .strict()
  .superRefine((value, context) => {
    const keys = new Set<string>();
    value.fields.forEach((field, index) => {
      if (keys.has(field.key))
        context.addIssue({
          code: "custom",
          path: ["fields", index, "key"],
          message: "Chave de campo duplicada.",
        });
      keys.add(field.key);
      if (field.type === "select" && field.options.length === 0)
        context.addIssue({
          code: "custom",
          path: ["fields", index, "options"],
          message: "Seleção exige opções.",
        });
    });
  });

const CampaignPathSchema = z
  .string()
  .regex(/^\/campanhas\/[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(220);

export const CmsCampaignContentSchema = z
  .object({
    schemaVersion: z.literal(1),
    consumerId: z.literal("cms.campaign-landing.v1"),
    contentType: z.literal("campaign"),
    title: RequiredText.max(180),
    summary: RequiredText.max(500),
    campaignKind: z.enum(["lead_generation", "product_launch", "event", "download", "institutional"]),
    templateKey: z.enum(["landing_conversion", "landing_product", "landing_event", "landing_download"]),
    route: z.object({ path: CampaignPathSchema }).strict(),
    window: z
      .object({
        startsAt: z.iso.datetime(),
        endsAt: z.iso.datetime(),
        timezone: z.literal("America/Sao_Paulo"),
      })
      .strict(),
    blocks: z.array(CmsPageBlockSchema).min(1).max(80),
    placements: z
      .array(
        z
          .object({
            id: z.uuid(),
            slot: z.enum([
              "home_hero",
              "home_featured",
              "global_announcement",
              "article_inline",
              "product_banner",
              "service_banner",
              "solution_banner",
              "page_banner",
            ]),
            contextType: z.enum(["global", "product", "service", "solution", "page", "post"]),
            contextId: z.uuid().optional(),
            priority: z.number().int().min(0).max(999),
          })
          .strict()
          .superRefine((value, context) => {
            if (value.contextType !== "global" && !value.contextId)
              context.addIssue({
                code: "custom",
                path: ["contextId"],
                message: "Posicionamento contextual exige destino.",
              });
          }),
      )
      .max(100),
    form: z.object({ formId: z.uuid(), versionId: z.uuid(), key: CmsSlugSchema }).strict().optional(),
    tracking: z
      .object({
        enabled: z.boolean(),
        requiresConsent: z.literal(true),
        provider: z.enum(["internal", "ga4", "meta"]),
        eventName: CmsSlugSchema,
      })
      .strict(),
    expiry: z
      .object({
        mode: z.enum(["redirect", "not_found", "gone", "fallback"]),
        destinationPath: PageInternalPathSchema.optional(),
        fallbackCampaignId: z.uuid().optional(),
      })
      .strict(),
    relations: z
      .object({
        productIds: z.array(z.uuid()).max(50),
        serviceIds: z.array(z.uuid()).max(50),
        solutionIds: z.array(z.uuid()).max(50),
        pageIds: z.array(z.uuid()).max(50),
      })
      .strict(),
    seo: CmsSeoSchema,
    provenance: z.array(CmsProvenanceSchema).min(1).max(30),
    governanceState: z.enum(["synthetic_test", "awaiting_owner", "homologated"]),
    approval: z
      .object({
        businessOwner: RequiredText.max(120),
        marketingReviewer: RequiredText.max(120),
        privacyReviewer: RequiredText.max(120),
        approvedAt: z.iso.datetime().optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Date(value.window.endsAt) <= new Date(value.window.startsAt))
      context.addIssue({
        code: "custom",
        path: ["window", "endsAt"],
        message: "Término deve ser posterior ao início.",
      });
    if (value.seo.canonicalPath !== value.route.path)
      context.addIssue({
        code: "custom",
        path: ["seo", "canonicalPath"],
        message: "Canonical deve coincidir com a landing page.",
      });
    if (value.governanceState === "homologated" && !value.approval.approvedAt)
      context.addIssue({
        code: "custom",
        path: ["approval", "approvedAt"],
        message: "Campanha homologada exige aprovação.",
      });
    if (value.seo.indexable && value.governanceState !== "homologated")
      context.addIssue({
        code: "custom",
        path: ["seo", "indexable"],
        message: "Somente campanha homologada pode ser indexável.",
      });
    if (value.expiry.mode === "redirect" && !value.expiry.destinationPath)
      context.addIssue({
        code: "custom",
        path: ["expiry", "destinationPath"],
        message: "Expiração por redirect exige destino.",
      });
    if (value.expiry.mode === "fallback" && !value.expiry.fallbackCampaignId)
      context.addIssue({
        code: "custom",
        path: ["expiry", "fallbackCampaignId"],
        message: "Fallback exige campanha substituta.",
      });
  });

const {
  provenance: _campaignProvenance,
  governanceState: _campaignGovernanceState,
  approval: _campaignApproval,
  placements: _campaignPlacements,
  expiry: _campaignExpiry,
  ...CmsPublicCampaignContentShape
} = CmsCampaignContentSchema.shape;

export const CmsPublicCampaignContentSchema = z
  .object(CmsPublicCampaignContentShape)
  .strict()
  .superRefine((value, context) => {
    if (new Date(value.window.endsAt) <= new Date(value.window.startsAt))
      context.addIssue({
        code: "custom",
        path: ["window", "endsAt"],
        message: "Término deve ser posterior ao início.",
      });
    if (value.seo.canonicalPath !== value.route.path)
      context.addIssue({
        code: "custom",
        path: ["seo", "canonicalPath"],
        message: "Canonical deve coincidir com a landing page.",
      });
  });

export const CmsLeadCaptureSchema = z
  .object({
    formId: z.uuid(),
    formVersionId: z.uuid(),
    idempotencyKey: z.uuid(),
    fields: z.record(
      CmsSlugSchema,
      z.union([z.string().max(5000), z.boolean(), z.array(z.string().max(500)).max(50)]),
    ),
    origin: z
      .object({
        path: PageInternalPathSchema,
        source: RequiredText.max(120),
        campaignId: z.uuid().optional(),
        productId: z.uuid().optional(),
        utm: z
          .object({
            source: z.string().max(120).optional(),
            medium: z.string().max(120).optional(),
            campaign: z.string().max(160).optional(),
            term: z.string().max(160).optional(),
            content: z.string().max(160).optional(),
          })
          .strict(),
      })
      .strict(),
    consent: z
      .object({ accepted: z.literal(true), text: RequiredText.max(2000), version: RequiredText.max(80) })
      .strict(),
    honeypot: z.string().max(0).default(""),
    captchaToken: z.string().max(4096).optional(),
  })
  .strict();

export const CmsLeadStatusSchema = z.enum([
  "new",
  "assigned",
  "in_service",
  "responded",
  "converted",
  "disqualified",
  "archived",
  "anonymized",
]);

export const CmsPageContentSchema = z.union([CmsManagedPageContentSchema, CmsHomepageContentSchema]);

export const CmsSiteDocumentContentSchema = z.discriminatedUnion("contentType", [
  CmsNavigationContentSchema,
  CmsSiteSettingsContentSchema,
  CmsPlacementContentSchema,
]);

export const CmsLegacyPageContentSchema = z
  .object({
    ...BaseContent,
    contentType: z.enum(["page", "homepage"]),
  })
  .strict();

export const CmsContentPayloadSchema = z.discriminatedUnion("contentType", [
  CmsProductContentSchema,
  CmsServiceContentSchema,
  CmsIndustryContentSchema,
  CmsApplicationContentSchema,
  CmsSolutionContentSchema,
  CmsPostContentSchema,
  CmsManagedPageContentSchema,
  CmsHomepageContentSchema,
  CmsNavigationContentSchema,
  CmsSiteSettingsContentSchema,
  CmsPlacementContentSchema,
  CmsCampaignContentSchema,
]);

export type CmsContentPayload = z.infer<typeof CmsContentPayloadSchema>;

export function omitLegacyExternalProductDocuments(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const record = payload as Record<string, unknown>;
  if (record.contentType !== "product" || !Array.isArray(record.documents)) return payload;
  const documents = record.documents.filter(
    (document) =>
      !document ||
      typeof document !== "object" ||
      Array.isArray(document) ||
      !Object.prototype.hasOwnProperty.call(document, "officialUrl"),
  );
  return documents.length === record.documents.length ? payload : { ...record, documents };
}
export type CmsProductContent = z.infer<typeof CmsProductContentSchema>;
export type CmsProductFieldVisibility = z.infer<typeof CmsProductFieldVisibilitySchema>;
export type CmsServiceContent = z.infer<typeof CmsServiceContentSchema>;
export type CmsIndustryContent = z.infer<typeof CmsIndustryContentSchema>;
export type CmsApplicationContent = z.infer<typeof CmsApplicationContentSchema>;
export type CmsSolutionContent = z.infer<typeof CmsSolutionContentSchema>;
export type CmsPostContent = z.infer<typeof CmsPostContentSchema>;
export type CmsPublicPostContent = z.infer<typeof CmsPublicPostContentSchema>;
export type CmsPageContent = z.infer<typeof CmsPageContentSchema>;
export type CmsPageBlock = z.infer<typeof CmsPageBlockSchema>;
export type CmsNavigationContent = z.infer<typeof CmsNavigationContentSchema>;
export type CmsSiteSettingsContent = z.infer<typeof CmsSiteSettingsContentSchema>;
export type CmsPlacementContent = z.infer<typeof CmsPlacementContentSchema>;
export type CmsCampaignContent = z.infer<typeof CmsCampaignContentSchema>;
export type CmsPublicCampaignContent = z.infer<typeof CmsPublicCampaignContentSchema>;
export type CmsFormVersion = z.infer<typeof CmsFormVersionSchema>;
export type CmsLeadCapture = z.infer<typeof CmsLeadCaptureSchema>;
