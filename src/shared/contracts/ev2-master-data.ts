import { z } from "zod";
import { Ev2CommandEnvelopeSchema, Ev2FeatureFlagEvaluationSchema } from "./ev2-foundation";

const DatabaseTimestampSchema = z.iso.datetime({ offset: true });
const UuidSchema = z.string().uuid();

export const Ev2MasterEntityTypeSchema = z.enum([
  "manufacturer",
  "brand",
  "line",
  "category",
  "magnitude",
  "technology",
  "installation",
  "monitored_element",
]);
export const Ev2MasterSourceTypeSchema = z.enum(["manual", "import", "legacy"]);
export const Ev2MasterEntityStatusSchema = z.enum(["active", "inactive", "merged"]);
export const Ev2MasterRelationTypeSchema = z.enum([
  "manufacturer_brand",
  "brand_line",
  "category_magnitude",
  "category_technology",
  "category_installation",
  "category_monitored_element",
]);

export const ev2MasterEntityLabels: Record<z.infer<typeof Ev2MasterEntityTypeSchema>, string> = {
  manufacturer: "Fabricantes",
  brand: "Marcas",
  line: "Linhas",
  category: "Categorias",
  magnitude: "Grandezas",
  technology: "Tecnologias",
  installation: "Instalações",
  monitored_element: "Elementos monitorados",
};

const EntityFields = {
  name: z.string().trim().min(1).max(180),
  description: z.string().trim().max(1000).default(""),
  externalDomain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/)
    .optional(),
  sourceType: Ev2MasterSourceTypeSchema.default("manual"),
  sourceRef: z.string().trim().max(300).optional(),
};

const ExpectedVersionEnvelopeSchema = Ev2CommandEnvelopeSchema.refine(
  (envelope) => envelope.expectedVersion !== undefined,
  { path: ["expectedVersion"], message: "expectedVersion is required" },
);

export const Ev2MasterDataCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("capability"), envelope: Ev2CommandEnvelopeSchema }).strict(),
  z
    .object({
      action: z.literal("list_entities"),
      envelope: Ev2CommandEnvelopeSchema,
      entityType: Ev2MasterEntityTypeSchema.optional(),
      query: z.string().trim().max(180).default(""),
      includeInactive: z.boolean().default(false),
    })
    .strict(),
  z.object({ action: z.literal("list_rules"), envelope: Ev2CommandEnvelopeSchema }).strict(),
  z
    .object({
      action: z.literal("get_dependencies"),
      envelope: Ev2CommandEnvelopeSchema,
      relationType: Ev2MasterRelationTypeSchema,
      sourceEntityId: UuidSchema,
      includeInactive: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      action: z.literal("create_entity"),
      envelope: Ev2CommandEnvelopeSchema,
      entityType: Ev2MasterEntityTypeSchema,
      ...EntityFields,
    })
    .strict(),
  z
    .object({
      action: z.literal("update_entity"),
      envelope: ExpectedVersionEnvelopeSchema,
      entityId: UuidSchema,
      ...EntityFields,
    })
    .strict(),
  z
    .object({
      action: z.literal("set_entity_status"),
      envelope: ExpectedVersionEnvelopeSchema,
      entityId: UuidSchema,
      status: z.enum(["active", "inactive"]),
      reason: z.string().trim().min(3).max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal("merge_entities"),
      envelope: ExpectedVersionEnvelopeSchema,
      sourceEntityId: UuidSchema,
      targetEntityId: UuidSchema,
      reason: z.string().trim().min(3).max(500),
    })
    .strict()
    .refine((command) => command.sourceEntityId !== command.targetEntityId, {
      path: ["targetEntityId"],
      message: "merge target must differ from source",
    }),
  z
    .object({
      action: z.literal("restore_merge"),
      envelope: ExpectedVersionEnvelopeSchema,
      sourceEntityId: UuidSchema,
      reason: z.string().trim().min(3).max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal("upsert_alias"),
      envelope: ExpectedVersionEnvelopeSchema,
      entityId: UuidSchema,
      aliasId: UuidSchema.optional(),
      alias: z.string().trim().min(1).max(180),
      sourceType: Ev2MasterSourceTypeSchema.default("manual"),
    })
    .strict(),
  z
    .object({
      action: z.literal("upsert_compatibility"),
      envelope: Ev2CommandEnvelopeSchema,
      compatibilityId: UuidSchema.optional(),
      relationType: Ev2MasterRelationTypeSchema,
      sourceEntityId: UuidSchema,
      targetEntityId: UuidSchema,
      sourceType: Ev2MasterSourceTypeSchema.default("manual"),
      sourceRef: z.string().trim().max(300).optional(),
    })
    .strict()
    .superRefine((command, context) => {
      if (command.compatibilityId && command.envelope.expectedVersion === undefined) {
        context.addIssue({
          code: "custom",
          path: ["envelope", "expectedVersion"],
          message: "expectedVersion is required",
        });
      }
    }),
  z
    .object({
      action: z.literal("set_compatibility_status"),
      envelope: ExpectedVersionEnvelopeSchema,
      compatibilityId: UuidSchema,
      status: z.enum(["active", "inactive"]),
      reason: z.string().trim().min(3).max(500),
    })
    .strict(),
]);

