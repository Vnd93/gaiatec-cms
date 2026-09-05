import { z } from "zod";
import { Ev2CommandEnvelopeSchema, Ev2FeatureFlagEvaluationSchema } from "./ev2-foundation";

const UuidSchema = z.string().uuid();
const DatabaseTimestampSchema = z.iso.datetime({ offset: true });
const SlugSchema = z
  .string()
  .trim()
  .min(2)
  .max(180)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const ExpectedVersionEnvelopeSchema = Ev2CommandEnvelopeSchema.refine(
  (envelope) => envelope.expectedVersion !== undefined,
  { path: ["expectedVersion"], message: "expectedVersion is required" },
);

export const Ev2PimProductStatusSchema = z.enum(["draft", "active", "inactive", "archived"]);
export const Ev2PimModelStatusSchema = z.enum(["active", "discontinued"]);
export const Ev2PimVariantStatusSchema = z.enum(["active", "discontinued"]);
export const Ev2PimSkuStatusSchema = z.enum(["active", "retired"]);
export const Ev2PimSourceTypeSchema = z.enum(["manual", "import", "legacy"]);

export const Ev2PimMasterSelectionSchema = z
  .object({
    manufacturerId: UuidSchema,
    brandId: UuidSchema.optional(),
    lineId: UuidSchema.optional(),
    categoryId: UuidSchema,
    magnitudeIds: z.array(UuidSchema).max(30).default([]),
    technologyIds: z.array(UuidSchema).max(30).default([]),
    installationIds: z.array(UuidSchema).max(30).default([]),
    monitoredElementIds: z.array(UuidSchema).min(1).max(30),
  })
  .strict()
  .superRefine((selection, context) => {
    for (const key of ["magnitudeIds", "technologyIds", "installationIds", "monitoredElementIds"] as const) {
      if (new Set(selection[key]).size !== selection[key].length) {
        context.addIssue({ code: "custom", path: [key], message: "master selections must be unique" });
      }
    }
  });

export const Ev2PimVariantAxisSchema = z
  .object({
    axisKey: SlugSchema.max(60),
    axisLabel: z.string().trim().min(1).max(120),
    optionKey: SlugSchema.max(80),
    optionLabel: z.string().trim().min(1).max(120),
  })
  .strict();

export const Ev2PimVariantInputSchema = z
  .object({
    id: UuidSchema,
    name: z.string().trim().min(1).max(160),
    code: z.string().trim().max(120).optional(),
    status: Ev2PimVariantStatusSchema.default("active"),
    position: z.number().int().min(0).max(999),
    axes: z.array(Ev2PimVariantAxisSchema).min(1).max(12),
  })
  .strict()
  .superRefine((variant, context) => {
    const axes = variant.axes.map((axis) => axis.axisKey);
    if (new Set(axes).size !== axes.length) {
      context.addIssue({ code: "custom", path: ["axes"], message: "variant axis keys must be unique" });
    }
  });

export const Ev2PimModelInputSchema = z
  .object({
    id: UuidSchema,
    name: z.string().trim().min(1).max(160),
    mpn: z.string().trim().min(1).max(160).optional(),
    status: Ev2PimModelStatusSchema.default("active"),
    primary: z.boolean().default(false),
    position: z.number().int().min(0).max(999),
    variants: z.array(Ev2PimVariantInputSchema).max(200).default([]),
  })
  .strict();

export const Ev2PimAttributeDataTypeSchema = z.enum(["text", "decimal", "boolean", "enum", "range"]);
export const Ev2PimAttributeScopeSchema = z.enum(["product", "model", "variant"]);
const AttributeValueSchema = z.union([
  z.string().trim().max(500),
  z.number().finite(),
  z.boolean(),
  z.array(z.string().trim().min(1).max(120)).max(30),
  z.object({ min: z.number().finite(), max: z.number().finite() }).strict(),
]);

export const Ev2PimAttributeValueInputSchema = z
  .object({
    id: UuidSchema,
    definitionId: UuidSchema,
    scope: Ev2PimAttributeScopeSchema,
    ownerId: UuidSchema,
    value: AttributeValueSchema,
    unitCode: z.string().trim().max(40).optional(),
    sourceType: Ev2PimSourceTypeSchema.default("manual"),
    sourceRef: z.string().trim().max(300).optional(),
    confidence: z.number().min(0).max(1).default(1),
    homologated: z.boolean().default(false),
  })
  .strict()
  .superRefine((entry, context) => {
    if (typeof entry.value === "object" && !Array.isArray(entry.value) && entry.value.min > entry.value.max) {
      context.addIssue({ code: "custom", path: ["value"], message: "range min must not exceed max" });
    }
  });

