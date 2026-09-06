import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { z } from "npm:zod@4.4.3";
import { authenticateCms } from "../_shared/cms-auth.ts";
import { isProductionOperationEnabled } from "../_shared/ev2-environment.ts";
import { evaluateQuality, qualityStatus } from "../_shared/cms-quality-rules.ts";
import { clientAddress, consumeRateLimit, corsHeaders, isAllowedOrigin, json, readJsonLimited, sha256 } from "../_shared/security.ts";

const Uuid = z.uuid();
const Envelope = z.object({
  schemaVersion: z.literal(1), commandId: Uuid, correlationId: Uuid, occurredAt: z.iso.datetime(),
  actorContext: z.object({ environment: z.enum(["local","staging","production"]), siteKey: z.literal("main") }).strict(),
}).strict();
const Command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("capability"), envelope: Envelope }).strict(),
  z.object({ action: z.literal("list"), envelope: Envelope, itemId: Uuid.optional(), limit: z.number().int().min(1).max(100).default(30) }).strict(),
  z.object({ action: z.literal("run"), envelope: Envelope, itemId: Uuid, trigger: z.enum(["manual","release"]).default("manual") }).strict(),
  z.object({ action: z.literal("waive"), envelope: Envelope, itemId: Uuid, ruleKey: z.string().regex(/^[a-z][a-z0-9_.-]{2,119}$/), reason: z.string().trim().min(3).max(500), expiresAt: z.iso.datetime({ offset: true }) }).strict()
    .refine((value) => Date.parse(value.expiresAt) > Date.now(), "A exceção precisa expirar no futuro."),
]);
type Identity = NonNullable<Awaited<ReturnType<typeof authenticateCms>>>;

async function authorized(identity: Identity, permission: string) {
  const { data } = await identity.admin.rpc("cms_actor_authorized", {
    p_actor_id: identity.user.id, p_permission: permission, p_aal: identity.claims.aal,
    p_session_id: identity.claims.sessionId, p_issued_at: identity.claims.issuedAt,
  });
  return data === true;
}

async function evaluateCapability(identity: Identity, environment: string) {
  return identity.admin.rpc("cms_evaluate_feature_flag", {
    p_actor_id: identity.user.id, p_flag_key: "ev2.search_quality", p_environment: environment,
    p_site_key: "main", p_aal: identity.claims.aal, p_session_id: identity.claims.sessionId,
    p_issued_at: identity.claims.issuedAt,
  });
}

