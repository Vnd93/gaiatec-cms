import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { z } from "npm:zod@4.4.3";
import { authenticateCms } from "../_shared/cms-auth.ts";
import { isConfiguredCmsEnvironment, isProductionOperationEnabled } from "../_shared/ev2-environment.ts";
import {
  containedRasterDimensions,
  inspectRasterImage,
  MAX_RASTER_BYTES,
  type RasterImageMetadata,
} from "../../../src/shared/raster-image-metadata.ts";
import {
  damCropMatchesAspect,
  isDamResolvedAssetPublishable,
} from "../../../src/shared/dam-media-policy.ts";
import { removeAndVerifyMediaStorageObject } from "../_shared/cms-storage-removal.ts";
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
    .object({
      action: z.literal("abort_upload"),
      envelope: Envelope,
      assetId: Uuid,
      reasonCode: z
        .enum(["client_upload_failed", "client_cancelled", "client_processing_failed"])
        .default("client_upload_failed"),
    })
    .strict(),
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
  })
  .strict();
const V1Input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), metadata: V1Metadata }).strict(),
  z.object({ action: z.literal("finalize"), assetId: Uuid }).strict(),
  z.object({ action: z.literal("list"), query: z.string().max(120).default(""), includeArchived: z.boolean().default(false), page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(50).default(20) }).strict(),
  z.object({ action: z.literal("usages"), assetId: Uuid }).strict(),
  z.object({ action: z.literal("delete"), assetId: Uuid }).strict(),
  z.object({ action: z.literal("restore"), assetId: Uuid }).strict(),
]);

const variantSpecs = [
  ["thumbnail", "webp"], ["thumbnail", "avif"], ["medium", "webp"],
  ["medium", "avif"], ["large", "webp"], ["large", "avif"],
] as const;
const variantMaximumEdge = { thumbnail: 480, medium: 960, large: 1_600 } as const;
const extByMime: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/avif": "avif" };
type Identity = NonNullable<Awaited<ReturnType<typeof authenticateCms>>>;
type DamActorScope = { mode: "qa" | "corporate"; actorId: string | null };

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

async function getDamActorScope(identity: Identity): Promise<DamActorScope> {
  const { data, error } = await identity.admin.rpc("cms_dam_actor_scope", {
    p_actor_id: identity.user.id,
    p_aal: identity.claims.aal,
    p_session_id: identity.claims.sessionId,
    p_issued_at: identity.claims.issuedAt,
  });
  if (error || (data?.mode !== "qa" && data?.mode !== "corporate")) throw error ?? new Error("CMS_DAM_ACTOR_SCOPE_UNAVAILABLE");
  return { mode: data.mode, actorId: typeof data.actorId === "string" ? data.actorId : null };
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
  // Supabase signed-upload tokens currently remain usable for roughly two
  // hours. Persist a conservative server-side horizon so compensation never
  // terminalizes a path while a response-lost client can still PUT to it.
  const uploadTokenExpiresAt = new Date(Date.now() + 135 * 60_000).toISOString();
  const { data: extended, error: extensionError } = await identity.admin
    .from("cms_media_assets")
    .update({ upload_token_expires_at: uploadTokenExpiresAt })
    .eq("id", assetId)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();
  if (extensionError || !extended) throw new Error("CMS_DAM_UPLOAD_SIGNING_FAILED");
  return uploads;
}

const assetColumns = "id,original_filename,processing_status,scan_status,source_kind,source_reference,license_name,owner_name,rights_expires_at,alt_text,caption,credit,focal_x,focal_y,width,height,sha256,perceptual_hash,lock_version,archived_at,created_at,updated_at,declared_mime,storage_path";

async function listScopedMediaUsages(
  identity: Identity,
  assetIds: string[],
  includeDetails = true,
) {
  if (!assetIds.length) return { usages: [], impacts: [] };
  const configuredEnvironment = Deno.env.get("CMS_ENVIRONMENT");
  if (!isConfiguredCmsEnvironment(configuredEnvironment))
    throw new Error("CMS_DAM_ENVIRONMENT_UNAVAILABLE");
  const parameters = {
    p_actor_id: identity.user.id,
    p_environment: configuredEnvironment,
    p_aal: identity.claims.aal,
    p_session_id: identity.claims.sessionId,
    p_issued_at: identity.claims.issuedAt,
    p_asset_ids: assetIds,
  };
  const [usages, impacts] = await Promise.all([
    includeDetails
      ? identity.admin.rpc("cms_list_media_usages_scoped", parameters)
      : Promise.resolve({ data: [], error: null }),
    identity.admin.rpc("cms_count_media_usages_scoped", parameters),
  ]);
  if (usages.error || impacts.error) throw new Error("CMS_DAM_USAGE_QUERY_UNAVAILABLE");
  return {
    usages: Array.isArray(usages.data) ? usages.data : [],
    impacts: Array.isArray(impacts.data) ? impacts.data : [],
  };
}