export const Ev2PimExternalIdentifierInputSchema = z
  .object({
    id: UuidSchema,
    ownerType: z.enum(["product", "model", "variant", "sku"]),
    ownerId: UuidSchema,
    kind: z.enum(["erp", "gtin", "ncm", "other"]),
    value: z.string().trim().min(1).max(180),
    issuer: z.string().trim().max(160).optional(),
    sourceType: Ev2PimSourceTypeSchema.default("manual"),
    sourceRef: z.string().trim().max(300).optional(),
  })
  .strict();

export const Ev2PimProvenanceInputSchema = z
  .object({
    id: UuidSchema,
    sourceKind: z.enum(["official_manufacturer", "owner_authored", "import", "legacy", "other"]),
    sourceRef: z.string().trim().min(1).max(500),
    sourceSha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
    confidence: z.number().min(0).max(1).default(1),
    rightsConfirmed: z.boolean(),
    verifiedAt: z.iso.datetime().optional(),
  })
  .strict();

export const Ev2PimProductInputSchema = z
  .object({
    id: UuidSchema,
    contentItemId: UuidSchema.optional(),
    name: z.string().trim().min(1).max(180),
    slug: SlugSchema,
    summary: z.string().trim().max(500).default(""),
    valueProposition: z.string().trim().max(500).default(""),
    status: Ev2PimProductStatusSchema.default("draft"),
    sourceType: Ev2PimSourceTypeSchema.default("manual"),
    sourceRef: z.string().trim().max(300).optional(),
    masterData: Ev2PimMasterSelectionSchema,
    models: z.array(Ev2PimModelInputSchema).min(1).max(100),
    attributes: z.array(Ev2PimAttributeValueInputSchema).max(500).default([]),
    externalIdentifiers: z.array(Ev2PimExternalIdentifierInputSchema).max(100).default([]),
    provenance: z.array(Ev2PimProvenanceInputSchema).min(1).max(50),
  })
  .strict()
  .superRefine((product, context) => {
    const primaryCount = product.models.filter((model) => model.primary && model.status === "active").length;
    if (primaryCount !== 1) {
      context.addIssue({
        code: "custom",
        path: ["models"],
        message: "exactly one active model must be primary",
      });
    }
    const modelIds = product.models.map((model) => model.id);
    const variantIds = product.models.flatMap((model) => model.variants.map((variant) => variant.id));
    if (new Set(modelIds).size !== modelIds.length || new Set(variantIds).size !== variantIds.length) {
      context.addIssue({ code: "custom", path: ["models"], message: "PIM identities must be unique" });
    }
    for (const [key, entries] of [
      ["attributes", product.attributes],
      ["externalIdentifiers", product.externalIdentifiers],
      ["provenance", product.provenance],
    ] as const) {
      const ids = entries.map((entry) => entry.id);
      if (new Set(ids).size !== ids.length) {
        context.addIssue({ code: "custom", path: [key], message: "PIM identities must be unique" });
      }
    }
    const ownerIds = new Set<string>([
      product.id,
      ...product.models.map((model) => model.id),
      ...product.models.flatMap((model) => model.variants.map((variant) => variant.id)),
    ]);
    for (const [index, value] of product.attributes.entries()) {
      if (!ownerIds.has(value.ownerId)) {
        context.addIssue({
          code: "custom",
          path: ["attributes", index, "ownerId"],
          message: "unknown owner",
        });
      }
    }
  });

export const Ev2PimCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("capability"), envelope: Ev2CommandEnvelopeSchema }).strict(),
  z
    .object({
      action: z.literal("list_products"),
      envelope: Ev2CommandEnvelopeSchema,
      query: z.string().trim().max(180).default(""),
      includeArchived: z.boolean().default(false),
    })
    .strict(),
  z
    .object({ action: z.literal("get_product"), envelope: Ev2CommandEnvelopeSchema, productId: UuidSchema })
    .strict(),
  z
    .object({
      action: z.literal("save_product"),
      envelope: Ev2CommandEnvelopeSchema,
      mode: z.enum(["create", "update"]),
      product: Ev2PimProductInputSchema,
      reason: z.string().trim().min(3).max(500),
    })
    .strict()
    .superRefine((command, context) => {
      if (command.mode === "update" && command.envelope.expectedVersion === undefined) {
        context.addIssue({
          code: "custom",
          path: ["envelope", "expectedVersion"],
          message: "expectedVersion is required",
        });
      }
      if (command.mode === "create" && command.envelope.expectedVersion !== undefined) {
        context.addIssue({
          code: "custom",
          path: ["envelope", "expectedVersion"],
          message: "expectedVersion is not accepted when creating",
        });
      }
    }),
  z
    .object({
      action: z.literal("archive_product"),
      envelope: ExpectedVersionEnvelopeSchema,
      productId: UuidSchema,
      reason: z.string().trim().min(3).max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal("generate_sku"),
      envelope: Ev2CommandEnvelopeSchema,
      productId: UuidSchema,
      modelId: UuidSchema,
      variantId: UuidSchema.optional(),
      reason: z.string().trim().min(3).max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal("preview_v1_adapter"),
      envelope: Ev2CommandEnvelopeSchema,
      productId: UuidSchema,
      basePayload: z.record(z.string(), z.unknown()),
    })
    .strict(),
]);

