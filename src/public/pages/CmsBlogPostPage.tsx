import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { CmsStructuredArticle } from "@/shared/components/CmsStructuredArticle";
import { getPublishedPost, type PublishedPost } from "../catalog-api";
import "../site-builder.css";

export default function CmsBlogPostPage() {
  const { slug = "" } = useParams();
  const [post, setPost] = useState<PublishedPost | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void getPublishedPost(slug)
      .then((result) => {
        if (!active) return;
        setPost(result);
        document.title = result.seo.title;
      })
      .catch(() => active && setError("Artigo não encontrado."));
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
        publishedAt={post.published_at}
        mediaUrls={post.media_urls}
        mediaAlt={post.media_alt}
        relatedItems={post.related_items}
      />
    </section>
  );
}
