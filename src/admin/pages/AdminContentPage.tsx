import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { supabase } from "@/lib/supabase";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { Badge, RecordDrawer } from "../components/AdminUI";

type Item = {
  id: string;
  slug: string;
  workflow_status: string;
  updated_at: string;
  cms_content_drafts: { payload: { title?: string; summary?: string } } | null;
};
const CONTENT_PAGE_SIZE = 10;
const TITLE_LOOKUP_PAGE_SIZE = 500;
const contentStatusLabels: Record<string, string> = {
  new: "Novo",
  draft: "Rascunho",
  in_review: "Em revisão",
  approved: "Aprovado",
  scheduled: "Agendado",
  published: "Publicado",
  archived: "Arquivado",
  trashed: "Na lixeira",
};

function contentStatusLabel(status: string | undefined): string {
  return status ? (contentStatusLabels[status] ?? "Situação indisponível") : "Situação indisponível";
}

export default function AdminContentPage() {
  const { profile } = useAdminAuth();
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<Item[]>([]),
    [query, setQuery] = useState(searchParams.get("q") ?? ""),
    [status, setStatus] = useState("all");
  const [page, setPage] = useState(1),
    [selected, setSelected] = useState<Item | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [retryNonce, setRetryNonce] = useState(0);
  useEffect(() => {
    setQuery(searchParams.get("q") ?? "");
    setPage(1);
  }, [searchParams]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const timer = window.setTimeout(async () => {
      const normalizedQuery = query
        .trim()
        .slice(0, 120)
        .replace(/[%_,()."'\\]/g, "");
      let request = supabase
        .from("cms_content_items")
        .select("id,slug,workflow_status,updated_at,cms_content_drafts(payload)")
        .eq("content_type", "post")
        .order("updated_at", { ascending: false });
      if (status !== "all") request = request.eq("workflow_status", status);
      if (normalizedQuery) {
        const matchingIds: string[] = [];
        let titleLookupFailed = false;
        for (let offset = 0; ; offset += TITLE_LOOKUP_PAGE_SIZE) {
          const titleMatches = await supabase
            .from("cms_content_drafts")
            .select("content_id")
            .ilike("payload->>title", `%${normalizedQuery}%`)
            .range(offset, offset + TITLE_LOOKUP_PAGE_SIZE - 1);
          if (titleMatches.error) {
            titleLookupFailed = true;
            break;
          }
          matchingIds.push(...(titleMatches.data ?? []).map((item) => item.content_id));
          if ((titleMatches.data ?? []).length < TITLE_LOOKUP_PAGE_SIZE) break;
        }
        if (!active) return;
        if (titleLookupFailed) {
          setError("Não foi possível pesquisar os títulos dos artigos.");
          setItems([]);
          setLoading(false);
          return;
        }
        request = matchingIds.length
          ? request.in("id", Array.from(new Set(matchingIds)))
          : request.eq("id", "00000000-0000-0000-0000-000000000000");
      }
      const result = await request.range((page - 1) * CONTENT_PAGE_SIZE, page * CONTENT_PAGE_SIZE - 1);
      if (!active) return;
      if (result.error) setError("Não foi possível carregar o conteúdo.");
      else setItems((result.data ?? []) as unknown as Item[]);
      setLoading(false);
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [page, query, retryNonce, status]);
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
            Criar artigo
          </Link>
        )}
      </div>
      <div className="admin-filters">
        <label>
          Buscar por título
          <input
            maxLength={120}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          Situação
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
          <button type="button" onClick={() => setRetryNonce((value) => value + 1)}>
            Tentar novamente
          </button>
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
                <th>Endereço público</th>
                <th>Situação</th>
                <th>Atualização</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.cms_content_drafts?.payload.title ?? "Sem título"}</td>
                  <td>/blog/{item.slug}</td>
                  <td>
                    <span className="admin-status">{contentStatusLabel(item.workflow_status)}</span>
                  </td>
                  <td>{new Date(item.updated_at).toLocaleString("pt-BR")}</td>
                  <td>
                    <button type="button" onClick={() => setSelected(item)}>
                      Abrir
                    </button>
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
        <button disabled={items.length < CONTENT_PAGE_SIZE} onClick={() => setPage(page + 1)}>
          Próxima
        </button>
      </div>
      <RecordDrawer
        open={Boolean(selected)}
        eyebrow="ARTIGO"
        title={selected?.cms_content_drafts?.payload.title ?? "Sem título"}
        address={selected ? `/blog/${selected.slug}` : undefined}
        status={
          <Badge tone={selected?.workflow_status === "published" ? "success" : "warning"}>
            {contentStatusLabel(selected?.workflow_status)}
          </Badge>
        }
        fields={
          selected
            ? [{ label: "Atualização", value: new Date(selected.updated_at).toLocaleString("pt-BR") }]
            : undefined
        }
        summary={selected?.cms_content_drafts?.payload.summary ?? "Sem resumo editorial."}
        primary={selected && <Link to={`/admin/conteudo/${selected.id}`}>Ver ficha completa</Link>}
        onClose={() => setSelected(null)}
      />
    </section>
  );
}
