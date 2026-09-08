import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  cleanText,
  clientAddress,
  consumeRateLimit,
  corsHeaders,
  isAllowedOrigin,
  json,
  readJsonLimited,
} from "../_shared/security.ts";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC_RESPONSE = {
  accepted: true,
  message: "Se houver um convite administrativo válido, as instruções serão enviadas.",
};

function exactConfiguredOrigin(req: Request) {
  const requestOrigin = req.headers.get("Origin")?.replace(/\/$/, "") ?? "";
  const configuredOrigin = Deno.env.get("CMS_ADMIN_ORIGIN")?.replace(/\/$/, "") ?? "";
  try {
    const configured = new URL(configuredOrigin);
    return configured.pathname === "/" && configured.origin === requestOrigin ? configured.origin : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (!isAllowedOrigin(req)) return json(req, { error: "Origem não autorizada." }, 403);
  if (req.method !== "POST") return json(req, { error: "Método não permitido." }, 405);

  const adminOrigin = exactConfiguredOrigin(req);
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!adminOrigin || !url || !anonKey || !serviceRole) {
    return json(req, { error: "Serviço temporariamente indisponível." }, 503);
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonLimited(req, 1_024);
  } catch {
    return json(req, { error: "Solicitação inválida." }, 400);
  }
  const email = cleanText(body.email, 320).toLowerCase();
  const admin = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  try {
    const address = clientAddress(req);
    const [addressAllowed, identityAllowed] = await Promise.all([
      consumeRateLimit(admin, req, "cms_recovery_address", address, 10, 3_600),
      consumeRateLimit(admin, req, "cms_recovery_identity", email, 5, 3_600),
    ]);
    if (!addressAllowed || !identityAllowed) {
      return json(req, { error: "Muitas solicitações. Aguarde e tente novamente." }, 429);
    }
  } catch {
    return json(req, { error: "Serviço de proteção temporariamente indisponível." }, 503);
  }

  // Entrada malformada, identidade ausente e identidade sem perfil CMS recebem
  // exatamente a mesma resposta. Somente o ramo nominal abaixo toca o Auth.
  if (!EMAIL.test(email)) return json(req, GENERIC_RESPONSE, 202);
  const profiles = await admin
    .from("cms_profiles")
    .select("user_id,status")
    .eq("display_email", email)
    .in("status", ["invited", "active"])
    .limit(2);
  if (profiles.error) return json(req, { error: "Serviço temporariamente indisponível." }, 503);
  if (profiles.data.length !== 1) return json(req, GENERIC_RESPONSE, 202);

  const profile = profiles.data[0];
  const identity = await admin.auth.admin.getUserById(profile.user_id);
  if (identity.error || identity.data.user?.email?.toLowerCase() !== email) {
    return json(req, GENERIC_RESPONSE, 202);
  }

  const mailer = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const correlationId = crypto.randomUUID();
  const requestedAudit = await admin.from("cms_audit_log").insert({
    actor_id: profile.user_id,
    action: "cms:auth.recovery_requested",
    target_type: "profile",
    target_id: profile.user_id,
    event_data: {
      schemaVersion: 1,
      result: "authorized",
      channel: "supabase_auth",
    },
    correlation_id: correlationId,
  });
  // A entrega nunca ocorre sem uma trilha sanitizada previamente persistida.
  if (requestedAudit.error) {
    return json(req, { error: "Serviço temporariamente indisponível." }, 503);
  }

  const delivery = await mailer.auth.resetPasswordForEmail(email, {
    redirectTo: `${adminOrigin}/admin/definir-senha`,
  });
  if (delivery.error) {
    const failureAudit = await admin.from("cms_audit_log").insert({
      actor_id: profile.user_id,
      action: "cms:auth.recovery_delivery_failed",
      target_type: "profile",
      target_id: profile.user_id,
      event_data: {
        schemaVersion: 1,
        result: "failed",
        channel: "supabase_auth",
      },
      correlation_id: correlationId,
    });
    if (failureAudit.error) {
      return json(req, { error: "Serviço temporariamente indisponível." }, 503);
    }
  }

  // Falhas do provedor também não alteram a resposta pública. Diagnóstico fica
  // restrito à auditoria administrativa sem e-mail, token ou link de ação.
  return json(req, GENERIC_RESPONSE, 202);
});
