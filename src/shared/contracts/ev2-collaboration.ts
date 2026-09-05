import { z } from "zod";

export const Ev2CommandEnvelopeV1Schema = z.object({
  schemaVersion: z.literal(1),
  commandId: z.uuid(),
  correlationId: z.uuid(),
  occurredAt: z.iso.datetime(),
  actorContext: z.object({
    environment: z.enum(["local", "staging"]),
    siteKey: z.literal("main"),
  }),
});

export const Ev2ReleaseStatusSchema = z.enum([
  "draft",
  "validated",
  "ready_for_review",
  "approved",
  "scheduled",
  "published",
  "failed",
  "canceled",
  "rolled_back",
]);
export type Ev2ReleaseStatus = z.infer<typeof Ev2ReleaseStatusSchema>;

export const Ev2ReleaseSummarySchema = z.object({
  releaseId: z.uuid(),
  title: z.string(),
  status: Ev2ReleaseStatusSchema,
  planHash: z.string().regex(/^[0-9a-f]{64}$/),
  lockVersion: z.number().int().positive(),
  scheduledFor: z.string().nullable().optional(),
  approvedAt: z.string().nullable().optional(),
  publishedAt: z.string().nullable().optional(),
  updatedAt: z.string(),
  itemCount: z.number().int().nonnegative(),
});
export type Ev2ReleaseSummary = z.infer<typeof Ev2ReleaseSummarySchema>;

export const Ev2ReleaseDetailSchema = Ev2ReleaseSummarySchema.omit({ itemCount: true }).extend({
  reason: z.string(),
  items: z.array(
    z.object({
      id: z.uuid(),
      itemId: z.uuid(),
      revisionId: z.uuid(),
      contentType: z.string(),
      slug: z.string(),
      position: z.number().int().positive(),
      dependencies: z.array(z.uuid()),
      frozenHash: z.string(),
      validationStatus: z.enum(["pending", "passed", "failed"]),
      diff: z.object({
        fromRevisionId: z.uuid().nullable().optional(),
        toRevisionId: z.uuid(),
        changedFields: z.array(z.string()),
        seoChanged: z.boolean(),
      }),
    }),
  ),
  validations: z.array(
    z.object({
      validationKey: z.string(),
      severity: z.enum(["error", "warning", "info"]),
      status: z.enum(["passed", "failed"]),
      fieldPath: z.string().nullable().optional(),
      message: z.string(),
      createdAt: z.string(),
    }),
  ),
  approvals: z.array(
    z.object({
      approverId: z.uuid(),
      decision: z.enum(["approved", "rejected"]),
      reason: z.string(),
      expiresAt: z.string(),
      createdAt: z.string(),
    }),
  ),
});
export type Ev2ReleaseDetail = z.infer<typeof Ev2ReleaseDetailSchema>;

export const Ev2WorkTaskSchema = z.object({
  id: z.uuid(),
  sourceKind: z.string(),
  sourceId: z.uuid().nullable().optional(),
  title: z.string(),
  description: z.string(),
  status: z.enum(["open", "in_progress", "resolved"]),
  priority: z.enum(["low", "normal", "high", "critical"]),
  anchor: z.record(z.string(), z.unknown()),
  assignedTo: z.uuid().nullable().optional(),
  dueAt: z.string().nullable().optional(),
  lockVersion: z.number().int().positive(),
  updatedAt: z.string(),
  commentCount: z.number().int().nonnegative(),
  comments: z
    .array(
      z.object({
        id: z.uuid(),
        parentCommentId: z.uuid().nullable().optional(),
        authorId: z.uuid(),
        body: z.string(),
        anchor: z.record(z.string(), z.unknown()),
        createdAt: z.string(),
      }),
    )
    .default([]),
  history: z
    .array(
      z.object({
        id: z.uuid(),
        actorId: z.uuid().nullable().optional(),
        eventType: z.string(),
        eventData: z.record(z.string(), z.unknown()),
        occurredAt: z.string(),
      }),
    )
    .default([]),
});
export type Ev2WorkTask = z.infer<typeof Ev2WorkTaskSchema>;

export const Ev2BulkJobSchema = z.object({
  jobId: z.uuid(),
  operation: z.enum(["add_to_release", "assign_tasks", "resolve_tasks"]),
  status: z.enum(["validating", "validated", "running", "completed", "failed", "canceled"]),
  atomic: z.literal(true),
  targetCount: z.number().int().positive(),
  report: z.object({
    valid: z.boolean().optional(),
    total: z.number().int().optional(),
    validItems: z.number().int().optional(),
    errors: z.number().int().optional(),
    writes: z.number().int().optional(),
  }),
  lockVersion: z.number().int().positive(),
  correlationId: z.uuid(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type Ev2BulkJob = z.infer<typeof Ev2BulkJobSchema>;

export const ev2ReleaseStatusLabels: Record<Ev2ReleaseStatus, string> = {
  draft: "Em montagem",
  validated: "Validado",
  ready_for_review: "Aguardando aprovação",
  approved: "Aprovado",
  scheduled: "Agendado",
  published: "Publicado",
  failed: "Falhou sem alteração parcial",
  canceled: "Cancelado",
  rolled_back: "Revertido",
};

export function ev2AnchorPath(anchor: Record<string, unknown>): string | null {
  if (typeof anchor.route === "string" && anchor.route.startsWith("/admin")) return anchor.route;
  const itemId = typeof anchor.itemId === "string" ? anchor.itemId : null;
  if (!itemId) return null;
  return `/admin/conteudo/${encodeURIComponent(itemId)}`;
}

export function parseBulkTargets(
  raw: string,
  operation: "add_to_release" | "assign_tasks" | "resolve_tasks",
) {
  const seen = new Set<string>();
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [id, second] = line.split(",").map((value) => value.trim());
      if (!z.uuid().safeParse(id).success) throw new Error(`Linha ${index + 1}: ID inválido.`);
      if (seen.has(id)) throw new Error(`Linha ${index + 1}: alvo duplicado.`);
      seen.add(id);
      if (operation === "add_to_release") {
        if (!z.uuid().safeParse(second).success) throw new Error(`Linha ${index + 1}: revisão inválida.`);
        return { id, revisionId: second };
      }
      const expectedVersion = Number(second);
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion <= 0)
        throw new Error(`Linha ${index + 1}: versão esperada inválida.`);
      return { id, expectedVersion };
    });
}
