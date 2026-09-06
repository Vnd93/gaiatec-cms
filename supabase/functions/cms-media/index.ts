import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { z } from "npm:zod@4.4.3";
import { authenticateCms } from "../_shared/cms-auth.ts";
import { isConfiguredCmsEnvironment, isProductionOperationEnabled } from "../_shared/ev2-environment.ts";
import {
  clientAddress,
  consumeRateLimit,
  corsHeaders,
  isAllowedOrigin,
  json,
  readJsonLimited,
  sha256,
  sha256Bytes,
} from "../_shared/security.ts";

const Uuid = z.uuid();
const Timestamp = z.iso.datetime({ offset: true });
const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const PerceptualHash = z.string().regex(/^[0-9a-f]{16}$/);
const Envelope = z
  .object({
    schemaVersion: z.literal(1),
    commandId: Uuid,
    correlationId: Uuid,
    occurredAt: z.iso.datetime(),
    actorContext: z
      .object({
        environment: z.enum(["local", "staging", "production"]),
        siteKey: z.string().regex(/^[a-z][a-z0-9_-]{1,63}$/),
      })
      .strict(),
    expectedVersion: z.number().int().positive().optional(),
  })
  .strict();
const V2Metadata = z
  .object({
    originalFilename: z.string().trim().min(1).max(180),
    declaredMime: z.enum(["image/png", "image/jpeg", "image/webp", "image/avif"]),
    sourceKind: z.enum(["synthetic_test", "owner_authored", "official_manufacturer", "official_company"]),
    sourceReference: z.string().trim().min(3).max(500),
    rightsConfirmed: z.literal(true),
    rightsExpiresAt: Timestamp.nullable().default(null),
    licenseName: z.string().trim().min(2).max(120),
    ownerName: z.string().trim().min(2).max(120),
    altText: z.string().trim().min(1).max(300),
    caption: z.string().trim().max(500).nullable().default(null),
    credit: z.string().trim().max(200).nullable().default(null),
    focalX: z.number().min(0).max(1).default(0.5),
    focalY: z.number().min(0).max(1).default(0.5),
    sha256: Sha256.optional(),
    perceptualHash: PerceptualHash.optional(),
  })
  .strict();
const MetadataPatch = V2Metadata.pick({
  originalFilename: true,
  sourceReference: true,
  rightsExpiresAt: true,
  licenseName: true,
  ownerName: true,
  altText: true,
  caption: true,
  credit: true,
  focalX: true,
  focalY: true,
})
  .partial()
  .refine((value) => Object.keys(value).length > 0);
const Crop = z
  .object({
    cropKey: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
    label: z.string().trim().min(1).max(120),
    aspectWidth: z.number().int().min(1).max(10000),
    aspectHeight: z.number().int().min(1).max(10000),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().gt(0).max(1),
    height: z.number().gt(0).max(1),
    focalX: z.number().min(0).max(1),
    focalY: z.number().min(0).max(1),
  })
  .strict()
  .refine((value) => value.x + value.width <= 1 && value.y + value.height <= 1);
const ExpectedEnvelope = Envelope.refine((value) => value.expectedVersion !== undefined);
const V2Input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("capability"), envelope: Envelope }).strict(),
  z
    .object({
      action: z.literal("list_assets"),
      envelope: Envelope,
      query: z.string().trim().max(120).default(""),
      collectionId: Uuid.optional(),
      tagIds: z.array(Uuid).max(20).default([]),
      rightsState: z.enum(["valid", "expiring", "expired", "undated"]).optional(),
      includeArchived: z.boolean().default(false),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(50).default(20),
    })
    .strict(),
  z.object({ action: z.literal("get_asset"), envelope: Envelope, assetId: Uuid }).strict(),
  z
    .object({
      action: z.literal("match_asset"),
      envelope: Envelope,
      sha256: Sha256,
      perceptualHash: PerceptualHash.optional(),
      maximumDistance: z.number().int().min(0).max(16).default(8),
    })
    .strict(),
  z.object({ action: z.literal("reserve_upload"), envelope: Envelope, metadata: V2Metadata }).strict(),
  z.object({ action: z.literal("finalize_upload"), envelope: Envelope, assetId: Uuid }).strict(),
  z
    .object({ action: z.literal("update_metadata"), envelope: ExpectedEnvelope, assetId: Uuid, patch: MetadataPatch, reason: z.string().trim().min(3).max(500) })
    .strict(),
  z
    .object({ action: z.literal("upsert_collection"), envelope: Envelope, collectionId: Uuid.optional(), name: z.string().trim().min(1).max(120), description: z.string().trim().max(500).default(""), reason: z.string().trim().min(3).max(500) })
    .strict(),
  z.object({ action: z.literal("archive_collection"), envelope: ExpectedEnvelope, collectionId: Uuid, reason: z.string().trim().min(3).max(500) }).strict(),
  z
    .object({ action: z.literal("set_organization"), envelope: ExpectedEnvelope, assetId: Uuid, collectionIds: z.array(Uuid).max(30), tags: z.array(z.string().trim().min(1).max(80)).max(50), reason: z.string().trim().min(3).max(500) })
    .strict(),
  z.object({ action: z.literal("save_crop"), envelope: ExpectedEnvelope, assetId: Uuid, crop: Crop, reason: z.string().trim().min(3).max(500) }).strict(),
  z.object({ action: z.literal("archive_asset"), envelope: ExpectedEnvelope, assetId: Uuid, reason: z.string().trim().min(3).max(500) }).strict(),
  z.object({ action: z.literal("restore_asset"), envelope: ExpectedEnvelope, assetId: Uuid, reason: z.string().trim().min(3).max(500) }).strict(),
  z
    .object({ action: z.literal("preview_replacement"), envelope: Envelope, sourceAssetId: Uuid, targetAssetId: Uuid })
    .strict()
    .refine((value) => value.sourceAssetId !== value.targetAssetId),
  z
    .object({ action: z.literal("activate_replacement"), envelope: ExpectedEnvelope, sourceAssetId: Uuid, targetAssetId: Uuid, reason: z.string().trim().min(3).max(500) })
    .strict()
    .refine((value) => value.sourceAssetId !== value.targetAssetId),
  z.object({ action: z.literal("rollback_replacement"), envelope: ExpectedEnvelope, replacementId: Uuid, reason: z.string().trim().min(3).max(500) }).strict(),
  z.object({ action: z.literal("run_gc"), envelope: Envelope, jobId: Uuid.optional(), limit: z.number().int().min(1).max(50).default(10), dryRun: z.boolean().default(true) }).strict(),
]);

