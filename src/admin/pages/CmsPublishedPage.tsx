import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase";
import { CmsStructuredArticle, type CmsArticlePayload } from "@/shared/components/CmsStructuredArticle";
export default function CmsPublishedPage() {
  const { slug = "" } = useParams();
  const [payload, setPayload] = useState<CmsArticlePayload | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let robots = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    if (!robots) {
      robots = document.createElement("meta");
      robots.name = "robots";
      document.head.append(robots);
    }
    robots.content = "noindex,follow";
    void fetch(SUPABASE_URL + "/functions/v1/cms-public?slug=" + encodeURIComponent(slug), {
      headers: { apikey: SUPABASE_ANON_KEY },
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setPayload(data.payload);
        document.title = data.seo?.title ?? data.payload.title;
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Conteúdo não encontrado."));
  }, [slug]);
  return (
    <main className="cms-preview-page" data-admin-surface>
      {error ? (
        <div className="admin-state" role="alert">
          <h1>Conteúdo não encontrado</h1>
          <p>{error}</p>
        </div>
      ) : payload ? (
        <CmsStructuredArticle payload={payload} />
      ) : (
        <div className="admin-state" aria-busy="true">
          Carregando projeção publicada…
        </div>
      )}
    </main>
  );
}
