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
const RoleKey = z.string().regex(/^[a-z][a-z0-9_]{1,63}$/);
const PermissionKey = z.string().regex(/^cms:[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/);
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

const ScopedAccessRequest = z
  .object({
    envelope: Envelope,
    action: z.enum(["capability", "list", "decisions", "evaluate", "grant", "revoke"]),
    targetUserId: Uuid.optional(),
    roleKey: RoleKey.optional(),
    grantType: z.enum(["direct", "delegated"]).optional(),
    expiresAt: z.iso.datetime({ offset: true }).nullable().optional(),
    reason: z.string().trim().min(3).max(500).optional(),
    expectedVersion: z.number().int().positive().optional(),
    permissionKey: PermissionKey.optional(),
    targetType: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/).optional(),
    targetId: z.string().trim().min(1).max(200).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .strict()
  .superRefine((command, context) => {
    if (command.action === "evaluate" && !command.permissionKey)
      context.addIssue({ code: "custom", path: ["permissionKey"], message: "permission required" });
    if (command.action === "grant") {
      if (!command.targetUserId || !command.roleKey || !command.grantType || !command.reason)
        context.addIssue({ code: "custom", path: ["targetUserId"], message: "grant input required" });
      if (command.grantType === "delegated" && !command.expiresAt)
        context.addIssue({ code: "custom", path: ["expiresAt"], message: "delegation expiry required" });
      if (command.grantType === "direct" && command.expiresAt)
        context.addIssue({ code: "custom", path: ["expiresAt"], message: "direct grants do not expire" });
    }
    if (
      command.action === "revoke" &&
      (!command.targetUserId || !command.roleKey || !command.reason || !command.expectedVersion)
    )
      context.addIssue({ code: "custom", path: ["expectedVersion"], message: "revoke input required" });
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

  let command: z.infer<typeof ScopedAccessRequest>;
  try {
    command = ScopedAccessRequest.parse(await readJsonLimited(req, 32 * 1024));
  } catch {
    return json(req, { error: "Comando de acesso inválido.", code: "CMS_SCOPE_COMMAND_INVALID" }, 400);
  }

  const { environment, siteKey } = command.envelope.actorContext;
  const correlationId = command.envelope.correlationId;
  if (environment === "production")
    return json(
      req,
      {
        error: "Produção não está disponível nesta fase.",
        code: "CMS_SCOPE_PRODUCTION_GATED",
        correlationId,
      },
      403,
    );

  const configuredEnvironment = Deno.env.get("CMS_ENVIRONMENT");
  if (!configuredEnvironment || !["local", "staging"].includes(configuredEnvironment))
    return json(req, { error: "Ambiente do CMS não configurado.", correlationId }, 503);
  if (configuredEnvironment !== environment || siteKey !== "main")
    return json(
      req,
      { error: "Escopo do comando não autorizado.", code: "CMS_SCOPE_MISMATCH", correlationId },
      403,
    );

  const occurredAt = Date.parse(command.envelope.occurredAt);
  if (occurredAt < Date.now() - 15 * 60_000 || occurredAt > Date.now() + 5 * 60_000)
    return json(
      req,
      { error: "Comando expirado ou futuro.", code: "CMS_SCOPE_COMMAND_STALE", correlationId },
      409,
    );

  try {
    const mutation = command.action === "grant" || command.action === "revoke";
    const allowed = await consumeRateLimit(
      identity.admin,
      req,
      `cms_scopes_${command.action}`,
      `${identity.user.id}:${clientAddress(req)}`,
      mutation ? 30 : 120,
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
  const { data: capability, error: capabilityError } = await identity.admin.rpc(
    "cms_rbac_scope_capability",
    common,
  );
  if (capabilityError)
    return json(req, { enabled: false, source: "unavailable", correlationId }, 503);
  if (command.action === "capability") return json(req, { ...capability, correlationId });
  if (capability?.enabled !== true)
    return json(
      req,
      {
        error: "A autorização escopada não está habilitada para esta identidade.",
        code: "CMS_RBAC_SCOPED_DISABLED",
        correlationId,
      },
      403,
    );

  const evaluate = async (permission: string) =>
    identity.admin.rpc("cms_evaluate_scoped_permission", {
      ...common,
      p_permission: permission,
      p_target_type: command.targetType ?? (command.targetUserId ? "profile" : null),
      p_target_id: command.targetId ?? command.targetUserId ?? null,
      p_correlation_id: correlationId,
    });

  if (command.action === "evaluate") {
    const { data, error } = await evaluate(command.permissionKey!);
    if (error) {
      const invalid = error.code === "22023" || error.code === "23514";
      return json(
        req,
        { error: "Não foi possível avaliar a permissão.", code: "CMS_POLICY_EVALUATION_FAILED", correlationId },
        invalid ? 422 : 503,
      );
    }
    return json(req, data);
  }

  const requiredPermission =
    command.action === "list"
      ? "cms:scopes.read"
      : command.action === "decisions"
        ? "cms:policy_decisions.read"
        : "cms:scopes.manage";
  const { data: decision, error: decisionError } = await evaluate(requiredPermission);
  if (decisionError)
    return json(req, { error: "Decisão de acesso indisponível.", correlationId }, 503);
  if (decision?.allowed !== true) {
    const mfaRequired = decision?.reasonCode === "mfa_required";
    return json(
      req,
      {
        error: mfaRequired ? "Eleve a sessão com MFA para continuar." : "Operação não autorizada neste escopo.",
        code: mfaRequired ? "CMS_SCOPE_AAL2_REQUIRED" : "CMS_SCOPE_FORBIDDEN",
        reasonCode: decision?.reasonCode,
        decisionId: decision?.decisionId,
        correlationId,
      },
      mfaRequired ? 412 : 403,
    );
  }

  if (command.action === "list") {
    const { data, error } = await identity.admin.rpc("cms_get_scoped_assignments", {
      ...common,
      p_target_user_id: command.targetUserId ?? null,
    });
    return error
      ? json(req, { error: "Concessões indisponíveis.", correlationId }, 503)
      : json(req, { ...data, correlationId });
  }

  if (command.action === "decisions") {
    const { data, error } = await identity.admin.rpc("cms_get_policy_decisions", {
      ...common,
      p_limit: command.limit ?? 50,
    });
    return error
      ? json(req, { error: "Decisões de acesso indisponíveis.", correlationId }, 503)
      : json(req, { ...data, correlationId });
  }

  const idempotencyKey = req.headers.get("X-Idempotency-Key");
  if (!idempotencyKey || !Uuid.safeParse(idempotencyKey).success)
    return json(
      req,
      { error: "Chave idempotente obrigatória.", code: "CMS_SCOPE_IDEMPOTENCY_REQUIRED", correlationId },
      400,
    );

  const requestHash = await sha256(JSON.stringify(canonicalize(command)));
  const { data, error } = await identity.admin.rpc("cms_execute_scope_command", {
    ...common,
    p_action: command.action,
    p_payload: {
      targetUserId: command.targetUserId,
      roleKey: command.roleKey,
      grantType: command.grantType,
      expiresAt: command.expiresAt,
      reason: command.reason,
      expectedVersion: command.expectedVersion,
    },
    p_command_id: command.envelope.commandId,
    p_idempotency_key: idempotencyKey,
    p_request_hash: requestHash,
    p_correlation_id: correlationId,
  });
  if (!error) return json(req, data);

  const message = error.message ?? "";
  const code = message.match(/CMS_[A-Z0-9_]+/)?.[0] ?? "CMS_SCOPE_FAILURE";
  const forbidden = message.includes("FORBIDDEN");
  const notFound = message.includes("NOT_ACTIVE") || error.code === "P0002";
  const conflict =
    message.includes("CONFLICT") ||
    message.includes("SELF_ELEVATION") ||
    message.includes("LAST_SUPER_ADMIN") ||
    message.includes("ALREADY_ACTIVE") ||
    error.code === "PT409";
  const invalid = message.includes("INVALID") || error.code === "22023" || error.code === "23514";
  const status = forbidden ? 403 : notFound ? 404 : conflict ? 409 : invalid ? 422 : 500;
  return json(
    req,
    {
      error: forbidden
        ? "Operação não autorizada neste escopo."
        : notFound
          ? "Concessão ativa não encontrada."
          : conflict
            ? "O acesso mudou ou a operação viola a segregação. Atualize e tente novamente."
            : invalid
              ? "A concessão não atende às regras de segurança."
              : "Não foi possível alterar o acesso.",
      code,
      correlationId,
    },
    status,
  );
});
