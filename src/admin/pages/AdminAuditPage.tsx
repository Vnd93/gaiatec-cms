import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { supabase } from "@/lib/supabase";
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
  created_at: string;
};

const resultFor = (row: AuditRow) => {
  const explicit = String(row.event_data?.result ?? row.event_data?.status ?? "").toLowerCase();
  if (explicit.includes("block") || row.action.includes("blocked")) return "blocked";
  if (explicit.includes("fail") || explicit.includes("error") || row.action.includes("failed"))
    return "failed";
  return "success";
};

const areaFor = (action: string) => action.split(".")[1] || action.split(":")[1]?.split(".")[0] || "cms";

export default function AdminAuditPage() {
  const [items, setItems] = useState<AuditRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [actor, setActor] = useState("all");
  const [area, setArea] = useState("all");
  const [result, setResult] = useState("all");
  const [period, setPeriod] = useState("today");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.all([
      supabase
        .from("cms_audit_log")
        .select("id,actor_id,action,target_type,target_id,correlation_id,event_data,created_at")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase.from("cms_profiles").select("user_id,display_name"),
    ]).then(([auditResult, profileResult]) => {
      if (!active) return;
      if (auditResult.error)
        setError("A trilha de auditoria não pôde ser consultada com suas permissões atuais.");
      else setItems((auditResult.data ?? []) as AuditRow[]);
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
  }, []);

  const visible = useMemo(() => {
    const days = period === "today" ? 1 : period === "7d" ? 7 : 30;
    const since = Date.now() - days * 86_400_000;
    return items.filter(
      (item) =>
        Date.parse(item.created_at) >= since &&
        (actor === "all" || item.actor_id === actor) &&
        (area === "all" || areaFor(item.action) === area) &&
        (result === "all" || resultFor(item) === result),
    );
  }, [actor, area, items, period, result]);
  const actors = Array.from(new Set(items.map((item) => item.actor_id).filter(Boolean))) as string[];
  const areas = Array.from(new Set(items.map((item) => areaFor(item.action)))).sort();
  const today = items.filter(
    (item) => new Date(item.created_at).toDateString() === new Date().toDateString(),
  );
  const failures = today.filter((item) => resultFor(item) !== "success").length;

  const exportCsv = () => {
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = [
      ["horario", "usuario", "acao", "alvo", "resultado", "correlacao"],
      ...visible.map((item) => [
        item.created_at,
        profiles[item.actor_id ?? ""] ?? item.actor_id ?? "Sistema",
        item.action,
        `${item.target_type}:${item.target_id ?? "—"}`,
        resultFor(item),
        item.correlation_id ?? "—",
      ]),
    ];
    const href = URL.createObjectURL(
      new Blob([rows.map((row) => row.map(escape).join(",")).join("\n")], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `auditoria-cms-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(href);
    setSuccess("Registro de auditoria exportado em CSV.");
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
            <Download size={16} aria-hidden="true" /> Exportar registro
          </button>
        }
      />
      {error && <AdminAlert tone="danger">{error}</AdminAlert>}
      {success && <AdminAlert tone="success">{success}</AdminAlert>}
      <div className="admin-metrics">
        <article>
          <strong>{today.length}</strong>
          <span>ações registradas hoje</span>
        </article>
        <article>
          <strong>{new Set(today.map((item) => item.actor_id).filter(Boolean)).size}</strong>
          <span>usuários ativos hoje</span>
        </article>
        <article className={failures ? "is-alert" : ""}>
          <strong>{failures}</strong>
          <span>falhas ou bloqueios hoje</span>
        </article>
        <article>
          <strong>100%</strong>
          <span>trilha somente leitura</span>
        </article>
      </div>
      <FilterBar summary={`${visible.length} evento${visible.length === 1 ? "" : "s"}`}>
        <label>
          Usuário
          <select value={actor} onChange={(event) => setActor(event.target.value)}>
            <option value="all">Todos</option>
            {actors.map((id) => (
              <option key={id} value={id}>
                {profiles[id] ?? id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Área
          <select value={area} onChange={(event) => setArea(event.target.value)}>
            <option value="all">Todas</option>
            {areas.map((value) => (
              <option key={value}>{value}</option>
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
          <select value={period} onChange={(event) => setPeriod(event.target.value)}>
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
                  <td>{new Date(item.created_at).toLocaleString("pt-BR")}</td>
                  <td>{profiles[item.actor_id ?? ""] ?? item.actor_id?.slice(0, 8) ?? "Sistema"}</td>
                  <td>
                    <strong>{item.action.replaceAll(/[.:_-]+/g, " ")}</strong>
                    <small>{areaFor(item.action)}</small>
                  </td>
                  <td>
                    <code>
                      {item.target_type}:{item.target_id ?? "—"}
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
      <SectionCard title="Uso por usuário" description="Últimos 7 dias">
        <div className="admin-audit-usage">
          {actors.slice(0, 8).map((id) => (
            <div key={id}>
              <strong>{profiles[id] ?? id.slice(0, 8)}</strong>
              <span>
                {
                  items.filter(
                    (item) =>
                      item.actor_id === id && Date.parse(item.created_at) > Date.now() - 7 * 86_400_000,
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
