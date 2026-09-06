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

export default function AdminProductsPage() {
  const { profile } = useAdminAuth();
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState<ProductItem | null>(null);
  const [items, setItems] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      const normalizedQuery = query
        .trim()
        .slice(0, 120)
        .replace(/[%_,()."'\\]/g, "");
      let request = supabase
        .from("cms_content_items")
        .select("id,slug,workflow_status,updated_at,cms_content_drafts(payload)")
        .eq("content_type", "product")
        .order("updated_at", { ascending: false });
      if (status !== "all") request = request.eq("workflow_status", status);
      if (normalizedQuery) {
        const titleMatches = await supabase
          .from("cms_content_drafts")
          .select("content_id")
          .ilike("payload->>title", `%${normalizedQuery}%`)
          .limit(50);
        if (titleMatches.error) {
          setError("Não foi possível pesquisar os títulos dos produtos.");
          setItems([]);
          setLoading(false);
          return;
        }
        const matchingIds = (titleMatches.data ?? []).map((item) => item.content_id);
        request = request.or(
          [`slug.ilike.%${normalizedQuery}%`, matchingIds.length ? `id.in.(${matchingIds.join(",")})` : ""]
            .filter(Boolean)
            .join(","),
        );
      }
      const result = await request.limit(50);
      if (result.error) setError("Não foi possível carregar os produtos do CMS.");
      else setItems((result.data ?? []) as unknown as ProductItem[]);
      setLoading(false);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, status]);

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
        eyebrow="CATÁLOGO CLEAN-ROOM"
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
        summary={`${visibleItems.length} produto${visibleItems.length === 1 ? "" : "s"} nesta página`}
      >
        <label>
          Buscar por endereço ou título
          <input
            type="search"
            maxLength={120}
            value={query}
            placeholder="Ex.: medidor-de-vazao"
            onChange={(event) => setQuery(event.target.value)}
          />
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
        <label>
          Categoria
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
              ? "Ajuste a busca ou o filtro de status."
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
        <DataTable caption={`Produtos do CMS: ${items.length} resultados`}>
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
            {visibleItems.map((item) => (
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
                  <Badge tone={statusTone(item.workflow_status)}>
                    {item.workflow_status.replace(/_/g, " ")}
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
      <RecordDrawer
        open={Boolean(selected)}
        eyebrow="PRODUTO"
        title={selected?.cms_content_drafts?.payload.title ?? "Sem título"}
        address={selected ? `/produtos/${selected.slug}` : undefined}
        status={
          <Badge tone={selected ? statusTone(selected.workflow_status) : "neutral"}>
            {selected?.workflow_status.replaceAll("_", " ")}
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
