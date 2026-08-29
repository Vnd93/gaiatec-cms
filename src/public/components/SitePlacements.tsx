import { ArrowRight, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router";
import { usePublishedSiteShell } from "../site-shell-context";
import "../site-placements.css";

export function GlobalAnnouncement() {
  const { placements } = usePublishedSiteShell();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const announcements = (placements?.placements ?? []).filter(
    (placement) => placement.slot === "global_announcement" && !dismissed.includes(placement.id),
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
        onClick={() => setDismissed((current) => [...current, announcement.id])}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </aside>
  );
}

export function ContextualPlacements({ position }: { position: "before" | "after" }) {
  const { pathname } = useLocation();
  const { placements } = usePublishedSiteShell();
  const allowedSlots = pathname === "/" ? [position === "before" ? "home_hero" : "home_featured"] : [];
  const active = (placements?.placements ?? []).filter((placement) => allowedSlots.includes(placement.slot));
  if (!active.length) return null;
  return (
    <section className="site-placements" aria-labelledby="site-placements-title">
      <div className="site-placements__inner">
        <p>EM DESTAQUE</p>
        <h2 id="site-placements-title">Conteúdos selecionados pela GAIATEC</h2>
        <div className="site-placements__grid">
          {active.map((placement) => (
            <Link to={placement.target.path} key={placement.id}>
              <span>{placement.label || placement.target.contentType}</span>
              <strong>{placement.target.title}</strong>
              {placement.target.summary && <p>{placement.target.summary}</p>}
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
