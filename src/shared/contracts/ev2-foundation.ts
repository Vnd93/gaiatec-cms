import { z } from "zod";

export const Ev2EnvironmentSchema = z.enum(["local", "staging", "production"]);

export const Ev2FeatureFlagKeySchema = z.enum([
  "ev2.release_skeleton",
  "ev2.draft_v2",
  "ev2.master_data",
  "ev2.pim_v2",
  "ev2.dam",
  "ev2.search_quality",
  "ev2.collaboration_bulk",
  "ev2.rbac_scoped",
  "ev2.visual_studio",
  "ev2.multisite",
  "ev2.ai_assist",
  "ev2.ai_execute",
  "ev2.system_assurance",
]);

/**
 * Funcionalidades que podem ser declaradas entregues — isto é, valer em produção sem habilitação
 * nominal por pessoa.
 *
 * A autoridade sobre esta lista é a restrição `cms_ev2_delivery_ledger_flag_elegivel`, na migration
 * 0093. Esta constante é a cópia que o cliente enxerga, e
 * `tests/contracts/ev2-delivery-ledger.test.ts` exige que as duas sejam idênticas nos dois sentidos
 * — se divergirem, a suíte reprova.
 *
 * As demais dez continuam exigindo habilitação nominal. Não é preferência: cada uma das que ficou
 * de fora é o portão único de algo que a revisão de segurança mandou manter fechado, ou um
 * adiamento declarado. Ampliar esta lista exige migration nova, que é um ato visível e governado.
 */
export const EV2_DELIVERABLE_FEATURES = ["ev2.draft_v2", "ev2.master_data", "ev2.pim_v2"] as const;

export type Ev2DeliverableFeature = (typeof EV2_DELIVERABLE_FEATURES)[number];

export const Ev2CommandActorContextSchema = z
  .object({
    environment: Ev2EnvironmentSchema,
    siteKey: z.string().regex(/^[a-z][a-z0-9_-]{1,63}$/),
  })
  .strict();

export const Ev2CommandEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(1),
    commandId: z.string().uuid(),
    correlationId: z.string().uuid(),
    occurredAt: z.iso.datetime(),
    actorContext: Ev2CommandActorContextSchema,
    expectedVersion: z.number().int().positive().optional(),
  })
  .strict();

export const Ev2ReleaseActionSchema = z.enum(["create", "status", "cancel", "rollback"]);
export const Ev2ReleaseStatusSchema = z.enum(["draft", "canceled", "rolled_back"]);

export const Ev2ReleaseCommandSchema = z
  .object({
    envelope: Ev2CommandEnvelopeSchema,
    action: Ev2ReleaseActionSchema,
    releaseId: z.string().uuid().optional(),
    reason: z.string().trim().min(3).max(500),
  })
  .strict()
  .superRefine((command, context) => {
    if (command.action === "create" && command.releaseId) {
      context.addIssue({ code: "custom", path: ["releaseId"], message: "create must not receive releaseId" });
    }
    if (command.action !== "create" && !command.releaseId) {
      context.addIssue({ code: "custom", path: ["releaseId"], message: "releaseId is required" });
    }
    if (["cancel", "rollback"].includes(command.action) && !command.envelope.expectedVersion) {
      context.addIssue({
        code: "custom",
        path: ["envelope", "expectedVersion"],
        message: "expectedVersion is required",
      });
    }
  });

export const Ev2FeatureFlagEvaluationSchema = z
  .object({
    schemaVersion: z.literal(1),
    key: Ev2FeatureFlagKeySchema,
    enabled: z.boolean(),
    source: z.enum(["default", "override", "kill_switch", "unavailable"]),
    evaluatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const Ev2CapabilityManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    status: z.enum(["ready", "gated", "unavailable"]),
    environment: Ev2EnvironmentSchema.nullable(),
    siteKey: z.literal("main").nullable(),
    evaluatedAt: z.iso.datetime({ offset: true }),
    capabilities: z.record(Ev2FeatureFlagKeySchema, Ev2FeatureFlagEvaluationSchema),
  })
  .strict();

export const Ev2ReleaseCommandResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    commandId: z.string().uuid(),
    correlationId: z.string().uuid(),
    releaseId: z.string().uuid(),
    status: Ev2ReleaseStatusSchema,
    lockVersion: z.number().int().positive(),
    empty: z.literal(true),
  })
  .strict();

export type Ev2CommandEnvelope = z.infer<typeof Ev2CommandEnvelopeSchema>;
export type Ev2Environment = z.infer<typeof Ev2EnvironmentSchema>;
export type Ev2FeatureFlagKey = z.infer<typeof Ev2FeatureFlagKeySchema>;
export type Ev2FeatureFlagEvaluation = z.infer<typeof Ev2FeatureFlagEvaluationSchema>;
export type Ev2CapabilityManifest = z.infer<typeof Ev2CapabilityManifestSchema>;
export type Ev2ReleaseCommand = z.infer<typeof Ev2ReleaseCommandSchema>;
export type Ev2ReleaseCommandResult = z.infer<typeof Ev2ReleaseCommandResultSchema>;
