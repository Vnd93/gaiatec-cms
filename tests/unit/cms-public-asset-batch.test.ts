import { describe, expect, it, vi } from "vitest";

import {
  PUBLIC_ASSET_CHUNK_CONCURRENCY,
  PUBLIC_DOCUMENT_REFERENCE_LIMIT,
  PUBLIC_MEDIA_REFERENCE_LIMIT,
  PUBLIC_MEDIA_RESOLUTION_CHUNK_LIMIT,
  resolvePublicAssetBatch,
} from "../../supabase/functions/_shared/cms-public-asset-batch";

const assetId = (index: number) => `81000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const documentId = (index: number) => `82000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

describe("cms-public batched asset resolution", () => {
  it("resolves an unfiltered 100-item collection with one media and one document call", async () => {
    const requests = Array.from({ length: 100 }, (_, index) => ({
      assetIds: [assetId(index)],
      primaryId: assetId(index),
      documents: [
        {
          id: documentId(index),
          storagePath: `cms-documents/${documentId(index)}/file.pdf`,
        },
      ],
    }));
    const resolveMedia = vi.fn(async (assetIds: string[]) => ({
      mediaUrls: Object.fromEntries(assetIds.map((id) => [`${id}:card.webp`, `https://media/${id}`])),
      mediaAlt: Object.fromEntries(assetIds.map((id) => [id, `Alt ${id}`])),
    }));
    const resolveDocuments = vi.fn(async (documents: Array<{ id?: unknown }>) =>
      Object.fromEntries(documents.map((document) => [String(document.id), `https://docs/${document.id}`])),
    );

    const result = await resolvePublicAssetBatch(requests, { resolveMedia, resolveDocuments });

    expect(resolveMedia).toHaveBeenCalledTimes(1);
    expect(resolveDocuments).toHaveBeenCalledTimes(1);
    expect(resolveMedia.mock.calls[0][0]).toHaveLength(100);
    expect(resolveDocuments.mock.calls[0][0]).toHaveLength(100);
    expect(result).toHaveLength(100);
    expect(result[37]).toEqual({
      mediaUrls: {
        [`${assetId(37)}:card.webp`]: `https://media/${assetId(37)}`,
        "card.webp": `https://media/${assetId(37)}`,
      },
      mediaAlt: { [assetId(37)]: `Alt ${assetId(37)}` },
      documentUrls: { [documentId(37)]: `https://docs/${documentId(37)}` },
    });
  });

  it("rejects response-wide media and document overflow before invoking a resolver", async () => {
    const resolveMedia = vi.fn(async (_ids: string[]) => ({ mediaUrls: {}, mediaAlt: {} }));
    const resolveDocuments = vi.fn(async (_refs: Array<{ id?: unknown }>) => ({}));
    const mediaOverflow = Array.from({ length: PUBLIC_MEDIA_REFERENCE_LIMIT + 1 }, (_, index) =>
      assetId(index),
    );
    const documentOverflow = Array.from({ length: PUBLIC_DOCUMENT_REFERENCE_LIMIT + 1 }, (_, index) => ({
      id: documentId(index),
      storagePath: `cms-documents/${documentId(index)}/file.pdf`,
    }));

    await expect(
      resolvePublicAssetBatch([{ assetIds: mediaOverflow, documents: [] }], {
        resolveMedia,
        resolveDocuments,
      }),
    ).rejects.toThrow("CMS_PUBLIC_MEDIA_REFERENCE_LIMIT_EXCEEDED");
    await expect(
      resolvePublicAssetBatch([{ assetIds: [], documents: documentOverflow }], {
        resolveMedia,
        resolveDocuments,
      }),
    ).rejects.toThrow("CMS_PUBLIC_DOCUMENT_REFERENCE_LIMIT_EXCEEDED");
    expect(resolveMedia).not.toHaveBeenCalled();
    expect(resolveDocuments).not.toHaveBeenCalled();
  });

  it("deduplicates shared references before the bounded resolver calls", async () => {
    const resolveMedia = vi.fn(async (_assetIds: string[]) => ({ mediaUrls: {}, mediaAlt: {} }));
    const resolveDocuments = vi.fn(async (_documents: Array<{ id?: unknown }>) => ({}));
    const sharedDocument = {
      id: documentId(1),
      storagePath: `cms-documents/${documentId(1)}/file.pdf`,
    };

    await resolvePublicAssetBatch(
      [
        { assetIds: [assetId(1), assetId(1)], documents: [sharedDocument] },
        { assetIds: [assetId(1)], documents: [sharedDocument] },
      ],
      { resolveMedia, resolveDocuments },
    );

    expect(resolveMedia.mock.calls[0][0]).toEqual([assetId(1)]);
    expect(resolveDocuments.mock.calls[0][0]).toEqual([sharedDocument]);
  });

  it("shares one governed URL across versioned display titles", async () => {
    const resolveMedia = vi.fn(async () => ({ mediaUrls: {}, mediaAlt: {} }));
    const resolveDocuments = vi.fn(async (documents: Array<{ id?: unknown }>) =>
      Object.fromEntries(documents.map((document) => [String(document.id), "https://docs/shared"])),
    );
    const governed = {
      id: documentId(7),
      storagePath: `cms-documents/${documentId(7)}/file.pdf`,
      kind: "manual",
      title: "Título atual",
      sha256: "a".repeat(64),
      revision: "1",
      language: "pt-br",
      visibility: "public",
      rightsConfirmed: true,
    };

    const result = await resolvePublicAssetBatch(
      [
        { assetIds: [], documents: [governed] },
        { assetIds: [], documents: [{ ...governed, title: "Título da revisão anterior" }] },
      ],
      { resolveMedia, resolveDocuments },
    );

    expect(resolveDocuments).toHaveBeenCalledTimes(1);
    expect(resolveDocuments.mock.calls[0][0]).toHaveLength(1);
    expect(result.map(({ documentUrls }) => documentUrls)).toEqual([
      { [governed.id]: "https://docs/shared" },
      { [governed.id]: "https://docs/shared" },
    ]);
  });

  it("deduplicates references before enforcing the response-wide budget", async () => {
    const uniqueAssets = Array.from({ length: PUBLIC_MEDIA_REFERENCE_LIMIT }, (_, index) => assetId(index));
    const uniqueDocuments = Array.from({ length: PUBLIC_DOCUMENT_REFERENCE_LIMIT }, (_, index) => ({
      id: documentId(index),
      storagePath: `cms-documents/${documentId(index)}/file.pdf`,
    }));
    const resolveMedia = vi.fn(async (_assetIds: string[]) => ({ mediaUrls: {}, mediaAlt: {} }));
    const resolveDocuments = vi.fn(async (_documents: Array<{ id?: unknown }>) => ({}));

    await resolvePublicAssetBatch(
      [
        { assetIds: [...uniqueAssets, ...uniqueAssets], documents: [...uniqueDocuments, ...uniqueDocuments] },
        { assetIds: uniqueAssets, documents: uniqueDocuments },
      ],
      { resolveMedia, resolveDocuments },
    );

    expect(resolveMedia.mock.calls.flatMap(([ids]) => ids)).toHaveLength(PUBLIC_MEDIA_REFERENCE_LIMIT);
    expect(resolveMedia.mock.calls.every(([ids]) => ids.length <= PUBLIC_MEDIA_RESOLUTION_CHUNK_LIMIT)).toBe(
      true,
    );
    expect(resolveDocuments.mock.calls.map(([refs]) => refs.length)).toEqual([
      PUBLIC_DOCUMENT_REFERENCE_LIMIT,
    ]);
  });

  it("canonicalizes UUID media references before budgeting, resolving and mapping results", async () => {
    const canonical = assetId(42);
    const resolveMedia = vi.fn(async (assetIds: string[]) => ({
      mediaUrls: Object.fromEntries(assetIds.map((id) => [`${id}:card.webp`, `https://media/${id}`])),
      mediaAlt: Object.fromEntries(assetIds.map((id) => [id, `Alt ${id}`])),
    }));
    const resolveDocuments = vi.fn(async () => ({}));

    const result = await resolvePublicAssetBatch(
      [
        { assetIds: [canonical], primaryId: canonical, documents: [] },
        { assetIds: [canonical.toUpperCase()], primaryId: canonical.toUpperCase(), documents: [] },
      ],
      { resolveMedia, resolveDocuments },
    );

    expect(resolveMedia).toHaveBeenCalledTimes(1);
    expect(resolveMedia.mock.calls[0][0]).toEqual([canonical]);
    expect(result[0]).toEqual(result[1]);
    expect(result[1].mediaUrls).toEqual({
      [`${canonical}:card.webp`]: `https://media/${canonical}`,
      "card.webp": `https://media/${canonical}`,
    });
  });

  it("fails closed for a document id associated with conflicting storage paths", async () => {
    const resolveMedia = vi.fn(async () => ({ mediaUrls: {}, mediaAlt: {} }));
    const resolveDocuments = vi.fn(async (documents: Array<{ id?: unknown }>) =>
      Object.fromEntries(documents.map((document) => [String(document.id), "https://docs/unexpected"])),
    );

    const result = await resolvePublicAssetBatch(
      [
        {
          assetIds: [],
          documents: [{ id: "document-shared", storagePath: "cms-documents/one/file.pdf" }],
        },
        {
          assetIds: [],
          documents: [{ id: "document-shared", storagePath: "cms-documents/two/file.pdf" }],
        },
      ],
      { resolveMedia, resolveDocuments },
    );

    expect(resolveDocuments).not.toHaveBeenCalled();
    expect(result).toEqual([
      { mediaUrls: {}, mediaAlt: {}, documentUrls: {} },
      { mediaUrls: {}, mediaAlt: {}, documentUrls: {} },
    ]);
  });

  it("fails closed when the same document id and path carry conflicting governed metadata", async () => {
    const resolveMedia = vi.fn(async () => ({ mediaUrls: {}, mediaAlt: {} }));
    const resolveDocuments = vi.fn(async () => ({ "document-shared": "https://docs/unexpected" }));
    const governed = {
      id: "document-shared",
      storagePath: "cms-documents/shared/file.pdf",
      kind: "manual",
      title: "Manual governado",
      sha256: "a".repeat(64),
      revision: "1",
      language: "pt-br",
      visibility: "public",
      rightsConfirmed: true,
    };

    const result = await resolvePublicAssetBatch(
      [
        { assetIds: [], documents: [governed] },
        { assetIds: [], documents: [{ ...governed, revision: "2" }] },
      ],
      { resolveMedia, resolveDocuments },
    );

    expect(resolveDocuments).not.toHaveBeenCalled();
    expect(result.map(({ documentUrls }) => documentUrls)).toEqual([{}, {}]);
  });

  it("fails the complete batch when either bounded resolver fails", async () => {
    let activeCalls = 0;
    let maximumActiveCalls = 0;
    const resolveMedia = vi.fn(async (_assetIds: string[]) => {
      activeCalls += 1;
      maximumActiveCalls = Math.max(maximumActiveCalls, activeCalls);
      await Promise.resolve();
      activeCalls -= 1;
      throw new Error("media resolver failed");
    });
    const resolveDocuments = vi.fn(async () => {
      activeCalls += 1;
      maximumActiveCalls = Math.max(maximumActiveCalls, activeCalls);
      await Promise.resolve();
      activeCalls -= 1;
      return {};
    });

    const result = resolvePublicAssetBatch(
      [
        {
          assetIds: Array.from({ length: 3 }, (_, index) => assetId(index)),
          documents: Array.from({ length: 3 }, (_, index) => ({
            id: `document-${index}`,
            storagePath: `cms-documents/id-${index}/file.pdf`,
          })),
        },
      ],
      { resolveMedia, resolveDocuments },
    );

    await expect(result).rejects.toThrow("media resolver failed");
    expect(maximumActiveCalls).toBeLessThanOrEqual(PUBLIC_ASSET_CHUNK_CONCURRENCY);
  });
});