const V1Metadata = z
  .object({
    originalFilename: z.string().trim().min(1).max(180),
    declaredMime: z.enum(["image/png", "image/jpeg", "image/webp", "image/avif"]),
    sourceKind: z.enum(["synthetic_test", "owner_authored", "official_manufacturer", "official_company"]),
    sourceReference: z.string().trim().min(3).max(500),
    rightsConfirmed: z.literal(true),
    licenseName: z.string().trim().min(2).max(120),
    ownerName: z.string().trim().min(2).max(120),
    altText: z.string().trim().min(1).max(300),
    caption: z.string().trim().max(500).nullish(),
    credit: z.string().trim().max(200).nullish(),
    focalX: z.number().min(0).max(1).default(0.5),
    focalY: z.number().min(0).max(1).default(0.5),
    replacesAssetId: Uuid.nullish(),
  })
  .strict();
const V1Input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), metadata: V1Metadata }).strict(),
  z.object({ action: z.literal("finalize"), assetId: Uuid }).strict(),
  z.object({ action: z.literal("list"), query: z.string().max(120).default(""), page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(50).default(20) }).strict(),
  z.object({ action: z.literal("usages"), assetId: Uuid }).strict(),
  z.object({ action: z.literal("delete"), assetId: Uuid }).strict(),
]);

const variantSpecs = [
  ["thumbnail", "webp"], ["thumbnail", "avif"], ["medium", "webp"],
  ["medium", "avif"], ["large", "webp"], ["large", "avif"],
] as const;
const extByMime: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/avif": "avif" };
type Identity = NonNullable<Awaited<ReturnType<typeof authenticateCms>>>;

function mimeOf(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 24 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)
  ) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP") return "image/webp";
  if (bytes.length >= 16 && new TextDecoder().decode(bytes.slice(4, 8)) === "ftyp") {
    const brands = new TextDecoder().decode(bytes.slice(8, Math.min(bytes.length, 40)));
    if (brands.includes("avif") || brands.includes("avis")) return "image/avif";
  }
  return null;
}

function safeDimensions(value: [number, number] | null): value is [number, number] {
  return value !== null && value[0] > 0 && value[1] > 0 && value[0] <= 20_000 && value[1] <= 20_000 && value[0] * value[1] <= 80_000_000;
}

function dimensions(bytes: Uint8Array, mime: string): [number, number] | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mime === "image/png" && bytes.length >= 24) return [view.getUint32(16), view.getUint32(20)];
  if (mime === "image/jpeg") {
    let position = 2;
    while (position + 9 < bytes.length) {
      if (bytes[position] !== 0xff) { position += 1; continue; }
      const marker = bytes[position + 1], length = view.getUint16(position + 2);
      if (marker >= 0xc0 && marker <= 0xc3) return [view.getUint16(position + 7), view.getUint16(position + 5)];
      position += 2 + length;
    }
  }
  if (mime === "image/webp" && bytes.length >= 30) {
    const chunk = new TextDecoder().decode(bytes.slice(12, 16));
    if (chunk === "VP8X") return [1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16)];
    if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) return [view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff];
    if (chunk === "VP8L" && bytes[20] === 0x2f) {
      const packed = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
      return [(packed & 0x3fff) + 1, ((packed >>> 14) & 0x3fff) + 1];
    }
  }
  if (mime === "image/avif") {
    for (let index = 4; index + 16 < bytes.length; index += 1) if (new TextDecoder().decode(bytes.slice(index, index + 4)) === "ispe") return [view.getUint32(index + 8), view.getUint32(index + 12)];
  }
  return null;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, canonicalize(child)]));
  return value;
}

function hammingDistance(left: string, right: string): number {
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    let value = Number.parseInt(left[index], 16) ^ Number.parseInt(right[index], 16);
    while (value) { distance += value & 1; value >>>= 1; }
  }
  return distance;
}

async function authorized(identity: Identity, permission: string) {
  const { data } = await identity.admin.rpc("cms_actor_authorized", {
    p_actor_id: identity.user.id, p_permission: permission, p_aal: identity.claims.aal,
    p_session_id: identity.claims.sessionId, p_issued_at: identity.claims.issuedAt,
  });
  return data === true;
}

function rightsState(expiresAt: string | null): "valid" | "expiring" | "expired" | "undated" {
  if (!expiresAt) return "undated";
  const expiry = Date.parse(expiresAt), now = Date.now();
  if (expiry <= now) return "expired";
  return expiry <= now + 30 * 24 * 60 * 60 * 1000 ? "expiring" : "valid";
}

function uploadPaths(assetId: string, declaredMime: string) {
  const ext = extByMime[declaredMime];
  return [
    { key: "original", format: ext, path: `cms/${assetId}/original.${ext}` },
    ...variantSpecs.map(([key, format]) => ({ key, format, path: `cms/${assetId}/${key}.${format}` })),
  ];
}

async function signedUploads(identity: Identity, assetId: string, declaredMime: string) {
  const storage = identity.admin.storage.from("cms-media-private"), uploads = [];
  for (const item of uploadPaths(assetId, declaredMime)) {
    const signed = await storage.createSignedUploadUrl(item.path);
    if (signed.error) throw new Error("CMS_DAM_UPLOAD_SIGNING_FAILED");
    uploads.push({ ...item, token: signed.data.token, signedUrl: signed.data.signedUrl });
  }
  return uploads;
}

