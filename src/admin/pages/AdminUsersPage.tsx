import { useCallback, useEffect, useState } from "react";
import { usersCommand } from "../api/cms-api";
import { useAdminAuth } from "../auth/AdminAuthContext";
import {
  AdminAlert,
  Badge,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  FieldGroup,
  LoadingSkeleton,
  PageHeader,
  SectionCard,
} from "../components/AdminUI";

type Profile = {
  user_id: string;
  display_name: string;
  display_email: string | null;
  status: "invited" | "active" | "suspended";
  roles: string[];
  is_self: boolean;
  mfa_enrolled_at: string | null;
  last_seen_at: string | null;
};

type PendingAction = {
  action: "set_roles" | "resend_invite" | "suspend" | "reactivate" | "revoke_sessions";
  user: Profile;
  roles?: string[];
};

const roleOptions = ["super_admin", "admin", "marketing", "commercial", "technical", "editor", "reviewer"];

export default function AdminUsersPage() {
  const { session, profile } = useAdminAuth();
  const [items, setItems] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [invite, setInvite] = useState({ email: "", displayName: "", roles: ["editor"] });
  const [roleDrafts, setRoleDrafts] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState<PendingAction | null>(null);
  const canInvite = profile?.permissions.includes("cms:users.invite") ?? false;
  const canManage = profile?.permissions.includes("cms:users.manage") ?? false;
  const canSuspend = profile?.permissions.includes("cms:users.suspend") ?? false;
  const canRevoke = profile?.permissions.includes("cms:sessions.revoke") ?? false;

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      const result = await usersCommand<{ users: Profile[] }>(session, { action: "list" });
      setItems(result.users);
      setRoleDrafts(Object.fromEntries(result.users.map((user) => [user.user_id, user.roles])));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Usuários indisponíveis.");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(body: Record<string, unknown>, message: string) {
    if (!session || busy) return false;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await usersCommand(session, { ...body, idempotencyKey: crypto.randomUUID() });
      setSuccess(message);
      await load();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Operação de acesso não concluída.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitInvite(event: React.FormEvent) {
    event.preventDefault();
    const invited = await run(
      {
        action: "invite",
        email: invite.email.trim().toLowerCase(),
        displayName: invite.displayName.trim(),
        roles: invite.roles,
      },
      "Convite criado e enviado com trilha de auditoria.",
    );
    if (invited) setInvite({ email: "", displayName: "", roles: ["editor"] });
  }

  async function confirmAction() {
    if (!pending) return;
    const current = pending;
    setPending(null);
    const messages: Record<PendingAction["action"], string> = {
      set_roles: "Papéis atualizados e permissões recalculadas.",
      resend_invite: "Novo convite enviado.",
      suspend: "Acesso suspenso e sessões invalidadas.",
      reactivate: "Acesso reativado.",
      revoke_sessions: "Sessões do usuário revogadas.",
    };
    await run(
      { action: current.action, userId: current.user.user_id, roles: current.roles ?? [] },
      messages[current.action],
    );
  }

  function toggleRole(userId: string, role: string) {
    setRoleDrafts((current) => {
      const roles = current[userId] ?? [];
      return {
        ...current,
        [userId]: roles.includes(role) ? roles.filter((item) => item !== role) : [...roles, role].sort(),
      };
    });
  }

  return (
    <section>
      <PageHeader
        eyebrow="IDENTIDADES E SESSÕES"
        title="Usuários e acessos"
        description="Convide identidades, atribua papéis, suspenda acessos e revogue sessões com auditoria."
      />
      {error && <AdminAlert tone="danger">{error}</AdminAlert>}
      {success && <AdminAlert tone="success">{success}</AdminAlert>}

      {canInvite && (
        <SectionCard
          title="Convidar usuário"
          description="O convite é pessoal e concede somente os papéis selecionados."
        >
          <form className="admin-form" onSubmit={submitInvite}>
            <FieldGroup legend="Identidade e acesso inicial">
              <label>
                Nome
                <input
                  required
                  maxLength={120}
                  value={invite.displayName}
                  onChange={(event) =>
                    setInvite((current) => ({ ...current, displayName: event.target.value }))
                  }
                />
              </label>
              <label>
                E-mail
                <input
                  required
                  type="email"
                  maxLength={320}
                  value={invite.email}
                  onChange={(event) => setInvite((current) => ({ ...current, email: event.target.value }))}
                />
              </label>
              <fieldset>
                <legend>Papéis iniciais</legend>
                {roleOptions.map((role) => (
                  <label className="admin-checkbox-row" key={role}>
                    <input
                      type="checkbox"
                      checked={invite.roles.includes(role)}
                      onChange={() =>
                        setInvite((current) => ({
                          ...current,
                          roles: current.roles.includes(role)
                            ? current.roles.filter((item) => item !== role)
                            : [...current.roles, role].sort(),
                        }))
                      }
                    />
                    {role}
                  </label>
                ))}
              </fieldset>
            </FieldGroup>
            <button className="admin-button" disabled={busy || invite.roles.length === 0}>
              {busy ? "Enviando…" : "Enviar convite"}
            </button>
          </form>
        </SectionCard>
      )}

      {loading ? (
        <LoadingSkeleton label="Carregando usuários" rows={4} />
      ) : error && items.length === 0 ? (
        <ErrorState
          title="Usuários indisponíveis"
          description={error}
          action={
            <button type="button" onClick={() => void load()}>
              Tentar novamente
            </button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="Nenhum usuário administrativo"
          description="O cadastro permanece fechado e depende de convite autorizado."
        />
      ) : (
        <DataTable caption={`${items.length} usuários administrativos`}>
          <thead>
            <tr>
              <th>Identidade</th>
              <th>Acesso</th>
              <th>Papéis</th>
              <th>Último acesso</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.user_id}>
                <td>
                  <strong>{item.display_name}</strong>
                  <small>{item.display_email ?? "E-mail indisponível"}</small>
                  {item.is_self && <small>Esta é sua identidade</small>}
                </td>
                <td>
                  <Badge
                    tone={
                      item.status === "active"
                        ? "success"
                        : item.status === "suspended"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {item.status}
                  </Badge>
                  <small>MFA: {item.mfa_enrolled_at ? "configurado" : "pendente"}</small>
                </td>
                <td>
                  {canManage && !item.is_self ? (
                    <fieldset className="admin-compact-roles">
                      <legend className="admin-sr-only">Papéis de {item.display_name}</legend>
                      {roleOptions.map((role) => (
                        <label key={role}>
                          <input
                            type="checkbox"
                            checked={(roleDrafts[item.user_id] ?? []).includes(role)}
                            onChange={() => toggleRole(item.user_id, role)}
                          />
                          {role}
                        </label>
                      ))}
                      <button
                        type="button"
                        disabled={busy || (roleDrafts[item.user_id] ?? []).length === 0}
                        onClick={() =>
                          setPending({
                            action: "set_roles",
                            user: item,
                            roles: roleDrafts[item.user_id] ?? [],
                          })
                        }
                      >
                        Salvar papéis
                      </button>
                    </fieldset>
                  ) : (
                    item.roles.join(", ") || "Nenhum"
                  )}
                </td>
                <td>{item.last_seen_at ? new Date(item.last_seen_at).toLocaleString("pt-BR") : "Nunca"}</td>
                <td>
                  <div className="admin-actions">
                    {canInvite && item.status === "invited" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setPending({ action: "resend_invite", user: item })}
                      >
                        Reenviar convite
                      </button>
                    )}
                    {canSuspend && !item.is_self && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          setPending({
                            action: item.status === "suspended" ? "reactivate" : "suspend",
                            user: item,
                          })
                        }
                      >
                        {item.status === "suspended" ? "Reativar" : "Suspender"}
                      </button>
                    )}
                    {canRevoke && !item.is_self && item.status === "active" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setPending({ action: "revoke_sessions", user: item })}
                      >
                        Revogar sessões
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}

      <ConfirmDialog
        open={Boolean(pending)}
        title={
          pending?.action === "set_roles"
            ? "Alterar papéis deste usuário?"
            : pending?.action === "suspend"
              ? "Suspender este acesso?"
              : pending?.action === "reactivate"
                ? "Reativar este acesso?"
                : pending?.action === "revoke_sessions"
                  ? "Revogar todas as sessões?"
                  : "Reenviar o convite?"
        }
        description={
          pending
            ? `A ação sobre ${pending.user.display_name} será aplicada pelo servidor e registrada na auditoria.`
            : ""
        }
        confirmLabel="Confirmar ação"
        dangerous={pending?.action === "suspend" || pending?.action === "revoke_sessions"}
        onConfirm={() => void confirmAction()}
        onCancel={() => setPending(null)}
      />
    </section>
  );
}
