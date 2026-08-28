import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "npm:pdf-lib@1.17.1";

export const CANONICAL_PDF_VERSION = "rdo-canonical-pdf/v1";

export interface CanonicalPdfInput {
  report: Record<string, unknown>;
  generatedAt: string;
  snapshotHash: string;
  termsHash: string;
  termsVersion: string;
  gaiatecSignature?: string | null;
  customerSignature?: string | null;
  gaiatecSourceHash?: string | null;
  customerSourceHash?: string | null;
}

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const BODY_SIZE = 9;
const LINE_HEIGHT = 13;

function printable(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\x20-\x7e\n]/g, "?")
    .replace(/[\t\r]+/g, " ")
    .trim();
}

function linesFor(font: PDFFont, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of printable(text).split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, BODY_SIZE) <= maxWidth) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    if (!words.length) lines.push("");
  }
  return lines;
}

function pngBytes(dataUrl: string): Uint8Array {
  const encoded = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
}

export async function generateCanonicalRdoPdf(input: CanonicalPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const generatedAt = new Date(input.generatedAt);
  pdf.setTitle(`RDO ${printable(input.report.contrato || input.report.id)}`);
  pdf.setSubject("Relatorio Diario de Obra - evidencia canonica");
  pdf.setCreator("GAIATEC RDO server-side");
  pdf.setProducer(CANONICAL_PDF_VERSION);
  pdf.setCreationDate(generatedAt);
  pdf.setModificationDate(generatedAt);

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage;
  let y: number;

  const newPage = () => {
    page = pdf.addPage([A4.width, A4.height]);
    y = A4.height - MARGIN;
    page.drawText("GAIATEC - RDO CANONICO", { x: MARGIN, y, size: 14, font: bold, color: rgb(0.08, 0.24, 0.36) });
    y -= 24;
  };
  const ensure = (height: number) => {
    if (y - height < MARGIN) newPage();
  };
  const write = (label: string, value: unknown) => {
    const text = `${label}: ${printable(value) || "-"}`;
    const lines = linesFor(regular, text, A4.width - 2 * MARGIN);
    ensure(lines.length * LINE_HEIGHT + 3);
    for (const line of lines) {
      page.drawText(line, { x: MARGIN, y, size: BODY_SIZE, font: regular, color: rgb(0.1, 0.1, 0.1) });
      y -= LINE_HEIGHT;
    }
    y -= 3;
  };
  const section = (title: string) => {
    ensure(24);
    y -= 5;
    page.drawText(printable(title), { x: MARGIN, y, size: 11, font: bold, color: rgb(0.08, 0.24, 0.36) });
    y -= 18;
  };
  const signature = async (label: string, dataUrl: string | null | undefined, name: unknown, at: unknown, method: unknown) => {
    section(label);
    write("Nome", name);
    write("Data/hora do servidor", at);
    write("Metodo", method);
    if (dataUrl?.startsWith("data:image/png;base64,")) {
      const image = await pdf.embedPng(pngBytes(dataUrl));
      const scale = Math.min(220 / image.width, 85 / image.height, 1);
      const height = image.height * scale;
      ensure(height + 12);
      page.drawImage(image, { x: MARGIN, y: y - height, width: image.width * scale, height });
      y -= height + 12;
    }
  };

  newPage();
  write("Versao do formato", CANONICAL_PDF_VERSION);
  write("Gerado em", input.generatedAt);
  write("ID do relatorio", input.report.id);
  write("Grupo/versao", `${printable(input.report.version_group_id)} / ${printable(input.report.version_number || 1)}`);
  write("Contrato", input.report.contrato);
  write("Status", input.report.assinatura_status || input.report.status);

  section("Dados do relatorio");
  for (const [label, key] of [
    ["Cliente", "cliente"], ["CNPJ", "cnpj"], ["Razao social", "razao_social"],
    ["Responsavel GAIATEC", "eng_gaiatec"], ["CREA GAIATEC", "crea"],
    ["Responsavel cliente", "eng_cliente"], ["CREA cliente", "crea_cliente"],
    ["Periodo inicial", "periodo_inicio"], ["Periodo final", "periodo_fim"],
    ["Endereco", "local_endereco"], ["Numero", "local_numero"], ["Comentarios", "comentarios"],
  ] as const) write(label, input.report[key]);

  await signature("Assinatura GAIATEC", input.gaiatecSignature, input.report.assinatura_gaiatec_nome, input.report.assinatura_gaiatec_em, input.report.assinatura_gaiatec_metodo);
  await signature("Assinatura cliente", input.customerSignature, input.report.assinatura_cliente_nome, input.report.assinatura_cliente_em, input.report.assinatura_cliente_metodo);

  section("Selo de evidencia");
  write("Hash SHA-256 do snapshot", input.snapshotHash);
  write("Versao dos termos", input.termsVersion);
  write("Hash SHA-256 dos termos", input.termsHash);
  write("Hash da origem GAIATEC importada", input.gaiatecSourceHash);
  write("Hash da origem cliente importada", input.customerSourceHash);
  write("Observacao", "O hash SHA-256 deste PDF e armazenado externamente no registro imutavel e no evento de auditoria para evitar autorreferencia.");

  return pdf.save({ useObjectStreams: false, addDefaultPage: false });
}