const assetColumns = "id,original_filename,processing_status,scan_status,source_kind,source_reference,license_name,owner_name,rights_expires_at,alt_text,caption,credit,focal_x,focal_y,width,height,sha256,perceptual_hash,lock_version,archived_at,created_at,updated_at,declared_mime,storage_path";

async function hydrateAssets(identity: Identity, rows: Record<string, any>[], includeUsages = false) {
  const ids = rows.map((row) => String(row.id));
  if (!ids.length) return [];
  const [variantsResult, collectionLinksResult, tagLinksResult, cropsResult, usagesResult, replacementsResult] = await Promise.all([
    identity.admin.from("cms_media_variants").select("asset_id,transform_path").in("asset_id", ids).eq("variant_key", "thumbnail").eq("format", "webp"),
    identity.admin.from("cms_dam_collection_assets").select("asset_id,collection_id").in("asset_id", ids),
    identity.admin.from("cms_dam_asset_tags").select("asset_id,tag_id").in("asset_id", ids),
    identity.admin.from("cms_dam_crops").select("id,asset_id,crop_key,label,aspect_width,aspect_height,crop_x,crop_y,crop_width,crop_height,focal_x,focal_y,updated_at").in("asset_id", ids),
    includeUsages ? identity.admin.from("cms_media_usages").select("asset_id,item_id,revision_id,block_id,usage_kind,created_at").in("asset_id", ids) : Promise.resolve({ data: [] as Record<string, any>[] }),
    identity.admin.from("cms_dam_replacements").select("id,source_asset_id,target_asset_id,lock_version").eq("status", "active").in("source_asset_id", ids),
  ]);
  const collectionIds = [...new Set((collectionLinksResult.data ?? []).map((row) => row.collection_id))];
  const tagIds = [...new Set((tagLinksResult.data ?? []).map((row) => row.tag_id))];
  const [collectionsResult, tagsResult] = await Promise.all([
    collectionIds.length ? identity.admin.from("cms_dam_collections").select("id,name,description").in("id", collectionIds) : Promise.resolve({ data: [] as Record<string, any>[] }),
    tagIds.length ? identity.admin.from("cms_dam_tags").select("id,name").in("id", tagIds) : Promise.resolve({ data: [] as Record<string, any>[] }),
  ]);
  const previewByAsset = new Map<string, string>();
  if (variantsResult.data?.length) {
    const signed = await identity.admin.storage.from("cms-media-private").createSignedUrls(variantsResult.data.map((row) => row.transform_path), 900);
    variantsResult.data.forEach((row, index) => { const url = signed.data?.[index]?.signedUrl; if (url) previewByAsset.set(row.asset_id, url); });
  }
  const collectionById = new Map((collectionsResult.data ?? []).map((row) => [row.id, row]));
  const tagById = new Map((tagsResult.data ?? []).map((row) => [row.id, row]));
  const replacementBySource = new Map((replacementsResult.data ?? []).map((row) => [String(row.source_asset_id), row]));
  const collectionCounts = new Map<string, number>(), tagCounts = new Map<string, number>();
  (collectionLinksResult.data ?? []).forEach((row) => collectionCounts.set(row.collection_id, (collectionCounts.get(row.collection_id) ?? 0) + 1));
  (tagLinksResult.data ?? []).forEach((row) => tagCounts.set(row.tag_id, (tagCounts.get(row.tag_id) ?? 0) + 1));
  return rows.map((row) => ({
    id: row.id, originalFilename: row.original_filename,
    processingStatus: row.archived_at ? "archived" : replacementBySource.has(String(row.id)) ? "replaced" : row.processing_status,
    scanStatus: row.scan_status, sourceKind: row.source_kind, sourceReference: row.source_reference,
    licenseName: row.license_name, ownerName: row.owner_name, rightsExpiresAt: row.rights_expires_at,
    rightsState: rightsState(row.rights_expires_at), altText: row.alt_text, caption: row.caption, credit: row.credit,
    focalX: Number(row.focal_x), focalY: Number(row.focal_y), width: row.width, height: row.height,
    sha256: row.sha256, perceptualHash: row.perceptual_hash, previewUrl: previewByAsset.get(String(row.id)) ?? null,
    lockVersion: Number(row.lock_version), archivedAt: row.archived_at, createdAt: row.created_at, updatedAt: row.updated_at,
    activeReplacement: replacementBySource.has(String(row.id)) ? {
      id: replacementBySource.get(String(row.id))!.id,
      targetAssetId: replacementBySource.get(String(row.id))!.target_asset_id,
      lockVersion: Number(replacementBySource.get(String(row.id))!.lock_version),
    } : null,
    collections: (collectionLinksResult.data ?? []).filter((link) => link.asset_id === row.id).map((link) => collectionById.get(link.collection_id)).filter(Boolean).map((collection) => ({ ...collection, assetCount: collectionCounts.get(collection!.id) ?? 0 })),
    tags: (tagLinksResult.data ?? []).filter((link) => link.asset_id === row.id).map((link) => tagById.get(link.tag_id)).filter(Boolean).map((tag) => ({ ...tag, assetCount: tagCounts.get(tag!.id) ?? 0 })),
    crops: (cropsResult.data ?? []).filter((crop) => crop.asset_id === row.id).map((crop) => ({ id: crop.id, cropKey: crop.crop_key, label: crop.label, aspectWidth: crop.aspect_width, aspectHeight: crop.aspect_height, x: Number(crop.crop_x), y: Number(crop.crop_y), width: Number(crop.crop_width), height: Number(crop.crop_height), focalX: Number(crop.focal_x), focalY: Number(crop.focal_y), updatedAt: crop.updated_at })),
    usages: (usagesResult.data ?? []).filter((usage) => usage.asset_id === row.id).map((usage) => ({ itemId: usage.item_id, revisionId: usage.revision_id, blockId: usage.block_id, usageKind: usage.usage_kind, createdAt: usage.created_at })),
  }));
}

