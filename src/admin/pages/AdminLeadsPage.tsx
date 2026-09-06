import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { leadCommand } from "../api/cms-api";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { isEv2FeatureEnabled } from "../ev2-runtime";
import { Badge, ConfirmDialog } from "../components/AdminUI";

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
  const [leads, setLeads] = useState<Lead[]>([]),
    [profiles, setProfiles] = useState<Profile[]>([]),
    [status, setStatus] = useState("all"),
    [selected, setSelected] = useState<Lead | null>(null),
    [nextStatus, setNextStatus] = useState("new"),
    [assignee, setAssignee] = useState(""),
    [reason, setReason] = useState("Atualização do atendimento comercial"),
    [exportReason, setExportReason] = useState("Exportação operacional autorizada"),
    [retryReason, setRetryReason] = useState("Reprocessamento operacional após verificação da dependência"),
    [retryEvent, setRetryEvent] = useState<LeadDelivery | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [pendingSensitiveAction, setPendingSensitiveAction] = useState<"export" | "anonymize" | "retry" | null>(
      null,
    );
  const load = useCallback(async () => {
    let request = supabase
      .from("cms_leads")
      .select(
        "id,reference_code,status,origin_path,origin_source,assigned_to,sla_due_at,retention_until,created_at,payload,utm,cms_lead_consents(id,consent_version,policy_path,server_recorded_at),cms_lead_status_history(id,from_status,to_status,reason,created_at),cms_lead_outbox(id,event_type,status,attempts,available_at,completed_at,last_error_code,created_at)",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (status !== "all") request = request.eq("status", status);
    const [{ data, error: loadError }, { data: people }] = await Promise.all([
      request,
      supabase.from("cms_profiles").select("user_id,display_name").eq("status", "active"),
    ]);
    if (loadError) setError("Não foi possível carregar os leads.");
    else setLeads((data ?? []) as unknown as Lead[]);
    setProfiles((people ?? []) as Profile[]);
  }, [status]);
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
      setMessage("Lead atualizado e evento de notificação enfileirado.");
      await load();
      setSelected(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao atualizar lead.");
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
      setError(caught instanceof Error ? caught.message : "Falha ao anonimizar lead.");
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
      const headers = ["reference", "status", "createdAt", "originPath", "originSource", "utm", "fields"];
      const cell = (value: unknown) =>
        `"${String(typeof value === "object" ? JSON.stringify(value) : (value ?? "")).replace(/"/g, '""')}"`;
      const csv = [
        headers.join(","),
        ...result.rows.map((row) => headers.map((key) => cell(row[key])).join(",")),
      ].join("\r\n");
      const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `leads-auditados-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage(`${result.rowCount} lead(s) exportados. Código ${result.correlationId.slice(0, 8)}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha na exportação.");
    } finally {
      setBusy(false);
    }
  }
  async function retryDelivery() {
    if (!session || !retryEvent) return;
    setBusy(true);
    setError("");
    try {
      const result = await leadCommand<{ correlationId: string }>(session, {
        action: "retry_delivery",
        eventId: retryEvent.id,
        justification: retryReason,
      });
      setMessage(`Entrega recolocada na fila. Código ${result.correlationId.slice(0, 8)}.`);
      await load();
      setSelected(null);
      setRetryEvent(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao reprocessar a entrega.");
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
            Atendimento com origem, SLA, responsável, histórico, consentimento e retenção.
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
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Todos</option>
            {statuses.map((item) => (
              <option value={item} key={item}>
                {item}
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
              Exportar com auditoria
            </button>
          </>
        )}
      </div>
      {leads.length === 0 ? (
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
                <th>Status</th>
                <th>Origem</th>
                <th>SLA</th>
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
                    <span className="admin-status">{lead.status}</span>
                  </td>
                  <td>
                    {lead.origin_source}
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
            aria-modal="true"
            aria-labelledby="lead-editor-title"
          >
            <h2 id="lead-editor-title">Atender {selected.reference_code}</h2>
            <p className="admin-eyebrow">LEAD · FICHA COMPLETA</p>
            <p>
              Dados pessoais aparecem somente nesta área autenticada. Retenção até{" "}
              {new Date(selected.retention_until).toLocaleDateString("pt-BR")}.
            </p>
            <p>
              <strong>Origem:</strong> {selected.origin_source} · <code>{selected.origin_path}</code> · UTM{" "}
              {JSON.stringify(selected.utm)}
            </p>
            <p>
              <strong>Consentimento:</strong>{" "}
              {selected.cms_lead_consents[0]
                ? `versão ${selected.cms_lead_consents[0].consent_version}, registrado em ${new Date(selected.cms_lead_consents[0].server_recorded_at).toLocaleString("pt-BR")}, política ${selected.cms_lead_consents[0].policy_path}`
                : "registro indisponível"}
            </p>
            <dl>
              {Object.entries(selected.payload).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{String(value)}</dd>
                </div>
              ))}
            </dl>
            <h3>Histórico</h3>
            {selected.cms_lead_status_history
              .slice()
              .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
              .map((item) => (
                <p key={item.id}>
                  {new Date(item.created_at).toLocaleString("pt-BR")} · {item.from_status ?? "entrada"} →{" "}
                  {item.to_status} · {item.reason}
                </p>
              ))}
            <h3>Entrega e resiliência</h3>
            {selected.cms_lead_outbox.length === 0 ? (
              <p className="admin-notice admin-notice--error" role="alert">
                Nenhum evento de entrega foi localizado. Abra Diagnósticos para reconciliar este lead.
              </p>
            ) : (
              selected.cms_lead_outbox
                .slice()
                .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))
                .map((event) => (
                  <article className="admin-alert" key={event.id}>
                    <p>
                      <Badge tone={deliveryTone[event.status]}>{deliveryLabels[event.status]}</Badge> ·{" "}
                      {event.event_type}
                    </p>
                    <p>
                      Tentativas: {event.attempts} · criado em{" "}
                      {new Date(event.created_at).toLocaleString("pt-BR")}
                    </p>
                    {event.status === "failed" && (
                      <p>
                        Próxima tentativa automática: {new Date(event.available_at).toLocaleString("pt-BR")}.
                      </p>
                    )}
                    {event.last_error_code && <p>Código técnico: {event.last_error_code}</p>}
                    {(event.status === "failed" || event.status === "dead_letter") && canRetry && (
                      <button
                        type="button"
                        disabled={busy || retryReason.trim().length < 3}
                        onClick={() => {
                          setRetryEvent(event);
                          setPendingSensitiveAction("retry");
                        }}
                      >
                        Reprocessar entrega
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
                  Justificativa do reprocessamento
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
                  Status
                  <select value={nextStatus} onChange={(e) => setNextStatus(e.target.value)}>
                    {statuses.map((item) => (
                      <option value={item} key={item}>
                        {item}
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
              ? "Reprocessar esta entrega?"
              : "Exportar dados de leads?"
        }
        description={
          pendingSensitiveAction === "anonymize"
            ? "A anonimização remove dados pessoais de forma irreversível e registra a justificativa na auditoria."
            : pendingSensitiveAction === "retry"
              ? "A entrega será recolocada na fila com MFA, idempotência, justificativa e auditoria. O lead permanecerá intacto."
              : "O arquivo contém dados pessoais. A exportação e sua justificativa serão registradas na auditoria."
        }
        confirmLabel={
          pendingSensitiveAction === "anonymize"
            ? "Anonimizar lead"
            : pendingSensitiveAction === "retry"
              ? "Reprocessar entrega"
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
