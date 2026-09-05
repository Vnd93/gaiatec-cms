import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { z } from "npm:zod@4.4.3";
import { authenticateCms } from "../_shared/cms-auth.ts";
import { corsHeaders, isAllowedOrigin, json, readJsonLimited, sha256 } from "../_shared/security.ts";
import { resolveMediaAssets } from "../_shared/cms-media-resolution.ts";

const Issue = z.object({ itemId: z.uuid(), revisionId: z.uuid().nullish(), maxUses: z.number().int().min(1).max(50).default(10), minutes: z.number().int().min(1).max(30).default(15) }).strict();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (!isAllowedOrigin(req)) return json(req, { error: "Origem não autorizada." }, 403);
  if (req.method === "GET") {
    const token = new URL(req.url).searchParams.get("token") ?? "";
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return json(req, { error: "Preview inválido." }, 404);
    const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return json(req, { error: "Serviço indisponível." }, 503);
    const { createClient } = await import("jsr:@supabase/supabase-js@2");
    const admin = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await admin.rpc("cms_consume_preview", { p_token_hash: await sha256(token) });
    if (error) return json(req, { error: "Preview expirado ou indisponível." }, 410,
      { "X-Robots-Tag": "noindex, nofollow, noarchive", "Cache-Control": "private, no-store, max-age=0" });
    const payload = data?.payload;
    const documentUrls: Record<string, string> = {};
    const media = payload?.media ?? [];
    const blockAssetIds = (payload?.blocks ?? []).flatMap((block: any) => [
      block.data?.assetId,
      ...(block.data?.assetIds ?? []),
      ...(block.data?.items ?? []).map((item: any) => item.assetId),
    ].filter(Boolean));
    const assetIds = [...new Set([...media.map((entry: any) => entry.assetId), ...blockAssetIds, payload?.seo?.ogImageId].filter(Boolean))];
    const primaryId = media.find((entry: any) => entry.role === "primary")?.assetId;
    const { mediaUrls, mediaAlt } = await resolveMediaAssets(admin, assetIds, primaryId, 1800);
    const documents = (payload?.documents ?? []).filter((document: any) => document.storagePath);
    const { data: signedDocuments } = documents.length
      ? await admin.storage.from("cms-documents-private").createSignedUrls(documents.map((document: any) => document.storagePath), 1800)
      : { data: [] };
    documents.forEach((document: any, index: number) => {
      const signedUrl = signedDocuments?.[index]?.signedUrl;
      if (signedUrl) documentUrls[document.id] = signedUrl;
    });
    return json(req, { ...data, media_urls: mediaUrls, media_alt: mediaAlt, document_urls: documentUrls }, 200, { "X-Robots-Tag": "noindex, nofollow, noarchive", "Cache-Control": "private, no-store, max-age=0" });
  }
  if (req.method !== "POST") return json(req, { error: "Método não permitido." }, 405);
  const identity = await authenticateCms(req);
  if (!identity) return json(req, { error: "Sessão inválida." }, 401);
  let input: z.infer<typeof Issue>;
  try { input = Issue.parse(await readJsonLimited(req, 2048)); } catch { return json(req, { error: "Pedido inválido." }, 400); }
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...raw)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const expiresAt = new Date(Date.now() + input.minutes * 60000).toISOString();
  const correlationId = crypto.randomUUID();
  const { data, error } = await identity.admin.rpc("cms_issue_preview", {
    p_actor_id: identity.user.id, p_item_id: input.itemId, p_revision_id: input.revisionId ?? null,
    p_token_hash: await sha256(token), p_expires_at: expiresAt, p_max_uses: input.maxUses,
    p_aal: identity.claims.aal, p_session_id: identity.claims.sessionId, p_issued_at: identity.claims.issuedAt,
    p_correlation_id: correlationId,
  });
  if (error) return json(req, { error: error.message.includes("FORBIDDEN") ? "Permissão insuficiente." : "Não foi possível criar o preview.", correlationId }, error.message.includes("FORBIDDEN") ? 403 : 422);
  return json(req, { ...data, token, path: "/preview/" + token, correlationId }, 201,
    { "X-Robots-Tag": "noindex, nofollow, noarchive", "Cache-Control": "private, no-store" });
});
