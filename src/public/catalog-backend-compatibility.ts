import type { PublicFormVersion } from "./catalog-api";
import { normalizeLegacyFormResponse, registerLegacyLeadContext } from "./form-backend-compatibility";

type JsonRecord = Record<string, unknown>;
type PublicFormNormalizer = (value: unknown) => PublicFormVersion | null;

type LegacyAssetContext = {
  availableMediaIds: ReadonlySet<string>;
  mediaAlt: ReadonlyMap<string, string>;
  mediaSlots: ReadonlyMap<string, string>;
  publicOrigin?: string;
  row: JsonRecord;
};

type CatalogCompatibilityOptions = {
  backendUrl: string;
  publicOrigin?: string;
};

export type LegacyCatalogAdaptation = { matched: false } | { matched: true; value: unknown | null };

const canonicalUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const pathPattern = /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/?)*$/;
const legacyMediaKeyPattern =
  /^(?:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}):)?(?:thumbnail|medium|large)\.(?:webp|avif)$/i;
const publicMediaSlotPattern =
  /^(?:primary|social|media-[1-9][0-9]?|block-[1-9][0-9]?(?:-(?:image|item)-[1-9][0-9]?)?)$/;
const publicKinds = new Set([
  "product",
  "service",
  "industry",
  "application",
  "solution",
  "page",
  "homepage",
  "post",
  "campaign",
]);
const privatePayloadKeys = new Set([
  "approval",
  "componentVersion",
  "consumerId",
  "contentType",
  "expiry",
  "fieldVisibility",
  "governanceState",
  "pilotState",
  "placements",
  "provenance",
  "relations",
  "retirement",
  "schemaVersion",
  "search",
  "templateKey",
  "visual",
]);
const internalKeys = new Set([
  "id",
  "item_id",
  "revision_id",
  "schema_version",
  "content_version",
  "renderer_key",
  "cache_tag",
  "etag",
  "assetId",
  "assetIds",
  "parentId",
  "targetId",
  "contextId",
  "itemId",
  "itemIds",
  "formId",
  "versionId",
  "formVersionId",
  "groupId",
  "symbolId",
  "storagePath",
  "sha256",
]);
const legacyContextByWire = new WeakMap<
  object,
  { kind: "campaign" | "product"; selector: string; id: string }
>();

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: JsonRecord, allowed: readonly string[], required: readonly string[] = allowed) {
  const keys = Object.keys(value);
  return keys.every((key) => allowed.includes(key)) && required.every((key) => keys.includes(key));
}

function keySegments(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1_$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function isInternalKey(key: string) {
  if (internalKeys.has(key) || privatePayloadKeys.has(key)) return true;
  const segments = keySegments(key);
  return (
    segments.at(-1) === "id" ||
    segments.at(-1) === "ids" ||
    segments.some((segment) =>
      ["authorization", "cookie", "credential", "password", "secret", "token"].includes(segment),
    ) ||
    (segments.includes("api") && segments.includes("key")) ||
    (segments.includes("private") && segments.includes("key")) ||
    (segments.includes("service") && segments.includes("role")) ||
    segments.some((segment) =>
      ["audit", "bucket", "correlation", "hash", "lock", "storage"].includes(segment),
    )
  );
}

function publicPath(value: unknown): value is string {
  return typeof value === "string" && value.length <= 300 && pathPattern.test(value);
}

function publicText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
}

function publicAssetProxyUrl(
  publicOrigin: string | undefined,
  row: JsonRecord,
  type: "media" | "document",
  selector: string,
): string | null {
  if (
    !publicOrigin ||
    (type === "media" && !publicMediaSlotPattern.test(selector)) ||
    (type === "document" && !/^(?:[1-9]|[12][0-9]|30)$/.test(selector))
  )
    return null;
  try {
    const origin = new URL(publicOrigin);
    if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password) return null;
    const target = new URL("/__cms-public-asset", origin.origin);
    target.search = new URLSearchParams({
      type,
      kind: String(row.content_type),
      slug: String(row.slug),
      path: String(row.path),
      [type === "media" ? "slot" : "position"]: selector,
    }).toString();
    return target.toString();
  } catch {
    return null;
  }
}

