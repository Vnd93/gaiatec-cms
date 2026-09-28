import { z } from "zod";

/**
 * Contrato de governança do Núcleo de Catálogo.
 *
 * Este módulo é deliberadamente independente do banco: ele materializa a
 * seleção fail-closed do perfil e a forma da lista nominal sem habilitar
 * nenhuma capacidade. A ativação continua dependendo da flag server-side e
 * da aprovação nominal do ambiente correspondente.
 */

export const CatalogReleaseProfileSchema = z.enum([
  "frontend-only",
  "edge-only",
  "database-auth",
  "full-release",
]);

export const CatalogChangeClassSchema = z.enum(["frontend", "edge", "database-auth", "mixed", "unknown"]);

export const CatalogWaveSchema = z.enum([
  "foundation",
  "review-publication",
  "kits-relations",
  "editorial-cutover-prep",
]);

export const CatalogPublicationStateSchema = z.enum(["draft", "ready", "published"]);

export const CatalogEntityKindSchema = z.enum(["product", "model", "variant", "kit"]);

export const CatalogRelationKindSchema = z.enum([
  "contains",
  "required_component",
  "optional_component",
  "accessory",
  "compatible",
  "alternative",
  "substitutes",
  "successor",
  "local_exclusion",
]);

export const CatalogCompositionUnitSchema = z.enum(["un", "set", "g", "kg", "ml", "l", "mm", "cm", "m"]);

const CATALOG_COMPOSITION_RELATIONS = new Set(["contains", "required_component", "optional_component"]);

export const CatalogProductRelationSchema = z
  .object({
    schemaVersion: z.literal(1),
    relationKey: z.uuid(),
    revision: z.number().int().positive(),
    sourceProductId: z.uuid(),
    targetProductId: z.uuid(),
    sourceEntityKind: CatalogEntityKindSchema,
    targetEntityKind: CatalogEntityKindSchema,
    relationKind: CatalogRelationKindSchema,
    quantity: z.number().positive().nullable(),
    unitCode: CatalogCompositionUnitSchema.nullable(),
    status: z.enum(["active", "retracted"]),
  })
  .strict()
  .superRefine((relation, context) => {
    if (relation.sourceProductId === relation.targetProductId) {
      context.addIssue({
        code: "custom",
        path: ["targetProductId"],
        message: "self-relations are not allowed",
      });
    }
    const isComposition = CATALOG_COMPOSITION_RELATIONS.has(relation.relationKind);
    if (isComposition && (relation.quantity === null || relation.unitCode === null)) {
      context.addIssue({
        code: "custom",
        path: ["quantity"],
        message: "composition relations require positive quantity and controlled unit",
      });
    }
    if (!isComposition && (relation.quantity !== null || relation.unitCode !== null)) {
      context.addIssue({
        code: "custom",
        path: ["quantity"],
        message: "non-composition relations cannot carry quantity or unit",
      });
    }
    if (relation.sourceEntityKind === "kit" && relation.targetEntityKind === "kit") {
      context.addIssue({
        code: "custom",
        path: ["targetEntityKind"],
        message: "nested kits are not allowed",
      });
    }
  });

export const CatalogEffectiveRelationSchema = CatalogProductRelationSchema.and(
  z.object({
    subjectProductId: z.uuid(),
    relationOriginProductId: z.uuid(),
    relationOriginLevel: z.number().int().min(0).max(2),
    isLocalExclusion: z.boolean(),
  }),
);

const CATALOG_COMMERCIAL_KEYS = new Set(["sku", "price", "stock", "inventory", "availability", "Offer"]);

export const CatalogPublicSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    snapshotId: z.uuid(),
    productId: z.uuid(),
    revision: z.number().int().positive(),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string().trim().min(1).max(240),
    content: z.record(z.string(), z.unknown()),
    cta: z.literal("Solicitar orçamento"),
    publishedAt: z.iso.datetime(),
  })
  .strict()
  .superRefine((snapshot, context) => {
    for (const key of Object.keys(snapshot.content)) {
      if (CATALOG_COMMERCIAL_KEYS.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["content", key],
          message: "commercial catalog fields are not part of the publication contract",
        });
      }
    }
  });

export const CatalogPublicationOutboxEventSchema = z
  .object({
    id: z.uuid(),
    productId: z.uuid(),
    revision: z.number().int().positive(),
    snapshotId: z.uuid().nullable(),
    eventType: z.enum(["published", "invalidated"]),
    status: z.enum(["pending", "processing", "processed", "failed"]),
    attemptCount: z.number().int().nonnegative(),
  })
  .strict();

