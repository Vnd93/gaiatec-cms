import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { searchPublishedProducts, type ProductCollection } from "../catalog-api";
import { ProductCard } from "../components/ProductCard";
import { applyCatalogSeo } from "../catalog-seo";
import "../product-catalog.css";

export default function CmsSearchPage() {
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const [result, setResult] = useState<ProductCollection | null>(null);
  const [error, setError] = useState("");
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
        query: "",
      });
      return;
    }
    setResult(null);
    setError("");
    void searchPublishedProducts(query)
      .then((data) => {
        if (active) setResult(data);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : "Busca indisponível.");
      });
    return () => {
      active = false;
    };
  }, [query]);
  return (
    <main className="new-catalog">
      <p className="new-catalog__eyebrow">BUSCA UNIFICADA NOVA</p>
      <h1>Buscar produtos</h1>
      <form className="new-catalog__toolbar" onSubmit={(event) => event.preventDefault()}>
        <label>
          Consulta
          <input
            type="search"
            value={query}
            onChange={(event) => setParams(event.target.value ? { q: event.target.value } : {})}
            placeholder="Modelo, tecnologia, unidade ou sinônimo"
          />
        </label>
      </form>
      {error ? (
        <div className="new-catalog__state" role="alert">
          {error}
        </div>
      ) : !result ? (
        <div className="new-catalog__state" aria-busy="true">
          Buscando…
        </div>
      ) : result.items.length === 0 ? (
        <div className="new-catalog__state">
          <h2>Nenhum resultado exato</h2>
          <p>Revise o termo, remova critérios ou envie sua aplicação para a engenharia.</p>
          <a href="/contato">Falar com especialista</a>
        </div>
      ) : (
        <>
          <p>
            {result.total} resultado(s) para “{query}”
          </p>
          <div className="new-catalog__grid">
            {result.items.map((product) => (
              <ProductCard
                key={product.item_id}
                product={product}
                selected={false}
                onSelect={() => undefined}
              />
            ))}
          </div>
        </>
      )}
    </main>
  );
}
