import {
  CmsContentPayloadSchema,
  omitLegacyExternalProductDocuments,
} from "../../../src/shared/contracts/cms-content.ts";

type JsonRecord = Record<string, any>;

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

function publicHttpUrl(value: unknown, httpsOnly = false): string | undefined {
  if (typeof value !== "string" || value.length > 500) return undefined;
  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password) return undefined;
    if (httpsOnly)
      return parsed.protocol === "https:" && isPublicInternetHostname(parsed.hostname)
        ? value
        : undefined;
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? value : undefined;
  } catch {
    return undefined;
  }
}

const productDocumentKeys = new Set([
  "id",
  "kind",
  "title",
  "storagePath",
  "sha256",
  "revision",
  "language",
  "visibility",
  "rightsConfirmed",
]);

function safeProductDocumentReference(value: unknown): value is JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const document = value as JsonRecord;
  if (Object.keys(document).some((key) => !productDocumentKeys.has(key))) return false;
  const hasStoragePath = Object.prototype.hasOwnProperty.call(document, "storagePath");
  return (
    typeof document.id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(document.id) &&
    ["datasheet", "manual", "certificate", "drawing", "software", "other"].includes(
      document.kind,
    ) &&
    typeof document.title === "string" &&
    document.title.trim().length >= 1 &&
    document.title.trim().length <= 180 &&
    typeof document.sha256 === "string" &&
    /^[0-9a-f]{64}$/.test(document.sha256) &&
    typeof document.revision === "string" &&
    document.revision.trim().length >= 1 &&
    document.revision.trim().length <= 80 &&
    typeof document.language === "string" &&
    /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(document.language) &&
    ["public", "private"].includes(document.visibility) &&
    document.rightsConfirmed === true &&
    hasStoragePath &&
    typeof document.storagePath === "string" &&
    /^cms-documents\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+\.pdf$/.test(document.storagePath) &&
    document.storagePath.split("/")[1]?.toLowerCase() === document.id.toLowerCase()
  );
}

const COMMON_EDITORIAL_FIELDS = [
  "schemaVersion",
  "consumerId",
  "contentType",
  "title",
  "summary",
  "blocks",
  "seo",
] as const;

export const PUBLIC_PAYLOAD_FIELDS = {
  product: [
    ...COMMON_EDITORIAL_FIELDS,
    "brand",
    "manufacturer",
    "productLine",
    "classification",
    "controlledClassification",
    "commercial",
    "function",
    "technology",
    "models",
    "specifications",
    "externalIdentifiers",
    "media",
    "documents",
    "relations",
  ],
  service: [
    ...COMMON_EDITORIAL_FIELDS,
    "serviceKind",
    "serviceKindRef",
    "scope",
    "whenToHire",
    "deliverables",
    "prerequisites",
    "executionSteps",
    "media",
    "cta",
    "relations",
  ],
  industry: [
    ...COMMON_EDITORIAL_FIELDS,
    "displayOrder",
    "marketName",
    "challenges",
    "evidence",
    "processAreas",
    "media",
    "cta",
    "relations",
  ],
  application: [
    ...COMMON_EDITORIAL_FIELDS,
    "process",
    "problem",
    "benefits",
    "points",
    "media",
    "cta",
    "relations",
  ],
  solution: [
    ...COMMON_EDITORIAL_FIELDS,
    "problem",
    "approach",
    "benefits",
    "components",
    "gasDetectionModel",
    "media",
    "cta",
    "relations",
  ],
  post: [
    ...COMMON_EDITORIAL_FIELDS,
    "excerpt",
    "authorName",
    "author",
    "category",
    "tags",
    "relations",
    "readingMinutes",
    "publishAfter",
  ],
  page: [
    ...COMMON_EDITORIAL_FIELDS,
    "pageKind",
    "templateKey",
    "route",
    "relations",
  ],
  homepage: [
    ...COMMON_EDITORIAL_FIELDS,
    "pageKind",
    "templateKey",
    "route",
    "relations",
  ],
  navigation: [...COMMON_EDITORIAL_FIELDS, "items"],
  site_settings: [...COMMON_EDITORIAL_FIELDS, "company", "socialLinks", "defaultCta"],
  placement: [...COMMON_EDITORIAL_FIELDS, "placements"],
  campaign: [
    ...COMMON_EDITORIAL_FIELDS,
    "campaignKind",
    "templateKey",
    "route",
    "window",
    "form",
    "tracking",
    "relations",
  ],
} as const;