async function listTaxonomies(identity: Identity) {
  const [collections, collectionLinks, tags, tagLinks] = await Promise.all([
    identity.admin.from("cms_dam_collections").select("id,name,description").eq("status", "active").order("name"),
    identity.admin.from("cms_dam_collection_assets").select("collection_id"),
    identity.admin.from("cms_dam_tags").select("id,name").order("name"),
    identity.admin.from("cms_dam_asset_tags").select("tag_id"),
  ]);
  const collectionCount = new Map<string, number>(), tagCount = new Map<string, number>();
  (collectionLinks.data ?? []).forEach((row) => collectionCount.set(row.collection_id, (collectionCount.get(row.collection_id) ?? 0) + 1));
  (tagLinks.data ?? []).forEach((row) => tagCount.set(row.tag_id, (tagCount.get(row.tag_id) ?? 0) + 1));
  return {
    collections: (collections.data ?? []).map((row) => ({ ...row, assetCount: collectionCount.get(row.id) ?? 0 })),
    tags: (tags.data ?? []).map((row) => ({ ...row, assetCount: tagCount.get(row.id) ?? 0 })),
  };
}

async function getAssetsByIds(identity: Identity, ids: string[], includeUsages = false) {
  if (!ids.length) return [];
  const { data, error } = await identity.admin.from("cms_media_assets").select(assetColumns).in("id", ids);
  if (error) throw error;
  const order = new Map(ids.map((id, index) => [id, index]));
  return hydrateAssets(identity, (data ?? []).sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0)), includeUsages);
}

