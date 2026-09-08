import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase";
import type {
  CmsApplicationContent,
  CmsIndustryContent,
  CmsPageContent,
  CmsProductContent,
  CmsPublicCampaignContent,
  CmsPublicPostContent,
  CmsServiceContent,
  CmsSolutionContent,
} from "@/shared/contracts/cms-content";
import type { CmsRelatedItem } from "./components/CmsPageRenderer";
import { activateLegacyCatalogContext, adaptLegacyCatalogResponse } from "./catalog-backend-compatibility";
import { normalizeLegacyFormResponse, transferLegacyFormBinding } from "./form-backend-compatibility";

type CmsProductModel = CmsProductContent["models"][number];
type CmsProductVariant = CmsProductModel["variants"][number];
type CmsProductSpecification = CmsProductContent["specifications"][number];
type CmsProductDocument = CmsProductContent["documents"][number];

export type CmsPublicProductContent = Omit<
  CmsProductContent,
  | "pilotState"
  | "fieldVisibility"
  | "brand"
  | "manufacturer"
  | "productLine"
  | "classification"
  | "function"
  | "technology"
  | "models"
  | "relations"
  | "controlledClassification"
  | "externalIdentifiers"
  | "specifications"
  | "documents"
  | "provenance"
  | "approval"
  | "search"
  | "redirects"
> & {
  brand?: CmsProductContent["brand"];
  manufacturer?: CmsProductContent["manufacturer"];
  productLine?: CmsProductContent["productLine"];
  classification?: CmsProductContent["classification"];
  function?: string;
  technology?: string;
  models: Array<
    Omit<CmsProductModel, "model" | "manufacturerReference" | "sku" | "variants"> &
      Partial<Pick<CmsProductModel, "model" | "manufacturerReference" | "sku">> & {
        variants: Array<
          Omit<CmsProductVariant, "code" | "sku"> & Partial<Pick<CmsProductVariant, "code" | "sku">>
        >;
      }
  >;
  relations?: CmsProductContent["relations"];
  specifications: Array<
    Pick<
      CmsProductSpecification,
      | "key"
      | "label"
      | "type"
      | "value"
      | "unit"
      | "scope"
      | "required"
      | "filterable"
      | "comparable"
      | "searchable"
    > & { ownerLabel?: string }
  >;
  documents: Array<
    Pick<CmsProductDocument, "id" | "kind" | "title" | "revision" | "language" | "visibility">
  >;
  externalIdentifiers?: Array<{
    kind: CmsProductContent["externalIdentifiers"][number]["kind"];
    value: string;
    issuer?: string;
    ownerType: CmsProductContent["externalIdentifiers"][number]["owner"]["type"];
    ownerLabel?: string;
  }>;
  controlledClassification?: Partial<
    Record<
      | "productCategory"
      | "applicationMagnitude"
      | "technology"
      | "installationOperation"
      | "monitoredElement",
      { slug: string; label: string }
    >
  >;
};

export type PublicSeo = Omit<CmsProductContent["seo"], "ogImageId"> & { socialImage?: string };

type PublishedResource<Kind extends string, Payload> = {
  key: string;
  kind: Kind;
  slug: string;
  path: string;
  payload: Payload;
  seo: PublicSeo;
  publishedAt: string;
  mediaUrls?: Record<string, string>;
  mediaAlt?: Record<string, string>;
  documentUrls?: Record<string, string>;
  relatedItems?: CmsRelatedItem[];
  matchedBy?: string;
};

export type PublishedProduct = PublishedResource<"product", CmsPublicProductContent>;
export type ProductCollection = {
  items: PublishedProduct[];
  total: number;
  facets: Record<
    "productCategory" | "applicationMagnitude" | "technology" | "installationOperation" | "monitoredElement",
    string[]
  >;
  query: string;
};
export type DiscoveryType = "service" | "industry" | "application" | "solution";
export type SearchPageType = "page" | "homepage";
export type PublishedDiscovery = PublishedResource<
  DiscoveryType,
  CmsServiceContent | CmsIndustryContent | CmsApplicationContent | CmsSolutionContent
>;
export type PublishedPage = PublishedResource<"page" | "homepage", CmsPageContent>;
export type PublishedPost = PublishedResource<"post", CmsPublicPostContent>;
export type PublishedCampaign = PublishedResource<"campaign", CmsPublicCampaignContent> & {
  form?: PublicFormVersion;
};
export type UnifiedSearchResult = {
  items: Array<PublishedProduct | PublishedDiscovery | PublishedPage | PublishedPost>;
  total: number;
  facets: Record<string, string[]>;
  groups: Record<"product" | DiscoveryType | SearchPageType | "post", number>;
  query: string;
  redirect?: string;
  engine?: "v2";
};

export type PublicRouteRule = {
  destinationPath: string | null;
  status: 301 | 302 | 404 | 410;
};
export type PublishedPageResolution =
  { kind: "page"; page: PublishedPage } | { kind: "route"; rule: PublicRouteRule } | { kind: "fallback" };

export type PublicNavigationItem = {
  location: "header" | "footer";
  label: string;
  href: string;
  newTab: boolean;
  children?: PublicNavigationItem[];
};
export type PublicNavigation = { title: string; items: PublicNavigationItem[] };
export type PublicSiteSettings = {
  title: string;
  company: {
    name: string;
    legalName?: string;
    phone: string;
    whatsapp: string;
    email: string;
    address: string;
  };
  socialLinks: Array<{ network: string; url: string }>;
  defaultCta: { label: string; href: string };
};
export type PublishedSiteShell = {
  navigation: PublicNavigation | null;
  settings: PublicSiteSettings | null;
  placements: {
    title?: string;
    placements: Array<{
      slot: string;
      label?: string;
      priority: number;
      startsAt: string;
      endsAt: string;
      target: { kind: string; title: string; summary?: string; path: string };
    }>;
  } | null;
};

