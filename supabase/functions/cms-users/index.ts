import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { cleanText, clientAddress, consumeRateLimit, corsHeaders, isAllowedOrigin, json, readJsonLimited } from "../_shared/security.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLE = /^[a-z][a-z0-9_]{1,63}$/;
const ACTIONS = new Set(["list", "invite", "resend_invite", "set_roles", "suspend", "reactivate", "revoke_sessions"]);

type Claims = { aal: "aal1" | "aal2"; sessionId: string; issuedAt: string };

function verifiedClaims(authHeader: string): Claims | null {
  try {
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
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

function commandInput(body: Record<string, unknown>) {
  const action = cleanText(body.action, 30);
  const userId = cleanText(body.userId, 40);
  const email = cleanText(body.email, 320).toLowerCase();
  const displayName = cleanText(body.displayName, 120);
  const idempotencyKey = cleanText(body.idempotencyKey, 40);
  const roles = Array.isArray(body.roles)
    ? [...new Set(body.roles.map((role) => cleanText(role, 64)).filter((role) => ROLE.test(role)))].sort()
    : [];
  return { action, userId, email, displayName, idempotencyKey, roles };
}

async function authorize(admin: SupabaseClient, actorId: string, permission: string, claims: Claims): Promise<boolean> {
  const { data, error } = await admin.rpc("cms_actor_authorized", {
    p_actor_id: actorId,
    p_permission: permission,
    p_aal: claims.aal,
    p_session_id: claims.sessionId,
    p_issued_at: claims.issuedAt,
  });
  return !error && data === true;
}

async function listUsers(req: Request, admin: SupabaseClient, actorId: string, claims: Claims) {
  if (!(await authorize(admin, actorId, "cms:users.read", claims))) return json(req, { error: "Acesso administrativo insuficiente." }, 403);

  const [{ data: profiles, error: profilesError }, { data: assignedRoles, error: rolesError }] = await Promise.all([
    admin
      .from("cms_profiles")
      .select("user_id,display_name,display_email,status,mfa_enrolled_at,last_sign_in_at,last_seen_at,invited_at,suspended_at,sessions_valid_after")
      .order("display_name"),
    admin.from("cms_user_roles").select("user_id,role_key").order("role_key"),
  ]);
  if (profilesError || rolesError) return json(req, { error: "Não foi possível consultar os usuários." }, 500);

  const rolesByUser = new Map<string, string[]>();
  for (const role of assignedRoles ?? []) {
    const roles = rolesByUser.get(role.user_id) ?? [];
    roles.push(role.role_key);
    rolesByUser.set(role.user_id, roles);
  }
  return json(req, {
    users: (profiles ?? []).map((profile) => ({ ...profile, roles: rolesByUser.get(profile.user_id) ?? [], is_self: profile.user_id === actorId })),
  });
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
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data: authData, error: authError } = await caller.auth.getUser(token);
  const claims = verifiedClaims(authHeader);
  if (authError || !authData.user || !claims) return json(req, { error: "Sessão inválida." }, 401);

  const admin = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  let body: Record<string, unknown>;
  try {
    body = await readJsonLimited(req, 8_192);
  } catch {
    return json(req, { error: "Corpo inválido." }, 400);
  }

  const input = commandInput(body);
  if (!ACTIONS.has(input.action)) return json(req, { error: "Comando inválido." }, 400);

  try {
    const limit = input.action === "invite" || input.action === "resend_invite" ? 10 : 120;
    const windowSeconds = input.action === "invite" || input.action === "resend_invite" ? 3600 : 900;
    const allowed = await consumeRateLimit(admin, req, `cms_users_${input.action}`, `${authData.user.id}:${clientAddress(req)}`, limit, windowSeconds);
    if (!allowed) return json(req, { error: "Muitas operações. Aguarde e tente novamente." }, 429);
  } catch {
    return json(req, { error: "Serviço de proteção indisponível." }, 503);
  }

  if (input.action === "list") return listUsers(req, admin, authData.user.id, claims);
  if (!UUID.test(input.idempotencyKey)) return json(req, { error: "Identificador da solicitação inválido." }, 400);

  const permission =
    input.action === "invite" || input.action === "resend_invite"
      ? "cms:users.invite"
      : input.action === "set_roles"
        ? "cms:users.manage"
        : input.action === "suspend" || input.action === "reactivate"
          ? "cms:users.suspend"
          : "cms:sessions.revoke";
  if (!(await authorize(admin, authData.user.id, permission, claims))) return json(req, { error: "Operação não autorizada." }, 403);

  let targetUserId = input.userId;
  let createdAuthUser = false;
  const correlationId = crypto.randomUUID();
  const releaseReservation = async () => {
    await admin
      .from("cms_command_receipts")
      .delete()
      .eq("actor_id", authData.user.id)
      .eq("action", input.action)
      .eq("idempotency_key", input.idempotencyKey)
      .eq("correlation_id", correlationId);
  };
  const { data: reservation, error: reservationError } = await admin.rpc("cms_reserve_user_command", {
    p_actor_id: authData.user.id,
    p_action: input.action,
    p_target_user_id: UUID.test(targetUserId) ? targetUserId : null,
    p_aal: claims.aal,
    p_session_id: claims.sessionId,
    p_issued_at: claims.issuedAt,
    p_idempotency_key: input.idempotencyKey,
    p_correlation_id: correlationId,
  });
  if (reservationError) return json(req, { error: reservationError.code === "42501" ? "Operação não autorizada." : "Não foi possível reservar a operação." }, reservationError.code === "42501" ? 403 : 409);
  if (reservation?.duplicate === true) return json(req, reservation);
  if (reservation?.reserved !== true) return json(req, { error: "Operação idempotente já está em processamento." }, 409);

  if (input.action === "invite") {
    if (!EMAIL.test(input.email) || !input.displayName || input.roles.length === 0) {
      await releaseReservation();
      return json(req, { error: "Dados do convite inválidos." }, 400);
    }
    const adminOrigin = Deno.env.get("CMS_ADMIN_ORIGIN");
    if (!adminOrigin) {
      await releaseReservation();
      return json(req, { error: "Envio de convite indisponível." }, 503);
    }
    const { data, error } = await admin.auth.admin.inviteUserByEmail(input.email, {
      redirectTo: `${adminOrigin.replace(/\/$/, "")}/admin/definir-senha`,
      data: { display_name: input.displayName },
    });
    if (error || !data.user?.id) {
      await releaseReservation();
      return json(req, { error: "Não foi possível criar o convite; verifique se o usuário já existe." }, 400);
    }
    targetUserId = data.user.id;
    createdAuthUser = true;
  }

  if (input.action === "resend_invite") {
    if (!UUID.test(targetUserId)) {
      await releaseReservation();
      return json(req, { error: "Usuário inválido." }, 400);
    }
    const adminOrigin = Deno.env.get("CMS_ADMIN_ORIGIN");
    const { data: profile } = await admin.from("cms_profiles").select("display_email,display_name,status").eq("user_id", targetUserId).maybeSingle();
    if (!adminOrigin || profile?.status !== "invited" || !profile.display_email) {
      await releaseReservation();
      return json(req, { error: "Convite pendente não encontrado." }, 409);
    }
    const mailer = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
    const { error } = await mailer.auth.resetPasswordForEmail(profile.display_email, {
      redirectTo: `${adminOrigin.replace(/\/$/, "")}/admin/definir-senha`,
    });
    if (error) {
      await releaseReservation();
      return json(req, { error: "Não foi possível gerar um novo convite." }, 400);
    }
  }

  if (!UUID.test(targetUserId)) {
    await releaseReservation();
    return json(req, { error: "Usuário inválido." }, 400);
  }

  if (input.action === "reactivate") {
    const { error } = await admin.auth.admin.updateUserById(targetUserId, { ban_duration: "none" });
    if (error) {
      await releaseReservation();
      return json(req, { error: "Não foi possível reativar a identidade." }, 502);
    }
  }

  const { data: result, error: commandError } = await admin.rpc("cms_apply_user_command", {
    p_actor_id: authData.user.id,
    p_action: input.action,
    p_target_user_id: targetUserId,
    p_display_name: input.displayName || null,
    p_display_email: input.email || null,
    p_role_keys: input.roles,
    p_aal: claims.aal,
    p_session_id: claims.sessionId,
    p_issued_at: claims.issuedAt,
    p_idempotency_key: input.idempotencyKey,
    p_correlation_id: correlationId,
  });

  if (commandError) {
    if (createdAuthUser) await admin.auth.admin.deleteUser(targetUserId).catch(() => undefined);
    await releaseReservation();
    const forbidden = commandError.code === "42501";
    return json(req, { error: forbidden ? "Operação não autorizada." : "Não foi possível concluir a operação." }, forbidden ? 403 : 409);
  }

  if (input.action === "suspend") {
    const { error } = await admin.auth.admin.updateUserById(targetUserId, { ban_duration: "876000h" });
    if (error) return json(req, { error: "Acesso ao CMS suspenso, mas a identidade não pôde ser bloqueada." }, 502);
  }
  if (input.action === "revoke_sessions") {
    await admin.auth.admin.updateUserById(targetUserId, { ban_duration: "1s" }).catch(() => undefined);
  }

  return json(req, result);
});
