import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { buildCsv } from "../csv";
import {
  AdminAlert,
  Badge,
  DataTable,
  EmptyState,
  FilterBar,
  LoadingSkeleton,
  PageHeader,
  SectionCard,
} from "../components/AdminUI";

type AuditRow = {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  correlation_id: string | null;
  event_data: Record<string, unknown> | null;
  occurred_at: string;
};

const AUDIT_BATCH_SIZE = 500;
const areaLabels: Record<string, string> = {
  users: "Usuários e acessos",
  sessions: "Sessões",
  scopes: "Permissões por área",
  products: "Produtos",
  content: "Conteúdo",
  posts: "Artigos",
  pages: "Páginas",
  media: "Mídia",
  forms: "Formulários",
  leads: "Leads",
  campaigns: "Campanhas",
  releases: "Publicações em lote",
  search: "Busca",
  quality: "Qualidade",
  settings: "Dados globais",
  navigation: "Navegação",
  diagnostics: "Diagnósticos",
  audit: "Auditoria",
};
const targetTypeLabels: Record<string, string> = {
  user: "Usuário",
  session: "Sessão",
  content: "Conteúdo",
  content_item: "Conteúdo",
  product: "Produto",
  page: "Página",
  post: "Artigo",
  media: "Mídia",
  media_asset: "Mídia",
  form: "Formulário",
  lead: "Lead",
  lead_export: "Exportação de leads",
  campaign: "Campanha",
  release: "Publicação em lote",
  search: "Busca",
  site: "Site",
};

function auditActionLabel(value: string): string {
  const normalized = value.toLocaleLowerCase("en-US");
  const labels: Array<[RegExp, string]> = [
    [/unpublish|retir/, "Conteúdo retirado do site"],
    [/publish|publica/, "Conteúdo publicado"],
    [/rollback|restore|restaur/, "Versão restaurada"],
    [/archive|arquiv/, "Registro arquivado"],
    [/approve|aprova/, "Revisão aprovada"],
    [/submit|sent.?to.?review/, "Conteúdo enviado para revisão"],
    [/revision|review|revis/, "Revisão registrada"],
    [/invite|convite/, "Convite enviado"],
    [/revoke|revog/, "Acesso revogado"],
    [/suspend|suspens/, "Acesso suspenso"],
    [/sign.?out|logout|session.?closed/, "Sessão encerrada"],
    [/sign.?in|login|session.?created/, "Acesso realizado"],
    [/export|exporta/, "Dados exportados"],
    [/upload|envio/, "Arquivo enviado"],
    [/retry|reprocess/, "Nova tentativa solicitada"],
    [/delete|remove|exclu|remov/, "Registro removido"],
    [/create|insert|cria|cadast/, "Registro criado"],
    [/update|save|edit|atualiz|salv/, "Registro atualizado"],
  ];
  return labels.find(([pattern]) => pattern.test(normalized))?.[1] ?? "Operação administrativa";
}

function auditAreaLabel(area: string): string {
  return areaLabels[area] ?? "Outra área administrativa";
}

function auditTargetLabel(targetType: string): string {
  return targetTypeLabels[targetType] ?? "Registro administrativo";
}

const resultFor = (row: AuditRow) => {
  const explicit = String(row.event_data?.result ?? row.event_data?.status ?? "").toLowerCase();
  if (explicit.includes("block") || row.action.includes("blocked")) return "blocked";
  if (explicit.includes("fail") || explicit.includes("error") || row.action.includes("failed"))
    return "failed";
  return "success";
};

const areaFor = (action: string) => {
  const namespaced = action.startsWith("cms:") ? action.slice(4) : action;
  return namespaced.split(/[.:]/)[0] || "other";
};

const periodStart = (period: string) => {
  if (period === "today") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return start.toISOString();
  }
  const days = period === "today" ? 1 : period === "7d" ? 7 : 30;
  return new Date(Date.now() - days * 86_400_000).toISOString();
};

