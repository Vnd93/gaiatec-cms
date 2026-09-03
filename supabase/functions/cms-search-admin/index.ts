import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { z } from "npm:zod@4.4.3";
import { authenticateCms } from "../_shared/cms-auth.ts";
import { sanitizePublicPayload } from "../_shared/cms-public-projection.ts";
import { clientAddress, consumeRateLimit, corsHeaders, isAllowedOrigin, json, readJsonLimited } from "../_shared/security.ts";

const Uuid = z.uuid();
const Envelope = z.object({ schemaVersion: z.literal(1), commandId: Uuid, correlationId: Uuid, occurredAt: z.iso.datetime(), actorContext: z.object({ environment: z.enum(["local","staging","production"]), siteKey: z.literal("main") }).strict() }).strict();
const Legacy = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list") }).strict(), z.object({ action: z.literal("analytics") }).strict(),
  z.object({ action: z.literal("upsert"), id: Uuid.optional(), canonicalTerm: z.string().trim().min(1).max(120), aliases: z.array(z.string().trim().min(1).max(120)).min(1).max(50), scope: z.enum(["all","product","service","industry","application","solution"]), sourceReference: z.string().trim().min(3).max(300), active: z.boolean() }).strict(),
  z.object({ action: z.literal("remove"), id: Uuid }).strict(),
]);
const V2 = z.discriminatedUnion("action", [
  z.object({ action: z.literal("capability"), envelope: Envelope }).strict(),
  z.object({ action: z.literal("admin_search"), envelope: Envelope, query: z.string().trim().max(300).default(""), contentTypes: z.array(z.enum(["product","service","industry","application","solution","post","page","homepage"])).max(8).default([]), limit: z.number().int().min(1).max(100).default(30) }).strict(),
  z.object({ action: z.literal("list_governance"), envelope: Envelope }).strict(),
  z.object({ action: z.literal("upsert_synonym"), envelope: Envelope, id: Uuid.optional(), expectedVersion: z.number().int().positive().optional(), canonicalTerm: z.string().trim().min(1).max(120), aliases: z.array(z.string().trim().min(1).max(120)).min(1).max(50), scope: z.enum(["all","product","service","industry","application","solution"]), sourceReference: z.string().trim().min(3).max(300), reason: z.string().trim().min(3).max(500), owner: z.string().trim().min(2).max(120), startsAt: z.iso.datetime({ offset: true }), expiresAt: z.iso.datetime({ offset: true }), active: z.boolean().default(true) }).strict().refine((value) => Date.parse(value.expiresAt) > Date.parse(value.startsAt)).refine((value) => !value.id || value.expectedVersion !== undefined),
  z.object({ action: z.literal("upsert_rule"), envelope: Envelope, id: Uuid.optional(), expectedVersion: z.number().int().positive().optional(), kind: z.enum(["pin","bury","redirect"]), query: z.string().trim().min(1).max(300), targetItemId: Uuid.nullable().optional(), redirectPath: z.string().regex(/^\/[a-z0-9/_-]*$/).nullable().optional(), reason: z.string().trim().min(3).max(500), owner: z.string().trim().min(2).max(120), startsAt: z.iso.datetime({ offset: true }), expiresAt: z.iso.datetime({ offset: true }), active: z.boolean().default(true) }).strict().refine((value) => Date.parse(value.expiresAt) > Date.parse(value.startsAt)).refine((value) => value.kind === "redirect" ? Boolean(value.redirectPath) && !value.targetItemId : Boolean(value.targetItemId) && !value.redirectPath).refine((value) => !value.id || value.expectedVersion !== undefined),
  z.object({ action: z.literal("reindex"), envelope: Envelope, reason: z.string().trim().min(3).max(500) }).strict(),
]);
type Identity = NonNullable<Awaited<ReturnType<typeof authenticateCms>>>;
const normalize = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[₂]/g, "2").replace(/[–—]/g, "-").replace(/\bdn\s+(\d+)/g, "dn$1").replace(/4\s*-\s*20\s*ma/g, "4-20ma").replace(/[^a-z0-9%/.-]+/g, " ").trim();
const routeFor = (row: any) => row.content_type === "product" ? `/produtos/${row.slug}` : row.content_type === "industry" ? `/industrias/${row.slug}` : row.content_type === "application" ? `/aplicacoes/${row.slug}` : row.content_type === "solution" ? `/solucoes/${row.slug}` : row.content_type === "service" ? `/servicos/${row.slug}` : row.content_type === "post" ? `/blog/${row.slug}` : row.payload?.route?.path ?? "/";
const readPermission: Record<string,string> = { product: "cms:products.read", service: "cms:services.read", industry: "cms:industries.read", application: "cms:applications.read", solution: "cms:solutions.read", post: "cms:posts.read", page: "cms:pages.read", homepage: "cms:homepage.read" };

