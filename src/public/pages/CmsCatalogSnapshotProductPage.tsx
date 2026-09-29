import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { getCatalogCapability, getPublishedCatalogSnapshotProduct } from "../catalog-api";
import { isCatalogFeatureEnabled } from "@/shared/contracts/catalog-release";
import { applyCatalogSeo } from "../catalog-seo";
import "../catalog-editorial.css";

/** Isolated catalog preview. No legacy fallback, SKU, commerce or cutover. */
export default function CmsCatalogSnapshotProductPage() {
  const { slug = "" } = useParams();
  const [product, setProduct] = useState<Awaited<
    ReturnType<typeof getPublishedCatalogSnapshotProduct>
  > | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setProduct(null);
    setLoading(true);
    applyCatalogSeo({
      title: "Catálogo GAIATEC",
      description: "Informações para solicitação de orçamento.",
      canonicalPath: `/catalogo/itens/${slug}`,
      indexable: false,
    });
    void getCatalogCapability()
      .then((capability) => {
        if (
          !isCatalogFeatureEnabled({
            buildFlag: import.meta.env.VITE_CATALOG_V1,
            capabilityEnabled: capability.enabled,
            capabilitySource: capability.source,
          })
        )
          return null;
        return getPublishedCatalogSnapshotProduct(slug);
      })
      .then((result) => {
        if (!cancelled) {
          setProduct(result);
          if (result)
            applyCatalogSeo({
              title: `${result.title} | GAIATEC`,
              description: result.summary,
              canonicalPath: result.path,
              indexable: false,
            });
        }
      })
      .catch(() => {
        if (!cancelled) setProduct(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);
  return (
    <article className="catalog-editorial" aria-busy={loading}>
      {loading ? (
        <p role="status">Carregando produto…</p>
      ) : !product ? (
        <>
          <h1>Produto não disponível</h1>
          <Link to="/">Voltar ao início</Link>
        </>
      ) : (
        <>
          <h1>{product.title}</h1>
          <p>{product.summary}</p>
          <p style={{ whiteSpace: "pre-line" }}>{product.description}</p>
          <Link
            className="catalog-editorial__cta"
            to={`/contato?produto=${encodeURIComponent(product.slug)}`}
          >
            Solicitar orçamento
          </Link>
        </>
      )}
    </article>
  );
}
