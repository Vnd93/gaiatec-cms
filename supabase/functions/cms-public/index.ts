import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, if-none-match, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  Vary: "Origin",
};
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), {
  status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8", ...extra },
});
const normalize = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[–—]/g, "-").replace(/[^a-z0-9%/.-]+/g, " ").trim();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "GET") return json({ error: "Método não permitido." }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anon) return json({ error: "Serviço indisponível." }, 503);
  const url = new URL(req.url), type = url.searchParams.get("type") ?? "detail";
  const client = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? anon, { auth: { persistSession: false } });
  const enrichMedia = async (row: any) => {
    const assetId = row.payload?.media?.find((entry: any) => entry.role === "primary")?.assetId;
    if (!assetId) return { ...row, media_urls: {} };
    const { data: variants } = await client.from("cms_media_variants").select("variant_key,format,transform_path").eq("asset_id", assetId);
    const mediaUrls: Record<string, string> = {};
    for (const variant of variants ?? []) {
      const { data: signed } = await client.storage.from("cms-media-private").createSignedUrl(variant.transform_path, 3600);
      if (signed?.signedUrl) mediaUrls[`${variant.variant_key}.${variant.format}`] = signed.signedUrl;
    }
    return { ...row, media_urls: mediaUrls };
  };

  if (type === "redirect") {
    const path = url.searchParams.get("path") ?? "";
    const { data } = await client.from("cms_redirects").select("destination_path,status_code").eq("source_path", path).eq("active", true).maybeSingle();
    return data ? json(data, 200, { "Cache-Control": "public, max-age=300" }) : json({ error: "Não encontrado." }, 404);
  }

  const { data, error } = await client.from("cms_published_projection")
    .select("item_id,revision_id,content_type,slug,schema_version,consumer_id,renderer_key,payload,seo,content_version,cache_tag,etag,published_at")
    .eq("content_type", "product").order("published_at", { ascending: false }).limit(500);
  if (error) return json({ error: "Catálogo temporariamente indisponível." }, 503, { "Cache-Control": "no-store" });
  const products = data ?? [];

  if (type === "sitemap") {
    const origin = (Deno.env.get("PUBLIC_SITE_ORIGIN") ?? "https://gaiatecsistemas.com.br").replace(/\/$/, "");
    const urls = products.filter((row) => row.payload?.seo?.indexable === true).map((row) =>
      `<url><loc>${origin}/produtos/${row.slug}</loc><lastmod>${new Date(row.published_at).toISOString()}</lastmod></url>`).join("");
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, {
      headers: { ...headers, "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300" },
    });
  }

  if (type === "detail") {
    const slug = url.searchParams.get("slug") ?? "";
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return json({ error: "Não encontrado." }, 404);
    const row = products.find((entry) => entry.slug === slug);
    if (!row) return json({ error: "Não encontrado." }, 404, { "Cache-Control": "public, max-age=30" });
    if (req.headers.get("If-None-Match") === row.etag) return new Response(null, { status: 304, headers: { ...headers, ETag: row.etag } });
    return json(await enrichMedia(row), 200, { ETag: row.etag, "Cache-Control": "public, max-age=60, stale-while-revalidate=300", "Surrogate-Key": row.cache_tag });
  }

  const requested = (url.searchParams.get("ids") ?? "").split(",").filter(Boolean);
  const query = normalize(url.searchParams.get("q") ?? "");
  const filters = { segment: url.searchParams.get("segment"), category: url.searchParams.get("category"),
    family: url.searchParams.get("family"), technology: url.searchParams.get("technology") };
  let result = products.filter((row) => {
    const p = row.payload as Record<string, any>;
    if (requested.length && !requested.includes(row.slug) && !requested.includes(row.item_id)) return false;
    if (filters.segment && p.classification?.segment !== filters.segment) return false;
    if (filters.category && p.classification?.category !== filters.category) return false;
    if (filters.family && p.classification?.family !== filters.family) return false;
    if (filters.technology && p.technology !== filters.technology) return false;
    if (!query) return true;
    const searchable = normalize([p.title, p.summary, p.manufacturer?.name, p.productLine?.name,
      p.models?.map((m: any) => [m.model, m.sku, m.variants?.map((v: any) => [v.name, v.code])]),
      p.classification?.segment, p.classification?.category, p.classification?.subcategory, p.classification?.family,
      p.function, p.technology, p.search?.synonyms, p.search?.keywords,
      p.specifications?.map((s: any) => [s.label, s.value, s.unit])].flat(6).join(" "));
    return query.split(" ").every((token) => searchable.includes(token));
  });
  result = result.slice(0, type === "search" ? 30 : 100);
  const facets = ["segment", "category", "family", "technology"].reduce((all, key) => {
    all[key] = [...new Set(result.map((row) => key === "technology" ? row.payload?.technology : row.payload?.classification?.[key]).filter(Boolean))].sort();
    return all;
  }, {} as Record<string, unknown[]>);
  const enriched = await Promise.all(result.map(enrichMedia));
  return json({ items: enriched, total: enriched.length, facets, query: url.searchParams.get("q") ?? "" }, 200,
    { "Cache-Control": type === "search" ? "private, no-store" : "public, max-age=60, stale-while-revalidate=300" });
});
