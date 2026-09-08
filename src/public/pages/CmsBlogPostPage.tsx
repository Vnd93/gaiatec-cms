import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { CmsStructuredArticle } from "@/shared/components/CmsStructuredArticle";
import { getPublishedPost, type PublishedPost } from "../catalog-api";
import { applyCatalogSeo } from "../catalog-seo";
import "../site-builder.css";

export default function CmsBlogPostPage() {
  const { slug = "" } = useParams();
  const [post, setPost] = useState<PublishedPost | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const canonicalPath = `/blog/${slug}`;
    setPost(null);
    setError("");
    applyCatalogSeo({
      title: "Artigo em carregamento | GAIATEC",
      description: "Carregando o artigo técnico solicitado.",
      canonicalPath,
      indexable: false,
    });
    void getPublishedPost(slug)
      .then((result) => {
        if (!active) return;
        setPost(result);
        applyCatalogSeo({
          title: result.seo.title,
          description: result.seo.description,
          canonicalPath: result.seo.canonicalPath,
          indexable: result.seo.indexable,
          ogImage: result.seo.socialImage,
        });
      })
      .catch(() => {
        if (!active) return;
        setError("Artigo não encontrado.");
        applyCatalogSeo({
          title: "Artigo não encontrado | GAIATEC",
          description: "O artigo solicitado não está disponível.",
          canonicalPath,
          indexable: false,
        });
      });
    return () => {
      active = false;
    };
  }, [slug]);
  if (error)
    return (
      <section className="cms-managed-page">
        <div className="cms-page-block__inner" role="alert">
          <h1>Artigo não encontrado</h1>
          <p>{error}</p>
        </div>
      </section>
    );
  if (!post)
    return (
      <section className="cms-managed-page">
        <div className="cms-page-block__inner" aria-busy="true">
          Carregando artigo…
        </div>
      </section>
    );
  return (
    <section className="cms-managed-page" aria-label="Artigo do blog">
      <CmsStructuredArticle
        payload={post.payload}
        publishedAt={post.publishedAt}
        mediaUrls={post.mediaUrls}
        mediaAlt={post.mediaAlt}
        relatedItems={post.relatedItems}
      />
    </section>
  );
}
