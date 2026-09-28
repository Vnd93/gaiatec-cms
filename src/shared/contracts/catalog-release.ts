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

export const CatalogEditorialTermKindSchema = z.enum(["technology", "industry", "application"]);

const CatalogEditorialBodyBlockSchema = z
  .object({
    heading: z.string().trim().min(1).max(160),
    paragraphs: z.array(z.string().trim().min(1).max(2_000)).min(1).max(20),
  })
  .strict();

export const CatalogEditorialUatEvidenceSchema = z
  .object({
    evidenceId: z
      .string()
      .trim()
      .regex(/^CAT-UAT-[A-Z0-9-]{3,80}$/),
    completedAt: z.iso.datetime(),
  })
  .strict();

/**
 * Public editorial term payload. It is intentionally text-only and carries
 * no SKU, price, stock, availability, or import metadata. A term may be
 * rendered in a staging preview while remaining noindex until approval and
 * UAT evidence are both present.
 */
export const CatalogEditorialTermSchema = z
  .object({
    schemaVersion: z.literal(1),
    termId: z.uuid(),
    kind: CatalogEditorialTermKindSchema,
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    path: z
      .string()
      .trim()
      .regex(/^\/catalogo\/(?:tecnologia|industria|aplicacao)\/[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string().trim().min(1).max(180),
    summary: z.string().trim().min(1).max(600),
    blocks: z.array(CatalogEditorialBodyBlockSchema).min(1).max(50),
    productId: z.uuid(),
    productPublicationState: z.literal("published"),
    ownerRole: z.string().trim().min(1).max(120),
    approverRole: z.string().trim().min(1).max(120),
    approval: CatalogNominalApprovalSchema,
    uatEvidence: CatalogEditorialUatEvidenceSchema.nullable(),
    seo: z
      .object({
        canonicalPath: z
          .string()
          .trim()
          .regex(/^\/catalogo\/(?:tecnologia|industria|aplicacao)\/[a-z0-9]+(?:-[a-z0-9]+)*$/),
        indexable: z.boolean(),
      })
      .strict(),
  })
  .strict()
  .superRefine((term, context) => {
    const expectedPath = catalogEditorialTermPath(term.kind, term.slug);
    if (term.path !== expectedPath) {
      context.addIssue({
        code: "custom",
        path: ["path"],
        message: "editorial term path must match its kind and slug",
      });
    }
    if (term.seo.canonicalPath !== term.path) {
      context.addIssue({
        code: "custom",
        path: ["seo", "canonicalPath"],
        message: "editorial term canonical path must match the public path",
      });
    }
    if (term.seo.indexable && (term.approval !== "approved" || term.uatEvidence === null)) {
      context.addIssue({
        code: "custom",
        path: ["seo", "indexable"],
        message: "indexability requires approved editorial review and UAT evidence",
      });
    }
  });

/** Sanitized wire contract used by the public term page (no internal IDs). */
export const CatalogEditorialPublicTermSchema = z
  .object({
    kind: CatalogEditorialTermKindSchema,
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    path: z
      .string()
      .trim()
      .regex(/^\/catalogo\/(?:tecnologia|industria|aplicacao)\/[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string().trim().min(1).max(180),
    summary: z.string().trim().min(1).max(600),
    blocks: z.array(CatalogEditorialBodyBlockSchema).min(1).max(50),
    seo: z
      .object({
        canonicalPath: z
          .string()
          .trim()
          .regex(/^\/catalogo\/(?:tecnologia|industria|aplicacao)\/[a-z0-9]+(?:-[a-z0-9]+)*$/),
        indexable: z.boolean(),
      })
      .strict(),
  })
  .strict()
  .superRefine((term, context) => {
    if (term.path !== catalogEditorialTermPath(term.kind, term.slug)) {
      context.addIssue({
        code: "custom",
        path: ["path"],
        message: "public editorial term path must match its kind and slug",
      });
    }
    if (term.seo.canonicalPath !== term.path) {
      context.addIssue({
        code: "custom",
        path: ["seo", "canonicalPath"],
        message: "public editorial term canonical path must match the public path",
      });
    }
  });

/** Owner/approver and UAT evidence used by the CAT-011 coverage gate. */
export const CatalogNominalApprovalEvidenceSchema = CatalogNominalProductSchema.extend({
  uatEvidence: CatalogEditorialUatEvidenceSchema.nullable(),
}).strict();

export const CatalogFatia4CoverageSchema = z
  .object({
    schemaVersion: z.literal(1),
    source: z.literal("canonical-nominal-list"),
    totalCandidates: z.number().int().nonnegative(),
    reviewedCandidates: z.number().int().nonnegative(),
    approvedCandidates: z.number().int().nonnegative(),
    provisionalCandidates: z.number().int().nonnegative(),
    requiredCoveragePercent: z.literal(100),
    publication: z.literal(false),
    load: z.literal(false),
    cutover: z.literal(false),
  })
  .strict()
  .superRefine((coverage, context) => {
    if (coverage.reviewedCandidates > coverage.totalCandidates) {
      context.addIssue({
        code: "custom",
        path: ["reviewedCandidates"],
        message: "reviewed candidates cannot exceed the nominal list",
      });
    }
    if (coverage.approvedCandidates > coverage.reviewedCandidates) {
      context.addIssue({
        code: "custom",
        path: ["approvedCandidates"],
        message: "approved candidates require prior review",
      });
    }
    if (coverage.provisionalCandidates > coverage.reviewedCandidates) {
      context.addIssue({
        code: "custom",
        path: ["provisionalCandidates"],
        message: "provisional candidates require prior review",
      });
    }
  });

/** CAT-012 rollback evidence: one reader, legacy source, and no copying. */
export const CatalogRollbackPlanSchema = z
  .object({
    schemaVersion: z.literal(1),
    reader: z.literal("legacy"),
    featureFlag: z.literal("ev2.catalog_v1"),
    copyBetweenSources: z.literal(false),
    publication: z.literal(false),
    load: z.literal(false),
    cutover: z.literal(false),
  })
  .strict();

/**
 * Evidence envelope for the post-Fatia-4 UAT gate. It is safe to commit:
 * it contains only immutable hashes, counters and gate outcomes, never
 * operator identity, credentials, cookies or editorial payloads.
 */
export const CatalogFatia4UatRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    candidateSha: z.string().regex(/^[0-9a-f]{40}$/),
    environment: z.enum(["local", "staging"]),
    featureFlag: z.literal("default-off"),
    coverage: CatalogFatia4CoverageSchema,
    rollback: CatalogRollbackPlanSchema,
    browser: z
      .object({
        engine: z.enum(["chrome", "chromium"]),
        authenticated: z.boolean(),
        backend: z.enum(["local", "staging"]),
        status: z.enum(["pending", "passed"]),
        evidenceId: CatalogEditorialUatEvidenceSchema.nullable(),
      })
      .strict()
      .superRefine((browser, context) => {
        if (browser.status === "passed") {
          if (browser.engine !== "chrome") {
            context.addIssue({
              code: "custom",
              path: ["engine"],
              message: "manual UAT requires Google Chrome",
            });
          }
          if (!browser.authenticated || browser.backend !== "staging" || browser.evidenceId === null) {
            context.addIssue({
              code: "custom",
              path: ["status"],
              message: "passed UAT requires authenticated Chrome, staging backend and evidence",
            });
          }
        }
        if (browser.status === "pending" && browser.evidenceId !== null) {
          context.addIssue({
            code: "custom",
            path: ["evidenceId"],
            message: "pending UAT cannot carry completion evidence",
          });
        }
      }),
    publication: z.literal(false),
    load: z.literal(false),
    cutover: z.literal(false),
  })
  .strict()
  .superRefine((record, context) => {
    if (record.browser.status === "passed" && record.environment !== "staging") {
      context.addIssue({
        code: "custom",
        path: ["environment"],
        message: "authenticated UAT can only pass against staging",
      });
    }
    if (record.coverage.publication || record.coverage.load || record.coverage.cutover) {
      context.addIssue({
        code: "custom",
        path: ["coverage"],
        message: "UAT evidence cannot authorize publication, load or cutover",
      });
    }
  });

export type CatalogReleaseProfile = z.infer<typeof CatalogReleaseProfileSchema>;
export type CatalogChangeClass = z.infer<typeof CatalogChangeClassSchema>;
export type CatalogWave = z.infer<typeof CatalogWaveSchema>;
export type CatalogNominalProduct = z.infer<typeof CatalogNominalProductSchema>;
export type CatalogEditorialTermKind = z.infer<typeof CatalogEditorialTermKindSchema>;
export type CatalogEditorialTerm = z.infer<typeof CatalogEditorialTermSchema>;
export type CatalogEditorialPublicTerm = z.infer<typeof CatalogEditorialPublicTermSchema>;
export type CatalogNominalApprovalEvidence = z.infer<typeof CatalogNominalApprovalEvidenceSchema>;
export type CatalogFatia4Coverage = z.infer<typeof CatalogFatia4CoverageSchema>;
export type CatalogRollbackPlan = z.infer<typeof CatalogRollbackPlanSchema>;
export type CatalogFatia4UatRecord = z.infer<typeof CatalogFatia4UatRecordSchema>;
export type CatalogPublicationState = z.infer<typeof CatalogPublicationStateSchema>;
export type CatalogPublicSnapshot = z.infer<typeof CatalogPublicSnapshotSchema>;
export type CatalogPublicationOutboxEvent = z.infer<typeof CatalogPublicationOutboxEventSchema>;
export type CatalogEntityKind = z.infer<typeof CatalogEntityKindSchema>;
export type CatalogRelationKind = z.infer<typeof CatalogRelationKindSchema>;
export type CatalogCompositionUnit = z.infer<typeof CatalogCompositionUnitSchema>;
export type CatalogProductRelation = z.infer<typeof CatalogProductRelationSchema>;
export type CatalogEffectiveRelation = z.infer<typeof CatalogEffectiveRelationSchema>;

export function catalogEditorialTermPath(kind: CatalogEditorialTermKind, slug: string): string {
  const segment = kind === "technology" ? "tecnologia" : kind === "industry" ? "industria" : "aplicacao";
  return `/catalogo/${segment}/${slug}`;
}

export function isCatalogEditorialTermIndexable(
  term: CatalogEditorialTerm,
  featureEnabled: boolean,
): boolean {
  return (
    featureEnabled &&
    term.productPublicationState === "published" &&
    term.approval === "approved" &&
    term.uatEvidence !== null &&
    term.seo.indexable
  );
}

export function resolveCatalogEditorialSeo(term: CatalogEditorialTerm, featureEnabled: boolean) {
  return {
    canonicalPath: term.seo.canonicalPath,
    indexable: isCatalogEditorialTermIndexable(term, featureEnabled),
  };
}

export function isCatalogEditorialPublicTermIndexable(
  term: CatalogEditorialPublicTerm,
  featureEnabled: boolean,
): boolean {
  return featureEnabled && term.seo.indexable;
}

export function selectCatalogReaderSource(input: {
  featureEnabled: boolean;
  catalogReaderReady: boolean;
  legacyReaderAvailable: boolean;
}): "legacy" | "catalog" {
  if (!input.featureEnabled || !input.catalogReaderReady || !input.legacyReaderAvailable) return "legacy";
  return "catalog";
}

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
