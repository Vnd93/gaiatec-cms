// supabase/functions/rdo-team/index.ts
// Lista os usuários do sistema (equipe + convites). Somente ADMIN.
// Usa service_role (nunca sai do servidor) para ler auth.users.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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

  const admin = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
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
  }));
  // mais recentes primeiro
  users.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));

  return json({ users });
});
