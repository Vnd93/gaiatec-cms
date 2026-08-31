import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { z } from "npm:zod@4.4.3";
import { authenticateCms } from "../_shared/cms-auth.ts";
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
        "cms_normalize_controlled_payload",
        { p_content_type: "product", p_payload: row.payload, p_require_active: true },
      );
      if (normalizationError) {
        const listKey = normalizationError.message.match(/product\.[a-z_]+/)?.[0] ?? "classificacao_padronizada";
        controlledErrors.push({
          sheet: "Produtos",
          row: row.sourceRow,
          field: listKey,
          message: "Identificador de lista mestra desconhecido, inativo ou pertencente a outra dimensão.",
        });
      } else normalizedRows.push({ ...row, payload: normalized });
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
  // Give API clients a deterministic conflict response before invoking the
  // transactional command. The database command repeats this check while
  // holding the draft row lock, so this is presentation logic, not the
  // concurrency boundary.
  if (parsed.action === "save" && parsed.itemId && parsed.expectedLockVersion) {
    const { data: draft } = await identity.admin.from("cms_content_drafts")
      .select("lock_version").eq("item_id", parsed.itemId).maybeSingle();
    if (draft && draft.lock_version !== parsed.expectedLockVersion) {
      return json(req, {
        error: "O conteúdo foi alterado em outra sessão.",
        code: "CMS_CONTENT_CONFLICT",
        currentLockVersion: draft.lock_version,
      }, 409);
    }
  }
  const correlationId = crypto.randomUUID();
  let effectivePayload = parsed.payload;
  if (
    (parsed.action === "create" || parsed.action === "save") &&
    parsed.payload &&
    (parsed.payload.contentType === "product" || parsed.payload.contentType === "service")
  ) {
    const contentType = String(parsed.payload.contentType);
    const { data: normalized, error: normalizationError } = await identity.admin.rpc(
      "cms_normalize_controlled_payload",
      { p_content_type: contentType, p_payload: parsed.payload, p_require_active: true },
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
  if ((parsed.action === "create" || parsed.action === "save") && parsed.payload?.contentType === "post") {
    const post = parsed.payload as Record<string, any>;
    const tagSlugs = (post.tags ?? []).map((tag: any) => tag.slug).filter(Boolean);
    const [authorResult, categoryResult, tagResult] = await Promise.all([
      identity.admin.from("cms_blog_authors").select("id").eq("slug", post.author?.slug ?? "").maybeSingle(),
      identity.admin.from("cms_blog_categories").select("id").eq("slug", post.category?.slug ?? "").maybeSingle(),
      tagSlugs.length
        ? identity.admin.from("cms_blog_tags").select("id,slug").in("slug", tagSlugs)
        : Promise.resolve({ data: [] }),
    ]);
    const tagIds = new Map((tagResult.data ?? []).map((tag: any) => [tag.slug, tag.id]));
    effectivePayload = {
      ...post,
      author: { ...post.author, id: authorResult.data?.id ?? post.author?.id },
      category: { ...post.category, id: categoryResult.data?.id ?? post.category?.id },
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
  if (parsed.action === "retire") {
    if (!parsed.itemId || !parsed.payload || !parsed.expectedLockVersion) {
      return json(req, { error: "Página, conteúdo e versão são obrigatórios." }, 400);
    }
    const { data, error } = await identity.admin.rpc("cms_retire_managed_page", {
      p_actor_id: identity.user.id, p_item_id: parsed.itemId, p_slug: parsed.slug,
      p_payload: parsed.payload, p_expected_lock_version: parsed.expectedLockVersion,
      p_reason: parsed.reason ?? "Retirada governada de página",
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
  if (parsed.action === "hard_delete" || parsed.action === "reopen") {
    if (!parsed.itemId) return json(req, { error: "Conteúdo obrigatório." }, 400);
    const functionName = parsed.action === "hard_delete" ? "cms_hard_delete_draft" : "cms_reopen_site_builder";
    const { data, error } = await identity.admin.rpc(functionName, {
      p_actor_id: identity.user.id, p_item_id: parsed.itemId,
      p_reason: parsed.reason ?? (parsed.action === "hard_delete" ? "Exclusão definitiva de rascunho nunca publicado" : "Abrir nova versão de conteúdo publicado"),
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
  const { data, error } = await identity.admin.rpc("cms_execute_editorial_command", {
    p_actor_id: identity.user.id, p_action: parsed.action, p_item_id: parsed.itemId ?? null,
    p_content_type: parsed.contentType ?? null, p_slug: parsed.slug ?? null, p_payload: effectivePayload ?? null,
    p_expected_lock_version: parsed.expectedLockVersion ?? null, p_revision_id: parsed.revisionId ?? null,
    p_reason: parsed.reason ?? "Operação editorial sintética", p_publish_at: parsed.publishAt ?? null,
    p_aal: identity.claims.aal, p_session_id: identity.claims.sessionId, p_issued_at: identity.claims.issuedAt,
    p_idempotency_key: idempotencyKey, p_correlation_id: correlationId,
  });
  if (error) {
    const knownCode = ["CMS_COMMAND_FORBIDDEN", "CMS_CONTENT_CONFLICT", "CMS_CONTENT_NOT_FOUND",
      "CMS_CONTENT_SCHEMA_INVALID", "CMS_CONTENT_PROVENANCE_INVALID", "CMS_CONSUMER_UNAVAILABLE",
      "CMS_BLOCK_WITHOUT_RENDERER", "CMS_TRANSITION_INVALID", "CMS_REVISION_NOT_FOUND"]
      .find((candidate) => error.message.includes(candidate));
    const constraint = error.message.match(/constraint [\"']([^\"']+)[\"']/i)?.[1];
    const code = error.message.includes("FORBIDDEN") ? 403 : error.message.includes("CONFLICT") || error.code === "40001" ? 409 :
      error.message.includes("NOT_FOUND") ? 404 : error.code === "23514" || error.code === "22023" ? 422 : 500;
    return json(req, { error: code === 403 ? "Permissão insuficiente." : code === 409 ? "O conteúdo foi alterado em outra sessão." :
      code === 404 ? "Conteúdo não encontrado." : code === 422 ? "Transição ou conteúdo inválido." : "Falha editorial.",
      correlationId, code: knownCode ?? error.code, constraint }, code);
  }
  return json(req, { ...data, correlationId });
});