async function handleV2(req: Request, identity: Identity, command: z.infer<typeof V2Input>) {
  const { environment, siteKey } = command.envelope.actorContext, correlationId = command.envelope.correlationId;
  if (environment === "production" && !isProductionOperationEnabled(environment)) return json(req, { error: "Produção indisponível nesta fase.", code: "CMS_DAM_PRODUCTION_GATED", correlationId }, 403);
  const configuredEnvironment = Deno.env.get("CMS_ENVIRONMENT");
  if (!isConfiguredCmsEnvironment(configuredEnvironment)) return json(req, { error: "Ambiente do CMS não configurado.", correlationId }, 503);
  if (configuredEnvironment !== environment || siteKey !== "main") return json(req, { error: "Escopo não autorizado.", code: "CMS_DAM_SCOPE_MISMATCH", correlationId }, 403);
  const occurredAt = Date.parse(command.envelope.occurredAt);
  if (occurredAt < Date.now() - 15 * 60_000 || occurredAt > Date.now() + 5 * 60_000) return json(req, { error: "Comando expirado ou futuro.", code: "CMS_DAM_COMMAND_STALE", correlationId }, 409);
  try {
    const allowed = await consumeRateLimit(identity.admin, req, `cms_dam_${command.action}`, `${identity.user.id}:${clientAddress(req)}`, command.action.startsWith("list") || command.action.startsWith("get") ? 120 : 60, 900);
    if (!allowed) return json(req, { error: "Muitas operações. Aguarde.", correlationId }, 429);
  } catch { return json(req, { error: "Proteção temporariamente indisponível.", correlationId }, 503); }
  const common = { p_actor_id: identity.user.id, p_environment: environment, p_site_key: siteKey, p_aal: identity.claims.aal, p_session_id: identity.claims.sessionId, p_issued_at: identity.claims.issuedAt };
  const { data: capability, error: capabilityError } = await identity.admin.rpc("cms_evaluate_feature_flag", { ...common, p_flag_key: "ev2.dam" });
  if (capabilityError) return json(req, { error: "Capacidade indisponível.", correlationId }, 503);
  if (command.action === "capability") return json(req, { ...capability, commandId: command.envelope.commandId, correlationId });
  if (capability?.enabled !== true) return json(req, { error: "DAM v2 não habilitado.", code: "CMS_DAM_FEATURE_DISABLED", correlationId }, 403);
  if (!(await authorized(identity, "cms:media.read"))) return json(req, { error: "Permissão insuficiente.", code: "CMS_DAM_FORBIDDEN", correlationId }, 403);

  try {
    if (command.action === "list_assets") {
      let matchingIds: string[] | undefined;
      if (command.collectionId) {
        const { data } = await identity.admin.from("cms_dam_collection_assets").select("asset_id").eq("collection_id", command.collectionId);
        matchingIds = (data ?? []).map((row) => row.asset_id);
      }
      if (command.tagIds.length) {
        const { data } = await identity.admin.from("cms_dam_asset_tags").select("asset_id,tag_id").in("tag_id", command.tagIds);
        const counts = new Map<string, Set<string>>();
        (data ?? []).forEach((row) => { const current = counts.get(row.asset_id) ?? new Set<string>(); current.add(row.tag_id); counts.set(row.asset_id, current); });
        const tagged = [...counts].filter(([, tags]) => tags.size === command.tagIds.length).map(([assetId]) => assetId);
        matchingIds = matchingIds ? matchingIds.filter((id) => tagged.includes(id)) : tagged;
      }
      const from = (command.page - 1) * command.pageSize, to = from + command.pageSize - 1;
      let query = identity.admin.from("cms_media_assets").select(assetColumns, { count: "exact" }).order("created_at", { ascending: false });
      if (!command.includeArchived) query = query.is("archived_at", null);
      if (matchingIds) {
        if (!matchingIds.length) return json(req, { schemaVersion: 1, commandId: command.envelope.commandId, correlationId, items: [], ...(await listTaxonomies(identity)), page: command.page, pageSize: command.pageSize, total: 0 });
        query = query.in("id", matchingIds);
      }
      const safeQuery = command.query.replace(/[%_(),]/g, "");
      if (safeQuery) query = query.or(`original_filename.ilike.%${safeQuery}%,alt_text.ilike.%${safeQuery}%,owner_name.ilike.%${safeQuery}%,source_reference.ilike.%${safeQuery}%`);
      const now = new Date(), review = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      if (command.rightsState === "undated") query = query.is("rights_expires_at", null);
      if (command.rightsState === "expired") query = query.lte("rights_expires_at", now.toISOString());
      if (command.rightsState === "expiring") query = query.gt("rights_expires_at", now.toISOString()).lte("rights_expires_at", review.toISOString());
      if (command.rightsState === "valid") query = query.gt("rights_expires_at", review.toISOString());
      const { data, count, error } = await query.range(from, to);
      if (error) throw error;
      return json(req, { schemaVersion: 1, commandId: command.envelope.commandId, correlationId, items: await hydrateAssets(identity, data ?? []), ...(await listTaxonomies(identity)), page: command.page, pageSize: command.pageSize, total: count ?? 0 });
    }
    if (command.action === "get_asset") {
      const [asset] = await getAssetsByIds(identity, [command.assetId], true);
      if (!asset) return json(req, { error: "Mídia não encontrada.", code: "CMS_DAM_ASSET_NOT_FOUND", correlationId }, 404);
      return json(req, { schemaVersion: 1, commandId: command.envelope.commandId, correlationId, asset });
    }
    if (command.action === "match_asset") {
      const { data: exactRows } = await identity.admin.from("cms_media_assets").select("id").eq("sha256", command.sha256).is("archived_at", null).limit(1);
      const { data: similarRows } = command.perceptualHash ? await identity.admin.from("cms_media_assets").select("id,perceptual_hash").not("perceptual_hash", "is", null).is("archived_at", null).limit(200) : { data: [] };
      const similarIds = (similarRows ?? []).filter((row) => row.id !== exactRows?.[0]?.id && hammingDistance(command.perceptualHash!, row.perceptual_hash) <= command.maximumDistance).map((row) => row.id).slice(0, 12);
      const [exact, similar] = await Promise.all([getAssetsByIds(identity, exactRows?.length ? [exactRows[0].id] : []), getAssetsByIds(identity, similarIds)]);
      return json(req, { schemaVersion: 1, commandId: command.envelope.commandId, correlationId, exact: exact[0] ?? null, similar });
    }
    if (command.action === "preview_replacement") {
      const assets = await getAssetsByIds(identity, [command.sourceAssetId, command.targetAssetId], true);
      const source = assets.find((asset) => asset.id === command.sourceAssetId), target = assets.find((asset) => asset.id === command.targetAssetId);
      if (!source || !target) return json(req, { error: "Mídia de origem ou destino não encontrada.", correlationId }, 404);
      const { data: publishable } = await identity.admin.rpc("cms_dam_asset_publishable", { p_asset_id: command.targetAssetId, p_at: new Date().toISOString() });
      return json(req, { schemaVersion: 1, commandId: command.envelope.commandId, correlationId, sourceAssetId: source.id, targetAssetId: target.id, usageCount: source.usages.length, usages: source.usages, targetPublishable: publishable === true });
    }
    if (command.action === "reserve_upload") {
      if (!(await authorized(identity, "cms:media.upload"))) return json(req, { error: "Permissão insuficiente.", code: "CMS_DAM_FORBIDDEN", correlationId }, 403);
      if (command.metadata.sha256) {
        const { data: duplicate } = await identity.admin.from("cms_media_assets").select("id").eq("sha256", command.metadata.sha256).is("archived_at", null).limit(1);
        if (duplicate?.length) { const [existing] = await getAssetsByIds(identity, [duplicate[0].id]); return json(req, { error: "Arquivo já existe; reutilize o ativo encontrado.", code: "CMS_DAM_DUPLICATE", correlationId, existingAsset: existing }, 409); }
      }
      const assetId = command.envelope.commandId, storagePath = `cms/${assetId}/original.${extByMime[command.metadata.declaredMime]}`;
      const reservationHash = await sha256(JSON.stringify(canonicalize({ actorId: identity.user.id, environment, siteKey, metadata: command.metadata })));
      const { error } = await identity.admin.from("cms_media_assets").insert({
        id: assetId, storage_path: storagePath, original_filename: command.metadata.originalFilename,
        declared_mime: command.metadata.declaredMime, source_kind: command.metadata.sourceKind,
        source_reference: command.metadata.sourceReference, rights_confirmed: true,
        rights_expires_at: command.metadata.rightsExpiresAt, license_name: command.metadata.licenseName,
        owner_name: command.metadata.ownerName, alt_text: command.metadata.altText,
        caption: command.metadata.caption, credit: command.metadata.credit, focal_x: command.metadata.focalX,
        focal_y: command.metadata.focalY, perceptual_hash: command.metadata.perceptualHash ?? null,
        reservation_hash: reservationHash, created_by: identity.user.id,
      });
      if (error) {
        if (error.code !== "23505") throw error;
        const { data: reserved } = await identity.admin
          .from("cms_media_assets")
          .select("id,created_by,declared_mime,processing_status,reservation_hash")
          .eq("id", assetId)
          .maybeSingle();
        if (!reserved && command.metadata.sha256) {
          const { data: duplicate } = await identity.admin
            .from("cms_media_assets")
            .select("id")
            .eq("sha256", command.metadata.sha256)
            .is("archived_at", null)
            .limit(1);
          if (duplicate?.length) {
            const [existing] = await getAssetsByIds(identity, [duplicate[0].id]);
            return json(req, { error: "Arquivo já existe; reutilize o ativo encontrado.", code: "CMS_DAM_DUPLICATE", correlationId, existingAsset: existing }, 409);
          }
        }
        if (!reserved || reserved.created_by !== identity.user.id || reserved.reservation_hash !== reservationHash || reserved.declared_mime !== command.metadata.declaredMime) {
          return json(req, { error: "A reserva já existe com outro conteúdo.", code: "CMS_DAM_IDEMPOTENCY_CONFLICT", correlationId, preserved: true }, 409);
        }
        if (!["awaiting_upload", "processing", "failed"].includes(reserved.processing_status)) {
          const [existing] = await getAssetsByIds(identity, [assetId]);
          return json(req, { error: "A reserva já foi concluída ou rejeitada.", code: "CMS_DAM_RESERVATION_CLOSED", correlationId, existingAsset: existing, preserved: true }, 409);
        }
      }
      const uploads = await signedUploads(identity, assetId, command.metadata.declaredMime);
      return json(req, { schemaVersion: 1, commandId: command.envelope.commandId, correlationId, assetId, uploads, status: "awaiting_upload" }, error ? 200 : 201);
    }
    if (command.action === "finalize_upload") {
      if (!(await authorized(identity, "cms:media.upload"))) return json(req, { error: "Permissão insuficiente.", code: "CMS_DAM_FORBIDDEN", correlationId }, 403);
      return finalizeAsset(req, identity, command.assetId, { commandId: command.envelope.commandId, correlationId, v2: true });
    }
    if (command.action === "run_gc") {
      if (!(await authorized(identity, "cms:media.manage"))) return json(req, { error: "Permissão insuficiente.", code: "CMS_DAM_FORBIDDEN", correlationId }, 403);
      let jobsQuery = identity.admin.from("cms_dam_gc_jobs").select("id,asset_id,asset_snapshot,execute_after,status").in("status", ["pending", "failed", "processing", "blocked"]).lte("execute_after", new Date().toISOString()).order("execute_after").limit(command.limit);
      if (command.jobId) jobsQuery = jobsQuery.eq("id", command.jobId);
      const { data: jobs, error } = await jobsQuery;
      if (error) throw error;
      if (command.dryRun) return json(req, { schemaVersion: 1, commandId: command.envelope.commandId, correlationId, dryRun: true, candidates: jobs ?? [] });
      const results = [];
      for (const job of jobs ?? []) {
        const { data: snapshot, error: prepareError } = await identity.admin.rpc("cms_prepare_dam_gc", { p_job_id: job.id });
        if (prepareError) {
          await identity.admin.from("cms_dam_gc_jobs").update({ status: "blocked", last_error: "Asset em uso ou retenção ainda ativa." }).eq("id", job.id).in("status", ["pending", "failed", "processing"]);
          results.push({ jobId: job.id, status: "blocked" }); continue;
        }
        const paths = Array.isArray(snapshot?.paths) ? snapshot.paths.filter((path: unknown): path is string => typeof path === "string") : [];
        const removed = await identity.admin.storage.from("cms-media-private").remove(paths);
        if (removed.error) { await identity.admin.from("cms_dam_gc_jobs").update({ status: "failed", last_error: "Falha ao remover objetos privados." }).eq("id", job.id); results.push({ jobId: job.id, status: "failed" }); continue; }
        await identity.admin.from("cms_dam_gc_jobs").update({ status: "done", completed_at: new Date().toISOString(), last_error: null }).eq("id", job.id); results.push({ jobId: job.id, status: "done" });
      }
      return json(req, { schemaVersion: 1, commandId: command.envelope.commandId, correlationId, dryRun: false, results });
    }

    const mutationPermission = ["archive_collection", "archive_asset", "restore_asset", "activate_replacement", "rollback_replacement"].includes(command.action)
      ? "cms:media.manage"
      : "cms:media.edit";
    if (!(await authorized(identity, mutationPermission))) return json(req, { error: "Permissão insuficiente ou autenticação reforçada necessária.", code: "CMS_DAM_FORBIDDEN", correlationId }, 403);
    const idempotencyKey = req.headers.get("X-Idempotency-Key");
    if (!idempotencyKey || !Uuid.safeParse(idempotencyKey).success) return json(req, { error: "Chave idempotente obrigatória.", correlationId }, 400);
    const payload = { ...Object.fromEntries(Object.entries(command).filter(([key]) => !["action", "envelope"].includes(key))), expectedVersion: command.envelope.expectedVersion };
    const requestHash = await sha256(JSON.stringify(canonicalize(command)));
    const { data, error } = await identity.admin.rpc("cms_execute_dam_command", { ...common, p_action: command.action, p_payload: payload, p_command_id: command.envelope.commandId, p_idempotency_key: idempotencyKey, p_request_hash: requestHash, p_correlation_id: correlationId });
    if (error) throw error;
    return json(req, data);
  } catch (error) {
    const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
    const message = typeof record.message === "string" ? record.message : String(error), databaseCode = typeof record.code === "string" ? record.code : "";
    const forbidden = message.includes("FORBIDDEN") || message.includes("FEATURE_DISABLED") || message.includes("PRODUCTION_GATED") || databaseCode === "42501";
    const notFound = message.includes("NOT_FOUND");
    const conflict = message.includes("CONFLICT") || message.includes("IN_USE") || message.includes("INVALID") || databaseCode === "P0001" || databaseCode === "23505";
    return json(req, { error: forbidden ? "Operação não autorizada." : notFound ? "Registro não encontrado." : conflict ? "A operação conflita com o estado atual; recarregue e revise o impacto." : "Não foi possível concluir a operação DAM.", code: message.split(":")[0], correlationId, preserved: true }, forbidden ? 403 : notFound ? 404 : conflict ? 409 : 500);
  }
}

