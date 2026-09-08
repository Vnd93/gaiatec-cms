import { validatePublicFormDefinition } from "./cms-public-form-submission.ts";

type JsonRecord = Record<string, any>;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const embeddedUuidPattern =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const embeddedDigestPattern = /(?:^|[^0-9a-f])[0-9a-f]{40,128}(?:$|[^0-9a-f])/i;
const executablePayloadPattern =
  /<\s*\/?\s*(?:script|style|iframe|object|embed|svg|math|link|meta|base|template)\b|(?:javascript|vbscript)\s*:|data\s*:\s*text\/html|\bon[a-z]+\s*=|@import\s+|expression\s*\(|-moz-binding\s*:/i;
const secretValuePattern =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:bearer\s+[a-z0-9._~+/=-]{12,}|(?:eyJ|sbp_|sb_secret_|sk-or-|gh[pousr]_|github_pat_|xox[baprs]-|AKIA|ASIA)[a-z0-9._-]{10,}|(?:postgres(?:ql)?|mysql|redis|mongodb(?:\+srv)?):\/\/[^/\s:@]+:[^@\s/]+@)/i;
const sensitiveUrlParameterPattern =
  /^(?:access[_-]?token|refresh[_-]?token|token|api[_-]?key|apikey|key|secret|signature|sig|credential|authorization|password)$/i;

export const governedFormBindingSelector = (formId: string, versionId: string) =>
  `${formId.toLowerCase()}:${versionId.toLowerCase()}`;

const forbiddenKeys = new Set([
  "id",
  "item_id",
  "revision_id",
  "schemaVersion",
  "schema_version",
  "consumerId",
  "consumer_id",
  "contentType",
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
  "branchId",
  "groupId",
  "symbolId",
  "correlationId",
  "commandId",
  "lockVersion",
  "expectedVersion",
  "storagePath",
  "sha256",
  "provenance",
  "__proto__",
  "prototype",
  "constructor",
]);

const privateEditorialKeys = new Set([
  "approval",
  "componentVersion",
  "consumerId",
  "contentType",
  "expiry",
  "fieldVisibility",
  "governanceState",
  "pilotState",
  "provenance",
  "relations",
  "retirement",
  "schemaVersion",
  "search",
  "templateKey",
  "visual",
]);

const forbiddenTechnicalKeySegments = new Set([
  "audit",
  "bucket",
  "correlation",
  "hash",
  "lock",
  "provenance",
  "schema",
  "sha256",
  "storage",
]);

function normalizedKeySegments(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1_$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function isInternalWireKey(key: string) {
  if (forbiddenKeys.has(key) || privateEditorialKeys.has(key)) return true;
  const segments = normalizedKeySegments(key);
  return (
    segments.at(-1) === "id" ||
    segments.at(-1) === "ids" ||
    segments.some((segment) =>
      ["authorization", "cookie", "credential", "password", "secret", "token"].includes(segment),
    ) ||
    (segments.includes("api") && segments.includes("key")) ||
    (segments.includes("private") && segments.includes("key")) ||
    (segments.includes("service") && segments.includes("role")) ||
    segments.some((segment) => forbiddenTechnicalKeySegments.has(segment))
  );
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPublicInternetHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    !host.includes(".") ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "::" ||
    host === "::1" ||
    /^(?:fc|fd|fe[89ab])/i.test(host)
  )
    return false;
  const ipv4 = host.split(".").map(Number);
  if (ipv4.length !== 4 || ipv4.some((part) => !Number.isInteger(part) || part < 0 || part > 255))
    return true;
  const [first, second] = ipv4;
  return !(
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    first >= 224
  );
}

