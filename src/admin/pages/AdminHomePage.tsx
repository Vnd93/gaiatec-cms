import { useEffect, useState } from "react";
import { Link } from "react-router";
import { supabase } from "@/lib/supabase";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { ErrorState, LoadingSkeleton, PageHeader, SectionCard, StatePanel } from "../components/AdminUI";

export default function AdminHomePage() {
  const { profile } = useAdminAuth();
  const [counts, setCounts] = useState({ content: 0, review: 0, media: 0, failures: 0 }),
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
          {profile?.permissions.some((permission) =>
            ["cms:collaboration.read", "cms:releases.read", "cms:bulk.read"].includes(permission),
          ) && <Link to="/admin/meu-trabalho">Abrir meu trabalho</Link>}
          {profile?.permissions.includes("cms:posts.edit") && (
            <Link to="/admin/conteudo/novo">Criar demonstração sintética</Link>
          )}
          <Link to="/admin/conteudo">Consultar workflow editorial</Link>
          {profile?.permissions.includes("cms:diagnostics.read") && (
            <Link to="/admin/diagnosticos">Abrir diagnósticos</Link>
          )}
        </div>
      </SectionCard>
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
