import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
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
type SearchItem = {
  item_id: string;
  content_type: string;
  title: string;
  summary?: string;
  public_path: string;
  matched_by: string;
};
type SearchRule = {
  id: string;
  rule_kind: string;
  normalized_query: string;
  reason: string;
  owner_key: string;
  starts_at: string;
  expires_at: string;
  active: boolean;
};
const environment = () => (import.meta.env.VITE_CMS_ENVIRONMENT === "staging" ? "staging" : "local");
const envelope = () => ({
  schemaVersion: 1 as const,
  commandId: crypto.randomUUID(),
  correlationId: crypto.randomUUID(),
  occurredAt: new Date().toISOString(),
  actorContext: { environment: environment(), siteKey: "main" },
});
export default function AdminSearchGovernancePage() {
  const { session, profile } = useAdminAuth(),
    [params, setParams] = useSearchParams(),
    [items, setItems] = useState<Synonym[]>([]),
    [zeros, setZeros] = useState<any[]>([]),
    [canonical, setCanonical] = useState(""),
    [aliases, setAliases] = useState(""),
    [scope, setScope] = useState("all"),
    [source, setSource] = useState(""),
    [synonymOwner, setSynonymOwner] = useState(""),
    [synonymExpires, setSynonymExpires] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [removing, setRemoving] = useState<Synonym | null>(null),
    [v2Enabled, setV2Enabled] = useState(false),
    [searchItems, setSearchItems] = useState<SearchItem[]>([]),
    [rules, setRules] = useState<SearchRule[]>([]),
    [jobs, setJobs] = useState<
      Array<{ id: string; status: string; documents_indexed: number; created_at: string }>
    >([]),
    [ruleKind, setRuleKind] = useState<"pin" | "bury" | "redirect">("pin"),
    [ruleQuery, setRuleQuery] = useState(""),
    [ruleTarget, setRuleTarget] = useState(""),
    [ruleReason, setRuleReason] = useState(""),
    [ruleOwner, setRuleOwner] = useState(""),
    [ruleExpires, setRuleExpires] = useState("");
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
      if (import.meta.env.VITE_EV2_SEARCH_QUALITY_CANDIDATE === "true") {
        const capability = await searchGovernanceCommand<{ enabled: boolean }>(session, {
          action: "capability",
          envelope: envelope(),
        });
        setV2Enabled(capability.enabled);
        if (capability.enabled) {
          const governance = await searchGovernanceCommand<{
            rules: SearchRule[];
            jobs: Array<{ id: string; status: string; documents_indexed: number; created_at: string }>;
          }>(session, { action: "list_governance", envelope: envelope() });
          setRules(governance.rules);
          setJobs(governance.jobs);
        }
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
  const adminQuery = params.get("q") ?? "";
  useEffect(() => {
    if (!session || !v2Enabled || !adminQuery.trim()) {
      setSearchItems([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(
      () =>
        void searchGovernanceCommand<{ items: SearchItem[] }>(session, {
          action: "admin_search",
          envelope: envelope(),
          query: adminQuery,
          contentTypes: [],
          limit: 50,
        })
          .then((result) => active && setSearchItems(result.items))
          .catch(
            (caught) => active && setError(caught instanceof Error ? caught.message : "Busca indisponível."),
          ),
      180,
    );
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [adminQuery, session, v2Enabled]);

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
        action: v2Enabled ? "upsert_synonym" : "upsert",
        ...(v2Enabled
          ? {
              envelope: envelope(),
              reason: source,
              owner: synonymOwner,
              startsAt: new Date().toISOString(),
              expiresAt: new Date(synonymExpires).toISOString(),
            }
          : {}),
        canonicalTerm: canonical,
        aliases: aliasList,
        scope,
        sourceReference: source,
        active: true,
      });
      setCanonical("");
      setAliases("");
      setSource("");
      setSynonymOwner("");
      setSynonymExpires("");
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
  async function reindex() {
    if (!session || busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await searchGovernanceCommand<{ documentsIndexed: number }>(session, {
        action: "reindex",
        envelope: envelope(),
        reason: "Reconstrução manual autorizada no Centro de Busca",
      });
      setSuccess(`Índice reconstruído com ${result.documentsIndexed} documento(s) públicos sanitizados.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Índice não reconstruído.");
    } finally {
      setBusy(false);
    }
  }
  async function submitRule(event: React.FormEvent) {
    event.preventDefault();
    if (!session || busy) return;
    const startsAt = new Date().toISOString(),
      expiresAt = new Date(ruleExpires).toISOString();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await searchGovernanceCommand(session, {
        action: "upsert_rule",
        envelope: envelope(),
        kind: ruleKind,
        query: ruleQuery,
        ...(ruleKind === "redirect" ? { redirectPath: ruleTarget } : { targetItemId: ruleTarget }),
        reason: ruleReason,
        owner: ruleOwner,
        startsAt,
        expiresAt,
        active: true,
      });
      setSuccess("Regra governada salva com vigência e auditoria.");
      setRuleQuery("");
      setRuleTarget("");
      setRuleReason("");
      setRuleExpires("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Regra não salva.");
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
      {v2Enabled && (
        <>
          <form className="admin-editor-grid" role="search" onSubmit={(event) => event.preventDefault()}>
            <label>
              Busca global permitida
              <input
                type="search"
                value={adminQuery}
                onChange={(event) => {
                  const next = new URLSearchParams(params);
                  if (event.target.value) next.set("q", event.target.value);
                  else next.delete("q");
                  setParams(next);
                }}
                placeholder="Conteúdo, modelo, unidade ou aplicação"
              />
            </label>
          </form>
          {adminQuery && (
            <div className="admin-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Resultado</th>
                    <th>Tipo</th>
                    <th>Correspondência</th>
                  </tr>
                </thead>
                <tbody>
                  {searchItems.map((item) => (
                    <tr key={item.item_id}>
                      <td>
                        <strong>{item.title}</strong>
                        <br />
                        <small>{item.summary}</small>
                      </td>
                      <td>{item.content_type}</td>
                      <td>{item.matched_by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {profile?.permissions.includes("cms:search.reindex") && (
            <button type="button" disabled={busy} onClick={() => void reindex()}>
              Reconstruir índice público sanitizado
            </button>
          )}
          {jobs[0] && (
            <p>
              <small>
                Último índice: {jobs[0].status} · {jobs[0].documents_indexed} documentos ·{" "}
                {new Date(jobs[0].created_at).toLocaleString("pt-BR")}
              </small>
            </p>
          )}
          {canManage && (
            <form className="admin-editor-grid" onSubmit={submitRule}>
              <h2>Relevância governada</h2>
              <label>
                Regra
                <select
                  value={ruleKind}
                  onChange={(event) => setRuleKind(event.target.value as typeof ruleKind)}
                >
                  <option value="pin">Fixar</option>
                  <option value="bury">Rebaixar</option>
                  <option value="redirect">Redirecionar</option>
                </select>
              </label>
              <label>
                Consulta
                <input required value={ruleQuery} onChange={(event) => setRuleQuery(event.target.value)} />
              </label>
              <label>
                {ruleKind === "redirect" ? "Caminho de destino" : "UUID do conteúdo"}
                <input required value={ruleTarget} onChange={(event) => setRuleTarget(event.target.value)} />
              </label>
              <label>
                Motivo
                <input
                  required
                  minLength={3}
                  maxLength={500}
                  value={ruleReason}
                  onChange={(event) => setRuleReason(event.target.value)}
                />
              </label>
              <label>
                Responsável
                <input
                  required
                  minLength={2}
                  maxLength={120}
                  value={ruleOwner}
                  onChange={(event) => setRuleOwner(event.target.value)}
                />
              </label>
              <label>
                Expira em
                <input
                  required
                  type="datetime-local"
                  value={ruleExpires}
                  onChange={(event) => setRuleExpires(event.target.value)}
                />
              </label>
              <button
                disabled={
                  busy ||
                  !ruleQuery ||
                  !ruleTarget ||
                  ruleReason.length < 3 ||
                  ruleOwner.length < 2 ||
                  !ruleExpires
                }
              >
                Salvar regra
              </button>
            </form>
          )}
          {rules.length > 0 && (
            <ul>
              {rules.map((rule) => (
                <li key={rule.id}>
                  <strong>{rule.rule_kind}</strong> “{rule.normalized_query}” · {rule.owner_key} · até{" "}
                  {new Date(rule.expires_at).toLocaleString("pt-BR")}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
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
          {v2Enabled && (
            <>
              <label>
                Responsável
                <input
                  required
                  minLength={2}
                  maxLength={120}
                  value={synonymOwner}
                  onChange={(event) => setSynonymOwner(event.target.value)}
                />
              </label>
              <label>
                Expira em
                <input
                  required
                  type="datetime-local"
                  value={synonymExpires}
                  onChange={(event) => setSynonymExpires(event.target.value)}
                />
              </label>
            </>
          )}
          <button
            disabled={
              busy ||
              !canonical ||
              !aliases ||
              source.trim().length < 3 ||
              (v2Enabled && (synonymOwner.trim().length < 2 || !synonymExpires))
            }
          >
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
