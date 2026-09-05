import { Link } from "react-router";
import { AnimateOnScroll } from "../components/useScrollAnimation";
import { ChevronRight, Flame, Zap, Trash2, Factory, Beaker, Fuel, ClipboardCheck, Settings, Users } from "lucide-react";
import { optimizedBg } from "../components/ResponsiveImage";

/* ────────────────────────────────────────────────────────
   IMAGE
   ──────────────────────────────────────────────────────── */
const HERO_IMG = "/images/heroes/1.1.png";

/* ────────────────────────────────────────────────────────
   DATA
   ──────────────────────────────────────────────────────── */
const biogasUses = [
  "Geracao de energia termica (calor)",
  "Geracao de energia eletrica",
  "Uso direto em processos industriais",
  "Queima controlada para aproveitamento energetico",
];

const biometanoUses = [
  "Combustivel veicular",
  "Injecao em redes de gas",
  "Uso industrial de maior exigencia tecnica",
  "Substituicao direta de combustiveis fosseis",
];

const factors = [
  { title: "Demanda Energetica", desc: "Avaliacao do perfil de consumo e tipo de energia necessaria para a operacao." },
  { title: "Infraestrutura Disponivel", desc: "Analise da capacidade instalada e possibilidades de expansao do sistema atual." },
  { title: "Viabilidade Economica", desc: "Estudo de retorno sobre investimento considerando custos de purificacao e mercado." },
];

const processSteps = [
  { icon: Trash2, label: "Residuos Organicos", highlight: false },
  { icon: Factory, label: "Biodigestor", highlight: true },
  { icon: Flame, label: "Biogas Bruto", highlight: true },
  { icon: Beaker, label: "Purificacao", highlight: true },
  { icon: Fuel, label: "Biometano", highlight: true },
];

