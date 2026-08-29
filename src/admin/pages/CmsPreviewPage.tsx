import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase";
import { CmsStructuredArticle, type CmsArticlePayload } from "@/shared/components/CmsStructuredArticle";
export default function CmsPreviewPage() {
  const { token = "" } = useParams();
  const [payload, setPayload] = useState<CmsArticlePayload | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    document.title = "Preview privado | CMS GAIATEC";
    let robots = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    if (!robots) {
      robots = document.createElement("meta");
      robots.name = "robots";
      document.head.append(robots);
    }
    robots.content = "noindex,nofollow,noarchive";
    void fetch(SUPABASE_URL + "/functions/v1/cms-preview?token=" + encodeURIComponent(token), {
      headers: { apikey: SUPABASE_ANON_KEY },
      cache: "no-store",
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setPayload(data.payload);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Preview indisponível."));
  }, [token]);
  return (
    <main className="cms-preview-page" data-admin-surface>
      {error ? (
        <div className="admin-state admin-notice--error" role="alert">
          <h1>Preview indisponível</h1>
          <p>{error}</p>
        </div>
      ) : payload ? (
        <CmsStructuredArticle payload={payload} preview />
      ) : (
        <div className="admin-state" aria-busy="true">
          Carregando preview real…
        </div>
      )}
    </main>
  );
}