function isGovernedLocalProxy(parsed: URL): boolean {
  const runtime = (globalThis as { Deno?: { env?: { get?: (name: string) => string | undefined } } }).Deno;
  const readEnvironment = runtime?.env?.get;
  if (!readEnvironment || readEnvironment("CMS_ENVIRONMENT") !== "local") return false;
  const configuredUrl = readEnvironment("SUPABASE_URL");
  if (!configuredUrl) return false;
  try {
    return (
      parsed.origin === new URL(configuredUrl).origin &&
      parsed.pathname === "/functions/v1/cms-public" &&
      ["media", "document"].includes(parsed.searchParams.get("type") ?? "")
    );
  } catch {
    return false;
  }
}

function publicStringLeak(value: string): "executable" | "secret" | "private-host" | null {
  if (executablePayloadPattern.test(value)) return "executable";
  if (secretValuePattern.test(value)) return "secret";
  if (!/^https?:\/\//i.test(value)) return null;
  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password) return "secret";
    if (!isPublicInternetHostname(parsed.hostname) && !isGovernedLocalProxy(parsed)) return "private-host";
    if ([...parsed.searchParams.keys()].some((key) => sensitiveUrlParameterPattern.test(key)))
      return "secret";
  } catch {
    return "executable";
  }
  return null;
}

export function publicSearchMatchLabel(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return new Map<string, string>([
    ["exact_title", "Correspondência pelo título"],
    ["full_text", "Correspondência pelo conteúdo técnico"],
    ["governed_synonym", "Correspondência por termo relacionado"],
    ["similar_title", "Correspondência por título relacionado"],
    ["nome ou modelo público", "Correspondência pelo nome ou modelo"],
    ["conteúdo técnico ou sinônimo", "Correspondência pelo conteúdo técnico"],
  ]).get(value);
}

function publicProxyUrl(
  endpoint: string,
  type: "media" | "document",
  row: JsonRecord,
  selector: string,
) {
  const url = new URL(endpoint);
  url.search = new URLSearchParams({
    type,
    kind: String(row.content_type),
    slug: String(row.slug),
    [type === "media" ? "slot" : "position"]: selector,
  }).toString();
  return url.toString();
}

/**
 * Stable public selectors are deliberately based on presentation position, not
 * database or Storage identifiers. The same routine is used to mint a URL and
 * to resolve it at download time.
 */
export function publicMediaSlots(payload: unknown, seo: unknown) {
  const slots = new Map<string, string>();
  if (!isRecord(payload)) return slots;
  const register = (slot: string, value: unknown) => {
    if (typeof value === "string" && uuidPattern.test(value)) slots.set(slot, value.toLowerCase());
  };
  const media = Array.isArray(payload.media) ? payload.media : [];
  media.forEach((entry, index) => {
    if (!isRecord(entry)) return;
    register(entry.role === "primary" ? "primary" : `media-${index + 1}`, entry.assetId);
  });
  const blocks = Array.isArray(payload.blocks) ? payload.blocks : [];
  blocks.forEach((block, blockIndex) => {
    if (!isRecord(block) || !isRecord(block.data)) return;
    const prefix = `block-${blockIndex + 1}`;
    register(prefix, block.data.assetId);
    if (Array.isArray(block.data.assetIds))
      block.data.assetIds.forEach((value: unknown, index: number) =>
        register(`${prefix}-image-${index + 1}`, value),
      );
    if (Array.isArray(block.data.items))
      block.data.items.forEach((item: unknown, index: number) => {
        if (isRecord(item)) register(`${prefix}-item-${index + 1}`, item.assetId);
      });
  });
  if (isRecord(seo)) register("social", seo.ogImageId);
  return slots;
}

function firstAvailableSlot(
  assetId: unknown,
  slots: Map<string, string>,
  availableAssetIds: Set<string>,
) {
  if (typeof assetId !== "string" || !uuidPattern.test(assetId)) return null;
  const canonical = assetId.toLowerCase();
  if (!availableAssetIds.has(canonical)) return null;
  for (const [slot, candidate] of slots) if (candidate === canonical) return slot;
  return null;
}

