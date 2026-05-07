import { useState } from "react";
import { Link } from "react-router";
import { AnimateOnScroll } from "../components/useScrollAnimation";
import { ChevronRight, DollarSign, Shield, TrendingUp, Zap, Leaf, Award, Settings, Rocket, CheckCircle } from "lucide-react";

/* ────────────────────────────────────────────────────────
   IMAGES
   ──────────────────────────────────────────────────────── */
const HERO_IMG = "/images/heroes/1.1.png";
const INTRO_IMG = "/images/heroes/1.2.png";

/* ────────────────────────────────────────────────────────
   DATA
   ──────────────────────────────────────────────────────── */
const benefitCards = [
  { icon: DollarSign, title: "Reducao de Custos Operacionais", desc: "Diminuicao drastica do consumo de insumos externos, substituindo custos variaveis por geracao propria de energia e fertilizantes." },
  { icon: Shield, title: "Seguranca Financeira", desc: "Blindagem contra a inflacao energetica e flutuacoes de precos de fornecedores externos de GLP, energia e fertilizantes." },
  { icon: TrendingUp, title: "Eficiencia Operacional", desc: "Investimento com payback claro que gera fluxo de caixa positivo continuo apos a amortizacao do sistema." },
  { icon: Zap, title: "Geracao de Energia Propria", desc: "Producao de biogas para substituir GLP, lenha ou energia eletrica, reduzindo a dependencia da rede e de fornecedores." },
  { icon: Leaf, title: "Producao de Biofertilizante", desc: "Adubo organico de alta qualidade que substitui fertilizantes quimicos, gerando economia e melhorando a qualidade do solo." },
  { icon: Award, title: "Creditos de Carbono", desc: "Possibilidade de comercializacao de creditos de carbono no mercado voluntario, gerando receita adicional." },
];

const economyTypes = [
  { label: "Gas/GLP", reduction: 30 },
  { label: "Energia Eletrica", reduction: 10 },
  { label: "Fertilizantes", reduction: 60 },
];

const roiMilestones = [
  { icon: Settings, label: "Instalacao", sub: "Mes 0", desc: "Implantacao e comissionamento do sistema completo." },
  { icon: Rocket, label: "Payback", sub: "12-24 meses", desc: "Retorno do investimento com economias acumuladas." },
  { icon: CheckCircle, label: "Lucro Continuo", sub: "Apos payback", desc: "Fluxo de caixa positivo e receita recorrente." },
];

/* ────────────────────────────────────────────────────────
   HEADING HELPER
   ──────────────────────────────────────────────────────── */
