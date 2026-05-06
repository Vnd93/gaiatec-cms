import { useState, useEffect, useCallback, useRef } from "react";
import { ArrowRight } from "lucide-react";
import { optimizedBg } from "./ResponsiveImage";

/* ────────────────────────────────────────────────────────
   FONTS
   ──────────────────────────────────────────────────────── */
const KNOCKOUT = "'Knockout HTF68', sans-serif";
const BODY_FONT = "Arial, sans-serif";

/* ────────────────────────────────────────────────────────
   SLIDE DATA (extracted from Builder.io JSON)
   ──────────────────────────────────────────────────────── */
const slides = [
  {
    label: "PRODUTO EM DESTAQUE",
    title: "GatSonic P-Clamp — Medição Não Intrusiva Sem Interrupção do Processo",
    description:
      "Medidor de vazão ultrassônico clamp-on para instalação externa em tubulações. Sem necessidade de corte de tubulação ou parada do processo.",
    cta: "Ver Especificações Técnicas",
    image:
      "/images/slides/11.1.png",
  },
  {
    label: "LINHA EXCLUSIVA",
    title: "GT-BIODIGEST — Biodigestores para Produção e Aproveitamento de Biogás",
    description:
      "A linha GT-BIODIGEST foi desenvolvida para otimizar a produção de biogás em propriedades rurais, frigoríficos, cervejarias e aterros sanitários.",
    cta: "Conhecer a Linha GT-BIODIGEST",
    image:
      "/images/slides/11.2.png",
  },
  {
    label: "SERVIÇO CERTIFICADO",
    title: "Calibração com Acreditação RBC — Rastreabilidade Metrológica Internacional",
    description:
      "Nosso laboratório de calibração é acreditado pela RBC e homologado pelo INMETRO, garantindo rastreabilidade total para suas medições.",
    cta: "Solicitar Calibração",
    image:
      "/images/slides/11.3.png",
  },
  {
    label: "CONECTIVIDADE",
    title: "Telemetria Industrial — Monitoramento Remoto de Ativos em Tempo Real",
    description:
      "Sistemas de telemetria via rádio ou celular para supervisão remota de pontos distribuídos: estações de bombeamento, biodigestores, redes de gás e distribuição de água.",
    cta: "Ver Soluções em Telemetria",
    image:
      "/images/slides/11.4.png",
  },
  {
    label: "INTEGRIDADE DE ATIVOS",
    title: "Inspeção de Revestimento e Monitoramento de Proteção Catódica",
    description:
      "Diagnóstico completo da integridade de dutos: inspeção de revestimento, levantamento de potenciais e relatórios técnicos para conformidade normativa.",
    cta: "Solicitar Inspeção",
    image:
      "/images/slides/11.5.png",
  },
];

const SLIDE_GAP = 0; // sem gap entre slides — evita faixa preta visível
const AUTO_INTERVAL = 7000;
const TRANSITION_MS = 600; // duração da transição entre slides

/* ────────────────────────────────────────────────────────
   SECTION 6 — HORIZONTAL SLIDER MODULE

   Builder.io JSON structure:
   - Container div: display flex, position relative
   - width: total of all slides (13662px), transform: translateX
   - Each slide: float left, width ~1239px, marginLeft 3px
     - Inner: minHeight 900px, inline-block, relative, 100% width
       - bg: black, overflow hidden, pt 200 pb 80, relative
         - bg-image: absolute, cover, center
         - container: maxW 1440, mx auto, px 30
           - content: pb 40, relative
             - text-col: flex column, maxW 570, justify center, z-2
               - label: yellow #FF6A00, 14px bold uppercase, ls 0.7px
               - h2: Knockout 70px, w500, lh 59.5px, uppercase, white
               - desc: 20px, lh 30px, white, mb 24
               - CTA: split button (text | arrow), bg #FF6A00
             - Prev/Next nav: flex, items center, 15px
   ──────────────────────────────────────────────────────── */
// Renderizamos um clone do primeiro slide DEPOIS do último para que a
// animação de "voltar pro início" seja contínua (evita aquele frame
// preto à direita quando o último slide termina). Após a transição
// alcançar o clone, snap-resetamos para o slide 0 real sem animação.
const TOTAL = slides.length;
const RENDERED = [...slides, slides[0]]; // [s0, s1, ..., sN, s0clone]

