import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { searchGovernanceCommand } from "../api/cms-api";
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
    [error, setError] = useState("");
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
      {canManage && (
        <form
          className="admin-editor-grid"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!session) return;
            await searchGovernanceCommand(session, {
              action: "upsert",
              canonicalTerm: canonical,
              aliases: aliases
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean),
              scope,
              sourceReference: source,
              active: true,
            });
            setCanonical("");
            setAliases("");
            setSource("");
            await load();
          }}
        >
          <label>
            Conceito canônico
            <input required value={canonical} onChange={(e) => setCanonical(e.target.value)} />
          </label>
          <label>
            Aliases separados por vírgula
            <input required value={aliases} onChange={(e) => setAliases(e.target.value)} />
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
            <input required value={source} onChange={(e) => setSource(e.target.value)} />
          </label>
          <button disabled={!canonical || !aliases || !source}>Adicionar sinônimo</button>
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
                    <button
                      onClick={async () => {
                        if (session) {
                          await searchGovernanceCommand(session, { action: "remove", id: item.id });
                          await load();
                        }
                      }}
                    >
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
    </section>
  );
}
