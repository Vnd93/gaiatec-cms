import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { cleanText, clientAddress, consumeRateLimit, corsHeaders, isAllowedOrigin, json, readJsonLimited, sha256 } from "../_shared/security.ts";

const TERMS_VERSION = "v2-2026-08-pendente-juridico";
const TERMS_TEXT = `Ao assinar este Relatório Diário de Obra (RDO), declaro que:

1. As informações registradas neste relatório são verdadeiras e refletem as atividades, condições e ocorrências observadas na obra na data indicada.

2. Manifesto minha intenção de assinar eletronicamente este RDO. A Medida Provisória nº 2.200-2/2001 admite outros meios de comprovação de autoria e integridade quando aceitos pelas partes; este fluxo não se apresenta como assinatura qualificada ICP-Brasil.

3. Estou ciente de que a assinatura fica vinculada à versão imutável e ao hash do documento, com registro de nome, data/hora do servidor, versão e hash deste termo, identificador do token e evidências técnicas sujeitas à política de retenção e privacidade.

4. Reconheço que a força probatória e o nível de assinatura aplicável dependem do contexto, da aceitação das partes e da legislação específica. A correção posterior gera nova versão e preserva a anterior.

A GAIATEC trata os dados deste relatório para acompanhamento e documentação da obra, conforme a política de privacidade e retenção aplicável. Este texto permanece sujeito à aprovação jurídica e de negócio antes do Gate G1.`;
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

function dataUrlSize(value: string): number {
  const encoded = value.includes(",") ? value.split(",", 2)[1] : value;
  return Math.ceil((encoded.length * 3) / 4);
}

