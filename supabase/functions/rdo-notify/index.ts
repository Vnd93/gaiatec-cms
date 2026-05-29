// supabase/functions/rdo-notify/index.ts
// Notificações (lado autenticado = membro da equipe) ao finalizar um relatório.
//  - Envia aos ADMINs o resumo + PDF anexado.
//  - Se `signLink` (cliente vai assinar remoto): envia ao cliente o link de assinatura.
//  - Se presencial (já 100% assinado): envia ao cliente o PDF assinado.
//  - `apenasCliente`: só reenvia o link ao cliente (sem PDF, sem admins).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  assinarClienteEmail,
  relatorioAssinadoEmail,
  relatorioFinalizadoEmail,
  sendEmail,
  type ResumoRelatorio,
} from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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

  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: u, error: uErr } = await caller.auth.getUser();
  if (uErr || !u?.user) return json({ error: "Sessão inválida." }, 401);

  let resumo: ResumoRelatorio;
  let pdfBase64 = "";
  let filename = "relatorio.pdf";
  let clienteEmail = "";
  let signLink = "";
  let apenasCliente = false;
  try {
    const body = await req.json();
    resumo = (body?.resumo ?? {}) as ResumoRelatorio;
    pdfBase64 = String(body?.pdfBase64 ?? "");
    if (body?.filename) filename = String(body.filename);
    clienteEmail = String(body?.clienteEmail ?? "").trim().toLowerCase();
    signLink = String(body?.signLink ?? "").trim();
    apenasCliente = Boolean(body?.apenasCliente);
  } catch {
    return json({ error: "Corpo inválido." }, 400);
  }
  if (!resumo.finalizadoPor) resumo.finalizadoPor = u.user.email ?? "";

  const attachment =
    pdfBase64 && pdfBase64.length <= MAX_PDF_B64 ? [{ filename, content: pdfBase64 }] : undefined;
  const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  // ── Reenviar apenas o link ao cliente ────────────────────────────
  if (apenasCliente) {
    if (!validEmail(clienteEmail) || !signLink) return json({ error: "E-mail do cliente ou link ausente." }, 400);
    try {
      await sendEmail(resendKey, clienteEmail, assinarClienteEmail(signLink, resumo));
    } catch (e) {
      return json({ error: "Falha ao enviar: " + (e instanceof Error ? e.message : String(e)) }, 502);
    }
    return json({ ok: true, clienteNotificado: true });
  }

  // ── Admins ───────────────────────────────────────────────────────
  const admin = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
  let admins: string[] = [];
  try {
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    admins = (data?.users ?? [])
      .filter((x) => (x.app_metadata as Record<string, unknown> | null)?.role === "admin")
      .map((x) => x.email ?? "")
      .filter(Boolean);
  } catch {
    /* fallback abaixo */
  }
  if (admins.length === 0) admins = [FALLBACK_ADMIN];

  const totalmenteAssinado = !signLink; // sem link de assinatura pendente => presencial / completo
  const msgAdmin = totalmenteAssinado ? relatorioAssinadoEmail(resumo) : relatorioFinalizadoEmail(resumo);

  try {
    await sendEmail(resendKey, admins, { ...msgAdmin, attachments: attachment });
  } catch (e) {
    return json({ error: "Falha ao enviar aos admins: " + (e instanceof Error ? e.message : String(e)) }, 502);
  }

  // ── Cliente ──────────────────────────────────────────────────────
  let clienteNotificado = false;
  if (validEmail(clienteEmail)) {
    try {
      if (signLink) {
        // aguardando assinatura remota → manda o link
        await sendEmail(resendKey, clienteEmail, assinarClienteEmail(signLink, resumo));
      } else {
        // já assinado presencialmente → manda o PDF assinado
        await sendEmail(resendKey, clienteEmail, { ...relatorioAssinadoEmail(resumo), attachments: attachment });
      }
      clienteNotificado = true;
    } catch (_) {
      /* não bloqueia: admins já foram notificados */
    }
  }

  return json({ ok: true, admins: admins.length, clienteNotificado });
});
