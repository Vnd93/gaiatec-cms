import { useEffect, useRef } from "react";
import {
  Building2,
  Cog,
  Globe,
  Award,
  Map,
  Shield,
  Gauge,
  Leaf,
  Antenna,
  Sprout,
  Star,
} from "lucide-react";
import { timeline, type TimelineEntry } from "../../data/timeline";

const ICONS: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = {
  Building2,
  Cog,
  Globe,
  Award,
  Map,
  Shield,
  Gauge,
  Leaf,
  Antenna,
  Sprout,
  Star,
};

const KNOCKOUT = "'Knockout HTF68', sans-serif";

/**
 * Timeline component — Linha do Tempo da Gaiatec Sistemas (TASK 19).
 *
 * Desktop: linha vertical central com cards alternando esquerda/direita
 *          (zig-zag).
 * Mobile:  linha vertical à esquerda + todos os cards à direita.
 *
 * Animação: cada card faz fade-in + slide ao entrar no viewport.
 * Linha vertical: animada via CSS conforme scroll passa pela seção.
 */
export function Timeline() {
  const containerRef = useRef<HTMLDivElement>(null);

  // Anima cards com IntersectionObserver
  useEffect(() => {
    const cards = document.querySelectorAll(".gtl-card");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("gtl-visible");
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" }
    );

    cards.forEach((c) => observer.observe(c));
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={containerRef} className="bg-white py-20 md:py-28 relative overflow-hidden">
      <style>{`
        .gtl-wrap {
          max-width: 1100px;
          margin: 0 auto;
          padding: 0 24px;
        }
        .gtl-header {
          text-align: center;
          margin-bottom: 64px;
        }
        .gtl-eyebrow {
          display: inline-block;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: #0057DE;
          margin-bottom: 12px;
        }
        .gtl-title {
          font-family: ${KNOCKOUT};
          font-size: clamp(32px, 4vw, 48px);
          font-weight: 500;
          text-transform: uppercase;
          line-height: 1;
          color: #0f172a;
          margin: 0 0 16px;
        }
        .gtl-subtitle {
          font-size: 16px;
          color: #64748b;
          max-width: 600px;
          margin: 0 auto;
          line-height: 1.6;
        }

        /* ─── Track ─── */
        .gtl-track {
          position: relative;
          padding: 20px 0;
        }
        .gtl-line {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 2px;
          background: linear-gradient(180deg, transparent 0%, #e2e8f0 5%, #e2e8f0 95%, transparent 100%);
        }
        @media (min-width: 1024px) {
          .gtl-line {
            left: 50%;
            transform: translateX(-50%);
          }
        }
        @media (max-width: 1023px) {
          .gtl-line {
            left: 24px;
          }
        }

        /* ─── Card ─── */
        .gtl-card {
          position: relative;
          padding-top: 16px;
          padding-bottom: 32px;
          opacity: 0;
          transform: translateY(20px);
          transition: opacity 0.6s ease, transform 0.6s ease;
        }
        .gtl-card.gtl-visible {
          opacity: 1;
          transform: translateY(0);
        }

        /* Desktop: zig-zag */
        @media (min-width: 1024px) {
          .gtl-card {
            width: 50%;
            padding-left: 64px;
            padding-right: 0;
          }
          .gtl-card.gtl-left {
            padding-left: 0;
            padding-right: 64px;
            margin-left: 0;
            text-align: right;
          }
          .gtl-card.gtl-right {
            margin-left: 50%;
            text-align: left;
          }
          .gtl-card.gtl-left.gtl-visible {
            transform: translateY(0) translateX(0);
          }
          .gtl-card.gtl-right.gtl-visible {
            transform: translateY(0) translateX(0);
          }
          .gtl-card.gtl-left {
            transform: translateY(20px) translateX(-12px);
          }
          .gtl-card.gtl-right {
            transform: translateY(20px) translateX(12px);
          }
        }

        /* Mobile: tudo à direita */
        @media (max-width: 1023px) {
          .gtl-card {
            margin-left: 60px;
          }
        }

        /* ─── Bullet (círculo com ícone) ─── */
        .gtl-bullet {
          position: absolute;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: #0057DE;
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 0 4px #ffffff, 0 4px 14px rgba(0, 87, 222, 0.3);
          z-index: 2;
        }
        @media (min-width: 1024px) {
          .gtl-bullet {
            top: 16px;
            left: 50%;
            transform: translateX(-50%);
          }
          .gtl-card.gtl-left .gtl-bullet {
            right: -20px;
            left: auto;
          }
          .gtl-card.gtl-right .gtl-bullet {
            left: -20px;
          }
        }
        @media (max-width: 1023px) {
          .gtl-bullet {
            top: 16px;
            left: -56px;
            width: 32px;
            height: 32px;
          }
        }

        /* ─── Card body ─── */
        .gtl-body {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 24px;
          transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
        }
        .gtl-body:hover {
          border-color: #0057DE;
          box-shadow: 0 8px 24px rgba(0, 87, 222, 0.08);
          transform: translateY(-2px);
        }
        .gtl-year {
          font-family: ${KNOCKOUT};
          font-size: 28px;
          font-weight: 500;
          line-height: 1;
          color: #0057DE;
          margin: 0 0 8px;
        }
        .gtl-card-title {
          font-size: 17px;
          font-weight: 600;
          line-height: 1.3;
          color: #0f172a;
          margin: 0 0 8px;
        }
        .gtl-text {
          font-size: 14px;
          line-height: 1.6;
          color: #64748b;
          margin: 0;
        }
      `}</style>

      <div className="gtl-wrap">
        {/* ─── Header ─── */}
        <div className="gtl-header">
          <span className="gtl-eyebrow">Linha do Tempo</span>
          <h2 className="gtl-title">+20 Anos de Inovação</h2>
          <p className="gtl-subtitle">
            Desde 2004, transformando o mercado de instrumentação industrial brasileiro com tecnologia, expertise e compromisso.
          </p>
        </div>

        {/* ─── Track ─── */}
        <div className="gtl-track">
          <div className="gtl-line" aria-hidden="true" />

          {timeline.map((entry: TimelineEntry, i) => {
            const Icon = ICONS[entry.icone] ?? Star;
            const side = i % 2 === 0 ? "gtl-left" : "gtl-right";
            return (
              <div key={entry.ano} className={`gtl-card ${side}`}>
                <span className="gtl-bullet" aria-hidden="true">
                  <Icon size={18} strokeWidth={2} />
                </span>
                <div className="gtl-body">
                  <div className="gtl-year">{entry.ano}</div>
                  <h3 className="gtl-card-title">{entry.titulo}</h3>
                  <p className="gtl-text">{entry.texto}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
