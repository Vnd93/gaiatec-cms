import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { supabase } from "@/lib/supabase";
import { useAdminAuth } from "../auth/AdminAuthContext";

type Item = {
  id: string;
  slug: string;
  workflow_status: string;
  updated_at: string;
  cms_content_drafts: { payload: { title?: string }; lock_version: number } | null;
};
export default function AdminContentPage() {
  const { profile } = useAdminAuth();
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<Item[]>([]),
    [query, setQuery] = useState(searchParams.get("q") ?? ""),
    [status, setStatus] = useState("all");
  const [page, setPage] = useState(1),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const pageSize = 10;
  useEffect(() => {
    setQuery(searchParams.get("q") ?? "");
    setPage(1);
  }, [searchParams]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const timer = window.setTimeout(async () => {
      let request = supabase
        .from("cms_content_items")
        .select("id,slug,workflow_status,updated_at,cms_content_drafts(payload,lock_version)")
        .eq("content_type", "post")
        .order("updated_at", { ascending: false });
      if (status !== "all") request = request.eq("workflow_status", status);
      if (query) request = request.ilike("slug", "%" + query.replace(/[%_]/g, "") + "%");
      const result = await request.range((page - 1) * pageSize, page * pageSize - 1);
      if (!active) return;
      if (result.error) setError("Não foi possível carregar o conteúdo.");
      else setItems((result.data ?? []) as unknown as Item[]);
      setLoading(false);
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [page, query, status]);
  const canEdit = profile?.permissions.includes("cms:posts.edit");
  return (
    <section>
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">CONTEÚDO</p>
          <h1>Conteúdo editorial</h1>
        </div>
        {canEdit && (
          <Link className="admin-button" to="/admin/conteudo/novo">
            Criar conteúdo sintético
          </Link>
        )}
      </div>
      <div className="admin-filters">
        <label>
          Buscar por slug
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          Status
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">Todos</option>
            <option value="draft">Rascunho</option>
            <option value="in_review">Em revisão</option>
            <option value="approved">Aprovado</option>
            <option value="published">Publicado</option>
            <option value="archived">Arquivado</option>
          </select>
        </label>
      </div>
      {loading ? (
        <div className="admin-state" aria-busy="true">
          Carregando conteúdo…
        </div>
      ) : error ? (
        <div className="admin-state admin-notice--error" role="alert">
          {error}
          <button onClick={() => setPage((value) => value)}>Tentar novamente</button>
        </div>
      ) : items.length === 0 ? (
        <div className="admin-state">
          <h2>Biblioteca editorial vazia</h2>
          <p>Nenhum conteúdo novo foi cadastrado. O CMS não consulta a base antiga.</p>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Título</th>
                <th>Slug</th>
                <th>Status</th>
                <th>Atualização</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.cms_content_drafts?.payload.title ?? "Sem título"}</td>
                  <td>{item.slug}</td>
                  <td>
                    <span className="admin-status">{item.workflow_status}</span>
                  </td>
                  <td>{new Date(item.updated_at).toLocaleString("pt-BR")}</td>
                  <td>
                    <Link to={"/admin/conteudo/" + item.id}>Abrir</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="admin-pagination">
        <button disabled={page === 1} onClick={() => setPage(page - 1)}>
          Anterior
        </button>
        <span>Página {page}</span>
        <button disabled={items.length < pageSize} onClick={() => setPage(page + 1)}>
          Próxima
        </button>
      </div>
    </section>
  );
}
