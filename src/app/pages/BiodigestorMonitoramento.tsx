import { Link } from "react-router";
import { AnimateOnScroll } from "../components/useScrollAnimation";
import { ChevronRight, AlertTriangle, ArrowRight } from "lucide-react";

/* ────────────────────────────────────────────────────────
   IMAGES
   ──────────────────────────────────────────────────────── */
const HERO_IMG = "/images/heroes/1.1.png";
const INTRO_IMG = "/images/heroes/1.2.png";

/* ────────────────────────────────────────────────────────
   DATA
   ──────────────────────────────────────────────────────── */
const challenges = [
  { title: "Instabilidade do processo biologico", desc: "Variacoes na alimentacao e nas condicoes operacionais causam queda na producao e qualidade do biogas." },
  { title: "Qualidade insuficiente do biogas", desc: "Concentracao inadequada de metano compromete o aproveitamento energetico e a viabilidade do projeto." },
  { title: "Seguranca operacional", desc: "Pressao, temperatura e integridade do sistema exigem monitoramento continuo para prevenir riscos." },
  { title: "Aproveitamento economico", desc: "Biogas desperdicado ou de baixa qualidade compromete o retorno financeiro do investimento." },
  { title: "Conformidade ambiental", desc: "Emissoes descontroladas e manejo inadequado de efluentes geram passivos regulatorios significativos." },
  { title: "Perda de controle operacional", desc: "Sem dados de concentracao, a tomada de decisao operacional se torna reativa e ineficiente." },
];

const solutions = [
  { num: "01", title: "Analise do potencial de producao", desc: "Avaliacao tecnica detalhada do tipo de residuo organico utilizado, analise da carga organica disponivel e caracterizacao das condicoes do processo de digestao anaerobica." },
  { num: "02", title: "Monitoramento continuo e sistematico das variaveis criticas", desc: "Acompanhamento em tempo real de pH, temperatura, pressao, composicao do biogas e demais parametros operacionais essenciais." },
  { num: "03", title: "Controle do processo de geracao", desc: "Implementacao de estrategias tecnicas e ajustes operacionais para manter o biodigestor funcionando em condicoes ideais de forma consistente." },
  { num: "04", title: "Tratamento e utilizacao do biogas", desc: "Solucoes tecnicas completas para tornar o biogas adequado para diferentes aplicacoes energeticas — dessulfurizacao, filtragem, compressao e armazenamento seguro." },
];

const workflow = [
  { num: "01", label: "Diagnostico inicial do sistema" },
  { num: "02", label: "Instrumentacao e monitoramento" },
  { num: "03", label: "Analise dos dados operacionais" },
  { num: "04", label: "Otimizacao continua" },
  { num: "05", label: "Acompanhamento tecnico" },
];

/* ────────────────────────────────────────────────────────
   HEADING HELPER
   ──────────────────────────────────────────────────────── */
const heading = (overline: string, title: string, light = false, subtitle?: string) => (
  <div className="text-center" style={{ marginBottom: 48 }}>
    <span style={{ display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: light ? "#FF6A00" : "#FF6A00", marginBottom: 12 }}>
      {overline}
    </span>
    <h2 style={{ fontFamily: "'Knockout HTF68', sans-serif", fontSize: "clamp(28px, 3vw, 36px)", fontWeight: 400, lineHeight: 1.15, textTransform: "uppercase", color: light ? "#fff" : "#1a1a1a", marginBottom: subtitle ? 12 : 0 }}>
      {title}
    </h2>
    {subtitle && (
      <p style={{ fontSize: 15, color: light ? "#888" : "#777", lineHeight: 1.6, maxWidth: 600, margin: "0 auto" }}>
        {subtitle}
      </p>
    )}
  </div>
);

/* ────────────────────────────────────────────────────────
   COMPONENT
   ──────────────────────────────────────────────────────── */
