import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { z } from "npm:zod@4.4.3";
import { authenticateCms } from "../_shared/cms-auth.ts";
import { boundedFetch } from "../_shared/cms-edge-fetch.ts";
import {
  isConfiguredCmsEnvironment,
  isProductionOperationEnabled,
} from "../_shared/ev2-environment.ts";
import {
  clientAddress,
  corsHeaders,
  isAllowedOrigin,
  json,
  rateLimitKeyHash,
  readJsonLimited,
  sha256,
} from "../_shared/security.ts";

const Uuid = z.uuid();
const Environment = z.enum(["local", "staging", "production"]);
const Envelope = z
  .object({
    schemaVersion: z.literal(1),
    commandId: Uuid,
    correlationId: Uuid,
    occurredAt: z.iso.datetime(),
    actorContext: z
      .object({
        environment: Environment,
        siteKey: z.literal("main"),
      })
      .strict(),
  })
  .strict();

const MetricValue = z.union([z.number().finite(), z.boolean(), z.null()]);
const Metrics = z
  .record(z.string().regex(/^[a-z][a-zA-Z0-9]{1,79}$/), MetricValue)
  .refine((value) => Object.keys(value).length >= 7 && Object.keys(value).length <= 100, {
    message: "Conjunto de métricas inválido.",
  });

const AssuranceReport = z
  .object({
    suiteKey: z.string().regex(/^g11-[a-z0-9-]{3,80}$/),
    candidateSha: z.string().regex(/^[0-9a-f]{40}$/),
    startedAt: z.iso.datetime(),
    finishedAt: z.iso.datetime(),
    totalChecks: z.number().int().min(1).max(10000),
    passedChecks: z.number().int().min(0).max(10000),
    p0Count: z.number().int().min(0).max(10000),
    p1Count: z.number().int().min(0).max(10000),
    accessibilityCritical: z.number().int().min(0).max(10000),
    accessibilitySerious: z.number().int().min(0).max(10000),
    securityStatus: z.enum(["passed", "failed"]),
    restoreStatus: z.enum(["passed", "failed"]),
    metrics: Metrics,
    evidenceHash: z.string().regex(/^[0-9a-f]{64}$/),
    syntheticOnly: z.literal(true),
    realDataUsed: z.literal(false),
  })
  .strict()
  .superRefine((report, context) => {
    if (report.passedChecks > report.totalChecks)
      context.addIssue({ code: "custom", path: ["passedChecks"], message: "Contagem inválida." });
    const elapsed = Date.parse(report.finishedAt) - Date.parse(report.startedAt);
    if (elapsed < 0 || elapsed > 6 * 60 * 60 * 1000)
      context.addIssue({ code: "custom", path: ["finishedAt"], message: "Janela inválida." });
    for (const key of [
      "availabilityPercent",
      "adminReadP95Ms",
      "commandP95Ms",
      "outboxLagP95Ms",
      "auditCoveragePercent",
      "restoreRpoMinutes",
      "restoreRtoMinutes",
    ]) {
      if (typeof report.metrics[key] !== "number")
        context.addIssue({ code: "custom", path: ["metrics", key], message: "Métrica obrigatória." });
    }
  });

const SystemRequest = z.discriminatedUnion("action", [
  z.object({ envelope: Envelope, action: z.literal("capability") }).strict(),
  z.object({ envelope: Envelope, action: z.literal("snapshot") }).strict(),
  z.object({ envelope: Envelope, action: z.literal("record_run"), report: AssuranceReport }).strict(),
  z
    .object({
      envelope: Envelope,
      action: z.literal("review_run"),
      runId: Uuid,
      accept: z.boolean(),
      rationale: z.string().trim().min(3).max(500),
    })
    .strict(),
]);

type SystemCommand = z.infer<typeof SystemRequest>;

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

