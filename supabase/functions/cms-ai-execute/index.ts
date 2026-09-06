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
import { detectAiPromptInjection, redactAiText } from "../_shared/ai-safety.ts";

const EXTERNAL_PROVIDER_ENABLED = false;
const Uuid = z.uuid();
const TargetRef = z.string().regex(/^g14x-[a-z0-9-]{3,100}$/);
const StepKey = z.string().regex(/^step-[a-z0-9-]{3,60}$/);
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

const StepBase = {
  stepKey: StepKey,
  targetRef: TargetRef,
  expectedVersion: z.number().int().positive(),
};
const ExecutionStep = z.discriminatedUnion("toolKey", [
  z
    .object({
      ...StepBase,
      toolKey: z.literal("draft.apply_patch"),
      arguments: z
        .object({ patch: z.object({ summary: z.string().trim().min(3).max(3000) }).strict() })
        .strict(),
    })
    .strict(),
  z.object({ ...StepBase, toolKey: z.literal("workflow.submit"), arguments: z.object({}).strict() }).strict(),
  z
    .object({
      ...StepBase,
      toolKey: z.literal("release.schedule"),
      arguments: z.object({ scheduledAt: z.iso.datetime() }).strict(),
    })
    .strict(),
  z.object({ ...StepBase, toolKey: z.literal("release.publish"), arguments: z.object({}).strict() }).strict(),
  z.object({ ...StepBase, toolKey: z.literal("release.rollback"), arguments: z.object({}).strict() }).strict(),
]);

const AiExecutionRequest = z
  .object({
    envelope: Envelope,
    action: z.enum([
      "capability",
      "workspace",
      "create_target",
      "create_plan",
      "revise_plan",
      "approve_plan",
      "execute_plan",
      "approve_compensation",
      "compensate_run",
      "cancel_plan",
    ]),
    targetRef: TargetRef.optional(),
    targetTitle: z.string().trim().min(3).max(160).optional(),
    targetSummary: z.string().trim().min(3).max(3000).optional(),
    planId: Uuid.optional(),
    runId: Uuid.optional(),
    title: z.string().trim().min(3).max(160).optional(),
    steps: z.array(ExecutionStep).min(1).max(20).optional(),
    expectedPlanHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
    decision: z.enum(["approved", "rejected"]).optional(),
    rationale: z.string().trim().min(3).max(1000).optional(),
  })
  .strict()
  .superRefine((command, context) => {
    const required = (condition: boolean, path: string, message: string) => {
      if (!condition) context.addIssue({ code: "custom", path: [path], message });
    };
    if (command.action === "create_target") {
      required(Boolean(command.targetRef), "targetRef", "Referência sintética obrigatória.");
      required(Boolean(command.targetTitle), "targetTitle", "Título sintético obrigatório.");
      required(Boolean(command.targetSummary), "targetSummary", "Resumo sintético obrigatório.");
    }
    if (command.action === "create_plan") {
      required(Boolean(command.title), "title", "Título do plano obrigatório.");
      required(Boolean(command.steps), "steps", "Etapas do plano obrigatórias.");
    }
    if (command.action === "revise_plan") {
      required(Boolean(command.planId), "planId", "Plano obrigatório.");
      required(Boolean(command.expectedPlanHash), "expectedPlanHash", "Hash atual obrigatório.");
      required(Boolean(command.steps), "steps", "Etapas revisadas obrigatórias.");
    }
    if (command.action === "approve_plan") {
      required(Boolean(command.planId), "planId", "Plano obrigatório.");
      required(Boolean(command.expectedPlanHash), "expectedPlanHash", "Hash atual obrigatório.");
      required(Boolean(command.decision), "decision", "Decisão obrigatória.");
      required(Boolean(command.rationale), "rationale", "Justificativa obrigatória.");
    }
    if (command.action === "execute_plan" || command.action === "cancel_plan") {
      required(Boolean(command.planId), "planId", "Plano obrigatório.");
      required(Boolean(command.expectedPlanHash), "expectedPlanHash", "Hash atual obrigatório.");
    }
    if (command.action === "approve_compensation") {
      required(Boolean(command.runId), "runId", "Execução obrigatória.");
      required(Boolean(command.expectedPlanHash), "expectedPlanHash", "Hash atual obrigatório.");
      required(Boolean(command.rationale), "rationale", "Justificativa obrigatória.");
    }
    if (command.action === "compensate_run") {
      required(Boolean(command.runId), "runId", "Execução obrigatória.");
      required(Boolean(command.expectedPlanHash), "expectedPlanHash", "Hash atual obrigatório.");
    }
  });

