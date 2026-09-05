import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { Loader2, MoreVertical, Users } from "lucide-react";
import { Toaster, toast } from "sonner";
import { AppShell } from "../AppShell";
import { useAuth } from "../AuthContext";
import { inviteUser } from "../lib/invite";
import {
  deleteTeamUser,
  reactivateTeamUser,
  listTeam,
  reportCountsByUser,
  resendInvite,
  setUserRole,
  statusOf,
  type TeamUser,
  type UserStatus,
} from "../lib/team";
import { formatDate } from "../lib/format";

const STATUS_META: Record<UserStatus, { label: string; cls: string; dot: string }> = {
  ativo: { label: "Ativo", cls: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  pendente: { label: "Convite pendente", cls: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  suspenso: { label: "Suspenso", cls: "bg-zinc-100 text-zinc-500", dot: "bg-zinc-400" },
};

export default function EquipePage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [counts, setCounts] = useState<Record<string, { total: number; finalizados: number }>>({});
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErro(null);
    try {
      const [u, c] = await Promise.all([listTeam(), reportCountsByUser()]);
      setUsers(u);
      setCounts(c);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  const stats = useMemo(() => {
    let ativos = 0,
      pendentes = 0;
    for (const u of users) {
      const s = statusOf(u);
      if (s === "ativo") ativos++;
      else if (s === "pendente") pendentes++;
    }
    return { ativos, pendentes, total: users.length };
  }, [users]);

  if (!authLoading && !isAdmin) return <Navigate to="/relatorio-de-obra" replace />;

  async function convidar(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || inviting) return;
    setInviting(true);
    try {
      const sent = await inviteUser(email);
      toast.success(`Convite enviado para ${sent}.`);
      setEmail("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível convidar.");
    } finally {
      setInviting(false);
    }
  }

  async function toggleAdmin(u: TeamUser) {
    const novo = u.role === "admin" ? "membro" : "admin";
    setBusyId(u.id);
    try {
      await setUserRole(u.id, novo);
      toast.success(novo === "admin" ? "Agora é administrador." : "Acesso de admin removido.");
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role: novo } : x)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível alterar o papel.");
    } finally {
      setBusyId(null);
    }
  }

  async function remover(u: TeamUser) {
    if (!confirm(`Suspender o acesso RDO de ${u.email}? A autoria e o histórico serão preservados.`)) return;
    setBusyId(u.id);
    try {
      await deleteTeamUser(u.id);
      toast.success("Acesso suspenso.");
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, active: false, suspended_at: new Date().toISOString() } : x)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível remover.");
    } finally {
      setBusyId(null);
    }
  }

  async function reativar(u: TeamUser) {
    setBusyId(u.id);
    try {
      await reactivateTeamUser(u.id);
      toast.success("Acesso reativado.");
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, active: true, suspended_at: null } : x)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível reativar.");
    } finally {
      setBusyId(null);
    }
  }

  async function reenviar(u: TeamUser) {
    setBusyId(u.id);
    try {
      const link = await resendInvite(u.id, u.email);
      if (link && navigator.clipboard) {
        await navigator.clipboard.writeText(link).catch(() => {});
        toast.success("Link de convite copiado — envie para a pessoa.");
      } else {
        toast.success("Convite reenviado.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível reenviar.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell>
      <Toaster position="top-center" />

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--rdo-ink-3)]">Equipe</p>
        <h1 className="mt-1.5 text-[28px] font-semibold leading-none tracking-[-0.035em] text-[var(--rdo-ink)] sm:text-[32px]">
          Equipe & Convites
        </h1>
        {!loading && !erro && (
          <p className="mt-2 text-[13px] text-[var(--rdo-ink-3)]">
            {stats.total} {stats.total === 1 ? "pessoa" : "pessoas"} · {stats.ativos}{" "}
            {stats.ativos === 1 ? "ativa" : "ativas"} · {stats.pendentes}{" "}
            {stats.pendentes === 1 ? "convite pendente" : "convites pendentes"}
          </p>
        )}
      </div>

      {/* Convidar (inline) */}
      <form onSubmit={convidar} className="mt-6 rounded-xl border border-[var(--rdo-line)] bg-white p-4 sm:p-5">
        <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--rdo-ink-3)]">
          Convidar novo acesso
        </label>
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="pessoa@gaiatecsistemas.com.br"
            className="flex-1 rounded-md border border-[var(--rdo-line)] bg-white px-3 py-2 text-[13px] text-[var(--rdo-ink)] outline-none transition-colors placeholder:text-[var(--rdo-ghost)] focus:border-[var(--rdo-blue)] focus:ring-2 focus:ring-[var(--rdo-blue-soft)]"
          />
          <button
            type="submit"
            disabled={inviting}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-[var(--rdo-blue)] px-5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[var(--rdo-blue-strong)] disabled:opacity-55"
          >
            {inviting ? <Loader2 size={15} className="rdo-spin" /> : null}
            Enviar convite
          </button>
        </div>
        <p className="mt-2 text-[11px] text-[var(--rdo-ghost)]">
          A pessoa recebe um e-mail para criar a senha. Aparece como “pendente” até o primeiro acesso.
        </p>
      </form>

      {/* Lista */}
      <div className="mt-6">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 size={26} className="rdo-spin text-[var(--rdo-blue)]" />
          </div>
        ) : erro ? (
          <div className="rounded-xl border border-[var(--rdo-line)] bg-white px-5 py-12 text-center">
            <p className="text-sm text-[var(--rdo-ink-2)]">{erro}</p>
            <button onClick={load} className="mt-3 text-[13px] font-semibold text-[var(--rdo-blue)] hover:text-[var(--rdo-blue-strong)]">
              Tentar novamente
            </button>
          </div>
        ) : users.length === 0 ? (
          <div className="rounded-xl border border-[var(--rdo-line)] bg-white px-5 py-16 text-center">
            <Users size={24} className="mx-auto text-[var(--rdo-ghost)]" />
            <p className="mt-3 text-sm text-[var(--rdo-ink-2)]">Nenhum usuário ainda. Convide alguém acima.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[var(--rdo-line)] bg-white">
            <div className="hidden grid-cols-[1fr_140px_120px_110px_44px] gap-4 border-b border-[var(--rdo-line)] bg-[var(--rdo-bg-2)] px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[var(--rdo-ink-3)] sm:grid">
              <span>Usuário</span>
              <span>Status</span>
              <span>Último acesso</span>
              <span className="text-right">Relatórios</span>
              <span />
            </div>
            {users.map((u) => {
              const s = statusOf(u);
              const meta = STATUS_META[s];
              const c = counts[u.id];
              return (
                <div
                  key={u.id}
                  className="grid grid-cols-1 gap-2 border-b border-[var(--rdo-line)] px-4 py-3.5 last:border-b-0 sm:grid-cols-[1fr_140px_120px_110px_44px] sm:items-center sm:gap-4"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[14px] font-medium text-[var(--rdo-ink)]">{u.email}</span>
                    {u.role === "admin" && (
                      <span className="shrink-0 rounded bg-[var(--rdo-blue-soft)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--rdo-blue)]">
                        Admin
                      </span>
                    )}
                    {u.is_self && <span className="shrink-0 text-[10px] text-[var(--rdo-ghost)]">(você)</span>}
                  </div>
                  <div>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold ${meta.cls}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                      {meta.label}
                    </span>
                  </div>
                  <div className="text-[12px] text-[var(--rdo-ink-3)]">
                    <span className="sm:hidden">Último acesso: </span>
                    {u.last_sign_in_at ? formatDate(u.last_sign_in_at) : "—"}
                  </div>
                  <div className="text-[12px] sm:text-right">
                    <span className="sm:hidden text-[var(--rdo-ink-3)]">Relatórios: </span>
                    <button
                      onClick={() => navigate(`/relatorio-de-obra?autor=${u.id}&e=${encodeURIComponent(u.email)}`)}
                      className="font-semibold text-[var(--rdo-blue)] transition-colors hover:text-[var(--rdo-blue-strong)]"
                    >
                      {c?.total ?? 0} {c?.total ? `(${c.finalizados} final.)` : ""}
                    </button>
                  </div>
                  <div className="flex sm:justify-end">
                    {busyId === u.id ? (
                      <span className="flex h-8 w-8 items-center justify-center">
                        <Loader2 size={15} className="rdo-spin text-[var(--rdo-ink-3)]" />
                      </span>
                    ) : u.is_self ? (
                      <span className="h-8 w-8" />
                    ) : (
                      <Dropdown.Root>
                        <Dropdown.Trigger asChild>
                          <button
                            aria-label="Ações"
                            className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--rdo-ink-3)] transition-colors hover:bg-[var(--rdo-bg-2)] hover:text-[var(--rdo-ink)]"
                          >
                            <MoreVertical size={16} />
                          </button>
                        </Dropdown.Trigger>
                        <Dropdown.Content
                          align="end"
                          sideOffset={4}
                          className="rdo-pop z-[60] min-w-[190px] p-1"
                        >
                          <MenuItem onSelect={() => toggleAdmin(u)}>
                            {u.role === "admin" ? "Remover admin" : "Tornar admin"}
                          </MenuItem>
                          {s === "pendente" && <MenuItem onSelect={() => reenviar(u)}>Reenviar convite</MenuItem>}
                          <Dropdown.Separator className="my-1 h-px bg-[var(--rdo-line)]" />
                          {u.active ? (
                            <MenuItem danger onSelect={() => remover(u)}>Suspender acesso</MenuItem>
                          ) : (
                            <MenuItem onSelect={() => reativar(u)}>Reativar acesso</MenuItem>
                          )}
                        </Dropdown.Content>
                      </Dropdown.Root>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function MenuItem({
  children,
  onSelect,
  danger,
}: {
  children: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
}) {
  return (
    <Dropdown.Item
      onSelect={onSelect}
      className={`cursor-pointer rounded-md px-2.5 py-1.5 text-[13px] font-medium outline-none transition-colors data-[highlighted]:bg-[var(--rdo-bg-2)] ${
        danger ? "text-red-600 data-[highlighted]:bg-red-50" : "text-[var(--rdo-ink-2)]"
      }`}
    >
      {children}
    </Dropdown.Item>
  );
}
