import { useEffect, useState } from "react";
import { Link } from "react-router";
import { supabase } from "@/lib/supabase";
import { useAdminAuth } from "../auth/AdminAuthContext";

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
      <p className="admin-eyebrow">PAINEL OPERACIONAL</p>
      <h1>Núcleo do CMS</h1>
      <p>
        Conteúdo novo, permissões, publicação, preview e mídia operam sem consultar a administração anterior.
      </p>
      {error && (
        <p className="admin-notice admin-notice--error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <div className="admin-state" aria-busy="true">
          Carregando indicadores…
        </div>
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
      <div className="admin-actions">
        <h2>Próximas ações</h2>
        {profile?.permissions.includes("cms:posts.edit") && (
          <Link to="/admin/conteudo/novo">Criar demonstração sintética</Link>
        )}
        <Link to="/admin/conteudo">Consultar workflow editorial</Link>
        {profile?.permissions.includes("cms:diagnostics.read") && (
          <Link to="/admin/diagnosticos">Abrir diagnósticos</Link>
        )}
      </div>
      {!profile?.permissions.includes("cms:posts.edit") && (
        <div className="admin-state admin-state--forbidden">
          <h2>Sem permissão de edição</h2>
          <p>
            Você pode consultar somente os domínios concedidos ao seu papel. A API e o banco aplicam a mesma
            restrição.
          </p>
        </div>
      )}
    </section>
  );
}
