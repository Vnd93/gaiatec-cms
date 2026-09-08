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
const Environment = z.enum(["local", "staging", "production"]);
const ActorContext = z
  .object({
    environment: Environment,
    siteKey: z.string().regex(/^[a-z][a-z0-9_-]{1,63}$/),
  })
  .strict();
const Envelope = z
  .object({
    schemaVersion: z.literal(1),
    commandId: Uuid,
    correlationId: Uuid,
    occurredAt: z.iso.datetime(),
    actorContext: ActorContext,
    expectedVersion: z.number().int().positive().optional(),
  })
  .strict();
const ReleaseCommand = z
  .object({
    envelope: Envelope,
    action: z.enum(["create", "status", "cancel", "rollback"]),
    releaseId: Uuid.optional(),
    reason: z.string().trim().min(3).max(500),
  })
  .strict()
  .superRefine((command, context) => {
    if (command.action === "create" && command.releaseId) {
      context.addIssue({ code: "custom", path: ["releaseId"], message: "unexpected releaseId" });
    }
    if (command.action !== "create" && !command.releaseId) {
      context.addIssue({ code: "custom", path: ["releaseId"], message: "releaseId required" });
    }
    if (["cancel", "rollback"].includes(command.action) && !command.envelope.expectedVersion) {
      context.addIssue({
        code: "custom",
        path: ["envelope", "expectedVersion"],
        message: "expectedVersion required",
      });
    }
  });

const ComposedEnvelope = z
  .object({
    schemaVersion: z.literal(2),
    commandId: Uuid,
    correlationId: Uuid,
    occurredAt: z.iso.datetime(),
    actorContext: ActorContext,
    expectedVersion: z.number().int().positive().optional(),
  })
  .strict();
const ComposedReleaseCommand = z
  .object({
    envelope: ComposedEnvelope,
    action: z.enum([
      "list",
      "status",
      "create",
      "add_item",
      "validate",
      "submit",
      "approve",
      "schedule",
      "publish",
      "cancel",
      "rollback",
    ]),
    releaseId: Uuid.optional(),
    title: z.string().trim().min(3).max(160).optional(),
    reason: z.string().trim().min(3).max(500).optional(),
    itemId: Uuid.optional(),
    revisionId: Uuid.optional(),
    dependencyIds: z.array(Uuid).max(100).default([]),
    expiresAt: z.iso.datetime().optional(),
    scheduledFor: z.iso.datetime().optional(),
  })
  .strict()
  .superRefine((command, context) => {
    if (command.action === "create" && (!command.title || !command.reason)) {
      context.addIssue({ code: "custom", path: ["title"], message: "title and reason required" });
    }
    if (command.action === "add_item" && (!command.itemId || !command.revisionId)) {
      context.addIssue({ code: "custom", path: ["itemId"], message: "item and revision required" });
    }
    if (command.action === "schedule" && !command.scheduledFor) {
      context.addIssue({ code: "custom", path: ["scheduledFor"], message: "schedule required" });
    }
    if (command.action === "approve" && !command.reason) {
      context.addIssue({ code: "custom", path: ["reason"], message: "reason required" });
    }
    if (!["list", "create"].includes(command.action) && !command.releaseId) {
      context.addIssue({ code: "custom", path: ["releaseId"], message: "release required" });
    }
    if (!["list", "status", "create"].includes(command.action) && !command.envelope.expectedVersion) {
      context.addIssue({
        code: "custom",
        path: ["envelope", "expectedVersion"],
        message: "expectedVersion required",
      });
    }
  });
const ReleaseRequest = z.union([ReleaseCommand, ComposedReleaseCommand]);
type ReleaseRequestValue = z.infer<typeof ReleaseRequest>;
type ComposedReleaseCommandValue = z.infer<typeof ComposedReleaseCommand>;