async function hydrateAssets(identity: Identity, scope: DamActorScope, rows: Record<string, any>[], includeUsages = false) {
  const ids = rows.map((row) => String(row.id));
  if (!ids.length) return [];
  const [variantsResult, collectionLinksResult, tagLinksResult, cropsResult, usagesResult, replacementsResult, taxonomies] = await Promise.all([
    identity.admin.from("cms_media_variants").select("asset_id,transform_path").in("asset_id", ids).eq("variant_key", "thumbnail").eq("format", "webp"),
    identity.admin.from("cms_dam_collection_assets").select("asset_id,collection_id").in("asset_id", ids),
    identity.admin.from("cms_dam_asset_tags").select("asset_id,tag_id").in("asset_id", ids),
    identity.admin.from("cms_dam_crops").select("id,asset_id,crop_key,label,aspect_width,aspect_height,crop_x,crop_y,crop_width,crop_height,focal_x,focal_y,updated_at").in("asset_id", ids),
    listScopedMediaUsages(identity, ids, includeUsages).then((data) => ({ data, error: null })),
    identity.admin
      .from("cms_dam_replacements")
      .select("id,source_asset_id,target_asset_id,lock_version")
      .eq("status", "active")
      .or(`source_asset_id.in.(${ids.join(",")}),target_asset_id.in.(${ids.join(",")})`),
    listTaxonomies(identity, scope),
  ]);
  if (collectionLinksResult.error || tagLinksResult.error || cropsResult.error || usagesResult.error || replacementsResult.error)
    throw new Error("CMS_DAM_RELATED_DATA_UNAVAILABLE");
  const previewByAsset = new Map<string, string>();
  if (variantsResult.data?.length) {
    const signed = await identity.admin.storage.from("cms-media-private").createSignedUrls(variantsResult.data.map((row) => row.transform_path), 900);
    variantsResult.data.forEach((row, index) => { const url = signed.data?.[index]?.signedUrl; if (url) previewByAsset.set(row.asset_id, url); });
  }
  const collectionById = new Map(taxonomies.collections.map((row) => [row.id, row]));
  const tagById = new Map(taxonomies.tags.map((row) => [row.id, row]));
  const replacementBySource = new Map((replacementsResult.data ?? []).map((row) => [String(row.source_asset_id), row]));
  const replacementByTarget = new Map((replacementsResult.data ?? []).map((row) => [String(row.target_asset_id), row]));
  const usageImpactByAsset = new Map(
    (usagesResult.data.impacts ?? []).map((impact) => [String(impact.asset_id), impact]),
  );
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
    incomingReplacement: replacementByTarget.has(String(row.id)) ? {
      id: replacementByTarget.get(String(row.id))!.id,
      sourceAssetId: replacementByTarget.get(String(row.id))!.source_asset_id,
      lockVersion: Number(replacementByTarget.get(String(row.id))!.lock_version),
    } : null,
    collections: (collectionLinksResult.data ?? []).filter((link) => link.asset_id === row.id).map((link) => collectionById.get(link.collection_id)).filter(Boolean).map((collection) => ({ ...collection, assetCount: collectionCounts.get(collection!.id) ?? 0 })),
    tags: (tagLinksResult.data ?? []).filter((link) => link.asset_id === row.id).map((link) => tagById.get(link.tag_id)).filter(Boolean).map((tag) => ({ ...tag, assetCount: tagCounts.get(tag!.id) ?? 0 })),
    crops: (cropsResult.data ?? []).filter((crop) => crop.asset_id === row.id).map((crop) => ({ id: crop.id, cropKey: crop.crop_key, label: crop.label, aspectWidth: crop.aspect_width, aspectHeight: crop.aspect_height, x: Number(crop.crop_x), y: Number(crop.crop_y), width: Number(crop.crop_width), height: Number(crop.crop_height), focalX: Number(crop.focal_x), focalY: Number(crop.focal_y), updatedAt: crop.updated_at })),
    totalUsageCount: Number(usageImpactByAsset.get(String(row.id))?.total_usage_count ?? 0),
    hiddenUsageCount: Number(usageImpactByAsset.get(String(row.id))?.hidden_usage_count ?? 0),
    usages: (usagesResult.data.usages ?? []).filter((usage) => usage.asset_id === row.id).map((usage) => ({ itemId: usage.item_id, revisionId: usage.revision_id, blockId: usage.block_id, usageKind: usage.usage_kind, createdAt: usage.created_at, contentType: usage.content_type, displayTitle: usage.display_title, adminPath: usage.admin_path, blockLabel: usage.block_label })),
  }));
}

