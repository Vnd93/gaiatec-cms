import { AnimateOnScroll } from "./useScrollAnimation";
import { ScrollTextFill } from "./ScrollTextFill";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { useInnovativeSolutions } from "../hooks/useSiteData";

/* ────────────────────────────────────────────────────────
   FONTS (matching Builder.io JSON)
   ──────────────────────────────────────────────────────── */
const BODY_FONT = "Arial, sans-serif";

/* ────────────────────────────────────────────────────────
   FALLBACK DATA — usado se nenhum bloco "Soluções Inovadoras"
   existir no CMS. Cada item vira um card à direita; imagem é
   sempre hardcoded (não editável pelo painel).
   ──────────────────────────────────────────────────────── */
const FALLBACK_BLOCKS = [
  {
    title: "Nossas Soluções",
    description:
      "Atendemos desde projetos simples de instrumentação até plantas completas de automação, biogás e proteção catódica — com soluções desenvolvidas sob medida para cada cliente.",
  },
  {
    title: "Nossas Capacidades",
    description:
      "RBC Acreditado · INMETRO Homologado · ISO · Equipe técnica com engenheiros e especialistas em campo · +20 anos de experiência · 11 setores industriais atendidos.",
  },
  {
    title: "Serviço e Suporte Técnico",
    description:
      "Oferecemos manutenção preventiva e corretiva, calibração periódica, instalação e comissionamento, consultoria técnica e atendimento de campo em todo o Brasil.",
  },
];

const BLOCK_IMAGES = [
  "/images/solutions/3.1.png",
  "/images/solutions/3.2.png",
  "/images/solutions/3.3.png",
];

/* ────────────────────────────────────────────────────────
   SECTION 5 — INNOVATIVE SOLUTIONS
   
   Builder.io JSON structure:
   <div bg=#f2f2f2 py=120>
     <div container maxW=1440 px=30>
       <div>
         <div row flex wrap mL=-24>
           <div col 60% pL=24 mb=24>         ← LEFT (sticky title)
             <div>
               <div sticky top=100>
                 <span> Providing </span>
                 <h2> I n n o v a t i v e  E n e r g y  S o l u t i o n s </h2>
               </div>
             </div>
           </div>
           <div col 40% pL=24 mb=24>         ← RIGHT (scrolling blocks)
             <div pL=40>
               <div mb=60>
                 <div (image bg) pb=90% cover mb=30 />
                 <h6> Our Solutions </h6>
                 <div mt=10> <p>...</p> </div>
                 <div mt=30> <a> Find out more → </a> </div>
               </div>
               <div mb=60> ... Our Capabilities ... </div>
               <div> ... Service & Support ... </div>
             </div>
           </div>
         </div>
       </div>
     </div>
   </div>
   ──────────────────────────────────────────────────────── */
