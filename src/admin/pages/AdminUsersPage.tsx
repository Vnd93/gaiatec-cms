import { useCallback, useEffect, useState } from "react";
import { usersCommand } from "../api/cms-api";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { ScopedAccessPanel } from "../components/ScopedAccessPanel";
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
  RecordDrawer,
  SectionCard,
} from "../components/AdminUI";
import { operatorErrorMessage } from "../operator-error-message";

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
  action: "resend_invite" | "suspend" | "reactivate" | "revoke_sessions";
  user: Profile;
};

const roleOptions = ["super_admin", "admin", "marketing", "commercial", "technical", "editor", "reviewer"];
const roleLabels: Record<string, string> = {
  super_admin: "Superadministrador",
  admin: "Administrador",
  marketing: "Marketing",
  commercial: "Comercial",
  technical: "Técnico",
  editor: "Editor",
  reviewer: "Revisor",
};
const statusLabels: Record<Profile["status"], string> = {
  invited: "Convite pendente",
  active: "Ativo",
  suspended: "Suspenso",
};

function roleLabel(role: string): string {
  return roleLabels[role] ?? "Papel não reconhecido";
}

export default function AdminUsersPage() {
  const { session, profile } = useAdminAuth();
  const [items, setItems] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [invite, setInvite] = useState({ email: "", displayName: "", roles: ["editor"] });
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const canInvite = profile?.permissions.includes("cms:users.invite") ?? false;
  const canSuspend = profile?.permissions.includes("cms:users.suspend") ?? false;
  const canRevoke = profile?.permissions.includes("cms:sessions.revoke") ?? false;

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      const result = await usersCommand<{ users: Profile[] }>(session, { action: "list" });
      setItems(result.users);
    } catch (caught) {
      setError(operatorErrorMessage(caught, { fallback: "A lista de usuários está indisponível." }));
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
      setError(operatorErrorMessage(caught, { fallback: "A alteração de acesso não foi concluída." }));
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
      "Acesso registrado e auditado. Quem já possui conta continua usando a senha atual; novas pessoas recebem o convite por e-mail.",
    );
    if (invited) setInvite({ email: "", displayName: "", roles: ["editor"] });
  }

  async function confirmAction() {
    if (!pending) return;
    const current = pending;
    setPending(null);
    const messages: Record<PendingAction["action"], string> = {
      resend_invite: "Novo convite enviado.",
      suspend: "Acesso suspenso e sessões administrativas encerradas.",
      reactivate: "Acesso reativado.",
      revoke_sessions: "Sessões administrativas encerradas.",
    };
    await run({ action: current.action, userId: current.user.user_id }, messages[current.action]);
  }

  return (
    <section>
      <PageHeader
        eyebrow="EQUIPE E ACESSOS"
        title="Usuários e acessos"
        description="Convide pessoas, atribua papéis, suspenda acessos e encerre sessões com auditoria."
      />
      {error && <AdminAlert tone="danger">{error}</AdminAlert>}
      {success && <AdminAlert tone="success">{success}</AdminAlert>}

      <ScopedAccessPanel users={items} />

      {canInvite && (
        <SectionCard
          title="Convidar usuário"
          description="O convite é pessoal e concede somente os papéis selecionados."
        >
          <form className="admin-form" aria-label="Convidar usuário" onSubmit={submitInvite}>
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
                    {roleLabel(role)}
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
          title="Nenhuma pessoa com acesso administrativo"
          description="O cadastro permanece fechado e depende de convite autorizado."
        />
      ) : (
        <DataTable caption={`${items.length} pessoas com acesso administrativo`}>
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
                  {item.is_self && <small>Esta é sua conta</small>}
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
                    {statusLabels[item.status]}
                  </Badge>
                  <small>
                    Verificação em duas etapas: {item.mfa_enrolled_at ? "configurada" : "pendente"}
                  </small>
                </td>
                <td>
                  {item.roles.map(roleLabel).join(", ") || "Nenhum"}
                  <small>Gerencie permissões detalhadas em Acesso por escopo.</small>
                </td>
                <td>{item.last_seen_at ? new Date(item.last_seen_at).toLocaleString("pt-BR") : "Nunca"}</td>
                <td>
                  <div className="admin-actions">
                    <button type="button" onClick={() => setSelectedUser(item)}>
                      Abrir
                    </button>
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

      <RecordDrawer
        open={Boolean(selectedUser)}
        eyebrow="USUÁRIO"
        title={selectedUser?.display_name ?? ""}
        address={selectedUser?.display_email ?? "E-mail indisponível"}
        status={
          <Badge
            tone={
              selectedUser?.status === "active"
                ? "success"
                : selectedUser?.status === "suspended"
                  ? "danger"
                  : "warning"
            }
          >
            {selectedUser ? statusLabels[selectedUser.status] : ""}
          </Badge>
        }
        fields={[
          {
            label: "Papéis",
            value: selectedUser?.roles.map(roleLabel).join(", ") || "Nenhum",
          },
          {
            label: "Verificação em duas etapas",
            value: selectedUser?.mfa_enrolled_at ? "Configurada" : "Pendente",
          },
          {
            label: "Último acesso",
            value: selectedUser?.last_seen_at
              ? new Date(selectedUser.last_seen_at).toLocaleString("pt-BR")
              : "Nunca",
          },
        ]}
        summary="Ficha de acesso com identidade, autenticação multifator, papéis e histórico operacional. Alterações permanecem sujeitas ao controle de acesso e à auditoria."
        onClose={() => {
          setSelectedUser(null);
        }}
      />

      <ConfirmDialog
        open={Boolean(pending)}
        title={
          pending?.action === "suspend"
            ? "Suspender este acesso?"
            : pending?.action === "reactivate"
              ? "Reativar este acesso?"
              : pending?.action === "revoke_sessions"
                ? "Revogar as sessões do CMS?"
                : "Reenviar o convite?"
        }
        description={
          pending ? `A ação sobre ${pending.user.display_name} será aplicada e registrada na auditoria.` : ""
        }
        confirmLabel="Confirmar ação"
        dangerous={pending?.action === "suspend" || pending?.action === "revoke_sessions"}
        onConfirm={() => void confirmAction()}
        onCancel={() => setPending(null)}
      />
    </section>
  );
}
