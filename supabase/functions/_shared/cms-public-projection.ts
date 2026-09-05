type JsonRecord = Record<string, any>;

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
      for (const variant of model.variants ?? []) add(variant.code);
    }
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

export function sanitizePublicPayload(
  payload: unknown,
  options: { includeSearchMetadata?: boolean } = {},
): JsonRecord {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};

  const safe = structuredClone(payload) as JsonRecord;
  if (Array.isArray(safe.blocks)) {
    safe.blocks = safe.blocks.filter(
      (block) => !block || typeof block !== "object" || (block as JsonRecord).hidden !== true,
    );
  }
  if (Array.isArray(safe.documents)) {
    safe.documents = safe.documents
      .filter(
        (document) =>
          document && typeof document === "object" && (document as JsonRecord).visibility === "public",
      )
      .map((document) => {
        const {
          storagePath: _storagePath,
          sha256: _sha256,
          rightsConfirmed: _rightsConfirmed,
          ...publicDocument
        } = document as JsonRecord;
        return publicDocument;
      });
  }
  if (safe.contentType === "product") {
    const visibility = (safe.fieldVisibility ?? {}) as JsonRecord;
    const internalValues = internalProductValues(safe);
    const isInternal = (field: string, fallback: "public" | "internal" = "public") =>
      (visibility[field] ?? fallback) === "internal";

    if (isInternal("brand")) delete safe.brand;
    if (isInternal("manufacturer", "internal")) delete safe.manufacturer;
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
    if (isInternal("relations")) safe.relations = undefined;
    if (isInternal("documents")) safe.documents = [];
    else if (Array.isArray(safe.documents)) {
      safe.documents = safe.documents.filter((document: JsonRecord) => {
        const sourceDocument = (payload as JsonRecord).documents?.find(
          (candidate: JsonRecord) => candidate.id === document.id,
        );
        const source = [sourceDocument?.title, sourceDocument?.storagePath].filter(Boolean).join(" ");
        return !internalValues.some((internalValue) =>
          source.toLocaleLowerCase().includes(internalValue.toLocaleLowerCase()),
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
            return publicVariant;
          });
        }
        return publicModel;
      });
    }
    delete safe.provenance;
    delete safe.approval;
    delete safe.redirects;
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
    delete safe.fieldVisibility;
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
