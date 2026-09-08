import { ArrowRight, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { usePublishedSiteShell } from "../site-shell-context";
import { getCampaignPlacements } from "../catalog-api";
import "../site-placements.css";

const placementKindLabels: Record<string, string> = {
  product: "Produto",
  service: "Serviço",
  industry: "Setor",
  application: "Aplicação",
  solution: "Solução",
  page: "Página",
  homepage: "Página inicial",
  post: "Artigo",
  campaign: "Campanha",
};

const placementKindLabel = (kind: string) => placementKindLabels[kind] ?? "Conteúdo";

export function GlobalAnnouncement() {
  const { placements } = usePublishedSiteShell();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const announcements = (placements?.placements ?? []).filter(
    (placement) => placement.slot === "global_announcement" && !dismissed.includes(placement.target.path),
  );
  if (!announcements.length) return null;
  const announcement = announcements[0];
  return (
    <aside className="site-announcement" aria-label="Destaque da GAIATEC">
      <Link to={announcement.target.path}>
        <Sparkles size={16} aria-hidden="true" />
        <span>{announcement.label || announcement.target.title}</span>
        <ArrowRight size={16} aria-hidden="true" />
      </Link>
      <button
        type="button"
        aria-label="Fechar aviso"
        onClick={() => setDismissed((current) => [...current, announcement.target.path])}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </aside>
  );
}

export function ContextualPlacements({ position }: { position: "before" | "after" }) {
  const { pathname } = useLocation();
  const { placements } = usePublishedSiteShell();
  const [campaigns, setCampaigns] = useState<
    Array<{ slot: string; campaign: { path: string; title: string; summary: string } }>
  >([]);
  useEffect(() => {
    let active = true;
    void getCampaignPlacements(pathname)
      .then((result) => active && setCampaigns(result.items))
      .catch(() => active && setCampaigns([]));
    return () => {
      active = false;
    };
  }, [pathname]);
  const allowedSlots = pathname === "/" ? [position === "before" ? "home_hero" : "home_featured"] : [];
  const active = (placements?.placements ?? []).filter((placement) => allowedSlots.includes(placement.slot));
  const contextual = campaigns.filter((placement) =>
    position === "before"
      ? [
          "home_hero",
          "global_announcement",
          "product_banner",
          "service_banner",
          "solution_banner",
          "page_banner",
          "article_inline",
        ].includes(placement.slot)
      : ["home_featured"].includes(placement.slot),
  );
  if (!active.length && !contextual.length) return null;
  return (
    <section className="site-placements" aria-labelledby="site-placements-title">
      <div className="site-placements__inner">
        <p>EM DESTAQUE</p>
        <h2 id="site-placements-title">Conteúdos selecionados pela GAIATEC</h2>
        <div className="site-placements__grid">
          {active.map((placement) => (
            <Link to={placement.target.path} key={`${placement.slot}:${placement.target.path}`}>
              <span>{placement.label || placementKindLabel(placement.target.kind)}</span>
              <strong>{placement.target.title}</strong>
              {placement.target.summary && <p>{placement.target.summary}</p>}
              <small>
                Conhecer <ArrowRight size={15} aria-hidden="true" />
              </small>
            </Link>
          ))}
          {contextual.map((placement) => (
            <Link to={placement.campaign.path} key={`${placement.slot}:${placement.campaign.path}`}>
              <span>CAMPANHA</span>
              <strong>{placement.campaign.title}</strong>
              <p>{placement.campaign.summary}</p>
              <small>
                Conhecer <ArrowRight size={15} aria-hidden="true" />
              </small>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