export type PublicFormField = {
  key: string;
  label: string;
  type: "text" | "email" | "tel" | "textarea" | "select" | "checkbox" | "hidden";
  required: boolean;
  maxLength?: number;
  options: string[];
  order: number;
};
export type PublicFormVersion = {
  key: string;
  version: number;
  title: string;
  purpose: string;
  fields: PublicFormField[];
  consent: { required: true; text: string; version: string; privacyPath: string };
  successMessage: string;
  submitLabel: string;
};

const publicFormTypes = new Set<PublicFormField["type"]>([
  "text",
  "email",
  "tel",
  "textarea",
  "select",
  "checkbox",
]);

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  const keys = Object.keys(value);
  return keys.length <= allowed.length && keys.every((key) => allowed.includes(key));
}

function nonEmptyString(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
}

function normalizePublicForm(value: unknown): PublicFormVersion | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const form = value as Record<string, unknown>;
  if (
    !exactKeys(form, [
      "key",
      "version",
      "title",
      "purpose",
      "fields",
      "consent",
      "successMessage",
      "submitLabel",
    ]) ||
    typeof form.key !== "string" ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.key) ||
    form.key.length > 120 ||
    !Number.isSafeInteger(form.version) ||
    Number(form.version) < 1 ||
    !nonEmptyString(form.title, 180) ||
    !nonEmptyString(form.purpose, 500) ||
    !nonEmptyString(form.successMessage, 500) ||
    !nonEmptyString(form.submitLabel, 120) ||
    !Array.isArray(form.fields) ||
    form.fields.length < 1 ||
    form.fields.length > 50 ||
    !form.consent ||
    typeof form.consent !== "object" ||
    Array.isArray(form.consent)
  )
    return null;

  const keys = new Set<string>();
  const orders = new Set<number>();
  const fields: PublicFormField[] = [];
  for (const value of form.fields) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const field = value as Record<string, unknown>;
    if (
      !exactKeys(field, ["key", "label", "type", "required", "maxLength", "options", "order"]) ||
      typeof field.key !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(field.key) ||
      field.key.length > 120 ||
      keys.has(field.key) ||
      !nonEmptyString(field.label, 120) ||
      typeof field.type !== "string" ||
      !publicFormTypes.has(field.type as PublicFormField["type"]) ||
      typeof field.required !== "boolean" ||
      !Number.isSafeInteger(field.order) ||
      Number(field.order) < 0 ||
      orders.has(Number(field.order)) ||
      (field.maxLength !== undefined &&
        (!Number.isSafeInteger(field.maxLength) ||
          Number(field.maxLength) < 1 ||
          Number(field.maxLength) > 5_000)) ||
      !Array.isArray(field.options) ||
      field.options.length > 50 ||
      field.options.some((option) => !nonEmptyString(option, 120)) ||
      new Set(field.options).size !== field.options.length ||
      (field.type === "select" && field.options.length === 0)
    )
      return null;
    keys.add(field.key);
    orders.add(Number(field.order));
    fields.push({
      key: field.key,
      label: field.label,
      type: field.type as PublicFormField["type"],
      required: field.required,
      ...(field.maxLength === undefined ? {} : { maxLength: Number(field.maxLength) }),
      options: field.options as string[],
      order: Number(field.order),
    });
  }

  const consent = form.consent as Record<string, unknown>;
  if (
    !exactKeys(consent, ["required", "text", "version", "privacyPath"]) ||
    consent.required !== true ||
    !nonEmptyString(consent.text, 2_000) ||
    !nonEmptyString(consent.version, 80) ||
    typeof consent.privacyPath !== "string" ||
    !/^\/(?!\/)(?:[^\s?#]*)$/.test(consent.privacyPath) ||
    consent.privacyPath.length > 300
  )
    return null;

  return {
    key: form.key,
    version: Number(form.version),
    title: form.title,
    purpose: form.purpose,
    fields: fields.sort((left, right) => left.order - right.order),
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

type WireImage = { src?: unknown; alt?: unknown; caption?: unknown };
type HydrationContext = {
  mediaUrls: Record<string, string>;
  mediaAlt: Record<string, string>;
  documentUrls: Record<string, string>;
};

const forbiddenWireKeys = new Set([
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

const executableWirePattern =
  /<\s*\/?\s*(?:script|style|iframe|object|embed|svg|math|link|meta|base|template)\b|(?:javascript|vbscript)\s*:|data\s*:\s*text\/html|\bon[a-z]+\s*=|@import\s+|expression\s*\(|-moz-binding\s*:/i;
const secretWirePattern =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:bearer\s+[a-z0-9._~+/=-]{12,}|(?:eyJ|sbp_|sb_secret_|sk-or-|gh[pousr]_|github_pat_|xox[baprs]-|AKIA|ASIA)[a-z0-9._-]{10,}|(?:postgres(?:ql)?|mysql|redis|mongodb(?:\+srv)?):\/\/[^/\s:@]+:[^@\s/]+@)/i;
const sensitiveUrlParameterPattern =
  /^(?:access[_-]?token|refresh[_-]?token|token|api[_-]?key|apikey|key|secret|signature|sig|credential|authorization|password)$/i;
const publicSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const publicPathPattern = /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/?)*$/;
const publicResourceKinds = new Set([
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

function keySegments(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1_$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function wireKeyIsInternal(key: string) {
  if (forbiddenWireKeys.has(key)) return true;
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
    segments.some((segment) => forbiddenTechnicalKeySegments.has(segment))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPublicInternetHostname(hostname: string) {
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

function isGovernedLocalProxy(parsed: URL) {
  try {
    const configured = new URL(SUPABASE_URL);
    return (
      parsed.origin === configured.origin &&
      parsed.pathname === "/functions/v1/cms-public" &&
      ["media", "document"].includes(parsed.searchParams.get("type") ?? "")
    );
  } catch {
    return false;
  }
}

function isGovernedCompatibilityProxy(parsed: URL) {
  if (typeof window === "undefined" || parsed.origin !== window.location.origin) return false;
  if (parsed.pathname !== "/__cms-public-asset") return false;
  const entries = [...parsed.searchParams.entries()];
  const keys = entries.map(([key]) => key);
  const type = parsed.searchParams.get("type");
  const expected =
    type === "media"
      ? ["type", "kind", "slug", "path", "slot"]
      : ["type", "kind", "slug", "path", "position"];
  return (
    (type === "media" || type === "document") &&
    entries.length === expected.length &&
    new Set(keys).size === keys.length &&
    expected.every((key) => keys.includes(key))
  );
}

function unsafeWireString(value: string) {
  if (executableWirePattern.test(value) || secretWirePattern.test(value)) return true;
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const parsed = new URL(value);
    return Boolean(
      parsed.username ||
      parsed.password ||
      (!isPublicInternetHostname(parsed.hostname) &&
        !isGovernedLocalProxy(parsed) &&
        !isGovernedCompatibilityProxy(parsed)) ||
      [...parsed.searchParams.keys()].some((key) => sensitiveUrlParameterPattern.test(key)),
    );
  } catch {
    return true;
  }
}

function wireHasInternalData(value: unknown, depth = 0): boolean {
  if (depth > 64) return true;
  if (typeof value === "string")
    return (
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(value) ||
      /(?:^|[^0-9a-f])[0-9a-f]{40,128}(?:$|[^0-9a-f])/i.test(value) ||
      /\/storage\/v1\/(?:object|render)\//i.test(value) ||
      unsafeWireString(value)
    );
  if (Array.isArray(value))
    return value.length > 10_000 || value.some((entry) => wireHasInternalData(entry, depth + 1));
  if (!value || typeof value !== "object") return false;
  if (Object.keys(value).length > 1_000) return true;
  return Object.entries(value).some(
    ([key, entry]) =>
      wireKeyIsInternal(key) ||
      [
        "approval",
        "componentVersion",
        "expiry",
        "fieldVisibility",
        "governanceState",
        "pilotState",
        "relations",
        "retirement",
        "search",
        "templateKey",
        "visual",
      ].includes(key) ||
      wireHasInternalData(entry, depth + 1),
  );
}

function isPublicPath(value: unknown, maximum = 300): value is string {
  return typeof value === "string" && value.length <= maximum && publicPathPattern.test(value);
}

function isPublicText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
}

function normalizeSearchMatch(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return new Map<string, string>([
    ["exact_title", "Correspondência pelo título"],
    ["full_text", "Correspondência pelo conteúdo técnico"],
    ["governed_synonym", "Correspondência por termo relacionado"],
    ["similar_title", "Correspondência por título relacionado"],
    ["nome ou modelo público", "Correspondência pelo nome ou modelo"],
    ["conteúdo técnico ou sinônimo", "Correspondência pelo conteúdo técnico"],
    ["Correspondência pelo título", "Correspondência pelo título"],
    ["Correspondência pelo conteúdo técnico", "Correspondência pelo conteúdo técnico"],
    ["Correspondência por termo relacionado", "Correspondência por termo relacionado"],
    ["Correspondência por título relacionado", "Correspondência por título relacionado"],
    ["Correspondência pelo nome ou modelo", "Correspondência pelo nome ou modelo"],
  ]).get(value);
}

function normalizePublicSeo(value: unknown, expectedPath: string): PublicSeo | null {
  if (!isRecord(value)) return null;
  if (
    !exactKeys(value, [
      "title",
      "description",
      "canonicalPath",
      "indexable",
      "socialImage",
      "ogTitle",
      "ogDescription",
    ]) ||
    !isPublicText(value.title, 70) ||
    !isPublicText(value.description, 180) ||
    value.canonicalPath !== expectedPath ||
    !isPublicPath(value.canonicalPath, 240) ||
    typeof value.indexable !== "boolean" ||
    (value.ogTitle !== undefined && !isPublicText(value.ogTitle, 70)) ||
    (value.ogDescription !== undefined && !isPublicText(value.ogDescription, 180)) ||
    (value.socialImage !== undefined &&
      (typeof value.socialImage !== "string" ||
        !/^https?:\/\//i.test(value.socialImage) ||
        unsafeWireString(value.socialImage)))
  )
    return null;
  return {
    title: value.title,
    description: value.description,
    canonicalPath: value.canonicalPath,
    indexable: value.indexable,
    ...(typeof value.socialImage === "string" ? { socialImage: value.socialImage } : {}),
  } as PublicSeo;
}

function expectedResourcePath(kind: string, slug: string, payload: Record<string, unknown>): string | null {
  const fixedPrefixes: Record<string, string> = {
    product: "/produtos/",
    service: "/servicos/",
    industry: "/industrias/",
    application: "/aplicacoes/",
    solution: "/solucoes/",
    post: "/blog/",
  };
  if (fixedPrefixes[kind]) return `${fixedPrefixes[kind]}${slug}`;
  if (kind === "homepage") return "/";
  if (kind === "page" || kind === "campaign") {
    const route = isRecord(payload.route) ? payload.route : null;
    return isPublicPath(route?.path) ? route.path : null;
  }
  return null;
}

function normalizeRelatedItems(value: unknown): CmsRelatedItem[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 500) return null;
  const items: CmsRelatedItem[] = [];
  for (const entry of value) {
    if (
      !isRecord(entry) ||
      !exactKeys(entry, ["kind", "title", "summary", "path"]) ||
      typeof entry.kind !== "string" ||
      !publicResourceKinds.has(entry.kind) ||
      !isPublicText(entry.title, 180) ||
      (entry.summary !== undefined && (typeof entry.summary !== "string" || entry.summary.length > 500)) ||
      !isPublicPath(entry.path)
    )
      return null;
    items.push({
      kind: entry.kind,
      title: entry.title,
      ...(typeof entry.summary === "string" ? { summary: entry.summary } : {}),
      path: entry.path,
    });
  }
  return items;
}

function registerImage(context: HydrationContext, token: string, image: unknown) {
  if (!image || typeof image !== "object") return undefined;
  const candidate = image as WireImage;
  if (
    typeof candidate.src !== "string" ||
    !/^https?:\/\//i.test(candidate.src) ||
    unsafeWireString(candidate.src)
  )
    return undefined;
  context.mediaUrls[`${token}:large.webp`] = candidate.src;
  if (typeof candidate.alt === "string") context.mediaAlt[token] = candidate.alt;
  return token;
}

function hydrateBlocks(blocks: unknown, context: HydrationContext) {
  if (!Array.isArray(blocks)) return [];
  return blocks.map((rawBlock, blockIndex) => {
    const block = rawBlock && typeof rawBlock === "object" ? (rawBlock as Record<string, any>) : {};
    const rawData = block.data && typeof block.data === "object" ? block.data : {};
    const { itemPaths: rawItemPaths, ...safeRawData } = rawData;
    const data: Record<string, any> = { ...safeRawData };
    const directImage = registerImage(context, `block-${blockIndex + 1}`, rawData.image);
    if (directImage) data.assetId = directImage;
    if (Array.isArray(rawData.images))
      data.assetIds = rawData.images.flatMap((image: unknown, imageIndex: number) => {
        const token = registerImage(context, `block-${blockIndex + 1}-image-${imageIndex + 1}`, image);
        return token ? [token] : [];
      });
    if (Array.isArray(rawData.items))
      data.items = rawData.items.map((rawItem: unknown, itemIndex: number) => {
        const item = rawItem && typeof rawItem === "object" ? (rawItem as Record<string, any>) : {};
        const image = registerImage(context, `block-${blockIndex + 1}-item-${itemIndex + 1}`, item.image);
        return {
          ...item,
          id: `item-${blockIndex + 1}-${itemIndex + 1}`,
          ...(image ? { assetId: image } : {}),
        };
      });
    if (block.type === "related_content")
      data.itemIds = Array.isArray(rawItemPaths)
        ? rawItemPaths.filter((path: unknown): path is string => isPublicPath(path))
        : [];
    return {
      ...block,
      id: `block-${blockIndex + 1}`,
      ...(typeof block.group === "string" ? { groupId: block.group } : {}),
      data,
    };
  });
}

function hydratePayload(rawPayload: unknown, context: HydrationContext) {
  const payload = rawPayload && typeof rawPayload === "object" ? (rawPayload as Record<string, any>) : {};
  const hydrated: Record<string, any> = {
    ...payload,
    blocks: hydrateBlocks(payload.blocks, context),
  };
  if (Array.isArray(payload.media))
    hydrated.media = payload.media.map((entry: Record<string, any>, index: number) => {
      const token = registerImage(context, `media-${index + 1}`, entry.image);
      return { ...entry, ...(token ? { assetId: token } : {}) };
    });
  if (Array.isArray(payload.documents))
    hydrated.documents = payload.documents.map((document: Record<string, any>, index: number) => {
      const token = `document-${index + 1}`;
      if (typeof document.href === "string") context.documentUrls[token] = document.href;
      return { ...document, id: token };
    });
  if (Array.isArray(payload.models))
    hydrated.models = payload.models.map((model: Record<string, any>, modelIndex: number) => ({
      ...model,
      id: `model-${modelIndex + 1}`,
      variants: Array.isArray(model.variants)
        ? model.variants.map((variant: Record<string, any>, variantIndex: number) => ({
            ...variant,
            id: `variant-${modelIndex + 1}-${variantIndex + 1}`,
          }))
        : [],
    }));
  return hydrated;
}

function isWireResource(value: unknown, expectedKinds: ReadonlySet<string>): value is Record<string, any> {
  if (!isRecord(value)) return false;
  if (
    !exactKeys(value, [
      "kind",
      "slug",
      "path",
      "payload",
      "seo",
      "publishedAt",
      "relatedItems",
      "matchedBy",
      "form",
    ]) ||
    typeof value.kind !== "string" ||
    !expectedKinds.has(value.kind) ||
    !publicResourceKinds.has(value.kind) ||
    typeof value.slug !== "string" ||
    value.slug.length > 160 ||
    !publicSlugPattern.test(value.slug) ||
    !isPublicPath(value.path) ||
    !isRecord(value.payload) ||
    !isPublicText(value.payload.title, 220) ||
    expectedResourcePath(value.kind, value.slug, value.payload) !== value.path ||
    !Number.isFinite(Date.parse(String(value.publishedAt ?? ""))) ||
    String(value.publishedAt).length > 40 ||
    (value.matchedBy !== undefined && !normalizeSearchMatch(value.matchedBy))
  )
    return false;
  return (
    normalizePublicSeo(value.seo, value.path) !== null && normalizeRelatedItems(value.relatedItems) !== null
  );
}

function normalizeResource<T>(wire: unknown, expectedKinds: ReadonlySet<string>): T {
  if (!isWireResource(wire, expectedKinds) || wireHasInternalData(wire))
    throw new Error("Conteúdo público incompatível com o contrato vigente.");
  const relatedItems = normalizeRelatedItems(wire.relatedItems)!;
  const context: HydrationContext = { mediaUrls: {}, mediaAlt: {}, documentUrls: {} };
  const publicForm = wire.form === undefined ? undefined : normalizePublicForm(wire.form);
  if (wire.form !== undefined && !publicForm)
    throw new Error("Formulário incompatível com o contrato público vigente.");
  if (publicForm && isRecord(wire.form)) transferLegacyFormBinding(wire.form, publicForm);
  const seo = normalizePublicSeo(wire.seo, wire.path)!;
  const payload = hydratePayload(wire.payload, context);
  payload.seo = seo;
  const matchedBy = normalizeSearchMatch(wire.matchedBy);
  activateLegacyCatalogContext(wire);
  return {
    key: wire.path || `${wire.kind}:${wire.slug}`,
    kind: wire.kind,
    slug: wire.slug,
    path: wire.path,
    payload,
    seo,
    publishedAt: wire.publishedAt,
    mediaUrls: context.mediaUrls,
    mediaAlt: context.mediaAlt,
    documentUrls: context.documentUrls,
    relatedItems,
    ...(matchedBy ? { matchedBy } : {}),
    ...(publicForm ? { form: publicForm } : {}),
  } as T;
}

async function catalogFetch<T>(params: URLSearchParams): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/cms-public?${params}`, {
      headers: { apikey: SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error("Catálogo temporariamente indisponível.");
  }
  if (!response.ok) throw new Error("Catálogo temporariamente indisponível.");
  const raw: unknown = await response.json().catch(() => ({}));
  const adaptation = adaptLegacyCatalogResponse(raw, params, normalizePublicForm, {
    backendUrl: SUPABASE_URL,
    publicOrigin: typeof window === "undefined" ? undefined : window.location.origin,
  });
  const data = adaptation.matched ? adaptation.value : raw;
  if (data === null || wireHasInternalData(data))
    throw new Error("Conteúdo público incompatível com o contrato vigente.");
  return data as T;
}

function normalizeStringArrayRecord(value: unknown): Record<string, string[]> | null {
  if (!isRecord(value) || Object.keys(value).length > 100) return null;
  const result: Record<string, string[]> = {};
  for (const [key, entries] of Object.entries(value)) {
    if (
      !/^[a-z][a-zA-Z0-9]{0,63}$/.test(key) ||
      !Array.isArray(entries) ||
      entries.length > 500 ||
      entries.some((entry) => typeof entry !== "string" || entry.length > 300)
    )
      return null;
    result[key] = entries as string[];
  }
  return result;
}

function normalizeNumberRecord(value: unknown): Record<string, number> | null {
  if (!isRecord(value) || Object.keys(value).length > publicResourceKinds.size) return null;
  const result: Record<string, number> = {};
  for (const [key, count] of Object.entries(value)) {
    if (!publicResourceKinds.has(key) || !Number.isSafeInteger(count) || Number(count) < 0) return null;
    result[key] = Number(count);
  }
  return result;
}

async function normalizedCollection<T extends { items: unknown[] }>(
  params: URLSearchParams,
  expectedKinds: ReadonlySet<string>,
): Promise<T> {
  const result = await catalogFetch<unknown>(params);
  if (
    !isRecord(result) ||
    !exactKeys(result, [
      "items",
      "total",
      "facets",
      "groups",
      "query",
      "redirect",
      "engine",
      "limit",
      "offset",
      "truncated",
    ]) ||
    !Array.isArray(result.items) ||
    result.items.length > 500 ||
    !Number.isSafeInteger(result.total) ||
    Number(result.total) < result.items.length ||
    (result.facets !== undefined && !normalizeStringArrayRecord(result.facets)) ||
    (result.groups !== undefined && !normalizeNumberRecord(result.groups)) ||
    (result.query !== undefined && (typeof result.query !== "string" || result.query.length > 300)) ||
    (result.redirect !== undefined && !isPublicPath(result.redirect)) ||
    (result.engine !== undefined && result.engine !== "v2") ||
    (result.limit !== undefined && (!Number.isSafeInteger(result.limit) || Number(result.limit) < 1)) ||
    (result.offset !== undefined && (!Number.isSafeInteger(result.offset) || Number(result.offset) < 0)) ||
    (result.truncated !== undefined && typeof result.truncated !== "boolean")
  )
    throw new Error("Resposta pública inválida.");
  return {
    ...result,
    items: result.items.map((item) => normalizeResource(item, expectedKinds)),
    ...(result.facets === undefined ? {} : { facets: normalizeStringArrayRecord(result.facets)! }),
    ...(result.groups === undefined ? {} : { groups: normalizeNumberRecord(result.groups)! }),
  } as T;
}

export async function getPublishedProduct(slug: string) {
  return normalizeResource<PublishedProduct>(
    await catalogFetch<unknown>(new URLSearchParams({ type: "detail", slug })),
    new Set(["product"]),
  );
}

const publicProductCollectionParameters = new Set([
  "q",
  "productCategory",
  "segment",
  "applicationMagnitude",
  "category",
  "technology",
  "installationOperation",
  "monitoredElement",
  "limit",
  "offset",
]);

export function getPublishedProducts(params: Record<string, string>) {
  const publicParams = Object.fromEntries(
    Object.entries(params)
      .filter(([key]) => publicProductCollectionParameters.has(key))
      .map(([key, value]) => {
        if (typeof value !== "string" || value.length > 300 || unsafeWireString(value))
          throw new Error("Consulta pública inválida.");
        return [key, value];
      }),
  );
  return normalizedCollection<ProductCollection>(
    new URLSearchParams({ type: "products", contentType: "product", ...publicParams }),
    new Set(["product"]),
  );
}
export function searchPublishedProducts(query: string) {
  return normalizedCollection<UnifiedSearchResult>(
    new URLSearchParams({ type: "search", q: query }),
    new Set(["product", "service", "industry", "application", "solution", "page", "homepage", "post"]),
  );
}
export function comparePublishedProducts(slugs: string[]) {
  return normalizedCollection<ProductCollection>(
    new URLSearchParams({ type: "products", contentType: "product", slugs: slugs.join(",") }),
    new Set(["product"]),
  );
}
export async function getPublishedDiscovery(contentType: DiscoveryType, slug: string) {
  return normalizeResource<PublishedDiscovery>(
    await catalogFetch<unknown>(new URLSearchParams({ type: "entity-detail", contentType, slug })),
    new Set([contentType]),
  );
}
export function getPublishedDiscoveryCollection(contentType: DiscoveryType, query = "") {
  return normalizedCollection<UnifiedSearchResult>(
    new URLSearchParams({ type: "collection", contentType, ...(query ? { q: query } : {}) }),
    new Set([contentType]),
  );
}
export function autocompletePublished(query: string) {
  return normalizedCollection<UnifiedSearchResult>(
    new URLSearchParams({ type: "autocomplete", q: query }),
    new Set(["product", "service", "industry", "application", "solution", "page", "homepage", "post"]),
  );
}

const publicNavigationLocations = new Set<PublicNavigationItem["location"]>(["header", "footer"]);
const publicPlacementSlots = new Set([
  "home_hero",
  "home_featured",
  "catalog_featured",
  "global_announcement",
]);
const publicPlacementTargetKinds = new Set([
  "product",
  "service",
  "industry",
  "application",
  "solution",
  "page",
]);
const campaignPlacementSlots = new Set([
  "home_hero",
  "home_featured",
  "global_announcement",
  "article_inline",
  "product_banner",
  "service_banner",
  "solution_banner",
  "page_banner",
]);

function isPublicHref(value: unknown): value is string {
  if (isPublicPath(value)) return true;
  if (typeof value !== "string" || value.length > 500 || unsafeWireString(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && isPublicInternetHostname(parsed.hostname);
  } catch {
    return false;
  }
}

function normalizeRouteRule(value: unknown): PublicRouteRule | null {
  if (!isRecord(value) || !exactKeys(value, ["destinationPath", "status"])) return null;
  if (![301, 302, 404, 410].includes(Number(value.status))) return null;
  const status = Number(value.status) as PublicRouteRule["status"];
  const destinationPath = value.destinationPath;
  if (status === 301 || status === 302) {
    if (!isPublicPath(destinationPath)) return null;
    return { destinationPath, status };
  }
  return destinationPath === null ? { destinationPath: null, status } : null;
}

function normalizePageResolution(value: unknown, requestedPath: string): PublishedPageResolution | null {
  if (!isRecord(value) || typeof value.kind !== "string") return null;
  if (value.kind === "fallback" && exactKeys(value, ["kind"])) return { kind: "fallback" };
  if (value.kind === "route" && exactKeys(value, ["kind", "rule"])) {
    const rule = normalizeRouteRule(value.rule);
    return rule ? { kind: "route", rule } : null;
  }
  if (value.kind === "page" && exactKeys(value, ["kind", "page"])) {
    try {
      const page = normalizeResource<PublishedPage>(value.page, new Set(["page", "homepage"]));
      return page.path === requestedPath ? { kind: "page", page } : null;
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeNavigationItem(value: unknown, depth: number): PublicNavigationItem | null {
  if (
    depth > 3 ||
    !isRecord(value) ||
    !exactKeys(value, ["location", "label", "href", "newTab", "children"]) ||
    typeof value.location !== "string" ||
    !publicNavigationLocations.has(value.location as PublicNavigationItem["location"]) ||
    !isPublicText(value.label, 120) ||
    !isPublicHref(value.href) ||
    typeof value.newTab !== "boolean"
  )
    return null;
  if (value.children !== undefined && (!Array.isArray(value.children) || value.children.length > 100))
    return null;
  const children = (value.children ?? []).map((child) => normalizeNavigationItem(child, depth + 1));
  if (children.some((child) => child === null)) return null;
  return {
    location: value.location as PublicNavigationItem["location"],
    label: value.label,
    href: value.href,
    newTab: value.newTab,
    ...(children.length ? { children: children as PublicNavigationItem[] } : {}),
  };
}

function normalizeNavigation(value: unknown): PublicNavigation | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["title", "items"]) ||
    !isPublicText(value.title, 180) ||
    !Array.isArray(value.items) ||
    value.items.length > 100
  )
    return null;
  const items = value.items.map((item) => normalizeNavigationItem(item, 1));
  return items.some((item) => item === null)
    ? null
    : { title: value.title, items: items as PublicNavigationItem[] };
}

function normalizeSiteSettings(value: unknown): PublicSiteSettings | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["title", "company", "socialLinks", "defaultCta"]) ||
    !isPublicText(value.title, 180) ||
    !isRecord(value.company) ||
    !exactKeys(value.company, ["name", "legalName", "phone", "whatsapp", "email", "address"]) ||
    !isPublicText(value.company.name, 160) ||
    (value.company.legalName !== undefined && !isPublicText(value.company.legalName, 200)) ||
    typeof value.company.phone !== "string" ||
    value.company.phone.length > 40 ||
    typeof value.company.whatsapp !== "string" ||
    value.company.whatsapp.length > 40 ||
    typeof value.company.email !== "string" ||
    value.company.email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.company.email) ||
    typeof value.company.address !== "string" ||
    value.company.address.length > 500 ||
    !Array.isArray(value.socialLinks) ||
    value.socialLinks.length > 20 ||
    !isRecord(value.defaultCta) ||
    !exactKeys(value.defaultCta, ["label", "href"]) ||
    !isPublicText(value.defaultCta.label, 120) ||
    !isPublicHref(value.defaultCta.href)
  )
    return null;
  const socialLinks = value.socialLinks.flatMap((entry) => {
    if (
      !isRecord(entry) ||
      !exactKeys(entry, ["network", "url"]) ||
      !isPublicText(entry.network, 50) ||
      !isPublicHref(entry.url)
    )
      return [];
    return [{ network: entry.network, url: entry.url }];
  });
  if (socialLinks.length !== value.socialLinks.length) return null;
  return {
    title: value.title,
    company: {
      name: value.company.name,
      ...(typeof value.company.legalName === "string" ? { legalName: value.company.legalName } : {}),
      phone: value.company.phone,
      whatsapp: value.company.whatsapp,
      email: value.company.email,
      address: value.company.address,
    },
    socialLinks,
    defaultCta: { label: value.defaultCta.label, href: value.defaultCta.href },
  };
}

function normalizePlacements(value: unknown): NonNullable<PublishedSiteShell["placements"]> | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["title", "placements"]) ||
    (value.title !== undefined && !isPublicText(value.title, 180)) ||
    !Array.isArray(value.placements) ||
    value.placements.length > 100
  )
    return null;
  const placements: NonNullable<PublishedSiteShell["placements"]>["placements"] = [];
  for (const entry of value.placements) {
    if (
      !isRecord(entry) ||
      !exactKeys(entry, ["slot", "label", "priority", "startsAt", "endsAt", "target"]) ||
      typeof entry.slot !== "string" ||
      !publicPlacementSlots.has(entry.slot) ||
      (entry.label !== undefined && !isPublicText(entry.label, 120)) ||
      !Number.isSafeInteger(entry.priority) ||
      Number(entry.priority) < 0 ||
      Number(entry.priority) > 999 ||
      !Number.isFinite(Date.parse(String(entry.startsAt ?? ""))) ||
      !Number.isFinite(Date.parse(String(entry.endsAt ?? ""))) ||
      Date.parse(String(entry.endsAt)) <= Date.parse(String(entry.startsAt)) ||
      !isRecord(entry.target) ||
      !exactKeys(entry.target, ["kind", "title", "summary", "path"]) ||
      typeof entry.target.kind !== "string" ||
      !publicPlacementTargetKinds.has(entry.target.kind) ||
      !isPublicText(entry.target.title, 220) ||
      (entry.target.summary !== undefined &&
        (typeof entry.target.summary !== "string" || entry.target.summary.length > 500)) ||
      !isPublicPath(entry.target.path)
    )
      return null;
    placements.push({
      slot: entry.slot,
      ...(typeof entry.label === "string" ? { label: entry.label } : {}),
      priority: Number(entry.priority),
      startsAt: String(entry.startsAt),
      endsAt: String(entry.endsAt),
      target: {
        kind: entry.target.kind,
        title: entry.target.title,
        ...(typeof entry.target.summary === "string" ? { summary: entry.target.summary } : {}),
        path: entry.target.path,
      },
    });
  }
  return {
    ...(typeof value.title === "string" ? { title: value.title } : {}),
    placements,
  };
}

function normalizeSiteShell(value: unknown): PublishedSiteShell | null {
  if (!isRecord(value) || !exactKeys(value, ["navigation", "settings", "placements"])) return null;
  const navigation = value.navigation === null ? null : normalizeNavigation(value.navigation);
  const settings = value.settings === null ? null : normalizeSiteSettings(value.settings);
  const placements = value.placements === null ? null : normalizePlacements(value.placements);
  if (
    (value.navigation !== null && !navigation) ||
    (value.settings !== null && !settings) ||
    (value.placements !== null && !placements)
  )
    return null;
  return { navigation, settings, placements };
}

type PublicCampaignPlacement = {
  slot: string;
  priority: number;
  startsAt: string;
  endsAt: string;
  campaign: { title: string; summary: string; path: string };
};

function normalizeCampaignPlacements(value: unknown): { items: PublicCampaignPlacement[] } | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["items"]) ||
    !Array.isArray(value.items) ||
    value.items.length > 100
  )
    return null;
  const items: PublicCampaignPlacement[] = [];
  for (const entry of value.items) {
    if (
      !isRecord(entry) ||
      !exactKeys(entry, ["slot", "priority", "startsAt", "endsAt", "campaign"]) ||
      typeof entry.slot !== "string" ||
      !campaignPlacementSlots.has(entry.slot) ||
      !Number.isSafeInteger(entry.priority) ||
      Number(entry.priority) < 0 ||
      Number(entry.priority) > 999 ||
      !Number.isFinite(Date.parse(String(entry.startsAt ?? ""))) ||
      !Number.isFinite(Date.parse(String(entry.endsAt ?? ""))) ||
      Date.parse(String(entry.endsAt)) <= Date.parse(String(entry.startsAt)) ||
      !isRecord(entry.campaign) ||
      !exactKeys(entry.campaign, ["title", "summary", "path"]) ||
      !isPublicText(entry.campaign.title, 180) ||
      !isPublicText(entry.campaign.summary, 500) ||
      !isPublicPath(entry.campaign.path) ||
      !entry.campaign.path.startsWith("/campanhas/")
    )
      return null;
    items.push({
      slot: entry.slot,
      priority: Number(entry.priority),
      startsAt: String(entry.startsAt),
      endsAt: String(entry.endsAt),
      campaign: {
        title: entry.campaign.title,
        summary: entry.campaign.summary,
        path: entry.campaign.path,
      },
    });
  }
  return { items };
}

export async function getPublishedPageByPath(path: string): Promise<PublishedPageResolution> {
  const result = await catalogFetch<Record<string, unknown>>(
    new URLSearchParams({ type: "page-by-path", path }),
  );
  const resolution = normalizePageResolution(result, path);
  if (!resolution) throw new Error("Resposta pública incompatível com o contrato vigente.");
  return resolution;
}

export async function getPublicRouteRule(path: string) {
  const rule = normalizeRouteRule(
    await catalogFetch<unknown>(new URLSearchParams({ type: "redirect", path })),
  );
  if (!rule) throw new Error("Resposta pública incompatível com o contrato vigente.");
  return rule;
}

export async function getPublishedSiteShell() {
  const shell = normalizeSiteShell(await catalogFetch<unknown>(new URLSearchParams({ type: "site-shell" })));
  if (!shell) throw new Error("Resposta pública incompatível com o contrato vigente.");
  return shell;
}

export async function getPublishedPosts() {
  const result = await normalizedCollection<{ items: unknown[]; total?: number }>(
    new URLSearchParams({ type: "posts" }),
    new Set(["post"]),
  );
  const items = (result.items as PublishedPost[]).filter((item) => item.kind === "post");
  return { items, total: items.length };
}

export async function getPublishedPost(slug: string) {
  const result = normalizeResource<PublishedPost>(
    await catalogFetch<unknown>(new URLSearchParams({ type: "post-detail", slug })),
    new Set(["post"]),
  );
  if (result.kind !== "post") throw new Error("Artigo incompatível com o contrato editorial vigente.");
  return result;
}

export async function getPublishedCampaign(path: string) {
  const result = await catalogFetch<Record<string, unknown>>(
    new URLSearchParams({ type: "campaign-by-path", path }),
  );
  if (result.kind === "route" || result.kind === "fallback") {
    const resolution = normalizePageResolution(result, path);
    if (!resolution) throw new Error("Campanha incompatível com o contrato vigente.");
    return resolution;
  }
  let campaign: PublishedCampaign;
  try {
    campaign = normalizeResource<PublishedCampaign>(result, new Set(["campaign"]));
  } catch {
    throw new Error("Campanha incompatível com o contrato vigente.");
  }
  if (
    campaign.kind !== "campaign" ||
    campaign.payload.route.path !== campaign.seo.canonicalPath ||
    campaign.path !== path
  )
    throw new Error("Campanha incompatível com o contrato vigente.");
  return campaign;
}

export async function getPublishedForm(key: string, version?: number): Promise<PublicFormVersion | null> {
  const params = new URLSearchParams({
    type: "form",
    key,
    ...(version === undefined ? {} : { version: String(version) }),
  });
  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/cms-public?${params}`, {
      headers: { apikey: SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error("Formulário temporariamente indisponível.");
  }
  if (response.status === 204) return null;
  if (!response.ok) throw new Error("Formulário temporariamente indisponível.");
  const data: unknown = await response.json().catch(() => ({}));
  const legacyForm = normalizeLegacyFormResponse(data, { key, version }, normalizePublicForm);
  if (legacyForm) return legacyForm;
  if (wireHasInternalData(data)) throw new Error("Formulário incompatível com o contrato público vigente.");
  const form = normalizePublicForm(data);
  if (!form || form.key !== key || (version !== undefined && form.version !== version))
    throw new Error("Formulário incompatível com o contrato público vigente.");
  return form;
}

export async function getCampaignPlacements(path: string) {
  const placements = normalizeCampaignPlacements(
    await catalogFetch<unknown>(new URLSearchParams({ type: "campaign-placements", contextPath: path })),
  );
  if (!placements) throw new Error("Resposta pública incompatível com o contrato vigente.");
  return placements;
}
