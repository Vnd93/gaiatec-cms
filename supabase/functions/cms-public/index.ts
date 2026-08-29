import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "apikey, authorization, content-type, if-none-match, x-client-info", "Access-Control-Allow-Methods": "GET, OPTIONS", Vary: "Origin" };
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8", ...extra } });
const normalize = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[₂]/g, "2").replace(/[–—]/g, "-").replace(/\bdn\s+(\d+)/g, "dn$1").replace(/4\s*-\s*20\s*ma/g, "4-20ma").replace(/[^a-z0-9%/.-]+/g, " ").trim();
const publicTypes = ["product", "service", "industry", "application", "solution"];
const routeFor = (row: any) => row.content_type === "product" ? `/produtos/${row.slug}` : row.content_type === "industry" ? `/industrias/${row.slug}` : row.content_type === "application" ? `/aplicacoes/${row.slug}` : row.content_type === "solution" ? `/solucoes/${row.slug}` : `/servicos/${row.slug}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "GET") return json({ error: "Método não permitido." }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anon) return json({ error: "Serviço indisponível." }, 503);
  const url = new URL(req.url), type = url.searchParams.get("type") ?? "detail";
  const client = createClient(supabaseUrl, service ?? anon, { auth: { persistSession: false } });
  const enrichMedia = async (row: any) => {
    const mediaUrls: Record<string, string> = {}, media = row.payload?.media ?? [], assetIds = media.map((entry: any) => entry.assetId);
    const primaryId = media.find((entry: any) => entry.role === "primary")?.assetId;
    const { data: variants } = assetIds.length ? await client.from("cms_media_variants").select("asset_id,variant_key,format,transform_path").in("asset_id", assetIds) : { data: [] };
    const paths = (variants ?? []).map((variant: any) => variant.transform_path);
    const { data: signedVariants } = paths.length ? await client.storage.from("cms-media-private").createSignedUrls(paths, 3600) : { data: [] };
    const signedByPath = new Map((signedVariants ?? []).map((signed: any) => [signed.path, signed.signedUrl]));
    for (const variant of variants ?? []) {
      const signedUrl = signedByPath.get(variant.transform_path), key = `${variant.variant_key}.${variant.format}`;
      if (signedUrl) { mediaUrls[`${variant.asset_id}:${key}`] = signedUrl; if (variant.asset_id === primaryId) mediaUrls[key] = signedUrl; }
    }
    const documentUrls: Record<string, string> = {};
    const documents = (row.payload?.documents ?? []).filter((document: any) => document.visibility === "public" && document.storagePath);
    const { data: signedDocuments } = documents.length ? await client.storage.from("cms-documents-private").createSignedUrls(documents.map((document: any) => document.storagePath), 3600) : { data: [] };
    documents.forEach((document: any, index: number) => { const signedUrl = signedDocuments?.[index]?.signedUrl; if (signedUrl) documentUrls[document.id] = signedUrl; });
    return { ...row, path: routeFor(row), media_urls: mediaUrls, document_urls: documentUrls };
  };
  if (type === "redirect") {
    const path = url.searchParams.get("path") ?? "";
    const { data } = await client.from("cms_redirects").select("destination_path,status_code").eq("source_path", path).eq("active", true).maybeSingle();
    return data ? json(data, 200, { "Cache-Control": "public, max-age=300" }) : json({ error: "Não encontrado." }, 404);
  }
  const { data, error } = await client.from("cms_published_projection").select("item_id,revision_id,content_type,slug,schema_version,consumer_id,renderer_key,payload,seo,content_version,cache_tag,etag,published_at").in("content_type", publicTypes).order("published_at", { ascending: false }).limit(1000);
  if (error) return json({ error: "Conteúdo temporariamente indisponível." }, 503, { "Cache-Control": "no-store" });
  const published = data ?? [];
  if (type === "sitemap") {
    const origin = (Deno.env.get("PUBLIC_SITE_ORIGIN") ?? "https://gaiatecsistemas.com.br").replace(/\/$/, "");
    const urls = published.filter((row) => row.payload?.seo?.indexable === true).map((row) => `<url><loc>${origin}${routeFor(row)}</loc><lastmod>${new Date(row.published_at).toISOString()}</lastmod></url>`).join("");
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, { headers: { ...headers, "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300" } });
  }
  if (type === "detail" || type === "entity-detail") {
    const slug = url.searchParams.get("slug") ?? "", domain = url.searchParams.get("contentType") ?? "product";
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !publicTypes.includes(domain)) return json({ error: "Não encontrado." }, 404);
    const row = published.find((entry) => entry.slug === slug && entry.content_type === domain);
    if (!row) return json({ error: "Não encontrado." }, 404, { "Cache-Control": "public, max-age=30" });
    if (req.headers.get("If-None-Match") === row.etag) return new Response(null, { status: 304, headers: { ...headers, ETag: row.etag } });
    return json(await enrichMedia(row), 200, { ETag: row.etag, "Cache-Control": "public, max-age=60, stale-while-revalidate=300", "Surrogate-Key": row.cache_tag });
  }
  const requested = (url.searchParams.get("ids") ?? "").split(",").filter(Boolean), rawQuery = url.searchParams.get("q") ?? "", query = normalize(rawQuery), domain = url.searchParams.get("contentType");
  const filters = { segment: url.searchParams.get("segment"), category: url.searchParams.get("category"), family: url.searchParams.get("family"), technology: url.searchParams.get("technology") };
  const { data: synonymRows } = query ? await client.from("cms_search_synonyms").select("canonical_term,aliases,scope").eq("active", true) : { data: [] };
  const expanded = new Set(query.split(" ").filter(Boolean));
  for (const synonym of synonymRows ?? []) { const aliases = (synonym.aliases ?? []).map(normalize), canonical = normalize(synonym.canonical_term); if (aliases.some((alias: string) => query.includes(alias)) || query.includes(canonical)) { expanded.add(canonical); aliases.forEach((alias: string) => expanded.add(alias)); } }
  const scored = published.map((row) => {
    const p = row.payload as Record<string, any>;
    if (domain && row.content_type !== domain) return null;
    if (requested.length && !requested.includes(row.slug) && !requested.includes(row.item_id)) return null;
    if (filters.segment && p.classification?.segment !== filters.segment || filters.category && p.classification?.category !== filters.category || filters.family && p.classification?.family !== filters.family || filters.technology && p.technology !== filters.technology) return null;
    const exact = normalize([p.title,p.brand?.name,p.models?.map((m:any)=>[m.model,m.manufacturerReference,m.sku])].flat(5).join(" "));
    const searchable = normalize([p.title,p.summary,p.commercial?.shortDescription,p.brand?.name,p.manufacturer?.name,p.productLine?.name,p.models,p.classification,p.function,p.technology,p.serviceKind,p.marketName,p.process,p.problem,p.approach,p.benefits,p.deliverables,p.challenges,p.points,p.components,p.search?.synonyms,p.search?.keywords,p.specifications].flat(6).join(" "));
    if (query && !query.split(" ").every((token) => searchable.includes(token) || [...expanded].some((term) => searchable.includes(term)))) return null;
    const score = !query ? 0 : exact.includes(query) ? 100 : [...expanded].reduce((sum,term)=>sum+(exact.includes(term)?20:searchable.includes(term)?5:0),0);
    return { row, score, matchedBy: exact.includes(query) ? "nome, modelo ou referência" : "conteúdo técnico ou sinônimo" };
  }).filter(Boolean).sort((a:any,b:any)=>b.score-a.score);
  const limit = type === "autocomplete" ? 8 : type === "search" ? 50 : 200, selected = scored.slice(0,limit) as any[];
  const enriched = await Promise.all(selected.map(async(entry)=>({ ...(await enrichMedia(entry.row)), score:entry.score, matched_by:entry.matchedBy })));
  if ((type === "search" || type === "autocomplete") && query && service) await client.from("cms_search_events").insert({ normalized_query:query,result_count:enriched.length,content_types:[...new Set(enriched.map((row)=>row.content_type))],refinements:{domain:domain??null},correlation_id:crypto.randomUUID() });
  const productRows = selected.filter((entry)=>entry.row.content_type === "product").map((entry)=>entry.row);
  const facets = ["segment","category","family","technology"].reduce((all,key)=>{ all[key]=[...new Set(productRows.map((row)=>key === "technology"?row.payload?.technology:row.payload?.classification?.[key]).filter(Boolean))].sort(); return all;},{} as Record<string,unknown[]>);
  const groups = publicTypes.reduce((all,key)=>{all[key]=enriched.filter((row)=>row.content_type===key).length;return all;},{} as Record<string,number>);
  return json({items:enriched,total:enriched.length,facets,groups,query:rawQuery},200,{"Cache-Control":type === "search" || type === "autocomplete"?"private, no-store":"public, max-age=60, stale-while-revalidate=300"});
});