function availableMediaIds(mediaUrls: Record<string, string>) {
  return new Set(
    Object.keys(mediaUrls).flatMap((key) => {
      const separator = key.indexOf(":");
      const candidate = separator > 0 ? key.slice(0, separator) : "";
      return uuidPattern.test(candidate) ? [candidate.toLowerCase()] : [];
    }),
  );
}

function cleanPayloadValue(
  value: unknown,
  context: {
    endpoint: string;
    row: JsonRecord;
    slots: Map<string, string>;
    availableAssetIds: Set<string>;
    groupNames: Map<string, string>;
    formBindings: ReadonlyMap<string, { key: string; version: number }>;
    relatedPaths: ReadonlyMap<string, string>;
  },
): unknown {
  if (Array.isArray(value))
    return value
      .map((entry) => cleanPayloadValue(entry, context))
      .filter((entry) => entry !== undefined);
  if (!isRecord(value)) return value;

  const output: JsonRecord = {};
  for (const [key, entry] of Object.entries(value)) {
    if (isInternalWireKey(key)) continue;
    const clean = cleanPayloadValue(entry, context);
    if (clean !== undefined) output[key] = clean;
  }

  const slot = firstAvailableSlot(value.assetId, context.slots, context.availableAssetIds);
  if (slot)
    output.image = {
      src: publicProxyUrl(context.endpoint, "media", context.row, slot),
      ...(typeof value.alt === "string" ? { alt: value.alt } : {}),
      ...(typeof value.caption === "string" ? { caption: value.caption } : {}),
    };

  if (Array.isArray(value.assetIds)) {
    output.images = value.assetIds.flatMap((assetId: unknown) => {
      const imageSlot = firstAvailableSlot(assetId, context.slots, context.availableAssetIds);
      return imageSlot
        ? [{ src: publicProxyUrl(context.endpoint, "media", context.row, imageSlot) }]
        : [];
    });
  }

  if (Array.isArray(value.itemIds)) {
    output.itemPaths = value.itemIds.flatMap((itemId: unknown) => {
      if (typeof itemId !== "string" || !uuidPattern.test(itemId)) return [];
      const path = context.relatedPaths.get(itemId.toLowerCase());
      return typeof path === "string" ? [path] : [];
    });
  }

  if (typeof value.groupId === "string" && uuidPattern.test(value.groupId)) {
    let publicGroup = context.groupNames.get(value.groupId);
    if (!publicGroup) {
      publicGroup = `group-${context.groupNames.size + 1}`;
      context.groupNames.set(value.groupId, publicGroup);
    }
    output.group = publicGroup;
  }
  if (
    typeof value.formId === "string" &&
    uuidPattern.test(value.formId) &&
    typeof value.formVersionId === "string" &&
    uuidPattern.test(value.formVersionId)
  ) {
    delete output.formKey;
    const binding = context.formBindings.get(governedFormBindingSelector(value.formId, value.formVersionId));
    if (
      binding &&
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(binding.key) &&
      Number.isSafeInteger(binding.version) &&
      binding.version >= 1
    ) {
      output.formKey = binding.key;
      output.governed = true;
      output.formVersion = binding.version;
    }
  }
  return output;
}

