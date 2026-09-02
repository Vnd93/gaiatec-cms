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
]);

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
export type Ev2ReleaseCommand = z.infer<typeof Ev2ReleaseCommandSchema>;
export type Ev2ReleaseCommandResult = z.infer<typeof Ev2ReleaseCommandResultSchema>;
