import type { CmsProductContent } from "@/shared/contracts/cms-content";

export type ProductDocument = CmsProductContent["documents"][number];

export type DocumentUploadDescriptor = {
  documentId: string;
  storagePath: string;
  signedUrl: string;
};

export function validateDocumentUpload(file: File | null): string[] {
  if (!file) return ["Selecione um arquivo PDF."];
  const issues: string[] = [];
  if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf"))
    issues.push("O documento deve ser um arquivo PDF.");
  if (file.size < 8) issues.push("O arquivo PDF está vazio ou incompleto.");
  if (file.size > 20 * 1024 * 1024) issues.push("O documento deve ter no máximo 20 MB.");
  return issues;
}

export async function uploadDocumentFile(
  descriptor: Pick<DocumentUploadDescriptor, "signedUrl">,
  file: File,
  request: typeof fetch = fetch,
) {
  const response = await request(descriptor.signedUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/pdf" },
    body: file,
  });
  if (!response.ok) throw new Error("Falha ao enviar o PDF para a biblioteca privada.");
}

export function parseProductDocuments(value: string): {
  documents: ProductDocument[];
  error: string | null;
} {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) throw new Error("not_array");
    return { documents: parsed as ProductDocument[], error: null };
  } catch {
    return {
      documents: [],
      error: "A lista de documentos existente está inválida e não pode ser alterada por este formulário.",
    };
  }
}

export function addProductDocument(current: ProductDocument[], document: ProductDocument): ProductDocument[] {
  if (current.some((item) => item.id === document.id)) return current;
  if (current.length >= 30) throw new Error("Cada produto pode ter no máximo 30 documentos.");
  return [...current, document];
}
