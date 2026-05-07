import { Link } from "react-router";
import { AnimateOnScroll } from "../components/useScrollAnimation";
import { ChevronRight, Zap, Leaf, Wind, Trash2, Flame, BatteryCharging, Droplets } from "lucide-react";

/* ────────────────────────────────────────────────────────
   IMAGES
   ──────────────────────────────────────────────────────── */
const HERO_IMG = "/images/heroes/1.1.png";
const INTRO_IMG = "/images/heroes/1.2.png";

/* ────────────────────────────────────────────────────────
   DATA
   ──────────────────────────────────────────────────────── */
const steps = [
  {
    num: "01",
    icon: Trash2,
    title: "Entrada de residuos organicos",
    desc: "Residuos organicos provenientes de processos agricolas, agroindustriais ou industriais sao direcionados ao biodigestor de forma controlada. A regularidade e o tipo de alimentacao influenciam diretamente a estabilidade do processo.",
    details: ["Dejetos animais (suinos, bovinos, aves)", "Residuos organicos industriais", "Efluentes organicos e lodos"],
  },
  {
    num: "02",
    icon: Droplets,
    title: "Digestao anaerobia",
    desc: "No interior do biodigestor, os residuos passam por um processo biologico sem presenca de oxigenio, onde micro-organismos atuam na decomposicao da materia organica em quatro etapas: hidrolise, acidogenese, acetogenese e metanogenese.",
    details: ["Temperatura interna da camara", "Tempo de retencao hidraulica", "Estabilidade biologica do processo"],
  },
  {
    num: "03",
    icon: Flame,
    title: "Producao de biogas",
    desc: "Durante a digestao, e produzido biogas — composto principalmente por metano (CH4) — que pode ser captado, tratado e direcionado para aproveitamento energetico em diversas aplicacoes.",
    details: ["Geracao de energia termica", "Geracao de energia eletrica", "Conversao em biometano para rede ou frota"],
  },
  {
    num: "04",
    icon: Leaf,
    title: "Geracao de biofertilizante",
    desc: "Apos o processo de digestao, o material remanescente e convertido em biofertilizante — um subproduto estabilizado, rico em nutrientes e com valor agronomico real, pronto para aplicacao no campo.",
  },
  {
    num: "05",
    icon: BatteryCharging,
    title: "Integracao e aproveitamento energetico",
    desc: "Todo o processo pode ser integrado a sistemas de controle, instrumentacao e automacao, garantindo operacao segura, continua e monitorada — com maximo aproveitamento de cada etapa.",
    details: ["Estabilidade e previsibilidade", "Seguranca operacional com alarmes", "Maximo aproveitamento energetico"],
  },
];

const benefits = [
  {
    icon: Zap,
    title: "Energia Renovavel",
    desc: "O biogas gerado pode ser convertido em energia eletrica, termica ou biometano — substituindo combustiveis fosseis e reduzindo custos operacionais.",
  },
  {
    icon: Leaf,
    title: "Biofertilizante Natural",
    desc: "O digestato e um subproduto estabilizado rico em nutrientes essenciais, permitindo sua aplicacao direta como fertilizante agricola de alta qualidade.",
  },
  {
    icon: Wind,
    title: "Reducao de Emissoes",
    desc: "A biodigestao controlada evita a emissao descontrolada de metano na atmosfera, contribuindo para a reducao significativa de gases de efeito estufa.",
  },
];

/* Diagram data for the cycle infographic */
const diagramSteps = [
  { label: "Residuos Organicos", sub: "Entrada controlada", color: "#0057DE" },
  { label: "Biodigestor", sub: "Digestao anaerobia", color: "#1a7f4c" },
  { label: "Biogas (CH4)", sub: "Captacao e tratamento", color: "#0057DE" },
  { label: "Energia", sub: "Eletrica / Termica", color: "#1a7f4c" },
  { label: "Biofertilizante", sub: "Aplicacao agricola", color: "#0057DE" },
];

/* ────────────────────────────────────────────────────────
   SECTION HEADING HELPER
   ──────────────────────────────────────────────────────── */
const heading = (overline: string, title: string, light = false) => (
  <div className="text-center" style={{ marginBottom: 48 }}>
    <span style={{ display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: light ? "#1a7f4c" : "#0057DE", marginBottom: 12 }}>
      {overline}
    </span>
    <h2 style={{ fontFamily: "'Knockout HTF68', sans-serif", fontSize: "clamp(28px, 3vw, 36px)", fontWeight: 400, lineHeight: 1.15, textTransform: "uppercase", color: light ? "#fff" : "#1a1a1a" }}>
      {title}
    </h2>
  </div>
);

/* ────────────────────────────────────────────────────────
   COMPONENT
   ──────────────────────────────────────────────────────── */
