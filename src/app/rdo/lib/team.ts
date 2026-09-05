import { supabase } from "@/lib/supabase";

export interface TeamUser {
  id: string;
  email: string;
  role: "admin" | "membro";
  active: boolean;
  created_at: string | null;
  last_sign_in_at: string | null;
  invited_at: string | null;
  confirmed_at: string | null;
  suspended_at: string | null;
  is_self: boolean;
}

export type UserStatus = "ativo" | "pendente" | "suspenso";

export function statusOf(u: TeamUser): UserStatus {
  if (!u.active) return "suspenso";
  if (u.last_sign_in_at) return "ativo";
  if (u.invited_at) return "pendente";
  return "pendente";
}

/** Chama a função rdo-team com um corpo, tratando erros HTTP. */
async function callTeam<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("rdo-team", { body });
  if (error) {
    let msg = "Ação indisponível.";
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx?.json) {
        const j = await ctx.json();
        if (j?.error) msg = j.error;
      }
    } catch {
      /* mantém msg padrão */
    }
    throw new Error(msg);
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

/** Lista a equipe (somente admin — validado na Edge Function). */
export async function listTeam(): Promise<TeamUser[]> {
  const data = await callTeam<{ users: TeamUser[] }>({});
  return data.users ?? [];
}

/** Promove (admin) ou rebaixa (membro) um usuário. */
export async function setUserRole(userId: string, role: "admin" | "membro"): Promise<void> {
  await callTeam({ action: "set_role", userId, role });
}

/** Suspende/revoga o acesso preservando autoria e auditoria. */
export async function deleteTeamUser(userId: string): Promise<void> {
  await callTeam({ action: "suspend", userId });
}

export async function reactivateTeamUser(userId: string): Promise<void> {
  await callTeam({ action: "reactivate", userId });
}

/** Gera um novo link de acesso (definir senha) para reenviar a um usuário. */
export async function resendInvite(userId: string, email: string): Promise<string | null> {
  const data = await callTeam<{ link: string | null }>({ action: "resend", userId, email });
  return data.link ?? null;
}

/** Contagem de relatórios por usuário (created_by). */
export async function reportCountsByUser(): Promise<Record<string, { total: number; finalizados: number }>> {
  const { data, error } = await supabase.from("rdo_relatorios").select("created_by,status");
  const map: Record<string, { total: number; finalizados: number }> = {};
  if (error || !data) return map;
  for (const r of data as { created_by: string | null; status: string }[]) {
    if (!r.created_by) continue;
    const m = (map[r.created_by] ??= { total: 0, finalizados: 0 });
    m.total++;
    if (r.status === "finalizado") m.finalizados++;
  }
  return map;
}