function isLegacySignedStorageUrl(
  value: unknown,
  backendUrl: string,
  bucket: "cms-media-private" | "cms-documents-private",
): value is string {
  if (typeof value !== "string" || value.length > 8_000) return false;
  try {
    const parsed = new URL(value);
    const backend = new URL(backendUrl);
    const parameters = [...parsed.searchParams.entries()];
    return (
      parsed.origin === backend.origin &&
      !parsed.username &&
      !parsed.password &&
      parsed.pathname.startsWith(`/storage/v1/object/sign/${bucket}/`) &&
      parameters.length === 1 &&
      parameters[0]?.[0] === "token" &&
      Boolean(parameters[0]?.[1])
    );
  } catch {
    return false;
  }
}

function legacyMediaSlots(payload: unknown, seo: unknown): Map<string, string> {
  const slots = new Map<string, string>();
  if (!isRecord(payload)) return slots;
  const register = (slot: string, value: unknown) => {
    if (typeof value === "string" && canonicalUuidPattern.test(value)) slots.set(slot, value.toLowerCase());
  };
  const media = Array.isArray(payload.media) ? payload.media : [];
  media.forEach((entry, index) => {
    if (isRecord(entry)) register(entry.role === "primary" ? "primary" : `media-${index + 1}`, entry.assetId);
  });
  const blocks = Array.isArray(payload.blocks) ? payload.blocks : [];
  blocks.forEach((block, blockIndex) => {
    if (!isRecord(block) || !isRecord(block.data)) return;
    const prefix = `block-${blockIndex + 1}`;
    register(prefix, block.data.assetId);
    if (Array.isArray(block.data.assetIds))
      block.data.assetIds.forEach((assetId, index) => register(`${prefix}-image-${index + 1}`, assetId));
    if (Array.isArray(block.data.items))
      block.data.items.forEach((item, index) => {
        if (isRecord(item)) register(`${prefix}-item-${index + 1}`, item.assetId);
      });
  });
  if (isRecord(seo)) register("social", seo.ogImageId);
  return slots;
}

function firstLegacyMediaSlot(assetId: unknown, context: LegacyAssetContext): string | null {
  if (typeof assetId !== "string" || !canonicalUuidPattern.test(assetId)) return null;
  const canonical = assetId.toLowerCase();
  if (!context.availableMediaIds.has(canonical)) return null;
  for (const [slot, candidate] of context.mediaSlots) if (candidate === canonical) return slot;
  return null;
}

function legacyAssetMaps(
  mediaUrls: JsonRecord,
  mediaAlt: JsonRecord,
  documentUrls: JsonRecord,
  backendUrl: string,
): {
  availableMediaIds: ReadonlySet<string>;
  mediaAlt: ReadonlyMap<string, string>;
  availableDocumentIds: ReadonlySet<string>;
} | null {
  if (
    Object.keys(mediaUrls).length > 2_000 ||
    Object.keys(mediaAlt).length > 500 ||
    Object.keys(documentUrls).length > 100
  )
    return null;
  const availableMediaIds = new Set<string>();
  for (const [key, value] of Object.entries(mediaUrls)) {
    const match = key.match(legacyMediaKeyPattern);
    if (!match || !isLegacySignedStorageUrl(value, backendUrl, "cms-media-private")) return null;
    if (match[1]) availableMediaIds.add(match[1].toLowerCase());
  }
  const safeAlt = new Map<string, string>();
  for (const [key, value] of Object.entries(mediaAlt)) {
    if (!canonicalUuidPattern.test(key) || typeof value !== "string" || value.length > 1_000) return null;
    safeAlt.set(key.toLowerCase(), value);
  }
  const availableDocumentIds = new Set<string>();
  for (const [key, value] of Object.entries(documentUrls)) {
    if (
      !canonicalUuidPattern.test(key) ||
      !isLegacySignedStorageUrl(value, backendUrl, "cms-documents-private")
    )
      return null;
    availableDocumentIds.add(key.toLowerCase());
  }
  return { availableMediaIds, mediaAlt: safeAlt, availableDocumentIds };
}

