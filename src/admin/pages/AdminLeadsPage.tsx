import { useCallback, useEffect, useRef, useState } from "react";
import { leadCommand } from "../api/cms-api";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { buildCsv } from "../csv";
import { isEv2FeatureEnabled } from "../ev2-runtime";
import { Badge, ConfirmDialog } from "../components/AdminUI";
import { isOperatorSafeMessage, operatorErrorMessage } from "../operator-error-message";

type LeadDelivery = {
  id: string;
  event_type: string;
  status: "pending" | "processing" | "completed" | "failed" | "dead_letter";
  attempts: number;
  available_at: string;
  completed_at: string | null;
  last_error_code: string | null;
  created_at: string;
};

type Lead = {
  id: string;
  reference_code: string;
  status: string;
  origin_path: string;
  origin_source: string;
  assigned_to: string | null;
  sla_due_at: string;
  retention_until: string;
  created_at: string;
  payload: Record<string, unknown>;
  utm: Record<string, unknown>;
  cms_lead_consents: Array<{
    id: string;
    consent_version: string;
    policy_path: string;
    server_recorded_at: string;
  }>;
  cms_lead_status_history: Array<{
    id: string;
    from_status: string | null;
    to_status: string;
    reason: string;
    created_at: string;
  }>;
  cms_lead_outbox: LeadDelivery[];
};
type Profile = { user_id: string; display_name: string };
const statuses = ["new", "assigned", "in_service", "responded", "converted", "disqualified", "archived"];
const statusLabels: Record<string, string> = {
  new: "Novo",
  assigned: "Atribuído",
  in_service: "Em atendimento",
  responded: "Respondido",
  converted: "Convertido",
  disqualified: "Não qualificado",
  archived: "Arquivado",
};
const originLabels: Record<string, string> = {
  website: "Site",
  campaign: "Campanha",
  form: "Formulário",
  contact: "Contato",
  landing_page: "Página de campanha",
};
const utmLabels: Record<string, string> = {
  source: "Origem da campanha",
  utm_source: "Origem da campanha",
  medium: "Canal",
  utm_medium: "Canal",
  campaign: "Campanha",
  utm_campaign: "Campanha",
  term: "Termo",
  utm_term: "Termo",
  content: "Variação",
  utm_content: "Variação",
};
const leadFieldLabels: Record<string, string> = {
  name: "Nome",
  full_name: "Nome completo",
  email: "E-mail",
  phone: "Telefone",
  company: "Empresa",
  message: "Mensagem",
  subject: "Assunto",
  city: "Cidade",
  state: "Estado",
  role: "Cargo",
};
const deliveryEventLabels: Record<string, string> = {
  lead_created: "Novo lead",
  lead_updated: "Atendimento atualizado",
  lead_assigned: "Lead atribuído",
  lead_notification: "Notificação do lead",
};

function humanLabel(key: string, known: Record<string, string> = {}): string {
  const normalized = key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  const knownLabel = known[key] ?? known[normalized];
  if (knownLabel) return knownLabel;
  return "Outra informação";
}

function humanValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Não informado";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (Array.isArray(value)) return value.map(humanValue).join(", ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, nested]) => `${humanLabel(key)}: ${humanValue(nested)}`)
      .join(" · ");
  }
  return String(value);
}
const LEADS_PAGE_SIZE = 50;
const deliveryLabels: Record<LeadDelivery["status"], string> = {
  pending: "Aguardando entrega",
  processing: "Processando",
  completed: "Entregue",
  failed: "Nova tentativa agendada",
  dead_letter: "Ação necessária",
};
const deliveryTone: Record<LeadDelivery["status"], "neutral" | "info" | "success" | "warning" | "danger"> = {
  pending: "info",
  processing: "info",
  completed: "success",
  failed: "warning",
  dead_letter: "danger",
};

function relevantDelivery(lead: Lead): LeadDelivery | undefined {
  const priority: LeadDelivery["status"][] = ["dead_letter", "failed", "processing", "pending", "completed"];
  return lead.cms_lead_outbox.slice().sort((left, right) => {
    const byPriority = priority.indexOf(left.status) - priority.indexOf(right.status);
    return byPriority || Date.parse(right.created_at) - Date.parse(left.created_at);
  })[0];
}