function isComposedReleaseCommand(
  command: ReleaseRequestValue,
): command is ComposedReleaseCommandValue {
  return command.envelope.schemaVersion === 2;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function logReleaseCommand(
  level: "info" | "warn" | "error",
  event: string,
  correlationId: string,
  context: Record<string, unknown>,
) {
  console[level](
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      event,
      correlationId,
      route: "/functions/v1/cms-releases",
      context,
    }),
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (!isAllowedOrigin(req)) return json(req, { error: "Origem não autorizada." }, 403);
  if (req.method !== "POST") return json(req, { error: "Método não permitido." }, 405);

  const identity = await authenticateCms(req);
  if (!identity) return json(req, { error: "Sessão inválida." }, 401);

  let command: ReleaseRequestValue;
  try {
    command = ReleaseRequest.parse(await readJsonLimited(req, 32 * 1024));
  } catch {
    return json(req, { error: "Comando de release inválido.", code: "CMS_RELEASE_COMMAND_INVALID" }, 400);
  }
  const readOnly = isComposedReleaseCommand(command) && ["list", "status"].includes(command.action);
  const idempotencyKey = req.headers.get("X-Idempotency-Key");
  if (!readOnly && (!idempotencyKey || !Uuid.safeParse(idempotencyKey).success)) {
    return json(req, { error: "Chave idempotente obrigatória." }, 400);
  }

  const { environment, siteKey } = command.envelope.actorContext;
  const correlationId = command.envelope.correlationId;
  if (environment === "production" && !isProductionOperationEnabled(environment)) {
    logReleaseCommand("warn", "release.command.denied", correlationId, {
      action: command.action,
      environment,
      reason:
        command.envelope.schemaVersion === 2
          ? "production_not_available_in_ev2_7"
          : "production_not_available_in_ev2_1",
    });
    return json(
      req,
      { error: "Produção não está disponível nesta fase.", code: "CMS_RELEASE_PRODUCTION_GATED", correlationId },
      403,
    );
  }
  const configuredEnvironment = Deno.env.get("CMS_ENVIRONMENT");
  if (!isConfiguredCmsEnvironment(configuredEnvironment)) {
    return json(req, { error: "Ambiente do CMS não configurado.", correlationId }, 503);
  }
  if (environment !== configuredEnvironment || siteKey !== "main") {
    logReleaseCommand("warn", "release.command.denied", correlationId, {
      action: command.action,
      reason: "server_scope_mismatch",
    });
    return json(
      req,
      { error: "Escopo do comando não autorizado.", code: "CMS_RELEASE_SCOPE_MISMATCH", correlationId },
      403,
    );
  }
  const occurredAt = Date.parse(command.envelope.occurredAt);
  if (occurredAt < Date.now() - 15 * 60_000 || occurredAt > Date.now() + 5 * 60_000) {
    return json(
      req,
      { error: "Comando expirado ou datado no futuro.", code: "CMS_RELEASE_COMMAND_STALE", correlationId },
      409,
    );
  }
  try {
    const allowed = await consumeRateLimit(
      identity.admin,
      req,
      `cms_releases_${command.action}`,
      `${identity.user.id}:${clientAddress(req)}`,
      60,
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

  if (isComposedReleaseCommand(command)) {
    let data: Record<string, unknown> | null = null;
    let error: { message: string; code?: string } | null = null;
    if (readOnly) {
      const result = await identity.admin.rpc("cms_get_release_workspace", {
        ...common,
        p_release_id: command.releaseId ?? null,
      });
      data = result.data
        ? {
            ...(result.data as Record<string, unknown>),
            commandId: command.envelope.commandId,
            correlationId,
          }
        : null;
      error = result.error;
    } else {
      const requestHash = await sha256(JSON.stringify(canonicalize(command)));
      const result = await identity.admin.rpc("cms_execute_release_v2_command", {
        ...common,
        p_action: command.action,
        p_payload: {
          releaseId: command.releaseId,
          expectedVersion: command.envelope.expectedVersion,
          title: command.title,
          reason: command.reason,
          itemId: command.itemId,
          revisionId: command.revisionId,
          dependencyIds: command.dependencyIds,
          expiresAt: command.expiresAt,
          scheduledFor: command.scheduledFor,
        },
        p_command_id: command.envelope.commandId,
        p_idempotency_key: idempotencyKey,
        p_request_hash: requestHash,
        p_correlation_id: correlationId,
      });
      data = result.data;
      error = result.error;
    }
    if (error) {
      const message = error.message ?? "";
      const forbidden = message.includes("FORBIDDEN") || message.includes("FEATURE_DISABLED");
      const notFound = message.includes("NOT_FOUND");
      const conflict =
        message.includes("CONFLICT") ||
        message.includes("PLAN_CHANGED") ||
        message.includes("IN_PROGRESS") ||
        error.code === "PT409" ||
        error.code === "40001";
      const invalid =
        message.includes("INVALID") ||
        message.includes("REQUIRED") ||
        message.includes("NOT_APPROVED") ||
        message.includes("SEGREGATION") ||
        error.code === "22023" ||
        error.code === "23514";
      const status = forbidden ? 403 : notFound ? 404 : conflict ? 409 : invalid ? 422 : 500;
      const knownCode = message.match(/CMS_[A-Z0-9_]+/)?.[0] ?? "CMS_RELEASE_V2_FAILURE";
      logReleaseCommand(status >= 500 ? "error" : "warn", "release.v2.command.failed", correlationId, {
        action: command.action,
        environment,
        code: knownCode,
        status,
      });
      return json(
        req,
        {
          error: forbidden
            ? "Capacidade indisponível ou sem permissão."
            : notFound
              ? "Release ou item não encontrado."
              : conflict
                ? "O pacote mudou; atualize antes de tentar novamente."
                : invalid
                  ? "O release não atende às regras desta transição."
                  : "Falha no release composto.",
          code: knownCode,
          correlationId,
        },
        status,
      );
    }
    logReleaseCommand("info", "release.v2.command.completed", correlationId, {
      action: command.action,
      environment,
      status: data?.status,
    });
    return json(req, data);
  }

  let data: Record<string, unknown> | null = null;
  let error: { message: string; code?: string } | null = null;
  if (command.action === "status") {
    const result = await identity.admin.rpc("cms_get_release_package", {
      ...common,
      p_release_id: command.releaseId,
    });
    data = result.data
      ? {
          ...(result.data as Record<string, unknown>),
          commandId: command.envelope.commandId,
          correlationId,
        }
      : null;
    error = result.error;
  } else {
    const requestHash = await sha256(JSON.stringify(canonicalize(command)));
    const result = await identity.admin.rpc("cms_execute_release_command", {
      ...common,
      p_action: command.action,
      p_release_id: command.releaseId ?? null,
      p_expected_version: command.envelope.expectedVersion ?? null,
      p_reason: command.reason,
      p_command_id: command.envelope.commandId,
      p_idempotency_key: idempotencyKey!,
      p_request_hash: requestHash,
      p_correlation_id: correlationId,
    });
    data = result.data;
    error = result.error;
  }

  if (error) {
    const message = error.message ?? "";
    const forbidden = message.includes("FORBIDDEN") || message.includes("FEATURE_DISABLED");
    const notFound = message.includes("NOT_FOUND");
    const conflict =
      message.includes("CONFLICT") ||
      message.includes("IN_PROGRESS") ||
      error.code === "PT409" ||
      error.code === "40001";
    const invalid = message.includes("INVALID") || message.includes("TRANSITION") || error.code === "22023";
    const status = forbidden ? 403 : notFound ? 404 : conflict ? 409 : invalid ? 422 : 500;
    const code =
      [
        "CMS_RELEASE_FEATURE_DISABLED",
        "CMS_RELEASE_FORBIDDEN",
        "CMS_RELEASE_NOT_FOUND",
        "CMS_RELEASE_CONFLICT",
        "CMS_RELEASE_IDEMPOTENCY_CONFLICT",
        "CMS_RELEASE_COMMAND_IN_PROGRESS",
        "CMS_RELEASE_TRANSITION_INVALID",
        "CMS_RELEASE_COMMAND_INVALID",
      ].find((candidate) => message.includes(candidate)) ?? "CMS_RELEASE_FAILURE";
    logReleaseCommand(status >= 500 ? "error" : "warn", "release.command.failed", correlationId, {
      action: command.action,
      environment,
      code,
      status,
    });
    return json(
      req,
      {
        error: forbidden
          ? "Operação indisponível ou sem permissão."
          : notFound
            ? "Release não encontrado."
            : conflict
              ? "O release foi alterado ou a chave idempotente conflita."
              : invalid
                ? "Transição de release inválida."
                : "Falha no release.",
        code,
        correlationId,
      },
      status,
    );
  }

  logReleaseCommand("info", "release.command.completed", correlationId, {
    action: command.action,
    environment,
    status: data?.status,
  });
  return json(req, data);
});
