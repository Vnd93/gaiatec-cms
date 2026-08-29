import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { z } from "npm:zod@4.4.3";
import { authenticateCms } from "../_shared/cms-auth.ts";
import { clientAddress, consumeRateLimit, corsHeaders, isAllowedOrigin, json, readJsonLimited } from "../_shared/security.ts";

const Uuid = z.uuid();
const Command = z.object({
  action: z.enum(["create", "save", "submit", "approve", "schedule", "publish", "restore", "archive", "trash"]),
  itemId: Uuid.nullish(), contentType: z.enum(["product", "service", "industry", "application", "solution", "post", "page", "homepage"]).nullish(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160).nullish(), payload: z.record(z.string(), z.unknown()).nullish(),
  expectedLockVersion: z.number().int().positive().nullish(), revisionId: Uuid.nullish(), reason: z.string().trim().min(3).max(500).nullish(),
  publishAt: z.iso.datetime().nullish(),
}).strict();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (!isAllowedOrigin(req)) return json(req, { error: "Origem não autorizada." }, 403);
  if (req.method !== "POST") return json(req, { error: "Método não permitido." }, 405);
  const identity = await authenticateCms(req);
  if (!identity) return json(req, { error: "Sessão inválida." }, 401);
  const idempotencyKey = req.headers.get("X-Idempotency-Key");
  if (!idempotencyKey || !Uuid.safeParse(idempotencyKey).success) return json(req, { error: "Chave idempotente obrigatória." }, 400);
  let parsed: z.infer<typeof Command>;
  try { parsed = Command.parse(await readJsonLimited(req, 131072)); }
  catch { return json(req, { error: "Comando editorial inválido." }, 400); }
  try {
    const allowed = await consumeRateLimit(identity.admin, req, "cms_content_" + parsed.action,
      identity.user.id + ":" + clientAddress(req), 120, 900);
    if (!allowed) return json(req, { error: "Muitas operações. Aguarde." }, 429);
  } catch { return json(req, { error: "Proteção temporariamente indisponível." }, 503); }
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
  const { data, error } = await identity.admin.rpc("cms_execute_editorial_command", {
    p_actor_id: identity.user.id, p_action: parsed.action, p_item_id: parsed.itemId ?? null,
    p_content_type: parsed.contentType ?? null, p_slug: parsed.slug ?? null, p_payload: parsed.payload ?? null,
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