async function listTaxonomies(identity: Identity, _scope: DamActorScope) {
  const { data, error } = await identity.admin.rpc("cms_list_dam_taxonomies_scoped", {
    p_actor_id: identity.user.id,
    p_aal: identity.claims.aal,
    p_session_id: identity.claims.sessionId,
    p_issued_at: identity.claims.issuedAt,
  });
  if (error) throw error;
  return {
    collections: Array.isArray(data?.collections) ? data.collections : [],
    tags: Array.isArray(data?.tags) ? data.tags : [],
  } as { collections: Array<Record<string, any>>; tags: Array<Record<string, any>> };
}

async function getAssetsByIds(identity: Identity, scope: DamActorScope, ids: string[], includeUsages = false) {
  if (!ids.length) return [];
  let query = identity.admin.from("cms_media_assets").select(assetColumns).in("id", ids);
  query = scope.mode === "qa"
    ? query.eq("created_by", identity.user.id).eq("source_kind", "synthetic_test")
    : query.neq("source_kind", "synthetic_test");
  const { data, error } = await query;
  if (error) throw error;
  const order = new Map(ids.map((id, index) => [id, index]));
  return hydrateAssets(identity, scope, (data ?? []).sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0)), includeUsages);
}

async function publishableSourceIds(
  identity: Identity,
  scope: DamActorScope,
  sourceIds: string[],
): Promise<string[]> {
  const uniqueSourceIds = [...new Set(sourceIds)];
  if (!uniqueSourceIds.length) return [];
  const { data: replacements, error: replacementError } = await identity.admin
    .from("cms_dam_replacements")
    .select("source_asset_id,target_asset_id")
    .eq("status", "active")
    .in("source_asset_id", uniqueSourceIds);
  if (replacementError) throw replacementError;
  const targetBySource = new Map(
    (replacements ?? []).map((replacement) => [
      String(replacement.source_asset_id),
      String(replacement.target_asset_id),
    ]),
  );
  const resolvedIds = [...new Set(uniqueSourceIds.map((id) => targetBySource.get(id) ?? id))];
  let resolvedQuery = identity.admin
    .from("cms_media_assets")
    .select("id,processing_status,scan_status,rights_confirmed,rights_expires_at,archived_at,created_by,source_kind")
    .in("id", resolvedIds);
  resolvedQuery = scope.mode === "qa"
    ? resolvedQuery.eq("created_by", identity.user.id).eq("source_kind", "synthetic_test")
    : resolvedQuery.neq("source_kind", "synthetic_test");
  const { data: resolved, error: resolvedError } = await resolvedQuery;
  if (resolvedError) throw resolvedError;
  const publishable = new Set(
    (resolved ?? [])
      .filter((asset) => isDamResolvedAssetPublishable(asset))
      .map((asset) => String(asset.id)),
  );
  // Reuse always returns the currently resolved, publishable generation. A
  // replaced source id must never be handed back to the picker as though that
  // archived generation itself were selectable.
  return [...new Set(
    uniqueSourceIds
      .map((sourceId) => targetBySource.get(sourceId) ?? sourceId)
      .filter((resolvedId) => publishable.has(resolvedId)),
  )];
}