export default function AdminAuditPage() {
  const [items, setItems] = useState<AuditRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [actor, setActor] = useState("all");
  const [area, setArea] = useState("all");
  const [result, setResult] = useState("all");
  const [period, setPeriod] = useState("today");
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setItems([]);
    setTotal(0);
    void Promise.all([
      supabase
        .from("cms_audit_log")
        .select("id,actor_id,action,target_type,target_id,correlation_id,event_data,occurred_at", {
          count: "exact",
        })
        .gte("occurred_at", periodStart(period))
        .order("occurred_at", { ascending: false })
        .range(0, AUDIT_BATCH_SIZE - 1),
      supabase.from("cms_profiles").select("user_id,display_name"),
    ]).then(([auditResult, profileResult]) => {
      if (!active) return;
      if (auditResult.error) {
        setError("A trilha de auditoria não pôde ser consultada com suas permissões atuais.");
        setItems([]);
        setTotal(0);
      } else {
        setError("");
        setItems((auditResult.data ?? []) as AuditRow[]);
        setTotal(auditResult.count ?? 0);
      }
      setProfiles(
        Object.fromEntries(
          (profileResult.data ?? []).map((profile) => [profile.user_id, profile.display_name]),
        ),
      );
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [period]);

  const loadMore = async () => {
    if (loadingMore || items.length >= total) return;
    setLoadingMore(true);
    const auditResult = await supabase
      .from("cms_audit_log")
      .select("id,actor_id,action,target_type,target_id,correlation_id,event_data,occurred_at", {
        count: "exact",
      })
      .gte("occurred_at", periodStart(period))
      .order("occurred_at", { ascending: false })
      .range(items.length, items.length + AUDIT_BATCH_SIZE - 1);
    if (auditResult.error) {
      setError("Não foi possível carregar mais eventos da trilha de auditoria.");
    } else {
      setError("");
      setItems((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...((auditResult.data ?? []) as AuditRow[]).filter((item) => !seen.has(item.id))];
      });
      setTotal(auditResult.count ?? total);
    }
    setLoadingMore(false);
  };

  const visible = useMemo(() => {
    return items.filter(
      (item) =>
        (actor === "all" || item.actor_id === actor) &&
        (area === "all" || areaFor(item.action) === area) &&
        (result === "all" || resultFor(item) === result),
    );
  }, [actor, area, items, result]);
  const actors = Array.from(new Set(items.map((item) => item.actor_id).filter(Boolean))) as string[];
  const areas = Array.from(new Set(items.map((item) => areaFor(item.action)))).sort();
  const today = items.filter(
    (item) => new Date(item.occurred_at).toDateString() === new Date().toDateString(),
  );
  const failures = today.filter((item) => resultFor(item) !== "success").length;

  const exportCsv = () => {
    const rows = [
      ["horario", "usuario", "acao", "alvo", "resultado", "correlacao"],
      ...visible.map((item) => [
        item.occurred_at,
        profiles[item.actor_id ?? ""] ?? item.actor_id ?? "Sistema",
        auditActionLabel(item.action),
        `${auditTargetLabel(item.target_type)}: ${item.target_id ?? "—"}`,
        resultFor(item),
        item.correlation_id ?? "—",
      ]),
    ];
    const href = URL.createObjectURL(
      new Blob(["\ufeff" + buildCsv(rows)], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `auditoria-cms-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(href);
    setSuccess(
      `${visible.length} evento(s) visíveis exportados. O arquivo respeita os filtros e inclui somente os ${items.length} registros carregados.`,
    );
  };

  return (
    <section>
      <PageHeader
        eyebrow="ADMINISTRAÇÃO"
        title="Auditoria"
        description="Rastreabilidade imutável de todas as ações executadas no CMS."
        actions={
          <button
            className="admin-button admin-button--secondary"
            type="button"
            onClick={exportCsv}
            disabled={!visible.length}
          >
            <Download size={16} aria-hidden="true" /> Exportar eventos visíveis
          </button>
        }
      />
      {error && <AdminAlert tone="danger">{error}</AdminAlert>}
      {success && <AdminAlert tone="success">{success}</AdminAlert>}
      <div className="admin-metrics">
        <article>
          <strong>{today.length}</strong>
          <span>ações carregadas hoje</span>
        </article>
        <article>
          <strong>{new Set(today.map((item) => item.actor_id).filter(Boolean)).size}</strong>
          <span>usuários nos registros carregados hoje</span>
        </article>
        <article className={failures ? "is-alert" : ""}>
          <strong>{failures}</strong>
          <span>falhas ou bloqueios carregados hoje</span>
        </article>
        <article>
          <strong>Imutável</strong>
          <span>trilha somente leitura</span>
        </article>
      </div>
      <FilterBar
        summary={`${visible.length} evento${visible.length === 1 ? "" : "s"} visível${visible.length === 1 ? "" : "is"} · ${items.length} de ${total} carregado${items.length === 1 ? "" : "s"} no período`}
      >
        <label>
          Usuário
          <select value={actor} onChange={(event) => setActor(event.target.value)}>
            <option value="all">Todos</option>
            {actors.map((id) => (
              <option key={id} value={id}>
                {profiles[id] ?? "Usuário sem nome disponível"}
              </option>
            ))}
          </select>
        </label>
        <label>
          Área
          <select value={area} onChange={(event) => setArea(event.target.value)}>
            <option value="all">Todas</option>
            {areas.map((value) => (
              <option key={value} value={value}>
                {auditAreaLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Resultado
          <select value={result} onChange={(event) => setResult(event.target.value)}>
            <option value="all">Todos</option>
            <option value="success">Sucesso</option>
            <option value="failed">Falha</option>
            <option value="blocked">Bloqueada</option>
          </select>
        </label>
        <label>
          Período
          <select
            value={period}
            onChange={(event) => {
              setPeriod(event.target.value);
              setActor("all");
              setArea("all");
            }}
          >
            <option value="today">Hoje</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
          </select>
        </label>
      </FilterBar>
      {loading ? (
        <LoadingSkeleton label="Carregando auditoria" rows={8} />
      ) : !visible.length ? (
        <EmptyState
          title="Nenhum evento no período"
          description="Ajuste os filtros ou aguarde novas operações auditadas."
        />
      ) : (
        <DataTable caption="Trilha imutável de auditoria">
          <thead>
            <tr>
              <th>Horário</th>
              <th>Usuário</th>
              <th>Ação</th>
              <th>Alvo</th>
              <th>Resultado</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((item) => {
              const outcome = resultFor(item);
              return (
                <tr key={item.id}>
                  <td>{new Date(item.occurred_at).toLocaleString("pt-BR")}</td>
                  <td>
                    {profiles[item.actor_id ?? ""] ??
                      (item.actor_id ? "Usuário sem nome disponível" : "Sistema")}
                  </td>
                  <td>
                    <strong>{auditActionLabel(item.action)}</strong>
                    <small>{auditAreaLabel(areaFor(item.action))}</small>
                  </td>
                  <td>
                    <code>
                      {auditTargetLabel(item.target_type)}: {item.target_id ?? "—"}
                    </code>
                  </td>
                  <td>
                    <Badge
                      tone={outcome === "success" ? "success" : outcome === "blocked" ? "warning" : "danger"}
                    >
                      {outcome === "success" ? "Sucesso" : outcome === "blocked" ? "Bloqueada" : "Falha"}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      )}
      {items.length < total && (
        <div className="admin-pagination">
          <button type="button" disabled={loading || loadingMore} onClick={() => void loadMore()}>
            {loadingMore
              ? "Carregando mais eventos…"
              : `Carregar mais ${Math.min(AUDIT_BATCH_SIZE, total - items.length)} eventos`}
          </button>
        </div>
      )}
      <SectionCard title="Uso por usuário" description="Nos registros carregados">
        <div className="admin-audit-usage">
          {actors.slice(0, 8).map((id) => (
            <div key={id}>
              <strong>{profiles[id] ?? "Usuário sem nome disponível"}</strong>
              <span>
                {
                  items.filter(
                    (item) =>
                      item.actor_id === id && Date.parse(item.occurred_at) > Date.now() - 7 * 86_400_000,
                  ).length
                }{" "}
                ações
              </span>
            </div>
          ))}
        </div>
      </SectionCard>
      <p className="admin-help">
        O registro de auditoria é imutável: esta tela não oferece edição nem exclusão de eventos.
      </p>
    </section>
  );
}