export function presentPublicPayload(
  payload: unknown,
  options: {
    endpoint: string;
    row: JsonRecord;
    seo: unknown;
    mediaUrls?: Record<string, string>;
    documentUrls?: Record<string, string>;
    formBindings?: ReadonlyMap<string, { key: string; version: number }>;
    relatedPaths?: ReadonlyMap<string, string>;
  },
) {
  if (!isRecord(payload)) return {};
  const slots = publicMediaSlots(payload, options.seo);
  const availableAssetIds = availableMediaIds(options.mediaUrls ?? {});
  const clean = cleanPayloadValue(payload, {
    endpoint: options.endpoint,
    row: options.row,
    slots,
    availableAssetIds,
    groupNames: new Map(),
    formBindings: options.formBindings ?? new Map(),
    relatedPaths: options.relatedPaths ?? new Map(),
  }) as JsonRecord;

  if (Array.isArray(payload.documents)) {
    const availableDocuments = new Set(Object.keys(options.documentUrls ?? {}).map((id) => id.toLowerCase()));
    clean.documents = payload.documents.flatMap((document: unknown, index: number) => {
      if (!isRecord(document) || typeof document.id !== "string") return [];
      if (!availableDocuments.has(document.id.toLowerCase())) return [];
      return [
        {
          kind: document.kind,
          title: document.title,
          revision: document.revision,
          language: document.language,
          visibility: "public",
          href: publicProxyUrl(options.endpoint, "document", options.row, String(index + 1)),
        },
      ];
    });
  }

  if (isRecord(clean.seo)) {
    const socialSlot = slots.get("social")
      ? firstAvailableSlot(slots.get("social"), slots, availableAssetIds)
      : null;
    delete clean.seo.ogImageId;
    if (socialSlot)
      clean.seo.socialImage = publicProxyUrl(options.endpoint, "media", options.row, socialSlot);
  }
  if (options.row.content_type === "campaign") delete clean.form;
  return clean;
}

export function presentPublicSeo(
  seo: unknown,
  options: {
    endpoint: string;
    row: JsonRecord;
    payload: unknown;
    mediaUrls?: Record<string, string>;
  },
) {
  if (!isRecord(seo)) return {};
  const { ogImageId: _ogImageId, ...publicSeo } = seo;
  const slots = publicMediaSlots(options.payload, seo);
  const availableAssetIds = availableMediaIds(options.mediaUrls ?? {});
  const socialSlot = firstAvailableSlot(seo.ogImageId, slots, availableAssetIds);
  return {
    ...publicSeo,
    ...(socialSlot
      ? { socialImage: publicProxyUrl(options.endpoint, "media", options.row, socialSlot) }
      : {}),
  };
}

export function presentPublicRow(
  row: JsonRecord,
  endpoint: string,
  options: {
    formBindings?: ReadonlyMap<string, { key: string; version: number }>;
    relatedPaths?: ReadonlyMap<string, string>;
  } = {},
) {
  const matchedBy = publicSearchMatchLabel(row.matched_by);
  return {
    kind: row.content_type,
    slug: row.slug,
    path: row.path,
    payload: presentPublicPayload(row.payload, {
      endpoint,
      row,
      seo: row.seo,
      mediaUrls: row.media_urls,
      documentUrls: row.document_urls,
      formBindings: options.formBindings,
      relatedPaths: options.relatedPaths,
    }),
    seo: presentPublicSeo(row.seo, {
      endpoint,
      row,
      payload: row.payload,
      mediaUrls: row.media_urls,
    }),
    publishedAt: row.published_at,
    ...(matchedBy ? { matchedBy } : {}),
  };
}

export function presentRelatedRow(row: JsonRecord) {
  const payload = isRecord(row.payload) ? row.payload : {};
  return {
    kind: row.content_type,
    title: payload.title ?? row.slug,
    ...(typeof payload.summary === "string" ? { summary: payload.summary } : {}),
    path: row.path ?? "",
  };
}

