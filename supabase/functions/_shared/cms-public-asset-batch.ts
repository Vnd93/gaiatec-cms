type DocumentReference = {
  id?: unknown;
  storagePath?: unknown;
  kind?: unknown;
  title?: unknown;
  sha256?: unknown;
  revision?: unknown;
  language?: unknown;
  visibility?: unknown;
  rightsConfirmed?: unknown;
  [key: string]: unknown;
};

export type PublicAssetBatchRequest = {
  assetIds: unknown[];
  primaryId?: unknown;
  documents: DocumentReference[];
};

export type PublicAssetBatchResult = {
  mediaUrls: Record<string, string>;
  mediaAlt: Record<string, string>;
  documentUrls: Record<string, string>;
};

// A validated product/discovery payload may contain 80 galleries with 30
// assets, 30 top-level media entries and one social image. The response-wide
// ceiling therefore covers one complete detail payload, while list endpoints
// deliberately request only the primary card image. Resolver chunks remain
// small enough that six governed variants per asset stay below the per-query
// variant ceiling.
export const PUBLIC_MEDIA_REFERENCE_LIMIT = 2_431;
export const PUBLIC_MEDIA_RESOLUTION_CHUNK_LIMIT = 300;
export const PUBLIC_DOCUMENT_REFERENCE_LIMIT = 200;
export const PUBLIC_MEDIA_VARIANT_LIMIT = 2_000;
export const PUBLIC_ASSET_CHUNK_CONCURRENCY = 3;

type BatchDependencies = {
  resolveMedia: (
    assetIds: string[],
    limits: { maxAssets: number; maxVariants: number },
  ) => Promise<{ mediaUrls: Record<string, string>; mediaAlt: Record<string, string> }>;
  resolveDocuments: (
    documents: DocumentReference[],
    limits: { maxDocuments: number },
  ) => Promise<Record<string, string>>;
};

const mediaUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function canonicalMediaId(value: unknown): string | null {
  return typeof value === "string" && mediaUuidPattern.test(value) ? value.toLowerCase() : null;
}

function uniqueMediaIds(values: unknown[]): string[] {
  return [...new Set(values.flatMap((value) => canonicalMediaId(value) ?? []))];
}

function documentIdentity(document: DocumentReference): string | null {
  if (typeof document.id !== "string" || typeof document.storagePath !== "string") return null;
  return JSON.stringify([
    document.id.toLowerCase(),
    document.storagePath,
    document.kind,
    document.title,
    document.sha256,
    document.revision,
    document.language,
    document.visibility,
    document.rightsConfirmed,
  ]);
}

function uniqueDocuments(requests: PublicAssetBatchRequest[]): {
  documents: DocumentReference[];
  identityById: Map<string, string>;
} {
  const documents = new Map<string, DocumentReference>();
  const identityById = new Map<string, string>();
  const conflictedIds = new Set<string>();
  for (const document of requests.flatMap((request) => request.documents)) {
    const identity = documentIdentity(document);
    if (!identity || typeof document.id !== "string") continue;
    const id = document.id.toLowerCase();
    const priorIdentity = identityById.get(id);
    if (priorIdentity && priorIdentity !== identity) {
      conflictedIds.add(id);
      continue;
    }
    identityById.set(id, identity);
    documents.set(identity, { ...document, id });
  }
  for (const id of conflictedIds) identityById.delete(id);
  return {
    documents: [...documents.values()].filter(
      (document) =>
        typeof document.id === "string" && !conflictedIds.has(document.id.toLowerCase()),
    ),
    identityById,
  };
}

function chunkValues<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
  return chunks;
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const consume = async () => {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await worker(values[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => consume()));
  return results;
}

type AssetResolutionChunk =
  { kind: "media"; assetIds: string[] } | { kind: "documents"; documents: DocumentReference[] };

type AssetResolutionChunkResult =
  | {
      kind: "media";
      value: { mediaUrls: Record<string, string>; mediaAlt: Record<string, string> };
    }
  | { kind: "documents"; value: Record<string, string> };