async function authorized(identity: Identity, permission: string) {
  const { data } = await identity.admin.rpc("cms_actor_authorized", { p_actor_id: identity.user.id, p_permission: permission, p_aal: identity.claims.aal, p_session_id: identity.claims.sessionId, p_issued_at: identity.claims.issuedAt });
  return data === true;
}
async function capability(identity: Identity, environment: string) {
  return identity.admin.rpc("cms_evaluate_feature_flag", { p_actor_id: identity.user.id, p_flag_key: "ev2.search_quality", p_environment: environment, p_site_key: "main", p_aal: identity.claims.aal, p_session_id: identity.claims.sessionId, p_issued_at: identity.claims.issuedAt });
}
function publicFacetDocument(payload: Record<string, any>) {
  const controlled = payload.controlledClassification ?? {};
  return Object.fromEntries(Object.entries({ productCategory: controlled.productCategory?.label, applicationMagnitude: controlled.applicationMagnitude?.label, technology: controlled.technology?.label, installationOperation: controlled.installationOperation?.label, monitoredElement: controlled.monitoredElement?.label, serviceKind: payload.serviceKindRef?.label ?? payload.serviceKind, market: payload.marketName }).filter(([, value]) => typeof value === "string" && value.trim()).map(([key, value]) => [key, [value]]));
}
function flattenPublicText(value: unknown, output: string[] = []): string[] {
  if (typeof value === "string" || typeof value === "number") output.push(String(value));
  else if (Array.isArray(value)) value.forEach((entry) => flattenPublicText(entry, output));
  else if (value && typeof value === "object") Object.values(value as Record<string, unknown>).forEach((entry) => flattenPublicText(entry, output));
  return output;
}

