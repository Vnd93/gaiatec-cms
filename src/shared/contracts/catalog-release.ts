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

export const CatalogNominalApprovalSchema = z.enum(["pending-approval", "approved", "rejected"]);

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
