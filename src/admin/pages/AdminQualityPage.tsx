import { useCallback, useEffect, useState } from "react";
import { qualityCommand } from "../api/cms-api";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { AdminAlert } from "../components/AdminUI";

type QualityRun = {
  id: string;
  item_id: string;
  ruleset_version: string;
  trigger_kind: string;
  status: "passed" | "warning" | "blocked";
  finding_counts: { errors?: number; warnings?: number; recommendations?: number; waived?: number };
  checked_at: string;
};

const environment = () => (import.meta.env.VITE_CMS_ENVIRONMENT === "staging" ? "staging" : "local");
const envelope = () => ({
  schemaVersion: 1 as const,
  commandId: crypto.randomUUID(),
  correlationId: crypto.randomUUID(),
  occurredAt: new Date().toISOString(),
  actorContext: { environment: environment(), siteKey: "main" },
});

export default function AdminQualityPage() {
  const { session, profile } = useAdminAuth();
  const [runs, setRuns] = useState<QualityRun[]>([]),
    [findings, setFindings] = useState<
      Array<{
        ruleKey: string;
        category: string;
        severity: string;
        fieldPath: string;
        message: string;
        waived: boolean;
      }>
    >([]),
    [itemId, setItemId] = useState(""),
    [ruleKey, setRuleKey] = useState(""),
    [reason, setReason] = useState(""),
    [expiresAt, setExpiresAt] = useState(""),
    [enabled, setEnabled] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const canRun = profile?.permissions.includes("cms:quality.run") ?? false;
  const canWaive = profile?.permissions.includes("cms:quality.waive") ?? false;
  const load = useCallback(async () => {
    if (!session || import.meta.env.VITE_EV2_SEARCH_QUALITY_CANDIDATE !== "true") return;
    setError("");
    try {
      const capability = await qualityCommand<{ enabled: boolean }>(session, {
        action: "capability",
        envelope: envelope(),
      });
      setEnabled(capability.enabled);
      if (!capability.enabled) return;
      const result = await qualityCommand<{ items: QualityRun[] }>(session, {
        action: "list",
        envelope: envelope(),
        limit: 50,
      });
      setRuns(result.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Centro de Qualidade indisponível.");
    }
  }, [session]);
  useEffect(() => {
    void load();
  }, [load]);

  async function runQuality() {
    if (!session || !itemId || busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await qualityCommand<{
        status: string;
        counts: Record<string, number>;
        findings: Array<{
          ruleKey: string;
          category: string;
          severity: string;
          fieldPath: string;
          message: string;
          waived: boolean;
        }>;
      }>(session, { action: "run", envelope: envelope(), itemId, trigger: "manual" }, true);
      setFindings(result.findings);
      setSuccess(
        `Verificação concluída: ${result.status}. ${result.counts.errors ?? 0} erro(s), ${result.counts.warnings ?? 0} alerta(s).`,
      );
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Verificação não concluída.");
    } finally {
      setBusy(false);
    }
  }
  async function waive() {
    if (!session || !itemId || !ruleKey || !reason || !expiresAt || busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await qualityCommand(
        session,
        {
          action: "waive",
          envelope: envelope(),
          itemId,
          ruleKey,
          reason,
          expiresAt: new Date(expiresAt).toISOString(),
        },
        true,
      );
      setSuccess("Exceção temporária registrada com auditoria.");
      setRuleKey("");
      setReason("");
      setExpiresAt("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Exceção não registrada.");
    } finally {
      setBusy(false);
    }
  }

  if (import.meta.env.VITE_EV2_SEARCH_QUALITY_CANDIDATE !== "true")
    return (
      <section>
        <h1>Centro de Qualidade</h1>
        <div className="admin-state">Capacidade disponível somente no build candidato EV2.6.</div>
      </section>
    );
  return (
    <section>
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">EV2.6 · QUALIDADE DETERMINÍSTICA</p>
          <h1>Centro de Qualidade</h1>
          <p>Valida SEO, acessibilidade, links, mídia, conteúdo e PIM antes da publicação.</p>
        </div>
      </div>
      {error && (
        <div role="alert" className="admin-notice--error">
          {error}
        </div>
      )}
      {success && <AdminAlert tone="success">{success}</AdminAlert>}
      {!enabled ? (
        <div className="admin-state">A capacidade está desligada para este usuário.</div>
      ) : (
        <>
          <div className="admin-editor-grid">
            <label>
              ID do conteúdo
              <input
                value={itemId}
                onChange={(event) => setItemId(event.target.value)}
                placeholder="UUID do item"
              />
            </label>
            {canRun && (
              <button type="button" disabled={busy || !itemId} onClick={() => void runQuality()}>
                {busy ? "Verificando…" : "Executar verificação"}
              </button>
            )}
          </div>
          {canWaive && (
            <div className="admin-editor-grid" aria-labelledby="quality-waiver-title">
              <h2 id="quality-waiver-title">Exceção temporária</h2>
              <label>
                Regra
                <input
                  value={ruleKey}
                  onChange={(event) => setRuleKey(event.target.value)}
                  placeholder="seo.canonical_required"
                />
              </label>
              <label>
                Motivo
                <input
                  value={reason}
                  minLength={3}
                  maxLength={500}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
              <label>
                Expira em
                <input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(event) => setExpiresAt(event.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={busy || !itemId || !ruleKey || reason.trim().length < 3 || !expiresAt}
                onClick={() => void waive()}
              >
                Registrar exceção
              </button>
            </div>
          )}
          <h2>Execuções recentes</h2>
          {findings.length > 0 && (
            <div className="admin-table-wrap" aria-live="polite">
              <table>
                <thead>
                  <tr>
                    <th>Campo/bloco</th>
                    <th>Severidade</th>
                    <th>Orientação</th>
                  </tr>
                </thead>
                <tbody>
                  {findings.map((finding) => (
                    <tr key={`${finding.ruleKey}:${finding.fieldPath}`}>
                      <td>
                        <code>{finding.fieldPath}</code>
                      </td>
                      <td>{finding.waived ? "dispensado" : finding.severity}</td>
                      <td>
                        {finding.message}
                        <br />
                        <small>
                          {finding.ruleKey} · {finding.category}
                        </small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {runs.length === 0 ? (
            <div className="admin-state">Nenhuma verificação registrada.</div>
          ) : (
            <div className="admin-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Conteúdo</th>
                    <th>Resultado</th>
                    <th>Achados</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id}>
                      <td>
                        <code>{run.item_id}</code>
                      </td>
                      <td>{run.status}</td>
                      <td>
                        {run.finding_counts.errors ?? 0} erros · {run.finding_counts.warnings ?? 0} alertas ·{" "}
                        {run.finding_counts.waived ?? 0} dispensados
                      </td>
                      <td>{new Date(run.checked_at).toLocaleString("pt-BR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
