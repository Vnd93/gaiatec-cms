import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { inviteEmail, sendEmail } from "../_shared/email.ts";
import { cleanText, clientAddress, consumeRateLimit, corsHeaders, isAllowedOrigin, json, readJsonLimited } from "../_shared/security.ts";

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

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
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false } });
  const { data: authData, error: authError } = await caller.auth.getUser();
  if (authError || !authData.user) return json(req, { error: "Sessão inválida." }, 401);
  const admin = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: callerAccess } = await admin.from("rdo_user_access").select("active,role").eq("user_id", authData.user.id).maybeSingle();
  if (!callerAccess?.active || callerAccess.role !== "rdo_admin") return json(req, { error: "Apenas administradores RDO podem convidar." }, 403);

  let email = "";
  try {
    const body = await readJsonLimited<Record<string, unknown>>(req, 2_048);
    email = cleanText(body.email, 254).toLowerCase();
  } catch {
    return json(req, { error: "Corpo inválido." }, 400);
  }
  if (!isEmail(email)) return json(req, { error: "Informe um e-mail válido." }, 400);

  try {
    const allowed = await consumeRateLimit(admin, req, "rdo_invite", `${authData.user.id}:${clientAddress(req)}`, 10, 3600);
    if (!allowed) return json(req, { error: "Limite de convites atingido. Tente mais tarde." }, 429);
  } catch {
    return json(req, { error: "Serviço de proteção indisponível." }, 503);
  }

  const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email, options: { redirectTo: `${publicOrigin}/relatorio-de-obra/definir-senha` } });
  if (error || !data.user?.id || !data.properties?.action_link) return json(req, { error: "Não foi possível criar o convite; revise se o usuário já existe." }, 400);

  const { error: accessError } = await admin.from("rdo_user_access").upsert({ user_id: data.user.id, role: "rdo_member", active: true, invited_by: authData.user.id, invited_at: new Date().toISOString(), suspended_at: null, suspended_by: null });
  if (accessError) return json(req, { error: "Convite criado, mas o escopo RDO não pôde ser concedido." }, 500);

  try {
    await sendEmail(resendKey, email, inviteEmail(data.properties.action_link));
  } catch {
    return json(req, { error: "Convite criado, mas o e-mail falhou; use o reenvio seguro." }, 502);
  }
  return json(req, { ok: true, email });
});