function cleanLegacyValue(
  value: unknown,
  context: {
    relatedPaths: ReadonlyMap<string, string>;
    formBinding?: { formId: string; versionId: string; key: string; version: number };
    groups: Map<string, string>;
    assets: LegacyAssetContext;
  },
  depth = 0,
): unknown {
  if (depth > 64) return undefined;
  if (Array.isArray(value))
    return value
      .slice(0, 10_000)
      .map((entry) => cleanLegacyValue(entry, context, depth + 1))
      .filter((entry) => entry !== undefined);
  if (!isRecord(value)) return value;

  const output: JsonRecord = {};
  for (const [key, entry] of Object.entries(value)) {
    if (isInternalKey(key)) continue;
    const clean = cleanLegacyValue(entry, context, depth + 1);
    if (clean !== undefined) output[key] = clean;
  }

  if (typeof value.groupId === "string" && canonicalUuidPattern.test(value.groupId)) {
    let group = context.groups.get(value.groupId);
    if (!group) {
      group = `group-${context.groups.size + 1}`;
      context.groups.set(value.groupId, group);
    }
    output.group = group;
  }

  const mediaSlot = firstLegacyMediaSlot(value.assetId, context.assets);
  const mediaSource = mediaSlot
    ? publicAssetProxyUrl(context.assets.publicOrigin, context.assets.row, "media", mediaSlot)
    : null;
  if (mediaSource && typeof value.assetId === "string") {
    const resolvedAlt =
      context.assets.mediaAlt.get(value.assetId.toLowerCase()) ??
      (typeof value.alt === "string" ? value.alt : undefined);
    output.image = {
      src: mediaSource,
      ...(typeof resolvedAlt === "string" ? { alt: resolvedAlt } : {}),
      ...(typeof value.caption === "string" ? { caption: value.caption } : {}),
    };
  }

  if (Array.isArray(value.assetIds)) {
    output.images = value.assetIds.flatMap((assetId) => {
      const slot = firstLegacyMediaSlot(assetId, context.assets);
      const src = slot
        ? publicAssetProxyUrl(context.assets.publicOrigin, context.assets.row, "media", slot)
        : null;
      if (!src || typeof assetId !== "string") return [];
      const alt = context.assets.mediaAlt.get(assetId.toLowerCase());
      return [{ src, ...(typeof alt === "string" ? { alt } : {}) }];
    });
  }

  if (value.type === "related_content" && isRecord(value.data) && isRecord(output.data)) {
    delete output.data.itemPaths;
    output.data.itemPaths = Array.isArray(value.data.itemIds)
      ? value.data.itemIds.flatMap((itemId) => {
          if (typeof itemId !== "string" || !canonicalUuidPattern.test(itemId)) return [];
          const path = context.relatedPaths.get(itemId.toLowerCase());
          return publicPath(path) ? [path] : [];
        })
      : [];
  }

  if (value.type === "form" && isRecord(value.data) && isRecord(output.data)) {
    delete output.data.formKey;
    delete output.data.formVersion;
    delete output.data.governed;
    const binding = context.formBinding;
    if (
      binding &&
      typeof value.data.formId === "string" &&
      value.data.formId.toLowerCase() === binding.formId.toLowerCase() &&
      typeof value.data.formVersionId === "string" &&
      value.data.formVersionId.toLowerCase() === binding.versionId.toLowerCase()
    ) {
      output.data.formKey = binding.key;
      output.data.formVersion = binding.version;
      output.data.governed = true;
    }
  }
  return output;
}

