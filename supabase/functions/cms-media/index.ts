import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { z } from "npm:zod@4.4.3";
import { authenticateCms } from "../_shared/cms-auth.ts";
import { corsHeaders, isAllowedOrigin, json, readJsonLimited, sha256Bytes } from "../_shared/security.ts";

const Metadata = z.object({
  originalFilename: z.string().trim().min(1).max(180), declaredMime: z.enum(["image/png", "image/jpeg", "image/webp", "image/avif"]),
  sourceKind: z.enum(["synthetic_test", "owner_authored", "official_manufacturer", "official_company"]),
  sourceReference: z.string().trim().min(3).max(500), rightsConfirmed: z.literal(true), licenseName: z.string().trim().min(2).max(120),
  ownerName: z.string().trim().min(2).max(120), altText: z.string().trim().min(1).max(300), caption: z.string().trim().max(500).nullish(),
  credit: z.string().trim().max(200).nullish(), focalX: z.number().min(0).max(1).default(0.5), focalY: z.number().min(0).max(1).default(0.5),
  replacesAssetId: z.uuid().nullish(),
}).strict();
const Input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), metadata: Metadata }).strict(),
  z.object({ action: z.literal("finalize"), assetId: z.uuid() }).strict(),
  z.object({ action: z.literal("list"), query: z.string().max(120).default(""), page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(50).default(20) }).strict(),
  z.object({ action: z.literal("usages"), assetId: z.uuid() }).strict(),
  z.object({ action: z.literal("delete"), assetId: z.uuid() }).strict(),
]);

const variantSpecs = [
  ["thumbnail", "webp"], ["thumbnail", "avif"], ["medium", "webp"], ["medium", "avif"], ["large", "webp"], ["large", "avif"],
] as const;
const extByMime: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/avif": "avif" };

function mimeOf(bytes: Uint8Array): string | null {
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP") return "image/webp";
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(4, 12)).includes("ftyp")) return "image/avif";
  return null;
}

function dimensions(bytes: Uint8Array, mime: string): [number, number] | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mime === "image/png" && bytes.length >= 24) return [view.getUint32(16), view.getUint32(20)];
  if (mime === "image/jpeg") {
    let p = 2;
    while (p + 9 < bytes.length) {
      if (bytes[p] !== 0xff) { p += 1; continue; }
      const marker = bytes[p + 1], len = view.getUint16(p + 2);
      if (marker >= 0xc0 && marker <= 0xc3) return [view.getUint16(p + 7), view.getUint16(p + 5)];
      p += 2 + len;
    }
  }
  if (mime === "image/webp" && bytes.length >= 30) {
    const chunk = new TextDecoder().decode(bytes.slice(12, 16));
    if (chunk === "VP8X") {
      const w = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), h = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16); return [w, h];
    }
    if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return [view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff];
    }
    if (chunk === "VP8L" && bytes[20] === 0x2f) {
      const packed = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
      return [(packed & 0x3fff) + 1, ((packed >>> 14) & 0x3fff) + 1];
    }
  }
  if (mime === "image/avif") {
    for (let i = 4; i + 16 < bytes.length; i++) if (new TextDecoder().decode(bytes.slice(i, i + 4)) === "ispe") return [view.getUint32(i + 8), view.getUint32(i + 12)];
  }
  return null;
}