export function presentPublicForm(form: JsonRecord) {
  const definition = validatePublicFormDefinition(form.fields);
  const consent = isRecord(form.consent) ? form.consent : {};
  const validText = (value: unknown, maximum: number) =>
    typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
  if (
    !definition.ok ||
    typeof form.key !== "string" ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.key) ||
    form.key.length > 120 ||
    !Number.isSafeInteger(form.version) ||
    Number(form.version) < 1 ||
    !validText(form.title, 180) ||
    !validText(form.purpose, 500) ||
    !validText(form.successMessage, 500) ||
    !validText(form.submitLabel, 120) ||
    consent.required !== true ||
    !validText(consent.text, 2_000) ||
    !validText(consent.version, 80) ||
    typeof consent.privacyPath !== "string" ||
    !/^\/(?!\/)(?:[^\s?#]*)$/.test(consent.privacyPath) ||
    consent.privacyPath.length > 300
  )
    return null;
  return {
    key: form.key,
    version: form.version,
    title: form.title,
    purpose: form.purpose,
    fields: definition.fields
      .filter((field: JsonRecord) => field.type !== "hidden")
      .map((field: JsonRecord) => ({
        key: field.key,
        label: field.label,
        type: field.type,
        required: field.required,
        ...(Number.isInteger(field.maxLength) ? { maxLength: field.maxLength } : {}),
        options: Array.isArray(field.options) ? field.options : [],
        order: field.order,
      })),
    consent: {
      required: true,
      text: consent.text,
      version: consent.version,
      privacyPath: consent.privacyPath,
    },
    successMessage: form.successMessage,
    submitLabel: form.submitLabel,
  };
}

export function presentNavigation(payload: unknown) {
  if (!isRecord(payload)) return null;
  const items = Array.isArray(payload.items) ? payload.items.filter(isRecord) : [];
  const byParent = new Map<string | null, JsonRecord[]>();
  for (const item of items) {
    if (item.visible !== true) continue;
    const parent = typeof item.parentId === "string" ? item.parentId : null;
    const siblings = byParent.get(parent) ?? [];
    siblings.push(item);
    byParent.set(parent, siblings);
  }
  const active = new Set<string>();
  const build = (parent: string | null, depth: number): JsonRecord[] => {
    if (depth > 3) return [];
    return (byParent.get(parent) ?? [])
      .sort((left, right) => Number(left.order) - Number(right.order))
      .flatMap((item) => {
        if (typeof item.id !== "string" || active.has(item.id)) return [];
        active.add(item.id);
        const children = build(item.id, depth + 1);
        active.delete(item.id);
        return [
          {
            location: item.location,
            label: item.label,
            href: item.href,
            newTab: item.newTab === true,
            ...(children.length ? { children } : {}),
          },
        ];
      });
  };
  return { title: payload.title, items: build(null, 1) };
}

export function presentSiteSettings(payload: unknown) {
  if (!isRecord(payload)) return null;
  const company = isRecord(payload.company) ? payload.company : {};
  const defaultCta = isRecord(payload.defaultCta) ? payload.defaultCta : {};
  return {
    title: payload.title,
    company: {
      name: company.name,
      ...(typeof company.legalName === "string" ? { legalName: company.legalName } : {}),
      phone: company.phone,
      whatsapp: company.whatsapp,
      email: company.email,
      address: company.address,
    },
    socialLinks: (Array.isArray(payload.socialLinks) ? payload.socialLinks : []).map((link: JsonRecord) => ({
      network: link.network,
      url: link.url,
    })),
    defaultCta: { label: defaultCta.label, href: defaultCta.href },
  };
}

export function publicWireLeak(value: unknown, path = "$response", depth = 0): string | null {
  if (depth > 64) return `${path}:depth`;
  if (typeof value === "string") {
    if (embeddedUuidPattern.test(value)) return `${path}:uuid`;
    if (embeddedDigestPattern.test(value)) return `${path}:hash`;
    if (/\/storage\/v1\/(?:object|render)\//i.test(value)) return `${path}:storage`;
    const stringLeak = publicStringLeak(value);
    if (stringLeak) return `${path}:${stringLeak}`;
    return null;
  }
  if (Array.isArray(value)) {
    if (value.length > 10_000) return `${path}:size`;
    for (const [index, entry] of value.entries()) {
      const leak = publicWireLeak(entry, `${path}[${index}]`, depth + 1);
      if (leak) return leak;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  if (Object.keys(value).length > 1_000) return `${path}:size`;
  for (const [key, entry] of Object.entries(value)) {
    if (isInternalWireKey(key)) return `${path}.${key}:key`;
    const leak = publicWireLeak(entry, `${path}.${key}`, depth + 1);
    if (leak) return leak;
  }
  return null;
}