async function finalizeAsset(req: Request, identity: Identity, assetId: string, context?: { commandId: string; correlationId: string; v2: boolean }) {
  const storage = identity.admin.storage.from("cms-media-private");
  const { data: asset } = await identity.admin.from("cms_media_assets").select("*").eq("id", assetId).single();
  if (!asset) return json(req, { error: "Mídia não encontrada." }, 404);
  if (context?.v2 && asset.created_by !== identity.user.id && !(await authorized(identity, "cms:media.manage"))) {
    return json(req, { error: "Somente o autor da reserva ou um gestor com MFA pode finalizá-la.", code: "CMS_DAM_FORBIDDEN", correlationId: context.correlationId }, 403);
  }
  if (context?.v2 && asset.processing_status === "ready") {
    const { count } = await identity.admin
      .from("cms_media_variants")
      .select("id", { count: "exact", head: true })
      .eq("asset_id", assetId);
    return json(req, {
      schemaVersion: 1,
      commandId: context.commandId,
      correlationId: context.correlationId,
      assetId,
      status: "ready",
      sha256: asset.sha256,
      width: asset.width,
      height: asset.height,
      variants: count ?? 0,
      replayed: true,
    });
  }
  if (!["awaiting_upload", "processing", "failed"].includes(asset.processing_status)) {
    return json(req, { error: "Mídia já finalizada ou rejeitada.", code: "CMS_DAM_FINALIZATION_CLOSED", correlationId: context?.correlationId }, 409);
  }
  await identity.admin.from("cms_media_assets").update({ processing_status: "processing" }).eq("id", assetId);
  const original = await storage.download(asset.storage_path);
  if (original.error) return json(req, { error: "Original ainda não foi enviado." }, 409);
  const scanEngine = context?.v2 ? "raster-signature-v2" : "safe-raster-magic-v1";
  const originalBytes = new Uint8Array(await original.data.arrayBuffer()), detected = mimeOf(originalBytes), size = originalBytes.length;
  const originalDimensions = detected ? dimensions(originalBytes, detected) : null;
  if (!detected || detected !== asset.declared_mime || !safeDimensions(originalDimensions) || size > 20 * 1024 * 1024) {
    await identity.admin.from("cms_media_assets").update({ processing_status: "rejected", scan_status: "rejected", scan_engine: scanEngine }).eq("id", assetId);
    return json(req, { error: "Arquivo rejeitado por MIME, dimensão ou tamanho." }, 422);
  }
  const digest = await sha256Bytes(originalBytes);
  const { data: duplicate } = await identity.admin.from("cms_media_assets").select("id").eq("sha256", digest).neq("id", assetId).is("archived_at", null).limit(1);
  if (duplicate?.length) {
    await storage.remove(uploadPaths(assetId, asset.declared_mime).map((item) => item.path));
    await identity.admin.from("cms_media_assets").delete().eq("id", assetId);
    const [existing] = await getAssetsByIds(identity, [duplicate[0].id]);
    return json(req, { error: "Arquivo duplicado; reutilize o ativo existente.", code: "CMS_DAM_DUPLICATE", existingAsset: existing, correlationId: context?.correlationId }, 409);
  }
  const variantRows = [];
  for (const [key, format] of variantSpecs) {
    const path = `cms/${assetId}/${key}.${format}`, downloaded = await storage.download(path);
    if (downloaded.error) return json(req, { error: "Processamento incompleto: variante ausente." }, 409);
    const bytes = new Uint8Array(await downloaded.data.arrayBuffer()), mime = mimeOf(bytes), dims = mime ? dimensions(bytes, mime) : null;
    if (
      mime !== `image/${format}` ||
      !safeDimensions(dims) ||
      bytes.length > 20 * 1024 * 1024 ||
      dims[0] > originalDimensions[0] ||
      dims[1] > originalDimensions[1]
    ) return json(req, { error: "Variante processada inválida ou ampliada além do original." }, 422);
    variantRows.push({ asset_id: assetId, variant_key: key, format, width: dims[0], height: dims[1], transform_path: path });
  }
  if (context?.v2) {
    const { data, error } = await identity.admin.rpc("cms_finalize_dam_asset", {
      p_actor_id: identity.user.id,
      p_asset_id: assetId,
      p_detected_mime: detected,
      p_byte_size: size,
      p_sha256: digest,
      p_width: originalDimensions[0],
      p_height: originalDimensions[1],
      p_variants: variantRows.map(({ variant_key, format, width, height, transform_path }) => ({ variant_key, format, width, height, transform_path })),
      p_correlation_id: context.correlationId,
      p_aal: identity.claims.aal,
      p_session_id: identity.claims.sessionId,
      p_issued_at: identity.claims.issuedAt,
    });
    if (error) {
      if (error.code === "23505" || error.message.includes("CMS_DAM_DUPLICATE")) {
        await storage.remove(uploadPaths(assetId, asset.declared_mime).map((item) => item.path));
        await identity.admin.from("cms_media_assets").delete().eq("id", assetId);
        const { data: duplicateRows } = await identity.admin.from("cms_media_assets").select("id").eq("sha256", digest).neq("id", assetId).is("archived_at", null).limit(1);
        const [existing] = await getAssetsByIds(identity, duplicateRows?.length ? [duplicateRows[0].id] : []);
        return json(req, { error: "Arquivo duplicado; reutilize o ativo existente.", code: "CMS_DAM_DUPLICATE", existingAsset: existing, correlationId: context.correlationId }, 409);
      }
      throw error;
    }
    return json(req, { schemaVersion: 1, commandId: context.commandId, correlationId: context.correlationId, ...data });
  }
  const { error: variantsError } = await identity.admin.from("cms_media_variants").upsert(variantRows, { onConflict: "asset_id,variant_key,format" });
  if (variantsError) return json(req, { error: "Não foi possível registrar as variantes." }, 422);
  const { error: readyError } = await identity.admin.from("cms_media_assets").update({ detected_mime: detected, byte_size: size, sha256: digest, width: originalDimensions[0], height: originalDimensions[1], processing_status: "ready", scan_status: "clean", scan_engine: scanEngine, processed_at: new Date().toISOString(), lock_version: Number(asset.lock_version ?? 1) + 1 }).eq("id", assetId);
  if (readyError) return json(req, { error: "Falha ao concluir a mídia." }, 422);
  const correlationId = context?.correlationId ?? crypto.randomUUID();
  await Promise.all([
    identity.admin.from("cms_audit_log").insert({ actor_id: identity.user.id, action: "cms:media.finalize", target_type: "media_asset", target_id: assetId, event_data: { sha256: digest, variants: variantRows.length }, correlation_id: correlationId }),
  ]);
  return json(req, { assetId, status: "ready", sha256: digest, width: originalDimensions[0], height: originalDimensions[1], variants: variantRows.length });
}