async function authorize(identity: Awaited<ReturnType<typeof authenticateCms>> & {}, permission: string) {
  const { data } = await identity.admin.rpc("cms_actor_authorized", { p_actor_id: identity.user.id, p_permission: permission,
    p_aal: identity.claims.aal, p_session_id: identity.claims.sessionId, p_issued_at: identity.claims.issuedAt });
  return data === true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (!isAllowedOrigin(req)) return json(req, { error: "Origem não autorizada." }, 403);
  if (req.method !== "POST") return json(req, { error: "Método não permitido." }, 405);
  const identity = await authenticateCms(req);
  if (!identity) return json(req, { error: "Sessão inválida." }, 401);
  let input: z.infer<typeof Input>;
  try { input = Input.parse(await readJsonLimited(req, 16384)); } catch { return json(req, { error: "Pedido de mídia inválido." }, 400); }
  const permission = input.action === "list" || input.action === "usages" ? "cms:media.read" : input.action === "create" || input.action === "finalize" ? "cms:media.upload" : "cms:media.manage";
  if (!(await authorize(identity, permission))) return json(req, { error: "Permissão insuficiente." }, 403);
  const storage = identity.admin.storage.from("cms-media-private");

  if (input.action === "create") {
    const id = crypto.randomUUID(), ext = extByMime[input.metadata.declaredMime], storagePath = "cms/" + id + "/original." + ext;
    const { error } = await identity.admin.from("cms_media_assets").insert({ id, storage_path: storagePath,
      original_filename: input.metadata.originalFilename, declared_mime: input.metadata.declaredMime,
      source_kind: input.metadata.sourceKind, source_reference: input.metadata.sourceReference,
      rights_confirmed: true, license_name: input.metadata.licenseName, owner_name: input.metadata.ownerName,
      alt_text: input.metadata.altText, caption: input.metadata.caption ?? null, credit: input.metadata.credit ?? null,
      focal_x: input.metadata.focalX, focal_y: input.metadata.focalY, replaces_asset_id: input.metadata.replacesAssetId ?? null,
      created_by: identity.user.id });
    if (error) return json(req, { error: "Não foi possível reservar a mídia." }, 422);
    const paths = [{ key: "original", format: ext, path: storagePath }, ...variantSpecs.map(([key, format]) => ({ key, format, path: "cms/" + id + "/" + key + "." + format }))];
    const uploads = [];
    for (const item of paths) { const signed = await storage.createSignedUploadUrl(item.path); if (signed.error) return json(req, { error: "Não foi possível preparar o upload." }, 503); uploads.push({ ...item, token: signed.data.token, signedUrl: signed.data.signedUrl }); }
    return json(req, { assetId: id, uploads, status: "awaiting_upload" }, 201);
  }

  if (input.action === "finalize") {
    const { data: asset } = await identity.admin.from("cms_media_assets").select("*").eq("id", input.assetId).single();
    if (!asset || !["awaiting_upload", "processing", "failed"].includes(asset.processing_status)) return json(req, { error: "Mídia não encontrada ou já finalizada." }, 404);
    await identity.admin.from("cms_media_assets").update({ processing_status: "processing" }).eq("id", input.assetId);
    const original = await storage.download(asset.storage_path);
    if (original.error) return json(req, { error: "Original ainda não foi enviado." }, 409);
    const originalBytes = new Uint8Array(await original.data.arrayBuffer()), detected = mimeOf(originalBytes), size = originalBytes.length;
    const originalDimensions = detected ? dimensions(originalBytes, detected) : null;
    if (!detected || detected !== asset.declared_mime || !originalDimensions || size > 20971520) {
      await identity.admin.from("cms_media_assets").update({ processing_status: "rejected", scan_status: "rejected", scan_engine: "safe-raster-magic-v1" }).eq("id", input.assetId);
      return json(req, { error: "Arquivo rejeitado por MIME, dimensão ou tamanho." }, 422);
    }
    const variantRows = [];
    for (const [key, format] of variantSpecs) {
      const path = "cms/" + input.assetId + "/" + key + "." + format, downloaded = await storage.download(path);
      if (downloaded.error) return json(req, { error: "Processamento incompleto: variante ausente." }, 409);
      const bytes = new Uint8Array(await downloaded.data.arrayBuffer()), mime = mimeOf(bytes), dims = mime ? dimensions(bytes, mime) : null;
      if (mime !== "image/" + format || !dims) return json(req, { error: "Variante processada inválida." }, 422);
      variantRows.push({ asset_id: input.assetId, variant_key: key, format, width: dims[0], height: dims[1], transform_path: path });
    }
    const digest = await sha256Bytes(originalBytes);
    const { error: variantsError } = await identity.admin.from("cms_media_variants").upsert(variantRows, { onConflict: "asset_id,variant_key,format" });
    if (variantsError) return json(req, { error: "Não foi possível registrar as variantes." }, 422);
    const { error: readyError } = await identity.admin.from("cms_media_assets").update({ detected_mime: detected, byte_size: size,
      sha256: digest, width: originalDimensions[0], height: originalDimensions[1], processing_status: "ready", scan_status: "clean",
      scan_engine: "safe-raster-magic-v1", processed_at: new Date().toISOString() }).eq("id", input.assetId);
    if (readyError) return json(req, { error: readyError.code === "23505" ? "Mídia nova duplicada." : "Falha ao concluir a mídia." }, 422);
    if (asset.replaces_asset_id) await identity.admin.from("cms_media_assets").update({ processing_status: "replaced" }).eq("id", asset.replaces_asset_id);
    await identity.admin.from("cms_audit_log").insert({ actor_id: identity.user.id, action: "cms:media.finalize", target_type: "media_asset",
      target_id: input.assetId, event_data: { sha256: digest, variants: variantRows.length }, correlation_id: crypto.randomUUID() });
    return json(req, { assetId: input.assetId, status: "ready", sha256: digest, width: originalDimensions[0], height: originalDimensions[1], variants: variantRows.length });
  }

  if (input.action === "list") {
    const from = (input.page - 1) * input.pageSize, to = from + input.pageSize - 1;
    let query = identity.admin.from("cms_media_assets").select("id,original_filename,processing_status,scan_status,source_kind,license_name,owner_name,alt_text,width,height,version,created_at", { count: "exact" }).order("created_at", { ascending: false }).range(from, to);
    if (input.query) query = query.ilike("original_filename", "%" + input.query.replace(/[%_]/g, "") + "%");
    const { data, count, error } = await query; if (error) return json(req, { error: "Falha ao listar mídia." }, 500);
    return json(req, { items: data, page: input.page, pageSize: input.pageSize, total: count ?? 0 });
  }
  if (input.action === "usages") {
    const { data, error } = await identity.admin.from("cms_media_usages").select("item_id,revision_id,block_id,usage_kind,created_at").eq("asset_id", input.assetId);
    return error ? json(req, { error: "Falha ao consultar usos." }, 500) : json(req, { assetId: input.assetId, usages: data });
  }
  const { count } = await identity.admin.from("cms_media_usages").select("id", { count: "exact", head: true }).eq("asset_id", input.assetId);
  if ((count ?? 0) > 0) return json(req, { error: "Mídia em uso não pode ser excluída.", usages: count }, 409);
  const { data: asset } = await identity.admin.from("cms_media_assets").select("storage_path").eq("id", input.assetId).single();
  if (!asset) return json(req, { error: "Mídia não encontrada." }, 404);
  const paths = [asset.storage_path, ...variantSpecs.map(([key, format]) => "cms/" + input.assetId + "/" + key + "." + format)];
  const removed = await storage.remove(paths); if (removed.error) return json(req, { error: "Falha ao remover objetos privados." }, 503);
  const deletion = await identity.admin.from("cms_media_assets").delete().eq("id", input.assetId);
  return deletion.error ? json(req, { error: "Mídia passou a ter uso e não foi excluída." }, 409) : json(req, { deleted: true });
});
