import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import { AnimateOnScroll } from "./useScrollAnimation";
import { useSetores } from "../hooks/useSiteData";
import { optimizedBg } from "./ResponsiveImage";

/* ────────────────────────────────────────────────────────
   FONTS
   ──────────────────────────────────────────────────────── */
const KNOCKOUT = "'Knockout HTF68', sans-serif";
const BODY_FONT = "Arial, sans-serif";

/* ────────────────────────────────────────────────────────
   FALLBACK DATA — usado quando o CMS está indisponível ou
   ainda não tem setores cadastrados. Pedro edita pelo painel
   ERP em /marketing/setores.
   ──────────────────────────────────────────────────────── */
type Industry = { title: string; description: string; image: string; href: string };

const FALLBACK_INDUSTRIES: Industry[] = [
  {
    title: "Saneamento / Líquido",
    description: "Macromedição, monitoramento de qualidade da água e controle de perdas para companhias de saneamento e autarquias municipais.",
    image: "/images/industries/5.4.png",
    href: "/setores/saneamento",
  },
  {
    title: "Gás e Petróleo",
    description: "Soluções robustas para extração, refino e distribuição, garantindo segurança e eficiência em ambientes críticos e classificados.",
    image: "/images/industries/5.5.png",
    href: "/setores/gas-petroleo",
  },
  {
    title: "Biogás e Biometano",
    description: "Instrumentação, automação e biodigestores GT-BIODIGEST para toda a cadeia: da produção ao aproveitamento energético.",
    image: "/images/industries/5.3.png",
    href: "/setores/biogas-biometano",
  },
  {
    title: "Proteção Catódica",
    description: "Projeto, instalação e monitoramento de sistemas eletroquímicos para prevenção da corrosão em dutos e estruturas metálicas.",
    image: "/images/industries/5.1.png",
    href: "/setores/protecao-catodica",
  },
  {
    title: "Agronegócio",
    description: "Sensores e automação para agricultura de precisão, monitoramento de solo, clima e controle de processos agroindustriais.",
    image: "/images/industries/5.2.png",
    href: "/setores/agronegocio",
  },
  {
    title: "Indústria",
    description: "Soluções transversais em instrumentação e automação para os mais diversos processos industriais, da química à metalurgia.",
    image: "/images/industries/5.6.png",
    href: "/setores/industria",
  },
];

/* ────────────────────────────────────────────────────────
   CAROUSEL CONSTANTS
   ──────────────────────────────────────────────────────── */
const SLIDE_GAP = 0; // columns are flush, divided by lines only

