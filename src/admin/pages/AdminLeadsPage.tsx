import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { leadCommand } from "../api/cms-api";
import { useAdminAuth } from "../auth/AdminAuthContext";

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
};
type Profile = { user_id: string; display_name: string };
const statuses = ["new", "assigned", "in_service", "responded", "converted", "disqualified", "archived"];

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
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    let request = supabase
      .from("cms_leads")
      .select(
        "id,reference_code,status,origin_path,origin_source,assigned_to,sla_due_at,retention_until,created_at,payload,utm,cms_lead_consents(id,consent_version,policy_path,server_recorded_at),cms_lead_status_history(id,from_status,to_status,reason,created_at)",
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
  const canAssign = profile?.permissions.includes("cms:leads.assign"),
    canExport = profile?.permissions.includes("cms:leads.export"),
    canPrivacy = profile?.permissions.includes("cms:leads.privacy");
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
              <input value={exportReason} onChange={(e) => setExportReason(e.target.value)} />
            </label>
            <button className="admin-button" disabled={busy} onClick={() => void exportCsv()}>
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
                    {profiles.find((item) => item.user_id === lead.assigned_to)?.display_name ??
                      "Não atribuído"}
                  </td>
                  <td>
                    <button onClick={() => choose(lead)}>Atender</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && (
        <section className="admin-workflow" aria-labelledby="lead-editor-title">
          <h2 id="lead-editor-title">Atender {selected.reference_code}</h2>
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
                <input value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>
              <button className="admin-button" disabled={busy} onClick={() => void update()}>
                Salvar atendimento
              </button>
            </>
          )}
          {canPrivacy && (
            <button className="admin-danger-link" disabled={busy} onClick={() => void anonymize()}>
              Anonimizar conforme LGPD
            </button>
          )}
          <button onClick={() => setSelected(null)}>Fechar</button>
        </section>
      )}
    </section>
  );
}
