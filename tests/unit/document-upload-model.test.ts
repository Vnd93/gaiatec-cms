import { describe, expect, it, vi } from "vitest";
import {
  addProductDocument,
  parseProductDocuments,
  uploadDocumentFile,
  validateDocumentUpload,
  type ProductDocument,
} from "@/admin/document-upload-model";

const document = (id = "57000000-0000-4000-8000-000000000001"): ProductDocument => ({
  id,
  kind: "datasheet",
  title: "Ficha técnica QA",
  storagePath: `cms-documents/${id}/ficha-tecnica.pdf`,
  sha256: "a".repeat(64),
  revision: "1",
  language: "pt-BR",
  visibility: "public",
  rightsConfirmed: true,
});

describe("governed document upload model", () => {
  it("accepts a bounded PDF and rejects MIME, empty and oversized files", () => {
    expect(
      validateDocumentUpload(new File(["%PDF-1.7\n%%EOF"], "ficha.pdf", { type: "application/pdf" })),
    ).toEqual([]);
    expect(validateDocumentUpload(new File(["imagem"], "ficha.pdf", { type: "image/png" }))).toContain(
      "O documento deve ser um arquivo PDF.",
    );
    expect(validateDocumentUpload(new File(["tiny"], "ficha.pdf", { type: "application/pdf" }))).toContain(
      "O arquivo PDF está vazio ou incompleto.",
    );
    const oversized = new File([new Uint8Array(20 * 1024 * 1024 + 1)], "grande.pdf", {
      type: "application/pdf",
    });
    expect(validateDocumentUpload(oversized)).toContain("O documento deve ter no máximo 20 MB.");
  });

  it("uploads only to the backend-issued signed URL as application/pdf", async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const file = new File(["%PDF-1.7\n%%EOF"], "ficha.pdf", { type: "application/pdf" });
    await uploadDocumentFile({ signedUrl: "https://storage.example/signed" }, file, request);
    expect(request).toHaveBeenCalledWith("https://storage.example/signed", {
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      body: file,
    });
  });

  it("preserves valid document lists, prevents duplicates and enforces the product limit", () => {
    const parsed = parseProductDocuments(JSON.stringify([document()]));
    expect(parsed.error).toBeNull();
    expect(addProductDocument(parsed.documents, document())).toHaveLength(1);
    const full = Array.from({ length: 30 }, (_, index) =>
      document(`57000000-0000-4000-8000-${String(index).padStart(12, "0")}`),
    );
    expect(() => addProductDocument(full, document("57000000-0000-4000-9000-000000000001"))).toThrow(
      "no máximo 30",
    );
    expect(parseProductDocuments("{inválido").error).toMatch(/inválida/);
  });
});
