import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { supabase } from "@/lib/supabase";
import { useAdminAuth } from "../auth/AdminAuthContext";

type ProductItem = {
  id: string;
  slug: string;
  workflow_status: string;
  updated_at: string;
  cms_content_drafts: {
    payload: { title?: string; manufacturer?: { name?: string }; models?: { model?: string }[] };
  } | null;
};

export default function AdminProductsPage() {
  const { profile } = useAdminAuth();
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [status, setStatus] = useState("all");
  const [items, setItems] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      let request = supabase
        .from("cms_content_items")
        .select("id,slug,workflow_status,updated_at,cms_content_drafts(payload)")
        .eq("content_type", "product")
        .order("updated_at", { ascending: false });
      if (status !== "all") request = request.eq("workflow_status", status);
      if (query.trim()) request = request.ilike("slug", `%${query.replace(/[%_]/g, "")}%`);
      const result = await request.limit(50);
      if (result.error) setError("Não foi possível carregar os produtos do CMS.");
      else setItems((result.data ?? []) as unknown as ProductItem[]);
      setLoading(false);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, status]);

  const canEdit = profile?.permissions.includes("cms:products.edit") ?? false;
  return (
    <section>
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">CATÁLOGO CLEAN-ROOM</p>
          <h1>Produtos</h1>
          <p className="admin-help">
            Fonte única nova. Nenhum produto do site ou banco anterior é consultado.
          </p>
        </div>
        {canEdit && (
          <Link className="admin-button" to="/admin/produtos/novo">
            Cadastrar manualmente
          </Link>
        )}
      </div>
      <div className="admin-filters">
        <label>
          Buscar por slug
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <label>
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
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
          Carregando produtos…
        </div>
      ) : error ? (
        <div className="admin-state admin-notice--error" role="alert">
          {error}
        </div>
      ) : items.length === 0 ? (
        <div className="admin-state">
          <h2>Catálogo editorial vazio</h2>
          <p>Cadastre manualmente um lote aprovado, registro a registro.</p>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Produto</th>
                <th>Fabricante/modelo</th>
                <th>Status</th>
                <th>Atualização</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.cms_content_drafts?.payload.title ?? "Sem título"}
                    <small>{item.slug}</small>
                  </td>
                  <td>
                    {item.cms_content_drafts?.payload.manufacturer?.name ?? "—"}
                    <small>{item.cms_content_drafts?.payload.models?.[0]?.model ?? "—"}</small>
                  </td>
                  <td>
                    <span className="admin-status">{item.workflow_status}</span>
                  </td>
                  <td>{new Date(item.updated_at).toLocaleString("pt-BR")}</td>
                  <td>
                    <Link to={`/admin/produtos/${item.id}`}>Abrir editor</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
