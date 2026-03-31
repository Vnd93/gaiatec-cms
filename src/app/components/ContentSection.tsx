import { useEffect, useRef, useCallback } from "react";

/* ────────────────────────────────────────────────────────
   FONT CONSTANTS  (Knockout HTF68 → Barlow Condensed fallback)
   ──────────────────────────────────────────────────────── */
const KNOCKOUT = "'Knockout HTF68', sans-serif";
const BODY_FONT = "Arial, sans-serif";
const STICKY_TOP = 100;

/* ────────────────────────────────────────────────────────
   DATA — right column service blocks
   ──────────────────────────────────────────────────────── */
const services = [
  {
    title: "Instrumentação Industrial",
    href: "#",
    desc: (
      <>
        Medição, controle e monitoramento de variáveis de processo: vazão, pressão, nível, temperatura e qualidade. Soluções completas desde a especificação até a instalação.
      </>
    ),
    cta: "Ver Serviço →",
    ctaHref: "#",
  },
  {
    title: "Automação Industrial",
    href: "#",
    desc: (
      <>
        Projetos de automação com CLPs, IHMs, sistemas supervisórios SCADA e integração IoT para processos industriais de alta complexidade.
      </>
    ),
    cta: "Ver Serviço →",
    ctaHref: "#",
  },
  {
    title: "Proteção Catódica",
    href: "#",
    desc: (
      <>
        Projeto, instalação e monitoramento de sistemas de proteção catódica para dutos, tanques e estruturas enterradas, garantindo integridade ao longo do tempo.
      </>
    ),
    cta: "Ver Serviço →",
    ctaHref: "#",
  },
  {
    title: "Calibração RBC Acreditada",
    href: "#",
    desc: (
      <>
        Calibração de instrumentos com rastreabilidade metrológica reconhecida internacionalmente, conforme normas ABNT e ISO. Laboratório acreditado pela RBC e homologado pelo INMETRO.
      </>
    ),
    cta: "Ver Serviço →",
    ctaHref: "#",
  },
];

/* ────────────────────────────────────────────────────────
   TITLE LETTERS  — "Leading Energy Solutions Provider"
   Each letter is an inline <span> with transition.
   Empty separator spans between words (matching Builder.io).
   ──────────────────────────────────────────────────────── */
const TITLE_LINES = [["Tecnologia"], ["Precisão"], ["Confiança"], ["Resultado"]];
const TITLE_WORDS = TITLE_LINES.flat();
const TOTAL_CHARS = TITLE_WORDS.reduce((a, w) => a + w.length, 0);

/* ────────────────────────────────────────────────────────
   COMPONENT
   
   DOM hierarchy (matches Builder.io JSON exactly):
   
   <section padding 120/120>
     <div.container maxW-1440 px-30>        ← ref=trackRef (animation track)
       <div>                                ← wrapper
         <div.row flex row-wrap mL-24>      ← negative-margin gutter
           <div.col-left 50% pL-24 flex>    ← column
             <div>                          ← inner
               <div.sticky top-100>         ← STICKY
                 <span>We Are a</span>
                 <h2>L e a d i n g ...</h2>
               </div>
             </div>
           </div>
           <div.col-right 50% pL-24 flex>   ← column
             <div>                          ← inner
               <div>                        ← content
                 <p>intro</p>
                 <h3><a>title</a></h3>
                 <p>desc <strong><a>cta</a></strong></p>
                 ...
               </div>
             </div>
           </div>
         </div>
       </div>
     </div>
   </section>
   ──────────────────────────────────────────────────────── */
