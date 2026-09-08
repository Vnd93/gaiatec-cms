export const MAX_PDF_BYTES = 20 * 1024 * 1024;

const ACTIVE_PDF_TOKENS =
  /\/(?:JavaScript|JS|Launch|OpenAction|AA|EmbeddedFile|RichMedia|XFA|AcroForm|ObjStm|Encrypt)\b/i;

function normalizePdfNames(value: string): string {
  return value.replace(/#([0-9a-f]{2})/gi, (_match, encoded: string) =>
    String.fromCharCode(Number.parseInt(encoded, 16)),
  );
}

export function validatePassivePdf(bytes: Uint8Array): string | null {
  if (bytes.byteLength < 8 || bytes.byteLength > MAX_PDF_BYTES) return "pdf_size_invalid";
  const header = new TextDecoder("latin1").decode(bytes.slice(0, 8));
  if (!/^%PDF-1\.[0-7]/.test(header)) return "pdf_signature_invalid";
  const text = normalizePdfNames(new TextDecoder("latin1").decode(bytes));
  if (ACTIVE_PDF_TOKENS.test(text)) return "pdf_active_content_rejected";
  const eof = text.lastIndexOf("%%EOF");
  if (eof < 0 || !/^[\s\0]*$/.test(text.slice(eof + 5))) return "pdf_trailer_invalid";
  return null;
}