function pickPublicPayloadFields(payload: JsonRecord, includeSearchMetadata: boolean): JsonRecord {
  const contentType = typeof payload.contentType === "string" ? payload.contentType : "";
  const fields = PUBLIC_PAYLOAD_FIELDS[contentType as keyof typeof PUBLIC_PAYLOAD_FIELDS];
  if (!fields) return {};
  const allowed = includeSearchMetadata ? [...fields, "search"] : fields;
  return Object.fromEntries(
    allowed
      .filter((field) => Object.prototype.hasOwnProperty.call(payload, field))
      .map((field) => [field, payload[field]]),
  );
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function internalProductValues(payload: JsonRecord) {
  const visibility = (payload.fieldVisibility ?? {}) as JsonRecord;
  const isInternal = (field: string, fallback: "public" | "internal" = "public") =>
    (visibility[field] ?? fallback) === "internal";
  const values = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value !== "string") return;
    const candidate = value.trim();
    const normalized = candidate.toLocaleLowerCase().replaceAll(/[-_]+/g, " ");
    if (
      candidate.length >= 3 &&
      !["a confirmar", "não informado", "nao informado", "não aplicável", "nao aplicavel", "n/a"].includes(
        normalized,
      )
    )
      values.add(candidate);
  };
  if (isInternal("brand")) Object.values(payload.brand ?? {}).forEach(add);
  if (isInternal("manufacturer", "internal")) Object.values(payload.manufacturer ?? {}).forEach(add);
  if (isInternal("productLine")) Object.values(payload.productLine ?? {}).forEach(add);
  if (isInternal("classification")) Object.values(payload.classification ?? {}).forEach(add);
  if (isInternal("function")) add(payload.function);
  if (isInternal("technology")) add(payload.technology);
  if (payload.controlledClassification) {
    if (isInternal("classification")) {
      add(payload.controlledClassification.productCategory?.label);
      add(payload.controlledClassification.applicationMagnitude?.label);
      add(payload.controlledClassification.installationOperation?.label);
      add(payload.controlledClassification.monitoredElement?.label);
    }
    if (isInternal("technology")) add(payload.controlledClassification.technology?.label);
  }
  for (const model of payload.models ?? []) {
    if (isInternal("commercialModel")) add(model.model);
    if (isInternal("manufacturerReference", "internal")) add(model.manufacturerReference);
    if (isInternal("sku", "internal")) {
      add(model.sku);
      for (const variant of model.variants ?? []) {
        add(variant.code);
        add(variant.sku);
      }
    }
  }
  for (const identifier of payload.externalIdentifiers ?? []) {
    if (identifier?.visibility !== "public") add(identifier?.value);
  }
  return [...values].sort((a, b) => b.length - a.length);
}

function redactInternalText(value: unknown, internalValues: string[]): unknown {
  if (typeof value === "string") {
    return internalValues.reduce(
      (text, internalValue) =>
        text.replace(new RegExp(escapeRegExp(internalValue), "giu"), "informação interna"),
      value,
    );
  }
  if (Array.isArray(value)) return value.map((entry) => redactInternalText(entry, internalValues));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonRecord).map(([key, entry]) => [
        key,
        redactInternalText(entry, internalValues),
      ]),
    );
  }
  return value;
}