const heading = (overline: string, title: string, light = false, subtitle?: string) => (
  <div className="text-center" style={{ marginBottom: 48 }}>
    <span style={{ display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: light ? "#1a7f4c" : "#0057DE", marginBottom: 12 }}>
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
export default function BiodigestorBeneficios() {
  const [selectedType, setSelectedType] = useState(0);
  const [consumo, setConsumo] = useState(1000);
  const [custo, setCusto] = useState(5);

  const reduction = economyTypes[selectedType].reduction;
  const economiaEstimada = (consumo * custo * reduction) / 100;

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
            BENEFICIOS
          </span>
          <h1 style={{ fontFamily: "'Knockout HTF68', sans-serif", fontSize: "clamp(41px, 6vw, 85px)", fontWeight: 500, lineHeight: 0.95, textTransform: "uppercase", color: "#fff", maxWidth: 800, margin: 0 }}>
            Beneficios Economicos do Biodigestor
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
                  Viabilidade Economica
                </span>
                <h2 style={{ fontFamily: "'Knockout HTF68', sans-serif", fontSize: "clamp(28px, 3vw, 36px)", fontWeight: 400, lineHeight: 1.15, textTransform: "uppercase", marginBottom: 24, color: "#1a1a1a" }}>
                  Retorno Inteligente
                </h2>
                <p style={{ fontSize: 16, lineHeight: 1.75, color: "#555", marginBottom: 20 }}>
                  O ganho economico nao vem de um unico fator, mas da soma de economias diretas e indiretas ao longo do tempo, transformando sua operacao. Cada biodigestor gera valor em multiplas frentes simultaneamente.
                </p>
                <p style={{ fontSize: 16, lineHeight: 1.75, color: "#555" }}>
                  Da reducao de custos com GLP e energia eletrica ate a producao de biofertilizante e geracao de creditos de carbono, o biodigestor converte o que era um passivo ambiental em fonte de receita recorrente e previsivel.
                </p>
              </div>
              <div className="relative overflow-hidden" style={{ borderRadius: 4 }}>
                <img loading="lazy" src={INTRO_IMG} alt="Beneficios Economicos" className="w-full h-full object-cover" style={{ aspectRatio: "16/11", display: "block" }} />
                <div className="absolute bottom-0 left-0" style={{ width: 80, height: 4, backgroundColor: "#0057DE" }} />
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          3) BENEFITS GRID — 3x2 cards
         ═══════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#f7f7f7", padding: "80px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            {heading("VANTAGENS", "Beneficios Economicos Diretos")}
          </AnimateOnScroll>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {benefitCards.map((b, i) => {
              const Icon = b.icon;
              return (
                <AnimateOnScroll key={b.title} delay={i * 0.08}>
                  <div
                    style={{
                      backgroundColor: "#fff",
                      border: "1px solid #e5e5e5",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                      borderRadius: 4,
                      overflow: "hidden",
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      transition: "box-shadow 0.3s ease, transform 0.3s ease",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.12)"; e.currentTarget.style.transform = "translateY(-4px)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"; e.currentTarget.style.transform = "translateY(0)"; }}
                  >
                    <div style={{ height: 4, backgroundColor: "#0057DE" }} />
                    <div style={{ padding: "28px 24px" }}>
                      <Icon size={28} style={{ color: "#0057DE", marginBottom: 16 }} />
                      <h3 style={{ fontSize: 17, fontWeight: 700, color: "#1a1a1a", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.02em" }}>
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
          4) SIMULATOR — dark bg
         ═══════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#f8fafc", padding: "80px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            {heading("SIMULADOR", "Simulador de Economia", true, "Estime o potencial de economia com um biodigestor")}
          </AnimateOnScroll>

          <AnimateOnScroll delay={0.15}>
            <div
              style={{
                maxWidth: 640,
                margin: "0 auto",
                backgroundColor: "#242424",
                border: "1px solid #333",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              {/* Tabs */}
              <div className="flex" style={{ borderBottom: "1px solid #333" }}>
                {economyTypes.map((type, i) => (
                  <button
                    key={type.label}
                    onClick={() => setSelectedType(i)}
                    style={{
                      flex: 1,
                      padding: "14px 16px",
                      fontSize: 13,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      border: "none",
                      cursor: "pointer",
                      transition: "all 0.3s ease",
                      backgroundColor: selectedType === i ? "#0057DE" : "transparent",
                      color: selectedType === i ? "#000" : "#888",
                      borderBottom: selectedType === i ? "2px solid #0057DE" : "2px solid transparent",
                    }}
                  >
                    {type.label}
                  </button>
                ))}
              </div>

              {/* Input fields */}
              <div style={{ padding: "28px 28px 0" }}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6" style={{ marginBottom: 24 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
                      Consumo Mensal (kg/L)
                    </label>
                    <input
                      type="number"
                      value={consumo}
                      onChange={(e) => setConsumo(Number(e.target.value))}
                      style={{
                        width: "100%",
                        backgroundColor: "#f8fafc",
                        border: "1px solid #444",
                        color: "#fff",
                        padding: "12px 16px",
                        fontSize: 15,
                        borderRadius: 4,
                        outline: "none",
                        transition: "border-color 0.3s",
                      }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = "#0057DE"; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = "#444"; }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
                      Custo por kg/L (R$)
                    </label>
                    <input
                      type="number"
                      value={custo}
                      onChange={(e) => setCusto(Number(e.target.value))}
                      style={{
                        width: "100%",
                        backgroundColor: "#f8fafc",
                        border: "1px solid #444",
                        color: "#fff",
                        padding: "12px 16px",
                        fontSize: 15,
                        borderRadius: 4,
                        outline: "none",
                        transition: "border-color 0.3s",
                      }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = "#0057DE"; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = "#444"; }}
                    />
                  </div>
                </div>
              </div>

              {/* Result */}
              <div style={{ backgroundColor: "#1e1e1e", padding: "24px 28px", borderTop: "1px solid #333" }}>
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <span style={{ fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600 }}>
                      Economia Mensal Estimada
                    </span>
                    <span style={{ display: "block", fontSize: 11, color: "#666", marginTop: 2 }}>
                      Reducao estimada: {reduction}%
                    </span>
                  </div>
                  <span
                    style={{
                      fontFamily: "'Knockout HTF68', sans-serif",
                      fontSize: 36,
                      fontWeight: 400,
                      color: "#0057DE",
                      lineHeight: 1,
                    }}
                  >
                    R$ {economiaEstimada.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          5) ROI SECTION — horizontal timeline
         ═══════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#fff", padding: "80px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            {heading("RETORNO", "Retorno sobre o Investimento")}
          </AnimateOnScroll>

          <AnimateOnScroll delay={0.15}>
            <div className="relative max-w-[900px] mx-auto">
              {/* Connecting line */}
              <div className="hidden md:block absolute" style={{ top: 40, left: "8%", right: "8%", height: 3, backgroundColor: "#e0e0e0", zIndex: 0 }}>
                <div style={{ width: "100%", height: "100%", background: "linear-gradient(90deg, #1a7f4c 0%, #1a7f4c 33%, #1a7f4c 66%, #1a7f4c 100%)", opacity: 0.5 }} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
                {roiMilestones.map((m, i) => {
                  const Icon = m.icon;
                  return (
                    <div key={m.label} className="flex flex-col items-center text-center">
                      {/* Icon circle */}
                      <div
                        style={{
                          width: 80,
                          height: 80,
                          borderRadius: "50%",
                          backgroundColor: "#1a7f4c",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          marginBottom: 20,
                          boxShadow: "0 0 0 6px #fff, 0 0 0 8px rgba(26,127,76,0.3)",
                          transition: "transform 0.3s ease",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.1)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                      >
                        <Icon size={32} style={{ color: "#fff" }} />
                      </div>

                      <span style={{ fontFamily: "'Knockout HTF68', sans-serif", fontSize: 14, fontWeight: 400, color: "#1a7f4c", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
                        {m.sub}
                      </span>
                      <h4 style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a", marginBottom: 8, textTransform: "uppercase" }}>
                        {m.label}
                      </h4>
                      <p style={{ fontSize: 13, lineHeight: 1.6, color: "#777", maxWidth: 220 }}>
                        {m.desc}
                      </p>

                      {/* Arrow between milestones on mobile */}
                      {i < roiMilestones.length - 1 && (
                        <div className="md:hidden" style={{ marginTop: 16, marginBottom: 16 }}>
                          <ChevronRight size={20} style={{ color: "#1a7f4c", transform: "rotate(90deg)" }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          6) CTA BANNER
         ═══════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#f8fafc", padding: "80px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div className="flex flex-col lg:flex-row items-center justify-between gap-8 text-center lg:text-left">
              <div>
                <h2 style={{ fontFamily: "'Knockout HTF68', sans-serif", fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 400, lineHeight: 1.2, textTransform: "uppercase", color: "#fff", marginBottom: 8 }}>
                  Transformamos passivos ambientais em ativos economicos
                </h2>
                <p style={{ fontSize: 15, color: "#888", lineHeight: 1.6 }}>
                  Fale com a Gaiatec Sistemas e descubra o potencial economico do biodigestor para sua operacao.
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
