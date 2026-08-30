import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase";
import { CmsStructuredArticle, type CmsArticlePayload } from "@/shared/components/CmsStructuredArticle";
import { CmsProductRenderer } from "@/public/components/CmsProductRenderer";
import type { CmsProductContent } from "@/shared/contracts/cms-content";
import type {
  CmsApplicationContent,
  CmsCampaignContent,
  CmsIndustryContent,
  CmsPageContent,
  CmsServiceContent,
  CmsSolutionContent,
} from "@/shared/contracts/cms-content";
import { DiscoveryEntityRenderer } from "@/public/components/DiscoveryEntityRenderer";
import { CmsPageRenderer } from "@/public/components/CmsPageRenderer";
export default function CmsPreviewPage() {
  const { token = "" } = useParams();
  const [previewData, setPreviewData] = useState<{
      payload:
        | CmsArticlePayload
        | CmsProductContent
        | CmsServiceContent
        | CmsIndustryContent
        | CmsApplicationContent
        | CmsSolutionContent
        | CmsCampaignContent
        | CmsPageContent;
      itemId?: string;
      slug?: string;
      contentType?: string;
      media_urls?: Record<string, string>;
      media_alt?: Record<string, string>;
      document_urls?: Record<string, string>;
    } | null>(null),
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
        setPreviewData(data);
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
      ) : previewData ? (
        "contentType" in previewData.payload && previewData.payload.contentType === "product" ? (
          <CmsProductRenderer
            payload={previewData.payload}
            mediaUrls={previewData.media_urls}
            documentUrls={previewData.document_urls}
            preview
          />
        ) : "contentType" in previewData.payload &&
          ["page", "homepage", "campaign"].includes(previewData.payload.contentType) ? (
          <CmsPageRenderer
            payload={previewData.payload as CmsPageContent | CmsCampaignContent}
            mediaUrls={previewData.media_urls}
            mediaAlt={previewData.media_alt}
            preview
          />
        ) : "contentType" in previewData.payload &&
          ["service", "industry", "application", "solution"].includes(previewData.payload.contentType) ? (
          <DiscoveryEntityRenderer
            preview
            entity={{
              item_id: previewData.itemId ?? "preview",
              revision_id: "preview",
              slug: previewData.slug ?? "preview",
              content_type: previewData.payload.contentType as any,
              path: "#",
              payload: previewData.payload as any,
              seo: previewData.payload.seo,
              content_version: 0,
              etag: "preview",
              published_at: new Date().toISOString(),
              media_urls: previewData.media_urls,
              document_urls: previewData.document_urls,
            }}
          />
        ) : (
          <CmsStructuredArticle
            payload={previewData.payload as CmsArticlePayload}
            mediaUrls={previewData.media_urls}
            mediaAlt={previewData.media_alt}
            preview
          />
        )
      ) : (
        <div className="admin-state" aria-busy="true">
          Carregando preview real…
        </div>
      )}
    </main>
  );
}
