// supabase/functions/rdo-team/index.ts
// Equipe & convites (somente ADMIN). Usa service_role (nunca sai do servidor).
//  - POST sem action  -> lista usuários
//  - POST action=set_role { userId, role }  -> promove/rebaixa admin
//  - POST action=delete  { userId }          -> revoga acesso (remove usuário)
//  - POST action=resend  { email }           -> gera novo link de convite
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const REDIRECT_TO = "https://gaiatecsistemas.com.br/relatorio-de-obra/definir-senha";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "Não autenticado." }, 401);

  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: u, error: uErr } = await caller.auth.getUser();
  if (uErr || !u?.user) return json({ error: "Sessão inválida." }, 401);
  if ((u.user.app_metadata as Record<string, unknown> | null)?.role !== "admin") {
    return json({ error: "Apenas administradores." }, 403);
  }
  const callerId = u.user.id;

  const body = await req.json().catch(() => ({}));
  const action = (body as { action?: string }).action;
  const admin = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });

  // ── Ações de gestão ──────────────────────────────────────────────
  if (action === "set_role") {
    const { userId, role } = body as { userId?: string; role?: string };
    if (!userId) return json({ error: "userId ausente." }, 400);
    if (userId === callerId && role !== "admin")
      return json({ error: "Você não pode remover o seu próprio acesso de admin." }, 400);
    const novo = role === "admin" ? "admin" : "membro";
    const { error } = await admin.auth.admin.updateUserById(userId, { app_metadata: { role: novo } });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, role: novo });
  }

  if (action === "delete") {
    const { userId } = body as { userId?: string };
    if (!userId) return json({ error: "userId ausente." }, 400);
    if (userId === callerId) return json({ error: "Você não pode remover o seu próprio acesso." }, 400);
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  if (action === "resend") {
    const { userId, email } = body as { userId?: string; email?: string };
    if (!email) return json({ error: "email ausente." }, 400);
    // garante e-mail confirmado (necessário para gerar link de acesso a um convite pendente)
    if (userId) await admin.auth.admin.updateUserById(userId, { email_confirm: true }).catch(() => {});
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: REDIRECT_TO },
    });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, link: data.properties?.action_link ?? null });
  }

  // ── Padrão: listar ───────────────────────────────────────────────
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) return json({ error: error.message }, 500);

  const users = (data?.users ?? []).map((x) => ({
    id: x.id,
    email: x.email ?? "",
    role: (x.app_metadata as Record<string, unknown> | null)?.role === "admin" ? "admin" : "membro",
    created_at: x.created_at ?? null,
    last_sign_in_at: x.last_sign_in_at ?? null,
    invited_at: (x as { invited_at?: string }).invited_at ?? null,
    confirmed_at: x.confirmed_at ?? x.email_confirmed_at ?? null,
    is_self: x.id === callerId,
  }));
  users.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));

  return json({ users });
});