export function IndustriesCarousel() {
  const { setores } = useSetores();

  // Setores publicados vêm do CMS (tabela `setores_site`, editáveis em
  // /marketing/setores). Caem para FALLBACK_INDUSTRIES quando a API
  // está fora ou nenhum setor foi marcado como publicado ainda.
  const industries = useMemo<Industry[]>(() => {
    if (!setores || setores.length === 0) return FALLBACK_INDUSTRIES;
    return setores.map((s) => ({
      title: s.titulo,
      description: s.descricao_curta || "",
      image: s.imagem_url || "/images/industries/5.6.png",
      href: `/setores/${s.slug}`,
    }));
  }, [setores]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [scrollIndex, setScrollIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(5);

  /* ── Responsive: how many columns visible ── */
  const updateVisibleCount = useCallback(() => {
    const w = window.innerWidth;
    if (w < 640) setVisibleCount(2);
    else if (w < 900) setVisibleCount(3);
    else if (w < 1200) setVisibleCount(4);
    else setVisibleCount(5);
  }, []);

  useEffect(() => {
    updateVisibleCount();
    window.addEventListener("resize", updateVisibleCount);
    return () => window.removeEventListener("resize", updateVisibleCount);
  }, [updateVisibleCount]);

  const maxScroll = Math.max(0, industries.length - visibleCount);

  /* ── Navigation ── */
  const slideNext = useCallback(() => {
    setScrollIndex((prev) => (prev >= maxScroll ? 0 : prev + 1));
  }, [maxScroll]);

  const slidePrev = useCallback(() => {
    setScrollIndex((prev) => (prev <= 0 ? maxScroll : prev - 1));
  }, [maxScroll]);

  /* ── Auto-scroll (optional, subtle) ── */
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startAuto = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(slideNext, 6000);
  }, [slideNext]);
  const stopAuto = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    startAuto();
    return stopAuto;
  }, [startAuto, stopAuto]);

  /* ── Compute column width ── */
  const colWidthPercent = 100 / visibleCount;
  const translatePercent = -(scrollIndex * colWidthPercent);

  /* ── Visible industries in current viewport ── */
  const visibleIndices = Array.from({ length: visibleCount }, (_, i) => scrollIndex + i).filter(
    (i) => i < industries.length
  );

  return (
    <>
      <style>{`
        .sec4-col {
          position: relative;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          padding: 0 30px 50px 30px;
          cursor: pointer;
          transition: background-color 0.3s;
        }
        .sec4-col::after {
          content: "";
          position: absolute;
          top: 0;
          right: 0;
          width: 1px;
          height: 100%;
          background: rgba(255,255,255,0.2);
        }
        .sec4-col:last-child::after {
          display: none;
        }
        .sec4-arrow-box {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 33px;
          height: 33px;
          background: rgb(0, 87, 222);
          border: 1px solid rgb(0, 87, 222);
          cursor: pointer;
          transition: background 0.4s;
        }
        .sec4-arrow-box:hover {
          background: rgb(0, 70, 179);
        }
        .sec4-nav-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border: 1px solid rgba(255,255,255,0.35);
          background: transparent;
          color: rgba(255,255,255,0.7);
          cursor: pointer;
          transition: border-color 0.25s, color 0.25s, background 0.25s;
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          z-index: 10;
        }
        .sec4-nav-btn:hover {
          border-color: rgb(0, 87, 222);
          color: rgb(0, 87, 222);
        }
        .sec4-viewall-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: 1px solid rgba(255,255,255,0.4);
          padding: 7px 14px;
          color: #fff;
          font-size: 13px;
          text-decoration: none;
          white-space: nowrap;
          transition: border-color 0.25s, color 0.25s;
          cursor: pointer;
        }
        .sec4-viewall-btn:hover {
          border-color: rgb(0, 87, 222);
          color: rgb(0, 87, 222);
        }
        @media (max-width: 767px) {
          .sec4-section-title {
            font-size: 40px !important;
            line-height: 36px !important;
          }
          .sec4-col {
            padding: 0 20px 40px 20px !important;
          }
          .sec4-col-title {
            font-size: 28px !important;
            line-height: 26px !important;
          }
        }
      `}</style>

      <section
        id="industries"
        style={{
          position: "relative",
          overflow: "hidden",
          minHeight: 700,
          fontFamily: BODY_FONT,
        }}
        onMouseEnter={stopAuto}
        onMouseLeave={startAuto}
      >
        {/* ── FULL-WIDTH BACKGROUND IMAGES (crossfade) — só carrega atual + adjacentes ── */}
        {industries.map((ind, i) => {
          // Lazy load: só renderiza imagem do slide ativo + próximo + anterior
          const isVisible =
            i === activeIndex ||
            i === (activeIndex + 1) % industries.length ||
            i === (activeIndex - 1 + industries.length) % industries.length;
          return (
            <div
              key={ind.title}
              style={{
                position: "absolute",
                inset: 0,
                opacity: activeIndex === i ? 1 : 0,
                transition: "opacity 0.7s ease",
                zIndex: 0,
              }}
            >
              {isVisible && (
                <picture>
                  {/* As variantes 1920w destas imagens não foram geradas; usar até 1024w
                      (o navegador escolhe a maior disponível em telas largas). */}
                  <source
                    type="image/avif"
                    srcSet={`${optimizedBg(ind.image, 480, 'avif')} 480w, ${optimizedBg(ind.image, 1024, 'avif')} 1024w`}
                    sizes="100vw"
                  />
                  <source
                    type="image/webp"
                    srcSet={`${optimizedBg(ind.image, 480, 'webp')} 480w, ${optimizedBg(ind.image, 1024, 'webp')} 1024w`}
                    sizes="100vw"
                  />
                  <img
                    src={optimizedBg(ind.image, 1024, 'webp')}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      objectPosition: "center",
                      display: "block",
                    }}
                  />
                </picture>
              )}
            </div>
          );
        })}

        {/* ── DARK OVERLAY ── */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.55)",
            zIndex: 1,
          }}
        />

        {/* ── CONTENT (z-index above overlay) ── */}
        <div style={{ position: "relative", zIndex: 2, minHeight: 700, display: "flex", flexDirection: "column" }}>
          {/* ── HEADER ── */}
          <div
            style={{
              maxWidth: 1440,
              width: "100%",
              marginLeft: "auto",
              marginRight: "auto",
              paddingLeft: 30,
              paddingRight: 30,
              paddingTop: 50,
            }}
          >
            <AnimateOnScroll>
              <h2
                className="sec4-section-title"
                style={{
                  fontFamily: KNOCKOUT,
                  fontSize: 60,
                  fontWeight: 500,
                  lineHeight: "52px",
                  textTransform: "uppercase",
                  color: "#fff",
                  marginBottom: 16,
                }}
              >
                Indústrias de Atuação
              </h2>
              <a href="#" className="sec4-viewall-btn">
                Ver todos os 11 setores <ArrowRight size={14} />
              </a>
            </AnimateOnScroll>
          </div>

          {/* ── CAROUSEL AREA ── */}
          <div style={{ flex: 1, position: "relative", marginTop: 30 }}>
            {/* Nav prev */}
            <button
              className="sec4-nav-btn"
              style={{ left: 10 }}
              onClick={() => { slidePrev(); stopAuto(); startAuto(); }}
              aria-label="Previous"
            >
              <ChevronLeft size={18} />
            </button>

            {/* Nav next */}
            <button
              className="sec4-nav-btn"
              style={{ right: 10 }}
              onClick={() => { slideNext(); stopAuto(); startAuto(); }}
              aria-label="Next"
            >
              <ChevronRight size={18} />
            </button>

            {/* ── TRACK ── */}
            <div style={{ overflow: "hidden", height: "100%", minHeight: 520 }}>
              <div
                ref={containerRef}
                style={{
                  display: "flex",
                  height: "100%",
                  transition: "transform 0.6s cubic-bezier(0.25, 0.1, 0.25, 1)",
                  transform: `translateX(${translatePercent}%)`,
                }}
              >
                {industries.map((ind, i) => {
                  const isActive = activeIndex === i;

                  return (
                    <div
                      key={ind.title}
                      className="sec4-col"
                      style={{
                        width: `${colWidthPercent}%`,
                        minWidth: `${colWidthPercent}%`,
                        minHeight: 520,
                      }}
                      onMouseEnter={() => setActiveIndex(i)}
                    >
                      {/* ── TITLE (always visible at bottom) ── */}
                      <h3
                        className="sec4-col-title"
                        style={{
                          fontFamily: KNOCKOUT,
                          fontSize: 40,
                          fontWeight: 500,
                          lineHeight: "34px",
                          textTransform: "uppercase",
                          color: "#fff",
                          marginBottom: 10,
                          userSelect: "none",
                          transition: "transform 0.4s cubic-bezier(0.4,0,0.2,1)",
                          transform: isActive ? "translateY(0)" : "translateY(0)",
                        }}
                      >
                        {ind.title}
                      </h3>

                      {/* ── DESCRIPTION (revealed on hover) ── */}
                      <div
                        style={{
                          maxHeight: isActive ? 280 : 0,
                          opacity: isActive ? 1 : 0,
                          overflow: "hidden",
                          transition:
                            "max-height 0.5s cubic-bezier(0.4,0,0.2,1), opacity 0.35s ease",
                        }}
                      >
                        <div style={{ maxWidth: 420, paddingBottom: 10 }}>
                          <p
                            style={{
                              fontFamily: BODY_FONT,
                              fontSize: 16,
                              lineHeight: "28.8px",
                              color: "rgba(255,255,255,0.9)",
                            }}
                          >
                            {ind.description}
                          </p>
                        </div>
                      </div>

                      {/* ── ARROW BUTTON ── */}
                      <a
                        href={ind.href}
                        onClick={(e) => e.preventDefault()}
                        className="sec4-arrow-box"
                        style={{
                          marginTop: isActive ? 10 : 6,
                          transition: "margin-top 0.3s",
                        }}
                      >
                        <ArrowRight size={16} color="#fff" />
                      </a>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}