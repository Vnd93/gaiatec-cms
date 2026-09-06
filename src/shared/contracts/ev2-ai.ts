import { z } from "zod";

export const Ev2AiEnvironmentSchema = z.enum(["local", "staging", "production"]);
export const Ev2AiProviderModeSchema = z.enum(["synthetic", "openrouter"]);
export const Ev2AiModeSchema = z.enum(["read", "draft"]);
export const Ev2AiProposalKindSchema = z.enum(["locate", "explain", "extract", "draft_patch"]);
export const Ev2AiProposalStatusSchema = z.enum(["proposed", "accepted", "rejected", "edited"]);

export const Ev2AiCapabilitySchema = z
  .object({
    schemaVersion: z.literal(1),
    enabled: z.boolean(),
    source: z.string(),
    environment: z.enum(["local", "staging", "production"]),
    siteKey: z.literal("main"),
    providerMode: Ev2AiProviderModeSchema,
    externalProviderEnabled: z.boolean(),
    externalProviderReady: z.boolean(),
    aiExecute: z.literal(false),
    realDataAllowed: z.boolean(),
    decisionKey: z.literal("EV2-D04"),
    decisionStatus: z.enum(["technical_draft", "approved", "retired"]),
    policyVersion: z.literal(1),
    toolCatalogVersion: z.literal(1),
    retentionHours: z.number().int().min(1).max(24),
    maxSessionMinutes: z.number().int().min(1).max(30),
    maxSessionTokens: z.number().int().min(1).max(8000),
    manualFallback: z.literal(true),
    correlationId: z.uuid(),
  })
  .strict();

export const Ev2AiToolSchema = z
  .object({
    key: z.enum(["content.search", "content.read", "source.inspect", "draft.propose_patch"]),
    name: z.string().min(2).max(120),
    mode: Ev2AiModeSchema,
    permission: z.enum(["cms:ai.read", "cms:ai.draft"]),
    syntheticOnly: z.boolean(),
    mutatesCms: z.literal(false),
  })
  .strict();

export const Ev2AiSourceSchema = z
  .object({
    id: z.uuid(),
    kind: z.literal("synthetic_document"),
    reference: z.string().regex(/^g10x-[a-z0-9-]{3,100}$/),
    title: z.string().min(3).max(180),
    version: z.string().min(1).max(80),
    locator: z.string().min(1).max(240),
    page: z.number().int().positive().nullable(),
    excerpt: z.string().min(3).max(3000),
    authorized: z.literal(true),
  })
  .strict();

export const Ev2AiProposalFieldSchema = z
  .object({
    path: z.string().regex(/^[a-z][a-zA-Z0-9_.-]{0,119}$/),
    label: z.string().min(1).max(160),
    value: z.string().min(1).max(3000),
    sourceId: z.uuid(),
    sourceTitle: z.string().min(3).max(180),
    sourceVersion: z.string().min(1).max(80),
    locator: z.string().min(1).max(240),
    page: z.number().int().positive().nullable(),
    excerpt: z.string().min(3).max(1000),
    confidence: z.number().min(0).max(1),
    status: z.enum(["supported", "pending", "human_verified"]),
  })
  .strict();

export const Ev2AiDiffSchema = z
  .object({
    before: z.string().max(3000),
    after: z.string().max(3000),
  })
  .strict();

export const Ev2AiProposalSchema = z
  .object({
    id: z.uuid(),
    kind: Ev2AiProposalKindSchema,
    status: Ev2AiProposalStatusSchema,
    summary: z.string().min(3).max(1000),
    targetRef: z
      .string()
      .regex(/^g10x-[a-z0-9-]{3,100}$/)
      .nullable(),
    fields: z.array(Ev2AiProposalFieldSchema).min(1).max(50),
    diff: Ev2AiDiffSchema,
    sourceIds: z.array(z.uuid()).min(1).max(20),
    confidence: z.number().min(0).max(1),
    hasPendingFields: z.boolean(),
    proposalHash: z.string().regex(/^[0-9a-f]{64}$/),
    lockVersion: z.number().int().positive(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const Ev2AiSessionSchema = z
  .object({
    id: z.uuid(),
    actorId: z.uuid(),
    owned: z.boolean(),
    reviewable: z.boolean(),
    title: z.string().min(3).max(160),
    mode: Ev2AiModeSchema,
    status: z.enum(["active", "closed", "canceled", "expired"]),
    providerMode: Ev2AiProviderModeSchema,
    tokensUsed: z.number().int().nonnegative(),
    tokenBudget: z.number().int().positive().max(8000),
    costUsedMicros: z.literal(0),
    expiresAt: z.iso.datetime(),
    proposals: z.array(Ev2AiProposalSchema),
    sources: z.array(Ev2AiSourceSchema),
  })
  .strict();

export const Ev2AiWorkspaceSchema = z
  .object({
    schemaVersion: z.literal(1),
    correlationId: z.uuid(),
    policy: z
      .object({
        decisionKey: z.literal("EV2-D04"),
        status: z.enum(["technical_draft", "approved"]),
        providerMode: Ev2AiProviderModeSchema,
        externalProviderEnabled: z.boolean(),
        allowedDataClasses: z.array(z.enum(["synthetic", "business_content"])).min(1),
        retentionHours: z.literal(24),
        aiExecute: z.literal(false),
      })
      .strict(),
    tools: z.array(Ev2AiToolSchema).length(4),
    sessions: z.array(Ev2AiSessionSchema).max(20),
  })
  .strict();

export const Ev2AiSessionCreatedSchema = z
  .object({
    schemaVersion: z.literal(1),
    sessionId: z.uuid(),
    status: z.literal("active"),
    providerMode: Ev2AiProviderModeSchema,
    externalProviderEnabled: z.boolean(),
    expiresAt: z.iso.datetime(),
    correlationId: z.uuid(),
  })
  .strict();

export const Ev2AiSessionClosedSchema = z
  .object({
    schemaVersion: z.literal(1),
    sessionId: z.uuid(),
    status: z.literal("closed"),
    correlationId: z.uuid(),
  })
  .strict();

export const Ev2AiProposalCreatedSchema = z
  .object({
    schemaVersion: z.literal(1),
    sessionId: z.uuid(),
    proposalId: z.uuid(),
    sourceId: z.uuid(),
    proposalHash: z.string().regex(/^[0-9a-f]{64}$/),
    confidence: z.number().min(0).max(1),
    hasPendingFields: z.boolean(),
    applied: z.literal(false),
    published: z.literal(false),
    costMicros: z.literal(0),
    correlationId: z.uuid(),
  })
  .strict();

export const Ev2AiDecisionResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    proposalId: z.uuid(),
    decision: z.enum(["accepted", "rejected", "edited"]),
    applied: z.literal(false),
    published: z.literal(false),
    correlationId: z.uuid(),
  })
  .strict();

export type Ev2AiCapability = z.infer<typeof Ev2AiCapabilitySchema>;
export type Ev2AiMode = z.infer<typeof Ev2AiModeSchema>;
export type Ev2AiProposal = z.infer<typeof Ev2AiProposalSchema>;
export type Ev2AiProposalField = z.infer<typeof Ev2AiProposalFieldSchema>;
export type Ev2AiSession = z.infer<typeof Ev2AiSessionSchema>;
export type Ev2AiSource = z.infer<typeof Ev2AiSourceSchema>;
export type Ev2AiWorkspace = z.infer<typeof Ev2AiWorkspaceSchema>;