export default function BiodigestorComoFunciona() {
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
            COMO FUNCIONA
          </span>
          <h1 style={{ fontFamily: "'Knockout HTF68', sans-serif", fontSize: "clamp(41px, 6vw, 85px)", fontWeight: 500, lineHeight: 0.95, textTransform: "uppercase", color: "#fff", maxWidth: 800, margin: 0 }}>
            Como Funciona um Biodigestor
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
                <span style={{ display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#0057DE", marginBottom: 16 }}>
                  Processo de Operacao
                </span>
                <h2 style={{ fontFamily: "'Knockout HTF68', sans-serif", fontSize: "clamp(28px, 3vw, 36px)", fontWeight: 400, lineHeight: 1.15, textTransform: "uppercase", marginBottom: 24, color: "#1a1a1a" }}>
                  Do Residuo Organico a Energia Limpa
                </h2>
                <p style={{ fontSize: 16, lineHeight: 1.75, color: "#555", marginBottom: 20 }}>
                  O funcionamento de um biodigestor e baseado em um processo continuo e controlado, no qual residuos organicos sao transformados em biogas e biofertilizante por meio da digestao anaerobia — um processo biologico natural realizado por micro-organismos na ausencia de oxigenio.
                </p>
                <p style={{ fontSize: 16, lineHeight: 1.75, color: "#555" }}>
                  Cada etapa do processo exige monitoramento tecnico preciso para garantir a eficiencia da conversao energetica, a estabilidade biologica e a seguranca operacional de todo o sistema.
                </p>
              </div>
              <div className="relative overflow-hidden" style={{ borderRadius: 4 }}>
                <img loading="lazy" src={INTRO_IMG} alt="Sistema Biodigestor" className="w-full h-full object-cover" style={{ aspectRatio: "16/11", display: "block" }} />
                <div className="absolute bottom-0 left-0" style={{ width: 80, height: 4, backgroundColor: "#0057DE" }} />
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          3) PROCESS FLOW — vertical timeline
         ═══════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#f7f7f7", padding: "80px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            {heading("FLUXO DO PROCESSO", "Do Residuo a Energia")}
          </AnimateOnScroll>

          <div className="relative max-w-[800px] mx-auto">
            {/* Vertical accent line */}
            <div className="absolute left-[23px] md:left-[23px] top-0 bottom-0" style={{ width: 3, backgroundColor: "#0057DE", opacity: 0.3 }} />

            <div className="space-y-0">
              {steps.map((step, i) => {
                const Icon = step.icon;
                return (
                  <AnimateOnScroll key={step.num} delay={i * 0.1}>
                    <div className="relative flex gap-6" style={{ paddingBottom: i < steps.length - 1 ? 32 : 0 }}>
                      {/* Dot */}
                      <div className="flex-shrink-0 relative z-10" style={{ width: 48 }}>
                        <div style={{ width: 48, height: 48, borderRadius: "50%", backgroundColor: "#1a7f4c", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 0 4px #f7f7f7, 0 0 0 6px rgba(26,127,76,0.3)" }}>
                          <Icon size={20} style={{ color: "#fff" }} />
                        </div>
                      </div>

                      {/* Card */}
                      <div
                        className="flex-1"
                        style={{
                          backgroundColor: "#fff",
                          border: "1px solid #e5e5e5",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                          borderRadius: 4,
                          padding: "28px 24px",
                          transition: "box-shadow 0.3s ease, transform 0.3s ease",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.1)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"; e.currentTarget.style.transform = "translateY(0)"; }}
                      >
                        <div className="flex items-center gap-3" style={{ marginBottom: 12 }}>
                          <span style={{ fontFamily: "'Knockout HTF68', sans-serif", fontSize: 28, fontWeight: 400, color: "#0057DE", lineHeight: 1 }}>
                            {step.num}
                          </span>
                          <h3 style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a", textTransform: "uppercase", letterSpacing: "0.02em" }}>
                            {step.title}
                          </h3>
                        </div>
                        <p style={{ fontSize: 14, lineHeight: 1.7, color: "#666", marginBottom: step.details ? 16 : 0 }}>
                          {step.desc}
                        </p>
                        {step.details && (
                          <div className="flex flex-wrap gap-2">
                            {step.details.map((d) => (
                              <span
                                key={d}
                                style={{
                                  display: "inline-flex", alignItems: "center", gap: 4,
                                  backgroundColor: "#1a1a1a", color: "#fff",
                                  padding: "5px 12px", borderRadius: 3, fontSize: 11, fontWeight: 600,
                                }}
                              >
                                <ChevronRight size={10} style={{ color: "#0057DE" }} /> {d}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </AnimateOnScroll>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          4) DIAGRAM SECTION — dark bg, cycle infographic
         ═══════════════════════════════════════��═══ */}
      <section style={{ backgroundColor: "#1a1a1a", padding: "80px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            {heading("CICLO DO BIODIGESTOR", "Diagrama do Processo", true)}
          </AnimateOnScroll>

          <AnimateOnScroll delay={0.15}>
            {/* Horizontal flow diagram */}
            <div className="overflow-x-auto" style={{ paddingBottom: 16 }}>
              <div className="flex items-center justify-center gap-0" style={{ minWidth: 900 }}>
                {diagramSteps.map((ds, i) => (
                  <div key={ds.label} className="flex items-center">
                    {/* Step box */}
                    <div
                      style={{
                        width: 160,
                        backgroundColor: "#242424",
                        border: `2px solid ${ds.color}`,
                        borderRadius: 8,
                        padding: "24px 16px",
                        textAlign: "center",
                        transition: "transform 0.3s ease",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.05)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                    >
                      <div style={{ width: 48, height: 48, borderRadius: "50%", backgroundColor: ds.color, margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ color: ds.color === "#0057DE" ? "#000" : "#fff", fontFamily: "'Knockout HTF68', sans-serif", fontSize: 18, fontWeight: 400 }}>
                          {String(i + 1).padStart(2, "0")}
                        </span>
                      </div>
                      <h4 style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 4, textTransform: "uppercase" }}>
                        {ds.label}
                      </h4>
                      <p style={{ fontSize: 11, color: "#888", lineHeight: 1.4 }}>
                        {ds.sub}
                      </p>
                    </div>

                    {/* Arrow connector */}
                    {i < diagramSteps.length - 1 && (
                      <div style={{ width: 40, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <div style={{ position: "relative", width: 40, height: 2, backgroundColor: "#444" }}>
                          <div style={{ position: "absolute", right: -1, top: -4, width: 0, height: 0, borderTop: "5px solid transparent", borderBottom: "5px solid transparent", borderLeft: "8px solid #0057DE" }} />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Cycle return arrow */}
            <div className="flex justify-center" style={{ marginTop: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 20px", backgroundColor: "#242424", borderRadius: 20, border: "1px solid #333" }}>
                <span style={{ fontSize: 11, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  Ciclo continuo de operacao
                </span>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 1C4.13 1 1 4.13 1 8s3.13 7 7 7 7-3.13 7-7" stroke="#1a7f4c" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M15 1v4h-4" stroke="#1a7f4c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          5) BENEFITS — 3 white cards
         ═══════════════════��═══════════════════════ */}
      <section style={{ backgroundColor: "#fff", padding: "80px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            {heading("RESULTADOS", "Beneficios do Processo")}
          </AnimateOnScroll>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {benefits.map((b, i) => {
              const Icon = b.icon;
              return (
                <AnimateOnScroll key={b.title} delay={i * 0.15}>
                  <div
                    style={{
                      backgroundColor: "#fff",
                      border: "1px solid #e5e5e5",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                      borderRadius: 4,
                      overflow: "hidden",
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      transition: "box-shadow 0.3s ease, transform 0.3s ease",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.12)"; e.currentTarget.style.transform = "translateY(-4px)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)"; e.currentTarget.style.transform = "translateY(0)"; }}
                  >
                    <div style={{ height: 4, backgroundColor: "#0057DE" }} />
                    <div style={{ padding: "32px 28px" }}>
                      <Icon size={32} style={{ color: "#0057DE", marginBottom: 20 }} />
                      <h3 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.02em" }}>
                        {b.title}
                      </h3>
                      <p style={{ fontSize: 14, lineHeight: 1.7, color: "#666" }}>
                        {b.desc}
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
          6) CTA BANNER
         ═══════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#111", padding: "80px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div className="flex flex-col lg:flex-row items-center justify-between gap-8 text-center lg:text-left">
              <div>
                <h2 style={{ fontFamily: "'Knockout HTF68', sans-serif", fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 400, lineHeight: 1.2, textTransform: "uppercase", color: "#fff", marginBottom: 8 }}>
                  Quer entender como o biodigestor se adapta a sua operacao?
                </h2>
                <p style={{ fontSize: 15, color: "#888", lineHeight: 1.6 }}>
                  Cada sistema e projetado sob medida para as condicoes do seu projeto.
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
                  to="/biodigestor/portes"
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, backgroundColor: "transparent", color: "#fff", padding: "14px 32px", fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.5px", textDecoration: "none", borderRadius: 4, border: "2px solid #444", transition: "all 0.3s ease" }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#0057DE"; e.currentTarget.style.color = "#0057DE"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#444"; e.currentTarget.style.color = "#fff"; }}
                >
                  Ver Modelos GT-BIODIGEST <ChevronRight size={14} />
                </Link>
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>
    </>
  );
}
