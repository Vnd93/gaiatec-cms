import { describe, expect, it, vi } from "vitest";

import {
  isExactMediaStoragePath,
  removeAndVerifyMediaStorageObject,
  removeAndVerifyStorageObject,
  retireSignedUploadObject,
  SIGNED_UPLOAD_GUARD_BYTES,
} from "../../supabase/functions/_shared/cms-storage-removal";

const storagePath = "cms-documents/57000000-0000-4000-8000-000000000001/manual.pdf";

function client(
  lists: Array<{ data: Array<{ name: string }> | null; error: unknown }>,
  removal: { data: unknown[] | null; error: unknown } = { data: [], error: null },
) {
  const list = vi.fn(async () => lists.shift() ?? { data: [], error: null });
  const remove = vi.fn(async () => removal);
  const upload = vi.fn(async () => ({ data: {}, error: null }));
  const download = vi.fn(async () => ({
    data: new Blob([SIGNED_UPLOAD_GUARD_BYTES], { type: "application/pdf" }),
    error: null,
  }));
  return {
    value: { storage: { from: vi.fn(() => ({ list, remove, upload, download })) } },
    list,
    remove,
    upload,
    download,
  };
}

describe("governed Storage removal", () => {
  it("removes an exact object and confirms absence with a successful listing", async () => {
    const fixture = client([
      { data: [{ name: "manual.pdf" }], error: null },
      { data: [], error: null },
    ]);

    await expect(removeAndVerifyStorageObject(fixture.value, storagePath)).resolves.toBeNull();
    expect(fixture.remove).toHaveBeenCalledWith([storagePath]);
  });

  it("atomically replaces a temporary upload with a verified passive guard", async () => {
    const fixture = client([]);
    const uploadPath = "cms-document-uploads/57000000-0000-4000-8000-000000000001/manual.pdf";

    await expect(retireSignedUploadObject(fixture.value, uploadPath)).resolves.toBeNull();
    expect(fixture.upload).toHaveBeenCalledWith(uploadPath, SIGNED_UPLOAD_GUARD_BYTES, {
      contentType: "application/pdf",
      cacheControl: "no-store",
      upsert: true,
    });
    expect(fixture.download).toHaveBeenCalledWith(uploadPath);
  });

  it("confirms an already absent object without issuing a delete", async () => {
    const fixture = client([
      { data: [], error: null },
      { data: [], error: null },
    ]);

    await expect(removeAndVerifyStorageObject(fixture.value, storagePath)).resolves.toBeNull();
    expect(fixture.remove).not.toHaveBeenCalled();
  });

  it("never treats a Storage 5xx or timeout as proof of absence", async () => {
    const fixture = client([{ data: null, error: new Error("storage unavailable") }]);

    await expect(removeAndVerifyStorageObject(fixture.value, storagePath)).resolves.toBe(
      "storage_verify_failed",
    );
    expect(fixture.remove).not.toHaveBeenCalled();
  });

  it("reports delete failures and retained exact objects", async () => {
    const failedDelete = client([{ data: [{ name: "manual.pdf" }], error: null }], {
      data: null,
      error: new Error("delete failed"),
    });
    await expect(removeAndVerifyStorageObject(failedDelete.value, storagePath)).resolves.toBe(
      "storage_remove_failed",
    );

    const residue = client([
      { data: [{ name: "manual.pdf" }], error: null },
      { data: [{ name: "manual.pdf" }], error: null },
    ]);
    await expect(removeAndVerifyStorageObject(residue.value, storagePath)).resolves.toBe("storage_residue");
  });

  it("removes only exact media-generation paths from the private media bucket", async () => {
    const mediaPath = "cms/57000000-0000-4000-8000-000000000001/thumbnail.webp";
    const fixture = client([
      { data: [{ name: "thumbnail.webp" }], error: null },
      { data: [], error: null },
    ]);

    await expect(removeAndVerifyMediaStorageObject(fixture.value, mediaPath)).resolves.toBeNull();
    expect(fixture.value.storage.from).toHaveBeenCalledWith("cms-media-private");
    expect(fixture.remove).toHaveBeenCalledWith([mediaPath]);
    expect(isExactMediaStoragePath(mediaPath)).toBe(true);
  });

  it("is idempotent if an object reappears before a later governed sweep", async () => {
    const mediaPath = "cms/57000000-0000-4000-8000-000000000001/medium.avif";
    const fixture = client([
      { data: [{ name: "medium.avif" }], error: null },
      { data: [], error: null },
      { data: [{ name: "medium.avif" }], error: null },
      { data: [], error: null },
    ]);

    await expect(removeAndVerifyMediaStorageObject(fixture.value, mediaPath)).resolves.toBeNull();
    await expect(removeAndVerifyMediaStorageObject(fixture.value, mediaPath)).resolves.toBeNull();
    expect(fixture.remove).toHaveBeenCalledTimes(2);
  });

  it("fails closed before Storage when a media path is not an exact governed slot", async () => {
    const fixture = client([]);
    const foreign = "cms/57000000-0000-4000-8000-000000000001/../../foreign.png";

    await expect(removeAndVerifyMediaStorageObject(fixture.value, foreign)).resolves.toBe(
      "storage_verify_failed",
    );
    expect(fixture.value.storage.from).not.toHaveBeenCalled();
    expect(isExactMediaStoragePath(foreign)).toBe(false);
  });
});