function legacyRelatedItems(value: unknown): {
  items: JsonRecord[];
  paths: ReadonlyMap<string, string>;
} | null {
  if (value === undefined) return { items: [], paths: new Map() };
  if (!Array.isArray(value) || value.length > 500) return null;
  const items: JsonRecord[] = [];
  const paths = new Map<string, string>();
  for (const entry of value) {
    if (
      !isRecord(entry) ||
      !exactKeys(
        entry,
        ["item_id", "content_type", "title", "summary", "path"],
        ["item_id", "content_type", "title", "path"],
      ) ||
      !canonicalUuidPattern.test(typeof entry.item_id === "string" ? entry.item_id : "") ||
      typeof entry.content_type !== "string" ||
      !publicKinds.has(entry.content_type) ||
      !publicText(entry.title, 180) ||
      (entry.summary !== undefined && (typeof entry.summary !== "string" || entry.summary.length > 500)) ||
      !publicPath(entry.path)
    )
      return null;
    paths.set((entry.item_id as string).toLowerCase(), entry.path);
    items.push({
      kind: entry.content_type,
      title: entry.title,
      ...(typeof entry.summary === "string" ? { summary: entry.summary } : {}),
      path: entry.path,
    });
  }
  return { items, paths };
}

function legacySeo(value: unknown, assets: LegacyAssetContext): JsonRecord | null {
  if (
    !isRecord(value) ||
    !exactKeys(
      value,
      ["title", "description", "canonicalPath", "indexable", "ogImageId", "ogTitle", "ogDescription"],
      ["title", "description", "canonicalPath", "indexable"],
    )
  )
    return null;
  if (
    value.ogImageId !== undefined &&
    (typeof value.ogImageId !== "string" || !canonicalUuidPattern.test(value.ogImageId))
  )
    return null;
  const socialId = assets.mediaSlots.get("social");
  const socialSlot =
    typeof value.ogImageId === "string" &&
    typeof socialId === "string" &&
    socialId === value.ogImageId.toLowerCase() &&
    assets.availableMediaIds.has(socialId)
      ? "social"
      : null;
  const socialImage = socialSlot
    ? publicAssetProxyUrl(assets.publicOrigin, assets.row, "media", socialSlot)
    : null;
  return {
    title: value.title,
    description: value.description,
    canonicalPath: value.canonicalPath,
    indexable: value.indexable,
    ...(value.ogTitle === undefined ? {} : { ogTitle: value.ogTitle }),
    ...(value.ogDescription === undefined ? {} : { ogDescription: value.ogDescription }),
    ...(socialImage ? { socialImage } : {}),
  };
}

const legacyRowKeys = [
  "item_id",
  "revision_id",
  "content_type",
  "slug",
  "schema_version",
  "consumer_id",
  "renderer_key",
  "payload",
  "seo",
  "content_version",
  "cache_tag",
  "etag",
  "published_at",
  "path",
  "media_urls",
  "media_alt",
  "document_urls",
  "related_items",
  "form",
  "score",
  "matched_by",
  "explanation",
] as const;

function looksLikeLegacyRow(value: unknown): boolean {
  return isRecord(value) && ("item_id" in value || "content_type" in value);
}

