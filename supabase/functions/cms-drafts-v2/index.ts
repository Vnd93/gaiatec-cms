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
const Environment = z.enum(["local", "staging", "production"]);
const ContentType = z.enum([
  "product",
  "service",
  "industry",
  "application",
  "solution",
  "post",
  "page",
  "homepage",
  "navigation",
  "site_settings",
  "placement",
  "campaign",
]);
const FieldKey = z
  .string()
  .regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/)
  .refine((key) => !["__proto__", "constructor", "prototype"].includes(key));
const Envelope = z
  .object({
    schemaVersion: z.literal(1),
    commandId: Uuid,
    correlationId: Uuid,
    occurredAt: z.iso.datetime(),
    actorContext: z
      .object({
        environment: Environment,
        siteKey: z.string().regex(/^[a-z][a-z0-9_-]{1,63}$/),
      })
      .strict(),
    expectedVersion: z.number().int().positive().optional(),
  })
  .strict();
const SetPatch = z
  .object({ operation: z.literal("set"), path: z.tuple([FieldKey]), value: z.json() })
  .strict();
const RemovePatch = z
  .object({ operation: z.literal("remove"), path: z.tuple([FieldKey]) })
  .strict();
const Patch = z.discriminatedUnion("operation", [SetPatch, RemovePatch]);
const Command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("capability"), envelope: Envelope }).strict(),
  z.object({ action: z.literal("resume"), envelope: Envelope, contentType: ContentType }).strict(),
  z.object({ action: z.literal("get"), envelope: Envelope, draftId: Uuid }).strict(),
  z
    .object({
      action: z.literal("create"),
      envelope: Envelope,
      contentType: ContentType,
      workingTitle: z.string().trim().max(180).default(""),
    })
    .strict(),
  z
    .object({
      action: z.literal("patch"),
      envelope: Envelope,
      draftId: Uuid,
      workingTitle: z.string().trim().max(180).optional(),
      patches: z.array(Patch).max(100),
    })
    .strict()
    .superRefine((command, context) => {
      if (!command.envelope.expectedVersion) {
        context.addIssue({ code: "custom", path: ["envelope", "expectedVersion"], message: "required" });
      }
      if (!command.patches.length && command.workingTitle === undefined) {
        context.addIssue({ code: "custom", path: ["patches"], message: "required" });
      }
    }),
  z
    .object({
      action: z.literal("discard"),
      envelope: Envelope,
      draftId: Uuid,
      reason: z.string().trim().min(3).max(500),
    })
    .strict()
    .superRefine((command, context) => {
      if (!command.envelope.expectedVersion) {
        context.addIssue({ code: "custom", path: ["envelope", "expectedVersion"], message: "required" });
      }
    }),
]);

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

