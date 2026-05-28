import { supabase } from "@/lib/supabase";

export interface TeamUser {
  id: string;
  email: string;
  role: "admin" | "membro";
  created_at: string | null;
  last_sign_in_at: string | null;
  invited_at: string | null;
  confirmed_at: string | null;
}

export type UserStatus = "ativo" | "pendente" | "sem_acesso";

export function statusOf(u: TeamUser): UserStatus {
  if (u.last_sign_in_at) return "ativo";
  if (u.invited_at) return "pendente";
  return "sem_acesso";
}

/** Lista a equipe (somente admin — validado na Edge Function). */
export async function listTeam(): Promise<TeamUser[]> {
  const { data, error } = await supabase.functions.invoke("rdo-team", { body: {} });
  if (error) {
    let msg = "Não foi possível carregar a equipe.";
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
  if (data?.error) throw new Error(data.error);
  return (data?.users ?? []) as TeamUser[];
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
