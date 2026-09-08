import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { z } from "npm:zod@4.4.3";
import { authenticateCms } from "../_shared/cms-auth.ts";
import { isConfiguredCmsEnvironment, isProductionOperationEnabled } from "../_shared/ev2-environment.ts";
import {
  clientAddress,
  consumeRateLimit,
  corsHeaders,
  isAllowedOrigin,
  json,
  readJsonLimited,
  sha256,
} from "../_shared/security.ts";

const Uuid = z.uuid();
const Envelope = z
  .object({
    schemaVersion: z.literal(1),
    commandId: Uuid,
    correlationId: Uuid,
    occurredAt: z.iso.datetime(),
    actorContext: z
      .object({
        environment: z.enum(["local", "staging", "production"]),
        siteKey: z.literal("main"),
      })
      .strict(),
  })
  .strict();
const Anchor = z
  .object({
    itemId: Uuid.optional(),
    revisionId: Uuid.optional(),
    releaseId: Uuid.optional(),
    fieldPath: z.string().trim().min(1).max(300).optional(),
    blockId: Uuid.optional(),
    route: z.string().trim().min(1).max(500).optional(),
  })
  .strict()
  .refine((anchor) => anchor.itemId || anchor.releaseId || anchor.route, "anchor target required");
const CollaborationRequest = z
  .object({
    envelope: Envelope,
    action: z.enum([
      "capability",
      "assignees",
      "list",
      "create_task",
      "add_comment",
      "assign_task",
      "resolve_task",
      "reopen_task",
      "save_view",
    ]),
    taskId: Uuid.optional(),
    expectedVersion: z.number().int().positive().optional(),
    sourceKind: z
      .enum(["manual", "review", "comment", "quality", "release", "release_validation", "delivery_failure"])
      .optional(),
    sourceId: Uuid.optional(),
    title: z.string().trim().min(3).max(160).optional(),
    description: z.string().max(2000).optional(),
    priority: z.enum(["low", "normal", "high", "critical"]).optional(),
    anchor: Anchor.optional(),
    assignedTo: Uuid.optional(),
    dueAt: z.iso.datetime().optional(),
    body: z.string().trim().min(1).max(4000).optional(),
    parentCommentId: Uuid.optional(),
    mentions: z.array(Uuid).max(50).optional(),
    reason: z.string().trim().min(3).max(500).optional(),
    status: z.enum(["open", "in_progress", "resolved"]).optional(),
    assignedToMe: z.boolean().optional(),
    limit: z.number().int().min(1).max(100).optional(),
    name: z.string().trim().min(2).max(80).optional(),
    filters: z.record(z.string(), z.unknown()).optional(),
    sort: z.record(z.string(), z.unknown()).optional(),
    favorite: z.boolean().optional(),
  })
  .strict()
  .superRefine((command, context) => {
    if (command.action === "create_task" && (!command.title || !command.anchor)) {
      context.addIssue({ code: "custom", path: ["title"], message: "title and anchor required" });
    }
    if (command.action === "add_comment" && (!command.taskId || !command.body)) {
      context.addIssue({ code: "custom", path: ["body"], message: "task and body required" });
    }
    if (["assign_task", "resolve_task", "reopen_task"].includes(command.action)) {
      if (!command.taskId || !command.expectedVersion) {
        context.addIssue({ code: "custom", path: ["taskId"], message: "task and version required" });
      }
    }
    if (command.action === "assign_task" && !command.assignedTo) {
      context.addIssue({ code: "custom", path: ["assignedTo"], message: "assignee required" });
    }
    if (command.action === "save_view" && !command.name) {
      context.addIssue({ code: "custom", path: ["name"], message: "name required" });
    }
  });

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  return value;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (!isAllowedOrigin(req)) return json(req, { error: "Origem não autorizada." }, 403);
  if (req.method !== "POST") return json(req, { error: "Método não permitido." }, 405);
  const identity = await authenticateCms(req);
  if (!identity) return json(req, { error: "Sessão inválida." }, 401);

  let command: z.infer<typeof CollaborationRequest>;
  try {
    command = CollaborationRequest.parse(await readJsonLimited(req, 48 * 1024));
  } catch {
    return json(req, { error: "Comando de colaboração inválido.", code: "CMS_COLLABORATION_COMMAND_INVALID" }, 400);
  }
  const { environment, siteKey } = command.envelope.actorContext;
  const correlationId = command.envelope.correlationId;
  if (environment === "production" && !isProductionOperationEnabled(environment))
    return json(req, { error: "Produção não está disponível nesta fase.", code: "CMS_COLLABORATION_PRODUCTION_GATED", correlationId }, 403);
  const configuredEnvironment = Deno.env.get("CMS_ENVIRONMENT");
  if (!isConfiguredCmsEnvironment(configuredEnvironment))
    return json(req, { error: "Ambiente do CMS não configurado.", correlationId }, 503);
  if (configuredEnvironment !== environment || siteKey !== "main")
    return json(req, { error: "Escopo do comando não autorizado.", code: "CMS_COLLABORATION_SCOPE_MISMATCH", correlationId }, 403);
  const occurredAt = Date.parse(command.envelope.occurredAt);
  if (occurredAt < Date.now() - 15 * 60_000 || occurredAt > Date.now() + 5 * 60_000)
    return json(req, { error: "Comando expirado ou futuro.", code: "CMS_COLLABORATION_COMMAND_STALE", correlationId }, 409);
  try {
    const allowed = await consumeRateLimit(
      identity.admin,
      req,
      `cms_collaboration_${command.action}`,
      `${identity.user.id}:${clientAddress(req)}`,
      120,
      900,
    );
    if (!allowed) return json(req, { error: "Muitas operações. Aguarde.", correlationId }, 429);
  } catch {
    return json(req, { error: "Proteção temporariamente indisponível.", correlationId }, 503);
  }

  const common = {
    p_actor_id: identity.user.id,
    p_environment: environment,
    p_site_key: siteKey,
    p_aal: identity.claims.aal,
    p_session_id: identity.claims.sessionId,
    p_issued_at: identity.claims.issuedAt,
  };
  if (command.action === "capability") {
    const { data, error } = await identity.admin.rpc("cms_evaluate_feature_flag", {
      p_actor_id: identity.user.id,
      p_flag_key: "ev2.collaboration_bulk",
      p_environment: environment,
      p_site_key: siteKey,
      p_aal: identity.claims.aal,
      p_session_id: identity.claims.sessionId,
      p_issued_at: identity.claims.issuedAt,
    });
    if (error) return json(req, { enabled: false, source: "unavailable", correlationId }, 503);
    return json(req, { ...data, correlationId });
  }
  if (command.action === "list") {
    const { data, error } = await identity.admin.rpc("cms_get_work_inbox", {
      ...common,
      p_task_id: command.taskId ?? null,
      p_status: command.status ?? null,
      p_assigned_to_me: command.assignedToMe ?? false,
      p_limit: command.limit ?? 50,
    });
    if (!error) return json(req, { ...data, correlationId });
    const forbidden = error.message.includes("FORBIDDEN");
    return json(req, { error: forbidden ? "Sem permissão para consultar a inbox." : "Inbox indisponível.", correlationId }, forbidden ? 403 : 503);
  }
  if (command.action === "assignees") {
    const { data, error } = await identity.admin.rpc("cms_list_collaboration_assignees", {
      ...common,
      p_limit: 500,
    });
    if (!error) return json(req, { ...data, correlationId });
    const forbidden = error.code === "42501" || error.message.includes("FORBIDDEN");
    return json(
      req,
      {
        error: forbidden ? "Sem permissão para consultar responsáveis." : "Responsáveis indisponíveis.",
        correlationId,
      },
      forbidden ? 403 : 503,
    );
  }

  const idempotencyKey = req.headers.get("X-Idempotency-Key");
  if (!idempotencyKey || !Uuid.safeParse(idempotencyKey).success)
    return json(req, { error: "Chave idempotente obrigatória.", correlationId }, 400);
  const requestHash = await sha256(JSON.stringify(canonicalize(command)));
  const { data, error } = await identity.admin.rpc("cms_execute_collaboration_command", {
    ...common,
    p_action: command.action,
    p_payload: {
      taskId: command.taskId,
      expectedVersion: command.expectedVersion,
      sourceKind: command.sourceKind,
      sourceId: command.sourceId,
      title: command.title,
      description: command.description,
      priority: command.priority,
      anchor: command.anchor,
      assignedTo: command.assignedTo,
      dueAt: command.dueAt,
      body: command.body,
      parentCommentId: command.parentCommentId,
      mentions: command.mentions,
      reason: command.reason,
      name: command.name,
      filters: command.filters,
      sort: command.sort,
      favorite: command.favorite,
    },
    p_command_id: command.envelope.commandId,
    p_idempotency_key: idempotencyKey,
    p_request_hash: requestHash,
    p_correlation_id: correlationId,
  });
  if (!error) return json(req, data);
  const message = error.message ?? "";
  const forbidden = message.includes("FORBIDDEN");
  const notFound = message.includes("NOT_FOUND");
  const conflict =
    message.includes("CONFLICT") ||
    message.includes("IN_PROGRESS") ||
    error.code === "PT409" ||
    error.code === "40001";
  const invalid = message.includes("INVALID") || error.code === "22023" || error.code === "23514";
  const status = forbidden ? 403 : notFound ? 404 : conflict ? 409 : invalid ? 422 : 500;
  return json(req, {
    error: forbidden
      ? "Ação indisponível ou sem permissão."
      : notFound
        ? "Tarefa não encontrada."
        : conflict
          ? "A tarefa mudou; atualize a inbox."
          : invalid
            ? "Dados da colaboração inválidos."
            : "Falha na colaboração.",
    code: message.match(/CMS_[A-Z0-9_]+/)?.[0] ?? "CMS_COLLABORATION_FAILURE",
    correlationId,
  }, status);
});
