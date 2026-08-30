import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router";
import { hasTrackingConsent } from "@/app/tracking-consent";
import { CmsLeadForm } from "../components/CmsLeadForm";
import { CmsPageRenderer } from "../components/CmsPageRenderer";
import { getPublishedCampaign, type PublishedCampaign, type PublishedPageResolution } from "../catalog-api";
import "../site-builder.css";

const isResolution = (value: PublishedCampaign | PublishedPageResolution): value is PublishedPageResolution =>
  "kind" in value;

export default function CmsCampaignPage() {
  const location = useLocation();
  const [campaign, setCampaign] = useState<PublishedCampaign | null>(null);
  const [resolution, setResolution] = useState<PublishedPageResolution | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void getPublishedCampaign(location.pathname)
      .then((result) => {
        if (!active) return;
        if (isResolution(result)) setResolution(result);
        else {
          setCampaign(result);
          document.title = result.seo.title;
          if (
            result.payload.tracking.enabled &&
            result.payload.tracking.requiresConsent &&
            hasTrackingConsent()
          ) {
            window.dispatchEvent(
              new CustomEvent("gaiatec:consented-campaign-view", {
                detail: {
                  campaignId: result.item_id,
                  eventName: result.payload.tracking.eventName,
                  provider: result.payload.tracking.provider,
                },
              }),
            );
          }
        }
      })
      .catch(() => active && setError("Campanha indisponível ou expirada."));
    return () => {
      active = false;
    };
  }, [location.pathname]);
  if (resolution?.kind === "route" && resolution.rule.destination_path)
    return <Navigate replace to={resolution.rule.destination_path} />;
  if (resolution || error)
    return (
      <section className="cms-managed-page__gone" role="alert" aria-labelledby="campaign-gone-title">
        <p>Conteúdo temporário</p>
        <h1 id="campaign-gone-title">Campanha encerrada</h1>
        <span>{error || "Este conteúdo não está mais disponível."}</span>
      </section>
    );
  if (!campaign)
    return (
      <section className="cms-managed-page cms-managed-page__loading" aria-busy="true">
        Carregando campanha…
      </section>
    );
  return (
    <section aria-label={campaign.payload.title}>
      <CmsPageRenderer
        payload={campaign.payload}
        mediaUrls={campaign.media_urls}
        mediaAlt={campaign.media_alt}
        relatedItems={campaign.related_items}
        leadContext={{ campaignId: campaign.item_id }}
      />
      {campaign.form && !campaign.payload.blocks.some((block) => block.type === "form") && (
        <section className="cms-page-block cms-page-block--form cms-page-block--muted cms-page-block--wide">
          <div className="cms-page-block__inner">
            <CmsLeadForm form={campaign.form} campaignId={campaign.item_id} />
          </div>
        </section>
      )}
    </section>
  );
}
