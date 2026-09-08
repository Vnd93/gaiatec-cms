import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { listAllAuthUsers } from "../_shared/auth-admin-pagination.ts";
import { recoveryEmail, sendEmail } from "../_shared/email.ts";
import { classifyRdoAuthBan } from "../_shared/rdo-auth-ban.ts";
import { cleanText, clientAddress, consumeRateLimit, corsHeaders, isAllowedOrigin, json, readJsonLimited } from "../_shared/security.ts";

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

type AdminClient = SupabaseClient;
type RdoAccess = {
  user_id: string;
  role: "rdo_admin" | "rdo_member";
  active: boolean;
  invited_at: string | null;
  suspended_at: string | null;
  suspended_by: string | null;
};

async function listAllRdoAccess(admin: AdminClient) {
  const pageSize = 500;
  const accesses: RdoAccess[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await admin
      .from("rdo_user_access")
      .select("user_id,role,active,invited_at,suspended_at,suspended_by")
      .order("user_id")
      .range(offset, offset + pageSize - 1);
    if (error) return { accesses: [], error };
    const page = (data ?? []) as RdoAccess[];
    accesses.push(...page);
    if (page.length < pageSize) return { accesses, error: null };
  }
}

function teamCommandStatus(message: string) {
  if (message.includes("TARGET_NOT_ALLOWLISTED")) return 404;
  if (
    message.includes("SELF_PROTECTION") ||
    message.includes("LAST_ADMIN_PROTECTED")
  )
    return 409;
  if (message.includes("ACTOR_FORBIDDEN")) return 403;
  if (message.includes("INVALID")) return 400;
  return 500;
}

