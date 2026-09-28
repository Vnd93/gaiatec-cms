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
