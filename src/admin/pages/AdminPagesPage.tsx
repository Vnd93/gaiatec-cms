import { useEffect, useState } from "react";
import { FilePlus2, Home, Search } from "lucide-react";
import { Link } from "react-router";
import { supabase } from "@/lib/supabase";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { isEv2FeatureEnabled } from "../ev2-runtime";

type PageRow = {
  id: string;
  slug: string;
  content_type: "page" | "homepage";
  workflow_status: string;
  updated_at: string;
  cms_content_drafts: { payload: { title?: string; route?: { path?: string }; pageKind?: string } } | null;
};

export default function AdminPagesPage() {
  const { profile } = useAdminAuth();
  const [items, setItems] = useState<PageRow[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const canCreatePage = profile?.permissions.includes("cms:pages.edit") ?? false;
  const canCreateHome = profile?.permissions.includes("cms:homepage.edit") ?? false;
  const canUseVisualStudio =
    isEv2FeatureEnabled(profile, "ev2.visual_studio") &&
    (profile?.permissions.includes("cms:visual.read") ?? false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    let request = supabase
      .from("cms_content_items")
      .select("id,slug,content_type,workflow_status,updated_at,cms_content_drafts(payload)")
      .in("content_type", ["page", "homepage"])
      .order("updated_at", { ascending: false });
    if (status !== "all") request = request.eq("workflow_status", status);
    void request.then(({ data, error: loadError }) => {
      if (!active) return;
      if (loadError) setError("Não foi possível carregar as páginas administradas.");
      else setItems((data ?? []) as unknown as PageRow[]);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [status]);

  const normalized = query.trim().toLocaleLowerCase("pt-BR");
  const visible = items.filter((item) => {
    if (!normalized) return true;
    const payload = item.cms_content_drafts?.payload;
    return [payload?.title, payload?.route?.path, item.slug]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(normalized));
  });

  return (
    <section>
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">SITE BUILDER</p>
          <h1>Páginas e homepage</h1>
          <p className="admin-help">Crie e altere páginas por blocos, com preview e publicação governada.</p>
        </div>
        <div className="admin-heading-actions">
          {canCreateHome &&
            !items.some((item) => item.content_type === "homepage" && item.workflow_status !== "trashed") && (
              <Link className="admin-button admin-button--secondary" to="/admin/paginas/novo?type=homepage">
                <Home size={16} aria-hidden="true" /> Criar homepage
              </Link>
            )}
          {canCreatePage && (
            <Link className="admin-button" to="/admin/paginas/novo?type=page">
              <FilePlus2 size={16} aria-hidden="true" /> Nova página
            </Link>
          )}
        </div>
      </div>

      <div className="admin-filters">
        <label>
          Buscar página
          <span className="admin-input-with-icon">
            <Search size={16} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Título, URL ou slug"
            />
          </span>
        </label>
        <label>
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">Todos</option>
            <option value="draft">Rascunho</option>
            <option value="in_review">Em revisão</option>
            <option value="approved">Aprovado</option>
            <option value="scheduled">Agendado</option>
            <option value="published">Publicado</option>
            <option value="archived">Arquivado</option>
            <option value="trashed">Lixeira</option>
          </select>
        </label>
      </div>

      {loading ? (
        <div className="admin-state" aria-busy="true">
          Carregando páginas…
        </div>
      ) : error ? (
        <div className="admin-state admin-notice--error" role="alert">
          {error}
        </div>
      ) : visible.length === 0 ? (
        <div className="admin-state">
          <h2>Nenhuma página encontrada</h2>
          <p>Crie a primeira página no builder. Nenhum conteúdo antigo será importado.</p>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Página</th>
                <th>URL</th>
                <th>Tipo</th>
                <th>Status</th>
                <th>Atualização</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => {
                const payload = item.cms_content_drafts?.payload;
                return (
                  <tr key={item.id}>
                    <td>
                      <strong>{payload?.title ?? "Sem título"}</strong>
                    </td>
                    <td>
                      <code>{payload?.route?.path ?? `/${item.slug}`}</code>
                    </td>
                    <td>{item.content_type === "homepage" ? "Homepage" : (payload?.pageKind ?? "Página")}</td>
                    <td>
                      <span className="admin-status">{item.workflow_status}</span>
                    </td>
                    <td>{new Date(item.updated_at).toLocaleString("pt-BR")}</td>
                    <td>
                      <Link to={`/admin/paginas/${item.id}`}>Abrir builder</Link>
                      {canUseVisualStudio && (
                        <>
                          {" · "}
                          <Link to={`/admin/estudio-visual/${item.id}`}>Estúdio Visual</Link>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