export default function BiodigestorMonitoramento() {
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
          <span style={{ display: "inline-block", fontSize: 13, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#FF6A00", marginBottom: 16 }}>
            MONITORAMENTO
          </span>
          <h1 style={{ fontFamily: "'Knockout HTF68', sans-serif", fontSize: "clamp(41px, 6vw, 85px)", fontWeight: 500, lineHeight: 0.95, textTransform: "uppercase", color: "#fff", maxWidth: 800, margin: 0 }}>
            Monitoramento e Controle de Biogas
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
          2) INTRO — two columns
         ═══════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#fff", padding: "80px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
              <div>
                <span style={{ display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#FF6A00", marginBottom: 16 }}>
                  Tecnologia & Operacao
                </span>
                <h2 style={{ fontFamily: "'Knockout HTF68', sans-serif", fontSize: "clamp(28px, 3vw, 36px)", fontWeight: 400, lineHeight: 1.15, textTransform: "uppercase", marginBottom: 24, color: "#1a1a1a" }}>
                  Controle Inteligente de Processos
                </h2>
                <p style={{ fontSize: 16, lineHeight: 1.75, color: "#555", marginBottom: 20 }}>
                  A geracao de biogas e um processo biologico e energetico que depende diretamente do controle adequado das condicoes operacionais. Variaveis como pH, temperatura, pressao e composicao do gas precisam ser monitoradas continuamente para garantir eficiencia e seguranca.
                </p>
                <p style={{ fontSize: 16, lineHeight: 1.75, color: "#555" }}>
                  A Gaiatec Sistemas atua na analise, controle e monitoramento da geracao de biogas, oferecendo solucoes tecnicas que permitem transformar residuos organicos em energia de forma segura, previsivel e eficiente. Biogas nao e tratado como experimento — e tratado como processo industrial controlado.
                </p>
              </div>
              <div className="relative overflow-hidden" style={{ borderRadius: 4 }}>
                <img src={INTRO_IMG} alt="Monitoramento de Biogas" className="w-full h-full object-cover" style={{ aspectRatio: "16/11", display: "block" }} />
                <div className="absolute bottom-0 left-0" style={{ width: 80, height: 4, backgroundColor: "#FF6A00" }} />
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          3) CHALLENGES — dark bg, 3x2 grid
         ═══════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#1a1a1a", padding: "80px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            {heading("DESAFIOS", "O que Esta em Jogo na Geracao de Biogas", true)}
          </AnimateOnScroll>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {challenges.map((c, i) => (
              <AnimateOnScroll key={c.title} delay={i * 0.08}>
                <div
                  style={{
                    backgroundColor: "#222",
                    borderLeft: "4px solid #FF6A00",
                    borderRadius: 4,
                    padding: "24px 20px",
                    height: "100%",
                    transition: "transform 0.3s ease, box-shadow 0.3s ease",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.3)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
                >
                  <AlertTriangle size={20} style={{ color: "#FF6A00", marginBottom: 12 }} />
                  <h4 style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
                    {c.title}
                  </h4>
                  <p style={{ fontSize: 13, lineHeight: 1.65, color: "#999" }}>
                    {c.desc}
                  </p>
                </div>
              </AnimateOnScroll>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          4) SOLUTIONS — alternating layout cards
         ═══════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#fff", padding: "80px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            {heading("SOLUCOES", "Principais Solucoes")}
          </AnimateOnScroll>

          <div className="space-y-8">
            {solutions.map((s, i) => {
              const isEven = i % 2 === 0;
              return (
                <AnimateOnScroll key={s.num} delay={i * 0.1}>
                  <div
                    className={`flex flex-col ${isEven ? "md:flex-row" : "md:flex-row-reverse"} gap-0 overflow-hidden`}
                    style={{
                      backgroundColor: "#fff",
                      border: "1px solid #e5e5e5",
                      boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
                      borderRadius: 4,
                      transition: "box-shadow 0.3s ease",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 8px 28px rgba(0,0,0,0.1)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.06)"; }}
                  >
                    {/* Number panel */}
                    <div
                      className="flex items-center justify-center"
                      style={{
                        backgroundColor: "#1a1a1a",
                        minWidth: 120,
                        minHeight: 100,
                        padding: "24px",
                      }}
                    >
                      <span style={{ fontFamily: "'Knockout HTF68', sans-serif", fontSize: 56, fontWeight: 400, color: "#FF6A00", lineHeight: 1 }}>
                        {s.num}
                      </span>
                    </div>

                    {/* Content */}
                    <div style={{ padding: "28px 32px", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                      <div className="flex items-center gap-3" style={{ marginBottom: 10 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#1a7f4c", flexShrink: 0 }} />
                        <h4 style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a", textTransform: "uppercase", letterSpacing: "0.02em" }}>
                          {s.title}
                        </h4>
                      </div>
                      <p style={{ fontSize: 14, lineHeight: 1.7, color: "#666", paddingLeft: 20 }}>
                        {s.desc}
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
          5) METHODOLOGY — horizontal flow pills
         ═════════════════════════════════════��═════ */}
      <section style={{ backgroundColor: "#f7f7f7", padding: "80px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            {heading("METODOLOGIA", "Como a Gaiatec Atua na Pratica")}
          </AnimateOnScroll>

          <AnimateOnScroll delay={0.15}>
            <div className="relative">
              {/* Connecting line — desktop only */}
              <div className="hidden lg:block absolute" style={{ top: 28, left: "5%", right: "5%", height: 2, backgroundColor: "#ddd", zIndex: 0 }} />

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 relative z-10">
                {workflow.map((step, i) => (
                  <div key={step.num} className="flex flex-col items-center text-center">
                    {/* Pill badge */}
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 10,
                        backgroundColor: "#1a1a1a",
                        color: "#fff",
                        padding: "12px 20px",
                        borderRadius: 50,
                        marginBottom: 16,
                        border: "2px solid #333",
                        transition: "all 0.3s ease",
                        cursor: "default",
                        whiteSpace: "nowrap",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#FF6A00"; e.currentTarget.style.transform = "scale(1.05)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#333"; e.currentTarget.style.transform = "scale(1)"; }}
                    >
                      <span style={{ fontFamily: "'Knockout HTF68', sans-serif", fontSize: 18, fontWeight: 400, color: "#FF6A00", lineHeight: 1 }}>
                        {step.num}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        {step.label.split(" ").slice(0, 2).join(" ")}
                      </span>
                    </div>

                    <p style={{ fontSize: 13, color: "#666", lineHeight: 1.5, maxWidth: 180 }}>
                      {step.label}
                    </p>

                    {/* Arrow on mobile */}
                    {i < workflow.length - 1 && (
                      <div className="lg:hidden" style={{ marginTop: 8, marginBottom: 8 }}>
                        <ChevronRight size={16} style={{ color: "#ccc", transform: "rotate(90deg)" }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
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
              <div>
                <h2 style={{ fontFamily: "'Knockout HTF68', sans-serif", fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 400, lineHeight: 1.2, textTransform: "uppercase", color: "#fff", marginBottom: 8 }}>
                  Controle inteligente para sua operacao de biogas
                </h2>
                <p style={{ fontSize: 15, color: "#888", lineHeight: 1.6 }}>
                  Biogas nao e experimento — e processo industrial controlado. Fale com a Gaiatec Sistemas.
                </p>
              </div>

              <div className="flex flex-wrap gap-4 justify-center lg:justify-end" style={{ flexShrink: 0 }}>
                <Link
                  to="/contato"
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, backgroundColor: "#FF6A00", color: "#000", padding: "14px 32px", fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.5px", textDecoration: "none", borderRadius: 4, transition: "all 0.3s ease" }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#e5b800"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#FF6A00"; }}
                >
                  Fale com um Especialista <ChevronRight size={14} />
                </Link>
                <Link
                  to="/contato"
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, backgroundColor: "transparent", color: "#fff", padding: "14px 32px", fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.5px", textDecoration: "none", borderRadius: 4, border: "2px solid #444", transition: "all 0.3s ease" }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#FF6A00"; e.currentTarget.style.color = "#FF6A00"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#444"; e.currentTarget.style.color = "#fff"; }}
                >
                  Solicitar Orcamento <ChevronRight size={14} />
                </Link>
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>
    </>
  );
}
