import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { recoveryEmail, sendEmail } from "../_shared/email.ts";
import { cleanText, clientAddress, consumeRateLimit, corsHeaders, isAllowedOrigin, json, readJsonLimited } from "../_shared/security.ts";

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

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
  if (!callerAccess?.active || callerAccess.role !== "rdo_admin") return json(req, { error: "Apenas administradores RDO." }, 403);

  let body: Record<string, unknown> = {};
  try {
    body = await readJsonLimited(req, 4_096);
  } catch {
    return json(req, { error: "Corpo inválido." }, 400);
  }
  const action = cleanText(body.action, 30);

  try {
    const allowed = await consumeRateLimit(admin, req, "rdo_team", `${authData.user.id}:${clientAddress(req)}`, 60, 900);
    if (!allowed) return json(req, { error: "Muitas operações. Aguarde e tente novamente." }, 429);
  } catch {
    return json(req, { error: "Serviço de proteção indisponível." }, 503);
  }

  if (action === "set_role") {
    const userId = cleanText(body.userId, 40);
    const role = body.role === "admin" ? "rdo_admin" : "rdo_member";
    if (!isUuid(userId)) return json(req, { error: "Usuário inválido." }, 400);
    if (userId === authData.user.id && role !== "rdo_admin") return json(req, { error: "Você não pode remover seu próprio papel administrativo." }, 400);
    const { error } = await admin.from("rdo_user_access").update({ role, updated_at: new Date().toISOString() }).eq("user_id", userId);
    if (error) return json(req, { error: "Não foi possível alterar o papel." }, 400);
    return json(req, { ok: true, role: role === "rdo_admin" ? "admin" : "membro" });
  }

  if (action === "suspend" || action === "delete") {
    const userId = cleanText(body.userId, 40);
    if (!isUuid(userId)) return json(req, { error: "Usuário inválido." }, 400);
    if (userId === authData.user.id) return json(req, { error: "Você não pode suspender seu próprio acesso." }, 400);
    const { error } = await admin.from("rdo_user_access").update({ active: false, suspended_at: new Date().toISOString(), suspended_by: authData.user.id, updated_at: new Date().toISOString() }).eq("user_id", userId);
    if (error) return json(req, { error: "Não foi possível suspender o acesso." }, 400);
    await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" }).catch(() => undefined);
    return json(req, { ok: true });
  }

  if (action === "reactivate") {
    const userId = cleanText(body.userId, 40);
    if (!isUuid(userId)) return json(req, { error: "Usuário inválido." }, 400);
    const { error } = await admin.from("rdo_user_access").update({ active: true, suspended_at: null, suspended_by: null, updated_at: new Date().toISOString() }).eq("user_id", userId);
    if (error) return json(req, { error: "Não foi possível reativar o acesso." }, 400);
    await admin.auth.admin.updateUserById(userId, { ban_duration: "none" }).catch(() => undefined);
    return json(req, { ok: true });
  }

  if (action === "resend") {
    const userId = cleanText(body.userId, 40);
    const email = cleanText(body.email, 254).toLowerCase();
    if (!isUuid(userId) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(req, { error: "Usuário/e-mail inválido." }, 400);
    const { data: access } = await admin.from("rdo_user_access").select("active").eq("user_id", userId).maybeSingle();
    if (!access?.active) return json(req, { error: "Reative o acesso antes de reenviar." }, 409);
    const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo: `${publicOrigin}/relatorio-de-obra/definir-senha` } });
    if (error || !data.properties?.action_link) return json(req, { error: "Não foi possível gerar o link." }, 400);
    try {
      await sendEmail(resendKey, email, recoveryEmail(data.properties.action_link));
    } catch {
      return json(req, { error: "Link gerado, mas o envio falhou." }, 502);
    }
    return json(req, { ok: true });
  }

  const [{ data: listed, error: usersError }, { data: accesses, error: accessError }] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin.from("rdo_user_access").select("user_id,role,active,invited_at,suspended_at"),
  ]);
  if (usersError || accessError) return json(req, { error: "Não foi possível listar a equipe." }, 500);
  const byId = new Map((accesses ?? []).map((access) => [access.user_id, access]));
  const users = (listed?.users ?? []).map((user) => {
    const access = byId.get(user.id);
    return {
      id: user.id,
      email: user.email ?? "",
      role: access?.role === "rdo_admin" ? "admin" : "membro",
      active: access?.active === true,
      created_at: user.created_at ?? null,
      last_sign_in_at: user.last_sign_in_at ?? null,
      invited_at: access?.invited_at ?? null,
      confirmed_at: user.confirmed_at ?? user.email_confirmed_at ?? null,
      suspended_at: access?.suspended_at ?? null,
      is_self: user.id === authData.user.id,
    };
  });
  return json(req, { users });
});