export function ContentSection() {
  const trackRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const lettersRef = useRef<(HTMLSpanElement | null)[]>([]);

  /* ── Scroll-driven letter color fill ── */
  const updateLetters = useCallback(() => {
    const track = trackRef.current;
    const sticky = stickyRef.current;
    if (!track || !sticky) return;

    const trackRect = track.getBoundingClientRect();
    const trackHeight = trackRect.height;
    const stickyHeight = sticky.offsetHeight;
    const travelDistance = trackHeight - stickyHeight;
    if (travelDistance <= 0) return;

    const scrolled = STICKY_TOP - trackRect.top;
    const progress = Math.max(0, Math.min(1, scrolled / travelDistance));
    const filledCount = Math.floor(progress * TOTAL_CHARS);

    for (let i = 0; i < lettersRef.current.length; i++) {
      const el = lettersRef.current[i];
      if (!el) continue;
      const target = i < filledCount ? "#000000" : "#FF6A00";
      if (el.style.color !== target) el.style.color = target;
    }
  }, []);

  /* ── Fade-in-up on enter + scroll listener ── */
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          const t = trackRef.current;
          if (t) {
            t.style.opacity = "1";
            t.style.transform = "translateY(0)";
          }
          obs.unobserve(e.target);
        }
      },
      { threshold: 0.08 }
    );
    obs.observe(section);

    window.addEventListener("scroll", updateLetters, { passive: true });
    window.addEventListener("resize", updateLetters, { passive: true });
    updateLetters();

    return () => {
      obs.disconnect();
      window.removeEventListener("scroll", updateLetters);
      window.removeEventListener("resize", updateLetters);
    };
  }, [updateLetters]);

  /* ── Build letter JSX (inline spans, not block per word) ── */
  let charIdx = 0;
  const titleLetters: React.ReactNode[] = [];

  TITLE_LINES.forEach((line, lineIdx) => {
    // line break between lines
    if (lineIdx > 0) {
      titleLetters.push(<br key={`br-${lineIdx}`} />);
    }
    line.forEach((word, wIdx) => {
      // space separator between words on the same line
      if (wIdx > 0) {
        titleLetters.push(
          <span
            key={`sep-${lineIdx}-${wIdx}`}
            style={{
              display: "inline",
              fontFamily: "'Knockout HTF68', sans-serif",
              fontSize: 120,
              fontWeight: 700,
              lineHeight: "140px",
              textTransform: "uppercase",
            }}
          >
            {"\u00A0"}
          </span>
        );
      }
      word.split("").forEach((char) => {
        const idx = charIdx;
        charIdx++;
        titleLetters.push(
          <span
            key={`c-${idx}`}
            ref={(el) => { lettersRef.current[idx] = el; }}
            style={{
              display: "inline",
              fontFamily: "'Knockout HTF68', sans-serif",
              fontSize: 120,
              fontWeight: 700,
              lineHeight: "80px",
              textTransform: "uppercase",
              transitionDuration: "0.2s",
              color: "#FF6A00",
            }}
          >
            {char}
          </span>
        );
      });
    });
  });

  /* ── Inline link style (h3 > a) ── */
  const h3LinkStyle: React.CSSProperties = {
    cursor: "pointer",
    display: "inline-block",
    fontFamily: KNOCKOUT,
    fontSize: 60,
    fontWeight: 500,
    lineHeight: "90px",
    position: "relative",
    textTransform: "uppercase",
    textUnderlineOffset: "3px",
    transitionDuration: "0.25s",
    textDecoration: "none",
    color: "#000000",
  };

  /* ── CTA link style (strong > a) ── */
  const ctaLinkStyle: React.CSSProperties = {
    cursor: "pointer",
    display: "inline-block",
    fontWeight: 700,
    lineHeight: "24px",
    position: "relative",
    textUnderlineOffset: "3px",
    transitionDuration: "0.25s",
    textDecoration: "none",
    color: "#000000",
  };

  return (
    <>
      {/* Scoped CSS for hover underline animation */}
      <style>{`
        .sec2-link {
          position: relative;
          display: inline-block;
          text-decoration: none;
        }
        .sec2-link::after {
          content: "";
          position: absolute;
          bottom: 0;
          left: 0;
          height: 1px;
          width: 0%;
          background: #000;
          transition: width 0.25s linear;
        }
        .sec2-link:hover::after {
          width: 100%;
        }
        @media (max-width: 1023px) {
          .sec2-row {
            flex-direction: column !important;
            margin-left: 0 !important;
          }
          .sec2-col-left,
          .sec2-col-right {
            width: 100% !important;
            padding-left: 0 !important;
          }
          .sec2-sticky-inner {
            position: relative !important;
            top: auto !important;
          }
          .sec2-h2-title {
            font-size: 60px !important;
            line-height: 52px !important;
          }
          .sec2-h2-title span {
            font-size: inherit !important;
            line-height: inherit !important;
          }
        }
      `}</style>

      {/* ─── SECTION ─── */}
      <section
        ref={sectionRef}
        id="about"
        style={{
          paddingTop: 120,
          paddingBottom: 120,
          fontFamily: BODY_FONT,
          fontSize: 16,
          fontWeight: 400,
          fontStyle: "normal",
          lineHeight: "28.8px",
          letterSpacing: "normal",
          backgroundColor: "#FFFFFF",
        }}
      >
        {/* ─── CONTAINER ─── */}
        <div
          ref={trackRef}
          style={{
            marginLeft: "auto",
            marginRight: "auto",
            maxWidth: 1440,
            paddingLeft: 30,
            paddingRight: 30,
            width: "100%",
            fontFamily: BODY_FONT,
            fontSize: 16,
            fontStyle: "normal",
            fontWeight: 400,
            /* fade-in-up */
            opacity: 0,
            transform: "translateY(25px)",
            transition: "opacity 1.25s ease, transform 1.25s ease",
          }}
        >
          {/* wrapper div */}
          <div>
            {/* ─── ROW (negative-margin gutter) ─── */}
            <div
              className="sec2-row"
              style={{
                display: "flex",
                flexFlow: "row wrap",
                flexWrap: "wrap",
                fontSize: 0,
                lineHeight: 0,
                marginLeft: -24,
              }}
            >
              {/* ═══════════════════════════════════════
                  LEFT COLUMN
                 ═══════════════════════════════════════ */}
              <div
                className="sec2-col-left"
                style={{
                  display: "flex",
                  marginBottom: 24,
                  paddingLeft: 24,
                  verticalAlign: "top",
                  width: "50%",
                  overflow: "clip",
                }}
              >
                {/* inner wrapper */}
                <div>
                  {/* STICKY ELEMENT */}
                  <div
                    ref={stickyRef}
                    className="sec2-sticky-inner"
                    style={{
                      position: "sticky",
                      top: STICKY_TOP,
                    }}
                  >
                    {/* Label: "We Are a" */}
                    <span
                      style={{
                        display: "block",
                        fontFamily: KNOCKOUT,
                        fontSize: 28,
                        letterSpacing: "0.7px",
                        lineHeight: "45px",
                        marginBottom: 24,
                        textTransform: "uppercase",
                        color: "#000000",
                      }}
                    >
                      Somos uma
                    </span>

                    {/* H2 — per-letter scroll color animation */}
                    <h2
                      className="sec2-h2-title"
                      style={{
                        borderColor: "rgb(255, 106, 0)",
                        color: "rgb(255, 106, 0)",
                        fontFamily: KNOCKOUT,
                        fontSize: 160,
                        fontWeight: 500,
                        lineHeight: "140px",
                        marginBottom: 24,
                        textTransform: "uppercase",
                      }}
                    >
                      {titleLetters}
                    </h2>
                  </div>
                </div>
              </div>

              {/* ═══════════════════════════════════════
                  RIGHT COLUMN
                 ═══════════════════════════════════════ */}
              <div
                className="sec2-col-right"
                style={{
                  display: "flex",
                  marginBottom: 24,
                  paddingLeft: 24,
                  verticalAlign: "top",
                  width: "50%",
                }}
              >
                {/* inner wrapper */}
                <div>
                  {/* content wrapper */}
                  <div>
                    {/* Intro paragraph */}
                    <p
                      style={{
                        fontSize: 20,
                        lineHeight: "32px",
                        marginBottom: 24,
                        color: "#000000",
                      }}
                    >
                      A Gaiatec Sistemas é uma empresa brasileira fundada em 2004 com o objetivo de desenvolver sistemas e tecnologias para atender a indústria do petróleo, mineração, agronegócio, química, elétrica, marítima, saneamento e para tudo que envolve o controle de gases e fluidos. Com uma equipe altamente qualificada, a empresa se destaca pela capacidade de inovar e oferecer soluções completas para as necessidades de seus clientes.
                    </p>

                    {/* Service blocks */}
                    {services.map((item) => (
                      <div key={item.title}>
                        {/* H3 */}
                        <h3
                          style={{
                            fontFamily: KNOCKOUT,
                            fontSize: 60,
                            fontWeight: 500,
                            lineHeight: "51px",
                            marginBottom: 24,
                            marginTop: 60,
                            textTransform: "uppercase",
                          }}
                        >
                          <a
                            href={item.href}
                            className="sec2-link"
                            style={{ ...h3LinkStyle, fontFamily: "'Knockout HTF68', sans-serif", fontWeight: 700, fontSize: 48 }}
                          >
                            {item.title}
                          </a>
                        </h3>

                        {/* Description + CTA inline */}
                        <p
                          style={{
                            marginBottom: 24,
                            fontSize: 16,
                            lineHeight: "28.8px",
                            color: "#000000",
                          }}
                        >
                          {item.desc}{"  "}
                          <strong
                            style={{ display: "inline", fontWeight: 700 }}
                          >
                            <a
                              href={item.ctaHref}
                              className="sec2-link"
                              style={ctaLinkStyle}
                            >
                              {item.cta}
                            </a>
                          </strong>
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}