export function InnovativeSolutions() {
  // Subtitle, título e 3 blocks editáveis em /marketing/site →
  // Página Inicial → "Soluções Inovadoras". Imagem fixa.
  const { subtitle, title, blocks: cmsBlocks } = useInnovativeSolutions({
    subtitle: "Por que a Gaiatec",
    title: "Soluções Técnicas Integradas",
    blocks: FALLBACK_BLOCKS,
  });

  // Anexa imagem hardcoded posicionalmente. Items extras (>3) reusam
  // a última imagem.
  const blocks = cmsBlocks.map((b, i) => ({
    ...b,
    image: BLOCK_IMAGES[i] || BLOCK_IMAGES[BLOCK_IMAGES.length - 1],
    href: "#",
  }));

  return (
    <>
      <style>{`
        .sec5-link {
          cursor: pointer;
          display: inline-block;
          line-height: 24px;
          position: relative;
          text-underline-offset: 3px;
          transition-duration: 0.25s;
          text-decoration: none;
          color: #000;
        }
        .sec5-link::after {
          content: "";
          position: absolute;
          bottom: 0;
          left: 0;
          height: 1px;
          width: 0%;
          background: #000;
          transition: width 0.25s linear;
        }
        .sec5-link:hover::after {
          width: 100%;
        }
        @media (max-width: 991px) {
          .sec5-row {
            flex-direction: column !important;
            margin-left: 0 !important;
          }
          .sec5-col-left,
          .sec5-col-right {
            width: 100% !important;
            padding-left: 0 !important;
          }
          .sec5-col-right-inner {
            padding-left: 0 !important;
          }
          .sec5-sticky {
            position: relative !important;
            top: 0 !important;
            margin-bottom: 40px;
          }
          .sec5-title-h2 {
            font-size: 60px !important;
            line-height: 54px !important;
          }
        }
        @media (max-width: 640px) {
          .sec5-title-h2 {
            font-size: 44px !important;
            line-height: 40px !important;
          }
          .sec5-subtitle {
            font-size: 20px !important;
          }
        }
      `}</style>

      {/* ── SECTION WRAPPER ── */}
      <div
        id="innovative-solutions"
        style={{
          backgroundColor: "rgb(242, 242, 242)",
          paddingBottom: 120,
          paddingTop: 120,
          fontFamily: BODY_FONT,
          fontSize: 16,
          fontWeight: 400,
          fontStyle: "normal",
          lineHeight: "28.8px",
          letterSpacing: "normal",
        }}
      >
        {/* ── CONTAINER ── */}
        <div
          style={{
            marginLeft: "auto",
            marginRight: "auto",
            maxWidth: 1440,
            paddingLeft: 30,
            paddingRight: 30,
            width: "100%",
          }}
        >
          <div>
            {/* ── ROW (negative-margin gutter) ── */}
            <div
              className="sec5-row"
              style={{
                display: "flex",
                flexFlow: "row wrap",
                flexWrap: "wrap",
                fontSize: 0,
                lineHeight: 0,
                marginLeft: -24,
              }}
            >
              {/* ════════════════════════════════════════════
                 LEFT COLUMN — 60% (sticky title)
                 ════════════════════════════════════════════ */}
              <div
                className="sec5-col-left"
                style={{
                  display: "flex",
                  marginBottom: 24,
                  paddingLeft: 24,
                  verticalAlign: "top",
                  width: "60%",
                }}
              >
                <div>
                  <div
                    className="sec5-sticky"
                    style={{
                      position: "sticky",
                      top: 100,
                    }}
                  >
                    {/* Subtitle */}
                    <AnimateOnScroll direction="up">
                      <span
                        className="sec5-subtitle"
                        style={{
                          fontFamily: "'Knockout HTF68', sans-serif",
                          fontSize: 28,
                          letterSpacing: "0.7px",
                          lineHeight: "45px",
                          marginBottom: 24,
                          textTransform: "uppercase",
                          display: "block",
                          color: "#000",
                        }}
                      >
                        {subtitle}
                      </span>
                    </AnimateOnScroll>

                    {/* H2 — scroll-based letter color fill */}
                    <ScrollTextFill
                      text={title}
                      as="h2"
                      className="sec5-title-h2"
                      style={{
                        fontFamily: "'Knockout HTF68', sans-serif",
                        fontSize: 160,
                        fontWeight: 700,
                        lineHeight: "155px",
                        marginBottom: 24,
                        textTransform: "uppercase",
                      }}
                      baseColor="rgb(255, 106, 0)"
                      fillColor="rgb(0, 0, 0)"
                    />
                  </div>
                </div>
              </div>

              {/* ════════════════════════════════════════════
                 RIGHT COLUMN — 40% (scrolling content blocks)
                 ════════════════════════════════════════════ */}
              <div
                className="sec5-col-right"
                style={{
                  display: "flex",
                  marginBottom: 24,
                  paddingLeft: 24,
                  verticalAlign: "top",
                  width: "40%",
                }}
              >
                <div
                  className="sec5-col-right-inner"
                  style={{ paddingLeft: 40 }}
                >
                  {blocks.map((block, i) => (
                    <AnimateOnScroll key={block.title} direction="up" delay={i * 0.1}>
                      <div
                        style={{
                          marginBottom: i < blocks.length - 1 ? 60 : 0,
                        }}
                      >
                        {/* Image (aspect ratio via paddingBottom 90%) */}
                        <div
                          style={{
                            marginBottom: 30,
                            paddingBottom: "90%",
                            width: "100%",
                            position: "relative",
                            overflow: "hidden",
                          }}
                        >
                          <ImageWithFallback
                            src={block.image}
                            alt={block.title}
                            style={{
                              position: "absolute",
                              top: 0,
                              left: 0,
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                              objectPosition: "50% 50%",
                            }}
                          />
                        </div>

                        {/* Title */}
                        <h6
                          style={{
                            fontFamily: "'Knockout HTF68', sans-serif",
                            fontSize: 30,
                            fontWeight: 700,
                            lineHeight: "25.5px",
                            textTransform: "uppercase",
                            color: "#000",
                          }}
                        >
                          {block.title}
                        </h6>

                        {/* Description */}
                        <div style={{ marginTop: 10 }}>
                          <div>
                            <p
                              style={{
                                fontFamily: BODY_FONT,
                                fontSize: 16,
                                lineHeight: "28.8px",
                                color: "#000",
                              }}
                            >
                              {block.description}
                            </p>
                          </div>
                        </div>

                        {/* Link */}
                        <div style={{ marginTop: 30 }}>
                          <a
                            href={block.href}
                            className="sec5-link"
                            style={{
                              fontFamily: BODY_FONT,
                              fontSize: 16,
                              lineHeight: "24px",
                            }}
                          >
                            Saiba mais →
                          </a>
                        </div>
                      </div>
                    </AnimateOnScroll>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}