async function recordTeamAudit(
  admin: AdminClient,
  actorId: string,
  action: string,
  targetUserId: string,
  operationId: string | null,
  correlationId: string,
  errorCode?: string,
) {
  await admin.from("rdo_audit_events").insert({
    actor_id: actorId,
    action,
    event_data: {
      targetUserId,
      operationId,
      correlationId,
      ...(errorCode ? { errorCode } : {}),
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (!isAllowedOrigin(req)) return json(req, { error: "Origem não autorizada." }, 403);
  if (req.method !== "POST") return json(req, { error: "Método não permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const publicOrigin = Deno.env.get("PUBLIC_SITE_ORIGIN") ?? "https://gaiatecsistemas.com.br";
  if (!url || !anonKey || !serviceRole) return json(req, { error: "Serviço indisponível." }, 503);

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

  if (["set_role", "suspend", "delete", "reactivate"].includes(action)) {
    const userId = cleanText(body.userId, 40);
    const commandAction = action === "delete" ? "suspend" : action;
    const role =
      commandAction === "set_role"
        ? body.role === "admin"
          ? "rdo_admin"
          : body.role === "membro"
            ? "rdo_member"
            : null
        : null;
    if (!isUuid(userId) || (commandAction === "set_role" && !role))
      return json(req, { error: "Operação de usuário inválida." }, 400);

    let clearLegacyRdoBan = false;
    if (commandAction === "reactivate") {
      const [targetIdentity, targetAccess, targetProfile] = await Promise.all([
        admin.auth.admin.getUserById(userId),
        admin
          .from("rdo_user_access")
          .select("active,suspended_at,suspended_by")
          .eq("user_id", userId)
          .maybeSingle(),
        admin.from("cms_profiles").select("status").eq("user_id", userId).maybeSingle(),
      ]);
      if (targetIdentity.error || !targetIdentity.data.user || targetAccess.error || !targetAccess.data) {
        return json(req, { error: "Usuário RDO não encontrado." }, 404);
      }
      if (targetProfile.error) return json(req, { error: "Não foi possível validar a identidade." }, 503);
      const banClassification = classifyRdoAuthBan({
        bannedUntil: targetIdentity.data.user.banned_until,
        rdoActive: targetAccess.data.active,
        rdoSuspendedAt: targetAccess.data.suspended_at,
        rdoSuspendedBy: targetAccess.data.suspended_by,
        cmsProfileStatus: targetProfile.data?.status,
      });
      if (banClassification === "global_restriction") {
        await recordTeamAudit(
          admin,
          authData.user.id,
          "team.reactivate.auth_restriction_blocked",
          userId,
          null,
          crypto.randomUUID(),
          "global_auth_restriction",
        ).catch(() => undefined);
        return json(
          req,
          { error: "A identidade possui uma restrição global e não pode ser reativada pelo RDO." },
          409,
        );
      }
      clearLegacyRdoBan = banClassification === "legacy_rdo";
    }

    const operationId = crypto.randomUUID();
    const correlationId = crypto.randomUUID();

    // Remova primeiro apenas o ban legado inequivocamente escopado ao RDO.
    // Se o provedor Auth falhar, o registro RDO continua suspenso. Se o RPC
    // seguinte falhar, a identidade continua sem acesso RDO e uma nova
    // tentativa pode concluir a reativação sem abrir uma janela de acesso.
    if (clearLegacyRdoBan) {
      const cleared = await admin.auth.admin.updateUserById(userId, { ban_duration: "none" });
      const remainingBan = Date.parse(cleared.data.user?.banned_until ?? "");
      if (cleared.error || (Number.isFinite(remainingBan) && remainingBan > Date.now())) {
        await recordTeamAudit(
          admin,
          authData.user.id,
          "team.reactivate.legacy_auth_ban_clear_failed",
          userId,
          operationId,
          correlationId,
          "auth_unban_failed",
        ).catch(() => undefined);
        return json(req, { error: "Não foi possível concluir a reativação da identidade." }, 503);
      }
      await recordTeamAudit(
        admin,
        authData.user.id,
        "team.reactivate.legacy_auth_ban_cleared",
        userId,
        operationId,
        correlationId,
      ).catch(() => undefined);
    }

    const applied = await admin.rpc("rdo_apply_team_member_command", {
      p_actor_id: authData.user.id,
      p_target_id: userId,
      p_action: commandAction,
      p_role: role,
      p_operation_id: operationId,
      p_correlation_id: correlationId,
    });
    if (applied.error) {
      if (clearLegacyRdoBan) {
        await recordTeamAudit(
          admin,
          authData.user.id,
          "team.reactivate.legacy_auth_ban_cleared_rdo_pending",
          userId,
          operationId,
          correlationId,
          "rdo_reactivation_pending",
        ).catch(() => undefined);
      }
      const status = teamCommandStatus(applied.error.message ?? "");
      const error =
        status === 404
          ? "Usuário RDO não encontrado."
          : status === 403
            ? "Operação não autorizada."
            : status === 409
              ? "A operação violaria a proteção administrativa."
              : status === 400
                ? "Operação inválida."
                : "Não foi possível atualizar a equipe.";
      return json(req, { error }, status);
    }

    const state = applied.data as { role?: string; active?: boolean } | null;
    return json(req, {
      ok: true,
      active: state?.active === true,
      role: state?.role === "rdo_admin" ? "admin" : "membro",
    });
  }

  if (action === "resend") {
    const userId = cleanText(body.userId, 40);
    const email = cleanText(body.email, 254).toLowerCase();
    if (!isUuid(userId) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(req, { error: "Usuário/e-mail inválido." }, 400);
    if (!resendKey) return json(req, { error: "Serviço de e-mail indisponível." }, 503);
    const correlationId = crypto.randomUUID();
    const { data: access } = await admin.from("rdo_user_access").select("active").eq("user_id", userId).maybeSingle();
    if (!access?.active) return json(req, { error: "Reative o acesso antes de reenviar." }, 409);
    const target = await admin.auth.admin.getUserById(userId);
    const authoritativeEmail = target.data.user?.email?.trim().toLowerCase() ?? "";
    if (target.error || !authoritativeEmail) return json(req, { error: "Identidade RDO não encontrada." }, 404);
    if (email !== authoritativeEmail) return json(req, { error: "O e-mail não corresponde ao usuário RDO." }, 400);
    const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email: authoritativeEmail, options: { redirectTo: `${publicOrigin}/relatorio-de-obra/definir-senha` } });
    if (error || !data.properties?.action_link) return json(req, { error: "Não foi possível gerar o link." }, 400);
    try {
      await sendEmail(resendKey, authoritativeEmail, recoveryEmail(data.properties.action_link));
    } catch {
      await recordTeamAudit(admin, authData.user.id, "team.recovery_link.delivery_failed", userId, null, correlationId, "email_delivery_failed").catch(() => undefined);
      return json(req, { error: "Link gerado, mas o envio falhou." }, 502);
    }
    await recordTeamAudit(admin, authData.user.id, "team.recovery_link.sent", userId, null, correlationId).catch(() => undefined);
    return json(req, { ok: true });
  }

  if (action && action !== "list") return json(req, { error: "Ação inválida." }, 400);
  const [{ users: listed, error: usersError }, { accesses, error: accessError }] = await Promise.all([
    listAllAuthUsers(admin),
    listAllRdoAccess(admin),
  ]);
  if (usersError || accessError) return json(req, { error: "Não foi possível listar a equipe." }, 500);
  const byId = new Map(accesses.map((access) => [access.user_id, access]));
  const users = listed.flatMap((user) => {
    const access = byId.get(user.id);
    if (!access) return [];
    return {
      id: user.id,
      email: user.email ?? "",
      role: access.role === "rdo_admin" ? "admin" : "membro",
      active: access.active === true,
      created_at: user.created_at ?? null,
      last_sign_in_at: user.last_sign_in_at ?? null,
      invited_at: access.invited_at ?? null,
      confirmed_at: user.confirmed_at ?? user.email_confirmed_at ?? null,
      suspended_at: access.suspended_at ?? null,
      is_self: user.id === authData.user.id,
    };
  });
  return json(req, { users });
});
