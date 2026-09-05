import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { getPublishedDiscovery, type DiscoveryType, type PublishedDiscovery } from "../catalog-api";
import { DiscoveryEntityRenderer } from "../components/DiscoveryEntityRenderer";
import { applyCatalogSeo } from "../catalog-seo";
import "../product-catalog.css";
export default function CmsDiscoveryDetailPage({ contentType }: { contentType: DiscoveryType }) {
  const { slug = "" } = useParams(),
    [entity, setEntity] = useState<PublishedDiscovery | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setEntity(null);
    setError("");
    const canonicalPath = `/${contentType === "industry" ? "industrias" : contentType === "application" ? "aplicacoes" : contentType === "solution" ? "solucoes" : "servicos"}/${slug}`;
    applyCatalogSeo({ title: "Conteúdo em carregamento | GAIATEC", canonicalPath, indexable: false });
    void getPublishedDiscovery(contentType, slug)
      .then((data) => {
        if (active) {
          setEntity(data);
          applyCatalogSeo(data.payload.seo);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e instanceof Error ? e.message : "Conteúdo indisponível.");
          applyCatalogSeo({ title: "Conteúdo indisponível | GAIATEC", canonicalPath, indexable: false });
        }
      });
    return () => {
      active = false;
    };
  }, [contentType, slug]);
  if (error)
    return (
      <section className="new-catalog">
        <div className="new-catalog__state" role="alert">
          <h1>Conteúdo indisponível</h1>
          <p>{error}</p>
        </div>
      </section>
    );
  if (!entity)
    return (
      <section className="new-catalog">
        <div className="new-catalog__state" aria-busy="true">
          Carregando…
        </div>
      </section>
    );
  return <DiscoveryEntityRenderer entity={entity} />;
}