type AiExecutionCommand = z.infer<typeof AiExecutionRequest>;

function failureMarker(error: { message?: string }) {
  return error.message?.match(/CMS_AI_EXECUTE_[A-Z0-9_]+/)?.[0] ?? "CMS_AI_EXECUTE_FAILURE";
}

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

function commandPayload(command: AiExecutionCommand): Record<string, unknown> {
  switch (command.action) {
    case "create_target":
      return {
        targetRef: command.targetRef,
        title: command.targetTitle,
        payload: { summary: command.targetSummary },
      };
    case "create_plan":
      return { title: command.title, steps: command.steps };
    case "revise_plan":
      return {
        planId: command.planId,
        expectedPlanHash: command.expectedPlanHash,
        ...(command.title ? { title: command.title } : {}),
        steps: command.steps,
      };
    case "approve_plan":
      return {
        planId: command.planId,
        expectedPlanHash: command.expectedPlanHash,
        decision: command.decision,
        rationale: command.rationale,
      };
    case "execute_plan":
    case "cancel_plan":
      return { planId: command.planId, expectedPlanHash: command.expectedPlanHash };
    case "approve_compensation":
      return {
        runId: command.runId,
        expectedPlanHash: command.expectedPlanHash,
        rationale: command.rationale,
      };
    case "compensate_run":
      return { runId: command.runId, expectedPlanHash: command.expectedPlanHash };
    default:
      return {};
  }
}

function inspectedText(command: AiExecutionCommand): string {
  const values = [command.title, command.targetTitle, command.targetSummary, command.rationale];
  for (const step of command.steps ?? []) {
    if (step.toolKey === "draft.apply_patch") values.push(step.arguments.patch.summary);
  }
  return values.filter((value): value is string => Boolean(value)).join("\n");
}