function decodePdf(value: string): Uint8Array {
  const encoded = value.startsWith("data:") ? value.slice(value.indexOf(",") + 1) : value;
  const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
  if (bytes.length > 14_000_000) throw new Error("PDF_TOO_LARGE");
  if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) throw new Error("INVALID_PDF");
  return bytes;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (!isAllowedOrigin(req)) return json(req, { error: "Origem não autorizada." }, 403);
  if (req.method !== "POST") return json(req, { error: "Método não permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const evidenceSalt = Deno.env.get("EVIDENCE_SALT");
  if (!url || !anonKey || !serviceRole || !evidenceSalt) return json(req, { error: "Serviço indisponível." }, 503);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json(req, { error: "Não autenticado." }, 401);
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false } });
  const { data: authData, error: authError } = await caller.auth.getUser();
  if (authError || !authData.user) return json(req, { error: "Sessão inválida." }, 401);

  let body: Record<string, unknown>;
  try {
    body = await readJsonLimited<Record<string, unknown>>(req, 19_000_000);
  } catch (error) {
    return json(req, { error: error instanceof Error && error.message === "PAYLOAD_TOO_LARGE" ? "Corpo excede o limite." : "Corpo inválido." }, 400);
  }

  const action = cleanText(body.action, 40);
  const reportId = cleanText(body.reportId, 40);
  const key = cleanText(body.idempotencyKey ?? req.headers.get("X-Idempotency-Key"), 40);
  if (!isUuid(reportId) || !isUuid(key)) return json(req, { error: "Identificador inválido." }, 400);

  const admin = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: access } = await admin.from("rdo_user_access").select("active,role").eq("user_id", authData.user.id).maybeSingle();
  if (!access?.active) return json(req, { error: "Acesso RDO inativo ou não autorizado." }, 403);

  try {
    const allowed = await consumeRateLimit(admin, req, `rdo_command_${action}`, `${authData.user.id}:${clientAddress(req)}`, 20, 300);
    if (!allowed) return json(req, { error: "Muitas operações. Aguarde e tente novamente." }, 429);
  } catch {
    return json(req, { error: "Serviço de proteção indisponível." }, 503);
  }

  const { data: report, error: reportError } = await admin.from("rdo_relatorios").select("*").eq("id", reportId).maybeSingle();
  if (reportError) return json(req, { error: "Falha ao carregar o relatório." }, 500);
  if (!report) return json(req, { error: "Relatório não encontrado." }, 404);
  const isAdmin = access.role === "rdo_admin";
  if (report.created_by !== authData.user.id && !isAdmin) return json(req, { error: "Sem permissão para este relatório." }, 403);

  const { data: existing } = await admin
    .from("rdo_command_receipts")
    .select("response")
    .eq("actor_id", authData.user.id)
    .eq("action", action)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (existing?.response) return json(req, existing.response);

  const receipt = await admin.from("rdo_command_receipts").insert({ actor_id: authData.user.id, action, idempotency_key: key, report_id: reportId });
  if (receipt.error) return json(req, { error: "Operação idempotente já está em processamento." }, 409);

  let uploadedPdfPath: string | null = null;
  try {
    let response: Record<string, unknown>;

    if (action === "finalize") {
      if (report.status !== "rascunho" || report.assinatura_status !== "nao_assinado") throw new Error("REPORT_NOT_DRAFT");
      if (!cleanText(report.cliente, 200)) throw new Error("CLIENT_REQUIRED");

      const signature = (body.signature ?? {}) as Record<string, unknown>;
      const gaiatecName = cleanText(signature.gaiatecName, 160);
      const gaiatecMethod = cleanText(signature.gaiatecMethod, 20);
      const mode = cleanText(signature.mode, 20);
      if (!gaiatecName || !["desenho", "importado"].includes(gaiatecMethod) || !["presencial", "remoto"].includes(mode)) throw new Error("INVALID_SIGNATURE");

      let gaiatecSignature: string | null = null;
      let gaiatecPdfPath: string | null = null;
      let gaiatecPdfName: string | null = null;
      let signedPdfHash: string | null = null;
      if (gaiatecMethod === "desenho") {
        gaiatecSignature = cleanText(signature.gaiatecSignature, 700_000);
        if (!gaiatecSignature.startsWith("data:image/png;base64,") || dataUrlSize(gaiatecSignature) > 500_000) throw new Error("INVALID_SIGNATURE_IMAGE");
      } else {
        const bytes = decodePdf(String(signature.gaiatecPdfBase64 ?? ""));
        gaiatecPdfName = cleanText(signature.gaiatecPdfName, 180) || "rdo-gaiatec-assinado.pdf";
        gaiatecPdfPath = `assinados/${reportId}/gaiatec-${crypto.randomUUID()}.pdf`;
        uploadedPdfPath = gaiatecPdfPath;
        const upload = await admin.storage.from("rdo-assinados").upload(gaiatecPdfPath, bytes, { contentType: "application/pdf", upsert: false });
        if (upload.error) throw upload.error;
        signedPdfHash = await sha256(String(signature.gaiatecPdfBase64 ?? ""));
      }

      const now = new Date().toISOString();
      const { data: photos } = await admin.from("rdo_fotos").select("id,storage_path,ordem,legenda").eq("relatorio_id", reportId).order("ordem");
      const snapshot = { report: { ...report, assinatura_token: undefined, assinatura_token_hash: undefined }, photos: photos ?? [], finalizedAt: now };
      const snapshotHash = await sha256(JSON.stringify(snapshot));
      const termsHash = await sha256(`${TERMS_VERSION}:${TERMS_TEXT}`);
      const customerSignature = cleanText(signature.customerSignature, 700_000);
      const customerName = cleanText(signature.customerName, 160);
      const customerEmail = cleanText(signature.customerEmail, 254).toLowerCase() || cleanText(report.email_cliente, 254).toLowerCase();
      if (mode === "presencial" && (!customerSignature.startsWith("data:image/png;base64,") || dataUrlSize(customerSignature) > 500_000 || !customerName)) throw new Error("INVALID_CUSTOMER_SIGNATURE");
      if (mode === "remoto" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) throw new Error("INVALID_CUSTOMER_EMAIL");

      const patch = {
        status: "finalizado",
        finalized_at: now,
        assinatura_gaiatec: gaiatecSignature,
        assinatura_gaiatec_nome: gaiatecName,
        assinatura_gaiatec_em: now,
        assinatura_gaiatec_metodo: gaiatecMethod,
        assinatura_gaiatec_pdf_path: gaiatecPdfPath,
        assinatura_gaiatec_arquivo: gaiatecPdfName,
        assinatura_cliente: mode === "presencial" ? customerSignature : null,
        assinatura_cliente_nome: mode === "presencial" ? customerName : null,
        assinatura_cliente_em: mode === "presencial" ? now : null,
        assinatura_cliente_metodo: mode === "presencial" ? "desenho" : null,
        assinatura_status: mode === "presencial" ? "assinado" : "aguardando_cliente",
        assinatura_token: null,
        assinatura_token_hash: null,
        assinatura_token_expira: null,
        cliente_assina_na_hora: mode === "presencial",
        email_cliente: mode === "remoto" ? customerEmail : report.email_cliente,
        termos_aceitos: true,
        termos_versao: TERMS_VERSION,
        termos_aceito_em: now,
        immutable_snapshot: snapshot,
        snapshot_hash: snapshotHash,
        signed_pdf_hash: signedPdfHash,
        terms_hash: termsHash,
      };
      const { data: updated, error: updateError } = await admin.from("rdo_relatorios").update(patch).eq("id", reportId).eq("status", "rascunho").select("*").single();
      if (updateError) throw updateError;

      const ipHash = await sha256(`${evidenceSalt}:${clientAddress(req)}`);
      const userAgentHash = await sha256(req.headers.get("User-Agent") ?? "unknown");
      await admin.from("rdo_audit_events").insert({ report_id: reportId, actor_id: authData.user.id, action: "report.finalized", evidence_hash: snapshotHash, event_data: { version: report.version_number, mode, termsVersion: TERMS_VERSION, ipHash, userAgentHash } });
      response = { ok: true, report: updated };
    } else if (action === "create_correction") {
      if (report.status === "rascunho" && report.assinatura_status === "nao_assinado") throw new Error("REPORT_NOT_IMMUTABLE");
      const reason = cleanText(body.reason, 500);
      if (reason.length < 10) throw new Error("CORRECTION_REASON_REQUIRED");
      const copyFields = ["cliente", "contrato", "eng_gaiatec", "eng_cliente", "periodo_inicio", "periodo_fim", "local_endereco", "local_numero", "local_lat", "local_lng", "comentarios", "cnpj", "razao_social", "nome_fantasia", "endereco_cliente", "crea", "crea_cliente", "email_cliente"];
      const draft: Record<string, unknown> = { created_by: authData.user.id, status: "rascunho", assinatura_status: "nao_assinado", version_group_id: report.version_group_id, version_number: Number(report.version_number ?? 1) + 1, supersedes_id: report.id, correction_reason: reason };
      for (const field of copyFields) draft[field] = report[field];
      const { data: correction, error: correctionError } = await admin.from("rdo_relatorios").insert(draft).select("*").single();
      if (correctionError) throw correctionError;
      await admin.from("rdo_audit_events").insert({ report_id: report.id, actor_id: authData.user.id, action: "report.correction_created", event_data: { correctionId: correction.id, reason } });
      response = { ok: true, report: correction };
    } else if (action === "archive" || action === "restore_archive") {
      const status = action === "archive" ? "arquivado" : report.finalized_at ? "finalizado" : "rascunho";
      const patch = { status, archived_at: action === "archive" ? new Date().toISOString() : null };
      const { data: updated, error: updateError } = await admin.from("rdo_relatorios").update(patch).eq("id", reportId).select("*").single();
      if (updateError) throw updateError;
      await admin.from("rdo_audit_events").insert({ report_id: reportId, actor_id: authData.user.id, action: `report.${action}` });
      response = { ok: true, report: updated };
    } else {
      throw new Error("UNKNOWN_ACTION");
    }

    await admin.from("rdo_command_receipts").update({ response }).eq("actor_id", authData.user.id).eq("action", action).eq("idempotency_key", key);
    return json(req, response);
  } catch (error) {
    if (uploadedPdfPath) await admin.storage.from("rdo-assinados").remove([uploadedPdfPath]);
    await admin.from("rdo_command_receipts").delete().eq("actor_id", authData.user.id).eq("action", action).eq("idempotency_key", key);
    const code = error instanceof Error ? error.message : "COMMAND_FAILED";
    const known: Record<string, string> = {
      REPORT_NOT_DRAFT: "Somente rascunhos podem ser finalizados.",
      CLIENT_REQUIRED: "Informe o cliente.",
      INVALID_SIGNATURE: "Dados de assinatura inválidos.",
      INVALID_SIGNATURE_IMAGE: "Assinatura GAIATEC inválida ou muito grande.",
      INVALID_CUSTOMER_SIGNATURE: "Assinatura presencial do cliente inválida.",
      INVALID_CUSTOMER_EMAIL: "Informe um e-mail válido para a assinatura remota.",
      INVALID_PDF: "O arquivo precisa ser um PDF válido.",
      PDF_TOO_LARGE: "PDF muito grande (máx. 14 MB).",
      REPORT_NOT_IMMUTABLE: "O rascunho ainda pode ser editado diretamente.",
      CORRECTION_REASON_REQUIRED: "Informe o motivo da correção (mínimo de 10 caracteres).",
      UNKNOWN_ACTION: "Ação desconhecida.",
    };
    return json(req, { error: known[code] ?? "Não foi possível concluir a operação." }, known[code] ? 400 : 500);
  }
});