export const CatalogDecisionIdSchema = z.enum([
  "CAT-D001",
  "CAT-D002",
  "CAT-D003",
  "CAT-D004",
  "CAT-D005",
  "CAT-D006",
  "CAT-D007",
  "CAT-D008",
  "CAT-D009",
  "CAT-D010",
]);

export const CatalogNominalApprovalSchema = z.enum([
  "pending-approval",
  "user-confirmed-provisional",
  "approved",
  "rejected",
]);

/**
 * Itens 17 e 18 foram confirmados pelo usuário somente como provisórios.
 * Isso não é aprovação funcional, UAT, carga, publicação ou cutover.
 */
export const CATALOG_USER_CONFIRMED_PROVISIONAL_ORDERS = [17, 18] as const;

export function isUserConfirmedProvisionalCatalogOrder(order: number): boolean {
  return (CATALOG_USER_CONFIRMED_PROVISIONAL_ORDERS as readonly number[]).includes(order);
}

export const CatalogNominalProductSchema = z
  .object({
    schemaVersion: z.literal(1),
    candidateId: z.string().uuid(),
    name: z.string().trim().min(1).max(160),
    ownerRole: z.string().trim().min(1).max(120),
    approverRole: z.string().trim().min(1).max(120),
    approval: CatalogNominalApprovalSchema,
    source: z.literal("canonical-nominal-list"),
    importMode: z.literal("none"),
    wave: CatalogWaveSchema,
    decisionIds: z.array(CatalogDecisionIdSchema).min(1),
  })
  .strict();

export type CatalogReleaseProfile = z.infer<typeof CatalogReleaseProfileSchema>;
export type CatalogChangeClass = z.infer<typeof CatalogChangeClassSchema>;
export type CatalogWave = z.infer<typeof CatalogWaveSchema>;
export type CatalogNominalProduct = z.infer<typeof CatalogNominalProductSchema>;
export type CatalogPublicationState = z.infer<typeof CatalogPublicationStateSchema>;
export type CatalogPublicSnapshot = z.infer<typeof CatalogPublicSnapshotSchema>;
export type CatalogPublicationOutboxEvent = z.infer<typeof CatalogPublicationOutboxEventSchema>;
export type CatalogEntityKind = z.infer<typeof CatalogEntityKindSchema>;
export type CatalogRelationKind = z.infer<typeof CatalogRelationKindSchema>;
export type CatalogCompositionUnit = z.infer<typeof CatalogCompositionUnitSchema>;
export type CatalogProductRelation = z.infer<typeof CatalogProductRelationSchema>;
export type CatalogEffectiveRelation = z.infer<typeof CatalogEffectiveRelationSchema>;

/**
 * Resolves the CAT-D006 precedence contract without performing I/O:
 * direct beats inherited, and a local exclusion beats an inclusion at the
 * same level. The origin is retained for the operator/API response.
 */
export function selectEffectiveCatalogRelations(
  candidates: CatalogEffectiveRelation[],
): CatalogEffectiveRelation[] {
  const selected = new Map<string, CatalogEffectiveRelation>();
  for (const candidate of candidates) {
    const key = `${candidate.subjectProductId}:${candidate.targetProductId}`;
    const current = selected.get(key);
    if (
      !current ||
      candidate.relationOriginLevel < current.relationOriginLevel ||
      (candidate.relationOriginLevel === current.relationOriginLevel &&
        candidate.isLocalExclusion &&
        !current.isLocalExclusion)
    ) {
      selected.set(key, candidate);
    }
  }
  return [...selected.values()].sort((left, right) =>
    `${left.subjectProductId}:${left.targetProductId}`.localeCompare(
      `${right.subjectProductId}:${right.targetProductId}`,
    ),
  );
}

/** Ambiguous or mixed changes always receive the broadest gate set. */
export function selectCatalogReleaseProfile(changeClass: CatalogChangeClass): CatalogReleaseProfile {
  switch (changeClass) {
    case "frontend":
      return "frontend-only";
    case "edge":
      return "edge-only";
    case "database-auth":
      return "database-auth";
    case "mixed":
    case "unknown":
      return "full-release";
  }
}

/**
 * A catalog candidate is never enabled by an omitted, malformed, or default
 * flag. An explicit server override is still required in addition to the
 * build-time opt-in, so a production build remains closed by default.
 */
export function isCatalogFeatureEnabled(input: {
  buildFlag?: string;
  capabilityEnabled: boolean;
  capabilitySource: "default" | "override" | "kill_switch" | "unavailable";
}): boolean {
  return input.buildFlag === "true" && input.capabilityEnabled && input.capabilitySource === "override";
}