async function handleV1(req: Request, identity: Identity, input: z.infer<typeof V1Input>) {
  const permission = input.action === "list" || input.action === "usages" ? "cms:media.read" : input.action === "create" || input.action === "finalize" ? "cms:media.upload" : "cms:media.manage";
  if (!(await authorized(identity, permission))) return json(req, { error: "Permissão insuficiente." }, 403);
  const storage = identity.admin.storage.from("cms-media-private");
  if (input.action === "create") {
    const id = crypto.randomUUID(), storagePath = `cms/${id}/original.${extByMime[input.metadata.declaredMime]}`;
    const { error } = await identity.admin.from("cms_media_assets").insert({ id, storage_path: storagePath, original_filename: input.metadata.originalFilename, declared_mime: input.metadata.declaredMime, source_kind: input.metadata.sourceKind, source_reference: input.metadata.sourceReference, rights_confirmed: true, license_name: input.metadata.licenseName, owner_name: input.metadata.ownerName, alt_text: input.metadata.altText, caption: input.metadata.caption ?? null, credit: input.metadata.credit ?? null, focal_x: input.metadata.focalX, focal_y: input.metadata.focalY, replaces_asset_id: input.metadata.replacesAssetId ?? null, created_by: identity.user.id });
    if (error) return json(req, { error: "Não foi possível reservar a mídia." }, 422);
    try { return json(req, { assetId: id, uploads: await signedUploads(identity, id, input.metadata.declaredMime), status: "awaiting_upload" }, 201); }
    catch { return json(req, { error: "Não foi possível preparar o upload." }, 503); }
  }
  if (input.action === "finalize") return finalizeAsset(req, identity, input.assetId);
  if (input.action === "list") {
    const from = (input.page - 1) * input.pageSize, to = from + input.pageSize - 1;
    let query = identity.admin.from("cms_media_assets").select("id,original_filename,processing_status,scan_status,source_kind,license_name,owner_name,alt_text,width,height,version,created_at", { count: "exact" }).is("archived_at", null).order("created_at", { ascending: false }).range(from, to);
    if (input.query) query = query.ilike("original_filename", `%${input.query.replace(/[%_]/g, "")}%`);
    const { data, count, error } = await query;
    if (error) return json(req, { error: "Falha ao listar mídia." }, 500);
    const assetIds = (data ?? []).map((item) => item.id), previews = new Map<string, string>();
    if (assetIds.length) {
      const { data: variants } = await identity.admin.from("cms_media_variants").select("asset_id,transform_path").in("asset_id", assetIds).eq("variant_key", "thumbnail").eq("format", "webp");
      if (variants?.length) { const signed = await storage.createSignedUrls(variants.map((variant) => variant.transform_path), 900); variants.forEach((variant, index) => { const url = signed.data?.[index]?.signedUrl; if (url) previews.set(variant.asset_id, url); }); }
    }
    return json(req, { items: (data ?? []).map((item) => ({ ...item, preview_url: previews.get(item.id) ?? null })), page: input.page, pageSize: input.pageSize, total: count ?? 0 });
  }
  if (input.action === "usages") {
    const { data, error } = await identity.admin.from("cms_media_usages").select("item_id,revision_id,block_id,usage_kind,created_at").eq("asset_id", input.assetId);
    return error ? json(req, { error: "Falha ao consultar usos." }, 500) : json(req, { assetId: input.assetId, usages: data });
  }
  const [{ count: usageCount }, { count: replacementCount }] = await Promise.all([
    identity.admin.from("cms_media_usages").select("id", { count: "exact", head: true }).eq("asset_id", input.assetId),
    identity.admin
      .from("cms_dam_replacements")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .or(`source_asset_id.eq.${input.assetId},target_asset_id.eq.${input.assetId}`),
  ]);
  if ((usageCount ?? 0) > 0 || (replacementCount ?? 0) > 0) {
    return json(req, {
      error: "Mídia em uso ou vinculada a uma substituição ativa não pode ser excluída.",
      usages: usageCount ?? 0,
      replacements: replacementCount ?? 0,
    }, 409);
  }
  const { data: asset } = await identity.admin
    .from("cms_media_assets")
    .select("storage_path,declared_mime,archived_at")
    .eq("id", input.assetId)
    .single();
  if (!asset) return json(req, { error: "Mídia não encontrada." }, 404);
  if (asset.archived_at && Date.parse(asset.archived_at) > Date.now() - 30 * 24 * 60 * 60 * 1000) {
    return json(req, { error: "Mídia arquivada permanece protegida pelo período de retenção." }, 409);
  }
  const removed = await storage.remove(uploadPaths(input.assetId, asset.declared_mime).map((item) => item.path));
  if (removed.error) return json(req, { error: "Falha ao remover objetos privados." }, 503);
  const deletion = await identity.admin.from("cms_media_assets").delete().eq("id", input.assetId);
  return deletion.error ? json(req, { error: "Mídia passou a ter uso e não foi excluída." }, 409) : json(req, { deleted: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (!isAllowedOrigin(req)) return json(req, { error: "Origem não autorizada." }, 403);
  if (req.method !== "POST") return json(req, { error: "Método não permitido." }, 405);
  const identity = await authenticateCms(req);
  if (!identity) return json(req, { error: "Sessão inválida." }, 401);
  let raw: unknown;
  try { raw = await readJsonLimited(req, 64 * 1024); }
  catch { return json(req, { error: "Pedido de mídia inválido." }, 400); }
  const v2 = V2Input.safeParse(raw);
  if (v2.success) return handleV2(req, identity, v2.data);
  const v1 = V1Input.safeParse(raw);
  if (v1.success) return handleV1(req, identity, v1.data);
  return json(req, { error: "Pedido de mídia inválido.", code: "CMS_DAM_COMMAND_INVALID" }, 400);
});