export const Ev2PimMasterLabelSchema = z
  .object({ id: UuidSchema, entityType: z.string(), name: z.string(), status: z.string() })
  .strict();

export const Ev2PimSkuSchema = z
  .object({
    id: UuidSchema,
    productId: UuidSchema,
    modelId: UuidSchema,
    variantId: UuidSchema.nullable(),
    sku: z.string(),
    status: Ev2PimSkuStatusSchema,
    createdAt: DatabaseTimestampSchema,
    retiredAt: DatabaseTimestampSchema.nullable(),
  })
  .strict();

export const Ev2PimProductSummarySchema = z
  .object({
    id: UuidSchema,
    contentItemId: UuidSchema.nullable(),
    name: z.string(),
    slug: z.string(),
    status: Ev2PimProductStatusSchema,
    lockVersion: z.number().int().positive(),
    modelCount: z.number().int().nonnegative(),
    variantCount: z.number().int().nonnegative(),
    skuCount: z.number().int().nonnegative(),
    updatedAt: DatabaseTimestampSchema,
  })
  .strict();

const ResponseEnvelope = {
  schemaVersion: z.literal(1),
  commandId: UuidSchema,
  correlationId: UuidSchema,
};

export const Ev2PimCapabilityResultSchema = Ev2FeatureFlagEvaluationSchema.extend({
  commandId: UuidSchema,
  correlationId: UuidSchema,
}).strict();
export const Ev2PimProductListResultSchema = z
  .object({ ...ResponseEnvelope, products: z.array(Ev2PimProductSummarySchema) })
  .strict();
export const Ev2PimMutationResultSchema = z
  .object({
    ...ResponseEnvelope,
    productId: UuidSchema,
    status: Ev2PimProductStatusSchema,
    lockVersion: z.number().int().positive(),
    sku: Ev2PimSkuSchema.optional(),
    replayed: z.boolean(),
  })
  .strict();

export const Ev2PimUnitSchema = z
  .object({
    code: z.string().min(1).max(40),
    label: z.string().min(1).max(120),
    symbol: z.string().min(1).max(40),
    dimensionKey: z.string().min(2).max(64),
    canonicalCode: z.string().min(1).max(40),
    factorToCanonical: z.number().finite(),
    offsetToCanonical: z.number().finite(),
  })
  .strict();

export const Ev2PimAttributeDefinitionSchema = z
  .object({
    id: UuidSchema,
    attributeKey: z.string().min(2).max(80),
    label: z.string().min(1).max(120),
    description: z.string().max(1000),
    dataType: Ev2PimAttributeDataTypeSchema,
    canonicalUnitCode: z.string().max(40).nullable(),
    enumOptions: z.array(z.string().min(1).max(120)).max(100),
    filterable: z.boolean(),
    comparable: z.boolean(),
    searchable: z.boolean(),
    required: z.boolean(),
    inherited: z.boolean(),
    position: z.number().int().min(0).max(999),
  })
  .strict();

export const Ev2PimAttributeSetSchema = z
  .object({
    id: UuidSchema,
    categoryId: UuidSchema,
    name: z.string().min(1).max(160),
    versionId: UuidSchema,
    version: z.number().int().positive(),
  })
  .strict();

export const Ev2PimAttributeCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("capability"), envelope: Ev2CommandEnvelopeSchema }).strict(),
  z
    .object({
      action: z.literal("list_catalog"),
      envelope: Ev2CommandEnvelopeSchema,
      categoryId: UuidSchema,
    })
    .strict(),
]);

export const Ev2PimAttributeCatalogResultSchema = z
  .object({
    ...ResponseEnvelope,
    attributeSet: Ev2PimAttributeSetSchema.nullable(),
    definitions: z.array(Ev2PimAttributeDefinitionSchema),
    units: z.array(Ev2PimUnitSchema),
  })
  .strict();

export type Ev2PimProductInput = z.infer<typeof Ev2PimProductInputSchema>;
export type Ev2PimCommand = z.infer<typeof Ev2PimCommandSchema>;
export type Ev2PimProductSummary = z.infer<typeof Ev2PimProductSummarySchema>;
export type Ev2PimSku = z.infer<typeof Ev2PimSkuSchema>;
export type Ev2PimUnit = z.infer<typeof Ev2PimUnitSchema>;
export type Ev2PimAttributeDefinition = z.infer<typeof Ev2PimAttributeDefinitionSchema>;
export type Ev2PimAttributeCatalogResult = z.infer<typeof Ev2PimAttributeCatalogResultSchema>;
