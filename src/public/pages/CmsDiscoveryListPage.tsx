import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import {
  getPublishedDiscoveryCollection,
  type DiscoveryType,
  type UnifiedSearchResult,
} from "../catalog-api";
import { DiscoveryEntityCard } from "../components/DiscoveryEntityRenderer";
import { applyCatalogSeo } from "../catalog-seo";
import "../product-catalog.css";

const copy = {
  service: ["Serviços", "/servicos"],
  industry: ["Indústrias", "/industrias"],
  application: ["Aplicações", "/aplicacoes"],
  solution: ["Soluções", "/solucoes"],
} as const;
export default function CmsDiscoveryListPage({ contentType }: { contentType: DiscoveryType }) {
  const [params, setParams] = useSearchParams(),
    query = params.get("q") ?? "",
    [result, setResult] = useState<UnifiedSearchResult | null>(null),
    [error, setError] = useState("");
  const [title, path] = copy[contentType];
  useEffect(() => {
    let active = true;
    applyCatalogSeo({ title: `${title} | GAIATEC`, canonicalPath: path, indexable: false });
    setResult(null);
    setError("");
    void getPublishedDiscoveryCollection(contentType, query)
      .then((data) => {
        if (active) {
          setResult(data);
          applyCatalogSeo({
            title: `${title} | GAIATEC`,
            canonicalPath: path,
            indexable: !query && data.items.length > 0,
          });
        }
      })
      .catch((e) => {
        if (active) {
          setError(e instanceof Error ? e.message : "Conteúdo indisponível.");
          applyCatalogSeo({
            title: `${title} indisponível | GAIATEC`,
            canonicalPath: path,
            indexable: false,
          });
        }
      });
    return () => {
      active = false;
    };
  }, [contentType, path, query, title]);
  return (
    <section className="new-catalog" aria-labelledby={`discovery-${contentType}-title`}>
      <p className="new-catalog__eyebrow">PROJEÇÃO PUBLICADA NOVA</p>
      <h1 id={`discovery-${contentType}-title`}>{title}</h1>
      <form className="new-catalog__toolbar" onSubmit={(e) => e.preventDefault()}>
        <label>
          Filtrar {title.toLowerCase()}
          <input
            type="search"
            value={query}
            onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {})}
          />
        </label>
      </form>
      {error ? (
        <div className="new-catalog__state" role="alert">
          {error}
        </div>
      ) : !result ? (
        <div className="new-catalog__state" aria-busy="true">
          Carregando…
        </div>
      ) : result.items.length === 0 ? (
        <div className="new-catalog__state">
          <h2>Nenhum conteúdo publicado</h2>
          <p>Os cadastros definitivos serão feitos pelo novo /admin após aprovação dos owners.</p>
        </div>
      ) : (
        <div className="new-catalog__grid">
          {result.items.map((item) => (
            <DiscoveryEntityCard key={item.item_id} entity={item as any} />
          ))}
        </div>
      )}
    </section>
  );
}