export function projectPublicPayloadFields(
  payload: unknown,
  options: { includeSearchMetadata?: boolean } = {},
): JsonRecord {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};

  const source = structuredClone(payload) as JsonRecord;
  const safe = pickPublicPayloadFields(source, options.includeSearchMetadata === true);
  if (Array.isArray(safe.blocks)) {
    safe.blocks = safe.blocks.filter(
      (block) => block && typeof block === "object" && (block as JsonRecord).hidden !== true,
    );
  }
  if (Array.isArray(safe.documents)) {
    const documents: JsonRecord[] = safe.documents
      .filter(safeProductDocumentReference)
      .map((document: JsonRecord): JsonRecord => ({
        ...document,
        id: String(document.id).toLowerCase(),
      }));
    const documentIds = documents.map((document) => document.id);
    const collectionInvalid =
      safe.documents.length > 30 || new Set(documentIds).size !== documentIds.length;
    safe.documents = collectionInvalid
      ? []
      : documents.filter((document) => document.visibility === "public").flatMap((document) => {
        const {
          storagePath,
          sha256: _sha256,
          rightsConfirmed: _rightsConfirmed,
          ...publicDocument
        } = document as JsonRecord;
        return storagePath ? [publicDocument] : [];
      });
  }
  if (safe.contentType === "product") {
    const visibility = (source.fieldVisibility ?? {}) as JsonRecord;
    const internalValues = internalProductValues(source);
    const isInternal = (field: string, fallback: "public" | "internal" = "public") =>
      (visibility[field] ?? fallback) === "internal";
    const sourceModels: JsonRecord[] = Array.isArray(source.models) ? source.models : [];
    const publicOwnerLabel = (scope: unknown, ownerId: unknown): string | undefined => {
      if (scope === "model") {
        const modelIndex = sourceModels.findIndex(
          (model) =>
            typeof model.id === "string" && model.id.toLowerCase() === String(ownerId).toLowerCase(),
        );
        if (modelIndex < 0) return undefined;
        return isInternal("commercialModel") ? `Modelo ${modelIndex + 1}` : sourceModels[modelIndex]?.model;
      }
      if (scope === "variant") {
        const match = sourceModels
          .flatMap((model, modelIndex) =>
            (Array.isArray(model.variants) ? model.variants : []).map(
              (variant: JsonRecord, variantIndex: number) => ({
                model,
                modelIndex,
                variant,
                variantIndex,
              }),
            ),
          )
          .find(
            ({ variant }) =>
              typeof variant.id === "string" &&
              variant.id.toLowerCase() === String(ownerId).toLowerCase(),
          );
        if (!match) return undefined;
        const modelLabel = isInternal("commercialModel")
          ? `Modelo ${match.modelIndex + 1}`
          : match.model.model;
        return `${modelLabel} · Variante ${match.variantIndex + 1}: ${match.variant.name}`;
      }
      return undefined;
    };

    if (isInternal("brand")) delete safe.brand;
    if (isInternal("manufacturer", "internal")) delete safe.manufacturer;
    else if (safe.manufacturer?.officialUrl) {
      const officialUrl = publicHttpUrl(safe.manufacturer.officialUrl, true);
      if (officialUrl) safe.manufacturer.officialUrl = officialUrl;
      else delete safe.manufacturer.officialUrl;
    }
    if (isInternal("productLine")) delete safe.productLine;
    if (isInternal("classification")) delete safe.classification;
    if (isInternal("function")) delete safe.function;
    if (isInternal("technology")) delete safe.technology;
    if (safe.controlledClassification) {
      const publicRef = (reference: JsonRecord | undefined) =>
        reference?.publicVisible === false ? undefined : { slug: reference?.slug, label: reference?.label };
      const controlled = {
        ...(!isInternal("classification")
          ? {
              productCategory: publicRef(safe.controlledClassification.productCategory),
              applicationMagnitude: publicRef(safe.controlledClassification.applicationMagnitude),
              installationOperation: publicRef(safe.controlledClassification.installationOperation),
              monitoredElement: publicRef(safe.controlledClassification.monitoredElement),
            }
          : {}),
        ...(!isInternal("technology")
          ? { technology: publicRef(safe.controlledClassification.technology) }
          : {}),
      };
      safe.controlledClassification = Object.fromEntries(
        Object.entries(controlled).filter(([, reference]) => reference),
      );
      if (!Object.keys(safe.controlledClassification).length) delete safe.controlledClassification;
    }
    if (isInternal("specifications")) safe.specifications = [];
    else if (Array.isArray(safe.specifications)) {
      safe.specifications = safe.specifications
        .filter((specification: JsonRecord) => specification.homologated === true)
        .map((specification: JsonRecord) => {
          const scope = specification.scope ?? "product";
          const ownerLabel = publicOwnerLabel(scope, specification.ownerId);
          return {
            key: specification.key,
            label: specification.label,
            type: specification.type,
            value: specification.value,
            ...(specification.unit ? { unit: specification.unit } : {}),
            scope,
            ...(ownerLabel ? { ownerLabel } : {}),
            required: specification.required,
            filterable: specification.filterable,
            comparable: specification.comparable,
            searchable: specification.searchable,
          };
        });
    }
    if (Array.isArray(safe.externalIdentifiers)) {
      safe.externalIdentifiers = safe.externalIdentifiers
        .filter((identifier: JsonRecord) => identifier.visibility === "public")
        .map((identifier: JsonRecord) => {
          const ownerType = identifier.owner?.type ?? "product";
          const ownerLabel = publicOwnerLabel(ownerType, identifier.owner?.id);
          return {
            kind: identifier.kind,
            value: identifier.value,
            ...(identifier.issuer ? { issuer: identifier.issuer } : {}),
            ownerType,
            ...(ownerLabel ? { ownerLabel } : {}),
          };
        });
    }
    if (isInternal("relations")) safe.relations = undefined;
    if (isInternal("documents")) safe.documents = [];
    else if (Array.isArray(safe.documents)) {
      safe.documents = safe.documents.filter((document: JsonRecord) => {
        const sourceDocument = Array.isArray(source.documents)
          ? source.documents.find(
              (candidate: JsonRecord) =>
                typeof candidate?.id === "string" && candidate.id.toLowerCase() === document.id,
            )
          : undefined;
        const sourceText = [sourceDocument?.title, sourceDocument?.storagePath].filter(Boolean).join(" ");
        return !internalValues.some((internalValue) =>
          sourceText.toLocaleLowerCase().includes(internalValue.toLocaleLowerCase()),
        );
      });
    }
    if (Array.isArray(safe.models)) {
      safe.models = safe.models.map((model: JsonRecord) => {
        const publicModel = { ...model };
        if (isInternal("commercialModel")) delete publicModel.model;
        if (isInternal("manufacturerReference", "internal")) delete publicModel.manufacturerReference;
        if (isInternal("sku", "internal")) {
          delete publicModel.sku;
          publicModel.variants = (publicModel.variants ?? []).map((variant: JsonRecord) => {
            const publicVariant = { ...variant };
            delete publicVariant.code;
            delete publicVariant.sku;
            return publicVariant;
          });
        }
        return publicModel;
      });
    }
    if (safe.search) {
      const includesInternalValue = (entry: unknown) =>
        typeof entry === "string" &&
        internalValues.some((internalValue) => entry.toLocaleLowerCase().includes(internalValue.toLocaleLowerCase()));
      safe.search = {
        ...safe.search,
        synonyms: (safe.search.synonyms ?? []).filter((entry: unknown) => !includesInternalValue(entry)),
        keywords: (safe.search.keywords ?? []).filter((entry: unknown) => !includesInternalValue(entry)),
      };
    }
    const redacted = redactInternalText(safe, internalValues) as JsonRecord;
    if (!options.includeSearchMetadata) delete redacted.search;
    return redacted;
  }
  if (safe.contentType === "service" && safe.serviceKindRef) {
    if (safe.serviceKindRef.publicVisible === false) {
      delete safe.serviceKind;
      delete safe.serviceKindRef;
    } else {
      safe.serviceKindRef = { slug: safe.serviceKindRef.slug, label: safe.serviceKindRef.label };
    }
  }
  return safe;
}

