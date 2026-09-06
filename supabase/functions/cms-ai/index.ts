import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { z } from "npm:zod@4.4.3";
import { authenticateCms } from "../_shared/cms-auth.ts";
import { isConfiguredCmsEnvironment, isProductionOperationEnabled } from "../_shared/ev2-environment.ts";
import { generateOpenRouterProposal, openRouterConfigured } from "../_shared/openrouter.ts";
import {
  clientAddress,
  consumeRateLimit,
  corsHeaders,
  isAllowedOrigin,
  json,
  readJsonLimited,
  sha256,
} from "../_shared/security.ts";
import {
  AI_LOW_CONFIDENCE_THRESHOLD,
  AI_SAFETY_POLICY_VERSION,
  detectAiPromptInjection,
  estimateAiTokens,
  redactAiText,
} from "../_shared/ai-safety.ts";

const Uuid = z.uuid();
const Required = z.string().trim().min(1);
const Environment = z.enum(["local", "staging", "production"]);
const Mode = z.enum(["read", "draft"]);
const ProposalKind = z.enum(["locate", "explain", "extract", "draft_patch"]);
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

const SyntheticSource = z
  .object({
    kind: z.literal("synthetic_document"),
    reference: z.string().regex(/^g10x-[a-z0-9-]{3,100}$/),
    title: Required.max(180),
    version: Required.max(80),
    locator: Required.max(240),
    page: z.number().int().min(1).max(10000).optional(),
    excerpt: Required.max(3000),
  })
  .strict();

const EditedField = z
  .object({
    path: z.string().regex(/^[a-z][a-zA-Z0-9_.-]{0,119}$/),
    value: Required.max(3000),
  })
  .strict();

const EvalMetrics = z
  .object({
    suiteKey: z.string().regex(/^g10x-[a-z0-9-]{3,100}$/),
    datasetHash: z.string().regex(/^[0-9a-f]{64}$/),
    bypassCount: z.number().int().nonnegative(),
    piiLeakCount: z.number().int().nonnegative(),
    sourceCoverage: z.number().min(0).max(1),
    fieldPrecision: z.number().min(0).max(1),
    permissionPassRate: z.number().min(0).max(1),
    metrics: z.record(z.string(), z.number()),
  })
  .strict();

const AiRequest = z
  .object({
    envelope: Envelope,
    action: z.enum([
      "capability",
      "workspace",
      "start_session",
      "generate_proposal",
      "decide_proposal",
      "close_session",
      "record_eval",
    ]),
    mode: Mode.optional(),
    title: z.string().trim().min(3).max(160).optional(),
    sessionId: Uuid.optional(),
    prompt: z.string().trim().min(3).max(4000).optional(),
    source: SyntheticSource.optional(),
    proposalKind: ProposalKind.optional(),
    targetRef: z.string().regex(/^g10x-[a-z0-9-]{3,100}$/).optional(),
    proposalId: Uuid.optional(),
    expectedProposalHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
    decision: z.enum(["accepted", "rejected", "edited"]).optional(),
    rationale: z.string().trim().min(3).max(1000).optional(),
    editedFields: z.array(EditedField).min(1).max(50).optional(),
    eval: EvalMetrics.optional(),
  })
  .strict()
  .superRefine((command, context) => {
    const issue = (path: string, message: string) =>
      context.addIssue({ code: "custom", path: [path], message });
    if (command.action === "start_session" && (!command.mode || !command.title))
      issue("title", "Modo e título são obrigatórios.");
    if (
      command.action === "generate_proposal" &&
      (!command.sessionId || !command.prompt || !command.source || !command.proposalKind)
    )
      issue("prompt", "Sessão, solicitação, fonte e tipo de proposta são obrigatórios.");
    if (
      command.action === "decide_proposal" &&
      (!command.proposalId ||
        !command.expectedProposalHash ||
        !command.decision ||
        !command.rationale)
    )
      issue("decision", "Proposta, hash, decisão e justificativa são obrigatórios.");
    if (command.action === "decide_proposal" && command.decision === "edited" && !command.editedFields)
      issue("editedFields", "Campos editados são obrigatórios para esta decisão.");
    if (command.action === "close_session" && !command.sessionId)
      issue("sessionId", "Sessão obrigatória.");
    if (command.action === "record_eval" && !command.eval)
      issue("eval", "Métricas de avaliação obrigatórias.");
  });