export default function AdminLeadsPage() {
  const { session, profile } = useAdminAuth();
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const [leads, setLeads] = useState<Lead[]>([]),
    [profiles, setProfiles] = useState<Profile[]>([]),
    [status, setStatus] = useState("all"),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [selected, setSelected] = useState<Lead | null>(null),
    [nextStatus, setNextStatus] = useState("new"),
    [assignee, setAssignee] = useState(""),
    [reason, setReason] = useState("Atualização do atendimento comercial"),
    [exportReason, setExportReason] = useState("Exportação operacional autorizada"),
    [retryReason, setRetryReason] = useState("Nova tentativa após verificar o serviço de envio"),
    [retryEvent, setRetryEvent] = useState<LeadDelivery | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [pendingSensitiveAction, setPendingSensitiveAction] = useState<"export" | "anonymize" | "retry" | null>(
      null,
    );
  const load = useCallback(async () => {
    setLoading(true);
    const activeSession = sessionRef.current;
    if (!activeSession) {
      setLoading(false);
      return;
    }
    try {
      const result = await leadCommand<{
        items: Lead[];
        total: number;
        assignees: Profile[];
      }>(activeSession, {
        action: "list_leads",
        status: status === "all" ? null : status,
        limit: LEADS_PAGE_SIZE,
        offset: (page - 1) * LEADS_PAGE_SIZE,
      });
      const resultTotal = result.total ?? 0;
      const lastPage = Math.max(1, Math.ceil(resultTotal / LEADS_PAGE_SIZE));
      if (page > lastPage) {
        setPage(lastPage);
        setLoading(false);
        return;
      }
      setError("");
      setLeads(result.items ?? []);
      setProfiles(result.assignees ?? []);
      setTotal(resultTotal);
    } catch {
      setError("Não foi possível carregar os leads.");
      setLeads([]);
      setProfiles([]);
      setTotal(0);
    }
    setLoading(false);
  }, [page, status]);
  useEffect(() => {
    void load();
  }, [load]);
  function choose(lead: Lead) {
    setSelected(lead);
    setNextStatus(lead.status);
    setAssignee(lead.assigned_to ?? "");
  }
  async function update() {
    if (!session || !selected) return;
    setBusy(true);
    setError("");
    try {
      await leadCommand(session, {
        action: "update_lead",
        leadId: selected.id,
        status: nextStatus,
        assignedTo: assignee || null,
        reason,
      });
      setMessage("Atendimento salvo. A notificação será enviada.");
      await load();
      setSelected(null);
    } catch (caught) {
      setError(operatorErrorMessage(caught, { fallback: "Não foi possível salvar o atendimento." }));
    } finally {
      setBusy(false);
    }
  }
  async function anonymize() {
    if (!session || !selected) return;
    setBusy(true);
    setError("");
    try {
      await leadCommand(session, { action: "anonymize_lead", leadId: selected.id, reason });
      setMessage("Lead anonimizado com trilha de auditoria.");
      await load();
      setSelected(null);
    } catch (caught) {
      setError(operatorErrorMessage(caught, { fallback: "Não foi possível anonimizar o lead." }));
    } finally {
      setBusy(false);
    }
  }
  async function exportCsv() {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      const result = await leadCommand<{
        rows: Array<Record<string, unknown>>;
        rowCount: number;
        correlationId: string;
      }>(session, {
        action: "export_leads",
        status: status === "all" ? null : status,
        justification: exportReason,
      });
      const headers = [
        "Referência",
        "Situação",
        "Recebido em",
        "Endereço de origem",
        "Origem",
        "Dados da campanha",
        "Dados informados",
      ];
      const csv = buildCsv([
        headers,
        ...result.rows.map((row) => [
          humanValue(row.reference),
          statusLabels[String(row.status)] ?? "Situação indisponível",
          Number.isNaN(Date.parse(String(row.createdAt)))
            ? "Data indisponível"
            : new Date(String(row.createdAt)).toLocaleString("pt-BR"),
          humanValue(row.originPath),
          originLabels[String(row.originSource)] ?? "Origem não identificada",
          humanValue(row.utm),
          humanValue(row.fields),
        ]),
      ]);
      const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `leads-auditados-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage(
        `${result.rowCount} lead(s) do filtro atual exportados. A exportação foi registrada na auditoria.`,
      );
    } catch (caught) {
      setError(operatorErrorMessage(caught, { fallback: "Não foi possível exportar os leads." }));
    } finally {
      setBusy(false);
    }
  }
  async function retryDelivery() {
    if (!session || !retryEvent) return;
    setBusy(true);
    setError("");
    try {
      await leadCommand<{ correlationId: string }>(session, {
        action: "retry_delivery",
        eventId: retryEvent.id,
        justification: retryReason,
      });
      setMessage("Nova tentativa de envio solicitada e registrada na auditoria.");
      await load();
      setSelected(null);
      setRetryEvent(null);
    } catch (caught) {
      setError(operatorErrorMessage(caught, { fallback: "Não foi possível solicitar uma nova tentativa." }));
    } finally {
      setBusy(false);
    }
  }
  async function confirmSensitiveAction() {
    const action = pendingSensitiveAction;
    setPendingSensitiveAction(null);
    if (action === "export") await exportCsv();
    if (action === "anonymize") await anonymize();
    if (action === "retry") await retryDelivery();
  }
  const canAssign = profile?.permissions.includes("cms:leads.assign"),
    canExport = profile?.permissions.includes("cms:leads.export"),
    canPrivacy = profile?.permissions.includes("cms:leads.privacy"),
    canRetry =
      isEv2FeatureEnabled(profile, "ev2.system_assurance") &&
      profile?.permissions.includes("cms:leads.retry_delivery");
  return (
    <section>
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">COMERCIAL · LGPD</p>
          <h1>Leads</h1>
          <p className="admin-help">
            Atendimento com origem, prazo, responsável, histórico, consentimento e retenção.
          </p>
        </div>
      </div>
      {error && (
        <p className="admin-notice admin-notice--error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="admin-notice admin-notice--success" role="status">
          {message}
        </p>
      )}
      <div className="admin-filters">
        <label>
          Situação
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
              setSelected(null);
            }}
          >
            <option value="all">Todos</option>
            {statuses.map((item) => (
              <option value={item} key={item}>
                {statusLabels[item]}
              </option>
            ))}
          </select>
        </label>
        {canExport && (
          <>
            <label>
              Justificativa da exportação
              <input
                required
                minLength={3}
                maxLength={500}
                value={exportReason}
                onChange={(e) => setExportReason(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="admin-button"
              disabled={busy || exportReason.trim().length < 3}
              onClick={() => setPendingSensitiveAction("export")}
            >
              Exportar filtro atual com auditoria
            </button>
          </>
        )}
      </div>
      <p className="admin-help" role="status">
        {loading ? "Carregando leads…" : `${leads.length} lead(s) nesta página · ${total} no filtro atual.`}
      </p>
      {loading ? (
        <div className="admin-state" aria-busy="true">
          Carregando leads…
        </div>
      ) : leads.length === 0 ? (
        <div className="admin-state">
          <h2>Nenhum lead recebido</h2>
          <p>O módulo começa vazio e não importa cadastros ou encaminhamentos anteriores.</p>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Referência</th>
                <th>Situação</th>
                <th>Origem</th>
                <th>Prazo de atendimento</th>
                <th>Entrega</th>
                <th>Responsável</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id}>
                  <td>
                    <strong>{lead.reference_code}</strong>
                    <br />
                    <small>{new Date(lead.created_at).toLocaleString("pt-BR")}</small>
                  </td>
                  <td>
                    <span className="admin-status">
                      {statusLabels[lead.status] ?? "Situação indisponível"}
                    </span>
                  </td>
                  <td>
                    {originLabels[lead.origin_source] ?? "Origem não identificada"}
                    <br />
                    <code>{lead.origin_path}</code>
                  </td>
                  <td>
                    {new Date(lead.sla_due_at) < new Date() ? (
                      <strong className="admin-notice--error">Vencido</strong>
                    ) : (
                      new Date(lead.sla_due_at).toLocaleString("pt-BR")
                    )}
                  </td>
                  <td>
                    {relevantDelivery(lead) ? (
                      <Badge tone={deliveryTone[relevantDelivery(lead)!.status]}>
                        {deliveryLabels[relevantDelivery(lead)!.status]}
                      </Badge>
                    ) : (
                      <Badge tone="warning">Sem evento</Badge>
                    )}
                  </td>
                  <td>
                    {profiles.find((item) => item.user_id === lead.assigned_to)?.display_name ??
                      "Não atribuído"}
                  </td>
                  <td>
                    <button type="button" onClick={() => choose(lead)}>
                      Atender
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <nav className="admin-pagination" aria-label="Paginação de leads">
        <button
          type="button"
          disabled={loading || page === 1}
          onClick={() => setPage((current) => Math.max(1, current - 1))}
        >
          Página anterior
        </button>
        <span>
          Página {page} de {Math.max(1, Math.ceil(total / LEADS_PAGE_SIZE))}
        </span>
        <button
          type="button"
          disabled={loading || page * LEADS_PAGE_SIZE >= total}
          onClick={() => setPage((current) => current + 1)}
        >
          Próxima página
        </button>
      </nav>
      {selected && (
        <>
          <button
            className="admin-record-drawer-backdrop"
            type="button"
            aria-label="Fechar lead"
            onClick={() => setSelected(null)}
          />
          <section
            className="admin-record-drawer admin-lead-drawer"
            role="dialog"
            aria-label="Atendimento do lead"
            aria-modal="true"
            aria-labelledby="lead-editor-title"
          >
            <h2 id="lead-editor-title">Atender {selected.reference_code}</h2>
            <p className="admin-eyebrow">ATENDIMENTO · FICHA COMPLETA</p>
            <p>
              Dados pessoais aparecem somente nesta área autenticada. Retenção até{" "}
              {new Date(selected.retention_until).toLocaleDateString("pt-BR")}.
            </p>
            <p>
              <strong>Origem:</strong> {originLabels[selected.origin_source] ?? "Origem não identificada"} ·{" "}
              <code>{selected.origin_path}</code>
            </p>
            {Object.keys(selected.utm).length > 0 && (
              <dl>
                {Object.entries(selected.utm).map(([key, value]) => (
                  <div key={key}>
                    <dt>{humanLabel(key, utmLabels)}</dt>
                    <dd>{humanValue(value)}</dd>
                  </div>
                ))}
              </dl>
            )}
            <p>
              <strong>Consentimento:</strong>{" "}
              {selected.cms_lead_consents[0]
                ? `versão ${selected.cms_lead_consents[0].consent_version}, registrado em ${new Date(selected.cms_lead_consents[0].server_recorded_at).toLocaleString("pt-BR")}, política ${selected.cms_lead_consents[0].policy_path}`
                : "registro indisponível"}
            </p>
            <dl>
              {Object.entries(selected.payload).map(([key, value]) => (
                <div key={key}>
                  <dt>{humanLabel(key, leadFieldLabels)}</dt>
                  <dd>{humanValue(value)}</dd>
                </div>
              ))}
            </dl>
            <h3>Histórico</h3>
            {selected.cms_lead_status_history
              .slice()
              .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
              .map((item) => (
                <p key={item.id}>
                  {new Date(item.created_at).toLocaleString("pt-BR")} ·{" "}
                  {item.from_status ? (statusLabels[item.from_status] ?? "Situação anterior") : "Entrada"} →{" "}
                  {statusLabels[item.to_status] ?? "Situação atualizada"} ·{" "}
                  {isOperatorSafeMessage(item.reason) ? item.reason : "Motivo disponível na auditoria."}
                </p>
              ))}
            <h3>Envio de notificações</h3>
            {selected.cms_lead_outbox.length === 0 ? (
              <p className="admin-notice admin-notice--error" role="alert">
                Não foi possível localizar o histórico de envio. Consulte Diagnósticos para verificar este
                lead.
              </p>
            ) : (
              selected.cms_lead_outbox
                .slice()
                .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))
                .map((event) => (
                  <article className="admin-alert" key={event.id}>
                    <p>
                      <Badge tone={deliveryTone[event.status]}>{deliveryLabels[event.status]}</Badge> ·{" "}
                      {deliveryEventLabels[event.event_type] ?? "Atualização de envio"}
                    </p>
                    <p>
                      Tentativas de envio: {event.attempts} · registrado em{" "}
                      {new Date(event.created_at).toLocaleString("pt-BR")}
                    </p>
                    {event.status === "failed" && (
                      <p>
                        Próxima tentativa automática: {new Date(event.available_at).toLocaleString("pt-BR")}.
                      </p>
                    )}
                    {event.last_error_code && (
                      <p>Falha técnica registrada. Consulte Diagnósticos com a permissão apropriada.</p>
                    )}
                    {(event.status === "failed" || event.status === "dead_letter") && canRetry && (
                      <button
                        type="button"
                        disabled={busy || retryReason.trim().length < 3}
                        onClick={() => {
                          setRetryEvent(event);
                          setPendingSensitiveAction("retry");
                        }}
                      >
                        Tentar envio novamente
                      </button>
                    )}
                  </article>
                ))
            )}
            {canRetry &&
              selected.cms_lead_outbox.some(
                (event) => event.status === "failed" || event.status === "dead_letter",
              ) && (
                <label>
                  Justificativa da nova tentativa
                  <input
                    required
                    minLength={3}
                    maxLength={500}
                    value={retryReason}
                    onChange={(event) => setRetryReason(event.target.value)}
                  />
                </label>
              )}
            {canAssign && (
              <>
                <label>
                  Situação
                  <select value={nextStatus} onChange={(e) => setNextStatus(e.target.value)}>
                    {statuses.map((item) => (
                      <option value={item} key={item}>
                        {statusLabels[item]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Responsável
                  <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                    <option value="">Não atribuído</option>
                    {profiles.map((item) => (
                      <option key={item.user_id} value={item.user_id}>
                        {item.display_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Motivo
                  <input
                    required
                    minLength={3}
                    maxLength={500}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="admin-button"
                  disabled={busy || reason.trim().length < 3}
                  onClick={() => void update()}
                >
                  Salvar atendimento
                </button>
              </>
            )}
            {canPrivacy && (
              <button
                type="button"
                className="admin-danger-link"
                disabled={busy || reason.trim().length < 3}
                onClick={() => setPendingSensitiveAction("anonymize")}
              >
                Anonimizar conforme LGPD
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setSelected(null);
                setRetryEvent(null);
              }}
            >
              Fechar
            </button>
          </section>
        </>
      )}
      <ConfirmDialog
        open={pendingSensitiveAction !== null}
        title={
          pendingSensitiveAction === "anonymize"
            ? "Anonimizar este lead?"
            : pendingSensitiveAction === "retry"
              ? "Tentar este envio novamente?"
              : "Exportar dados de leads?"
        }
        description={
          pendingSensitiveAction === "anonymize"
            ? "A anonimização remove dados pessoais de forma irreversível e registra a justificativa na auditoria."
            : pendingSensitiveAction === "retry"
              ? "Uma nova tentativa será solicitada com a justificativa informada e registrada na auditoria. O lead permanecerá intacto."
              : "O arquivo contém dados pessoais. A exportação e sua justificativa serão registradas na auditoria."
        }
        confirmLabel={
          pendingSensitiveAction === "anonymize"
            ? "Anonimizar lead"
            : pendingSensitiveAction === "retry"
              ? "Tentar envio novamente"
              : "Exportar arquivo"
        }
        dangerous={pendingSensitiveAction === "anonymize"}
        onConfirm={() => void confirmSensitiveAction()}
        onCancel={() => {
          setPendingSensitiveAction(null);
          setRetryEvent(null);
        }}
      />
    </section>
  );
}
