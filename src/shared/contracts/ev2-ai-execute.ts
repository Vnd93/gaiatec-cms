import { z } from "zod";

const ApprovedAiModel = z.literal("nvidia/nemotron-3.5-lightning:free");

export const Ev2AiExecutionEnvironmentSchema = z.enum(["local", "staging"]);
export const Ev2AiExecutionRiskSchema = z.enum(["draft", "workflow", "critical"]);
export const Ev2AiExecutionToolKeySchema = z.enum([
  "draft.apply_patch",
  "workflow.submit",
  "release.schedule",
  "release.publish",
  "release.rollback",
]);
export const Ev2AiExecutionPlanStatusSchema = z.enum([
  "ready",
  "approved",
  "rejected",
  "executing",
  "executed",
  "compensated",
  "canceled",
  "expired",
]);

export const Ev2AiExecutionCapabilitySchema = z
  .object({
    schemaVersion: z.literal(1),
    enabled: z.boolean(),
    source: z.string(),
    environment: z.enum(["local", "staging", "production"]),
    siteKey: z.literal("main"),
    providerMode: z.literal("openrouter"),
    providerModel: ApprovedAiModel,
    allowedProvider: z.literal("openrouter").optional(),
    allowedModel: ApprovedAiModel.optional(),
    externalProviderEnabled: z.literal(true),
    externalProviderReady: z.boolean(),
    realDataAllowed: z.literal(false),
    syntheticOnly: z.literal(true),
    requiresAiAssist: z.literal(true),
    planHashRequired: z.literal(true),
    reviewerSeparationRequired: z.literal(true),
    compensationRequired: z.literal(true),
    maxPlanSteps: z.literal(20),
    approvalMinutes: z.literal(10),
    manualFallback: z.literal(true),
    correlationId: z.uuid(),
  })
  .strict()
  .superRefine((capability, context) => {
    if (capability.environment === "production" && capability.enabled)
      context.addIssue({
        code: "custom",
        path: ["enabled"],
        message: "Produção não pode habilitar a execução G14.",
      });
  });

export const Ev2AiExecutionToolSchema = z
  .object({
    key: Ev2AiExecutionToolKeySchema,
    name: z.string().min(2).max(120),
    risk: Ev2AiExecutionRiskSchema,
    permission: z.enum(["cms:ai.execute", "cms:ai.compensate"]),
    syntheticOnly: z.literal(true),
    reversible: z.literal(true),
    active: z.boolean(),
  })
  .strict();