function logDraft(
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
      route: "/functions/v1/cms-drafts-v2",
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

  let command: z.infer<typeof Command>;
  try {
    command = Command.parse(await readJsonLimited(req, 1150 * 1024));
  } catch {
    return json(req, { error: "Comando de rascunho inválido.", code: "CMS_DRAFT_V2_COMMAND_INVALID" }, 400);
  }

  const { environment, siteKey } = command.envelope.actorContext;
  const correlationId = command.envelope.correlationId;
  const configuredEnvironment = Deno.env.get("CMS_ENVIRONMENT");
  if (environment === "production") {
    logDraft("warn", "draft_v2.command.denied", correlationId, {
      action: command.action,
      reason: "production_not_available_in_ev2_2",
    });
    return json(
      req,
      { error: "Produção não está disponível nesta fase.", code: "CMS_DRAFT_V2_PRODUCTION_GATED", correlationId },
      403,
    );
  }
  if (!configuredEnvironment || !["local", "staging"].includes(configuredEnvironment)) {
    return json(req, { error: "Ambiente do CMS não configurado.", correlationId }, 503);
  }
  if (environment !== configuredEnvironment || siteKey !== "main") {
    return json(
      req,
      { error: "Escopo do comando não autorizado.", code: "CMS_DRAFT_V2_SCOPE_MISMATCH", correlationId },
      403,
    );
  }
  const occurredAt = Date.parse(command.envelope.occurredAt);
  if (occurredAt < Date.now() - 15 * 60_000 || occurredAt > Date.now() + 5 * 60_000) {
    return json(
      req,
      { error: "Comando expirado ou datado no futuro.", code: "CMS_DRAFT_V2_COMMAND_STALE", correlationId },
      409,
    );
  }

  try {
    const allowed = await consumeRateLimit(
      identity.admin,
      req,
      `cms_drafts_v2_${command.action}`,
      `${identity.user.id}:${clientAddress(req)}`,
      command.action === "patch" ? 180 : 60,
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
      ...common,
      p_flag_key: "ev2.draft_v2",
    });
    if (error) return json(req, { error: "Capacidade indisponível.", correlationId }, 503);
    return json(req, { ...data, commandId: command.envelope.commandId, correlationId });
  }

  if (command.action === "get" || command.action === "resume") {
    const { data, error } = await identity.admin.rpc("cms_get_draft_v2", {
      ...common,
      p_draft_id: command.action === "get" ? command.draftId : null,
      p_content_type: command.action === "resume" ? command.contentType : null,
    });
    if (!error) {
      return json(req, {
        schemaVersion: 1,
        commandId: command.envelope.commandId,
        correlationId,
        draft: data ?? null,
      });
    }
    const notFound = error.message.includes("NOT_FOUND");
    const forbidden = error.message.includes("FORBIDDEN") || error.message.includes("FEATURE_DISABLED");
    return json(
      req,
      {
        error: forbidden ? "Operação indisponível ou sem permissão." : "Rascunho não encontrado.",
        code: forbidden ? "CMS_DRAFT_V2_FEATURE_DISABLED" : "CMS_DRAFT_V2_NOT_FOUND",
        correlationId,
      },
      forbidden ? 403 : notFound ? 404 : 500,
    );
  }

  const idempotencyKey = req.headers.get("X-Idempotency-Key");
  if (!idempotencyKey || !Uuid.safeParse(idempotencyKey).success) {
    return json(req, { error: "Chave idempotente obrigatória.", correlationId }, 400);
  }

  const requestHash = await sha256(JSON.stringify(canonicalize(command)));
  const { data, error } = await identity.admin.rpc("cms_execute_draft_v2_command", {
    ...common,
    p_action: command.action,
    p_draft_id: command.action === "create" ? null : command.draftId,
    p_content_type: command.action === "create" ? command.contentType : null,
    p_working_title:
      command.action === "create" || command.action === "patch" ? command.workingTitle ?? null : null,
    p_patch: command.action === "patch" ? command.patches : null,
    p_reason: command.action === "discard" ? command.reason : null,
    p_expected_version: command.envelope.expectedVersion ?? null,
    p_command_id: command.envelope.commandId,
    p_idempotency_key: idempotencyKey,
    p_request_hash: requestHash,
    p_correlation_id: correlationId,
  });

  if (error) {
    const message = error.message ?? "";
    const forbidden = message.includes("FORBIDDEN") || message.includes("FEATURE_DISABLED");
    const notFound = message.includes("NOT_FOUND");
    const conflict = message.includes("CONFLICT") || error.code === "40001" || error.code === "23505";
    const tooLarge = message.includes("TOO_LARGE") || error.code === "22001";
    const invalid = message.includes("INVALID") || error.code === "22023";
    const status = forbidden ? 403 : notFound ? 404 : conflict ? 409 : tooLarge ? 413 : invalid ? 422 : 500;
    const code =
      [
        "CMS_DRAFT_V2_FEATURE_DISABLED",
        "CMS_DRAFT_V2_FORBIDDEN",
        "CMS_DRAFT_V2_NOT_FOUND",
        "CMS_DRAFT_V2_CONFLICT",
        "CMS_DRAFT_V2_IDEMPOTENCY_CONFLICT",
        "CMS_DRAFT_V2_PATCH_INVALID",
        "CMS_DRAFT_V2_TOO_LARGE",
        "CMS_DRAFT_V2_COMMAND_INVALID",
      ].find((candidate) => message.includes(candidate)) ?? "CMS_DRAFT_V2_FAILURE";

    let currentVersion: number | undefined;
    let diffRef: string | undefined;
    if (conflict && command.action !== "create") {
      const [draftResult, eventResult] = await Promise.all([
        identity.admin.from("cms_content_drafts_v2").select("lock_version").eq("id", command.draftId).maybeSingle(),
        identity.admin
          .from("cms_draft_v2_events")
          .select("id")
          .eq("draft_id", command.draftId)
          .order("occurred_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      currentVersion = draftResult.data?.lock_version;
      diffRef = eventResult.data?.id;
    }
    logDraft(status >= 500 ? "error" : "warn", "draft_v2.command.failed", correlationId, {
      action: command.action,
      code,
      status,
    });
    return json(
      req,
      {
        error: forbidden
          ? "Operação indisponível ou sem permissão."
          : notFound
            ? "Rascunho não encontrado."
            : conflict
              ? "Há uma versão mais recente deste rascunho."
              : tooLarge
                ? "O rascunho ultrapassou o limite permitido."
                : invalid
                  ? "Alterações de rascunho inválidas."
                  : "Falha ao sincronizar o rascunho.",
        code,
        correlationId,
        preserved: true,
        ...(currentVersion ? { currentVersion } : {}),
        ...(diffRef ? { diffRef } : {}),
      },
      status,
    );
  }

  logDraft("info", "draft_v2.command.completed", correlationId, {
    action: command.action,
    status: data?.status,
    lockVersion: data?.lockVersion,
  });
  return json(req, data);
});
