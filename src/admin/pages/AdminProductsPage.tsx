import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { supabase } from "@/lib/supabase";
import { useAdminAuth } from "../auth/AdminAuthContext";
import {
  Badge,
  DataTable,
  EmptyState,
  ErrorState,
  FilterBar,
  LoadingSkeleton,
  PageHeader,
  RecordDrawer,
} from "../components/AdminUI";
import { ProductModuleTabs } from "../components/AdminModuleTabs";

type ProductItem = {
  id: string;
  slug: string;
  workflow_status: string;
  updated_at: string;
  cms_content_drafts: {
    payload: {
      title?: string;
      summary?: string;
      category?: string | { label?: string };
      manufacturer?: { name?: string };
      models?: { model?: string }[];
    };
  } | null;
};

const PRODUCTS_PAGE_SIZE = 50;
const TITLE_LOOKUP_PAGE_SIZE = 500;
const productStatusLabels: Record<string, string> = {
  new: "Novo",
  draft: "Rascunho",
  in_review: "Em revisão",
  approved: "Aprovado",
  scheduled: "Agendado",
  published: "Publicado",
  archived: "Arquivado",
  trashed: "Na lixeira",
};

function productStatusLabel(status: string | undefined): string {
  return status ? (productStatusLabels[status] ?? "Situação indisponível") : "Situação indisponível";
}

