// supabase/functions/submit-contact/index.ts
// Recebe POST do form de contato no site → salva em `leads` + envia email
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

interface ContactPayload {
  firstName: string;
  lastName?: string;
  email: string;
  phone?: string;
  company?: string;
  enquiryType?: string;
  message: string;
  consent: boolean;
  origem?: string; // ex: "/", "/produto/X"
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = (await req.json()) as ContactPayload;

    // ─── Validação ───
    if (!body.firstName || !body.email || !body.message) {
      return json({ error: "Campos obrigatórios faltando: nome, email e mensagem." }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      return json({ error: "E-mail inválido." }, 400);
    }
    if (!body.consent) {
      return json({ error: "Você precisa concordar com a Política de Privacidade." }, 400);
    }

    // ─── Insere em `leads` ───
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const fullName = `${body.firstName}${body.lastName ? " " + body.lastName : ""}`.trim();

    const observacoes = [
      body.enquiryType ? `Tipo: ${body.enquiryType}` : null,
      body.origem ? `Origem: ${body.origem}` : null,
      "",
      "Mensagem:",
      body.message.trim(),
      "",
      `Consentimento LGPD: ${body.consent ? "Sim" : "Não"}`,
      `IP: ${req.headers.get("CF-Connecting-IP") ?? "—"}`,
      `User-Agent: ${(req.headers.get("User-Agent") ?? "—").slice(0, 200)}`,
    ]
      .filter((l) => l !== null)
      .join("\n");

    const { data: lead, error: insertError } = await supabase
      .from("leads")
      .insert({
        nome: fullName,
        empresa: body.company?.trim() || null,
        email: body.email.toLowerCase().trim(),
        telefone: body.phone?.trim() || null,
        fonte: "website",
        status: "novo",
        observacoes,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return json({ error: "Erro ao registrar contato. Tente novamente." }, 500);
    }

    // ─── Envia email via Resend (não-bloqueante) ───
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const notifyEmail = Deno.env.get("CONTACT_NOTIFY_EMAIL") || "contato@gaiatecsistemas.com.br";

    if (resendKey) {
      try {
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Site Gaiatec <onboarding@resend.dev>",
            to: [notifyEmail],
            reply_to: body.email,
            subject: `Novo contato no site — ${body.enquiryType || "Geral"} (${fullName})`,
            html: `
              <div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #0f172a;">
                <div style="background: linear-gradient(135deg, #0057DE, #0046b3); padding: 24px 32px; color: white;">
                  <h1 style="margin: 0; font-size: 22px;">📬 Novo contato pelo site</h1>
                  <p style="margin: 4px 0 0; opacity: 0.9; font-size: 14px;">gaiatecsistemas.com.br</p>
                </div>
                <div style="padding: 32px; background: #ffffff; border: 1px solid #e2e8f0; border-top: none;">
                  <table style="width: 100%; border-collapse: collapse;">
                    <tr><td style="padding: 8px 0; color: #64748b; font-size: 13px; width: 130px;">Nome</td><td style="padding: 8px 0; font-weight: 600;">${escapeHtml(fullName)}</td></tr>
                    <tr><td style="padding: 8px 0; color: #64748b; font-size: 13px;">Email</td><td style="padding: 8px 0;"><a href="mailto:${escapeHtml(body.email)}" style="color: #0057DE;">${escapeHtml(body.email)}</a></td></tr>
                    <tr><td style="padding: 8px 0; color: #64748b; font-size: 13px;">Telefone</td><td style="padding: 8px 0;"><a href="tel:${escapeHtml(body.phone || "")}" style="color: #0057DE;">${escapeHtml(body.phone || "—")}</a></td></tr>
                    <tr><td style="padding: 8px 0; color: #64748b; font-size: 13px;">Empresa</td><td style="padding: 8px 0;">${escapeHtml(body.company || "—")}</td></tr>
                    <tr><td style="padding: 8px 0; color: #64748b; font-size: 13px;">Tipo</td><td style="padding: 8px 0;"><span style="background: #f1f5f9; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600;">${escapeHtml(body.enquiryType || "Não informado")}</span></td></tr>
                  </table>
                  <h3 style="margin: 24px 0 12px; font-size: 14px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Mensagem</h3>
                  <div style="padding: 16px; background: #f8fafc; border-left: 3px solid #0057DE; border-radius: 4px; line-height: 1.6;">
                    ${escapeHtml(body.message).replace(/\n/g, "<br>")}
                  </div>
                  <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0; text-align: center;">
                    <a href="https://erp.gaiatecsistemas.com.br/comercial/leads/${lead.id}" style="display: inline-block; background: #0057DE; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">Abrir no ERP →</a>
                  </div>
                </div>
                <div style="padding: 16px 32px; background: #f8fafc; color: #94a3b8; font-size: 11px; text-align: center;">
                  ID do lead: <code style="font-family: monospace;">${lead.id}</code>
                </div>
              </div>
            `,
          }),
        });
        if (!emailRes.ok) {
          console.error("Email send failed:", emailRes.status, await emailRes.text());
        }
      } catch (e) {
        console.error("Email error (non-critical):", e);
      }
    } else {
      console.warn("RESEND_API_KEY not set — skipping email notification");
    }

    return json({ success: true, id: lead.id });
  } catch (e) {
    console.error("Unexpected error:", e);
    return json({ error: "Erro inesperado. Tente novamente em alguns instantes." }, 500);
  }
});
