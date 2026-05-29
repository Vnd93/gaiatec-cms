// supabase/functions/rdo-notify/index.ts
// Notifica os ADMINs por e-mail quando um relatório é finalizado.
// O cliente gera o PDF e envia (base64) + um resumo; aqui validamos o usuário
// autenticado, listamos os admins (service_role) e enviamos o e-mail branded
// com o PDF anexado via Resend.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { relatorioFinalizadoEmail, sendEmail, type ResumoRelatorio } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Limite defensivo de anexo (~14MB binário ≈ 19MB em base64).
const MAX_PDF_B64 = 19_000_000;
const FALLBACK_ADMIN = "marcelo@gaiatecsistemas.com.br";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendKey = Deno.env.get("RESEND_API_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "Não autenticado." }, 401);

  // 1) Valida o chamador (qualquer usuário autenticado pode finalizar/notificar)
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: u, error: uErr } = await caller.auth.getUser();
  if (uErr || !u?.user) return json({ error: "Sessão inválida." }, 401);

  // 2) Lê o corpo
  let resumo: ResumoRelatorio;
  let pdfBase64 = "";
  let filename = "relatorio.pdf";
  try {
    const body = await req.json();
    resumo = (body?.resumo ?? {}) as ResumoRelatorio;
    pdfBase64 = String(body?.pdfBase64 ?? "");
    if (body?.filename) filename = String(body.filename);
  } catch {
    return json({ error: "Corpo inválido." }, 400);
  }
  if (!resumo.finalizadoPor) resumo.finalizadoPor = u.user.email ?? "";

  // 3) Lista os admins (service_role); fallback para o admin padrão
  const admin = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
  let recipients: string[] = [];
  try {
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    recipients = (data?.users ?? [])
      .filter((x) => (x.app_metadata as Record<string, unknown> | null)?.role === "admin")
      .map((x) => x.email ?? "")
      .filter(Boolean);
  } catch {
    /* usa fallback abaixo */
  }
  if (recipients.length === 0) recipients = [FALLBACK_ADMIN];

  // 4) Monta e envia o e-mail (PDF anexado quando dentro do limite)
  const { subject, html } = relatorioFinalizadoEmail(resumo);
  const attachments =
    pdfBase64 && pdfBase64.length <= MAX_PDF_B64 ? [{ filename, content: pdfBase64 }] : undefined;

  try {
    await sendEmail(resendKey, recipients, { subject, html, attachments });
  } catch (e) {
    return json({ error: "Falha ao enviar o e-mail: " + (e instanceof Error ? e.message : String(e)) }, 502);
  }

  return json({ ok: true, sent: recipients.length, anexo: Boolean(attachments) });
});