export const Ev2AiSyntheticTargetSchema = z
  .object({
    reference: z.string().regex(/^g14x-[a-z0-9-]{3,100}$/),
    title: z.string().min(3).max(160),
    lifecycle: z.enum(["draft", "review", "scheduled", "published", "retired"]),
    payload: z.record(z.string(), z.unknown()),
    version: z.number().int().positive(),
    owned: z.boolean(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const Ev2AiExecutionStepSchema = z
  .object({
    stepKey: z.string().regex(/^step-[a-z0-9-]{3,60}$/),
    toolKey: Ev2AiExecutionToolKeySchema,
    targetRef: z.string().regex(/^g14x-[a-z0-9-]{3,100}$/),
    expectedVersion: z.number().int().positive(),
    arguments: z.record(z.string(), z.unknown()),
  })
  .strict();

export const Ev2AiExecutionApprovalSchema = z
  .object({
    id: z.uuid(),
    purpose: z.enum(["execute", "compensate"]),
    decision: z.enum(["approved", "rejected"]),
    status: z.enum(["active", "consumed", "expired", "rejected"]),
    planHash: z.string().regex(/^[0-9a-f]{64}$/),
    approvedBy: z.uuid(),
    expiresAt: z.iso.datetime(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const Ev2AiExecutionRunSchema = z
  .object({
    id: z.uuid(),
    status: z.enum(["succeeded", "compensated"]),
    executedBy: z.uuid(),
    stepCount: z.number().int().min(1).max(20),
    result: z.record(z.string(), z.unknown()),
    compensationApproved: z.boolean(),
    createdAt: z.iso.datetime(),
    completedAt: z.iso.datetime(),
  })
  .strict();

export const Ev2AiExecutionPlanSchema = z
  .object({
    id: z.uuid(),
    title: z.string().min(3).max(160),
    status: Ev2AiExecutionPlanStatusSchema,
    risk: Ev2AiExecutionRiskSchema,
    planVersion: z.number().int().positive(),
    planHash: z.string().regex(/^[0-9a-f]{64}$/),
    steps: z.array(Ev2AiExecutionStepSchema).min(1).max(20),
    dryRun: z
      .object({
        valid: z.literal(true),
        stepCount: z.number().int().min(1).max(20),
        targetCount: z.number().int().min(1).max(20),
        risk: Ev2AiExecutionRiskSchema,
        reversible: z.literal(true),
      })
      .passthrough(),
    createdBy: z.uuid(),
    owned: z.boolean(),
    approvable: z.boolean(),
    executable: z.boolean(),
    compensatable: z.boolean(),
    expiresAt: z.iso.datetime(),
    createdAt: z.iso.datetime(),
    approvals: z.array(Ev2AiExecutionApprovalSchema),
    runs: z.array(Ev2AiExecutionRunSchema).max(1),
  })
  .strict();

export const Ev2AiExecutionWorkspaceSchema = z
  .object({
    schemaVersion: z.literal(1),
    correlationId: z.uuid(),
    policy: z
      .object({
        gate: z.literal("G14"),
        dataClass: z.literal("synthetic"),
        productionAllowed: z.literal(false),
        providerMode: z.literal("openrouter"),
        providerModel: ApprovedAiModel,
        externalProviderEnabled: z.literal(true),
        externalProviderReady: z.boolean(),
        maxPlanSteps: z.literal(20),
        approvalMinutes: z.literal(10),
        reviewerSeparationRequired: z.literal(true),
        compensationRequired: z.literal(true),
        sameRunRequired: z.boolean(),
        automaticPublishAllowed: z.literal(false),
        manualFallback: z.literal(true),
      })
      .strict(),
    permissions: z
      .object({
        canPlan: z.boolean(),
        canApprove: z.boolean(),
        canExecute: z.boolean(),
        canCompensate: z.boolean(),
      })
      .strict(),
    tools: z.array(Ev2AiExecutionToolSchema).length(5),
    targets: z.array(Ev2AiSyntheticTargetSchema).max(30),
    plans: z.array(Ev2AiExecutionPlanSchema).max(30),
  })
  .strict();

export const Ev2AiExecutionMutationResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    action: z.enum([
      "create_target",
      "create_plan",
      "revise_plan",
      "approve_plan",
      "execute_plan",
      "approve_compensation",
      "compensate_run",
      "cancel_plan",
    ]),
    targetRef: z.string().nullable(),
    planId: z.uuid().nullable(),
    runId: z.uuid().nullable(),
    status: z.string().min(3).max(40),
    planHash: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable(),
    applied: z.boolean(),
    published: z.boolean(),
    syntheticOnly: z.literal(true),
    providerMode: z.literal("openrouter"),
    providerModel: ApprovedAiModel,
    realDataAllowed: z.literal(false),
    correlationId: z.uuid(),
  })
  .strict();

export type Ev2AiExecutionCapability = z.infer<typeof Ev2AiExecutionCapabilitySchema>;
export type Ev2AiExecutionPlan = z.infer<typeof Ev2AiExecutionPlanSchema>;
export type Ev2AiExecutionRisk = z.infer<typeof Ev2AiExecutionRiskSchema>;
export type Ev2AiExecutionStep = z.infer<typeof Ev2AiExecutionStepSchema>;
export type Ev2AiExecutionTool = z.infer<typeof Ev2AiExecutionToolSchema>;
export type Ev2AiExecutionWorkspace = z.infer<typeof Ev2AiExecutionWorkspaceSchema>;
export type Ev2AiSyntheticTarget = z.infer<typeof Ev2AiSyntheticTargetSchema>;
