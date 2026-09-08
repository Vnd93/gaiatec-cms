import { describe, expect, it } from "vitest";
import { MAX_PDF_BYTES, validatePassivePdf } from "../../supabase/functions/_shared/cms-pdf-validation";

const pdf = (body = "1 0 obj\n<< /Type /Catalog >>\nendobj") =>
  new TextEncoder().encode(`%PDF-1.7\n${body}\n%%EOF\n`);

describe("server-side passive PDF validation", () => {
  it("accepts a bounded passive PDF envelope", () => {
    expect(validatePassivePdf(pdf())).toBeNull();
  });

  it.each(["/JavaScript", "/J#53", "/OpenAction", "/EmbeddedFile", "/AcroForm", "/Encrypt"])(
    "rejects active or ambiguous PDF structure %s",
    (token) => {
      expect(validatePassivePdf(pdf(`1 0 obj\n<< ${token} 2 0 R >>\nendobj`))).toBe(
        "pdf_active_content_rejected",
      );
    },
  );

  it("rejects spoofed signatures, executable trailers and oversized payloads", () => {
    expect(validatePassivePdf(new TextEncoder().encode("not-a-pdf"))).toBe("pdf_signature_invalid");
    expect(validatePassivePdf(new TextEncoder().encode("%PDF-1.7\n%%EOF\n<script>"))).toBe(
      "pdf_trailer_invalid",
    );
    expect(validatePassivePdf(new Uint8Array(MAX_PDF_BYTES + 1))).toBe("pdf_size_invalid");
  });
});