function damFailureResponse(req: Request, error: unknown, correlationId: string) {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const message = typeof record.message === "string" ? record.message : String(error), databaseCode = typeof record.code === "string" ? record.code : "";
  const forbidden = message.includes("FORBIDDEN") || message.includes("FEATURE_DISABLED") || message.includes("PRODUCTION_GATED") || databaseCode === "42501";
  const notFound = message.includes("NOT_FOUND");
  const conflict = message.includes("CONFLICT") || message.includes("IN_USE") || message.includes("INVALID") || databaseCode === "P0001" || databaseCode === "23505";
  return json(req, { error: forbidden ? "Operação não autorizada." : notFound ? "Registro não encontrado." : conflict ? "A operação conflita com o estado atual; recarregue e revise o impacto." : "Não foi possível concluir a operação DAM.", code: message.split(":")[0], correlationId, preserved: true }, forbidden ? 403 : notFound ? 404 : conflict ? 409 : 500);
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
  if (command.action === "abort_upload") {
    try {
      if (!(await authorized(identity, "cms:media.upload"))) return json(req, { error: "Permissão insuficiente.", code: "CMS_DAM_FORBIDDEN", correlationId }, 403);
      const idempotencyKey = req.headers.get("X-Idempotency-Key");
      if (!idempotencyKey || !Uuid.safeParse(idempotencyKey).success) return json(req, { error: "Chave idempotente obrigatória.", code: "CMS_DAM_IDEMPOTENCY_REQUIRED", correlationId }, 400);
      const requestHash = await sha256(JSON.stringify(canonicalize(command)));
      const { data, error } = await identity.admin.rpc("cms_abort_dam_upload", {
        ...common,
        p_asset_id: command.assetId,
        p_reason_code: command.reasonCode,
        p_command_id: command.envelope.commandId,
        p_idempotency_key: idempotencyKey,
        p_request_hash: requestHash,
        p_correlation_id: correlationId,
      });
      if (error) throw error;
      return json(req, data);
    } catch (error) {
      return damFailureResponse(req, error, correlationId);
    }
  }
  const { data: capability, error: capabilityError } = await identity.admin.rpc("cms_evaluate_feature_flag", { ...common, p_flag_key: "ev2.dam" });
  if (capabilityError) return json(req, { error: "Capacidade indisponível.", correlationId }, 503);
  if (command.action === "capability") return json(req, { ...capability, commandId: command.envelope.commandId, correlationId });
  if (capability?.enabled !== true) return json(req, { error: "Biblioteca de mídia não habilitada.", code: "CMS_DAM_FEATURE_DISABLED", correlationId }, 403);
  if (!(await authorized(identity, "cms:media.read"))) return json(req, { error: "Permissão insuficiente.", code: "CMS_DAM_FORBIDDEN", correlationId }, 403);
  let actorScope: DamActorScope;
  try { actorScope = await getDamActorScope(identity); }
  catch { return json(req, { error: "Escopo DAM indisponível ou expirado.", code: "CMS_DAM_ACTOR_SCOPE_FORBIDDEN", correlationId }, 403); }

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
      query = actorScope.mode === "qa"
        ? query.eq("created_by", identity.user.id).eq("source_kind", "synthetic_test")
        : query.neq("source_kind", "synthetic_test");
      if (!command.includeArchived) query = query.is("archived_at", null);
      if (matchingIds) {
        if (!matchingIds.length) return json(req, { schemaVersion: 1, commandId: command.envelope.commandId, correlationId, items: [], ...(await listTaxonomies(identity, actorScope)), page: command.page, pageSize: command.pageSize, total: 0 });
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
      return json(req, { schemaVersion: 1, commandId: command.envelope.commandId, correlationId, items: await hydrateAssets(identity, actorScope, data ?? []), ...(await listTaxonomies(identity, actorScope)), page: command.page, pageSize: command.pageSize, total: count ?? 0 });
    }
    if (command.action === "get_asset") {
      const [asset] = await getAssetsByIds(identity, actorScope, [command.assetId], true);
      if (!asset) return json(req, { error: "Mídia não encontrada.", code: "CMS_DAM_ASSET_NOT_FOUND", correlationId }, 404);
      return json(req, { schemaVersion: 1, commandId: command.envelope.commandId, correlationId, asset });
    }
    if (command.action === "match_asset") {
      let exactQuery = identity.admin.from("cms_media_assets").select("id").eq("sha256", command.sha256).is("archived_at", null);
      exactQuery = actorScope.mode === "qa"
        ? exactQuery.eq("created_by", identity.user.id).eq("source_kind", "synthetic_test")
        : exactQuery.neq("source_kind", "synthetic_test");
      const { data: exactRows, error: exactError } = await exactQuery.limit(12);
      let similarQuery = identity.admin.from("cms_media_assets").select("id,perceptual_hash").not("perceptual_hash", "is", null).is("archived_at", null);
      similarQuery = actorScope.mode === "qa"
        ? similarQuery.eq("created_by", identity.user.id).eq("source_kind", "synthetic_test")
        : similarQuery.neq("source_kind", "synthetic_test");
      const { data: similarRows, error: similarError } = command.perceptualHash
        ? await similarQuery.limit(200)
        : { data: [], error: null };
      if (exactError || similarError) throw new Error("CMS_DAM_MATCH_UNAVAILABLE");
      const exactIds = await publishableSourceIds(
        identity,
        actorScope,
        (exactRows ?? []).map((row) => String(row.id)),
      );
      const perceptuallySimilarIds = (similarRows ?? [])
        .filter((row) => hammingDistance(command.perceptualHash!, row.perceptual_hash) <= command.maximumDistance)
        .map((row) => String(row.id));
      const similarIds = (await publishableSourceIds(identity, actorScope, perceptuallySimilarIds))
        .filter((resolvedId) => resolvedId !== exactIds[0])
        .slice(0, 12);
      const [exact, similar] = await Promise.all([getAssetsByIds(identity, actorScope, exactIds.slice(0, 1)), getAssetsByIds(identity, actorScope, similarIds)]);
      return json(req, { schemaVersion: 1, commandId: command.envelope.commandId, correlationId, exact: exact[0] ?? null, similar });
    }
    if (command.action === "preview_replacement") {
      const assets = await getAssetsByIds(identity, actorScope, [command.sourceAssetId, command.targetAssetId], true);
      const source = assets.find((asset) => asset.id === command.sourceAssetId), target = assets.find((asset) => asset.id === command.targetAssetId);
      if (!source || !target) return json(req, { error: "Mídia de origem ou destino não encontrada.", correlationId }, 404);
      const { data: publishable } = await identity.admin.rpc("cms_dam_asset_publishable", { p_asset_id: command.targetAssetId, p_at: new Date().toISOString() });
      return json(req, {
        schemaVersion: 1,
        commandId: command.envelope.commandId,
        correlationId,
        sourceAssetId: source.id,
        targetAssetId: target.id,
        usageCount: source.totalUsageCount,
        visibleUsageCount: source.usages.length,
        hiddenUsageCount: source.hiddenUsageCount,
        hasHiddenUsages: source.hiddenUsageCount > 0,
        usages: source.usages,
        targetPublishable: publishable === true,
      });
    }
    if (command.action === "reserve_upload") {
      if (!(await authorized(identity, "cms:media.upload"))) return json(req, { error: "Permissão insuficiente.", code: "CMS_DAM_FORBIDDEN", correlationId }, 403);
      if ((actorScope.mode === "qa") !== (command.metadata.sourceKind === "synthetic_test")) {
        return json(req, { error: "A origem da mídia não pertence ao escopo deste ator.", code: "CMS_DAM_ACTOR_SCOPE_FORBIDDEN", correlationId }, 403);
      }
      if (command.metadata.sha256) {
        let duplicateQuery = identity.admin.from("cms_media_assets").select("id").eq("sha256", command.metadata.sha256).is("archived_at", null);
        duplicateQuery = actorScope.mode === "qa"
          ? duplicateQuery.eq("created_by", identity.user.id).eq("source_kind", "synthetic_test")
          : duplicateQuery.neq("source_kind", "synthetic_test");
        const { data: duplicate, error: duplicateError } = await duplicateQuery.limit(12);
        if (duplicateError) throw new Error("CMS_DAM_MATCH_UNAVAILABLE");
        const reusableIds = await publishableSourceIds(identity, actorScope, (duplicate ?? []).map((row) => String(row.id)));
        if (reusableIds.length) { const [existing] = await getAssetsByIds(identity, actorScope, reusableIds.slice(0, 1)); return json(req, { error: "Arquivo já existe; reutilize o ativo encontrado.", code: "CMS_DAM_DUPLICATE", correlationId, existingAsset: existing }, 409); }
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
          let duplicateQuery = identity.admin
            .from("cms_media_assets")
            .select("id")
            .eq("sha256", command.metadata.sha256)
            .is("archived_at", null);
          duplicateQuery = actorScope.mode === "qa"
            ? duplicateQuery.eq("created_by", identity.user.id).eq("source_kind", "synthetic_test")
            : duplicateQuery.neq("source_kind", "synthetic_test");
          const { data: duplicate, error: duplicateError } = await duplicateQuery.limit(12);
          if (duplicateError) throw new Error("CMS_DAM_MATCH_UNAVAILABLE");
          const reusableIds = await publishableSourceIds(identity, actorScope, (duplicate ?? []).map((row) => String(row.id)));
          if (reusableIds.length) {
            const [existing] = await getAssetsByIds(identity, actorScope, reusableIds.slice(0, 1));
            return json(req, { error: "Arquivo já existe; reutilize o ativo encontrado.", code: "CMS_DAM_DUPLICATE", correlationId, existingAsset: existing }, 409);
          }
        }
        if (!reserved || reserved.created_by !== identity.user.id || reserved.reservation_hash !== reservationHash || reserved.declared_mime !== command.metadata.declaredMime) {
          return json(req, { error: "A reserva já existe com outro conteúdo.", code: "CMS_DAM_IDEMPOTENCY_CONFLICT", correlationId, preserved: true }, 409);
        }
        if (!["awaiting_upload", "processing", "failed"].includes(reserved.processing_status)) {
          const [existing] = await getAssetsByIds(identity, actorScope, [assetId]);
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
      const { data: candidateData, error: candidateError } = await identity.admin.rpc("cms_list_dam_gc_candidates", {
        ...common,
        p_job_id: command.jobId ?? null,
        p_limit: command.limit,
      });
      if (candidateError) throw candidateError;
      const jobs = Array.isArray(candidateData) ? candidateData : [];
      if (command.dryRun) return json(req, { schemaVersion: 1, commandId: command.envelope.commandId, correlationId, dryRun: true, candidates: jobs });
      const results = [];
      for (const job of jobs) {
        const gcClaimId = crypto.randomUUID();
        const { data: snapshot, error: prepareError } = await identity.admin.rpc("cms_prepare_dam_gc", {
          ...common,
          p_job_id: job.id,
          p_claim_id: gcClaimId,
        });
        if (prepareError) {
          if (prepareError.code === "42501") throw prepareError;
          results.push({ jobId: job.id, status: "blocked" });
          continue;
        }
        const paths = Array.isArray(snapshot?.paths) ? snapshot.paths.filter((path: unknown): path is string => typeof path === "string") : [];
        let succeeded = snapshot?.claimId === gcClaimId && paths.length > 0;
        if (succeeded) {
          for (const path of paths) {
            if (await removeAndVerifyMediaStorageObject(identity.admin, path)) {
              succeeded = false;
              break;
            }
          }
        }
        const { data: completion, error: completionError } = await identity.admin.rpc("cms_complete_dam_gc", {
          ...common,
          p_job_id: job.id,
          p_claim_id: gcClaimId,
          p_succeeded: succeeded,
        });
        if (completionError) throw completionError;
        results.push({ jobId: job.id, status: completion?.status ?? (succeeded ? "done" : "failed") });
      }
      return json(req, { schemaVersion: 1, commandId: command.envelope.commandId, correlationId, dryRun: false, results });
    }

    const mutationPermission = ["archive_collection", "archive_asset", "restore_asset", "activate_replacement", "rollback_replacement"].includes(command.action)
      ? "cms:media.manage"
      : "cms:media.edit";
    if (!(await authorized(identity, mutationPermission))) return json(req, { error: "Permissão insuficiente ou autenticação reforçada necessária.", code: "CMS_DAM_FORBIDDEN", correlationId }, 403);
    if (command.action === "save_crop") {
      const [asset] = await getAssetsByIds(identity, actorScope, [command.assetId]);
      if (!asset) return json(req, { error: "Mídia não encontrada.", code: "CMS_DAM_ASSET_NOT_FOUND", correlationId }, 404);
      if (
        asset.width === null ||
        asset.height === null ||
        !damCropMatchesAspect(command.crop, asset.width, asset.height)
      )
        return json(req, { error: "O recorte não corresponde à proporção selecionada.", code: "CMS_DAM_CROP_ASPECT_INVALID", correlationId }, 422);
    }
    const idempotencyKey = req.headers.get("X-Idempotency-Key");
    if (!idempotencyKey || !Uuid.safeParse(idempotencyKey).success) return json(req, { error: "Chave idempotente obrigatória.", correlationId }, 400);
    const payload = { ...Object.fromEntries(Object.entries(command).filter(([key]) => !["action", "envelope"].includes(key))), expectedVersion: command.envelope.expectedVersion };
    const requestHash = await sha256(JSON.stringify(canonicalize(command)));
    const { data, error } = await identity.admin.rpc("cms_execute_dam_command", { ...common, p_action: command.action, p_payload: payload, p_command_id: command.envelope.commandId, p_idempotency_key: idempotencyKey, p_request_hash: requestHash, p_correlation_id: correlationId });
    if (error) throw error;
    return json(req, data);
  } catch (error) { return damFailureResponse(req, error, correlationId); }
}