function legacyResource(
  value: unknown,
  normalizePublicForm: PublicFormNormalizer,
  options: CatalogCompatibilityOptions,
): JsonRecord | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, legacyRowKeys, [
      "item_id",
      "revision_id",
      "content_type",
      "slug",
      "schema_version",
      "consumer_id",
      "renderer_key",
      "payload",
      "seo",
      "content_version",
      "cache_tag",
      "etag",
      "published_at",
      "path",
      "media_urls",
      "media_alt",
      "document_urls",
    ]) ||
    !canonicalUuidPattern.test(typeof value.item_id === "string" ? value.item_id : "") ||
    !canonicalUuidPattern.test(typeof value.revision_id === "string" ? value.revision_id : "") ||
    typeof value.content_type !== "string" ||
    !publicKinds.has(value.content_type) ||
    typeof value.slug !== "string" ||
    !slugPattern.test(value.slug) ||
    value.slug.length > 160 ||
    !Number.isSafeInteger(value.schema_version) ||
    !publicText(value.consumer_id, 160) ||
    !publicText(value.renderer_key, 160) ||
    !isRecord(value.payload) ||
    !Number.isSafeInteger(value.content_version) ||
    !publicText(value.cache_tag, 500) ||
    !publicText(value.etag, 500) ||
    !Number.isFinite(Date.parse(String(value.published_at ?? ""))) ||
    !publicPath(value.path) ||
    !isRecord(value.media_urls) ||
    !isRecord(value.media_alt) ||
    !isRecord(value.document_urls)
  )
    return null;
  const related = legacyRelatedItems(value.related_items);
  const assetMaps = legacyAssetMaps(
    value.media_urls,
    value.media_alt,
    value.document_urls,
    options.backendUrl,
  );
  if (!related || !assetMaps) return null;
  const assets: LegacyAssetContext = {
    availableMediaIds: assetMaps.availableMediaIds,
    mediaAlt: assetMaps.mediaAlt,
    mediaSlots: legacyMediaSlots(value.payload, value.seo),
    publicOrigin: options.publicOrigin,
    row: value,
  };
  const seo = legacySeo(value.seo, assets);
  if (!seo) return null;

  let publicForm: PublicFormVersion | null = null;
  let formBinding: { formId: string; versionId: string; key: string; version: number } | undefined;
  if (value.form !== undefined && value.form !== null) {
    if (!isRecord(value.form) || typeof value.form.key !== "string") return null;
    publicForm = normalizeLegacyFormResponse(value.form, { key: value.form.key }, normalizePublicForm);
    if (!publicForm) return null;
    formBinding = {
      formId: value.form.formId as string,
      versionId: value.form.versionId as string,
      key: publicForm.key,
      version: publicForm.version,
    };
  }

  const payload = cleanLegacyValue(value.payload, {
    relatedPaths: related.paths,
    formBinding,
    groups: new Map(),
    assets,
  });
  if (!isRecord(payload)) return null;
  if (Array.isArray(value.payload.documents)) {
    payload.documents = value.payload.documents.flatMap((document, index) => {
      if (
        !isRecord(document) ||
        typeof document.id !== "string" ||
        !canonicalUuidPattern.test(document.id) ||
        document.visibility !== "public" ||
        !assetMaps.availableDocumentIds.has(document.id.toLowerCase())
      )
        return [];
      const href = publicAssetProxyUrl(options.publicOrigin, value, "document", String(index + 1));
      if (!href) return [];
      return [
        {
          kind: document.kind,
          title: document.title,
          revision: document.revision,
          language: document.language,
          visibility: "public",
          href,
        },
      ];
    });
  }
  if (isRecord(payload.seo) && typeof seo.socialImage === "string") payload.seo.socialImage = seo.socialImage;
  if (value.content_type === "campaign") delete payload.form;
  const wire: JsonRecord = {
    kind: value.content_type,
    slug: value.slug,
    path: value.path,
    payload,
    seo,
    publishedAt: value.published_at,
    relatedItems: related.items,
    ...(typeof value.matched_by === "string" ? { matchedBy: value.matched_by } : {}),
    ...(publicForm ? { form: publicForm } : {}),
  };
  if (value.content_type === "campaign")
    legacyContextByWire.set(wire, {
      kind: "campaign",
      selector: value.path,
      id: value.item_id as string,
    });
  if (value.content_type === "product")
    legacyContextByWire.set(wire, {
      kind: "product",
      selector: value.slug,
      id: value.item_id as string,
    });
  return wire;
}

export function activateLegacyCatalogContext(wire: unknown): void {
  if (!isRecord(wire)) return;
  const context = legacyContextByWire.get(wire);
  if (context) registerLegacyLeadContext(context.kind, context.selector, context.id);
}

function legacyRouteRule(value: unknown): JsonRecord | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["destination_path", "status_code"]) ||
    ![301, 302, 404, 410].includes(Number(value.status_code))
  )
    return null;
  return { destinationPath: value.destination_path, status: value.status_code };
}