export default function AdminProductsPage() {
  const { profile } = useAdminAuth();
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState<ProductItem | null>(null);
  const [items, setItems] = useState<ProductItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setQuery(params.get("q") ?? "");
    setPage(1);
  }, [params]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      const normalizedQuery = query
        .trim()
        .slice(0, 120)
        .replace(/[%_,()."'\\]/g, "");
      let request = supabase
        .from("cms_content_items")
        .select("id,slug,workflow_status,updated_at,cms_content_drafts(payload)", {
          count: "exact",
        })
        .eq("content_type", "product")
        .order("updated_at", { ascending: false });
      if (status !== "all") request = request.eq("workflow_status", status);
      if (normalizedQuery) {
        const matchingIds: string[] = [];
        let titleLookupFailed = false;
        for (let offset = 0; ; offset += TITLE_LOOKUP_PAGE_SIZE) {
          const titleMatches = await supabase
            .from("cms_content_drafts")
            .select("content_id")
            .or(
              `payload->>title.ilike.%${normalizedQuery}%,payload->manufacturer->>name.ilike.%${normalizedQuery}%`,
            )
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
          setError("Não foi possível pesquisar os nomes e fabricantes dos produtos.");
          setItems([]);
          setTotal(0);
          setLoading(false);
          return;
        }
        request = matchingIds.length
          ? request.in("id", Array.from(new Set(matchingIds)))
          : request.eq("id", "00000000-0000-0000-0000-000000000000");
      }
      const result = await request.range((page - 1) * PRODUCTS_PAGE_SIZE, page * PRODUCTS_PAGE_SIZE - 1);
      if (!active) return;
      if (result.error) {
        setError("Não foi possível carregar os produtos do CMS.");
        setItems([]);
        setTotal(0);
      } else {
        const resultTotal = result.count ?? 0;
        const lastPage = Math.max(1, Math.ceil(resultTotal / PRODUCTS_PAGE_SIZE));
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }
        setItems((result.data ?? []) as unknown as ProductItem[]);
        setTotal(resultTotal);
      }
      setLoading(false);
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [page, query, status]);

  const canEdit = profile?.permissions.includes("cms:products.edit") ?? false;
  const categoryLabel = (item: ProductItem) => {
    const value = item.cms_content_drafts?.payload.category;
    return typeof value === "string" ? value : (value?.label ?? "Sem categoria");
  };
  const categories = Array.from(new Set(items.map(categoryLabel))).sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
  const visibleItems = category === "all" ? items : items.filter((item) => categoryLabel(item) === category);
  const statusTone = (value: string) =>
    value === "published"
      ? "success"
      : value === "in_review"
        ? "warning"
        : value === "archived"
          ? "neutral"
          : "info";
  return (
    <section>
      <PageHeader
        eyebrow="CATÁLOGO DE PRODUTOS"
        title="Produtos"
        description="Localize, filtre e abra produtos do novo catálogo. Nenhum cadastro do sistema anterior é consultado."
        actions={
          canEdit && (
            <div className="admin-workflow-actions">
              <Link className="admin-button admin-button--secondary" to="/admin/produtos/importacao">
                Cadastro em massa
              </Link>
              <Link className="admin-button" to="/admin/produtos/novo">
                Cadastrar manualmente
              </Link>
            </div>
          )
        }
      />
      <ProductModuleTabs />
      <FilterBar
        summary={`${visibleItems.length} produto${visibleItems.length === 1 ? "" : "s"} visível${visibleItems.length === 1 ? "" : "is"} nesta página · ${total} no filtro de busca e situação`}
      >
        <label>
          Buscar por nome ou fabricante
          <input
            type="search"
            maxLength={120}
            value={query}
            placeholder="Ex.: Medidor de vazão ou GAIATEC"
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
              setSelected(null);
            }}
          />
        </label>
        <label>
          Situação
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setCategory("all");
              setPage(1);
              setSelected(null);
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
        <label>
          Categoria nesta página
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="all">Todas</option>
            {categories.map((item) => (
              <option value={item} key={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </FilterBar>
      {loading ? (
        <LoadingSkeleton label="Carregando produtos" rows={5} />
      ) : error ? (
        <ErrorState title="Produtos indisponíveis" description={error} />
      ) : items.length === 0 ? (
        <EmptyState
          title={query || status !== "all" ? "Nenhum produto encontrado" : "Catálogo editorial vazio"}
          description={
            query || status !== "all"
              ? "Ajuste a busca ou o filtro de situação."
              : "Cadastre apenas produtos novos e autorizados."
          }
          action={
            canEdit && !query && status === "all" ? (
              <Link className="admin-button" to="/admin/produtos/novo">
                Cadastrar produto
              </Link>
            ) : undefined
          }
        />
      ) : (
        <DataTable caption={`Produtos do CMS: ${visibleItems.length} resultados visíveis nesta página`}>
          <thead>
            <tr>
              <th>Produto</th>
              <th>Fabricante/modelo</th>
              <th>Situação</th>
              <th>Atualização</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((item) => (
              <tr key={item.id}>
                <td>{item.cms_content_drafts?.payload.title ?? "Sem título"}</td>
                <td>
                  {item.cms_content_drafts?.payload.manufacturer?.name ?? "—"}
                  <small>{item.cms_content_drafts?.payload.models?.[0]?.model ?? "—"}</small>
                </td>
                <td>
                  <Badge tone={statusTone(item.workflow_status)}>
                    {productStatusLabel(item.workflow_status)}
                  </Badge>
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
        </DataTable>
      )}
      <nav className="admin-pagination" aria-label="Paginação de produtos">
        <button
          type="button"
          disabled={loading || page === 1}
          onClick={() => {
            setCategory("all");
            setPage((current) => Math.max(1, current - 1));
          }}
        >
          Página anterior
        </button>
        <span>
          Página {page} de {Math.max(1, Math.ceil(total / PRODUCTS_PAGE_SIZE))}
        </span>
        <button
          type="button"
          disabled={loading || page * PRODUCTS_PAGE_SIZE >= total}
          onClick={() => {
            setCategory("all");
            setPage((current) => current + 1);
          }}
        >
          Próxima página
        </button>
      </nav>
      <RecordDrawer
        open={Boolean(selected)}
        eyebrow="PRODUTO"
        title={selected?.cms_content_drafts?.payload.title ?? "Sem título"}
        address={selected ? `/produtos/${selected.slug}` : undefined}
        status={
          <Badge tone={selected ? statusTone(selected.workflow_status) : "neutral"}>
            {productStatusLabel(selected?.workflow_status)}
          </Badge>
        }
        fields={
          selected
            ? [
                {
                  label: "Fabricante",
                  value: selected.cms_content_drafts?.payload.manufacturer?.name ?? "—",
                },
                {
                  label: "Modelo principal",
                  value: selected.cms_content_drafts?.payload.models?.[0]?.model ?? "—",
                },
                { label: "Categoria", value: categoryLabel(selected) },
                { label: "Atualização", value: new Date(selected.updated_at).toLocaleString("pt-BR") },
              ]
            : undefined
        }
        summary={selected?.cms_content_drafts?.payload.summary ?? "Sem resumo editorial."}
        primary={selected && <Link to={`/admin/produtos/${selected.id}`}>Abrir editor completo</Link>}
        onClose={() => setSelected(null)}
      />
    </section>
  );
}
