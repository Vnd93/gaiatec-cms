import { Link } from "react-router";
import { AnimateOnScroll } from "../components/useScrollAnimation";
import { ChevronRight, MapPin, Recycle, Flame, Leaf } from "lucide-react";

/* ────────────────────────────────────────────────────────
   IMAGES
   ──────────────────────────────────────────────────────── */
const HERO_IMG = "/images/heroes/1.1.png";
const INTRO_IMG = "/images/heroes/1.2.png";

/* ────────────────────────────────────────────────────────
   DATA
   ──────────────────────────────────────────────────────── */
const benefitCards = [
  { icon: Recycle, title: "Reducao de Residuos", desc: "Reducao do volume de residuos organicos descartados no ambiente escolar, transformando lixo em recurso util." },
  { icon: Flame, title: "Producao de Biogas", desc: "Producao de biogas para uso demonstrativo e educativo em atividades praticas com alunos e professores." },
  { icon: Leaf, title: "Biofertilizante", desc: "Geracao de biofertilizante para hortas escolares e projetos pedagogicos de sustentabilidade." },
];

const projects = [
  { city: "Craibas", state: "Alagoas", desc: "Instalacao de biodigestor em escola municipal, com uso educativo e reaproveitamento de residuos organicos gerados no ambiente escolar." },
  { city: "Girau do Ponciano", state: "Alagoas", desc: "Implantacao de biodigestor como ferramenta pedagogica, integrando praticas ambientais ao curriculo da escola." },
  { city: "Limoeiro de Anadia", state: "Alagoas", desc: "Projeto voltado a demonstracao pratica de energia renovavel e tratamento de residuos organicos em ambiente educacional." },
  { city: "Palmeira dos Indios", state: "Alagoas", desc: "Biodigestor instalado para fins educacionais e ambientais, com producao de biogas e biofertilizante para horta escolar." },
];

/* ────────────────────────────────────────────────────────
   HEADING HELPER
   ──────────────────────────────────────────────────────── */