async function persistRun(identity: Identity, itemId: string, trigger: "manual" | "release", correlationId: string) {
  const [{ data: item }, { data: draft }, { data: waivers }] = await Promise.all([
    identity.admin.from("cms_content_items").select("id").eq("id", itemId).maybeSingle(),
    identity.admin.from("cms_content_drafts").select("payload,seo").eq("item_id", itemId).maybeSingle(),
    identity.admin.from("cms_quality_waivers").select("rule_key").eq("item_id", itemId).gt("expires_at", new Date().toISOString()),
  ]);
  if (!item || !draft) throw new Error("CMS_QUALITY_ITEM_NOT_FOUND");
  const waivedRules = new Set((waivers ?? []).map((entry) => entry.rule_key));
  const findings = evaluateQuality(draft.payload, draft.seo).map((entry) => ({ ...entry, waived: waivedRules.has(entry.ruleKey) }));
  const effective = findings.filter((entry) => !entry.waived);
  const status = qualityStatus(effective);
  const counts = {
    errors: effective.filter((entry) => entry.severity === "error").length,
    warnings: effective.filter((entry) => entry.severity === "warning").length,
    recommendations: effective.filter((entry) => entry.severity === "recommendation").length,
    waived: findings.filter((entry) => entry.waived).length,
  };
  const { data: run, error } = await identity.admin.rpc("cms_record_quality_run", {
    p_item_id: itemId, p_revision_id: null, p_trigger_kind: trigger, p_status: status,
    p_counts: counts, p_findings: findings, p_actor_id: identity.user.id, p_correlation_id: correlationId,
  });
  if (error || !run) throw error ?? new Error("CMS_QUALITY_RUN_FAILED");
  return { schemaVersion: 1, runId: run.runId, itemId, rulesetVersion: "v1", status, counts, findings, checkedAt: run.checkedAt, correlationId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (!isAllowedOrigin(req)) return json(req, { error: "Origem não autorizada." }, 403);
  if (req.method !== "POST") return json(req, { error: "Método não permitido." }, 405);
  const identity = await authenticateCms(req);
  if (!identity) return json(req, { error: "Sessão inválida." }, 401);
  let command: z.infer<typeof Command>;
  try { command = Command.parse(await readJsonLimited(req, 32_768)); }
  catch { return json(req, { error: "Comando de qualidade inválido." }, 400); }
  const { environment } = command.envelope.actorContext, correlationId = command.envelope.correlationId;
  if (environment === "production" && !isProductionOperationEnabled(environment)) return json(req, { error: "Produção indisponível nesta fase.", code: "CMS_QUALITY_PRODUCTION_GATED", correlationId }, 403);
  if (Deno.env.get("CMS_ENVIRONMENT") !== environment) return json(req, { error: "Escopo não autorizado.", code: "CMS_QUALITY_SCOPE_MISMATCH", correlationId }, 403);
  const { data: capability, error: capabilityError } = await evaluateCapability(identity, environment);
  if (capabilityError) return json(req, { error: "Capacidade indisponível.", correlationId }, 503);
  if (command.action === "capability") return json(req, { ...capability, commandId: command.envelope.commandId, correlationId });
  if (capability?.enabled !== true) return json(req, { error: "Centro de Qualidade não habilitado.", code: "CMS_QUALITY_FEATURE_DISABLED", correlationId }, 403);
  const permission = command.action === "list" ? "cms:quality.read" : command.action === "waive" ? "cms:quality.waive" : "cms:quality.run";
  if (!(await authorized(identity, permission))) return json(req, { error: "Permissão insuficiente.", code: "CMS_QUALITY_FORBIDDEN", correlationId }, 403);
  try {
    const allowed = await consumeRateLimit(identity.admin, req, `cms_quality_${command.action}`, `${identity.user.id}:${clientAddress(req)}`, command.action === "list" ? 120 : 40, 900);
    if (!allowed) return json(req, { error: "Muitas operações. Aguarde.", correlationId }, 429);
  } catch { return json(req, { error: "Proteção temporariamente indisponível.", correlationId }, 503); }

  if (command.action === "list") {
    let query = identity.admin.from("cms_quality_runs").select("id,item_id,ruleset_version,trigger_kind,status,finding_counts,checked_at").order("checked_at", { ascending: false }).limit(command.limit);
    if (command.itemId) query = query.eq("item_id", command.itemId);
    const { data, error } = await query;
    if (error) return json(req, { error: "Resultados indisponíveis.", correlationId }, 503);
    return json(req, { items: data ?? [], correlationId });
  }

  const idempotencyKey = req.headers.get("X-Idempotency-Key");
  if (!idempotencyKey || !Uuid.safeParse(idempotencyKey).success) return json(req, { error: "Chave idempotente obrigatória." }, 400);
  const requestHash = await sha256(JSON.stringify(command));
  const { data: receipt } = await identity.admin.from("cms_quality_command_receipts").select("request_hash,response").eq("actor_id", identity.user.id).eq("action", command.action).eq("idempotency_key", idempotencyKey).maybeSingle();
  if (receipt?.request_hash !== undefined) {
    if (receipt.request_hash !== requestHash) return json(req, { error: "Chave idempotente reutilizada com outro comando.", code: "CMS_QUALITY_IDEMPOTENCY_CONFLICT", correlationId }, 409);
    if (receipt.response) return json(req, receipt.response);
    return json(req, { error: "Comando idempotente ainda em processamento.", code: "CMS_QUALITY_COMMAND_IN_PROGRESS", correlationId }, 409);
  } else {
    const { error } = await identity.admin.from("cms_quality_command_receipts").insert({ actor_id: identity.user.id, action: command.action, idempotency_key: idempotencyKey, request_hash: requestHash });
    if (error) return json(req, { error: "Conflito idempotente.", correlationId }, 409);
  }
  try {
    let response: Record<string, unknown>;
    if (command.action === "waive") {
      const { data, error } = await identity.admin.from("cms_quality_waivers").insert({ item_id: command.itemId, rule_key: command.ruleKey, reason: command.reason, expires_at: command.expiresAt, created_by: identity.user.id, correlation_id: correlationId }).select("id,item_id,rule_key,reason,expires_at,created_at").single();
      if (error) throw error;
      await identity.admin.from("cms_audit_log").insert({ actor_id: identity.user.id, action: "cms:quality.waived", target_type: "content_item", target_id: command.itemId, correlation_id: correlationId, event_data: { ruleKey: command.ruleKey, expiresAt: command.expiresAt, reason: command.reason } });
      response = { waiver: data, correlationId };
    } else response = await persistRun(identity, command.itemId, command.trigger, correlationId);
    await identity.admin.from("cms_quality_command_receipts").update({ response, completed_at: new Date().toISOString() }).eq("actor_id", identity.user.id).eq("action", command.action).eq("idempotency_key", idempotencyKey);
    return json(req, response, command.action === "waive" ? 201 : 200);
  } catch (error) {
    await identity.admin.from("cms_quality_command_receipts").delete().eq("actor_id", identity.user.id).eq("action", command.action).eq("idempotency_key", idempotencyKey).is("completed_at", null);
    const missing = error instanceof Error && error.message.includes("ITEM_NOT_FOUND");
    return json(req, { error: missing ? "Conteúdo não encontrado." : "Verificação de qualidade indisponível.", correlationId }, missing ? 404 : 500);
  }
});
