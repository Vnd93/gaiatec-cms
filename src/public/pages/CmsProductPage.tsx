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
          description: data.seo.description,
          canonicalPath: data.seo.canonicalPath,
          indexable: data.seo.indexable,
          ogImage: data.seo.ogImageId
            ? (data.media_urls?.[`${data.seo.ogImageId}:large.webp`] ??
              data.media_urls?.[`${data.seo.ogImageId}:medium.webp`])
            : undefined,
        });
        const script = document.createElement("script");
        script.type = "application/ld+json";
        script.dataset.cmsProductSchema = "true";
        script.text = JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Product",
          name: data.payload.title,
          model: data.payload.models[0]?.model,
          ...(data.payload.brand ? { brand: { "@type": "Brand", name: data.payload.brand.name } } : {}),
          ...(data.payload.manufacturer
            ? { manufacturer: { "@type": "Organization", name: data.payload.manufacturer.name } }
            : {}),
          mpn: data.payload.models[0]?.manufacturerReference,
          ...(data.payload.controlledClassification?.productCategory
            ? { category: data.payload.controlledClassification.productCategory.label }
            : data.payload.classification
              ? { category: data.payload.classification.category }
              : {}),
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
      <section className="new-catalog">
        <div className="new-catalog__state" role="alert">
          <h1>Produto não encontrado</h1>
          <p>{error}</p>
          <a href="/produtos">Voltar ao catálogo</a>
        </div>
      </section>
    );
  if (!product)
    return (
      <section className="new-catalog">
        <div className="new-catalog__state" aria-busy="true">
          Carregando produto…
        </div>
      </section>
    );
  return (
    <CmsProductRenderer
      payload={product.payload}
      mediaUrls={product.media_urls}
      documentUrls={product.document_urls}
    />
  );
}