type AiCommand = z.infer<typeof AiRequest>;
type SyntheticSourceInput = z.infer<typeof SyntheticSource>;

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

function wordSet(value: string): Set<string> {
  return new Set(
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 4),
  );
}

function sourceConfidence(prompt: string, excerpt: string, kind: z.infer<typeof ProposalKind>) {
  if (kind === "locate") return 1;
  const requested = wordSet(prompt);
  const available = wordSet(excerpt);
  if (!requested.size) return AI_LOW_CONFIDENCE_THRESHOLD;
  const overlap = [...requested].filter((word) => available.has(word)).length / requested.size;
  return Math.round(Math.min(0.98, 0.62 + overlap * 0.36) * 1000) / 1000;
}

function firstSentence(value: string): string {
  const match = value.trim().match(/^.*?[.!?](?:\s|$)/);
  return (match?.[0] ?? value).trim().slice(0, 900);
}

function buildSyntheticProposal(
  prompt: string,
  source: SyntheticSourceInput,
  kind: z.infer<typeof ProposalKind>,
  targetRef?: string,
) {
  const confidence = sourceConfidence(prompt, source.excerpt, kind);
  const location = source.title + " · " + source.version + " · " + source.locator +
    (source.page ? " · página " + source.page : "");
  const value =
    kind === "locate"
      ? location
      : kind === "explain"
        ? "Segundo a fonte sintética informada: " + firstSentence(source.excerpt)
        : kind === "extract"
          ? firstSentence(source.excerpt)
          : firstSentence(source.excerpt);
  const labelByKind = {
    locate: "Localização",
    explain: "Explicação apoiada",
    extract: "Campo extraído",
    draft_patch: "Texto proposto",
  } as const;
  const pathByKind = {
    locate: "source.location",
    explain: "content.explanation",
    extract: "content.extracted_summary",
    draft_patch: "draft.summary",
  } as const;
  const summary =
    labelByKind[kind] + " preparada por adaptador determinístico, com fonte e revisão humana obrigatória.";
  const field = {
    path: pathByKind[kind],
    label: labelByKind[kind],
    value,
    sourceTitle: source.title,
    sourceVersion: source.version,
    locator: source.locator,
    page: source.page ?? null,
    excerpt: source.excerpt.slice(0, 1000),
    confidence,
  };
  return {
    summary,
    fields: [field],
    diff: { before: "", after: value },
    confidence,
    hasPendingFields: confidence < AI_LOW_CONFIDENCE_THRESHOLD,
    targetRef: targetRef ?? null,
  };
}

