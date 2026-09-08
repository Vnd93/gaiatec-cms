type DocumentReference = {
  id?: unknown;
  kind?: unknown;
  title?: unknown;
  storagePath?: unknown;
  sha256?: unknown;
  revision?: unknown;
  language?: unknown;
  visibility?: unknown;
  rightsConfirmed?: unknown;
};

type DocumentAsset = {
  id: string;
  storage_path: string;
  kind: string;
  title: string;
  sha256: string;
  revision: string;
  language: string;
  visibility: string;
  rights_confirmed: boolean;
  processing_status: string;
  scan_status: string;
  scan_engine: string | null;
  source_kind: string;
  synthetic_expires_at: string | null;
  archived_at: string | null;
};

export type DocumentResolutionClient = {
  from(table: string): {
    select(columns: string): {
      in(
        column: string,
        values: string[],
      ): {
        limit(count: number): PromiseLike<{ data: unknown[] | null; error: unknown }>;
      };
    };
  };
  storage: {
    from(bucket: string): {
      createSignedUrls(
        paths: string[],
        expiresIn: number,
        options?: { download?: boolean | string },
      ): Promise<{ data: Array<{ signedUrl?: string | null }> | null; error: unknown }>;
    };
  };
};

const documentUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function canonicalDocumentId(value: unknown): string | null {
  return typeof value === "string" && documentUuidPattern.test(value) ? value.toLowerCase() : null;
}

function matchesGovernedAsset(reference: DocumentReference, asset: DocumentAsset): boolean {
  return (
    canonicalDocumentId(asset.id) === canonicalDocumentId(reference.id) &&
    asset.storage_path === reference.storagePath &&
    asset.kind === reference.kind &&
    asset.title === reference.title &&
    asset.sha256 === reference.sha256 &&
    asset.revision === reference.revision &&
    asset.language === String(reference.language ?? "").toLowerCase() &&
    asset.visibility === reference.visibility &&
    asset.rights_confirmed === true &&
    reference.rightsConfirmed === true &&
    asset.processing_status === "ready" &&
    asset.scan_status === "clean" &&
    (asset.source_kind === "synthetic_test"
      ? asset.scan_engine === "qa-synthetic-attestation-v1" &&
        typeof asset.synthetic_expires_at === "string" &&
        Date.parse(asset.synthetic_expires_at) > Date.now()
      : asset.scan_engine !== "qa-synthetic-attestation-v1") &&
    asset.archived_at === null
  );
}

export async function resolveDocumentAssets(
  client: DocumentResolutionClient,
  references: DocumentReference[],
  destination: "validated" | number,
  limits: { maxDocuments?: number } = {},
): Promise<Record<string, string>> {
  const candidatesByIdentity = new Map<string, DocumentReference & { id: string; storagePath: string }>();
  for (const reference of references) {
    const id = canonicalDocumentId(reference.id);
    const storagePath = typeof reference.storagePath === "string" ? reference.storagePath : "";
    if (
      !id ||
      !/^cms-documents\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+\.pdf$/.test(storagePath) ||
      storagePath.split("/")[1]?.toLowerCase() !== id
    )
      continue;
    const normalized = { ...reference, id, storagePath };
    candidatesByIdentity.set(`${id}\0${storagePath}`, normalized);
  }
  const candidates = [...candidatesByIdentity.values()];
  if (!candidates.length) return {};
  const maxDocuments = limits.maxDocuments ?? 1_000;
  if (candidates.length > maxDocuments) throw new Error("CMS_DOCUMENT_REFERENCE_LIMIT_EXCEEDED");
  const { data, error } = await client
    .from("cms_document_assets")
    .select(
      "id,storage_path,kind,title,sha256,revision,language,visibility,rights_confirmed,processing_status,scan_status,scan_engine,source_kind,synthetic_expires_at,archived_at",
    )
    .in(
      "id",
      candidates.map((document) => document.id),
    )
    .limit(maxDocuments + 1);
  if (error) throw error;
  if (!data?.length) return {};
  if (data.length > maxDocuments) throw new Error("CMS_DOCUMENT_RESULT_LIMIT_EXCEEDED");
  const assets = new Map(
    (data as DocumentAsset[]).flatMap((asset) => {
      const id = canonicalDocumentId(asset.id);
      return id ? [[id, asset] as const] : [];
    }),
  );
  const valid = candidates.filter((reference) => {
    const asset = assets.get(reference.id);
    return asset ? matchesGovernedAsset(reference, asset) : false;
  });
  if (!valid.length) return {};
  if (typeof destination === "number") {
    const paths = [...new Set(valid.map((document) => document.storagePath))];
    const signed = await client.storage
      .from("cms-documents-private")
      .createSignedUrls(paths, destination, { download: true });
    if (signed.error) throw signed.error;
    const signedByPath = new Map(
      paths.map((path, index) => [path, signed.data?.[index]?.signedUrl] as const),
    );
    return Object.fromEntries(
      valid.flatMap((document) => {
        const signedUrl = signedByPath.get(document.storagePath);
        return signedUrl ? [[document.id, signedUrl]] : [];
      }),
    );
  }
  return Object.fromEntries(valid.map((document) => [document.id, destination]));
}
