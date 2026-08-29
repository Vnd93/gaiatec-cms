import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { getPublishedProduct, type PublishedProduct } from "../catalog-api";
import { applyCatalogSeo } from "../catalog-seo";
import { CmsProductRenderer } from "../components/CmsProductRenderer";

export default function CmsProductPage() {
  const { slug = "" } = useParams();
  const [product, setProduct] = useState<PublishedProduct | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void getPublishedProduct(slug)
      .then((data) => {
        if (!active) return;
        setProduct(data);
        const canonical = applyCatalogSeo({
          title: data.seo.title,
          canonicalPath: data.seo.canonicalPath,
          indexable: data.seo.indexable,
        });
        const script = document.createElement("script");
        script.type = "application/ld+json";
        script.dataset.cmsProductSchema = "true";
        script.text = JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Product",
          name: data.payload.title,
          model: data.payload.models[0]?.model,
          brand: { "@type": "Brand", name: data.payload.manufacturer.name },
          category: data.payload.classification.category,
          description: data.payload.commercial.shortDescription,
          url: canonical,
        });
        document.head.append(script);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : "Produto não encontrado.");
      });
    return () => {
      active = false;
      document.querySelector('script[data-cms-product-schema="true"]')?.remove();
    };
  }, [slug]);
  if (error)
    return (
      <main className="new-catalog">
        <div className="new-catalog__state" role="alert">
          <h1>Produto não encontrado</h1>
          <p>{error}</p>
          <a href="/produtos">Voltar ao catálogo</a>
        </div>
      </main>
    );
  if (!product)
    return (
      <main className="new-catalog">
        <div className="new-catalog__state" aria-busy="true">
          Carregando produto…
        </div>
      </main>
    );
  return (
    <CmsProductRenderer
      payload={product.payload}
      mediaUrls={product.media_urls}
      documentUrls={product.document_urls}
    />
  );
}
