import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { containsInternalProductValue, sanitizePublicPayload, sanitizePublicSeo } from "../_shared/cms-public-projection.ts";
import { resolveMediaAssets } from "../_shared/cms-media-resolution.ts";
import { deterministicSeoDefaults } from "../_shared/cms-seo-defaults.ts";

const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "apikey, authorization, content-type, if-none-match, x-client-info", "Access-Control-Allow-Methods": "GET, OPTIONS", Vary: "Origin" };
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8", ...extra } });
const normalize = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[₂]/g, "2").replace(/[–—]/g, "-").replace(/\bdn\s+(\d+)/g, "dn$1").replace(/4\s*-\s*20\s*ma/g, "4-20ma").replace(/[^a-z0-9%/.-]+/g, " ").trim();
const publicTypes = ["product", "service", "industry", "application", "solution", "post", "campaign", "page", "homepage", "navigation", "site_settings", "placement"];
const searchableTypes = ["product", "service", "industry", "application", "solution", "post", "page", "homepage"];
const routeFor = (row: any) => row.content_type === "product" ? `/produtos/${row.slug}` : row.content_type === "industry" ? `/industrias/${row.slug}` : row.content_type === "application" ? `/aplicacoes/${row.slug}` : row.content_type === "solution" ? `/solucoes/${row.slug}` : row.content_type === "service" ? `/servicos/${row.slug}` : row.content_type === "post" ? `/blog/${row.slug}` : row.payload?.route?.path ?? "/";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "GET") return json({ error: "Método não permitido." }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anon) return json({ error: "Serviço indisponível." }, 503);
  const url = new URL(req.url), type = url.searchParams.get("type") ?? "detail";
  const client = createClient(supabaseUrl, service ?? anon, { auth: { persistSession: false } });
  const enrichMedia = async (row: any) => {
    const payload = sanitizePublicPayload(row.payload);
    const media = payload.media ?? [];
    const blockAssetIds = (payload.blocks ?? []).flatMap((block: any) => [block.data?.assetId, ...(block.data?.assetIds ?? []), ...(block.data?.items ?? []).map((item: any) => item.assetId)].filter(Boolean));
    const assetIds = [...new Set([...media.map((entry: any) => entry.assetId), ...blockAssetIds, row.seo?.ogImageId].filter(Boolean))];
    const primaryId = media.find((entry: any) => entry.role === "primary")?.assetId;
    const { mediaUrls, mediaAlt } = await resolveMediaAssets(client, assetIds, primaryId, 3600);
    const documentUrls: Record<string, string> = {};
    const publicDocumentIds = new Set((payload.documents ?? []).map((document: any) => document.id));
    const documents = (row.payload?.documents ?? []).filter((document: any) => document.visibility === "public" && publicDocumentIds.has(document.id) && document.storagePath && !containsInternalProductValue(document.storagePath, row.payload));
    const { data: signedDocuments } = documents.length ? await client.storage.from("cms-documents-private").createSignedUrls(documents.map((document: any) => document.storagePath), 3600) : { data: [] };
    documents.forEach((document: any, index: number) => { const signedUrl = signedDocuments?.[index]?.signedUrl; if (signedUrl) documentUrls[document.id] = signedUrl; });
    const path = routeFor(row);
    return { ...row, payload, seo: deterministicSeoDefaults(sanitizePublicSeo(row.seo, row.payload), payload, path), path, media_urls: mediaUrls, media_alt: mediaAlt, document_urls: documentUrls };
  };
  if (type === "search-v2") {
    if (!service) return json({ error: "Busca técnica indisponível." }, 503, { "Cache-Control": "no-store" });
    const query = (url.searchParams.get("q") ?? "").trim().slice(0, 300);
    const contentTypes = (url.searchParams.get("contentTypes") ?? "").split(",").filter((value) => searchableTypes.includes(value));
    const facets: Record<string, string[]> = {};
    const ranges: Record<string, { min?: number; max?: number; unit?: string }> = {};
    for (const [key, value] of url.searchParams) {
      if (key.startsWith("facet.") && /^[a-z][a-zA-Z0-9]{1,63}$/.test(key.slice(6))) facets[key.slice(6)] = value.split("|").filter(Boolean).slice(0, 50);
      if (key.startsWith("range.") && /^[a-z][a-zA-Z0-9_.-]{1,79}$/.test(key.slice(6))) {
        const [minimum, maximum, unit] = value.split(":");
        const min = minimum === "" ? undefined : Number(minimum), max = maximum === "" ? undefined : Number(maximum);
        if ((min === undefined || Number.isFinite(min)) && (max === undefined || Number.isFinite(max)) && (min !== undefined || max !== undefined)) ranges[key.slice(6)] = { ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}), ...(unit ? { unit: unit.slice(0, 24) } : {}) };
      }
    }
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 24, 1), 100);
    const offset = Math.min(Math.max(Number(url.searchParams.get("offset")) || 0, 0), 10_000);
    const normalizedQuery = normalize(query);
    const { data: redirectRule } = normalizedQuery ? await client.from("cms_search_rules").select("redirect_path").eq("rule_kind", "redirect").eq("normalized_query", normalizedQuery).eq("active", true).lte("starts_at", new Date().toISOString()).gt("expires_at", new Date().toISOString()).maybeSingle() : { data: null };
    if (redirectRule?.redirect_path) return json({ redirect: redirectRule.redirect_path, items: [], total: 0, facets: {}, groups: {}, query }, 200, { "Cache-Control": "private, no-store" });
    const startedAt = performance.now();
    const { data: matches, error: searchError } = await client.rpc("cms_search_v2", { p_query: normalizedQuery, p_content_types: contentTypes, p_facets: facets, p_ranges: ranges, p_limit: limit, p_offset: offset });
    if (searchError) return json({ error: "Busca técnica temporariamente indisponível." }, 503, { "Cache-Control": "no-store" });
    const ids = (matches ?? []).map((entry: any) => entry.item_id);
    const { data: sourceRows, error: sourceError } = ids.length ? await client.from("cms_published_projection").select("item_id,revision_id,content_type,slug,schema_version,consumer_id,renderer_key,payload,seo,content_version,cache_tag,etag,published_at").in("item_id", ids) : { data: [], error: null };
    if (sourceError) return json({ error: "Busca técnica temporariamente indisponível." }, 503, { "Cache-Control": "no-store" });
    const rowById = new Map((sourceRows ?? []).map((row: any) => [row.item_id, row]));
    const items = (await Promise.all((matches ?? []).map(async (match: any) => {
      const row = rowById.get(match.item_id);
      return row ? { ...(await enrichMedia(row)), score: match.score, matched_by: match.matched_by, explanation: { matchedBy: match.matched_by, missingTechnicalData: Object.keys(ranges).filter((key) => !(match.technical_ranges ?? {})[key]) } } : null;
    }))).filter(Boolean);
    const groups = searchableTypes.reduce((all, key) => { all[key] = items.filter((item: any) => item.content_type === key).length; return all; }, {} as Record<string, number>);
    const availableFacets: Record<string, string[]> = {};
    for (const match of matches ?? []) for (const [key, values] of Object.entries(match.facets ?? {})) {
      const bucket = new Set(availableFacets[key] ?? []);
      (Array.isArray(values) ? values : [values]).filter((value) => typeof value === "string").forEach((value) => bucket.add(value as string));
      availableFacets[key] = [...bucket].sort();
    }
    if (query && service) {
      const analytics = client.from("cms_search_events").insert({ normalized_query: normalizedQuery, result_count: Number(matches?.[0]?.total_count ?? 0), content_types: [...new Set(items.map((item: any) => item.content_type))], refinements: { contentTypes, facets, ranges, engine: "v2", latencyMs: Math.round(performance.now() - startedAt) }, correlation_id: crypto.randomUUID() }).then(({ error }) => {
        if (error) console.error(JSON.stringify({ event: "cms.search.analytics.failed", code: error.code }));
      });
      EdgeRuntime.waitUntil(analytics);
    }
    return json({ items, total: Number(matches?.[0]?.total_count ?? 0), facets: availableFacets, groups, query, engine: "v2" }, 200, { "Cache-Control": "private, no-store", "Server-Timing": `search;dur=${Math.round(performance.now() - startedAt)}` });
  }
  if (type === "redirect") {
    const path = url.searchParams.get("path") ?? "";
    const { data: routeRule } = await client.from("cms_route_rules").select("destination_path,status_code").eq("source_path", path).eq("active", true).maybeSingle();
    if (routeRule) return json(routeRule, 200, { "Cache-Control": "public, max-age=300" });
    const { data } = await client.from("cms_redirects").select("destination_path,status_code").eq("source_path", path).eq("active", true).maybeSingle();
    return data ? json(data, 200, { "Cache-Control": "public, max-age=300" }) : json({ error: "Não encontrado." }, 404);
  }
  const { data, error } = await client.from("cms_published_projection").select("item_id,revision_id,content_type,slug,schema_version,consumer_id,renderer_key,payload,seo,content_version,cache_tag,etag,published_at").in("content_type", publicTypes).order("published_at", { ascending: false }).limit(1000);
  if (error) return json({ error: "Conteúdo temporariamente indisponível." }, 503, { "Cache-Control": "no-store" });
  const published = data ?? [];
  const campaignIsActive = (row: any, now = Date.now()) => row.content_type === "campaign" && Date.parse(row.payload?.window?.startsAt ?? "") <= now && Date.parse(row.payload?.window?.endsAt ?? "") > now;
  const resolveRelated = (row: any) => {
    const publicPayload = sanitizePublicPayload(row.payload);
    const relationIds = [...new Set([
      ...Object.values(publicPayload.relations ?? {}).flatMap((value: any) => value ?? []),
      ...(publicPayload.blocks ?? []).filter((block: any) => block.type === "related_content").flatMap((block: any) => block.data?.itemIds ?? []),
    ])];
    return published.filter((entry) => relationIds.includes(entry.item_id) && searchableTypes.includes(entry.content_type)).map((entry) => { const payload = sanitizePublicPayload(entry.payload); return { item_id: entry.item_id, content_type: entry.content_type, title: payload.title, summary: payload.summary, path: routeFor(entry) }; });
  };
  const formatForm = (form: any, version: any) => ({
    schemaVersion: 1, formId: form.id, versionId: version.id, version: version.version,
    key: form.form_key, title: form.title, purpose: form.purpose,
    fields: version.definition?.fields ?? [],
    consent: { required: true, text: version.consent_text, version: version.consent_version, privacyPath: version.privacy_path },
    slaMinutes: version.sla_minutes, retentionDays: version.retention_days,
    successMessage: version.definition?.successMessage ?? "Recebemos sua solicitação.",
    submitLabel: version.definition?.submitLabel ?? "Enviar", status: "published",
  });
  const loadPublishedForm = async (filters: { key?: string; formId?: string; versionId?: string }) => {
    if (!service) return null;
    let formQuery = client.from("cms_form_definitions").select("id,form_key,title,purpose,active_version_id,status").eq("status", "published");
    if (filters.key) formQuery = formQuery.eq("form_key", filters.key);
    if (filters.formId) formQuery = formQuery.eq("id", filters.formId);
    const { data: form } = await formQuery.maybeSingle();
    if (!form?.active_version_id || (filters.versionId && form.active_version_id !== filters.versionId)) return null;
    const { data: version } = await client.from("cms_form_versions").select("id,form_id,version,definition,consent_text,consent_version,privacy_path,sla_minutes,retention_days,status").eq("id", form.active_version_id).eq("form_id", form.id).eq("status", "published").maybeSingle();
    return version ? formatForm(form, version) : null;
  };
  if (type === "site-shell") {
    const latest = (contentType: string) => {
      const payload = published.find((row) => row.content_type === contentType)?.payload;
      return payload ? sanitizePublicPayload(payload) : null;
    };
    const placements = latest("placement");
    const now = Date.now();
    const activePlacements = (placements?.placements ?? [])
      .filter((item: any) => item.enabled && Date.parse(item.startsAt) <= now && Date.parse(item.endsAt) > now)
      .sort((a: any,b: any) => b.priority-a.priority)
      .flatMap((item: any) => {
        const target = published.find((row) => row.item_id === item.targetId);
        if (!target) return [];
        const targetPayload = sanitizePublicPayload(target.payload);
        return [{ ...item, target: { itemId: target.item_id, contentType: target.content_type, title: targetPayload.title ?? target.slug, summary: targetPayload.summary, path: routeFor(target) } }];
      });
    return json({
      navigation: latest("navigation"),
      settings: latest("site_settings"),
      placements: placements ? { ...placements, placements: activePlacements } : null,
    }, 200, { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" });
  }
  if (type === "page-by-path") {
    const path = url.searchParams.get("path") ?? "";
    if (!/^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/?)*$/.test(path)) return json({ error: "Não encontrado." }, 404);
    const row = published.find((entry) => ["page", "homepage"].includes(entry.content_type) && entry.payload?.route?.path === path);
    if (!row) {
      const { data: managedRule } = await client.from("cms_route_rules").select("destination_path,status_code").eq("source_path", path).eq("active", true).maybeSingle();
      if (managedRule) return json({ kind: "route", rule: managedRule }, 200, { "Cache-Control": "public, max-age=60" });
      const { data: legacyRule } = await client.from("cms_redirects").select("destination_path,status_code").eq("source_path", path).eq("active", true).maybeSingle();
      return legacyRule ? json({ kind: "route", rule: legacyRule }, 200, { "Cache-Control": "public, max-age=60" }) : json({ kind: "fallback" }, 200, { "Cache-Control": "public, max-age=30" });
    }
    const publicPayload = sanitizePublicPayload(row.payload);
    const relationIds = [...new Set([
      ...Object.values(publicPayload.relations ?? {}).flatMap((value: any) => value ?? []),
      ...(publicPayload.blocks ?? []).filter((block: any) => block.type === "related_content").flatMap((block: any) => block.data?.itemIds ?? []),
    ])];
    const related_items = published.filter((entry) => relationIds.includes(entry.item_id) && searchableTypes.includes(entry.content_type)).map((entry) => { const payload = sanitizePublicPayload(entry.payload); return { item_id: entry.item_id, content_type: entry.content_type, title: payload.title, summary: payload.summary, path: routeFor(entry) }; });
    return json({ kind: "page", page: { ...(await enrichMedia(row)), related_items } }, 200, { ETag: row.etag, "Cache-Control": "public, max-age=60, stale-while-revalidate=300", "Surrogate-Key": row.cache_tag });
  }
  if (type === "posts") {
    const items = await Promise.all(published.filter((row) => row.content_type === "post").sort((a,b)=>Date.parse(b.published_at)-Date.parse(a.published_at)).map(async(row)=>({ ...(await enrichMedia(row)), related_items: resolveRelated(row) })));
    return json({ items, total: items.length }, 200, { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" });
  }
  if (type === "post-detail") {
    const slug = url.searchParams.get("slug") ?? "";
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return json({ error: "Não encontrado." }, 404);
    const row = published.find((entry) => entry.content_type === "post" && entry.slug === slug);
    if (!row) return json({ error: "Não encontrado." }, 404, { "Cache-Control": "public, max-age=30" });
    return json({ ...(await enrichMedia(row)), related_items: resolveRelated(row) }, 200, { ETag: row.etag, "Cache-Control": "public, max-age=60, stale-while-revalidate=300", "Surrogate-Key": row.cache_tag });
  }
  if (type === "form") {
    const key = url.searchParams.get("key") ?? "";
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key)) return json({ error: "Não encontrado." }, 404);
    if (!service) return json({ error: "Serviço indisponível." }, 503, { "Cache-Control": "no-store" });
    const form = await loadPublishedForm({ key });
    return form
      ? json(form, 200, { "Cache-Control": "public, max-age=60" })
      : new Response(null, { status: 204, headers: { ...headers, "Cache-Control": "public, max-age=60" } });
  }
  if (type === "campaign-by-path") {
    const path = url.searchParams.get("path") ?? "";
    if (!/^\/campanhas\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path)) return json({ error: "Não encontrado." }, 404);
    const row = published.find((entry)=>entry.content_type==="campaign"&&entry.payload?.route?.path===path);
    if (!row) {
      const { data: routeRule } = await client.from("cms_route_rules")
        .select("destination_path,status_code").eq("source_path",path).eq("active",true).maybeSingle();
      return routeRule
        ? json({kind:"route",rule:routeRule},200,{"Cache-Control":"public, max-age=60"})
        : json({kind:"fallback"},200,{"Cache-Control":"public, max-age=30"});
    }
    if (!campaignIsActive(row)) {
      const mode=row.payload?.expiry?.mode;
      if(mode==="redirect") return json({kind:"route",rule:{destination_path:row.payload.expiry.destinationPath,status_code:301}},200,{"Cache-Control":"public, max-age=60"});
      if(mode==="fallback") { const fallback=published.find((entry)=>entry.item_id===row.payload.expiry.fallbackCampaignId&&campaignIsActive(entry)); if(fallback) return json({kind:"route",rule:{destination_path:routeFor(fallback),status_code:302}},200,{"Cache-Control":"public, max-age=60"}); }
      return json({kind:"route",rule:{destination_path:null,status_code:mode==="gone"?410:404}},200,{"Cache-Control":"public, max-age=60"});
    }
    const form = row.payload?.form?.versionId
      ? await loadPublishedForm({ formId: row.payload.form.formId, versionId: row.payload.form.versionId })
      : null;
    return json({ ...(await enrichMedia(row)), form, related_items:resolveRelated(row) },200,{ETag:row.etag,"Cache-Control":"public, max-age=60, stale-while-revalidate=300","Surrogate-Key":row.cache_tag});
  }
  if (type === "campaign-placements") {
    const contextPath=url.searchParams.get("contextPath")??"/"; const contextRow=published.find((row)=>routeFor(row)===contextPath); const contextType=contextPath==="/"?"global":contextRow?.content_type??"page",contextId=contextRow?.item_id;
    const now=Date.now(); const candidates=published.filter((row)=>campaignIsActive(row,now)).flatMap((row)=>(row.payload?.placements??[]).filter((placement:any)=>placement.contextType===contextType&&(contextType==="global"||placement.contextId===contextId)).map((placement:any)=>({ ...placement,campaign:{itemId:row.item_id,title:row.payload.title,summary:row.payload.summary,path:routeFor(row)},startsAt:row.payload.window.startsAt,endsAt:row.payload.window.endsAt }))).sort((a:any,b:any)=>b.priority-a.priority);
    return json({items:candidates},200,{"Cache-Control":"public, max-age=60, stale-while-revalidate=300"});
  }
  if (type === "sitemap") {
    const origin = (Deno.env.get("PUBLIC_SITE_ORIGIN") ?? "https://gaiatecsistemas.com.br").replace(/\/$/, "");
    const urls = published.filter((row) => !["navigation", "site_settings", "placement"].includes(row.content_type) && row.seo?.indexable === true && (row.content_type!=="campaign"||campaignIsActive(row))).map((row) => `<url><loc>${origin}${routeFor(row)}</loc><lastmod>${new Date(row.published_at).toISOString()}</lastmod></url>`).join("");
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, { headers: { ...headers, "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300" } });
  }
  if (type === "detail" || type === "entity-detail") {
    const slug = url.searchParams.get("slug") ?? "", domain = url.searchParams.get("contentType") ?? "product";
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !searchableTypes.includes(domain)) return json({ error: "Não encontrado." }, 404);
    const row = published.find((entry) => entry.slug === slug && entry.content_type === domain);
    if (!row) return json({ error: "Não encontrado." }, 404, { "Cache-Control": "public, max-age=30" });
    if (req.headers.get("If-None-Match") === row.etag) return new Response(null, { status: 304, headers: { ...headers, ETag: row.etag } });
    return json(await enrichMedia(row), 200, { ETag: row.etag, "Cache-Control": "public, max-age=60, stale-while-revalidate=300", "Surrogate-Key": row.cache_tag });
  }
  const requested = (url.searchParams.get("ids") ?? "").split(",").filter(Boolean), rawQuery = url.searchParams.get("q") ?? "", query = normalize(rawQuery), domain = url.searchParams.get("contentType") ?? (type === "products" ? "product" : null);
  const filters = {
    productCategory: url.searchParams.get("productCategory") ?? url.searchParams.get("segment"),
    applicationMagnitude: url.searchParams.get("applicationMagnitude") ?? url.searchParams.get("category"),
    technology: url.searchParams.get("technology"),
    installationOperation: url.searchParams.get("installationOperation"),
    monitoredElement: url.searchParams.get("monitoredElement"),
  };
  const { data: synonymRows } = query ? await client.from("cms_search_synonyms").select("canonical_term,aliases,scope").eq("active", true) : { data: [] };
  const expanded = new Set(query.split(" ").filter(Boolean));
  for (const synonym of synonymRows ?? []) { const aliases = (synonym.aliases ?? []).map(normalize), canonical = normalize(synonym.canonical_term); if (aliases.some((alias: string) => query.includes(alias)) || query.includes(canonical)) { expanded.add(canonical); aliases.forEach((alias: string) => expanded.add(alias)); } }
  const scored = published.filter((row) => searchableTypes.includes(row.content_type)).map((row) => {
    const p = sanitizePublicPayload(row.payload, { includeSearchMetadata: true });
    if (domain && row.content_type !== domain) return null;
    if (requested.length && !requested.includes(row.slug) && !requested.includes(row.item_id)) return null;
    const controlled=p.controlledClassification??{};
    if (filters.productCategory && controlled.productCategory?.label !== filters.productCategory ||
      filters.applicationMagnitude && controlled.applicationMagnitude?.label !== filters.applicationMagnitude ||
      filters.technology && controlled.technology?.label !== filters.technology ||
      filters.installationOperation && controlled.installationOperation?.label !== filters.installationOperation ||
      filters.monitoredElement && controlled.monitoredElement?.label !== filters.monitoredElement) return null;
    const exact = normalize([p.title,p.brand?.name,p.models?.map((m:any)=>[m.model,m.manufacturerReference,m.sku])].flat(5).join(" "));
    const searchable = normalize([p.title,p.summary,p.commercial?.shortDescription,p.brand?.name,p.manufacturer?.name,p.productLine?.name,p.models,p.classification,p.controlledClassification,p.function,p.technology,p.serviceKind,p.serviceKindRef,p.marketName,p.process,p.problem,p.approach,p.benefits,p.deliverables,p.challenges,p.points,p.components,p.blocks,p.route?.navigationLabel,p.route?.breadcrumbLabel,p.search?.synonyms,p.search?.keywords,p.specifications].flat(6).join(" "));
    if (query && !query.split(" ").every((token) => searchable.includes(token) || [...expanded].some((term) => searchable.includes(term)))) return null;
    const score = !query ? 0 : exact.includes(query) ? 100 : [...expanded].reduce((sum,term)=>sum+(exact.includes(term)?20:searchable.includes(term)?5:0),0);
    return { row: { ...row, payload: p }, score, matchedBy: exact.includes(query) ? "nome ou modelo público" : "conteúdo técnico ou sinônimo" };
  }).filter(Boolean).sort((a:any,b:any)=>b.score-a.score);
  const limit = type === "autocomplete" ? 8 : type === "search" ? 50 : 200, selected = scored.slice(0,limit) as any[];
  const enriched = await Promise.all(selected.map(async(entry)=>({ ...(await enrichMedia(entry.row)), score:entry.score, matched_by:entry.matchedBy })));
  if ((type === "search" || type === "autocomplete") && query && service) await client.from("cms_search_events").insert({ normalized_query:query,result_count:enriched.length,content_types:[...new Set(enriched.map((row)=>row.content_type))],refinements:{domain:domain??null},correlation_id:crypto.randomUUID() });
  const productRows = selected.filter((entry)=>entry.row.content_type === "product").map((entry)=>entry.row);
  const facetKeys=["productCategory","applicationMagnitude","technology","installationOperation","monitoredElement"];
  const facets=facetKeys.reduce((all,key)=>{all[key]=[...new Set(productRows.map((row)=>row.payload?.controlledClassification?.[key]?.label).filter(Boolean))].sort();return all;},{} as Record<string,unknown[]>);
  const groups = searchableTypes.reduce((all,key)=>{all[key]=enriched.filter((row)=>row.content_type===key).length;return all;},{} as Record<string,number>);
  return json({items:enriched,total:enriched.length,facets,groups,query:rawQuery},200,{"Cache-Control":type === "search" || type === "autocomplete"?"private, no-store":"public, max-age=60, stale-while-revalidate=300"});
});
