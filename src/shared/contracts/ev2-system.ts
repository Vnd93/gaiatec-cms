import { z } from "zod";

export const Ev2SystemBaselinesSchema = z
  .object({
    availabilityPercent: z.literal(99.9),
    adminReadP95Ms: z.literal(500),
    commandP95Ms: z.literal(800),
    outboxLagP95Ms: z.literal(60000),
    restoreRpoMinutes: z.literal(0),
    restoreRtoMinutes: z.literal(15),
    accessibilityCritical: z.literal(0),
    accessibilitySerious: z.literal(0),
    auditCoveragePercent: z.literal(100),
  })
  .strict();

export const Ev2SystemCapabilitySchema = z
  .object({
    schemaVersion: z.literal(1),
    enabled: z.boolean(),
    source: z.string(),
    environment: z.enum(["local", "staging", "production"]),
    siteKey: z.literal("main"),
    realDataAllowed: z.literal(false),
    syntheticOnly: z.literal(true),
    maxOverrideMinutes: z.literal(30),
    requiresIndependentReview: z.literal(true),
    baselines: Ev2SystemBaselinesSchema,
  })
  .strict();

export const Ev2SystemQueueSchema = z
  .object({
    key: z.enum(["publication", "lead_delivery", "collaboration"]),
    actionable: z.number().int().nonnegative(),
    deadLetter: z.number().int().nonnegative(),
    oldestLagSeconds: z.number().int().nonnegative(),
  })
  .strict();

export const Ev2SystemCheckSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]{2,79}$/),
    category: z.enum(["operational", "resilience", "data", "observability", "security"]),
    passed: z.boolean(),
    observed: z.number(),
    threshold: z.number(),
    unit: z.enum(["seconds", "events", "records", "alerts", "percent"]),
  })
  .strict();

export const Ev2SystemSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    capturedAt: z.string().datetime({ offset: true }),
    correlationId: z.uuid(),
    environment: z.enum(["local", "staging"]),
    siteKey: z.literal("main"),
    containsPersonalData: z.literal(false),
    gateReady: z.boolean(),
    gateDecision: z.literal("non_authoritative"),
    queues: z.array(Ev2SystemQueueSchema).length(3),
    metrics: z
      .object({
        outboxWorstLagSeconds: z.number().int().nonnegative(),
        projectionDivergence: z.number().int().nonnegative(),
        leadDivergence: z.number().int().nonnegative(),
        openCriticalAlerts: z.number().int().nonnegative(),
        criticalActionsObserved24h: z.number().int().nonnegative(),
        criticalActionsUntraced24h: z.number().int().nonnegative(),
        auditCoveragePercent: z.number().min(0).max(100),
      })
      .strict(),
    checks: z.array(Ev2SystemCheckSchema).length(6),
  })
  .strict();

export const Ev2AssuranceCommandResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    runId: z.uuid(),
    status: z.enum(["measured", "accepted", "rejected", "failed"]),
    measurementPassed: z.boolean(),
    requiresIndependentReview: z.boolean(),
    correlationId: z.uuid(),
  })
  .strict()
  .superRefine((result, context) => {
    const invariant =
      (result.status === "measured" && result.measurementPassed && result.requiresIndependentReview) ||
      (result.status === "failed" && !result.measurementPassed && !result.requiresIndependentReview) ||
      ((result.status === "accepted" || result.status === "rejected") &&
        result.measurementPassed &&
        !result.requiresIndependentReview);
    if (!invariant)
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "Estado de garantia inconsistente.",
      });
  });

export type Ev2SystemCapability = z.infer<typeof Ev2SystemCapabilitySchema>;
export type Ev2SystemSnapshot = z.infer<typeof Ev2SystemSnapshotSchema>;
export type Ev2AssuranceCommandResult = z.infer<typeof Ev2AssuranceCommandResultSchema>;