export function SliderModule() {
  // current pode ser 0..TOTAL-1 (slides reais) ou TOTAL (clone do 0).
  const [current, setCurrent] = useState(0);
  const [transitionEnabled, setTransitionEnabled] = useState(true);
  const [progress, setProgress] = useState(0);
  const [slideWidth, setSlideWidth] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  // Index "lógico" do slide visível (0..TOTAL-1) — usado para progress
  // bar, dots, e estado de animação. O clone TOTAL aponta visualmente
  // para o slide 0.
  const visibleIndex = current >= TOTAL ? 0 : current;

  // Calculate slide width (responsive)
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        const containerW = containerRef.current.offsetWidth;
        // Slide ocupa 100% do container — sem peek do próximo, evitando
        // faixa preta no último slide (não há "próximo" pra peekar).
        const sw = Math.min(containerW, 1440);
        setSlideWidth(sw);
      }
    };
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  // Snap-reset: quando alcançamos o clone, espera a transição
  // terminar, desliga animação e volta pro slide 0 real (mesma posição
  // visual). Reativa animação no próximo frame.
  useEffect(() => {
    if (current !== TOTAL) return;
    const id = window.setTimeout(() => {
      setTransitionEnabled(false);
      setCurrent(0);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setTransitionEnabled(true));
      });
    }, TRANSITION_MS + 30);
    return () => window.clearTimeout(id);
  }, [current]);

  const next = useCallback(() => {
    setTransitionEnabled(true);
    setProgress(0);
    setCurrent((c) => (c >= TOTAL ? 1 : c + 1));
  }, []);

  const prev = useCallback(() => {
    setProgress(0);
    if (visibleIndex === 0) {
      // Para animar pra trás continuamente, posicionamos no clone
      // (mesmo visual do slide 0) sem transição, depois animamos
      // pro último slide real.
      setTransitionEnabled(false);
      setCurrent(TOTAL);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTransitionEnabled(true);
          setCurrent(TOTAL - 1);
        });
      });
    } else {
      setTransitionEnabled(true);
      setCurrent((c) => c - 1);
    }
  }, [visibleIndex]);

  const goTo = useCallback((index: number) => {
    setTransitionEnabled(true);
    setProgress(0);
    setCurrent(((index % TOTAL) + TOTAL) % TOTAL);
  }, []);

  // Auto-play with progress bar
  useEffect(() => {
    if (isDragging) return;
    const timer = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          next();
          return 0;
        }
        return p + 100 / (AUTO_INTERVAL / 50);
      });
    }, 50);
    return () => clearInterval(timer);
  }, [next, isDragging]);

  // Drag handlers
  const handleDragStart = (clientX: number) => {
    setIsDragging(true);
    setDragStart(clientX);
    setDragOffset(0);
  };
  const handleDragMove = (clientX: number) => {
    if (!isDragging) return;
    setDragOffset(clientX - dragStart);
  };
  const handleDragEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (Math.abs(dragOffset) > slideWidth * 0.15) {
      if (dragOffset < 0) next();
      else prev();
    }
    setDragOffset(0);
  };

  const translateX = -(current * (slideWidth + SLIDE_GAP)) + dragOffset;

  return (
    <>
      <style>{`
        .sec6-cta-btn {
          text-decoration: none;
          cursor: pointer;
          position: relative;
          padding-right: 34px;
          min-height: 33px;
          display: inline-flex;
          align-items: stretch;
        }
        .sec6-cta-btn:hover .sec6-cta-text {
          background-color: #000;
          color: #FF6A00;
          border-color: #000;
        }
        .sec6-cta-btn:hover .sec6-cta-arrow {
          background-color: #000;
          border-color: #000;
        }
        .sec6-cta-btn:hover .sec6-cta-arrow svg {
          color: #FF6A00;
        }
        .sec6-nav-link {
          cursor: pointer;
          color: rgba(255,255,255,0.7);
          transition: color 0.25s;
          text-decoration: none;
          background: none;
          border: none;
          font-size: 15px;
          line-height: 15px;
          font-family: Arial, sans-serif;
        }
        .sec6-nav-link:hover {
          color: #fff;
        }
        .sec6-slide-track {
          cursor: grab;
        }
        .sec6-slide-track.dragging {
          cursor: grabbing;
        }
        @media (max-width: 768px) {
          .sec6-slide-title {
            font-size: 40px !important;
            line-height: 36px !important;
          }
          .sec6-slide-desc {
            font-size: 16px !important;
            line-height: 24px !important;
          }
        }
      `}</style>

      <section
        ref={containerRef}
        style={{
          position: "relative",
          overflow: "hidden",
          fontFamily: BODY_FONT,
          fontSize: 16,
          fontWeight: 400,
          lineHeight: "28.8px",
          backgroundColor: "#000",
        }}
      >
        {/* ── SLIDER TRACK ── */}
        <div
          ref={trackRef}
          className={`sec6-slide-track${isDragging ? " dragging" : ""}`}
          style={{
            display: "flex",
            position: "relative",
            transform: `translateX(${translateX}px)`,
            transition:
              isDragging || !transitionEnabled
                ? "none"
                : `transform ${TRANSITION_MS}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`,
            userSelect: "none",
          }}
          onMouseDown={(e) => handleDragStart(e.clientX)}
          onMouseMove={(e) => handleDragMove(e.clientX)}
          onMouseUp={handleDragEnd}
          onMouseLeave={handleDragEnd}
          onTouchStart={(e) => handleDragStart(e.touches[0].clientX)}
          onTouchMove={(e) => handleDragMove(e.touches[0].clientX)}
          onTouchEnd={handleDragEnd}
        >
          {RENDERED.map((slide, i) => {
            // === LAZY LOAD AGRESSIVO ===
            // Só renderiza a imagem se o slide está visível ou adjacente
            // (precisa do próximo carregado para transição suave de 600ms)
            const isVisible = Math.abs(i - current) <= 1 ||
                              (current === 0 && i === TOTAL) || // clone do final voltando
                              (current === TOTAL && i === 0);
            return (
            <div
              key={i}
              style={{
                flex: "0 0 auto",
                width: slideWidth || "100vw",
                marginLeft: i === 0 ? 0 : SLIDE_GAP,
                minHeight: 1,
                userSelect: "none",
              }}
            >
              {/* ── SLIDE INNER ── */}
              <div
                style={{
                  display: "inline-block",
                  height: "100%",
                  minHeight: 900,
                  position: "relative",
                  width: "100%",
                  color: "#fff",
                }}
              >
                {/* ── BLACK BG + IMAGE ── */}
                <div
                  style={{
                    backgroundColor: "#000",
                    height: "100%",
                    overflow: "hidden",
                    paddingBottom: 80,
                    paddingTop: 200,
                    position: "relative",
                  }}
                >
                  {/* Background image — só carrega se visível/adjacente (lazy load) */}
                  {isVisible && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        opacity: 0.5,
                      }}
                    >
                      <picture>
                        <source
                          type="image/avif"
                          srcSet={`${optimizedBg(slide.image, 480, "avif")} 480w, ${optimizedBg(slide.image, 1024, "avif")} 1024w, ${optimizedBg(slide.image, 1920, "avif")} 1920w`}
                          sizes="100vw"
                        />
                        <source
                          type="image/webp"
                          srcSet={`${optimizedBg(slide.image, 480, "webp")} 480w, ${optimizedBg(slide.image, 1024, "webp")} 1024w, ${optimizedBg(slide.image, 1920, "webp")} 1920w`}
                          sizes="100vw"
                        />
                        <img
                          src={optimizedBg(slide.image, 1024, "webp")}
                          alt=""
                          loading={i === 0 ? "eager" : "lazy"}
                          decoding={i === 0 ? "sync" : "async"}
                          // @ts-expect-error fetchpriority é válido
                          fetchpriority={i === 0 ? "high" : undefined}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            objectPosition: "50% 50%",
                            display: "block",
                          }}
                        />
                      </picture>
                    </div>
                  )}

                  {/* ── CONTAINER ── */}
                  <div
                    style={{
                      height: "100%",
                      marginLeft: "auto",
                      marginRight: "auto",
                      maxWidth: 1440,
                      paddingLeft: 30,
                      paddingRight: 30,
                      width: "100%",
                    }}
                  >
                    {/* ── CONTENT WRAPPER ── */}
                    <div
                      style={{
                        height: "100%",
                        paddingBottom: 40,
                        position: "relative",
                      }}
                    >
                      {/* ── TEXT COLUMN ── */}
                      <div
                        style={{
                          alignItems: "flex-start",
                          display: "flex",
                          flexDirection: "column",
                          height: "100%",
                          justifyContent: "center",
                          maxWidth: 570,
                          position: "relative",
                          width: "100%",
                          zIndex: 2,
                        }}
                      >
                        {/* Label */}
                        <span
                          style={{
                            color: "rgb(255, 106, 0)",
                            fontSize: 14,
                            fontWeight: 700,
                            letterSpacing: "0.7px",
                            lineHeight: "21px",
                            marginBottom: 20,
                            textTransform: "uppercase",
                          }}
                        >
                          {slide.label}
                        </span>

                        {/* Title */}
                        <h2
                          className="sec6-slide-title"
                          style={{
                            color: "#fff",
                            fontFamily: "'Knockout HTF68', sans-serif",
                            fontSize: 44,
                            fontWeight: 500,
                            lineHeight: "59.5px",
                            marginBottom: 24,
                            textTransform: "uppercase",
                          }}
                        >
                          {slide.title}
                        </h2>

                        {/* Description */}
                        <div style={{ fontSize: 20, lineHeight: "30px" }}>
                          <p
                            className="sec6-slide-desc"
                            style={{
                              color: "#fff",
                              fontSize: 20,
                              lineHeight: "30px",
                              marginBottom: 24,
                            }}
                          >
                            {slide.description}
                          </p>
                        </div>

                        {/* CTA Button — split design: [text] [arrow] */}
                        <a href="#" className="sec6-cta-btn">
                          <span
                            className="sec6-cta-text"
                            style={{
                              backgroundColor: "rgb(255, 106, 0)",
                              border: "1px solid rgb(255, 106, 0)",
                              display: "inline-flex",
                              alignItems: "center",
                              fontSize: 15,
                              lineHeight: "15px",
                              paddingBottom: 8,
                              paddingLeft: 9,
                              paddingRight: 9,
                              paddingTop: 8,
                              textAlign: "center",
                              color: "#000",
                              transition: "all 0.4s",
                              fontWeight: 500,
                            }}
                          >
                            {slide.cta}
                          </span>
                          <span
                            className="sec6-cta-arrow"
                            style={{
                              alignItems: "center",
                              backgroundColor: "rgb(255, 106, 0)",
                              border: "1px solid rgb(255, 106, 0)",
                              display: "flex",
                              justifyContent: "center",
                              width: 33,
                              transition: "all 0.4s",
                            }}
                          >
                            <ArrowRight size={16} color="#000" />
                          </span>
                        </a>

                        {/* Prev / Next Nav */}
                        <div
                          style={{
                            alignItems: "center",
                            display: "flex",
                            fontSize: 15,
                            lineHeight: "15px",
                            marginTop: 60,
                            // Nav só visível no slide ativo. Para o clone (i===TOTAL),
                            // mostramos quando visibleIndex===0 (mesmo slide visualmente).
                            opacity:
                              i === current ||
                              (i === TOTAL && visibleIndex === 0 && current === TOTAL)
                                ? 1
                                : 0,
                            transition: "opacity 0.4s",
                          }}
                        >
                          <button
                            className="sec6-nav-link"
                            onClick={(e) => {
                              e.stopPropagation();
                              prev();
                            }}
                            style={{ marginRight: 12 }}
                          >
                            Prev
                          </button>

                          {/* Progress bar */}
                          <span
                            style={{
                              height: 3,
                              position: "relative",
                              width: 150,
                              backgroundColor: "rgba(255,255,255,0.2)",
                              display: "block",
                              overflow: "hidden",
                            }}
                          >
                            <span
                              style={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                height: "100%",
                                width:
                                  i === current ||
                                  (i === TOTAL && current === TOTAL)
                                    ? `${progress}%`
                                    : "0%",
                                backgroundColor: "rgb(255, 106, 0)",
                                transition:
                                  progress === 0
                                    ? "none"
                                    : "width 50ms linear",
                              }}
                            />
                          </span>

                          <button
                            className="sec6-nav-link"
                            onClick={(e) => {
                              e.stopPropagation();
                              next();
                            }}
                            style={{ marginLeft: 12 }}
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
          })}
        </div>
      </section>
    </>
  );
}