import { useCallback, useEffect, useMemo, useState } from "react";
import { scopedAccessCommand } from "../api/cms-api";
import { useAdminAuth } from "../auth/AdminAuthContext";
import {
  AdminAlert,
  Badge,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FieldGroup,
  LoadingSkeleton,
  SectionCard,
} from "./AdminUI";
import {
  Ev2PermissionEvaluationSchema,
  Ev2PolicyDecisionListSchema,
  Ev2RbacCapabilitySchema,
  Ev2ScopeCommandResultSchema,
  Ev2ScopedRoleListSchema,
  ev2PolicyReasonLabels,
  type Ev2PermissionEvaluation,
  type Ev2PolicyDecision,
  type Ev2RbacCapability,
  type Ev2RoleCatalogItem,
  type Ev2ScopedRoleAssignment,
} from "@/shared/contracts/ev2-rbac";

type AdministrativeUser = {
  user_id: string;
  display_name: string;
  display_email: string | null;
  is_self: boolean;
};

const CANDIDATE_ENABLED = import.meta.env.VITE_EV2_RBAC_SCOPED_CANDIDATE === "true";
const CMS_ENVIRONMENT = import.meta.env.VITE_CMS_ENVIRONMENT === "staging" ? "staging" : "local";

function envelope() {
  return {
    schemaVersion: 1 as const,
    commandId: crypto.randomUUID(),
    correlationId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    actorContext: { environment: CMS_ENVIRONMENT, siteKey: "main" as const },
  };
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString("pt-BR") : "Sem expiração";
}

function reasonLabel(reasonCode: string): string {
  return ev2PolicyReasonLabels[reasonCode] ?? reasonCode.replaceAll("_", " ");
}

