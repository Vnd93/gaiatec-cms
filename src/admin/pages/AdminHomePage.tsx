import { useEffect, useState } from "react";
import { Link } from "react-router";
import { supabase } from "@/lib/supabase";
import { useAdminAuth } from "../auth/AdminAuthContext";
import {
  Badge,
  ErrorState,
  LoadingSkeleton,
  PageHeader,
  SectionCard,
  StatePanel,
} from "../components/AdminUI";

type QueueItem = {
  id: string;
  content_type: string;
  slug: string;
  updated_at: string;
  cms_content_drafts: { payload: { title?: string } } | null;
};
type ActivityItem = {
  id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  created_at: string;
};

export default function AdminHomePage() {
  const { profile } = useAdminAuth();
  const [counts, setCounts] = useState({ content: 0, review: 0, media: 0, failures: 0 }),
    [queue, setQueue] = useState<QueueItem[]>([]),
    [activity, setActivity] = useState<ActivityItem[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void Promise.all([
      supabase.from("cms_content_items").select("id", { count: "exact", head: true }),
      supabase
        .from("cms_content_items")
        .select("id", { count: "exact", head: true })
        .eq("workflow_status", "in_review"),
      supabase.from("cms_media_assets").select("id", { count: "exact", head: true }),
      supabase
        .from("cms_operational_events")
        .select("id", { count: "exact", head: true })
        .is("resolved_at", null),
      supabase
        .from("cms_content_items")
        .select("id,content_type,slug,updated_at,cms_content_drafts(payload)")
        .eq("workflow_status", "in_review")
        .order("updated_at", { ascending: true })
        .limit(6),
      supabase
        .from("cms_audit_log")
        .select("id,action,target_type,target_id,created_at")
        .order("created_at", { ascending: false })
        .limit(6),
    ]).then((results) => {
      if (!active) return;
      if (results.some((item) => item.error && item.error.code !== "42501"))
        setError("Parte dos indicadores está indisponível.");
      setCounts({
        content: results[0].count ?? 0,
        review: results[1].count ?? 0,
        media: results[2].count ?? 0,
        failures: results[3].count ?? 0,
      });
      if (!results[4].error) setQueue((results[4].data ?? []) as unknown as QueueItem[]);
      if (!results[5].error) setActivity((results[5].data ?? []) as ActivityItem[]);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section>
      <PageHeader
        eyebrow="PAINEL OPERACIONAL"
        title="Visão geral"
        description="Acompanhe o volume editorial, itens em revisão, mídia e falhas que exigem ação."
      />
      {error && <ErrorState title="Indicadores parcialmente indisponíveis" description={error} />}
      {loading ? (
        <LoadingSkeleton label="Carregando indicadores" rows={4} />
      ) : (
        <div className="admin-metrics">
          <article>
            <strong>{counts.content}</strong>
            <span>conteúdos novos</span>
          </article>
          <article>
            <strong>{counts.review}</strong>
            <span>em revisão</span>
          </article>
          <article>
            <strong>{counts.media}</strong>
            <span>mídias novas</span>
          </article>
          <article className={counts.failures ? "is-alert" : ""}>
            <strong>{counts.failures}</strong>
            <span>alertas abertos</span>
          </article>
        </div>
      )}
      <SectionCard title="Próximas ações" description="Escolha uma tarefa compatível com suas permissões.">
        <div className="admin-actions">
          {profile?.permissions.includes("cms:posts.edit") && (
            <Link to="/admin/conteudo/novo">Criar demonstração sintética</Link>
          )}
          <Link to="/admin/conteudo">Consultar workflow editorial</Link>
          {profile?.permissions.includes("cms:diagnostics.read") && (
            <Link to="/admin/diagnosticos">Abrir diagnósticos</Link>
          )}
        </div>
      </SectionCard>
      <div className="admin-dashboard-columns">
        <SectionCard title="Fila de trabalho" description="Itens aguardando sua revisão ou edição">
          {queue.length ? (
            <div className="admin-work-list">
              {queue.map((item) => {
                const route =
                  item.content_type === "product"
                    ? `/admin/produtos/${item.id}`
                    : item.content_type === "post"
                      ? `/admin/conteudo/${item.id}`
                      : ["service", "industry", "application", "solution"].includes(item.content_type)
                        ? `/admin/descoberta/${item.content_type}/${item.id}`
                        : `/admin/paginas/${item.id}`;
                return (
                  <article key={item.id}>
                    <div>
                      <strong>{item.cms_content_drafts?.payload.title ?? item.slug}</strong>
                      <small>
                        {item.content_type} · atualizado {new Date(item.updated_at).toLocaleString("pt-BR")}
                      </small>
                    </div>
                    <Badge tone="warning">Em revisão</Badge>
                    <Link to={route}>Abrir</Link>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="admin-help">Nenhum item aguarda revisão neste momento.</p>
          )}
        </SectionCard>
        <SectionCard title="Atividade recente" description="Últimas ações da equipe">
          {activity.length ? (
            <div className="admin-activity-list">
              {activity.map((item) => (
                <article key={item.id}>
                  <span className="admin-activity-list__dot" />
                  <div>
                    <strong>{item.action.replaceAll(/[.:_-]+/g, " ")}</strong>
                    <small>
                      <code>
                        {item.target_type}:{item.target_id ?? "—"}
                      </code>{" "}
                      · {new Date(item.created_at).toLocaleString("pt-BR")}
                    </small>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="admin-help">A atividade recente aparecerá conforme suas permissões de auditoria.</p>
          )}
        </SectionCard>
      </div>
      {!profile?.permissions.includes("cms:posts.edit") && (
        <StatePanel
          kind="forbidden"
          title="Sem permissão de edição"
          description="Seu papel pode consultar apenas os domínios concedidos. API e banco aplicam a mesma restrição."
        />
      )}
    </section>
  );
}
