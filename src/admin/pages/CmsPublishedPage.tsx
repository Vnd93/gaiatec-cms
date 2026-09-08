import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase";
import { CmsStructuredArticle, type CmsArticlePayload } from "@/shared/components/CmsStructuredArticle";
import { operatorErrorMessage } from "../operator-error-message";

const publishedUnavailableMessage = "Não foi possível carregar este conteúdo.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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
        if (!response.ok) {
          setError(
            operatorErrorMessage(undefined, {
              fallback: publishedUnavailableMessage,
              source: "remote",
              status: response.status,
            }),
          );
          return;
        }
        const data: unknown = await response.json().catch(() => null);
        if (
          !isRecord(data) ||
          !isRecord(data.payload) ||
          typeof data.payload.title !== "string" ||
          !Array.isArray(data.payload.blocks)
        ) {
          setError(publishedUnavailableMessage);
          return;
        }
        const article = data.payload as CmsArticlePayload;
        setPayload(article);
        document.title =
          isRecord(data.seo) && typeof data.seo.title === "string" ? data.seo.title : article.title;
      })
      .catch((caught) =>
        setError(
          operatorErrorMessage(caught, {
            fallback: publishedUnavailableMessage,
            source: "remote",
            status: 0,
          }),
        ),
      );
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
