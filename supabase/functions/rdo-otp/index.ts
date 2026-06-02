// supabase/functions/rdo-otp/index.ts
// Login sem senha por CÓDIGO (OTP de 6 dígitos). Cadastro aberto: qualquer e-mail.
//  - POST { email } -> garante o usuário, gera o código (generateLink magiclink)
//    e envia e-mail branded via Resend. Throttle por e-mail (anti email-bombing).
// O código é verificado no cliente com supabase.auth.verifyOtp({type:'email'}).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { otpEmail, sendEmail } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const THROTTLE_SEG = 45;
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendKey = Deno.env.get("RESEND_API_KEY")!;

  let email = "";
  try {
    const body = await req.json();
    email = String(body?.email ?? "").trim().toLowerCase();
  } catch {
    return json({ error: "Corpo inválido." }, 400);
  }
  if (!isEmail(email)) return json({ error: "Informe um e-mail válido." }, 400);

  const admin = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });

  // Throttle por e-mail (anti email-bombing)
  const { data: t } = await admin.from("rdo_otp_throttle").select("last_sent_at").eq("email", email).maybeSingle();
  if (t?.last_sent_at && Date.now() - new Date(t.last_sent_at).getTime() < THROTTLE_SEG * 1000) {
    return json({ error: "Aguarde alguns segundos para pedir um novo código." }, 429);
  }
  await admin.from("rdo_otp_throttle").upsert({ email, last_sent_at: new Date().toISOString() });

  // Garante o usuário (cadastro aberto). Ignora "já registrado".
  await admin.auth.admin.createUser({ email, email_confirm: true }).catch(() => {});

  // Gera o código de 6 dígitos (sem enviar e-mail pelo GoTrue)
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) return json({ error: "Não foi possível gerar o código. Tente novamente." }, 400);
  const code = data.properties?.email_otp;
  if (!code) return json({ error: "Não foi possível gerar o código." }, 500);

  // Envia o e-mail branded via Resend
  try {
    await sendEmail(resendKey, email, otpEmail(code));
  } catch (e) {
    return json({ error: "Falha ao enviar o e-mail: " + (e instanceof Error ? e.message : String(e)) }, 502);
  }

  return json({ ok: true });
});