export const Ev2MasterAliasSchema = z
  .object({
    id: UuidSchema,
    alias: z.string(),
    normalizedAlias: z.string(),
    sourceType: z.enum(["manual", "import", "legacy", "merge"]),
    updatedAt: DatabaseTimestampSchema,
  })
  .strict();

export const Ev2MasterEntitySchema = z
  .object({
    id: UuidSchema,
    entityType: Ev2MasterEntityTypeSchema,
    canonicalName: z.string(),
    normalizedName: z.string(),
    description: z.string(),
    externalDomain: z.string().nullable(),
    sourceType: Ev2MasterSourceTypeSchema,
    sourceRef: z.string().nullable(),
    status: Ev2MasterEntityStatusSchema,
    mergedIntoId: UuidSchema.nullable(),
    lockVersion: z.number().int().positive(),
    updatedAt: DatabaseTimestampSchema,
    aliases: z.array(Ev2MasterAliasSchema),
  })
  .strict();

export const Ev2MasterRelationRuleSchema = z
  .object({
    relationType: Ev2MasterRelationTypeSchema,
    sourceType: Ev2MasterEntityTypeSchema,
    targetType: Ev2MasterEntityTypeSchema,
    label: z.string(),
    active: z.boolean(),
  })
  .strict();

export const Ev2MasterCompatibilitySchema = z
  .object({
    id: UuidSchema,
    relationType: Ev2MasterRelationTypeSchema,
    sourceEntityId: UuidSchema,
    targetEntityId: UuidSchema,
    status: z.enum(["active", "inactive"]),
    effectiveFrom: DatabaseTimestampSchema,
    effectiveTo: DatabaseTimestampSchema.nullable(),
    version: z.number().int().positive(),
    lockVersion: z.number().int().positive(),
    sourceType: Ev2MasterSourceTypeSchema,
    sourceRef: z.string().nullable(),
    updatedAt: DatabaseTimestampSchema,
    target: Ev2MasterEntitySchema.pick({
      id: true,
      entityType: true,
      canonicalName: true,
      status: true,
      lockVersion: true,
    }).nullable(),
  })
  .strict();

const ResponseEnvelope = {
  schemaVersion: z.literal(1),
  commandId: UuidSchema,
  correlationId: UuidSchema,
};

export const Ev2MasterCapabilityResultSchema = Ev2FeatureFlagEvaluationSchema.extend({
  commandId: UuidSchema,
  correlationId: UuidSchema,
}).strict();
export const Ev2MasterEntityListResultSchema = z
  .object({ ...ResponseEnvelope, entities: z.array(Ev2MasterEntitySchema) })
  .strict();
export const Ev2MasterRuleListResultSchema = z
  .object({ ...ResponseEnvelope, rules: z.array(Ev2MasterRelationRuleSchema) })
  .strict();
export const Ev2MasterDependencyResultSchema = z
  .object({ ...ResponseEnvelope, compatibilities: z.array(Ev2MasterCompatibilitySchema) })
  .strict();
export const Ev2MasterMutationResultSchema = z
  .object({
    ...ResponseEnvelope,
    entityId: UuidSchema.optional(),
    targetEntityId: UuidSchema.optional(),
    compatibilityId: UuidSchema.optional(),
    aliasId: UuidSchema.optional(),
    status: z.enum(["active", "inactive", "merged"]),
    lockVersion: z.number().int().positive(),
    version: z.number().int().positive().optional(),
    replayed: z.boolean(),
  })
  .strict();

export type Ev2MasterEntityType = z.infer<typeof Ev2MasterEntityTypeSchema>;
export type Ev2MasterRelationType = z.infer<typeof Ev2MasterRelationTypeSchema>;
export type Ev2MasterEntity = z.infer<typeof Ev2MasterEntitySchema>;
export type Ev2MasterRelationRule = z.infer<typeof Ev2MasterRelationRuleSchema>;
export type Ev2MasterCompatibility = z.infer<typeof Ev2MasterCompatibilitySchema>;
export type Ev2MasterDataCommand = z.infer<typeof Ev2MasterDataCommandSchema>;
export type Ev2MasterMutationResult = z.infer<typeof Ev2MasterMutationResultSchema>;