function errorResponse(req: Request, error: { message?: string; code?: string }, correlationId: string) {
  const marker = failureMarker(error);
  const status =
    marker === "CMS_AI_EXECUTE_MFA_REQUIRED"
      ? 412
      : error.code === "PT404" || marker.endsWith("_NOT_FOUND")
        ? 404
        : error.code === "PT409" ||
            marker.includes("CONFLICT") ||
            marker.includes("UNAVAILABLE") ||
            marker.includes("SEPARATION") ||
            marker.includes("APPROVAL_REQUIRED")
          ? 409
          : marker.includes("FORBIDDEN") || marker.includes("FEATURE_DISABLED") || marker.includes("TOOL_DENIED")
            ? 403
            : marker.includes("INVALID") || marker.includes("REQUIRED") || marker.includes("SYNTHETIC_DATA")
              ? 400
              : 500;
  const safeMessage =
    status >= 500
      ? "A execução controlada está indisponível; use o fluxo manual."
      : marker === "CMS_AI_EXECUTE_MFA_REQUIRED"
        ? "Confirme o MFA para continuar."
        : marker === "CMS_AI_EXECUTE_REVIEWER_SEPARATION_REQUIRED"
          ? "Outro revisor autorizado deve aprovar este plano."
          : marker === "CMS_AI_EXECUTE_OPERATOR_SEPARATION_REQUIRED"
            ? "Quem aprovou não pode executar a mesma ação."
            : marker === "CMS_AI_EXECUTE_PLAN_CONFLICT"
              ? "O plano mudou ou expirou; gere novo dry-run e solicite nova aprovação."
              : marker === "CMS_AI_EXECUTE_TARGET_CONFLICT"
                ? "O alvo mudou; revise o plano antes de executar."
                : marker === "CMS_AI_EXECUTE_APPROVAL_REQUIRED"
                  ? "A aprovação válida é obrigatória."
                  : marker === "CMS_AI_EXECUTE_APPROVAL_CONFLICT"
                    ? "Já existe uma aprovação válida para esta compensação. Atualize o workspace."
                    : marker === "CMS_AI_EXECUTE_FEATURE_DISABLED"
                      ? "A execução transacional individual está desligada."
                      : "A operação foi recusada com segurança.";
  return json(req, { error: safeMessage, code: marker, correlationId, preserved: true }, status);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (!isAllowedOrigin(req)) return json(req, { error: "Origem não autorizada." }, 403);
  if (req.method !== "POST") return json(req, { error: "Método não permitido." }, 405);

  const identity = await authenticateCms(req);
  if (!identity) return json(req, { error: "Sessão inválida." }, 401);

  let command: AiExecutionCommand;
  try {
    command = AiExecutionRequest.parse(await readJsonLimited(req, 180_000));
  } catch {
    return json(
      req,
      { error: "Comando transacional inválido.", code: "CMS_AI_EXECUTE_COMMAND_INVALID" },
      400,
    );
  }
  const { environment, siteKey } = command.envelope.actorContext;
  const correlationId = command.envelope.correlationId;
  if (environment === "production" && !isProductionOperationEnabled(environment))
    return json(
      req,
      {
        error: "Produção não está disponível para a EV2.14.",
        code: "CMS_AI_EXECUTE_PRODUCTION_GATED",
        correlationId,
      },
      403,
    );
  const configuredEnvironment = Deno.env.get("CMS_ENVIRONMENT");
  if (!isConfiguredCmsEnvironment(configuredEnvironment))
    return json(req, { error: "Ambiente do CMS não configurado.", correlationId }, 503);
  if (configuredEnvironment !== environment || siteKey !== "main")
    return json(
      req,
      { error: "Escopo transacional não autorizado.", code: "CMS_AI_EXECUTE_SCOPE_MISMATCH", correlationId },
      403,
    );
  if (EXTERNAL_PROVIDER_ENABLED || Deno.env.get("CMS_AI_EXTERNAL_PROVIDER_ENABLED") === "true")
    return json(
      req,
      {
        error: "Provedor externo recusado nesta fase.",
        code: "CMS_AI_EXECUTE_EXTERNAL_PROVIDER_DENIED",
        correlationId,
      },
      503,
    );
  const occurredAt = Date.parse(command.envelope.occurredAt);
  if (occurredAt < Date.now() - 15 * 60_000 || occurredAt > Date.now() + 5 * 60_000)
    return json(
      req,
      { error: "Comando expirado ou futuro.", code: "CMS_AI_EXECUTE_COMMAND_STALE", correlationId },
      409,
    );

  const mutation = !["capability", "workspace"].includes(command.action);
  try {
    const allowed = await consumeRateLimit(
      identity.admin,
      req,
      "cms_ai_execute_" + command.action,
      identity.user.id + ":" + clientAddress(req),
      mutation ? 20 : 120,
      900,
    );
    if (!allowed) return json(req, { error: "Muitas operações. Aguarde.", correlationId }, 429);
  } catch {
    return json(
      req,
      {
        error: "Proteção temporariamente indisponível; use o fluxo manual.",
        code: "CMS_AI_EXECUTE_RATE_LIMIT_UNAVAILABLE",
        correlationId,
      },
      503,
    );
  }

  const context = {
    p_actor_id: identity.user.id,
    p_environment: environment,
    p_site_key: siteKey,
    p_aal: identity.claims.aal,
    p_session_id: identity.claims.sessionId,
    p_issued_at: identity.claims.issuedAt,
  };
  const { data: capability, error: capabilityError } = await identity.admin.rpc(
    "cms_ai_execute_capability",
    context,
  );
  if (capabilityError)
    return json(
      req,
      { enabled: false, source: "unavailable", correlationId, manualFallback: true },
      503,
    );
  if (command.action === "capability") return json(req, { ...capability, correlationId });
  if (mutation && identity.claims.aal !== "aal2")
    return json(
      req,
      {
        error: "Confirme o MFA para continuar.",
        code: "CMS_AI_EXECUTE_MFA_REQUIRED",
        correlationId,
        preserved: true,
      },
      412,
    );
  if (capability?.enabled !== true)
    return json(
      req,
      {
        error: "A execução transacional individual está desligada.",
        code: "CMS_AI_EXECUTE_FEATURE_DISABLED",
        correlationId,
        preserved: true,
      },
      403,
    );

  if (command.action === "workspace") {
    const { data, error } = await identity.admin.rpc("cms_get_ai_execution_workspace", {
      ...context,
      p_correlation_id: correlationId,
    });
    return error ? errorResponse(req, error, correlationId) : json(req, data);
  }

  const text = inspectedText(command);
  const redaction = redactAiText(text, 12_000);
  const injectionSignals = detectAiPromptInjection(text).filter(
    (signal) => signal !== "critical_action_request",
  );
  if (redaction.categories.length || injectionSignals.length) {
    const denialPayload = {
      categories: [...redaction.categories, ...injectionSignals].sort(),
    };
    const denialHash = await sha256(JSON.stringify(denialPayload));
    await identity.admin
      .rpc("cms_execute_ai_transaction_command", {
        ...context,
        p_action: "record_denial",
        p_payload: denialPayload,
        p_command_id: command.envelope.commandId,
        p_correlation_id: correlationId,
        p_idempotency_key: req.headers.get("X-Idempotency-Key") ?? `g14-denial-${correlationId}`,
        p_request_hash: denialHash,
      })
      .then(() => undefined, () => undefined);
    return json(
      req,
      {
        error: "Use somente conteúdo sintético sem dados pessoais, segredos ou instruções adversariais.",
        code: "CMS_AI_EXECUTE_INPUT_DENIED",
        correlationId,
        preserved: true,
      },
      400,
    );
  }

  const idempotencyKey = req.headers.get("X-Idempotency-Key");
  if (!idempotencyKey)
    return json(
      req,
      {
        error: "Chave idempotente obrigatória.",
        code: "CMS_AI_EXECUTE_IDEMPOTENCY_REQUIRED",
        correlationId,
      },
      400,
    );
  const payload = commandPayload(command);
  const requestHash = await sha256(JSON.stringify(canonicalize(command)));
  const { data, error } = await identity.admin.rpc("cms_execute_ai_transaction_command", {
    ...context,
    p_action: command.action,
    p_payload: payload,
    p_command_id: command.envelope.commandId,
    p_correlation_id: correlationId,
    p_idempotency_key: idempotencyKey,
    p_request_hash: requestHash,
  });
  if (!error) return json(req, data);

  const denialCommandId = crypto.randomUUID();
  const denialPayload = {
    reasonCode: failureMarker(error),
    categories: ["database_policy_denial"],
  };
  const denialHash = await sha256(JSON.stringify(denialPayload));
  await identity.admin
    .rpc("cms_execute_ai_transaction_command", {
      ...context,
      p_action: "record_denial",
      p_payload: denialPayload,
      p_command_id: denialCommandId,
      p_correlation_id: correlationId,
      p_idempotency_key: `g14-policy-denial-${denialCommandId}`,
      p_request_hash: denialHash,
    })
    .then(() => undefined, () => undefined);
  return errorResponse(req, error, correlationId);
});