async function rebuildIndex(identity: Identity, reason: string, correlationId: string) {
  const reindexStartedAt = new Date().toISOString();
  const { data: pending } = await identity.admin.from("cms_search_index_jobs").select("id,status").in("status", ["pending","running"]).order("created_at").limit(1).maybeSingle();
  if (pending?.status === "running") throw new Error("CMS_SEARCH_REINDEX_IN_PROGRESS");
  const jobOperation = pending
    ? identity.admin.from("cms_search_index_jobs").update({ status: "running", reason, requested_by: identity.user.id, correlation_id: correlationId, started_at: new Date().toISOString() }).eq("id", pending.id).eq("status", "pending").select("id").single()
    : identity.admin.from("cms_search_index_jobs").insert({ status: "running", reason, requested_by: identity.user.id, correlation_id: correlationId, started_at: new Date().toISOString() }).select("id").single();
  const { data: job, error: jobError } = await jobOperation;
  if (jobError || !job) throw jobError ?? new Error("CMS_SEARCH_JOB_FAILED");
  try {
    const rows: any[] = [];
    const pageSize = 1_000;
    for (let offset = 0; ; offset += pageSize) {
      const { data: page, error } = await identity.admin.from("cms_published_projection").select("item_id,revision_id,content_type,slug,payload,etag").in("content_type", Object.keys(readPermission)).order("item_id").range(offset, offset + pageSize - 1);
      if (error) throw error;
      rows.push(...(page ?? []));
      if ((page ?? []).length < pageSize) break;
    }
    const productItemIds = rows.filter((row) => row.content_type === "product").map((row) => row.item_id);
    const { data: pimProducts } = productItemIds.length ? await identity.admin.from("cms_pim_products").select("id,content_item_id").in("content_item_id", productItemIds).eq("status", "active") : { data: [] };
    const productIds = (pimProducts ?? []).map((row) => row.id), pimByItem = new Map((pimProducts ?? []).map((row) => [row.content_item_id, row.id]));
    const [{ data: values }, { data: definitions }] = await Promise.all([
      productIds.length ? identity.admin.from("cms_pim_attribute_values").select("product_id,definition_id,canonical_min,canonical_max,unit_code,value").in("product_id", productIds).eq("active", true).eq("homologated", true) : Promise.resolve({ data: [] as any[] }),
      identity.admin.from("cms_pim_attribute_definitions").select("id,attribute_key,data_type,searchable,filterable,status").eq("status", "active"),
    ]);
    const definitionById = new Map((definitions ?? []).map((entry) => [entry.id, entry]));
    const technicalByProduct = new Map<string, Record<string, any[]>>();
    for (const value of values ?? []) {
      const definition = definitionById.get(value.definition_id);
      if (!definition || (!definition.searchable && !definition.filterable)) continue;
      const ranges = technicalByProduct.get(value.product_id) ?? {};
      const min = value.canonical_min === null ? undefined : Number(value.canonical_min), max = value.canonical_max === null ? undefined : Number(value.canonical_max);
      if (min !== undefined || max !== undefined) (ranges[definition.attribute_key] ??= []).push({ min: min ?? max, max: max ?? min, unit: value.unit_code ?? undefined });
      technicalByProduct.set(value.product_id, ranges);
    }
    const documents = rows.map((row) => {
      const payload = sanitizePublicPayload(row.payload, { includeSearchMetadata: true }), pimId = pimByItem.get(row.item_id);
      return { item_id: row.item_id, revision_id: row.revision_id, content_type: row.content_type, slug: row.slug, public_path: routeFor({ ...row, payload }), title: String(payload.title ?? row.slug).slice(0, 300), summary: typeof payload.summary === "string" ? payload.summary.slice(0, 1000) : null, searchable_text: normalize(flattenPublicText(payload).join(" ")).slice(0, 64_000), facets: publicFacetDocument(payload), technical_ranges: pimId ? technicalByProduct.get(pimId) ?? {} : {}, source_etag: row.etag, indexed_at: reindexStartedAt };
    });
    for (let index = 0; index < documents.length; index += 500) {
      const { error: upsertError } = await identity.admin.from("cms_search_documents").upsert(documents.slice(index, index + 500), { onConflict: "item_id" });
      if (upsertError) throw upsertError;
    }
    await identity.admin.from("cms_search_documents").delete().lt("indexed_at", reindexStartedAt);
    const { error: pruneError } = await identity.admin.rpc("cms_prune_stale_search_documents");
    if (pruneError) throw pruneError;
    await identity.admin.from("cms_search_index_jobs").update({ status: "completed", documents_indexed: documents.length, completed_at: new Date().toISOString() }).eq("id", job.id);
    await identity.admin.from("cms_audit_log").insert({ actor_id: identity.user.id, action: "cms:search.reindexed", target_type: "search_index", target_id: job.id, correlation_id: correlationId, event_data: { documentsIndexed: documents.length, reason } });
    return { jobId: job.id, documentsIndexed: documents.length };
  } catch (error) {
    await identity.admin.from("cms_search_index_jobs").update({ status: "failed", error_code: "CMS_SEARCH_REINDEX_FAILED", completed_at: new Date().toISOString() }).eq("id", job.id);
    throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (!isAllowedOrigin(req)) return json(req, { error: "Origem não autorizada." }, 403);
  if (req.method !== "POST") return json(req, { error: "Método não permitido." }, 405);
  const identity = await authenticateCms(req); if (!identity) return json(req, { error: "Sessão inválida." }, 401);
  let raw: unknown;
  try { raw = await readJsonLimited(req, 65_536); }
  catch { return json(req, { error: "Comando de busca inválido." }, 400); }
  const legacy = Legacy.safeParse(raw);
  if (legacy.success) {
    const input = legacy.data, permission = input.action === "analytics" ? "cms:search.analytics" : input.action === "list" ? "cms:search.read" : "cms:search.manage";
    if (!(await authorized(identity, permission))) return json(req, { error: "Permissão insuficiente." }, 403);
    if (input.action === "list") { const { data, error } = await identity.admin.from("cms_search_synonyms").select("*").order("canonical_term"); return error ? json(req, { error: "Busca indisponível." }, 503) : json(req, { items: data ?? [] }); }
    if (input.action === "analytics") { const { data, error } = await identity.admin.from("cms_search_events").select("normalized_query,result_count,content_types,refinements,occurred_at").eq("result_count", 0).order("occurred_at", { ascending: false }).limit(100); return error ? json(req, { error: "Analytics indisponível." }, 503) : json(req, { zeroResults: data ?? [] }); }
    const correlationId = crypto.randomUUID();
    if (input.action === "remove") { const { error } = await identity.admin.from("cms_search_synonyms").delete().eq("id", input.id); if (error) return json(req, { error: "Sinônimo não removido." }, 422); await identity.admin.from("cms_audit_log").insert({ actor_id: identity.user.id, action: "cms:search.synonym_removed", target_type: "search_synonym", target_id: input.id, correlation_id: correlationId }); return json(req, { ok: true, correlationId }); }
    const payload = { canonical_term: normalize(input.canonicalTerm), aliases: input.aliases.map(normalize), scope: input.scope, source_reference: input.sourceReference, reason: input.sourceReference, owner_key: "legacy-ui", starts_at: new Date().toISOString(), active: input.active, updated_by: identity.user.id, ...(!input.id ? { created_by: identity.user.id } : {}) };
    const query = input.id ? identity.admin.from("cms_search_synonyms").update(payload).eq("id", input.id).select().single() : identity.admin.from("cms_search_synonyms").insert(payload).select().single();
    const { data, error } = await query; if (error) return json(req, { error: "Sinônimo não salvo." }, 422); return json(req, { item: data, correlationId }, input.id ? 200 : 201);
  }
  const parsed = V2.safeParse(raw);
  if (!parsed.success) return json(req, { error: "Comando de busca inválido." }, 400);
  const command = parsed.data, { environment } = command.envelope.actorContext, correlationId = command.envelope.correlationId;
  if (environment === "production") return json(req, { error: "Produção indisponível nesta fase.", code: "CMS_SEARCH_PRODUCTION_GATED", correlationId }, 403);
  if (Deno.env.get("CMS_ENVIRONMENT") !== environment) return json(req, { error: "Escopo não autorizado.", code: "CMS_SEARCH_SCOPE_MISMATCH", correlationId }, 403);
  if (command.action === "capability") {
    const { data: feature, error: featureError } = await capability(identity, environment);
    if (featureError) return json(req, { error: "Capacidade indisponível.", correlationId }, 503);
    return json(req, { ...feature, commandId: command.envelope.commandId, correlationId });
  }
  if (command.action === "admin_search") {
    const requested = command.contentTypes.length ? command.contentTypes : Object.keys(readPermission);
    let featureResult: Awaited<ReturnType<typeof capability>>;
    let access: (boolean | null)[];
    try {
      [featureResult, access] = await Promise.all([
        capability(identity, environment),
        Promise.all([
          consumeRateLimit(identity.admin, req, "cms_search_admin_search", `${identity.user.id}:${clientAddress(req)}`, 120, 900),
          authorized(identity, "cms:search.read"),
          ...requested.map(async (type) => await authorized(identity, readPermission[type]) ? true : null),
        ]),
      ]);
    } catch {
      return json(req, { error: "Proteção temporariamente indisponível.", correlationId }, 503);
    }
    if (featureResult.error) return json(req, { error: "Capacidade indisponível.", correlationId }, 503);
    if (featureResult.data?.enabled !== true) return json(req, { error: "Busca v2 não habilitada.", code: "CMS_SEARCH_FEATURE_DISABLED", correlationId }, 403);
    if (access[0] !== true) return json(req, { error: "Muitas operações. Aguarde.", correlationId }, 429);
    if (access[1] !== true) return json(req, { error: "Permissão insuficiente." }, 403);
    const allowedTypes = requested.filter((_, index) => access[index + 2] === true);
    if (!allowedTypes.length) return json(req, { items: [], total: 0, correlationId });
    const { data, error } = await identity.admin.rpc("cms_search_v2", { p_query: normalize(command.query), p_content_types: allowedTypes, p_facets: {}, p_ranges: {}, p_limit: command.limit, p_offset: 0 });
    return error ? json(req, { error: "Busca administrativa indisponível.", correlationId }, 503) : json(req, { items: data ?? [], total: Number(data?.[0]?.total_count ?? 0), correlationId });
  }
  const { data: feature, error: featureError } = await capability(identity, environment);
  if (featureError) return json(req, { error: "Capacidade indisponível.", correlationId }, 503);
  if (feature?.enabled !== true) return json(req, { error: "Busca v2 não habilitada.", code: "CMS_SEARCH_FEATURE_DISABLED", correlationId }, 403);
  try { const allowed = await consumeRateLimit(identity.admin, req, `cms_search_${command.action}`, `${identity.user.id}:${clientAddress(req)}`, 40, 900); if (!allowed) return json(req, { error: "Muitas operações. Aguarde.", correlationId }, 429); }
  catch { return json(req, { error: "Proteção temporariamente indisponível.", correlationId }, 503); }
  if (command.action === "list_governance") {
    if (!(await authorized(identity, "cms:search.read"))) return json(req, { error: "Permissão insuficiente." }, 403);
    const [rules, synonyms, jobs] = await Promise.all([identity.admin.from("cms_search_rules").select("*").order("updated_at", { ascending: false }).limit(100), identity.admin.from("cms_search_synonyms").select("*").order("canonical_term"), identity.admin.from("cms_search_index_jobs").select("*").order("created_at", { ascending: false }).limit(10)]);
    return json(req, { rules: rules.data ?? [], synonyms: synonyms.data ?? [], jobs: jobs.data ?? [], correlationId });
  }
  if (command.action === "upsert_synonym") {
    if (!(await authorized(identity, "cms:search.manage"))) return json(req, { error: "Permissão insuficiente." }, 403);
    const payload = { canonical_term: normalize(command.canonicalTerm), aliases: command.aliases.map(normalize).filter(Boolean), scope: command.scope, source_reference: command.sourceReference, reason: command.reason, owner_key: command.owner, starts_at: command.startsAt, expires_at: command.expiresAt, active: command.active, updated_by: identity.user.id, ...(!command.id ? { created_by: identity.user.id } : {}) };
    if (!payload.canonical_term || !payload.aliases.length) return json(req, { error: "Sinônimo normalizado vazio.", correlationId }, 422);
    const operation = command.id ? identity.admin.from("cms_search_synonyms").update({ ...payload, lock_version: command.expectedVersion! + 1 }).eq("id", command.id).eq("lock_version", command.expectedVersion!).select().single() : identity.admin.from("cms_search_synonyms").insert(payload).select().single();
    const { data, error } = await operation; if (error) return json(req, { error: error.code === "PGRST116" ? "Sinônimo alterado por outra sessão." : "Sinônimo não salvo.", code: error.code === "PGRST116" ? "CMS_SEARCH_CONFLICT" : undefined, correlationId }, error.code === "PGRST116" ? 409 : 422);
    await identity.admin.from("cms_audit_log").insert({ actor_id: identity.user.id, action: "cms:search.synonym_saved", target_type: "search_synonym", target_id: data.id, correlation_id: correlationId, event_data: { scope: command.scope, reason: command.reason, owner: command.owner, startsAt: command.startsAt, expiresAt: command.expiresAt } });
    return json(req, { item: data, correlationId }, command.id ? 200 : 201);
  }
  if (command.action === "upsert_rule") {
    if (!(await authorized(identity, "cms:search.manage"))) return json(req, { error: "Permissão insuficiente." }, 403);
    const payload = { rule_kind: command.kind, normalized_query: normalize(command.query), target_item_id: command.targetItemId ?? null, redirect_path: command.redirectPath ?? null, reason: command.reason, owner_key: command.owner, starts_at: command.startsAt, expires_at: command.expiresAt, active: command.active, updated_by: identity.user.id, ...(!command.id ? { created_by: identity.user.id } : {}) };
    const operation = command.id ? identity.admin.from("cms_search_rules").update({ ...payload, lock_version: command.expectedVersion! + 1 }).eq("id", command.id).eq("lock_version", command.expectedVersion!).select().single() : identity.admin.from("cms_search_rules").insert(payload).select().single();
    const { data, error } = await operation; if (error) return json(req, { error: error.code === "PGRST116" ? "Regra alterada por outra sessão." : "Regra não salva.", code: error.code === "PGRST116" ? "CMS_SEARCH_CONFLICT" : undefined, correlationId }, error.code === "PGRST116" ? 409 : 422);
    await identity.admin.from("cms_audit_log").insert({ actor_id: identity.user.id, action: "cms:search.rule_saved", target_type: "search_rule", target_id: data.id, correlation_id: correlationId, event_data: { kind: command.kind, reason: command.reason, owner: command.owner, startsAt: command.startsAt, expiresAt: command.expiresAt } });
    return json(req, { item: data, correlationId }, command.id ? 200 : 201);
  }
  if (!(await authorized(identity, "cms:search.reindex"))) return json(req, { error: "Permissão insuficiente." }, 403);
  try { return json(req, { ...(await rebuildIndex(identity, command.reason, correlationId)), correlationId }); }
  catch { return json(req, { error: "Reconstrução do índice falhou sem afetar a busca v1.", code: "CMS_SEARCH_REINDEX_FAILED", correlationId }, 500); }
});
