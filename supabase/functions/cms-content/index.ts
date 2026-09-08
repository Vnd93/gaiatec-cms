import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { z } from "npm:zod@4.4.3";
import { CmsContentPayloadSchema } from "../../../src/shared/contracts/cms-content.ts";
import { authenticateCms } from "../_shared/cms-auth.ts";
import { isConfiguredCmsEnvironment } from "../_shared/ev2-environment.ts";
import { evaluateQuality, qualityStatus } from "../_shared/cms-quality-rules.ts";
import { syncPublicSearchDocument } from "../_shared/cms-search-index.ts";
import { clientAddress, consumeRateLimit, corsHeaders, isAllowedOrigin, json, readJsonLimited } from "../_shared/security.ts";

const Uuid = z.uuid();
const EditorialCommand = z.object({
  action: z.enum(["create", "save", "submit", "approve", "schedule", "publish", "restore", "archive", "trash", "reopen", "retire", "hard_delete"]),
  itemId: Uuid.nullish(), contentType: z.enum(["product", "service", "industry", "application", "solution", "post", "page", "homepage", "navigation", "site_settings", "placement", "campaign"]).nullish(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160).nullish(), payload: z.record(z.string(), z.unknown()).nullish(),
  expectedLockVersion: z.number().int().positive().nullish(), revisionId: Uuid.nullish(), reason: z.string().trim().min(3).max(500).nullish(),
  publishAt: z.iso.datetime().nullish(),
}).strict();
const BulkCommand = z.object({
  action: z.enum(["bulk_validate", "bulk_create"]),
  contentType: z.literal("product"),
  reason: z.string().trim().min(3).max(500),
  rows: z.array(z.object({
    sourceRow: z.number().int().min(2).max(100000),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160),
    payload: z.record(z.string(), z.unknown()),
  }).strict()).min(1).max(500),
}).strict();
const Command = z.discriminatedUnion("action", [EditorialCommand, BulkCommand]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (!isAllowedOrigin(req)) return json(req, { error: "Origem não autorizada." }, 403);
  if (req.method !== "POST") return json(req, { error: "Método não permitido." }, 405);
  const identity = await authenticateCms(req);
  if (!identity) return json(req, { error: "Sessão inválida." }, 401);
  const environment = Deno.env.get("CMS_ENVIRONMENT");
  if (!isConfiguredCmsEnvironment(environment)) {
    return json(req, { error: "Ambiente do CMS indisponível.", code: "CMS_ENVIRONMENT_INVALID" }, 503);
  }
  const { data: actorScope, error: actorScopeError } = await identity.admin.rpc("cms_actor_scope_context", {
    p_actor_id: identity.user.id,
    p_environment: environment,
  });
  if (actorScopeError || actorScope?.active !== true) {
    return json(req, { error: "Escopo não autorizado.", code: "CMS_CONTENT_SCOPE_FORBIDDEN" }, 403);
  }
  const isQaActor = actorScope?.isQaActor === true;
  const idempotencyKey = req.headers.get("X-Idempotency-Key");
  if (!idempotencyKey || !Uuid.safeParse(idempotencyKey).success) return json(req, { error: "Chave idempotente obrigatória." }, 400);
  let parsed: z.infer<typeof Command>;
  try { parsed = Command.parse(await readJsonLimited(req, 5 * 1024 * 1024)); }
  catch { return json(req, { error: "Comando editorial inválido." }, 400); }
  try {
    const allowed = await consumeRateLimit(identity.admin, req, "cms_content_" + parsed.action,
      identity.user.id + ":" + clientAddress(req), parsed.action.startsWith("bulk_") ? 20 : 120, 900);
    if (!allowed) return json(req, { error: "Muitas operações. Aguarde." }, 429);
  } catch { return json(req, { error: "Proteção temporariamente indisponível." }, 503); }
  if (parsed.action === "bulk_validate" || parsed.action === "bulk_create") {
    const correlationId = crypto.randomUUID();
    const normalizedRows = [];
    const controlledErrors = [];
    for (const row of parsed.rows) {
      const { data: normalized, error: normalizationError } = await identity.admin.rpc(
        "cms_normalize_controlled_payload_scoped",
        {
          p_actor_id: identity.user.id,
          p_environment: environment,
          p_content_type: "product",
          p_payload: row.payload,
          p_require_active: true,
        },
      );
      if (normalizationError) {
        const listKey = normalizationError.message.match(/product\.[a-z_]+/)?.[0] ?? "classificacao_padronizada";
        controlledErrors.push({
          sheet: "Produtos",
          row: row.sourceRow,
          field: listKey,
          message: "Identificador de lista mestra desconhecido, inativo ou pertencente a outra dimensão.",
        });
      } else {
        const validated = CmsContentPayloadSchema.safeParse(normalized);
        if (!validated.success || validated.data.contentType !== "product") {
          controlledErrors.push({
            sheet: "Produtos",
            row: row.sourceRow,
            field: "payload",
            message: "O registro não atende ao contrato integral de produto.",
          });
        } else normalizedRows.push({ ...row, payload: validated.data });
      }
    }
    if (controlledErrors.length) {
      const body = { status: "invalid", total: parsed.rows.length, rows: [], errors: controlledErrors, correlationId };
      return json(req, body, parsed.action === "bulk_validate" ? 200 : 422);
    }
    const functionName = parsed.action === "bulk_validate" ? "cms_validate_bulk_product_import" : "cms_execute_bulk_product_import";
    const { data, error } = await identity.admin.rpc(functionName, {
      p_actor_id: identity.user.id,
      p_rows: normalizedRows,
      p_reason: parsed.reason,
      p_aal: identity.claims.aal,
      p_session_id: identity.claims.sessionId,
      p_issued_at: identity.claims.issuedAt,
      p_idempotency_key: idempotencyKey,
      p_correlation_id: correlationId,
    });
    if (error) {
      const conflict = error.message.includes("CONFLICT") || error.code === "23505";
      const forbidden = error.message.includes("FORBIDDEN");
      const invalid = error.message.includes("INVALID") || error.code === "22023" || error.code === "23514";
      return json(req, {
        error: forbidden ? "Permissão insuficiente." : conflict ? "O lote conflita com cadastros existentes." : invalid ? "A planilha contém dados inválidos." : "Falha no cadastro em massa.",
        correlationId,
        code: forbidden ? "CMS_COMMAND_FORBIDDEN" : conflict ? "CMS_BULK_CONFLICT" : invalid ? "CMS_BULK_INVALID" : error.code,
      }, forbidden ? 403 : conflict ? 409 : invalid ? 422 : 500);
    }
    return json(req, { ...data, correlationId });
  }
  const editorial = EditorialCommand.parse(parsed);
  const correlationId = crypto.randomUUID();
  let contentBundle: any = null;
  if (editorial.itemId) {
    const { data: bundle, error: bundleError } = await identity.admin.rpc("cms_content_read_bundle_scoped", {
      p_actor_id: identity.user.id,
      p_item_id: editorial.itemId,
      p_revision_id: editorial.revisionId ?? null,
      p_environment: environment,
    });
    if (bundleError) {
      return json(req, {
        error: "Conteúdo temporariamente indisponível.",
        code: "CMS_CONTENT_SCOPE_UNAVAILABLE",
        correlationId,
      }, 503);
    }
    if (!bundle) {
      return json(req, {
        error: "Conteúdo não encontrado.",
        code: "CMS_CONTENT_NOT_FOUND",
        correlationId,
      }, 404);
    }
    contentBundle = bundle;
  }
  // Give API clients a deterministic conflict response before invoking the
  // transactional command. The database command repeats this check while
  // holding the draft row lock, so this is presentation logic, not the
  // concurrency boundary.
  if (editorial.action === "save" && editorial.itemId && editorial.expectedLockVersion) {
    const draft = contentBundle?.draft;
    if (draft && draft.lock_version !== editorial.expectedLockVersion) {
      return json(req, {
        error: "O conteúdo foi alterado em outra sessão.",
        code: "CMS_CONTENT_CONFLICT",
        currentLockVersion: draft.lock_version,
      }, 409);
    }
  }
  let effectivePayload = editorial.payload;
  if (
    (editorial.action === "create" || editorial.action === "save") &&
    editorial.payload &&
    (editorial.payload.contentType === "product" || editorial.payload.contentType === "service")
  ) {
    const contentType = String(editorial.payload.contentType);
    const { data: normalized, error: normalizationError } = await identity.admin.rpc(
      "cms_normalize_controlled_payload_scoped",
      {
        p_actor_id: identity.user.id,
        p_environment: environment,
        p_content_type: contentType,
        p_payload: editorial.payload,
        p_require_active: true,
      },
    );
    if (normalizationError) {
      return json(req, {
        error: "Classificação padronizada ausente, desconhecida ou inativa.",
        code: "CMS_CONTROLLED_TERM_INVALID",
        correlationId,
      }, 422);
    }
    effectivePayload = normalized;
  }
  if ((editorial.action === "create" || editorial.action === "save") && editorial.payload?.contentType === "post") {
    const post = editorial.payload as Record<string, any>;
    if (!CmsContentPayloadSchema.safeParse(post).success) {
      return json(req, {
        error: "O conteúdo não atende ao contrato editorial integral.",
        code: "CMS_CONTENT_SCHEMA_INVALID",
        correlationId,
      }, 422);
    }
    const tagSlugs = (post.tags ?? []).map((tag: any) => tag.slug).filter(Boolean);
    const { data: taxonomy, error: taxonomyLookupError } = await identity.admin.rpc(
      "cms_blog_taxonomy_resolve_scoped",
      {
        p_actor_id: identity.user.id,
        p_environment: environment,
        p_author_slug: post.author?.slug ?? "",
        p_category_slug: post.category?.slug ?? "",
        p_tag_slugs: tagSlugs,
      },
    );
    if (taxonomyLookupError || !taxonomy) {
      return json(req, { error: "Autor ou taxonomia editorial inválidos.", code: "CMS_BLOG_TAXONOMY_INVALID", correlationId }, 422);
    }
    const tagIds = new Map(Object.entries(taxonomy.tags ?? {}));
    effectivePayload = {
      ...post,
      author: { ...post.author, id: taxonomy.authorId ?? post.author?.id },
      category: { ...post.category, id: taxonomy.categoryId ?? post.category?.id },
      tags: (post.tags ?? []).map((tag: any) => ({ ...tag, id: tagIds.get(tag.slug) ?? tag.id })),
    };
    const { error: taxonomyError } = await identity.admin.rpc("cms_sync_blog_taxonomy", {
      p_actor_id: identity.user.id,
      p_payload: effectivePayload,
      p_aal: identity.claims.aal,
      p_session_id: identity.claims.sessionId,
      p_issued_at: identity.claims.issuedAt,
    });
    if (taxonomyError) return json(req, { error: "Autor ou taxonomia editorial inválidos.", code: "CMS_BLOG_TAXONOMY_INVALID", correlationId }, 422);
  }
  if (["create", "save", "retire"].includes(editorial.action)) {
    const validated = CmsContentPayloadSchema.safeParse(effectivePayload);
    if (
      !validated.success ||
      (editorial.contentType && validated.data.contentType !== editorial.contentType)
    ) {
      return json(req, {
        error: "O conteúdo não atende ao contrato editorial integral.",
        code: "CMS_CONTENT_SCHEMA_INVALID",
        correlationId,
      }, 422);
    }
    effectivePayload = validated.data;
  }
  if (editorial.action === "retire") {
    if (!editorial.itemId || !editorial.payload || !editorial.expectedLockVersion) {
      return json(req, { error: "Página, conteúdo e versão são obrigatórios." }, 400);
    }
    const { data, error } = await identity.admin.rpc("cms_retire_managed_page", {
      p_actor_id: identity.user.id, p_item_id: editorial.itemId, p_slug: editorial.slug,
      p_payload: editorial.payload, p_expected_lock_version: editorial.expectedLockVersion,
      p_reason: editorial.reason ?? "Retirada governada de página",
      p_aal: identity.claims.aal, p_session_id: identity.claims.sessionId,
      p_issued_at: identity.claims.issuedAt, p_idempotency_key: idempotencyKey,
      p_correlation_id: correlationId,
    });
    if (error) {
      const forbidden = error.message.includes("FORBIDDEN"), notFound = error.message.includes("NOT_FOUND"),
        conflict = error.message.includes("CONFLICT"), transition = error.message.includes("TRANSITION");
      return json(req, {
        error: forbidden ? "Permissão insuficiente." : notFound ? "Conteúdo não encontrado." :
          conflict ? "O conteúdo foi alterado em outra sessão." :
          transition ? "A página não está publicada." : "Configuração de retirada inválida.",
        correlationId,
        code: forbidden ? "CMS_COMMAND_FORBIDDEN" : notFound ? "CMS_CONTENT_NOT_FOUND" :
          conflict ? "CMS_CONTENT_CONFLICT" : transition ? "CMS_TRANSITION_INVALID" : "CMS_PAGE_RETIREMENT_INVALID",
      }, forbidden ? 403 : notFound ? 404 : conflict ? 409 : 422);
    }
    return json(req, { ...data, correlationId });
  }
  if (editorial.action === "hard_delete" || editorial.action === "reopen") {
    if (!editorial.itemId) return json(req, { error: "Conteúdo obrigatório." }, 400);
    const functionName = editorial.action === "hard_delete" ? "cms_hard_delete_draft" : "cms_reopen_site_builder";
    const { data, error } = await identity.admin.rpc(functionName, {
      p_actor_id: identity.user.id, p_item_id: editorial.itemId,
      p_reason: editorial.reason ?? (editorial.action === "hard_delete" ? "Exclusão definitiva de rascunho nunca publicado" : "Abrir nova versão de conteúdo publicado"),
      p_aal: identity.claims.aal, p_session_id: identity.claims.sessionId,
      p_issued_at: identity.claims.issuedAt, p_idempotency_key: idempotencyKey,
      p_correlation_id: correlationId,
    });
    if (error) {
      const forbidden = error.message.includes("FORBIDDEN"), notFound = error.message.includes("NOT_FOUND"),
        transition = error.message.includes("TRANSITION");
      return json(req, {
        error: forbidden ? "Permissão insuficiente." : notFound ? "Conteúdo não encontrado." :
          transition ? "O conteúdo não está em um estado compatível." : "Exclusão definitiva não permitida.",
        correlationId,
        code: forbidden ? "CMS_COMMAND_FORBIDDEN" : notFound ? "CMS_CONTENT_NOT_FOUND" :
          transition ? "CMS_TRANSITION_INVALID" : "CMS_HARD_DELETE_NOT_ALLOWED",
      }, forbidden ? 403 : notFound ? 404 : 422);
    }
    return json(req, { ...data, correlationId });
  }
  if (["submit", "approve", "schedule", "publish", "restore"].includes(editorial.action)) {
    if (!editorial.itemId) return json(req, { error: "Conteúdo obrigatório." }, 400);
    const storedPayload = editorial.action === "submit"
      ? contentBundle?.draft?.payload
      : contentBundle?.revision?.payload;
    if (!storedPayload || !CmsContentPayloadSchema.safeParse(storedPayload).success)
      return json(req, {
        error: "O conteúdo não atende ao contrato editorial integral.",
        code: "CMS_CONTENT_SCHEMA_INVALID",
        correlationId,
      }, 422);
  }
  let searchQualityEnabled = false;
  if (["publish", "schedule", "restore"].includes(editorial.action) && editorial.itemId) {
    if (isConfiguredCmsEnvironment(environment)) {
      const { data: capability, error: capabilityError } = await identity.admin.rpc("cms_evaluate_feature_flag", {
        p_actor_id: identity.user.id, p_flag_key: "ev2.search_quality", p_environment: environment,
        p_site_key: "main", p_aal: identity.claims.aal, p_session_id: identity.claims.sessionId,
        p_issued_at: identity.claims.issuedAt,
      });
      if (capabilityError) return json(req, { error: "Centro de Qualidade indisponível.", code: "CMS_QUALITY_UNAVAILABLE", correlationId }, 503);
      if (capability?.enabled === true) {
        searchQualityEnabled = true;
        const revision = contentBundle?.revision;
        if (!revision) return json(req, { error: "Qualidade não pôde ser verificada.", code: "CMS_QUALITY_UNAVAILABLE", correlationId }, 503);
        const waivedRules = new Set<string>(contentBundle?.waiverRuleKeys ?? []);
        const findings = evaluateQuality(revision.payload, revision.seo).map((entry) => ({ ...entry, waived: waivedRules.has(entry.ruleKey) }));
        const effectiveFindings = findings.filter((entry) => !entry.waived);
        const qualityState = qualityStatus(effectiveFindings);
        const counts = {
          errors: effectiveFindings.filter((entry) => entry.severity === "error").length,
          warnings: effectiveFindings.filter((entry) => entry.severity === "warning").length,
          recommendations: effectiveFindings.filter((entry) => entry.severity === "recommendation").length,
          waived: findings.filter((entry) => entry.waived).length,
        };
        const { data: run, error: runError } = await identity.admin.rpc("cms_record_quality_run", {
          p_item_id: editorial.itemId, p_revision_id: revision.id,
          p_trigger_kind: editorial.action === "schedule" ? "schedule" : "publish", p_status: qualityState, p_counts: counts,
          p_findings: findings, p_actor_id: identity.user.id, p_correlation_id: correlationId,
        });
        if (runError || !run) return json(req, { error: "Qualidade não pôde ser registrada.", code: "CMS_QUALITY_UNAVAILABLE", correlationId }, 503);
        if (qualityState === "blocked") return json(req, {
          error: "Publicação bloqueada pelo Centro de Qualidade.", code: "CMS_QUALITY_BLOCKED",
          qualityRunId: run.runId, findings: effectiveFindings.filter((entry) => entry.severity === "error"), correlationId,
        }, 422);
      }
    }
  }
  const { data, error } = await identity.admin.rpc("cms_execute_editorial_command", {
    p_actor_id: identity.user.id, p_action: editorial.action, p_item_id: editorial.itemId ?? null,
    p_content_type: editorial.contentType ?? null, p_slug: editorial.slug ?? null, p_payload: effectivePayload ?? null,
    p_expected_lock_version: editorial.expectedLockVersion ?? null, p_revision_id: editorial.revisionId ?? null,
    p_reason: editorial.reason ?? "Operação editorial sintética", p_publish_at: editorial.publishAt ?? null,
    p_aal: identity.claims.aal, p_session_id: identity.claims.sessionId, p_issued_at: identity.claims.issuedAt,
    p_idempotency_key: idempotencyKey, p_correlation_id: correlationId,
  });
  if (error) {
    const knownCode = ["CMS_COMMAND_FORBIDDEN", "CMS_CONTENT_CONFLICT", "CMS_CONTENT_NOT_FOUND",
      "CMS_CONTENT_SCHEMA_INVALID", "CMS_CONTENT_PROVENANCE_INVALID", "CMS_CONSUMER_UNAVAILABLE",
      "CMS_BLOCK_WITHOUT_RENDERER", "CMS_TRANSITION_INVALID", "CMS_REVISION_NOT_FOUND",
      "CMS_PIM_CANONICAL_SKU_REQUIRED", "CMS_PIM_CANONICAL_IDENTITY_CONFLICT",
      "CMS_PIM_CANONICAL_ATTRIBUTE_INVALID", "CMS_PIM_CANONICAL_SKU_CONFLICT",
      "CMS_PIM_CANONICAL_IDENTIFIER_CONFLICT",
      "CMS_PIM_RECONCILIATION_REQUIRED", "CMS_PIM_PUBLIC_DATA_REQUIRED"]
      .find((candidate) => error.message.includes(candidate));
    const constraint = error.message.match(/constraint [\"']([^\"']+)[\"']/i)?.[1];
    const code = error.message.includes("FORBIDDEN") ? 403 : error.message.includes("CONFLICT") || error.code === "40001" ? 409 :
      error.message.includes("NOT_FOUND") ? 404 : error.code === "23514" || error.code === "22023" ? 422 : 500;
    return json(req, { error: code === 403 ? "Permissão insuficiente." : code === 409 ? "O conteúdo foi alterado em outra sessão." :
      code === 404 ? "Conteúdo não encontrado." : code === 422 ? "Transição ou conteúdo inválido." : "Falha editorial.",
      correlationId, code: knownCode ?? error.code, constraint }, code);
  }
  let searchIndex: "not_requested" | "synced" | "removed" | "pending" = "not_requested";
  if (searchQualityEnabled && editorial.itemId && ["publish", "restore"].includes(editorial.action)) {
    try { searchIndex = await syncPublicSearchDocument(identity.admin, editorial.itemId); }
    catch {
      searchIndex = "pending";
      if (!isQaActor) {
        await identity.admin.from("cms_search_index_jobs").insert({ status: "pending", reason: `Sincronização pendente após ${editorial.action}`, requested_by: identity.user.id, correlation_id: correlationId }).then(() => undefined, () => undefined);
      }
    }
  }
  return json(req, { ...data, correlationId, searchIndex });
});
