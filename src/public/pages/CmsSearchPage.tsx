import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { autocompletePublished, searchPublishedProducts, type UnifiedSearchResult } from "../catalog-api";
import { ProductCard } from "../components/ProductCard";
import { DiscoveryEntityCard } from "../components/DiscoveryEntityRenderer";
import { applyCatalogSeo } from "../catalog-seo";
import "../product-catalog.css";
type Tab = "all" | "product" | "service" | "industry" | "application" | "solution";
const labels: { [key in Tab]: string } = {
  all: "Tudo",
  product: "Produtos",
  service: "Serviços",
  industry: "Indústrias",
  application: "Aplicações",
  solution: "Soluções",
};
export default function CmsSearchPage() {
  const [params, setParams] = useSearchParams(),
    navigate = useNavigate(),
    query = params.get("q") ?? "",
    [result, setResult] = useState<UnifiedSearchResult | null>(null),
    [suggestions, setSuggestions] = useState<UnifiedSearchResult | null>(null),
    [error, setError] = useState(""),
    [activeSuggestion, setActiveSuggestion] = useState(-1),
    [tab, setTab] = useState<Tab>("all");
  useEffect(() => {
    let active = true;
    applyCatalogSeo({
      title: query ? `Busca por ${query} | GAIATEC` : "Busca | GAIATEC",
      canonicalPath: "/busca",
      indexable: false,
    });
    if (!query.trim()) {
      setResult({
        items: [],
        total: 0,
        facets: { segment: [], category: [], family: [], technology: [] },
        groups: { product: 0, service: 0, industry: 0, application: 0, solution: 0 },
        query: "",
      });
      return;
    }
    setResult(null);
    setError("");
    void searchPublishedProducts(query)
      .then((data) => active && setResult(data))
      .catch((e) => active && setError(e instanceof Error ? e.message : "Busca indisponível."));
    return () => {
      active = false;
    };
  }, [query]);
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      if (query.trim().length < 2) {
        setSuggestions(null);
        return;
      }
      void autocompletePublished(query)
        .then((data) => active && setSuggestions(data))
        .catch(() => active && setSuggestions(null));
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query]);
  useEffect(() => setActiveSuggestion(-1), [query, suggestions]);
  const visible = result?.items.filter((item) => tab === "all" || item.content_type === tab) ?? [];
  const suggestionsOpen = Boolean(suggestions?.items.length);
  return (
    <section className="new-catalog" aria-labelledby="cms-search-title">
      <p className="new-catalog__eyebrow">BUSCA ÚNICA DA PROJEÇÃO PUBLICADA</p>
      <h1 id="cms-search-title">Buscar catálogo e soluções</h1>
      <form className="new-catalog__toolbar" role="search" onSubmit={(e) => e.preventDefault()}>
        <label>
          Consulta
          <input
            type="search"
            role="combobox"
            autoComplete="off"
            aria-autocomplete="list"
            aria-controls="cms-autocomplete"
            aria-expanded={suggestionsOpen}
            aria-activedescendant={activeSuggestion >= 0 ? `cms-autocomplete-${activeSuggestion}` : undefined}
            value={query}
            onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {})}
            onKeyDown={(e) => {
              const count = suggestions?.items.length ?? 0;
              if (e.key === "ArrowDown" && count) {
                e.preventDefault();
                setActiveSuggestion((current) => (current + 1) % count);
              } else if (e.key === "ArrowUp" && count) {
                e.preventDefault();
                setActiveSuggestion((current) => (current <= 0 ? count - 1 : current - 1));
              } else if (e.key === "Enter" && activeSuggestion >= 0) {
                e.preventDefault();
                navigate(suggestions!.items[activeSuggestion].path);
              } else if (e.key === "Escape") {
                setSuggestions(null);
                setActiveSuggestion(-1);
              }
            }}
            placeholder="Modelo, unidade, H2S, DN100, Modbus ou aplicação"
          />
        </label>
        {suggestions && suggestions.items.length > 0 && (
          <ul id="cms-autocomplete" className="autocomplete-list" role="listbox" aria-label="Sugestões">
            {suggestions.items.map((item, index) => (
              <li key={item.item_id} role="none">
                <a
                  id={`cms-autocomplete-${index}`}
                  href={item.path}
                  role="option"
                  aria-selected={activeSuggestion === index}
                  onMouseEnter={() => setActiveSuggestion(index)}
                >
                  <strong>{item.payload.title}</strong>
                  <br />
                  <small>
                    {labels[item.content_type]} · {item.matched_by}
                  </small>
                </a>
              </li>
            ))}
          </ul>
        )}
      </form>
      {result && (
        <div className="unified-search__tabs" role="group" aria-label="Filtrar resultados por tipo">
          {(Object.keys(labels) as Tab[]).map((key) => (
            <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>
              {labels[key]} {key === "all" ? result.total : result.groups[key]}
            </button>
          ))}
        </div>
      )}
      {error ? (
        <div className="new-catalog__state" role="alert">
          {error}
        </div>
      ) : !result ? (
        <div className="new-catalog__state" aria-busy="true">
          Buscando…
        </div>
      ) : visible.length === 0 ? (
        <div className="new-catalog__state">
          <h2>Nenhum resultado exato</h2>
          <p>
            A consulta foi registrada anonimamente para revisão. Tente remover uma unidade ou termo, explore
            as categorias ou envie sua aplicação para a engenharia.
          </p>
          <a href="/produtos">Explorar produtos</a> · <a href="/aplicacoes">Explorar aplicações</a> ·{" "}
          <a href="/contato">Falar com especialista</a>
        </div>
      ) : (
        <>
          <p>
            {visible.length} resultado(s) para “{query}”
          </p>
          <div className="new-catalog__grid">
            {visible.map((item) =>
              item.content_type === "product" ? (
                <ProductCard
                  key={item.item_id}
                  product={item as any}
                  selected={false}
                  showCompare={false}
                  onSelect={() => undefined}
                />
              ) : (
                <DiscoveryEntityCard key={item.item_id} entity={item as any} />
              ),
            )}
          </div>
        </>
      )}
    </section>
  );
}
