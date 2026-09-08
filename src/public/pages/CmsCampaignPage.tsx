import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router";
import { hasTrackingConsent } from "@/app/tracking-consent";
import { CmsLeadForm } from "../components/CmsLeadForm";
import { CmsPageRenderer } from "../components/CmsPageRenderer";
import { getPublishedCampaign, type PublishedCampaign, type PublishedPageResolution } from "../catalog-api";
import { applyCatalogSeo } from "../catalog-seo";
import "../site-builder.css";

const isResolution = (value: PublishedCampaign | PublishedPageResolution): value is PublishedPageResolution =>
  value.kind === "page" || value.kind === "route" || value.kind === "fallback";

export default function CmsCampaignPage() {
  const location = useLocation();
  const [campaign, setCampaign] = useState<PublishedCampaign | null>(null);
  const [resolution, setResolution] = useState<PublishedPageResolution | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setCampaign(null);
    setResolution(null);
    setError("");
    applyCatalogSeo({
      title: "Campanha em carregamento | GAIATEC",
      description: "Carregando a campanha solicitada.",
      canonicalPath: location.pathname,
      indexable: false,
    });
    void getPublishedCampaign(location.pathname)
      .then((result) => {
        if (!active) return;
        if (isResolution(result)) {
          setResolution(result);
          applyCatalogSeo({
            title: "Campanha encerrada | GAIATEC",
            description: "A campanha solicitada não está disponível.",
            canonicalPath: location.pathname,
            indexable: false,
          });
        } else {
          setCampaign(result);
          applyCatalogSeo({
            title: result.seo.title,
            description: result.seo.description,
            canonicalPath: result.seo.canonicalPath,
            indexable: result.seo.indexable,
            ogImage: result.seo.socialImage,
          });
          if (
            result.payload.tracking.enabled &&
            result.payload.tracking.requiresConsent &&
            hasTrackingConsent()
          ) {
            window.dispatchEvent(
              new CustomEvent("gaiatec:consented-campaign-view", {
                detail: {
                  campaignPath: result.path,
                  eventName: result.payload.tracking.eventName,
                  provider: result.payload.tracking.provider,
                },
              }),
            );
          }
        }
      })
      .catch(() => {
        if (!active) return;
        setError("Campanha indisponível ou expirada.");
        applyCatalogSeo({
          title: "Campanha indisponível | GAIATEC",
          description: "A campanha solicitada não está disponível.",
          canonicalPath: location.pathname,
          indexable: false,
        });
      });
    return () => {
      active = false;
    };
  }, [location.pathname]);
  if (resolution?.kind === "route" && resolution.rule.destinationPath)
    return <Navigate replace to={resolution.rule.destinationPath} />;
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
        mediaUrls={campaign.mediaUrls}
        mediaAlt={campaign.mediaAlt}
        relatedItems={campaign.relatedItems}
        leadContext={{ campaignPath: campaign.path }}
        governedForm={campaign.form}
      />
      {campaign.form && !campaign.payload.blocks.some((block) => block.type === "form") && (
        <section className="cms-page-block cms-page-block--form cms-page-block--muted cms-page-block--wide">
          <div className="cms-page-block__inner">
            <CmsLeadForm form={campaign.form} campaignPath={campaign.path} />
          </div>
        </section>
      )}
    </section>
  );
}