function errorResponse(req: Request, error: { message?: string; code?: string }, correlationId: string) {
  const marker = error.message?.match(/CMS_[A-Z0-9_]+/)?.[0] ?? "CMS_AI_FAILURE";
  const status =
    marker === "CMS_AI_MFA_REQUIRED"
      ? 412
      : error.code === "PT404" || marker.endsWith("_NOT_FOUND")
        ? 404
        : error.code === "PT409" ||
            marker.includes("CONFLICT") ||
            marker.includes("EXCEEDED") ||
            marker.includes("UNAVAILABLE") ||
            marker.includes("ALREADY_DECIDED") ||
            marker.includes("SEPARATION") ||
            marker.includes("LOW_CONFIDENCE_PENDING")
          ? 409
          : marker.includes("FORBIDDEN") || marker.includes("FEATURE_DISABLED")
            ? 403
            : marker.includes("INVALID") ||
                marker.includes("REQUIRED") ||
                marker.includes("UNREDACTED")
              ? 400
              : 500;
  const safeMessage =
    status >= 500
      ? "A assistência está temporariamente indisponível; o CMS manual continua operacional."
      : marker === "CMS_AI_MFA_REQUIRED"
        ? "Confirme o MFA para continuar."
        : marker === "CMS_AI_FEATURE_DISABLED"
          ? "A assistência individual está desligada."
          : marker === "CMS_AI_BUDGET_EXCEEDED"
            ? "O orçamento desta sessão foi atingido."
            : marker === "CMS_AI_PROPOSAL_CONFLICT"
              ? "A proposta mudou; recarregue antes de decidir."
              : marker === "CMS_AI_REVIEWER_SEPARATION_REQUIRED"
                ? "A proposta deve ser decidida por outro revisor autorizado."
                : marker === "CMS_AI_LOW_CONFIDENCE_PENDING"
                  ? "Campos de baixa confiança precisam ser conferidos e editados antes da decisão."
              : "A operação assistiva foi recusada com segurança.";
  return json(req, { error: safeMessage, code: marker, correlationId, preserved: true }, status);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (!isAllowedOrigin(req)) return json(req, { error: "Origem não autorizada." }, 403);
  if (req.method !== "POST") return json(req, { error: "Método não permitido." }, 405);

  const identity = await authenticateCms(req);
  if (!identity) return json(req, { error: "Sessão inválida." }, 401);

  let command: AiCommand;
  try {
    command = AiRequest.parse(await readJsonLimited(req, 160_000));
  } catch {
    return json(req, { error: "Comando assistivo inválido.", code: "CMS_AI_COMMAND_INVALID" }, 400);
  }
  const { environment, siteKey } = command.envelope.actorContext;
  const correlationId = command.envelope.correlationId;
  if (environment === "production" && !isProductionOperationEnabled(environment))
    return json(
      req,
      { error: "Produção não está disponível nesta fase.", code: "CMS_AI_PRODUCTION_GATED", correlationId },
      403,
    );
  const configuredEnvironment = Deno.env.get("CMS_ENVIRONMENT");
  if (!isConfiguredCmsEnvironment(configuredEnvironment))
    return json(req, { error: "Ambiente do CMS não configurado.", correlationId }, 503);
  if (configuredEnvironment !== environment || siteKey !== "main")
    return json(
      req,
      { error: "Escopo assistivo não autorizado.", code: "CMS_AI_SCOPE_MISMATCH", correlationId },
      403,
    );
  const externalProviderEnabled = openRouterConfigured();
  if (environment === "production" && !externalProviderEnabled)
    return json(
      req,
      {
        error: "O provedor assistivo não está configurado com o modelo aprovado.",
        code: "CMS_AI_PROVIDER_NOT_CONFIGURED",
        correlationId,
      },
      503,
    );
  const occurredAt = Date.parse(command.envelope.occurredAt);
  if (occurredAt < Date.now() - 15 * 60_000 || occurredAt > Date.now() + 5 * 60_000)
    return json(
      req,
      { error: "Comando expirado ou futuro.", code: "CMS_AI_COMMAND_STALE", correlationId },
      409,
    );

  const mutation = !["capability", "workspace"].includes(command.action);
  try {
    const allowed = await consumeRateLimit(
      identity.admin,
      req,
      "cms_ai_" + command.action,
      identity.user.id + ":" + clientAddress(req),
      mutation ? 30 : 120,
      900,
    );
    if (!allowed) return json(req, { error: "Muitas operações. Aguarde.", correlationId }, 429);
  } catch {
    return json(
      req,
      {
        error: "Proteção temporariamente indisponível; use o CMS manual.",
        code: "CMS_AI_RATE_LIMIT_UNAVAILABLE",
        correlationId,
      },
      503,
    );
  }

  if (mutation && identity.claims.aal !== "aal2")
    return json(
      req,
      {
        error: "Confirme o MFA para continuar.",
        code: "CMS_AI_MFA_REQUIRED",
        correlationId,
        preserved: true,
      },
      412,
    );

  const context = {
    p_actor_id: identity.user.id,
    p_environment: environment,
    p_site_key: siteKey,
    p_aal: identity.claims.aal,
    p_session_id: identity.claims.sessionId,
    p_issued_at: identity.claims.issuedAt,
  };
  const { data: capability, error: capabilityError } = await identity.admin.rpc(
    "cms_ai_capability",
    context,
  );
  if (capabilityError)
    return json(
      req,
      {
        enabled: false,
        source: "unavailable",
        correlationId,
        manualFallback: true,
      },
      503,
    );
  if (command.action === "capability")
    return json(req, {
      ...capability,
      ...(externalProviderEnabled
        ? {
            providerMode: "openrouter",
            externalProviderEnabled: true,
            externalProviderReady: true,
            realDataAllowed: true,
            decisionStatus: "approved",
          }
        : {}),
      correlationId,
    });
  if (capability?.enabled !== true)
    return json(
      req,
      {
        error: "A assistência individual está desligada; o CMS manual continua disponível.",
        code: "CMS_AI_FEATURE_DISABLED",
        correlationId,
        preserved: true,
      },
      403,
    );

  if (command.action === "workspace") {
    const { data, error } = await identity.admin.rpc("cms_get_ai_workspace", {
      ...context,
      p_correlation_id: correlationId,
    });
    if (error) return errorResponse(req, error, correlationId);
    if (!externalProviderEnabled || !data || typeof data !== "object") return json(req, data);
    const workspace = data as Record<string, unknown>;
    const policy = workspace.policy as Record<string, unknown> | undefined;
    const sessions = Array.isArray(workspace.sessions) ? workspace.sessions : [];
    const sessionIds = sessions
      .map((item) => (item as Record<string, unknown>).id)
      .filter((id): id is string => typeof id === "string");
    const { data: providerCalls } = sessionIds.length
      ? await identity.admin
          .from("cms_ai_provider_calls")
          .select("session_id")
          .eq("actor_id", identity.user.id)
          .eq("provider", "openrouter")
          .eq("status", "succeeded")
          .in("session_id", sessionIds)
      : { data: [] as { session_id: string }[] };
    const providerSessionIds = new Set((providerCalls ?? []).map((item) => item.session_id));
    return json(req, {
      ...workspace,
      policy: {
        ...policy,
        status: "approved",
        providerMode: "openrouter",
        externalProviderEnabled: true,
        allowedDataClasses: ["business_content"],
      },
      sessions: sessions.map((item) => {
        const session = item as Record<string, unknown>;
        return providerSessionIds.has(String(session.id))
          ? { ...session, providerMode: "openrouter", reviewable: true }
          : session;
      }),
    });
  }

  const idempotencyKey = req.headers.get("X-Idempotency-Key");
  if (!idempotencyKey)
    return json(
      req,
      {
        error: "Chave idempotente obrigatória.",
        code: "CMS_AI_IDEMPOTENCY_REQUIRED",
        correlationId,
      },
      400,
    );

  const requestHash = await sha256(JSON.stringify(canonicalize(command)));
  const execute = (action: string, payload: Record<string, unknown>) =>
    identity.admin.rpc("cms_execute_ai_command", {
      p_actor_id: identity.user.id,
      p_action: action,
      p_payload: payload,
      p_environment: environment,
      p_site_key: siteKey,
      p_aal: identity.claims.aal,
      p_session_id: identity.claims.sessionId,
      p_issued_at: identity.claims.issuedAt,
      p_command_id: command.envelope.commandId,
      p_correlation_id: correlationId,
      p_idempotency_key: idempotencyKey,
      p_request_hash: requestHash,
    });

  if (command.action === "start_session") {
    const title = redactAiText(command.title ?? "", 160);
    if (title.blocked || title.value.length < 3)
      return json(
        req,
        {
          error: "O título contém dado não permitido.",
          code: "CMS_AI_SENSITIVE_INPUT_BLOCKED",
          correlationId,
        },
        422,
      );
    const { data, error } = await execute("start_session", {
      mode: command.mode,
      title: title.value,
      dataClass: "synthetic",
      tokenBudget: 8000,
    });
    if (error) return errorResponse(req, error, correlationId);
    return json(req, externalProviderEnabled && data && typeof data === "object"
      ? { ...(data as Record<string, unknown>), providerMode: "openrouter", externalProviderEnabled: true }
      : data);
  }

  if (command.action === "generate_proposal") {
    const source = command.source!;
    const prompt = redactAiText(command.prompt ?? "", 4000);
    const sourceTitle = redactAiText(source.title, 180);
    const sourceVersion = redactAiText(source.version, 80);
    const sourceLocator = redactAiText(source.locator, 240);
    const sourceExcerpt = redactAiText(source.excerpt, 3000);
    const categories = [
      ...new Set([
        ...prompt.categories,
        ...sourceTitle.categories,
        ...sourceVersion.categories,
        ...sourceLocator.categories,
        ...sourceExcerpt.categories,
      ]),
    ].sort();
    const injectionSignals = [
      ...new Set([
        ...detectAiPromptInjection(prompt.value),
        ...detectAiPromptInjection(sourceExcerpt.value),
      ]),
    ].sort();
    const blocked =
      prompt.blocked ||
      sourceTitle.blocked ||
      sourceVersion.blocked ||
      sourceLocator.blocked ||
      sourceExcerpt.blocked ||
      injectionSignals.length > 0;
    if (blocked) {
      const { error: denialError } = await execute("record_denial", {
        requestedMode: command.proposalKind === "draft_patch" ? "draft" : "read",
        reason: injectionSignals.length ? "prompt_injection" : "secret_detected",
        categories: [...categories, ...injectionSignals],
      });
      if (denialError) return errorResponse(req, denialError, correlationId);
      return json(
        req,
        {
          error:
            "A solicitação ou a fonte foi bloqueada pela política. Nenhum conteúdo foi processado.",
          code: "CMS_AI_SAFETY_BLOCKED",
          correlationId,
          preserved: true,
        },
        422,
      );
    }
    const safeSource = {
      ...source,
      title: sourceTitle.value,
      version: sourceVersion.value,
      locator: sourceLocator.value,
      excerpt: sourceExcerpt.value,
    };
    let proposal = buildSyntheticProposal(prompt.value, safeSource, command.proposalKind!, command.targetRef);
    let providerMode = "synthetic";
    let providerModel = "deterministic-v1";
    let providerInputTokens: number | null = null;
    let providerOutputTokens: number | null = null;
    if (externalProviderEnabled && command.proposalKind !== "locate") {
      try {
        const generated = await generateOpenRouterProposal({
          prompt: prompt.value,
          sourceTitle: safeSource.title,
          sourceVersion: safeSource.version,
          sourceLocator: safeSource.locator,
          sourceExcerpt: safeSource.excerpt,
          proposalKind: command.proposalKind!,
        });
        const field = proposal.fields[0];
        proposal = {
          ...proposal,
          summary: generated.summary,
          fields: [{ ...field, value: generated.value, confidence: generated.confidence }],
          diff: { before: "", after: generated.value },
          confidence: generated.confidence,
          hasPendingFields: generated.confidence < AI_LOW_CONFIDENCE_THRESHOLD,
        };
        providerMode = "openrouter";
        providerModel = generated.model;
        providerInputTokens = generated.inputTokens;
        providerOutputTokens = generated.outputTokens;
      } catch (error) {
        const providerFailure = error instanceof Error && /^OPENROUTER_[A-Z0-9_]+$/.test(error.message)
          ? error.message
          : "OPENROUTER_REQUEST_FAILED";
        return json(req, {
          error: "A IA está temporariamente indisponível; o cadastro manual continua funcionando.",
          code: "CMS_AI_PROVIDER_UNAVAILABLE",
          providerFailure,
          correlationId,
          preserved: true,
        }, 503);
      }
    }
    const proposalHash = await sha256(
      JSON.stringify(canonicalize({ ...proposal, source: safeSource, policy: AI_SAFETY_POLICY_VERSION })),
    );
    const inputTokens = providerInputTokens ?? estimateAiTokens(prompt.value, safeSource.excerpt);
    const outputTokens = providerOutputTokens ?? estimateAiTokens(
      proposal.summary,
      proposal.fields.map((field) => field.value).join(" "),
    );
    const { data, error } = await execute("generate_proposal", {
      sessionId: command.sessionId,
      prompt: prompt.value,
      promptHash: await sha256(prompt.value),
      risk: categories.length ? "redacted" : "safe",
      redactionCategories: categories,
      sourceKind: "synthetic_document",
      sourceRef: safeSource.reference,
      sourceTitle: safeSource.title,
      sourceVersion: safeSource.version,
      sourceLocator: safeSource.locator,
      sourcePage: safeSource.page,
      sourceExcerpt: safeSource.excerpt,
      sourceExcerptHash: await sha256(safeSource.excerpt),
      proposalKind: command.proposalKind,
      targetRef: command.targetRef,
      summary: proposal.summary,
      fields: proposal.fields,
      diff: proposal.diff,
      confidence: proposal.confidence,
      proposalHash,
      inputTokens,
      outputTokens,
      providerMode,
      providerModel,
      externalProviderEnabled: providerMode === "openrouter",
      policyVersion: AI_SAFETY_POLICY_VERSION,
    });
    if (error) return errorResponse(req, error, correlationId);
    if (providerMode === "openrouter") {
      const { error: providerAuditError } = await identity.admin.from("cms_ai_provider_calls").insert({
        actor_id: identity.user.id,
        session_id: command.sessionId,
        provider: providerMode,
        model_key: providerModel,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        correlation_id: correlationId,
        status: "succeeded",
      });
      if (providerAuditError)
        return json(
          req,
          {
            error: "A proposta foi preservada, mas a auditoria do provedor falhou. Recarregue antes de revisar.",
            code: "CMS_AI_PROVIDER_AUDIT_UNAVAILABLE",
            correlationId,
            preserved: true,
          },
          503,
        );
    }
    return json(req, data);
  }

  if (command.action === "decide_proposal") {
    const rationale = redactAiText(command.rationale ?? "", 1000);
    const editedRedactions = command.editedFields?.map((field) => {
      const value = redactAiText(field.value, 3000);
      return { field: { ...field, value: value.value }, blocked: value.blocked };
    });
    if (rationale.blocked || editedRedactions?.some((item) => item.blocked))
      return json(
        req,
        {
          error: "A decisão contém dado não permitido.",
          code: "CMS_AI_SENSITIVE_INPUT_BLOCKED",
          correlationId,
        },
        422,
      );
    const editedFields = editedRedactions?.map((item) => item.field);
    const { data, error } = await execute("decide_proposal", {
      proposalId: command.proposalId,
      expectedProposalHash: command.expectedProposalHash,
      decision: command.decision,
      rationale: rationale.value,
      editedFields,
    });
    return error ? errorResponse(req, error, correlationId) : json(req, data);
  }

  if (command.action === "close_session") {
    const { data, error } = await execute("close_session", { sessionId: command.sessionId });
    return error ? errorResponse(req, error, correlationId) : json(req, data);
  }

  const { data, error } = await execute("record_eval", {
    ...command.eval,
    policyVersion: AI_SAFETY_POLICY_VERSION,
    externalProviderEnabled: false,
  });
  return error ? errorResponse(req, error, correlationId) : json(req, data);
});
