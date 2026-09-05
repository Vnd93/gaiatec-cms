import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { relatorioAssinadoEmail, sendEmail, type ResumoRelatorio } from "../_shared/email.ts";
import { CANONICAL_PDF_VERSION, generateCanonicalRdoPdf } from "../_shared/canonical-pdf.ts";
import { cleanText, clientAddress, consumeRateLimit, corsHeaders, isAllowedOrigin, json, readJsonLimited, sha256, sha256Bytes } from "../_shared/security.ts";

const MAX_SIGNATURE_BYTES = 500_000;
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const fmtDate = (value: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "";

function decodePdf(value: string): Uint8Array {
  const encoded = value.startsWith("data:") ? value.slice(value.indexOf(",") + 1) : value;
  const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
  if (bytes.length > 14_000_000) throw new Error("PDF_TOO_LARGE");
  if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) throw new Error("INVALID_PDF");
  return bytes;
}

async function notifySigned(admin: any, resendKey: string, report: Record<string, any>, photoCount: number) {
  const summary: ResumoRelatorio = {
    contrato: cleanText(report.contrato, 100), cliente: cleanText(report.cliente, 200), cnpj: cleanText(report.cnpj, 40),
    razaoSocial: cleanText(report.razao_social, 200), engGaiatec: cleanText(report.eng_gaiatec, 160), crea: cleanText(report.crea, 60),
    engCliente: cleanText(report.assinatura_cliente_nome ?? report.eng_cliente, 160), creaCliente: cleanText(report.crea_cliente, 60),
    emailCliente: cleanText(report.email_cliente, 254), inicio: fmtDate(report.periodo_inicio), fim: fmtDate(report.periodo_fim),
    local: [cleanText(report.local_endereco, 300), cleanText(report.local_numero, 40)].filter(Boolean).join(", "), fotos: photoCount,
    assinatura: "Assinado", finalizadoEm: new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Sao_Paulo" }).format(new Date()),
  };
  const { data: accessRows } = await admin.from("rdo_user_access").select("user_id").eq("active", true).eq("role", "rdo_admin");
  const ids = new Set(((accessRows ?? []) as Array<{ user_id: string }>).map((item) => item.user_id));
  const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const listedUsers = (listed?.users ?? []) as Array<{ id: string; email?: string | null }>;
  const recipients: string[] = listedUsers.filter((user) => ids.has(user.id)).map((user) => user.email ?? "").filter(Boolean);
  if (report.email_cliente) recipients.push(String(report.email_cliente));
  if (recipients.length) await sendEmail(resendKey, [...new Set(recipients)], relatorioAssinadoEmail(summary));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (!isAllowedOrigin(req)) return json(req, { error: "Origem não autorizada." }, 403);
  if (req.method !== "POST") return json(req, { error: "Método não permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const evidenceSalt = Deno.env.get("EVIDENCE_SALT");
  if (!url || !serviceRole || !resendKey || !evidenceSalt) return json(req, { error: "Serviço indisponível." }, 503);
  const admin = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });

  let body: Record<string, unknown>;
  try {
    body = await readJsonLimited(req, 19_000_000);
  } catch (error) {
    return json(req, { error: error instanceof Error && error.message === "PAYLOAD_TOO_LARGE" ? "Corpo excede o limite." : "Corpo inválido." }, 400);
  }
  const action = cleanText(body.action ?? "get", 30);
  const token = cleanText(body.token, 40);
  if (!isUuid(token)) return json(req, { error: "Link inválido." }, 400);
  const tokenHash = await sha256(token);

  try {
    const allowed = await consumeRateLimit(admin, req, `rdo_sign_${action}`, `${tokenHash}:${clientAddress(req)}`, action === "get" ? 30 : 6, 900);
    if (!allowed) return json(req, { error: "Muitas tentativas. Aguarde e tente novamente." }, 429);
  } catch {
    return json(req, { error: "Serviço de proteção indisponível." }, 503);
  }

  const { data: report, error } = await admin.from("rdo_relatorios").select("*").eq("assinatura_token_hash", tokenHash).maybeSingle();
  if (error) return json(req, { error: "Erro ao carregar." }, 500);
  if (!report) return json(req, { error: "Link inválido ou já utilizado." }, 404);
  if (report.assinatura_status !== "aguardando_cliente") return json(req, { error: "Este relatório não está aguardando assinatura." }, 409);
  if (!report.assinatura_token_expira || new Date(report.assinatura_token_expira).getTime() < Date.now()) return json(req, { error: "Link expirado. Solicite um novo à GAIATEC." }, 410);

  const { data: photoRows } = await admin.from("rdo_fotos").select("id,storage_path,ordem").eq("relatorio_id", report.id).order("ordem");
  const paths = (photoRows ?? []).map((photo) => photo.storage_path);
  const { data: signedPhotos } = paths.length ? await admin.storage.from("rdo-fotos").createSignedUrls(paths, 300) : { data: [] };
  const photos = (photoRows ?? []).map((photo, index) => ({ id: photo.id, url: signedPhotos?.[index]?.signedUrl ?? null })).filter((photo) => photo.url);

  if (action === "get") {
    const { assinatura_token: _token, assinatura_token_hash: _hash, assinatura_token_expira: _expires, created_by: _owner, immutable_snapshot: _snapshot, ...safe } = report;
    let gaiatecPdfUrl: string | null = null;
    if (report.assinatura_gaiatec_pdf_path) {
      const { data } = await admin.storage.from("rdo-assinados").createSignedUrl(String(report.assinatura_gaiatec_pdf_path), 300);
      gaiatecPdfUrl = data?.signedUrl ?? null;
    }
    return json(req, { relatorio: { ...safe, fotos: photos }, gaiatecPdfUrl });
  }

  const uploadedPaths: string[] = [];
  try {
    const now = new Date().toISOString();
    let patch: Record<string, unknown>;
    let evidenceHash: string;

    if (action === "sign") {
      const signature = cleanText(body.assinatura, 700_000);
      const name = cleanText(body.nome, 160);
      if (!signature.startsWith("data:image/png;base64,") || Math.ceil((signature.split(",")[1]?.length ?? 0) * 3 / 4) > MAX_SIGNATURE_BYTES) throw new Error("INVALID_SIGNATURE");
      if (!name || body.aceite !== true) throw new Error("ACCEPTANCE_REQUIRED");
      const canonicalReport = { ...report, assinatura_cliente_nome: name, assinatura_cliente_em: now, assinatura_cliente_metodo: "desenho", assinatura_status: "assinado" };
      const canonicalBytes = await generateCanonicalRdoPdf({
        report: canonicalReport,
        generatedAt: now,
        snapshotHash: String(report.snapshot_hash ?? ""),
        termsHash: String(report.terms_hash ?? ""),
        termsVersion: String(report.termos_versao ?? ""),
        gaiatecSignature: report.assinatura_gaiatec,
        customerSignature: signature,
        gaiatecSourceHash: report.assinatura_gaiatec_source_hash,
      });
      evidenceHash = await sha256Bytes(canonicalBytes);
      const canonicalPath = `assinados/${report.id}/canonical-v${Number(report.version_number ?? 1)}-final-${crypto.randomUUID()}.pdf`;
      const canonicalUpload = await admin.storage.from("rdo-assinados").upload(canonicalPath, canonicalBytes, { contentType: "application/pdf", upsert: false });
      if (canonicalUpload.error) throw canonicalUpload.error;
      uploadedPaths.push(canonicalPath);
      patch = {
        assinatura_cliente: signature,
        assinatura_cliente_nome: name,
        assinatura_cliente_em: now,
        assinatura_cliente_metodo: "desenho",
        assinatura_status: "assinado",
        assinatura_token_hash: null,
        assinatura_token_expira: null,
        signed_pdf_hash: evidenceHash,
        canonical_pdf_path: canonicalPath,
        canonical_pdf_hash: evidenceHash,
        canonical_pdf_generated_at: now,
      };
    } else if (action === "upload-signed") {
      const bytes = decodePdf(String(body.pdfBase64 ?? ""));
      const name = cleanText(body.nome, 160) || cleanText(report.eng_cliente, 160);
      const filename = cleanText(body.filename, 180) || "relatorio-assinado.pdf";
      const uploadedPath = `assinados/${report.id}/cliente-${crypto.randomUUID()}.pdf`;
      const upload = await admin.storage.from("rdo-assinados").upload(uploadedPath, bytes, { contentType: "application/pdf", upsert: false });
      if (upload.error) throw upload.error;
      uploadedPaths.push(uploadedPath);
      evidenceHash = await sha256Bytes(bytes);
      patch = { assinatura_cliente_metodo: "importado", assinatura_cliente_pdf_path: uploadedPath, assinatura_cliente_arquivo: filename, assinatura_cliente_nome: name, assinatura_cliente_em: now, assinatura_status: "assinado", assinatura_token_hash: null, assinatura_token_expira: null, signed_pdf_hash: evidenceHash, canonical_pdf_path: uploadedPath, canonical_pdf_hash: evidenceHash, canonical_pdf_generated_at: now, assinatura_cliente_source_hash: evidenceHash };
    } else {
      return json(req, { error: "Ação desconhecida." }, 400);
    }

    const { data: updated, error: updateError } = await admin.from("rdo_relatorios").update(patch).eq("id", report.id).eq("assinatura_token_hash", tokenHash).select("*").maybeSingle();
    if (updateError || !updated) {
      if (uploadedPaths.length) await admin.storage.from("rdo-assinados").remove(uploadedPaths);
      return json(req, { error: "Link já utilizado ou assinatura concorrente." }, 409);
    }

    const ipHash = await sha256(`${evidenceSalt}:${clientAddress(req)}`);
    const userAgentHash = await sha256(req.headers.get("User-Agent") ?? "unknown");
    await admin.from("rdo_audit_events").insert({ report_id: report.id, actor_id: null, action: `signature.${action}`, evidence_hash: evidenceHash, event_data: { occurredAt: now, canonicalPdfVersion: action === "sign" ? CANONICAL_PDF_VERSION : "external-import", canonicalPdfHash: evidenceHash, ipHash, userAgentHash, tokenHash: await sha256(tokenHash) } });

    const notifyKey = crypto.randomUUID();
    await admin.from("rdo_notification_outbox").insert({ report_id: report.id, action: "signed_remote", idempotency_key: notifyKey, requested_by: report.created_by, status: "sending", attempt_count: 1 });
    try {
      await notifySigned(admin, resendKey, updated, photos.length);
      await admin.from("rdo_notification_outbox").update({ status: "sent", sent_at: new Date().toISOString() }).eq("idempotency_key", notifyKey);
    } catch (notifyError) {
      await admin.from("rdo_notification_outbox").update({ status: "failed", last_error: notifyError instanceof Error ? notifyError.message.slice(0, 500) : "send_failed" }).eq("idempotency_key", notifyKey);
    }
    return json(req, { ok: true });
  } catch (error) {
    if (uploadedPaths.length) await admin.storage.from("rdo-assinados").remove(uploadedPaths);
    const code = error instanceof Error ? error.message : "SIGN_FAILED";
    const message = code === "INVALID_SIGNATURE" ? "Assinatura inválida ou muito grande." : code === "ACCEPTANCE_REQUIRED" ? "Nome e aceite são obrigatórios." : code === "PDF_TOO_LARGE" ? "PDF muito grande (máx. 14 MB)." : code === "INVALID_PDF" ? "O arquivo precisa ser um PDF válido." : "Não foi possível concluir a assinatura.";
    return json(req, { error: message }, code === "SIGN_FAILED" ? 500 : 400);
  }
});