export function sanitizePublicPayload(
  payload: unknown,
  options: { includeSearchMetadata?: boolean } = {},
): JsonRecord {
  try {
    const validated = CmsContentPayloadSchema.safeParse(
      omitLegacyExternalProductDocuments(payload),
    );
    return validated.success ? projectPublicPayloadFields(validated.data, options) : {};
  } catch {
    // A projecao publica nunca converte um payload legado/malformado em erro
    // 500 nem em exposicao parcial. O chamador descarta o registro vazio.
    return {};
  }
}

export function omitUnresolvedGovernedDocuments(
  publicPayload: JsonRecord,
  sourcePayload: JsonRecord,
  documentUrls: Record<string, string>,
): JsonRecord {
  if (!Array.isArray(publicPayload.documents)) return publicPayload;
  const governedDocumentIds = new Set(
    (Array.isArray(sourcePayload.documents) ? sourcePayload.documents : [])
      .filter(
        (document: unknown): document is JsonRecord =>
          Boolean(document) &&
          typeof document === "object" &&
          typeof (document as JsonRecord).id === "string" &&
          typeof (document as JsonRecord).storagePath === "string" &&
          (document as JsonRecord).storagePath.length > 0,
      )
      .map((document: JsonRecord) => (document.id as string).toLowerCase()),
  );
  return {
    ...publicPayload,
    documents: publicPayload.documents.filter(
      (document: JsonRecord) =>
        !governedDocumentIds.has(String(document.id).toLowerCase()) ||
        Boolean(documentUrls[String(document.id).toLowerCase()]),
    ),
  };
}

export function sanitizePublicSeo(seo: unknown, payload: unknown): JsonRecord {
  if (!seo || typeof seo !== "object" || Array.isArray(seo)) return {};
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return structuredClone(seo) as JsonRecord;
  const record = payload as JsonRecord;
  if (record.contentType !== "product") return structuredClone(seo) as JsonRecord;
  return redactInternalText(structuredClone(seo), internalProductValues(record)) as JsonRecord;
}

export function containsInternalProductValue(value: unknown, payload: unknown): boolean {
  if (typeof value !== "string" || !payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const record = payload as JsonRecord;
  if (record.contentType !== "product") return false;
  const normalized = value.toLocaleLowerCase();
  return internalProductValues(record).some((internalValue) =>
    normalized.includes(internalValue.toLocaleLowerCase()),
  );
}