function legacyCollection(
  value: unknown,
  params: URLSearchParams,
  normalizePublicForm: PublicFormNormalizer,
  options: CatalogCompatibilityOptions,
): JsonRecord | null {
  if (!isRecord(value) || !Array.isArray(value.items) || value.items.length > 500) return null;
  if (!value.items.every(looksLikeLegacyRow)) return null;
  let items = value.items.map((item) => legacyResource(item, normalizePublicForm, options));
  if (items.some((item) => item === null)) return null;
  const requestedSlugs = (params.get("slugs") ?? "").split(",").filter(Boolean);
  if (params.get("type") === "products" && requestedSlugs.length)
    items = items.filter((item) => item && requestedSlugs.includes(String(item.slug)));
  return {
    items,
    total: requestedSlugs.length ? items.length : value.total,
    ...(value.facets === undefined ? {} : { facets: value.facets }),
    ...(value.groups === undefined ? {} : { groups: value.groups }),
    ...(value.query === undefined ? {} : { query: value.query }),
    ...(value.redirect === undefined ? {} : { redirect: value.redirect }),
    ...(value.engine === undefined ? {} : { engine: value.engine }),
  };
}

function legacyNavigation(value: unknown): JsonRecord | null {
  if (!isRecord(value) || !publicText(value.title, 180) || !Array.isArray(value.items)) return null;
  const source = new Map<string, JsonRecord>();
  for (const item of value.items) {
    if (
      !isRecord(item) ||
      !exactKeys(item, ["id", "parentId", "location", "label", "href", "order", "newTab", "visible"]) ||
      !canonicalUuidPattern.test(typeof item.id === "string" ? item.id : "") ||
      (item.parentId !== null &&
        !canonicalUuidPattern.test(typeof item.parentId === "string" ? item.parentId : "")) ||
      !["header", "footer"].includes(String(item.location)) ||
      !publicText(item.label, 120) ||
      typeof item.href !== "string" ||
      item.href.length > 500 ||
      !Number.isSafeInteger(item.order) ||
      typeof item.newTab !== "boolean" ||
      typeof item.visible !== "boolean" ||
      source.has(item.id as string)
    )
      return null;
    source.set(item.id as string, item);
  }
  const active = new Set<string>();
  const build = (parentId: string | null, depth: number): JsonRecord[] | null => {
    if (depth > 3) return null;
    const children = [...source.values()]
      .filter((item) => item.visible === true && item.parentId === parentId)
      .sort((left, right) => Number(left.order) - Number(right.order));
    const result: JsonRecord[] = [];
    for (const item of children) {
      const id = item.id as string;
      if (active.has(id)) return null;
      active.add(id);
      const nested = build(id, depth + 1);
      active.delete(id);
      if (!nested) return null;
      result.push({
        location: item.location,
        label: item.label,
        href: item.href,
        newTab: item.newTab,
        ...(nested.length ? { children: nested } : {}),
      });
    }
    return result;
  };
  const items = build(null, 1);
  return items ? { title: value.title, items } : null;
}

function legacySiteShell(value: unknown): JsonRecord | null {
  if (!isRecord(value) || !exactKeys(value, ["navigation", "settings", "placements"])) return null;
  const navigation = value.navigation === null ? null : legacyNavigation(value.navigation);
  if (value.navigation !== null && !navigation) return null;
  const settings =
    value.settings === null
      ? null
      : isRecord(value.settings)
        ? {
            title: value.settings.title,
            company: value.settings.company,
            socialLinks: Array.isArray(value.settings.socialLinks)
              ? value.settings.socialLinks.map((entry) => {
                  if (!isRecord(entry)) return null;
                  return { network: entry.network, url: entry.url };
                })
              : null,
            defaultCta: value.settings.defaultCta,
          }
        : null;
  if (value.settings !== null && !settings) return null;
  if (isRecord(settings) && Array.isArray(settings.socialLinks) && settings.socialLinks.includes(null))
    return null;
  const placements =
    value.placements === null
      ? null
      : isRecord(value.placements) && Array.isArray(value.placements.placements)
        ? {
            title: value.placements.title,
            placements: value.placements.placements.map((entry) => {
              if (!isRecord(entry) || !isRecord(entry.target)) return null;
              return {
                slot: entry.slot,
                ...(typeof entry.label === "string" ? { label: entry.label } : {}),
                priority: entry.priority,
                startsAt: entry.startsAt,
                endsAt: entry.endsAt,
                target: {
                  kind: entry.target.contentType,
                  title: entry.target.title,
                  ...(typeof entry.target.summary === "string" ? { summary: entry.target.summary } : {}),
                  path: entry.target.path,
                },
              };
            }),
          }
        : null;
  if (value.placements !== null && !placements) return null;
  if (isRecord(placements) && Array.isArray(placements.placements) && placements.placements.includes(null))
    return null;
  return { navigation, settings, placements };
}

