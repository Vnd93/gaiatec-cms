export type StorageRemovalError =
  | "storage_remove_failed"
  | "storage_verify_failed"
  | "storage_residue";
export type StorageRetirementError = "storage_guard_failed" | "storage_guard_verify_failed";

// Um PDF passivo e sem dados do usuario permanece no caminho temporario ate a
// expiracao do token. Como o token foi emitido com upsert=false, a existencia
// continua do objeto impede sua reutilizacao sem abrir uma janela delete/insert.
export const SIGNED_UPLOAD_GUARD_BYTES = new TextEncoder().encode(
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n",
);

type StorageObject = { name: string };
type StorageOperation<T> = Promise<{ data: T | null; error: unknown }>;
export type StorageRemovalClient = {
  storage: {
    from(bucket: string): {
      list(
        prefix: string,
        options: { limit: number; search: string },
      ): StorageOperation<StorageObject[]>;
      remove(paths: string[]): StorageOperation<unknown[]>;
      upload(
        path: string,
        body: Uint8Array,
        options: { contentType: string; cacheControl: string; upsert: boolean },
      ): StorageOperation<unknown>;
      download(path: string): StorageOperation<Blob>;
    };
  };
};

const mediaStoragePath =
  /^cms\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/(?:original\.(?:png|jpg|webp|avif)|(?:thumbnail|medium|large)\.(?:webp|avif))$/;

export function isExactMediaStoragePath(storagePath: string): boolean {
  return mediaStoragePath.test(storagePath);
}

export async function exactMediaStorageObjectPresent(
  client: StorageRemovalClient,
  storagePath: string,
): Promise<boolean> {
  const match = mediaStoragePath.exec(storagePath);
  if (!match) throw new Error("storage_verify_failed");
  const separator = storagePath.lastIndexOf("/");
  const prefix = storagePath.slice(0, separator);
  const filename = storagePath.slice(separator + 1);
  const inspected = await client.storage
    .from("cms-media-private")
    .list(prefix, { limit: 8, search: filename });
  if (inspected.error) throw new Error("storage_verify_failed");
  return (inspected.data ?? []).some((object) => object.name === filename);
}

export async function removeAndVerifyMediaStorageObject(
  client: StorageRemovalClient,
  storagePath: string,
): Promise<StorageRemovalError | null> {
  let present: boolean;
  try {
    present = await exactMediaStorageObjectPresent(client, storagePath);
  } catch {
    return "storage_verify_failed";
  }
  if (present) {
    const removed = await client.storage.from("cms-media-private").remove([storagePath]);
    if (removed.error) return "storage_remove_failed";
  }
  try {
    return (await exactMediaStorageObjectPresent(client, storagePath)) ? "storage_residue" : null;
  } catch {
    return "storage_verify_failed";
  }
}

export async function exactStorageObjectPresent(
  client: StorageRemovalClient,
  storagePath: string,
): Promise<boolean> {
  const separator = storagePath.lastIndexOf("/");
  if (
    separator <= 0 ||
    !/^cms-document(?:s|-uploads)\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+\.pdf$/.test(storagePath)
  )
    throw new Error("storage_verify_failed");
  const prefix = storagePath.slice(0, separator);
  const filename = storagePath.slice(separator + 1);
  const inspected = await client.storage
    .from("cms-documents-private")
    .list(prefix, { limit: 100, search: filename });
  if (inspected.error) throw new Error("storage_verify_failed");
  return (inspected.data ?? []).some((object) => object.name === filename);
}

export async function retireSignedUploadObject(
  client: StorageRemovalClient,
  uploadPath: string,
): Promise<StorageRetirementError | null> {
  if (!/^cms-document-uploads\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+\.pdf$/.test(uploadPath))
    return "storage_guard_verify_failed";
  const bucket = client.storage.from("cms-documents-private");
  const guarded = await bucket.upload(uploadPath, SIGNED_UPLOAD_GUARD_BYTES, {
    contentType: "application/pdf",
    cacheControl: "no-store",
    upsert: true,
  });
  if (guarded.error) return "storage_guard_failed";
  const observed = await bucket.download(uploadPath);
  if (observed.error || !observed.data) return "storage_guard_verify_failed";
  const bytes = new Uint8Array(await observed.data.arrayBuffer());
  if (
    bytes.byteLength !== SIGNED_UPLOAD_GUARD_BYTES.byteLength ||
    bytes.some((value, index) => value !== SIGNED_UPLOAD_GUARD_BYTES[index])
  )
    return "storage_guard_verify_failed";
  return null;
}

export async function removeAndVerifyStorageObject(
  client: StorageRemovalClient,
  storagePath: string,
): Promise<StorageRemovalError | null> {
  let present: boolean;
  try {
    present = await exactStorageObjectPresent(client, storagePath);
  } catch {
    return "storage_verify_failed";
  }
  if (present) {
    const removed = await client.storage
      .from("cms-documents-private")
      .remove([storagePath]);
    if (removed.error) return "storage_remove_failed";
  }
  try {
    return (await exactStorageObjectPresent(client, storagePath)) ? "storage_residue" : null;
  } catch {
    return "storage_verify_failed";
  }
}
