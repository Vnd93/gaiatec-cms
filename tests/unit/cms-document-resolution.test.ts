import { describe, expect, it, vi } from "vitest";

import { resolveDocumentAssets } from "../../supabase/functions/_shared/cms-document-resolution";

const reference = {
  id: "49000000-0000-4000-8000-000000000401",
  kind: "manual",
  title: "Manual QA",
  storagePath: "cms-documents/49000000-0000-4000-8000-000000000401/manual.pdf",
  sha256: "a".repeat(64),
  revision: "1",
  language: "pt-BR",
  visibility: "public",
  rightsConfirmed: true,
};

function createClient(databaseResult: { data: unknown[] | null; error: unknown }) {
  const limit = vi.fn(async () => databaseResult);
  const query = { select: vi.fn(() => ({ in: vi.fn(() => ({ limit })) })) };
  return {
    client: {
      from: vi.fn(() => query),
    },
  };
}

describe("governed public document resolution", () => {
  it("marks an approved document for a semantic revocable public proxy", async () => {
    const { client } = createClient({
      data: [
        {
          id: reference.id,
          storage_path: reference.storagePath,
          kind: reference.kind,
          title: reference.title,
          sha256: reference.sha256,
          revision: reference.revision,
          language: reference.language.toLowerCase(),
          visibility: "public",
          rights_confirmed: true,
          processing_status: "ready",
          scan_status: "clean",
          scan_engine: "clamav-corporate-v1",
          source_kind: "official_company",
          synthetic_expires_at: null,
          archived_at: null,
        },
      ],
      error: null,
    });

    await expect(resolveDocumentAssets(client as never, [reference], "validated")).resolves.toEqual({
      [reference.id]: "validated",
    });
  });

  it("propagates a database failure instead of silently omitting documents", async () => {
    const databaseError = new Error("database unavailable");
    const { client } = createClient({ data: null, error: databaseError });

    await expect(resolveDocumentAssets(client as never, [reference], "validated")).rejects.toBe(
      databaseError,
    );
  });

  it("never signs a quarantined structural pre-filter result", async () => {
    const { client } = createClient({
      data: [
        {
          id: reference.id,
          storage_path: reference.storagePath,
          kind: reference.kind,
          title: reference.title,
          sha256: reference.sha256,
          revision: reference.revision,
          language: reference.language.toLowerCase(),
          visibility: "public",
          rights_confirmed: true,
          processing_status: "quarantined",
          scan_status: "pending",
          archived_at: null,
        },
      ],
      error: null,
    });

    await expect(resolveDocumentAssets(client as never, [reference], "validated")).resolves.toEqual({});
  });

  it("never signs a synthetic document after its exact QA lease expires", async () => {
    const { client } = createClient({
      data: [
        {
          id: reference.id,
          storage_path: reference.storagePath,
          kind: reference.kind,
          title: reference.title,
          sha256: reference.sha256,
          revision: reference.revision,
          language: reference.language.toLowerCase(),
          visibility: "public",
          rights_confirmed: true,
          processing_status: "ready",
          scan_status: "clean",
          scan_engine: "qa-synthetic-attestation-v1",
          source_kind: "synthetic_test",
          synthetic_expires_at: new Date(Date.now() - 1_000).toISOString(),
          archived_at: null,
        },
      ],
      error: null,
    });

    await expect(resolveDocumentAssets(client as never, [reference], "validated")).resolves.toEqual({});
  });

  it("returns an empty map for a genuine absence without calling Storage", async () => {
    const { client } = createClient({ data: [], error: null });

    await expect(resolveDocumentAssets(client as never, [reference], "validated")).resolves.toEqual({});
  });
});