export async function resolvePublicAssetBatch(
  requests: PublicAssetBatchRequest[],
  dependencies: BatchDependencies,
): Promise<PublicAssetBatchResult[]> {
  const assetIds = uniqueMediaIds(requests.flatMap((request) => request.assetIds));
  const documentBatch = uniqueDocuments(requests);
  // These are response-wide budgets, not chunk sizes. Reject before invoking a
  // resolver so an oversized public response cannot partially sign assets or
  // amplify one request into an arbitrary number of database round trips.
  if (assetIds.length > PUBLIC_MEDIA_REFERENCE_LIMIT)
    throw new Error("CMS_PUBLIC_MEDIA_REFERENCE_LIMIT_EXCEEDED");
  if (documentBatch.documents.length > PUBLIC_DOCUMENT_REFERENCE_LIMIT)
    throw new Error("CMS_PUBLIC_DOCUMENT_REFERENCE_LIMIT_EXCEEDED");
  const chunks: AssetResolutionChunk[] = [
    ...chunkValues(assetIds, PUBLIC_MEDIA_RESOLUTION_CHUNK_LIMIT).map((assetIds) => ({
      kind: "media" as const,
      assetIds,
    })),
    ...chunkValues(documentBatch.documents, PUBLIC_DOCUMENT_REFERENCE_LIMIT).map((documents) => ({
      kind: "documents" as const,
      documents,
    })),
  ];
  const chunkResults = await mapWithConcurrency<AssetResolutionChunk, AssetResolutionChunkResult>(
    chunks,
    PUBLIC_ASSET_CHUNK_CONCURRENCY,
    async (chunk) => {
      if (chunk.kind === "media") {
        return {
          kind: "media",
          value: await dependencies.resolveMedia(chunk.assetIds, {
            maxAssets: PUBLIC_MEDIA_RESOLUTION_CHUNK_LIMIT,
            maxVariants: PUBLIC_MEDIA_VARIANT_LIMIT,
          }),
        };
      }
      return {
        kind: "documents",
        value: await dependencies.resolveDocuments(chunk.documents, {
          maxDocuments: PUBLIC_DOCUMENT_REFERENCE_LIMIT,
        }),
      };
    },
  );
  const media = {
    mediaUrls: {} as Record<string, string>,
    mediaAlt: {} as Record<string, string>,
  };
  const documentUrls: Record<string, string> = {};
  for (const result of chunkResults) {
    if (result.kind === "media") {
      Object.assign(media.mediaUrls, result.value.mediaUrls);
      Object.assign(media.mediaAlt, result.value.mediaAlt);
    } else {
      Object.assign(documentUrls, result.value);
    }
  }
  const mediaUrlsByAsset = new Map<string, Record<string, string>>();
  for (const [key, value] of Object.entries(media.mediaUrls)) {
    const separator = key.indexOf(":");
    if (separator <= 0) continue;
    const assetId = canonicalMediaId(key.slice(0, separator));
    if (!assetId) continue;
    const variant = key.slice(separator + 1);
    const urls = mediaUrlsByAsset.get(assetId) ?? {};
    urls[variant] = value;
    mediaUrlsByAsset.set(assetId, urls);
  }

  const mediaAltByAsset = new Map(
    Object.entries(media.mediaAlt).flatMap(([id, alt]) => {
      const canonical = canonicalMediaId(id);
      return canonical ? [[canonical, alt] as const] : [];
    }),
  );

  return requests.map((request) => {
    const requestAssetIds = uniqueMediaIds(request.assetIds);
    const primaryId = canonicalMediaId(request.primaryId) ?? undefined;
    const mediaUrls: Record<string, string> = {};
    const mediaAlt: Record<string, string> = {};
    for (const assetId of requestAssetIds) {
      const variants = mediaUrlsByAsset.get(assetId) ?? {};
      for (const [variant, url] of Object.entries(variants)) {
        mediaUrls[`${assetId}:${variant}`] = url;
        if (assetId === primaryId) mediaUrls[variant] = url;
      }
      const alt = mediaAltByAsset.get(assetId);
      if (alt) mediaAlt[assetId] = alt;
    }
    const requestDocumentIds = new Set(
      request.documents
        .filter(
          (document): document is DocumentReference & { id: string; storagePath: string } =>
            typeof document.id === "string" &&
            typeof document.storagePath === "string" &&
            documentBatch.identityById.get(document.id.toLowerCase()) === documentIdentity(document),
        )
        .map((document) => document.id.toLowerCase()),
    );
    return {
      mediaUrls,
      mediaAlt,
      documentUrls: Object.fromEntries(
        Object.entries(documentUrls).filter(([id]) => requestDocumentIds.has(id)),
      ),
    };
  });
}