async function finalizeAsset(req: Request, identity: Identity, assetId: string, context?: { commandId: string; correlationId: string; v2: boolean }) {
  const storage = identity.admin.storage.from("cms-media-private");
  // The reservation UUID is a stable V1 claim. A retry after a lost response
  // therefore joins the in-flight finalization instead of reporting BUSY.
  const claimId = context?.commandId ?? assetId;
  const correlationId = context?.correlationId ?? crypto.randomUUID();
  const actorContext = {
    p_actor_id: identity.user.id,
    p_aal: identity.claims.aal,
    p_session_id: identity.claims.sessionId,
    p_issued_at: identity.claims.issuedAt,
  };
  const failClaim = async (reasonCode: "duplicate" | "invalid_media" | "incomplete_variants" | "storage_unavailable" | "validation_failed") => {
    const { error } = await identity.admin.rpc("cms_fail_dam_finalization", {
      ...actorContext,
      p_asset_id: assetId,
      p_claim_id: claimId,
      p_reason_code: reasonCode,
      p_correlation_id: correlationId,
    });
    if (error) throw new Error("CMS_DAM_FINALIZATION_COMPENSATION_FAILED");
  };
  const { data: asset, error: claimError } = await identity.admin.rpc("cms_claim_dam_finalization", {
    ...actorContext,
    p_asset_id: assetId,
    p_claim_id: claimId,
  });
  if (claimError) {
    const forbidden = claimError.code === "42501";
    const notFound = claimError.message.includes("NOT_FOUND");
    return json(req, {
      error: forbidden ? "Somente o autor da reserva pode finalizá-la neste escopo." : notFound ? "Mídia não encontrada." : "Mídia já está sendo finalizada ou foi encerrada.",
      code: claimError.message.split(":")[0],
      correlationId,
    }, forbidden ? 403 : notFound ? 404 : 409);
  }
  if (asset?.status === "ready") {
    return json(req, {
      ...(context?.v2 ? { schemaVersion: 1, commandId: context.commandId, correlationId } : {}),
      ...asset,
    });
  }
  if (!asset?.storagePath || !asset?.declaredMime || asset?.claimId !== claimId) {
    await failClaim("validation_failed");
    return json(req, { error: "A reserva de processamento não pôde ser validada.", code: "CMS_DAM_FINALIZATION_CLAIM_INVALID", correlationId }, 409);
  }
  const original = await storage.download(asset.storagePath);
  if (original.error) {
    await failClaim("storage_unavailable");
    return json(req, { error: "Original ainda não foi enviado.", correlationId }, 409);
  }
  if (original.data.size < 12 || original.data.size > MAX_RASTER_BYTES) {
    await failClaim("invalid_media");
    return json(req, { error: "Arquivo rejeitado por MIME, dimensão ou tamanho.", correlationId }, 422);
  }
  const scanEngine = "raster-metadata-v3";
  const originalBytes = new Uint8Array(await original.data.arrayBuffer());
  const size = originalBytes.length;
  let originalMetadata: RasterImageMetadata;
  try {
    originalMetadata = inspectRasterImage(originalBytes);
  } catch {
    await failClaim("invalid_media");
    return json(req, { error: "Arquivo rejeitado por MIME, dimensão ou tamanho.", correlationId }, 422);
  }
  if (originalMetadata.mime !== asset.declaredMime) {
    await failClaim("invalid_media");
    return json(req, { error: "Arquivo rejeitado por MIME, dimensão ou tamanho.", correlationId }, 422);
  }
  const digest = await sha256Bytes(originalBytes);
  const variantRows = [];
  for (const [key, format] of variantSpecs) {
    const path = `cms/${assetId}/${key}.${format}`, downloaded = await storage.download(path);
    if (downloaded.error) {
      await failClaim("incomplete_variants");
      return json(req, { error: "Processamento incompleto: variante ausente.", correlationId }, 409);
    }
    if (downloaded.data.size < 12 || downloaded.data.size > MAX_RASTER_BYTES) {
      await failClaim("validation_failed");
      return json(req, { error: "Variante processada inválida ou ampliada além do original.", correlationId }, 422);
    }
    const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
    let variantMetadata: RasterImageMetadata;
    try {
      variantMetadata = inspectRasterImage(bytes);
    } catch {
      await failClaim("validation_failed");
      return json(req, { error: "Variante processada inválida ou ampliada além do original.", correlationId }, 422);
    }
    const expected = containedRasterDimensions(
      originalMetadata.width,
      originalMetadata.height,
      variantMaximumEdge[key],
    );
    if (
      variantMetadata.mime !== `image/${format}` ||
      variantMetadata.width !== expected.width ||
      variantMetadata.height !== expected.height ||
      variantMetadata.width > originalMetadata.width ||
      variantMetadata.height > originalMetadata.height
    ) {
      await failClaim("validation_failed");
      return json(req, { error: "Variante processada inválida ou ampliada além do original.", correlationId }, 422);
    }
    variantRows.push({
      asset_id: assetId,
      variant_key: key,
      format,
      width: variantMetadata.width,
      height: variantMetadata.height,
      transform_path: path,
    });
  }
  const { data, error } = await identity.admin.rpc("cms_finalize_dam_asset", {
    ...actorContext,
    p_asset_id: assetId,
    p_claim_id: claimId,
    p_detected_mime: originalMetadata.mime,
    p_byte_size: size,
    p_sha256: digest,
    p_width: originalMetadata.width,
    p_height: originalMetadata.height,
    p_variants: variantRows.map(({ variant_key, format, width, height, transform_path }) => ({ variant_key, format, width, height, transform_path })),
    p_correlation_id: correlationId,
  });
  if (error) {
    // A concurrent retry can reach this point after the first request already
    // committed but its HTTP response was lost. Reconcile authoritative state
    // before any compensating action so a ready asset is never reported as
    // canceled or failed.
    const reconciled = await identity.admin.rpc("cms_claim_dam_finalization", {
      ...actorContext,
      p_asset_id: assetId,
      p_claim_id: claimId,
    });
    if (!reconciled.error && reconciled.data?.status === "ready") {
      return json(req, {
        ...(context?.v2 ? { schemaVersion: 1, commandId: context.commandId, correlationId } : {}),
        ...reconciled.data,
        scanEngine,
      });
    }
    if (error.code === "23505" || error.message.includes("CMS_DAM_DUPLICATE")) {
      await failClaim("duplicate");
      return json(req, { error: "Arquivo duplicado; a reserva foi arquivada para limpeza segura.", code: "CMS_DAM_DUPLICATE", correlationId }, 409);
    }
    await failClaim("storage_unavailable");
    return json(req, {
      error: "Não foi possível concluir a mídia; a reserva foi preservada para reconciliação segura.",
      code: "CMS_DAM_FINALIZATION_FAILED",
      correlationId,
      preserved: true,
    }, 500);
  }
  return json(req, {
    ...(context?.v2 ? { schemaVersion: 1, commandId: context.commandId, correlationId } : {}),
    ...data,
    scanEngine,
  });
}