const gaiatecFeatures = [
  { icon: ClipboardCheck, title: "Projetos sob medida", desc: "Cada solucao e dimensionada conforme a realidade operacional, o tipo de residuo e os objetivos energeticos do cliente." },
  { icon: Settings, title: "Acompanhamento tecnico completo", desc: "Desde o diagnostico inicial ate a operacao continua, com suporte em todas as fases do projeto." },
  { icon: Users, title: "Solucoes para biogas e biometano", desc: "Projetos que abrangem desde a geracao de biogas ate a purificacao e aproveitamento como biometano." },
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
export default function BiodigestorBiogasBiometano() {
  return (
    <>
      {/* ═══════════════════════════════════════════
          1) HERO
         ═══════════════════════════════════════════ */}
      <section className="relative w-full overflow-hidden" style={{ height: 772 }}>
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${optimizedBg(HERO_IMG, 1920, "webp")})`, transform: "scale(1.05)", transition: "transform 8s ease-out" }}
        />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to right, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.2) 50%, transparent 100%)" }} />
        <div
          className="relative z-10 flex flex-col justify-end h-full"
          style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px 100px 30px" }}
        >
          <span style={{ display: "inline-block", fontSize: 13, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#0057DE", marginBottom: 16 }}>
            BIOGÁS X BIOMETANO
          </span>
          <h1 style={{ fontFamily: "'Knockout HTF68', sans-serif", fontSize: "clamp(41px, 6vw, 85px)", fontWeight: 500, lineHeight: 0.95, textTransform: "uppercase", color: "#fff", maxWidth: 800, margin: 0 }}>
            Biogas x Biometano
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
          2) COMPARISON — side-by-side cards
         ═══════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#fff", padding: "80px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            {heading("COMPARATIVO", "Entenda as Diferencas")}
          </AnimateOnScroll>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Biogas Card */}
            <AnimateOnScroll>
              <div
                style={{
                  backgroundColor: "#fff",
                  border: "1px solid #e5e5e5",
                  boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
                  borderRadius: 4,
                  overflow: "hidden",
                  height: "100%",
                  transition: "box-shadow 0.3s ease, transform 0.3s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 8px 28px rgba(0,0,0,0.1)"; e.currentTarget.style.transform = "translateY(-4px)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.06)"; e.currentTarget.style.transform = "translateY(0)"; }}
              >
                <div style={{ height: 4, backgroundColor: "#0057DE" }} />
                <div style={{ padding: "32px 28px" }}>
                  <div className="flex items-center gap-3" style={{ marginBottom: 20 }}>
                    <Flame size={28} style={{ color: "#0057DE" }} />
                    <h3 style={{ fontFamily: "'Knockout HTF68', sans-serif", fontSize: 26, fontWeight: 400, color: "#1a1a1a", textTransform: "uppercase" }}>
                      O que e o Biogas?
                    </h3>
                  </div>
                  <p style={{ fontSize: 15, lineHeight: 1.7, color: "#555", marginBottom: 24 }}>
                    Gas produzido diretamente no biodigestor durante o processo de digestao anaerobia, composto por metano (CH4), dioxido de carbono (CO2) e tracos de outros gases.
                  </p>
                  <h4 style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 14 }}>
                    Principais usos:
                  </h4>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {biogasUses.map((u) => (
                      <li key={u} className="flex items-center gap-3" style={{ marginBottom: 10 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#0057DE", flexShrink: 0 }} />
                        <span style={{ fontSize: 14, color: "#666", lineHeight: 1.5 }}>{u}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </AnimateOnScroll>

            {/* Biometano Card */}
            <AnimateOnScroll delay={0.15}>
              <div
                style={{
                  backgroundColor: "#fff",
                  border: "1px solid #e5e5e5",
                  boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
                  borderRadius: 4,
                  overflow: "hidden",
                  height: "100%",
                  transition: "box-shadow 0.3s ease, transform 0.3s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 8px 28px rgba(0,0,0,0.1)"; e.currentTarget.style.transform = "translateY(-4px)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.06)"; e.currentTarget.style.transform = "translateY(0)"; }}
              >
                <div style={{ height: 4, backgroundColor: "#1a7f4c" }} />
                <div style={{ padding: "32px 28px" }}>
                  <div className="flex items-center gap-3" style={{ marginBottom: 20 }}>
                    <Zap size={28} style={{ color: "#1a7f4c" }} />
                    <h3 style={{ fontFamily: "'Knockout HTF68', sans-serif", fontSize: 26, fontWeight: 400, color: "#1a1a1a", textTransform: "uppercase" }}>
                      O que e o Biometano?
                    </h3>
                  </div>
                  <p style={{ fontSize: 15, lineHeight: 1.7, color: "#555", marginBottom: 24 }}>
                    Biogas purificado onde impurezas e CO2 sao removidos, elevando a concentracao de metano — possui caracteristicas semelhantes ao gas natural.
                  </p>
                  <h4 style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 14 }}>
                    Principais usos:
                  </h4>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {biometanoUses.map((u) => (
                      <li key={u} className="flex items-center gap-3" style={{ marginBottom: 10 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#1a7f4c", flexShrink: 0 }} />
                        <span style={{ fontSize: 14, color: "#666", lineHeight: 1.5 }}>{u}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </AnimateOnScroll>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          3) RELATIONSHIP — dark bg
         ═══════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#f8fafc", padding: "80px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div className="text-center" style={{ marginBottom: 48 }}>
              <span style={{ display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#0057DE", marginBottom: 12 }}>
                RELACAO
              </span>
              <h2 style={{ fontFamily: "'Knockout HTF68', sans-serif", fontSize: "clamp(28px, 3vw, 36px)", fontWeight: 400, lineHeight: 1.15, textTransform: "uppercase", color: "#fff", marginBottom: 16 }}>
                Nao Sao Concorrentes, Sao Etapas
              </h2>
              <p style={{ fontSize: 15, color: "#999", lineHeight: 1.65, maxWidth: 720, margin: "0 auto" }}>
                Biogas e biometano nao sao solucoes concorrentes, mas etapas possiveis dentro da mesma cadeia de aproveitamento energetico. Um projeto pode iniciar com biogas e evoluir para biometano conforme a maturidade e o porte da operacao.
              </p>
            </div>
          </AnimateOnScroll>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {factors.map((f, i) => (
              <AnimateOnScroll key={f.title} delay={i * 0.1}>
                <div
                  style={{
                    backgroundColor: "#222",
                    borderLeft: "4px solid #0057DE",
                    borderRadius: 4,
                    padding: "24px 20px",
                    height: "100%",
                    transition: "transform 0.3s ease, box-shadow 0.3s ease",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.3)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
                >
                  <h4 style={{ fontSize: 17, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
                    {f.title}
                  </h4>
                  <p style={{ fontSize: 13, lineHeight: 1.65, color: "#999" }}>
                    {f.desc}
                  </p>
                </div>
              </AnimateOnScroll>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          4) PROCESS — horizontal flow diagram
         ═══════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#fff", padding: "80px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            {heading("PROCESSO", "Da Producao ao Aproveitamento")}
          </AnimateOnScroll>

          <AnimateOnScroll delay={0.15}>
            <div className="flex flex-col md:flex-row items-center justify-center gap-0">
              {processSteps.map((step, i) => {
                const Icon = step.icon;
                return (
                  <div key={step.label} className="flex flex-col md:flex-row items-center">
                    {/* Step card */}
                    <div
                      className="flex flex-col items-center text-center"
                      style={{ minWidth: 140 }}
                    >
                      <div
                        style={{
                          width: 72,
                          height: 72,
                          borderRadius: "50%",
                          backgroundColor: step.highlight ? "#1a1a1a" : "#f7f7f7",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          marginBottom: 14,
                          border: step.highlight ? "3px solid #0057DE" : "3px solid #e0e0e0",
                          transition: "transform 0.3s ease",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.1)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                      >
                        <Icon size={28} style={{ color: step.highlight ? "#0057DE" : "#999" }} />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", textTransform: "uppercase", letterSpacing: "0.03em", maxWidth: 120, lineHeight: 1.3 }}>
                        {step.label}
                      </span>
                    </div>

                    {/* Arrow connector */}
                    {i < processSteps.length - 1 && (
                      <>
                        {/* Desktop arrow */}
                        <div className="hidden md:flex items-center" style={{ padding: "0 8px" }}>
                          <div style={{ width: 40, height: 2, backgroundColor: "#ddd" }} />
                          <ChevronRight size={16} style={{ color: "#0057DE", marginLeft: -4 }} />
                        </div>
                        {/* Mobile arrow */}
                        <div className="md:hidden flex justify-center" style={{ padding: "8px 0" }}>
                          <ChevronRight size={16} style={{ color: "#0057DE", transform: "rotate(90deg)" }} />
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          5) GAIATEC ROLE — light gray bg
         ═══════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#f8f8f8", padding: "80px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            {heading("GAIATEC", "O Papel da Gaiatec Sistemas")}
          </AnimateOnScroll>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {gaiatecFeatures.map((f, i) => {
              const Icon = f.icon;
              return (
                <AnimateOnScroll key={f.title} delay={i * 0.1}>
                  <div
                    style={{
                      backgroundColor: "#fff",
                      border: "1px solid #e5e5e5",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                      borderRadius: 4,
                      padding: "32px 24px",
                      height: "100%",
                      textAlign: "center",
                      transition: "box-shadow 0.3s ease, transform 0.3s ease",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.1)"; e.currentTarget.style.transform = "translateY(-4px)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.05)"; e.currentTarget.style.transform = "translateY(0)"; }}
                  >
                    <div
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: "50%",
                        backgroundColor: "rgba(26,127,76,0.1)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        margin: "0 auto 20px",
                      }}
                    >
                      <Icon size={24} style={{ color: "#1a7f4c" }} />
                    </div>
                    <h4 style={{ fontSize: 17, fontWeight: 700, color: "#1a1a1a", marginBottom: 10, textTransform: "uppercase" }}>
                      {f.title}
                    </h4>
                    <p style={{ fontSize: 14, lineHeight: 1.7, color: "#666" }}>
                      {f.desc}
                    </p>
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
      <section style={{ backgroundColor: "#f8fafc", padding: "80px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div className="flex flex-col lg:flex-row items-center justify-between gap-8 text-center lg:text-left">
              <div style={{ maxWidth: 640 }}>
                <h2 style={{ fontFamily: "'Knockout HTF68', sans-serif", fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 400, lineHeight: 1.2, textTransform: "uppercase", color: "#fff", marginBottom: 8 }}>
                  Solucoes completas para biogas e biometano
                </h2>
                <p style={{ fontSize: 15, color: "#888", lineHeight: 1.6 }}>
                  A Gaiatec Sistemas e especializada em projetos de biodigestores e aproveitamento de biogas, garantindo a solucao mais adequada para suas necessidades.
                </p>
              </div>

              <div className="flex flex-wrap gap-4 justify-center lg:justify-end" style={{ flexShrink: 0 }}>
                <Link
                  to="/contato"
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, backgroundColor: "#0057DE", color: "#ffffff", padding: "14px 32px", fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.5px", textDecoration: "none", borderRadius: 4, transition: "all 0.3s ease" }}
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