function legacyCampaignPlacements(value: unknown): JsonRecord | null {
  if (!isRecord(value) || !Array.isArray(value.items) || value.items.length > 100) return null;
  const items = value.items.map((entry) => {
    if (!isRecord(entry) || !isRecord(entry.campaign)) return null;
    return {
      slot: entry.slot,
      priority: entry.priority,
      startsAt: entry.startsAt,
      endsAt: entry.endsAt,
      campaign: {
        title: entry.campaign.title,
        summary: entry.campaign.summary,
        path: entry.campaign.path,
      },
    };
  });
  return items.includes(null) ? null : { items };
}

export function adaptLegacyCatalogResponse(
  value: unknown,
  params: URLSearchParams,
  normalizePublicForm: PublicFormNormalizer,
  options: CatalogCompatibilityOptions,
): LegacyCatalogAdaptation {
  const type = params.get("type") ?? "detail";
  if (["detail", "entity-detail", "post-detail"].includes(type) && looksLikeLegacyRow(value))
    return { matched: true, value: legacyResource(value, normalizePublicForm, options) };
  if (["products", "search", "collection", "autocomplete", "search-v2", "posts"].includes(type)) {
    if (isRecord(value) && Array.isArray(value.items) && value.items.some(looksLikeLegacyRow))
      return { matched: true, value: legacyCollection(value, params, normalizePublicForm, options) };
  }
  if (type === "page-by-path" && isRecord(value)) {
    if (value.kind === "page" && looksLikeLegacyRow(value.page)) {
      if (!exactKeys(value, ["kind", "page"])) return { matched: true, value: null };
      const page = legacyResource(value.page, normalizePublicForm, options);
      return { matched: true, value: page ? { kind: "page", page } : null };
    }
    if (value.kind === "route" && isRecord(value.rule) && "status_code" in value.rule) {
      const rule = legacyRouteRule(value.rule);
      return { matched: true, value: rule ? { kind: "route", rule } : null };
    }
  }
  if (type === "campaign-by-path" && isRecord(value)) {
    if (looksLikeLegacyRow(value))
      return { matched: true, value: legacyResource(value, normalizePublicForm, options) };
    if (value.kind === "route" && isRecord(value.rule) && "status_code" in value.rule) {
      const rule = legacyRouteRule(value.rule);
      return { matched: true, value: rule ? { kind: "route", rule } : null };
    }
  }
  if (type === "redirect" && isRecord(value) && "status_code" in value)
    return { matched: true, value: legacyRouteRule(value) };
  if (
    type === "site-shell" &&
    isRecord(value) &&
    [value.navigation, value.settings, value.placements].some(
      (entry) => isRecord(entry) && ("schemaVersion" in entry || "consumerId" in entry),
    )
  )
    return { matched: true, value: legacySiteShell(value) };
  if (
    type === "campaign-placements" &&
    isRecord(value) &&
    Array.isArray(value.items) &&
    value.items.some(
      (entry) =>
        isRecord(entry) && ("id" in entry || (isRecord(entry.campaign) && "itemId" in entry.campaign)),
    )
  )
    return { matched: true, value: legacyCampaignPlacements(value) };
  return { matched: false };
}
