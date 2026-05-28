// supabase/functions/rdo-invite/index.ts
// Convida um novo usuário para o app de Relatório de Obra.
// Só ADMIN (app_metadata.role === "admin") pode chamar. Usa service_role
// para enviar o convite por e-mail (inviteUserByEmail) com redirect para
// a página de definir senha. O service_role nunca sai do servidor.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { inviteEmail, sendEmail } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const REDIRECT_TO = "https://gaiatecsistemas.com.br/relatorio-de-obra/definir-senha";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "Não autenticado." }, 401);

  // 1) Identifica o chamador a partir do token
  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Sessão inválida." }, 401);

  // 2) Garante que é admin
  const role = (userData.user.app_metadata as Record<string, unknown> | null)?.role;
  if (role !== "admin") {
    return json({ error: "Apenas administradores podem enviar convites." }, 403);
  }

  // 3) Lê e valida o e-mail
  let email = "";
  try {
    const body = await req.json();
    email = String(body?.email ?? "").trim().toLowerCase();
  } catch {
    return json({ error: "Corpo inválido." }, 400);
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "Informe um e-mail válido." }, 400);
  }

  // 4) Gera o link de convite (cria o usuário) e envia o e-mail branded via Resend
  const admin = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo: REDIRECT_TO },
  });
  if (error) {
    const msg = /already|exist|registered/i.test(error.message)
      ? "Esse e-mail já tem acesso (ou já foi convidado)."
      : error.message;
    return json({ error: msg }, 400);
  }
  const link = data.properties?.action_link;
  if (!link) return json({ error: "Não foi possível gerar o link de convite." }, 500);

  try {
    await sendEmail(Deno.env.get("RESEND_API_KEY")!, email, inviteEmail(link));
  } catch (e) {
    return json({ error: "Convite criado, mas falhou ao enviar o e-mail: " + (e instanceof Error ? e.message : String(e)) }, 500);
  }

  return json({ ok: true, email });
});
