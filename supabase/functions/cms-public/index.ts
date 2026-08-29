import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "GET") return new Response(JSON.stringify({ error: "Método não permitido." }), { status: 405 });
  const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) return new Response(JSON.stringify({ error: "Serviço indisponível." }), { status: 503 });
  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return new Response(JSON.stringify({ error: "Não encontrado." }), { status: 404 });
  const client = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await client.from("cms_published_projection").select("item_id,revision_id,content_type,slug,schema_version,consumer_id,renderer_key,payload,seo,content_version,cache_tag,etag,published_at").eq("slug", slug).maybeSingle();
  if (error || !data) return new Response(JSON.stringify({ error: "Não encontrado." }), { status: 404, headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=30" } });
  if (req.headers.get("If-None-Match") === data.etag) return new Response(null, { status: 304, headers: { ETag: data.etag, "Cache-Control": "public, max-age=60, stale-while-revalidate=300", "Surrogate-Key": data.cache_tag } });
  return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json; charset=utf-8", ETag: data.etag, "Cache-Control": "public, max-age=60, stale-while-revalidate=300", "Surrogate-Key": data.cache_tag } });
});
