import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { listAllAuthUsers } from "../_shared/auth-admin-pagination.ts";
import { listAllActiveRdoAdminIds } from "../_shared/rdo-access-pagination.ts";
import { assinarClienteEmail, relatorioAssinadoEmail, relatorioFinalizadoEmail, sendEmail, type ResumoRelatorio } from "../_shared/email.ts";
import { cleanText, clientAddress, consumeRateLimit, corsHeaders, isAllowedOrigin, json, readJsonLimited, sha256 } from "../_shared/security.ts";

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const fmtDate = (value: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (!isAllowedOrigin(req)) return json(req, { error: "Origem não autorizada." }, 403);
  if (req.method !== "POST") return json(req, { error: "Método não permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const publicOrigin = Deno.env.get("PUBLIC_SITE_ORIGIN") ?? "https://gaiatecsistemas.com.br";
  if (!url || !anonKey || !serviceRole || !resendKey) return json(req, { error: "Serviço indisponível." }, 503);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json(req, { error: "Não autenticado." }, 401);
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false } });
  const { data: authData, error: authError } = await caller.auth.getUser();
  if (authError || !authData.user) return json(req, { error: "Sessão inválida." }, 401);

  let body: Record<string, unknown>;
  try {
    body = await readJsonLimited(req, 4_096);
  } catch {
    return json(req, { error: "Corpo inválido." }, 400);
  }
  const reportId = cleanText(body.reportId, 40);
  const action = cleanText(body.action, 40);
  const key = cleanText(body.idempotencyKey, 40);
  if (!isUuid(reportId) || !isUuid(key) || !["finalized", "resend_signature", "signature_link"].includes(action)) return json(req, { error: "Comando inválido." }, 400);

  const admin = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: access } = await admin.from("rdo_user_access").select("active,role").eq("user_id", authData.user.id).maybeSingle();
  if (!access?.active) return json(req, { error: "Acesso RDO inativo ou não autorizado." }, 403);

  const { data: report } = await admin.from("rdo_relatorios").select("*").eq("id", reportId).maybeSingle();
  if (!report) return json(req, { error: "Relatório não encontrado." }, 404);
  if (report.created_by !== authData.user.id && access.role !== "rdo_admin") return json(req, { error: "Sem permissão para este relatório." }, 403);
  if (report.status === "rascunho") return json(req, { error: "Relatório ainda não foi finalizado." }, 409);

  try {
    const allowed = await consumeRateLimit(admin, req, `rdo_notify_${action}`, `${authData.user.id}:${clientAddress(req)}`, action === "resend_signature" ? 5 : 20, 900);
    if (!allowed) return json(req, { error: "Muitas tentativas. Aguarde e tente novamente." }, 429);
  } catch {
    return json(req, { error: "Serviço de proteção indisponível." }, 503);
  }

  let signLink: string | null = null;
  if (report.assinatura_status === "aguardando_cliente") {
    const rawToken = crypto.randomUUID();
    const tokenHash = await sha256(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const { error: tokenError } = await admin.from("rdo_relatorios").update({ assinatura_token: null, assinatura_token_hash: tokenHash, assinatura_token_expira: expiresAt }).eq("id", reportId);
    if (tokenError) return json(req, { error: "Não foi possível gerar o link seguro." }, 500);
    signLink = `${publicOrigin}/relatorio-de-obra/assinar/${rawToken}`;
  }

  if (action === "signature_link") return json(req, { ok: true, signLink });

  const { data: existing } = await admin.from("rdo_notification_outbox").select("status").eq("idempotency_key", key).maybeSingle();
  if (existing?.status === "sent") return json(req, { ok: true, alreadySent: true, signLink });
  if (!existing) {
    const created = await admin.from("rdo_notification_outbox").insert({ report_id: reportId, action, idempotency_key: key, requested_by: authData.user.id, status: "sending", attempt_count: 1 });
    if (created.error) return json(req, { error: "Notificação já está em processamento." }, 409);
  } else {
    await admin.from("rdo_notification_outbox").update({ status: "sending", attempt_count: 2, last_error: null }).eq("idempotency_key", key);
  }

  const { count: photoCount } = await admin.from("rdo_fotos").select("id", { count: "exact", head: true }).eq("relatorio_id", reportId);
  const summary: ResumoRelatorio = {
    id: report.id,
    contrato: cleanText(report.contrato, 100),
    cliente: cleanText(report.cliente, 200),
    cnpj: cleanText(report.cnpj, 40),
    razaoSocial: cleanText(report.razao_social, 200),
    nomeFantasia: cleanText(report.nome_fantasia, 200),
    engGaiatec: cleanText(report.eng_gaiatec, 160),
    crea: cleanText(report.crea, 60),
    engCliente: cleanText(report.eng_cliente, 160),
    creaCliente: cleanText(report.crea_cliente, 60),
    emailCliente: cleanText(report.email_cliente, 254),
    inicio: fmtDate(report.periodo_inicio),
    fim: fmtDate(report.periodo_fim),
    local: [cleanText(report.local_endereco, 300), cleanText(report.local_numero, 40)].filter(Boolean).join(", "),
    fotos: photoCount ?? 0,
    assinatura: cleanText(report.assinatura_status, 40),
    finalizadoPor: authData.user.email ?? "",
    finalizadoEm: new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Sao_Paulo" }).format(new Date(report.finalized_at ?? Date.now())),
  };

  const { ids: accessIds, error: accessDirectoryError } = await listAllActiveRdoAdminIds(admin);
  if (accessDirectoryError) {
    await admin.from("rdo_notification_outbox").update({ status: "failed", last_error: "rdo_access_directory_unavailable" }).eq("idempotency_key", key);
    return json(req, { error: "Diretório de destinatários indisponível." }, 503);
  }
  const adminIds = new Set(accessIds);
  const { users, error: directoryError } = await listAllAuthUsers(admin);
  if (directoryError) {
    await admin.from("rdo_notification_outbox").update({ status: "failed", last_error: "auth_directory_unavailable" }).eq("idempotency_key", key);
    return json(req, { error: "Diretório de destinatários indisponível." }, 503);
  }
  const recipients = users.filter((user) => adminIds.has(user.id)).map((user) => user.email ?? "").filter(Boolean);
  if (recipients.length === 0) {
    await admin.from("rdo_notification_outbox").update({ status: "failed", last_error: "no_active_rdo_admin" }).eq("idempotency_key", key);
    return json(req, { error: "Nenhum administrador RDO ativo para receber a notificação." }, 503);
  }

  try {
    const adminMessage = report.assinatura_status === "assinado" ? relatorioAssinadoEmail(summary) : relatorioFinalizadoEmail(summary);
    await sendEmail(resendKey, recipients, adminMessage);
    if (report.email_cliente && signLink) await sendEmail(resendKey, String(report.email_cliente), assinarClienteEmail(signLink, summary));
    else if (report.email_cliente && report.assinatura_status === "assinado") await sendEmail(resendKey, String(report.email_cliente), relatorioAssinadoEmail(summary));
    await admin.from("rdo_notification_outbox").update({ status: "sent", sent_at: new Date().toISOString(), last_error: null }).eq("idempotency_key", key);
    await admin.from("rdo_audit_events").insert({ report_id: reportId, actor_id: authData.user.id, action: `notification.${action}`, event_data: { adminRecipients: recipients.length, customerNotified: Boolean(report.email_cliente) } });
    return json(req, { ok: true, adminRecipients: recipients.length, customerNotified: Boolean(report.email_cliente), signLink });
  } catch (error) {
    await admin.from("rdo_notification_outbox").update({ status: "failed", last_error: error instanceof Error ? error.message.slice(0, 500) : "send_failed" }).eq("idempotency_key", key);
    return json(req, { error: "Falha ao enviar a notificação; a tentativa foi registrada." }, 502);
  }
});