export function ScopedAccessPanel({ users }: { users: AdministrativeUser[] }) {
  const { session, profile } = useAdminAuth();
  const [capability, setCapability] = useState<Ev2RbacCapability | null>(null);
  const [assignments, setAssignments] = useState<Ev2ScopedRoleAssignment[]>([]);
  const [roles, setRoles] = useState<Ev2RoleCatalogItem[]>([]);
  const [decisions, setDecisions] = useState<Ev2PolicyDecision[]>([]);
  const [loading, setLoading] = useState(CANDIDATE_ENABLED);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [evaluation, setEvaluation] = useState<Ev2PermissionEvaluation | null>(null);
  const [permissionKey, setPermissionKey] = useState("cms:users.read");
  const [pendingRevoke, setPendingRevoke] = useState<Ev2ScopedRoleAssignment | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [grant, setGrant] = useState({
    targetUserId: "",
    roleKey: "editor",
    grantType: "direct" as "direct" | "delegated",
    expiresAt: "",
    reason: "",
  });

  const canRead = profile?.permissions.includes("cms:scopes.read") ?? false;
  const canManage = profile?.permissions.includes("cms:scopes.manage") ?? false;
  const canReadDecisions = profile?.permissions.includes("cms:policy_decisions.read") ?? false;
  const eligibleUsers = useMemo(() => users.filter((user) => !user.is_self), [users]);

  const load = useCallback(async () => {
    if (!CANDIDATE_ENABLED || !session) return;
    setLoading(true);
    setError("");
    try {
      const capabilityResult = Ev2RbacCapabilitySchema.parse(
        await scopedAccessCommand(session, { envelope: envelope(), action: "capability" }),
      );
      setCapability(capabilityResult);
      if (!capabilityResult.enabled) {
        setAssignments([]);
        setRoles([]);
        setDecisions([]);
        return;
      }
      const requests: Array<Promise<unknown>> = [];
      if (canRead) requests.push(scopedAccessCommand(session, { envelope: envelope(), action: "list" }));
      if (canReadDecisions)
        requests.push(scopedAccessCommand(session, { envelope: envelope(), action: "decisions", limit: 50 }));
      const results = await Promise.all(requests);
      let resultIndex = 0;
      if (canRead) {
        const list = Ev2ScopedRoleListSchema.parse(results[resultIndex++]);
        setAssignments(list.items);
        setRoles(list.roles);
      }
      if (canReadDecisions) {
        const audit = Ev2PolicyDecisionListSchema.parse(results[resultIndex]);
        setDecisions(audit.items);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A autorização escopada está indisponível.");
    } finally {
      setLoading(false);
    }
  }, [canRead, canReadDecisions, session]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (grant.targetUserId || eligibleUsers.length === 0) return;
    setGrant((current) => ({ ...current, targetUserId: eligibleUsers[0].user_id }));
  }, [eligibleUsers, grant.targetUserId]);

  useEffect(() => {
    if (roles.some((role) => role.roleKey === grant.roleKey) || roles.length === 0) return;
    setGrant((current) => ({ ...current, roleKey: roles[0].roleKey }));
  }, [grant.roleKey, roles]);

  if (!CANDIDATE_ENABLED) return null;

  async function submitGrant(event: React.FormEvent) {
    event.preventDefault();
    if (!session || busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const previous = assignments.find(
        (assignment) =>
          assignment.userId === grant.targetUserId &&
          assignment.roleKey === grant.roleKey &&
          (assignment.revokedAt !== null ||
            (assignment.expiresAt !== null && Date.parse(assignment.expiresAt) <= Date.now())),
      );
      const result = Ev2ScopeCommandResultSchema.parse(
        await scopedAccessCommand(
          session,
          {
            envelope: envelope(),
            action: "grant",
            targetUserId: grant.targetUserId,
            roleKey: grant.roleKey,
            grantType: grant.grantType,
            expiresAt:
              grant.grantType === "delegated" && grant.expiresAt
                ? new Date(grant.expiresAt).toISOString()
                : null,
            reason: grant.reason.trim(),
            ...(previous ? { expectedVersion: previous.lockVersion } : {}),
          },
          crypto.randomUUID(),
        ),
      );
      setSuccess(
        result.duplicate
          ? "Comando idempotente reconhecido; a concessão já estava registrada."
          : "Concessão criada no escopo e registrada na auditoria.",
      );
      setGrant((current) => ({ ...current, reason: "", expiresAt: "" }));
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível conceder o acesso.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    const current = pendingRevoke;
    setPendingRevoke(null);
    if (!session || !current || busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      Ev2ScopeCommandResultSchema.parse(
        await scopedAccessCommand(
          session,
          {
            envelope: envelope(),
            action: "revoke",
            targetUserId: current.userId,
            roleKey: current.roleKey,
            expectedVersion: current.lockVersion,
            reason: revokeReason.trim(),
          },
          crypto.randomUUID(),
        ),
      );
      setSuccess("Concessão revogada e decisão registrada na auditoria.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível revogar o acesso.");
    } finally {
      setBusy(false);
    }
  }

  async function evaluatePermission(event: React.FormEvent) {
    event.preventDefault();
    if (!session || busy) return;
    setBusy(true);
    setError("");
    setEvaluation(null);
    try {
      const result = Ev2PermissionEvaluationSchema.parse(
        await scopedAccessCommand(session, {
          envelope: envelope(),
          action: "evaluate",
          permissionKey: permissionKey.trim(),
          targetType: "administrative_screen",
          targetId: "users_and_access",
        }),
      );
      setEvaluation(result);
      if (canReadDecisions) await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível avaliar a permissão.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard
      title="Acesso por escopo — EV2.8"
      description={`Autorizações efetivas para o site main no ambiente ${CMS_ENVIRONMENT}.`}
      actions={
        <button className="admin-button admin-button--secondary" type="button" onClick={() => void load()}>
          Atualizar
        </button>
      }
    >
      {error && <AdminAlert tone="danger">{error}</AdminAlert>}
      {success && <AdminAlert tone="success">{success}</AdminAlert>}
      {loading ? (
        <LoadingSkeleton label="Carregando concessões escopadas" rows={3} />
      ) : capability?.enabled !== true ? (
        <AdminAlert tone="warning">
          Canary inativo para esta identidade. Nenhum papel escopado foi aplicado e o comportamento legado foi
          preservado.
        </AdminAlert>
      ) : (
        <>
          <AdminAlert tone="success">
            RBAC escopado ativo para esta identidade em main/{CMS_ENVIRONMENT}. Ativação: {capability.source}.
          </AdminAlert>

          {canManage && (
            <form className="admin-form" onSubmit={submitGrant}>
              <FieldGroup
                legend="Nova concessão"
                description="A própria identidade não pode elevar seu acesso. Delegações exigem validade definida."
              >
                <label>
                  Usuário
                  <select
                    required
                    value={grant.targetUserId}
                    onChange={(event) =>
                      setGrant((current) => ({ ...current, targetUserId: event.target.value }))
                    }
                  >
                    <option value="">Selecione</option>
                    {eligibleUsers.map((user) => (
                      <option key={user.user_id} value={user.user_id}>
                        {user.display_name} — {user.display_email ?? "sem e-mail"}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Papel no escopo
                  <select
                    required
                    value={grant.roleKey}
                    onChange={(event) => setGrant((current) => ({ ...current, roleKey: event.target.value }))}
                  >
                    {roles.map((role) => (
                      <option key={role.roleKey} value={role.roleKey}>
                        {role.name} ({role.roleKey})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Tipo
                  <select
                    value={grant.grantType}
                    onChange={(event) =>
                      setGrant((current) => ({
                        ...current,
                        grantType: event.target.value as "direct" | "delegated",
                        expiresAt: event.target.value === "direct" ? "" : current.expiresAt,
                      }))
                    }
                  >
                    <option value="direct">Direta</option>
                    <option value="delegated">Temporária / delegada</option>
                  </select>
                </label>
                {grant.grantType === "delegated" && (
                  <label>
                    Válida até
                    <input
                      required
                      type="datetime-local"
                      value={grant.expiresAt}
                      onChange={(event) =>
                        setGrant((current) => ({ ...current, expiresAt: event.target.value }))
                      }
                    />
                  </label>
                )}
                <label>
                  Justificativa
                  <textarea
                    required
                    minLength={3}
                    maxLength={500}
                    value={grant.reason}
                    onChange={(event) => setGrant((current) => ({ ...current, reason: event.target.value }))}
                  />
                </label>
              </FieldGroup>
              <button
                className="admin-button"
                disabled={busy || eligibleUsers.length === 0 || roles.length === 0}
              >
                {busy ? "Registrando…" : "Conceder no escopo"}
              </button>
            </form>
          )}

          {canRead &&
            (assignments.length === 0 ? (
              <EmptyState
                title="Nenhuma concessão encontrada"
                description={`Não há papéis registrados em main/${CMS_ENVIRONMENT}.`}
              />
            ) : (
              <DataTable caption={`${assignments.length} concessões no escopo`}>
                <thead>
                  <tr>
                    <th>Identidade</th>
                    <th>Papel</th>
                    <th>Concessão</th>
                    <th>Estado</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((assignment) => (
                    <tr key={assignment.id}>
                      <td>
                        <strong>{assignment.displayName}</strong>
                        <small>{assignment.userId}</small>
                      </td>
                      <td>{assignment.roleKey}</td>
                      <td>
                        {assignment.grantType === "delegated" ? "Delegada" : "Direta"}
                        <small>{formatDate(assignment.expiresAt)}</small>
                      </td>
                      <td>
                        <Badge tone={assignment.effective ? "success" : "neutral"}>
                          {assignment.effective ? "efetiva" : "inativa"}
                        </Badge>
                        <small>versão {assignment.lockVersion}</small>
                      </td>
                      <td>
                        {canManage && assignment.effective && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setRevokeReason("");
                              setPendingRevoke(assignment);
                            }}
                          >
                            Revogar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            ))}

          <form className="admin-form" onSubmit={evaluatePermission}>
            <FieldGroup
              legend="Simular decisão da sessão"
              description="A avaliação usa a sessão atual, registra allow/deny e não altera permissões."
            >
              <label>
                Chave de permissão
                <input
                  required
                  pattern="cms:[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+"
                  value={permissionKey}
                  onChange={(event) => setPermissionKey(event.target.value)}
                />
              </label>
            </FieldGroup>
            <button className="admin-button admin-button--secondary" disabled={busy}>
              Avaliar acesso
            </button>
          </form>
          {evaluation && (
            <AdminAlert tone={evaluation.allowed ? "success" : "danger"}>
              {evaluation.allowed ? "Permitido" : "Negado"}: {reasonLabel(evaluation.reasonCode)}. Decisão{" "}
              {evaluation.decisionId}.
            </AdminAlert>
          )}

          {canReadDecisions && decisions.length > 0 && (
            <DataTable caption={`${decisions.length} decisões de política mais recentes`}>
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Permissão</th>
                  <th>Decisão</th>
                  <th>Motivo e alvo</th>
                </tr>
              </thead>
              <tbody>
                {decisions.map((decision) => (
                  <tr key={decision.id}>
                    <td>{new Date(decision.occurredAt).toLocaleString("pt-BR")}</td>
                    <td>{decision.permissionKey}</td>
                    <td>
                      <Badge tone={decision.decision === "allow" ? "success" : "danger"}>
                        {decision.decision}
                      </Badge>
                      <small>{decision.aal.toUpperCase()}</small>
                    </td>
                    <td>
                      {reasonLabel(decision.reasonCode)}
                      <small>
                        {decision.targetType ?? "sem alvo"}
                        {decision.targetId ? ` / ${decision.targetId}` : ""}
                      </small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </>
      )}

      <ConfirmDialog
        open={Boolean(pendingRevoke)}
        title="Revogar esta concessão escopada?"
        description={
          pendingRevoke
            ? `O papel ${pendingRevoke.roleKey} de ${pendingRevoke.displayName} deixará de ser efetivo em main/${CMS_ENVIRONMENT}.`
            : ""
        }
        confirmLabel="Revogar concessão"
        dangerous
        confirmDisabled={revokeReason.trim().length < 3}
        onConfirm={() => void revoke()}
        onCancel={() => {
          setPendingRevoke(null);
          setRevokeReason("");
        }}
      >
        <label>
          Justificativa da revogação
          <textarea
            autoFocus
            required
            minLength={3}
            maxLength={500}
            value={revokeReason}
            onChange={(event) => setRevokeReason(event.target.value)}
          />
        </label>
      </ConfirmDialog>
    </SectionCard>
  );
}
