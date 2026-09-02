import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { searchGovernanceCommand } from "../api/cms-api";
import { AdminAlert, ConfirmDialog } from "../components/AdminUI";
type Synonym = {
  id: string;
  canonical_term: string;
  aliases: string[];
  scope: string;
  active: boolean;
  source_reference: string;
};
export default function AdminSearchGovernancePage() {
  const { session, profile } = useAdminAuth(),
    [items, setItems] = useState<Synonym[]>([]),
    [zeros, setZeros] = useState<any[]>([]),
    [canonical, setCanonical] = useState(""),
    [aliases, setAliases] = useState(""),
    [scope, setScope] = useState("all"),
    [source, setSource] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [removing, setRemoving] = useState<Synonym | null>(null);
  const canManage = profile?.permissions.includes("cms:search.manage") ?? false;
  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      const list = await searchGovernanceCommand<{ items: Synonym[] }>(session, { action: "list" });
      setItems(list.items);
      if (profile?.permissions.includes("cms:search.analytics")) {
        const analytics = await searchGovernanceCommand<{ zeroResults: any[] }>(session, {
          action: "analytics",
        });
        setZeros(analytics.zeroResults);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Busca indisponível.");
    } finally {
      setLoading(false);
    }
  }, [profile?.permissions, session]);
  useEffect(() => {
    void load();
  }, [load]);

  async function submitSynonym(event: React.FormEvent) {
    event.preventDefault();
    if (!session || busy) return;
    const aliasList = aliases
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (aliasList.length > 50 || aliasList.some((value) => value.length > 120)) {
      setError("Informe no máximo 50 aliases, com até 120 caracteres cada.");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await searchGovernanceCommand(session, {
        action: "upsert",
        canonicalTerm: canonical,
        aliases: aliasList,
        scope,
        sourceReference: source,
        active: true,
      });
      setCanonical("");
      setAliases("");
      setSource("");
      setSuccess("Sinônimo salvo e registrado na auditoria.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sinônimo não salvo.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmRemove() {
    if (!session || !removing || busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await searchGovernanceCommand(session, { action: "remove", id: removing.id });
      setSuccess("Sinônimo removido e registrado na auditoria.");
      setRemoving(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sinônimo não removido.");
      setRemoving(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">BUSCA ÚNICA</p>
          <h1>Sinônimos e zero resultado</h1>
        </div>
      </div>
      {error && (
        <div role="alert" className="admin-notice--error">
          {error}
        </div>
      )}
      {success && <AdminAlert tone="success">{success}</AdminAlert>}
      {canManage && (
        <form className="admin-editor-grid" onSubmit={submitSynonym}>
          <label>
            Conceito canônico
            <input
              required
              maxLength={120}
              value={canonical}
              onChange={(e) => setCanonical(e.target.value)}
            />
          </label>
          <label>
            Aliases separados por vírgula
            <input required maxLength={6049} value={aliases} onChange={(e) => setAliases(e.target.value)} />
          </label>
          <label>
            Escopo
            <select value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="all">Tudo</option>
              <option value="product">Produtos</option>
              <option value="service">Serviços</option>
              <option value="industry">Indústrias</option>
              <option value="application">Aplicações</option>
              <option value="solution">Soluções</option>
            </select>
          </label>
          <label>
            Fonte/autorização
            <input
              required
              minLength={3}
              maxLength={300}
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
          </label>
          <button disabled={busy || !canonical || !aliases || source.trim().length < 3}>
            {busy ? "Salvando…" : "Adicionar sinônimo"}
          </button>
        </form>
      )}
      {loading ? (
        <div className="admin-state" aria-busy="true">
          Carregando governança…
        </div>
      ) : (
        <>
          <h2>Dicionário governado</h2>
          {items.length === 0 ? (
            <div className="admin-state">
              Nenhum sinônimo adicional. A normalização técnica continua ativa.
            </div>
          ) : (
            <ul>
              {items.map((item) => (
                <li key={item.id}>
                  <strong>{item.canonical_term}</strong>: {item.aliases.join(", ")} ({item.scope}){" "}
                  {canManage && (
                    <button type="button" disabled={busy} onClick={() => setRemoving(item)}>
                      Remover
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <h2>Consultas sem resultado</h2>
          {zeros.length === 0 ? (
            <div className="admin-state">Nenhuma consulta sem resultado registrada.</div>
          ) : (
            <div className="admin-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Consulta</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {zeros.map((row, i) => (
                    <tr key={i}>
                      <td>{row.normalized_query}</td>
                      <td>{new Date(row.occurred_at).toLocaleString("pt-BR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <ConfirmDialog
        open={Boolean(removing)}
        title="Remover sinônimo?"
        description={
          removing
            ? `O conceito “${removing.canonical_term}” deixará de ampliar a busca pública. A ação será auditada.`
            : ""
        }
        confirmLabel={busy ? "Removendo…" : "Remover sinônimo"}
        dangerous
        onConfirm={() => void confirmRemove()}
        onCancel={() => setRemoving(null)}
      />
    </section>
  );
}