async function handleV1(req: Request, identity: Identity, input: z.infer<typeof V1Input>) {
  const permission = input.action === "list" || input.action === "usages" ? "cms:media.read" : input.action === "create" || input.action === "finalize" ? "cms:media.upload" : "cms:media.manage";
  if (!(await authorized(identity, permission))) return json(req, { error: "Permissão insuficiente." }, 403);
  let actorScope: DamActorScope;
  try { actorScope = await getDamActorScope(identity); }
  catch { return json(req, { error: "Escopo DAM indisponível ou expirado.", code: "CMS_DAM_ACTOR_SCOPE_FORBIDDEN" }, 403); }
  const storage = identity.admin.storage.from("cms-media-private");
  if (input.action === "create") {
    if ((actorScope.mode === "qa") !== (input.metadata.sourceKind === "synthetic_test")) {
      return json(req, { error: "A origem da mídia não pertence ao escopo deste ator.", code: "CMS_DAM_ACTOR_SCOPE_FORBIDDEN" }, 403);
    }
    const id = crypto.randomUUID(), storagePath = `cms/${id}/original.${extByMime[input.metadata.declaredMime]}`;
    const { error } = await identity.admin.from("cms_media_assets").insert({ id, storage_path: storagePath, original_filename: input.metadata.originalFilename, declared_mime: input.metadata.declaredMime, source_kind: input.metadata.sourceKind, source_reference: input.metadata.sourceReference, rights_confirmed: true, license_name: input.metadata.licenseName, owner_name: input.metadata.ownerName, alt_text: input.metadata.altText, caption: input.metadata.caption ?? null, credit: input.metadata.credit ?? null, focal_x: input.metadata.focalX, focal_y: input.metadata.focalY, created_by: identity.user.id });
    if (error) return json(req, { error: "Não foi possível reservar a mídia." }, 422);
    try { return json(req, { assetId: id, uploads: await signedUploads(identity, id, input.metadata.declaredMime), status: "awaiting_upload" }, 201); }
    catch { return json(req, { error: "Não foi possível preparar o upload." }, 503); }
  }
  if (input.action === "finalize") {
    try {
      return await finalizeAsset(req, identity, input.assetId);
    } catch {
      return json(req, {
        error: "A finalização não pôde ser reconciliada agora; tente novamente.",
        code: "CMS_DAM_FINALIZATION_RECONCILIATION_FAILED",
        preserved: true,
      }, 503);
    }
  }
  if (input.action === "list") {
    const from = (input.page - 1) * input.pageSize, to = from + input.pageSize - 1;
    let query = identity.admin.from("cms_media_assets").select("id,original_filename,processing_status,scan_status,source_kind,license_name,owner_name,alt_text,width,height,version,archived_at,created_at", { count: "exact" }).order("created_at", { ascending: false }).range(from, to);
    query = actorScope.mode === "qa"
      ? query.eq("created_by", identity.user.id).eq("source_kind", "synthetic_test")
      : query.neq("source_kind", "synthetic_test");
    if (!input.includeArchived) query = query.is("archived_at", null);
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
    const [scopedAsset] = await getAssetsByIds(identity, actorScope, [input.assetId]);
    if (!scopedAsset) return json(req, { error: "Mídia não encontrada." }, 404);
    try {
      const usageImpact = await listScopedMediaUsages(identity, [input.assetId]);
      const impact = usageImpact.impacts.find((row) => row.asset_id === input.assetId);
      return json(req, {
        assetId: input.assetId,
        usages: usageImpact.usages,
        totalUsageCount: Number(impact?.total_usage_count ?? 0),
        hiddenUsageCount: Number(impact?.hidden_usage_count ?? 0),
        hasHiddenUsages: Number(impact?.hidden_usage_count ?? 0) > 0,
      });
    } catch {
      return json(req, { error: "Falha ao consultar usos." }, 500);
    }
  }
  const configuredEnvironment = Deno.env.get("CMS_ENVIRONMENT");
  if (!isConfiguredCmsEnvironment(configuredEnvironment))
    return json(req, { error: "Ambiente do CMS não configurado." }, 503);
  const correlationId = crypto.randomUUID();
  const parameters = {
    p_actor_id: identity.user.id,
    p_environment: configuredEnvironment,
    p_site_key: "main",
    p_aal: identity.claims.aal,
    p_session_id: identity.claims.sessionId,
    p_issued_at: identity.claims.issuedAt,
    p_asset_id: input.assetId,
    p_correlation_id: correlationId,
  };
  const { data, error } = input.action === "restore"
    ? await identity.admin.rpc("cms_restore_legacy_media", parameters)
    : await identity.admin.rpc("cms_archive_legacy_media", parameters);
  return error ? damFailureResponse(req, error, correlationId) : json(req, data);
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
