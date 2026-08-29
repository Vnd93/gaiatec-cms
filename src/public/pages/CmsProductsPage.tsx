import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { getPublishedProducts, type ProductCollection } from "../catalog-api";
import { ProductCard } from "../components/ProductCard";
import { applyCatalogSeo } from "../catalog-seo";
import "../product-catalog.css";

export default function CmsProductsPage() {
  const [params, setParams] = useSearchParams();
  const [collection, setCollection] = useState<ProductCollection | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
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
  }, [key]);
  const setFilter = (name: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next);
  };
  const facets = collection?.facets;
  const options = useMemo(
    () =>
      [
        ["segment", "Segmento"],
        ["category", "Categoria"],
        ["family", "Família"],
        ["technology", "Tecnologia"],
      ] as const,
    [],
  );
  return (
    <main className="new-catalog">
      <p className="new-catalog__eyebrow">CATÁLOGO NOVO</p>
      <h1>Produtos homologados no CMS</h1>
      <p className="new-catalog__lead">
        Busca, filtros, cards e comparação usam exclusivamente a projeção publicada do cadastro clean-room.
      </p>
      <div className="new-catalog__toolbar">
        <label>
          Buscar no catálogo
          <input
            type="search"
            value={params.get("q") ?? ""}
            onChange={(event) => setFilter("q", event.target.value)}
            placeholder="Modelo, tecnologia, unidade ou sinônimo"
          />
        </label>
        <div className="new-catalog__facets">
          {options.map(([keyName, label]) => (
            <label key={keyName}>
              {label}
              <select
                value={params.get(keyName) ?? ""}
                onChange={(event) => setFilter(keyName, event.target.value)}
              >
                <option value="">Todos</option>
                {(facets?.[keyName] ?? []).map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </div>
      {selected.length >= 2 && (
        <p>
          <Link className="new-catalog__button" to={`/produtos/comparador?produtos=${selected.join(",")}`}>
            Comparar {selected.length} produtos
          </Link>
        </p>
      )}
      {!collection && !error ? (
        <div className="new-catalog__state" aria-busy="true">
          Carregando catálogo novo…
        </div>
      ) : error ? (
        <div className="new-catalog__state" role="alert">
          <h2>Catálogo indisponível</h2>
          <p>{error}</p>
        </div>
      ) : collection?.items.length === 0 ? (
        <div className="new-catalog__state">
          <h2>Nenhum produto publicado</h2>
          <p>O catálogo clean-room permanece vazio até um lote ser homologado e publicado.</p>
        </div>
      ) : (
        <>
          <p>{collection?.total} produto(s)</p>
          <div className="new-catalog__grid">
            {collection?.items.map((product) => (
              <ProductCard
                key={product.item_id}
                product={product}
                selected={selected.includes(product.slug)}
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
        </>
      )}
    </main>
  );
}
