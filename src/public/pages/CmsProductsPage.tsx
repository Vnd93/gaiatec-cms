import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  ArrowRight,
  CheckCircle2,
  GitCompareArrows,
  Headphones,
  PackageSearch,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { getPublishedProducts, type ProductCollection } from "../catalog-api";
import { ProductCard } from "../components/ProductCard";
import { applyCatalogSeo } from "../catalog-seo";
import { usePublishedSiteShell } from "../site-shell-context";
import "../product-catalog.css";

export default function CmsProductsPage() {
  const { placements } = usePublishedSiteShell();
  const [params, setParams] = useSearchParams();
  const [collection, setCollection] = useState<ProductCollection | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [queryInput, setQueryInput] = useState(params.get("q") ?? "");
  const [reloadToken, setReloadToken] = useState(0);
  const key = params.toString();

  useEffect(() => {
    applyCatalogSeo({ title: "Produtos | GAIATEC", canonicalPath: "/produtos", indexable: true });
    let active = true;
    setError("");
    setCollection(null);
    const input = Object.fromEntries(new URLSearchParams(key).entries());
    void getPublishedProducts(input)
      .then((data) => {
        if (active) setCollection(data);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : "Falha no catálogo.");
      });
    return () => {
      active = false;
    };
  }, [key, reloadToken]);

  const queryParam = params.get("q") ?? "";
  useEffect(() => setQueryInput(queryParam), [queryParam]);

  const setFilter = useCallback(
    (name: string, value: string) => {
      const next = new URLSearchParams(params);
      if (value) next.set(name, value);
      else next.delete(name);
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const clearFilters = () => {
    setQueryInput("");
    setParams(new URLSearchParams(), { replace: true });
  };

  const facets = collection?.facets;
  const options = useMemo(
    () =>
      [
        ["productCategory", "Categoria de produto"],
        ["applicationMagnitude", "Aplicação / grandeza"],
        ["technology", "Tecnologia"],
        ["installationOperation", "Instalação / operação"],
        ["monitoredElement", "Elemento monitorado"],
      ] as const,
    [],
  );

  const activeFilters = options.flatMap(([name, label]) => {
    const value = params.get(name);
    return value ? [{ name, label, value }] : [];
  });
  const hasActiveFilters = Boolean(queryParam || activeFilters.length);
  const total = collection?.total ?? 0;
  const totalLabel = total === 1 ? "1 produto encontrado" : `${total} produtos encontrados`;
  const featured = useMemo(
    () =>
      new Map(
        (placements?.placements ?? [])
          .filter((placement) => placement.slot === "catalog_featured" && placement.target.kind === "product")
          .map((placement, index) => [
            placement.target.path,
            { order: index, label: placement.label || "Produto em destaque" },
          ]),
      ),
    [placements],
  );
  const visibleProducts = useMemo(
    () =>
      (collection?.items ?? []).slice().sort((left, right) => {
        const leftOrder = featured.get(left.path)?.order ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = featured.get(right.path)?.order ?? Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder;
      }),
    [collection, featured],
  );

  return (
    <section className="products-catalog" aria-labelledby="products-catalog-title">
      <header className="products-catalog__hero">
        <div className="products-catalog__hero-grid" aria-hidden="true" />
        <div className="products-catalog__hero-glow" aria-hidden="true" />
        <div className="products-catalog__container products-catalog__hero-content">
          <span className="products-catalog__hero-line" aria-hidden="true" />
          <p className="products-catalog__overline">CATÁLOGO TÉCNICO GAIATEC</p>
          <h1 id="products-catalog-title">Encontre o equipamento certo para sua aplicação</h1>
          <p className="products-catalog__hero-lead">
            Instrumentação selecionada para medição, monitoramento e controle de processos. Use os filtros
            técnicos ou fale com nossa equipe para definir a melhor configuração.
          </p>
        </div>
      </header>

      <div className="products-catalog__container products-catalog__search-shell">
        <form
          className="products-catalog__search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            setFilter("q", queryInput.trim());
          }}
        >
          <Search size={22} strokeWidth={1.8} aria-hidden="true" />
          <label className="sr-only" htmlFor="catalog-search">
            Buscar no catálogo
          </label>
          <input
            id="catalog-search"
            type="search"
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            placeholder="Busque por produto, modelo, tecnologia ou aplicação"
            autoComplete="off"
          />
          {queryInput && (
            <button
              className="products-catalog__search-clear"
              type="button"
              aria-label="Limpar busca"
              onClick={() => {
                setQueryInput("");
                setFilter("q", "");
              }}
            >
              <X size={18} aria-hidden="true" />
            </button>
          )}
          <button className="products-catalog__search-submit" type="submit">
            Buscar <ArrowRight size={17} aria-hidden="true" />
          </button>
        </form>
        <div className="products-catalog__search-note" role="group" aria-label="Benefícios do catálogo">
          <span>
            <ShieldCheck size={18} aria-hidden="true" /> Informações técnicas
          </span>
          <span>
            <GitCompareArrows size={18} aria-hidden="true" /> Comparação técnica
          </span>
          <span>
            <Headphones size={18} aria-hidden="true" /> Suporte especializado
          </span>
        </div>
      </div>

      <div className="products-catalog__container products-catalog__workspace">
        <aside className="products-catalog__filters" aria-label="Filtros do catálogo">
          <div className="products-catalog__filters-heading">
            <span>
              <SlidersHorizontal size={19} aria-hidden="true" /> Filtrar produtos
            </span>
            {hasActiveFilters && (
              <button type="button" onClick={clearFilters}>
                Limpar
              </button>
            )}
          </div>

          <div className="products-catalog__filter-fields">
            {options.map(([keyName, label]) => {
              const current = params.get(keyName) ?? "";
              const values = facets?.[keyName] ?? [];
              const visibleValues = current && !values.includes(current) ? [current, ...values] : values;
              return (
                <label key={keyName}>
                  <span>{label}</span>
                  <select value={current} onChange={(event) => setFilter(keyName, event.target.value)}>
                    <option value="">Todos</option>
                    {visibleValues.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>

          <div className="products-catalog__filter-help">
            <PackageSearch size={24} aria-hidden="true" />
            <p>
              Não encontrou o que procura? Nossa equipe ajuda a especificar o equipamento adequado ao
              processo.
            </p>
            <Link to="/contato">
              Falar com especialista <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </aside>

        <div className="products-catalog__results">
          <div className="products-catalog__results-heading">
            <div>
              <p className="products-catalog__section-label">PRODUTOS</p>
              <h2>Instrumentação para o seu processo</h2>
            </div>
            <p className="products-catalog__count" aria-live="polite">
              {!collection && !error ? "Atualizando catálogo…" : totalLabel}
            </p>
          </div>

          {hasActiveFilters && (
            <div className="products-catalog__active-filters" role="group" aria-label="Filtros ativos">
              {queryParam && (
                <button type="button" onClick={() => setFilter("q", "")}>
                  Busca: {queryParam} <X size={14} aria-hidden="true" />
                </button>
              )}
              {activeFilters.map((filter) => (
                <button key={filter.name} type="button" onClick={() => setFilter(filter.name, "")}>
                  {filter.label}: {filter.value} <X size={14} aria-hidden="true" />
                </button>
              ))}
            </div>
          )}

          {!collection && !error ? (
            <div
              className="products-catalog__loading"
              aria-busy="true"
              role="status"
              aria-label="Carregando produtos"
            >
              {[0, 1, 2].map((item) => (
                <div className="products-catalog__skeleton" key={item} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="products-catalog__state" role="alert">
              <PackageSearch size={38} aria-hidden="true" />
              <p className="products-catalog__section-label">CATÁLOGO TEMPORARIAMENTE INDISPONÍVEL</p>
              <h2>Não foi possível carregar os produtos</h2>
              <p>{error}</p>
              <button type="button" onClick={() => setReloadToken((current) => current + 1)}>
                <RotateCcw size={16} aria-hidden="true" /> Tentar novamente
              </button>
            </div>
          ) : collection?.items.length === 0 ? (
            <div className="products-catalog__state">
              <PackageSearch size={38} aria-hidden="true" />
              <p className="products-catalog__section-label">SEM RESULTADOS</p>
              <h2>Nenhum produto corresponde aos filtros</h2>
              <p>Remova um filtro ou faça uma busca mais ampla para explorar o catálogo.</p>
              <button type="button" onClick={clearFilters}>
                <RotateCcw size={16} aria-hidden="true" /> Limpar filtros
              </button>
            </div>
          ) : (
            <div className="products-catalog__grid">
              {visibleProducts.map((product, index) => (
                <ProductCard
                  key={product.key}
                  product={product}
                  index={index}
                  selected={selected.includes(product.slug)}
                  selectionDisabled={selected.length >= 4 && !selected.includes(product.slug)}
                  featuredLabel={featured.get(product.path)?.label}
                  onSelect={(checked) =>
                    setSelected((current) =>
                      checked
                        ? [...new Set([...current, product.slug])].slice(0, 4)
                        : current.filter((slug) => slug !== product.slug),
                    )
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <section className="products-catalog__cta" aria-labelledby="products-catalog-cta-title">
        <div className="products-catalog__container">
          <div>
            <p className="products-catalog__overline">ESPECIFICAÇÃO ORIENTADA</p>
            <h2 id="products-catalog-cta-title">Precisa de ajuda para selecionar o equipamento?</h2>
          </div>
          <p>
            Compartilhe os dados do processo. Nossa equipe avalia aplicação, faixa, materiais, instalação e
            comunicação antes da proposta.
          </p>
          <Link to="/contato">
            Falar com um especialista <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </section>

      {selected.length > 0 && (
        <aside className="products-catalog__compare-tray" aria-label="Produtos selecionados para comparação">
          <div>
            <span className="products-catalog__compare-icon">
              <GitCompareArrows size={20} aria-hidden="true" />
            </span>
            <p>
              <strong>
                {selected.length} de 4 selecionado{selected.length === 1 ? "" : "s"}
              </strong>
              <span>
                {selected.length < 2
                  ? "Selecione mais um produto para comparar"
                  : "Compare especificações lado a lado"}
              </span>
            </p>
          </div>
          <button type="button" onClick={() => setSelected([])}>
            Limpar seleção
          </button>
          {selected.length >= 2 ? (
            <Link to={`/produtos/comparador?produtos=${selected.join(",")}`}>
              Comparar agora <ArrowRight size={16} aria-hidden="true" />
            </Link>
          ) : (
            <span className="products-catalog__compare-disabled" aria-disabled="true">
              <CheckCircle2 size={16} aria-hidden="true" /> Aguardando seleção
            </span>
          )}
        </aside>
      )}
    </section>
  );
}
