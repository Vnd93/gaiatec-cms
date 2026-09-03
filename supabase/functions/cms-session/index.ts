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

const ACTION_EVENT = {
  resolve: "login_success",
  mfa: "mfa_challenge",
  recovery: "recovery",
  logout: "logout",
} as const;

type Action = keyof typeof ACTION_EVENT;

function verifiedClaims(authHeader: string) {
  try {
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const parsed = JSON.parse(atob(normalized)) as Record<string, unknown>;
    const sessionId = cleanText(parsed.session_id, 200);
    const issuedAt = Number(parsed.iat);
    const aal = parsed.aal === "aal2" ? "aal2" : "aal1";
    if (!sessionId || !Number.isSafeInteger(issuedAt) || issuedAt <= 0) return null;
    return { aal, sessionId, issuedAt: new Date(issuedAt * 1000).toISOString() };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (!isAllowedOrigin(req)) return json(req, { error: "Origem não autorizada." }, 403);
  if (req.method !== "POST") return json(req, { error: "Método não permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceRole) return json(req, { error: "Serviço indisponível." }, 503);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: authData, error: authError } = await caller.auth.getUser(token);
  const claims = verifiedClaims(authHeader);
  if (authError || !authData.user || !claims) return json(req, { error: "Sessão inválida." }, 401);

  let body: Record<string, unknown>;
  try {
    body = await readJsonLimited(req, 1_024);
  } catch {
    return json(req, { error: "Corpo inválido." }, 400);
  }
  const action = cleanText(body.action, 20) as Action;
  if (!(action in ACTION_EVENT)) return json(req, { error: "Ação inválida." }, 400);

  const admin = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  try {
    // A resolução ocorre em toda inicialização segura do painel e também após
    // renovações de token. Ela já exige um JWT válido e não deve compartilhar o
    // limite mais restritivo reservado a desafios e recuperação.
    const limit = action === "resolve" ? 300 : action === "mfa" || action === "recovery" ? 30 : 60;
    const allowed = await consumeRateLimit(
      admin,
      req,
      `cms_session_${action}`,
      `${authData.user.id}:${clientAddress(req)}`,
      limit,
      900,
    );
    if (!allowed) return json(req, { error: "Muitas tentativas. Aguarde e tente novamente." }, 429);
  } catch {
    return json(req, { error: "Serviço de proteção indisponível." }, 503);
  }

  const { data, error } = await admin.rpc("cms_resolve_session", {
    p_user_id: authData.user.id,
    p_event_type: ACTION_EVENT[action],
    p_aal: claims.aal,
    p_session_id: claims.sessionId,
    p_issued_at: claims.issuedAt,
    p_correlation_id: crypto.randomUUID(),
  });
  if (error) {
    const forbidden = error.code === "42501";
    return json(
      req,
      { error: forbidden ? "Conta sem acesso administrativo ativo." : "Não foi possível validar a sessão." },
      forbidden ? 403 : 500,
    );
  }

  const configuredEnvironment = Deno.env.get("CMS_ENVIRONMENT");
  if (configuredEnvironment === "local" || configuredEnvironment === "staging") {
    const scope = {
      p_actor_id: authData.user.id,
      p_environment: configuredEnvironment,
      p_site_key: "main",
      p_aal: claims.aal,
      p_session_id: claims.sessionId,
      p_issued_at: claims.issuedAt,
    };
    const { data: capability, error: capabilityError } = await admin.rpc(
      "cms_rbac_scope_capability",
      scope,
    );
    if (
      capabilityError &&
      capabilityError.code !== "PGRST202" &&
      capabilityError.code !== "42883"
    )
      return json(req, { error: "Não foi possível resolver a política de acesso." }, 503);
    if (
      !capabilityError &&
      capability?.enabled !== true &&
      ["scope_context_ambiguous", "scope_environment_mismatch"].includes(capability?.reasonCode)
    )
      return json(req, { error: "A política de acesso está em estado seguro de bloqueio." }, 403);
    if (!capabilityError && capability?.enabled === true) {
      const { data: scopedAccess, error: scopedError } = await admin.rpc(
        "cms_resolve_scoped_access",
        scope,
      );
      if (scopedError || !scopedAccess)
        return json(req, { error: "Não foi possível resolver o acesso escopado." }, 503);
      return json(req, { ...data, ...scopedAccess });
    }
  }
  return json(req, data);
});
