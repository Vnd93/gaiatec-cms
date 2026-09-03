import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { z } from "npm:zod@4.4.3";
import { authenticateCms } from "../_shared/cms-auth.ts";
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
const Target = z
  .object({
    id: Uuid,
    revisionId: Uuid.optional(),
    expectedVersion: z.number().int().positive().optional(),
  })
  .strict();
const BulkRequest = z
  .object({
    envelope: Envelope,
    action: z.enum(["capability", "list", "dry_run", "execute", "cancel"]),
    operation: z.enum(["add_to_release", "assign_tasks", "resolve_tasks"]).optional(),
    targets: z.array(Target).min(1).max(500).optional(),
    changes: z
      .object({ releaseId: Uuid.optional(), assignedTo: Uuid.optional() })
      .strict()
      .optional(),
    reason: z.string().trim().min(3).max(500).optional(),
    jobId: Uuid.optional(),
    expectedVersion: z.number().int().positive().optional(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .strict()
  .superRefine((command, context) => {
    if (command.action === "dry_run" && (!command.operation || !command.targets || !command.reason))
      context.addIssue({ code: "custom", path: ["targets"], message: "dry-run input required" });
    if (["execute", "cancel"].includes(command.action) && (!command.jobId || !command.expectedVersion))
      context.addIssue({ code: "custom", path: ["jobId"], message: "job and version required" });
    if (command.operation === "add_to_release") {
      if (!command.changes?.releaseId || command.targets?.some((target) => !target.revisionId))
        context.addIssue({ code: "custom", path: ["changes", "releaseId"], message: "release and revisions required" });
    }
    if (command.operation === "assign_tasks") {
      if (!command.changes?.assignedTo || command.targets?.some((target) => !target.expectedVersion))
        context.addIssue({ code: "custom", path: ["changes", "assignedTo"], message: "assignee and versions required" });
    }
    if (command.operation === "resolve_tasks" && command.targets?.some((target) => !target.expectedVersion))
      context.addIssue({ code: "custom", path: ["targets"], message: "versions required" });
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
  let command: z.infer<typeof BulkRequest>;
  try {
    command = BulkRequest.parse(await readJsonLimited(req, 256 * 1024));
  } catch {
    return json(req, { error: "Operação em massa inválida.", code: "CMS_BULK_COMMAND_INVALID" }, 400);
  }
  const { environment, siteKey } = command.envelope.actorContext;
  const correlationId = command.envelope.correlationId;
  if (environment === "production")
    return json(req, { error: "Produção não está disponível nesta fase.", code: "CMS_BULK_PRODUCTION_GATED", correlationId }, 403);
  const configuredEnvironment = Deno.env.get("CMS_ENVIRONMENT");
  if (!configuredEnvironment || !["local", "staging"].includes(configuredEnvironment))
    return json(req, { error: "Ambiente do CMS não configurado.", correlationId }, 503);
  if (configuredEnvironment !== environment || siteKey !== "main")
    return json(req, { error: "Escopo do comando não autorizado.", code: "CMS_BULK_SCOPE_MISMATCH", correlationId }, 403);
  const occurredAt = Date.parse(command.envelope.occurredAt);
  if (occurredAt < Date.now() - 15 * 60_000 || occurredAt > Date.now() + 5 * 60_000)
    return json(req, { error: "Comando expirado ou futuro.", code: "CMS_BULK_COMMAND_STALE", correlationId }, 409);
  try {
    const allowed = await consumeRateLimit(
      identity.admin,
      req,
      `cms_bulk_${command.action}`,
      `${identity.user.id}:${clientAddress(req)}`,
      30,
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
    const { data, error } = await identity.admin.rpc("cms_get_bulk_jobs", { ...common, p_limit: command.limit ?? 50 });
    if (!error) return json(req, { ...data, correlationId });
    const forbidden = error.message.includes("FORBIDDEN");
    return json(req, { error: forbidden ? "Sem permissão para consultar lotes." : "Lotes indisponíveis.", correlationId }, forbidden ? 403 : 503);
  }
  const idempotencyKey = req.headers.get("X-Idempotency-Key");
  if (!idempotencyKey || !Uuid.safeParse(idempotencyKey).success)
    return json(req, { error: "Chave idempotente obrigatória.", correlationId }, 400);
  const requestHash = await sha256(JSON.stringify(canonicalize(command)));
  const { data, error } = await identity.admin.rpc("cms_execute_bulk_command", {
    ...common,
    p_action: command.action,
    p_payload: {
      operation: command.operation,
      targets: command.targets,
      changes: command.changes,
      reason: command.reason,
      jobId: command.jobId,
      expectedVersion: command.expectedVersion,
    },
    p_command_id: command.envelope.commandId,
    p_idempotency_key: idempotencyKey,
    p_request_hash: requestHash,
    p_correlation_id: correlationId,
  });
  if (!error) return json(req, data, command.action === "dry_run" ? 200 : 202);
  const message = error.message ?? "";
  const forbidden = message.includes("FORBIDDEN");
  const notFound = message.includes("NOT_FOUND");
  const conflict = message.includes("CONFLICT") || message.includes("IN_PROGRESS") || error.code === "40001";
  const invalid = message.includes("INVALID") || message.includes("TRANSITION") || error.code === "22023" || error.code === "23514";
  const status = forbidden ? 403 : notFound ? 404 : conflict ? 409 : invalid ? 422 : 500;
  return json(req, {
    error: forbidden
      ? "Ação em massa indisponível ou sem permissão."
      : notFound
        ? "Job não encontrado."
        : conflict
          ? "O lote ou um alvo mudou; execute novo dry-run."
          : invalid
            ? "O lote não atende às regras de execução."
            : "Falha na operação em massa.",
    code: message.match(/CMS_[A-Z0-9_]+/)?.[0] ?? "CMS_BULK_FAILURE",
    correlationId,
  }, status);
});