const heading = (overline: string, title: string, light = false, subtitle?: string) => (
  <div className="text-center" style={{ marginBottom: 48 }}>
    <span style={{ display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#0057DE", marginBottom: 12 }}>
      {overline}
    </span>
    <h2 style={{ fontFamily: "'Knockout HTF68', sans-serif", fontSize: "clamp(28px, 3vw, 36px)", fontWeight: 400, lineHeight: 1.15, textTransform: "uppercase", color: light ? "#fff" : "#1a1a1a", marginBottom: subtitle ? 14 : 0 }}>
      {title}
    </h2>
    {subtitle && (
      <p style={{ fontSize: 15, color: light ? "#999" : "#777", lineHeight: 1.65, maxWidth: 680, margin: "0 auto" }}>
        {subtitle}
      </p>
    )}
  </div>
);

/* ────────────────────────────────────────────────────────
   COMPONENT
   ──────────────────────────────────────────────────────── */
export default function BiodigestorEscolas() {
  return (
    <>
      {/* ═══════════════════════════════════════════
          1) HERO
         ═══════════════════════════════════════════ */}
      <section className="relative w-full overflow-hidden" style={{ height: 772 }}>
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${HERO_IMG})`, transform: "scale(1.05)", transition: "transform 8s ease-out" }}
        />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to right, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.2) 50%, transparent 100%)" }} />
        <div
          className="relative z-10 flex flex-col justify-end h-full"
          style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px 100px 30px" }}
        >
          <span style={{ display: "inline-block", fontSize: 13, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#0057DE", marginBottom: 16 }}>
            PROJETOS EDUCACIONAIS
          </span>
          <h1 style={{ fontFamily: "'Knockout HTF68', sans-serif", fontSize: "clamp(41px, 6vw, 85px)", fontWeight: 500, lineHeight: 0.95, textTransform: "uppercase", color: "#fff", maxWidth: 800, margin: 0 }}>
            Projetos Realizados em Escolas
          </h1>
        </div>
      </section>

      {/* ── Vertical line connector ── */}
      <div style={{ position: "relative" }}>
        <div style={{ position: "relative", height: 60, backgroundColor: "transparent", marginTop: -60, zIndex: 20 }}>
          <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px", position: "relative", height: "100%" }}>
            <div style={{ position: "absolute", left: 30, top: 0, width: 1, height: "100%", backgroundColor: "#fff" }} />
          </div>
        </div>
        <div style={{ position: "relative", height: 60, backgroundColor: "#fff" }}>
          <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px", position: "relative", height: "100%" }}>
            <div style={{ position: "absolute", left: 30, top: 0, width: 1, height: "100%", backgroundColor: "#000" }} />
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════
          2) WHY SCHOOLS — two columns
         ═══════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#fff", padding: "80px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
              <div>
                <span style={{ display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#0057DE", marginBottom: 16 }}>
                  Educacao Ambiental
                </span>
                <h2 style={{ fontFamily: "'Knockout HTF68', sans-serif", fontSize: "clamp(28px, 3vw, 36px)", fontWeight: 400, lineHeight: 1.15, textTransform: "uppercase", marginBottom: 24, color: "#1a1a1a" }}>
                  Por que Levar Biodigestores para Escolas
                </h2>
                <p style={{ fontSize: 16, lineHeight: 1.75, color: "#555", marginBottom: 20 }}>
                  A implantacao de biodigestores em escolas vai alem do tratamento de residuos. Ela transforma o ambiente escolar em um espaco de aprendizado pratico, onde alunos, professores e comunidade tem contato direto com conceitos reais de sustentabilidade, energia renovavel e responsabilidade ambiental.
                </p>
                <p style={{ fontSize: 16, lineHeight: 1.75, color: "#555" }}>
                  O biodigestor permite que residuos organicos gerados no proprio ambiente escolar sejam reaproveitados, demonstrando na pratica como o lixo pode deixar de ser um problema e passar a ser um recurso.
                </p>
              </div>
              <div className="relative overflow-hidden" style={{ borderRadius: 4 }}>
                <img loading="lazy" src={INTRO_IMG} alt="Biodigestor em escola" className="w-full h-full object-cover" style={{ aspectRatio: "16/11", display: "block" }} />
                <div className="absolute bottom-0 left-0" style={{ width: 80, height: 4, backgroundColor: "#0057DE" }} />
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          3) BENEFITS — dark bg, 3 cards
         ═══════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#1a1a1a", padding: "80px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            {heading("IMPACTO", "Beneficios para a Comunidade Escolar", true)}
          </AnimateOnScroll>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {benefitCards.map((card, i) => {
              const Icon = card.icon;
              return (
                <AnimateOnScroll key={card.title} delay={i * 0.12}>
                  <div
                    style={{
                      backgroundColor: "#222",
                      borderRadius: 4,
                      overflow: "hidden",
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      transition: "transform 0.3s ease, box-shadow 0.3s ease",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.3)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
                  >
                    <div style={{ height: 4, backgroundColor: "#0057DE" }} />
                    <div style={{ padding: "28px 24px", flex: 1 }}>
                      <Icon size={28} style={{ color: "#0057DE", marginBottom: 16 }} />
                      <h4 style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 10, textTransform: "uppercase" }}>
                        {card.title}
                      </h4>
                      <p style={{ fontSize: 14, lineHeight: 1.7, color: "#aaa" }}>
                        {card.desc}
                      </p>
                    </div>
                  </div>
                </AnimateOnScroll>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          4) PROJECTS — 2x2 grid
         ═══════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#fff", padding: "80px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            {heading("REALIZACOES", "Projetos Realizados em Alagoas")}
          </AnimateOnScroll>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {projects.map((p, i) => (
              <AnimateOnScroll key={p.city} delay={i * 0.1}>
                <div
                  className="flex overflow-hidden"
                  style={{
                    backgroundColor: "#fff",
                    border: "1px solid #e5e5e5",
                    boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
                    borderRadius: 4,
                    height: "100%",
                    transition: "box-shadow 0.3s ease, transform 0.3s ease",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 8px 28px rgba(0,0,0,0.1)"; e.currentTarget.style.transform = "translateY(-4px)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.06)"; e.currentTarget.style.transform = "translateY(0)"; }}
                >
                  {/* Yellow left accent */}
                  <div style={{ width: 4, backgroundColor: "#0057DE", flexShrink: 0 }} />

                  <div style={{ padding: "24px 24px", flex: 1 }}>
                    <div className="flex items-center gap-3" style={{ marginBottom: 12 }}>
                      <MapPin size={18} style={{ color: "#1a7f4c", flexShrink: 0 }} />
                      <h4 style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a" }}>
                        {p.city}{" "}
                        <span style={{ fontWeight: 400, color: "#999", fontSize: 14 }}>— {p.state}</span>
                      </h4>
                    </div>
                    <p style={{ fontSize: 14, lineHeight: 1.7, color: "#666" }}>
                      {p.desc}
                    </p>
                  </div>
                </div>
              </AnimateOnScroll>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          5) QUOTE — centered italic
         ═══════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#f8f8f8", padding: "80px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div className="text-center" style={{ maxWidth: 800, margin: "0 auto", position: "relative", padding: "20px 0" }}>
              {/* Decorative opening quote */}
              <span
                style={{
                  position: "absolute",
                  top: -20,
                  left: "50%",
                  transform: "translateX(-50%)",
                  fontFamily: "Georgia, serif",
                  fontSize: 120,
                  color: "#0057DE",
                  lineHeight: 1,
                  opacity: 0.3,
                  pointerEvents: "none",
                  userSelect: "none",
                }}
              >
                &ldquo;
              </span>

              <p
                style={{
                  fontSize: "clamp(18px, 2.5vw, 24px)",
                  lineHeight: 1.65,
                  color: "#444",
                  fontStyle: "italic",
                  fontWeight: 500,
                  position: "relative",
                  zIndex: 1,
                }}
              >
                Levar biodigestores para escolas e investir em educacao ambiental pratica, formacao cidada e solucoes sustentaveis que funcionam na realidade.
              </p>

              {/* Yellow accent bar */}
              <div style={{ width: 60, height: 3, backgroundColor: "#0057DE", margin: "28px auto 0" }} />
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          6) CTA BANNER
         ═══════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#111", padding: "80px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div className="flex flex-col lg:flex-row items-center justify-between gap-8 text-center lg:text-left">
              <div style={{ maxWidth: 640 }}>
                <h2 style={{ fontFamily: "'Knockout HTF68', sans-serif", fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 400, lineHeight: 1.2, textTransform: "uppercase", color: "#fff", marginBottom: 8 }}>
                  Educacao ambiental que transforma comunidades
                </h2>
                <p style={{ fontSize: 15, color: "#888", lineHeight: 1.6 }}>
                  A Gaiatec Sistemas realizou a implantacao de biodigestores em instituicoes de ensino, atendendo diferentes realidades e comunidades.
                </p>
              </div>

              <div className="flex flex-wrap gap-4 justify-center lg:justify-end" style={{ flexShrink: 0 }}>
                <Link
                  to="/contato"
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, backgroundColor: "#0057DE", color: "#000", padding: "14px 32px", fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.5px", textDecoration: "none", borderRadius: 4, transition: "all 0.3s ease" }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#e5b800"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#0057DE"; }}
                >
                  Fale com um Especialista <ChevronRight size={14} />
                </Link>
                <Link
                  to="/contato"
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, backgroundColor: "transparent", color: "#fff", padding: "14px 32px", fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.5px", textDecoration: "none", borderRadius: 4, border: "2px solid #444", transition: "all 0.3s ease" }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#0057DE"; e.currentTarget.style.color = "#0057DE"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#444"; e.currentTarget.style.color = "#fff"; }}
                >
                  Solicitar Proposta <ChevronRight size={14} />
                </Link>
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>
    </>
  );
}