function authenticatedSystemClient(req: Request) {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!url || !anonKey || !/^Bearer\s+[^\s]+$/i.test(authHeader)) return null;
  return createClient(url, anonKey, {
    global: { fetch: boundedFetch(), headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

function errorResponse(req: Request, error: { message?: string; code?: string }, correlationId: string) {
  const databaseMarker = error.message?.match(/CMS_[A-Z0-9_]+/)?.[0];
  const unauthorized =
    databaseMarker === "CMS_SYSTEM_AUTH_INVALID" ||
    error.code === "PGRST301" ||
    /(?:invalid|expired).*jwt|jwt.*(?:invalid|expired)/i.test(error.message ?? "");
  const marker = unauthorized ? "CMS_SYSTEM_AUTH_INVALID" : (databaseMarker ?? "CMS_SYSTEM_FAILURE");
  const notFound = marker.endsWith("NOT_FOUND") || error.code === "PT404";
  const conflict = marker.includes("CONFLICT") || marker.includes("NOT_REVIEWABLE") || error.code === "PT409";
  const rateLimited = marker === "CMS_RATE_LIMIT_EXCEEDED" || error.code === "PT429";
  const forbidden = marker.includes("FORBIDDEN") || marker.includes("FEATURE_DISABLED") || error.code === "42501";
  const invalid = marker.includes("INVALID") || error.code === "22023" || error.code === "23514";
  const status = unauthorized
    ? 401
    : notFound
      ? 404
      : conflict
        ? 409
        : rateLimited
          ? 429
          : forbidden
            ? 403
            : invalid
              ? 422
              : 500;
  const message = unauthorized
    ? "Sessão inválida."
    : notFound
    ? "Registro de garantia não encontrado."
    : conflict
      ? "A operação conflita com o estado atual ou exige outro revisor."
      : rateLimited
        ? "Muitas operações. Aguarde."
        : forbidden
          ? "Garantia sistêmica não habilitada ou permissão insuficiente."
          : invalid
            ? "Relatório ou comando de garantia inválido."
            : "Falha na garantia sistêmica.";
  return json(req, { error: message, code: marker, correlationId }, status);
}

Deno.serve(async (req) => {
  const requestStartedAt = performance.now();
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (!isAllowedOrigin(req)) return json(req, { error: "Origem não autorizada." }, 403);
  if (req.method !== "POST") return json(req, { error: "Método não permitido." }, 405);

  let command: SystemCommand;
  try {
    command = SystemRequest.parse(await readJsonLimited(req, 65536));
  } catch {
    return json(req, { error: "Comando de garantia inválido." }, 400);
  }
  const { environment, siteKey } = command.envelope.actorContext;
  const correlationId = command.envelope.correlationId;
  const deploymentEnvironment = Deno.env.get("CMS_ENVIRONMENT");
  if (!isConfiguredCmsEnvironment(deploymentEnvironment))
    return json(
      req,
      { error: "Ambiente do CMS não configurado.", code: "CMS_SYSTEM_ENVIRONMENT_UNAVAILABLE", correlationId },
      503,
    );
  if (
    environment !== deploymentEnvironment ||
    (environment === "production" && !isProductionOperationEnabled(environment))
  )
    return json(
      req,
      { error: "EV2.11 não está autorizada neste ambiente.", code: "CMS_SYSTEM_PRODUCTION_GATED", correlationId },
      403,
    );
  if (Math.abs(Date.now() - Date.parse(command.envelope.occurredAt)) > 5 * 60 * 1000)
    return json(req, { error: "Envelope expirado.", code: "CMS_SYSTEM_ENVELOPE_EXPIRED", correlationId }, 409);

  if (command.action === "snapshot") {
    const caller = authenticatedSystemClient(req);
    if (!caller) return json(req, { error: "Sessão inválida." }, 401);
    const { data, error } = await caller.rpc("cms_get_system_snapshot_authenticated", {
      p_environment: environment,
      p_site_key: siteKey,
      p_correlation_id: correlationId,
    });
    if (error) return errorResponse(req, error, correlationId);
    return json(req, data, 200, {
      "Server-Timing": `admin-read;dur=${Math.round(performance.now() - requestStartedAt)}`,
    });
  }

  const identity = await authenticateCms(req);
  if (!identity) return json(req, { error: "Sessão inválida." }, 401);

  let rateLimitHash: string;
  try {
    rateLimitHash = await rateLimitKeyHash(
      `cms_system_${command.action}`,
      `${identity.user.id}:${clientAddress(req)}`,
    );
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
    p_rate_limit_key_hash: rateLimitHash,
  };

  if (command.action === "capability") {
    const { data, error } = await identity.admin.rpc("cms_system_capability_limited", common);
    if (error) return errorResponse(req, error, correlationId);
    return json(req, data, 200, {
      "Server-Timing": `admin-read;dur=${Math.round(performance.now() - requestStartedAt)}`,
    });
  }
  if (identity.claims.aal !== "aal2")
    return json(req, { error: "Confirme o MFA para continuar.", code: "CMS_SYSTEM_MFA_REQUIRED", correlationId }, 403);
  const idempotencyKey = req.headers.get("X-Idempotency-Key") ?? "";
  if (!Uuid.safeParse(idempotencyKey).success)
    return json(req, { error: "Chave idempotente obrigatória.", correlationId }, 400);

  const requestHash = await sha256(JSON.stringify(canonicalize(command)));
  const payload = command.action === "record_run"
    ? command.report
    : { runId: command.runId, accept: command.accept, rationale: command.rationale };
  const { data, error } = await identity.admin.rpc("cms_execute_system_command_limited", {
    ...common,
    p_action: command.action,
    p_payload: payload,
    p_command_id: command.envelope.commandId,
    p_correlation_id: correlationId,
    p_idempotency_key: idempotencyKey,
    p_request_hash: requestHash,
  });
  if (error) return errorResponse(req, error, correlationId);
  return json(req, data, 200, {
    "Server-Timing": `command;dur=${Math.round(performance.now() - requestStartedAt)}`,
  });
});
