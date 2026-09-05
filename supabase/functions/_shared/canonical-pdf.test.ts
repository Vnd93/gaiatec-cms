import { assertEquals, assertGreater } from "jsr:@std/assert@1";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import { CANONICAL_PDF_VERSION, generateCanonicalRdoPdf } from "./canonical-pdf.ts";
import { sha256Bytes } from "./security.ts";

const ONE_PIXEL_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

Deno.test("gera PDF canônico selável com assinaturas desenhadas", async () => {
  const bytes = await generateCanonicalRdoPdf({
    report: {
      id: "00000000-0000-4000-8000-000000000001",
      version_group_id: "00000000-0000-4000-8000-000000000001",
      version_number: 1,
      contrato: "RDO-SINTETICO-0001",
      cliente: "Cliente Sintetico",
      status: "finalizado",
      assinatura_status: "assinado",
      assinatura_gaiatec_nome: "Responsavel Sintetico",
      assinatura_gaiatec_em: "2026-08-28T12:00:00.000Z",
      assinatura_gaiatec_metodo: "desenho",
      assinatura_cliente_nome: "Cliente Sintetico",
      assinatura_cliente_em: "2026-08-28T12:00:00.000Z",
      assinatura_cliente_metodo: "desenho",
    },
    generatedAt: "2026-08-28T12:00:00.000Z",
    snapshotHash: "a".repeat(64),
    termsHash: "b".repeat(64),
    termsVersion: "v2-2026-08-pendente-juridico",
    gaiatecSignature: ONE_PIXEL_PNG,
    customerSignature: ONE_PIXEL_PNG,
  });

  assertEquals(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
  assertGreater(bytes.length, 2_000);
  assertEquals((await sha256Bytes(bytes)).length, 64);
  const loaded = await PDFDocument.load(bytes);
  assertEquals(loaded.getCreator(), "GAIATEC RDO server-side");
  assertEquals(CANONICAL_PDF_VERSION, "rdo-canonical-pdf/v1");
  assertGreater(loaded.getPageCount(), 0);
});
