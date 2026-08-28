import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { otpEmail, sendEmail } from "../_shared/email.ts";
import { clientAddress, consumeRateLimit, corsHeaders, isAllowedOrigin, json, readJsonLimited } from "../_shared/security.ts";

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const generic = (req: Request) => json(req, { ok: true, message: "Se o acesso estiver ativo, o código será enviado." });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (!isAllowedOrigin(req)) return json(req, { error: "Origem não autorizada." }, 403);
  if (req.method !== "POST") return json(req, { error: "Método não permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!url || !serviceRole || !resendKey) return json(req, { error: "Serviço indisponível." }, 503);

  let email = "";
  try {
    const body = await readJsonLimited<{ email?: unknown }>(req, 2_048);
    email = String(body.email ?? "").trim().toLowerCase();
  } catch (error) {
    return json(req, { error: error instanceof Error && error.message === "PAYLOAD_TOO_LARGE" ? "Corpo excede o limite." : "Corpo inválido." }, 400);
  }
  if (!isEmail(email) || email.length > 254) return json(req, { error: "Informe um e-mail válido." }, 400);

  const admin = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
  try {
    const ipAllowed = await consumeRateLimit(admin, req, "rdo_otp_ip", clientAddress(req), 10, 900);
    const emailAllowed = await consumeRateLimit(admin, req, "rdo_otp_email", email, 3, 900);
    if (!ipAllowed || !emailAllowed) return json(req, { error: "Muitas tentativas. Aguarde antes de tentar novamente." }, 429);
  } catch {
    return json(req, { error: "Serviço de proteção indisponível." }, 503);
  }

  // Não cria usuário. Acesso exige convite nominal e allowlist ativa no RDO.
  const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) return json(req, { error: "Serviço indisponível." }, 503);
  const user = listed.users.find((candidate) => candidate.email?.toLowerCase() === email);
  if (!user) return generic(req);

  const { data: access } = await admin.from("rdo_user_access").select("active").eq("user_id", user.id).maybeSingle();
  if (!access?.active) return generic(req);

  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.email_otp) return generic(req);

  try {
    await sendEmail(resendKey, email, otpEmail(data.properties.email_otp));
  } catch {
    return json(req, { error: "Não foi possível enviar o código agora." }, 502);
  }
  return generic(req);
});
