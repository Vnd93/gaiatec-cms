import { Link } from "react-router";
import { AnimateOnScroll } from "../components/useScrollAnimation";
import { ChevronRight, ArrowRight } from "lucide-react";

const KNOCKOUT = "'Knockout HTF68', sans-serif";

/* ────────────────────────────────────────────────────────
   IMAGES
   ──────────────────────────────────────────────────────── */
const HERO_IMG = "/images/heroes/1.1.png";
const INTRO_IMG = "/images/heroes/1.2.png";
const ACC_IMG_1 = "/images/heroes/1.3.png";
const ACC_IMG_2 = "/images/heroes/1.4.png";

/* ────────────────────────────────────────────────────────
   DATA
   ──────────────────────────────────────────────────────── */
const models = [
  {
    name: "GT-BIODIGEST 10.0",
    porte: "Grande porte / Escala industrial",
    specs: [
      { label: "Volume interno", value: "10.000 L" },
      { label: "Volume útil", value: "6.000 L" },
      { label: "Volume de biogás", value: "4.000 L" },
      { label: "Geração de biogás/dia", value: "3.600 L" },
      { label: "Biofertilizante/dia", value: "200 L" },
      { label: "Resíduos cozinha (máx./dia)", value: "50 L" },
      { label: "Resíduos animais (máx./dia)", value: "150 L" },
    ],
    application: "Plantas industriais e agroindustriais de alta capacidade",
    highlight: "3.600 L/dia",
    highlightLabel: "Biogás",
  },
  {
    name: "GT-BIODIGEST 8.0",
    porte: "Médio a grande porte / Operações contínuas",
    specs: [
      { label: "Volume interno", value: "8.000 L" },
      { label: "Volume útil", value: "5.000 L" },
      { label: "Volume de biogás", value: "3.000 L" },
      { label: "Geração de biogás/dia", value: "2.500 L" },
      { label: "Biofertilizante/dia", value: "160 L" },
      { label: "Resíduos cozinha (máx./dia)", value: "40 L" },
      { label: "Resíduos animais (máx./dia)", value: "120 L" },
    ],
    application: "Operações contínuas de médio a grande porte",
    highlight: "2.500 L/dia",
    highlightLabel: "Biogás",
  },
  {
    name: "GT-BIODIGEST 5.0",
    porte: "Porte médio / Agroindústrias",
    specs: [
      { label: "Volume interno", value: "5.000 L" },
      { label: "Volume útil", value: "3.000 L" },
      { label: "Volume de biogás", value: "2.000 L" },
      { label: "Geração de biogás/dia", value: "2.000 L" },
      { label: "Biofertilizante/dia", value: "100 L" },
      { label: "Resíduos cozinha (máx./dia)", value: "25 L" },
      { label: "Resíduos animais (máx./dia)", value: "75 L" },
    ],
    application: "Propriedades rurais e agroindústrias de médio porte",
    highlight: "2.000 L/dia",
    highlightLabel: "Biogás",
  },
  {
    name: "GT-BIODIGEST 3.0",
    porte: "Pequeno a médio porte / Operações estruturadas",
    specs: [
      { label: "Volume interno", value: "3.000 L" },
      { label: "Volume útil", value: "1.600 L" },
      { label: "Volume de biogás", value: "1.400 L" },
      { label: "Geração de biogás/dia", value: "1.000 L" },
      { label: "Biofertilizante/dia", value: "60 L" },
      { label: "Resíduos cozinha (máx./dia)", value: "15 L" },
      { label: "Resíduos animais (máx./dia)", value: "45 L" },
    ],
    application: "Operações estruturadas de pequeno a médio porte",
    highlight: "1.000 L/dia",
    highlightLabel: "Biogás",
  },
  {
    name: "GT-BIODIGEST 2.0",
    porte: "Pequeno porte / Aplicações locais",
    specs: [
      { label: "Volume interno", value: "2.000 L" },
      { label: "Volume útil", value: "1.200 L" },
      { label: "Volume de biogás", value: "800 L" },
      { label: "Geração de biogás/dia", value: "700 L" },
      { label: "Biofertilizante/dia", value: "40 L" },
      { label: "Resíduos cozinha (máx./dia)", value: "10 L" },
      { label: "Resíduos animais (máx./dia)", value: "30 L" },
    ],
    application: "Pequenas propriedades e projetos educacionais",
    highlight: "700 L/dia",
    highlightLabel: "Biogás",
  },
];

const tableRows = [
  { spec: "Volume interno", values: ["10.000 L", "8.000 L", "5.000 L", "3.000 L", "2.000 L"] },
  { spec: "Volume útil", values: ["6.000 L", "5.000 L", "3.000 L", "1.600 L", "1.200 L"] },
  { spec: "Volume de biogás", values: ["4.000 L", "3.000 L", "2.000 L", "1.400 L", "800 L"] },
  { spec: "Geração de biogás/dia", values: ["3.600 L", "2.500 L", "2.000 L", "1.000 L", "700 L"] },
  { spec: "Biofertilizante/dia", values: ["200 L", "160 L", "100 L", "60 L", "40 L"] },
  { spec: "Resíduos cozinha (máx./dia)", values: ["50 L", "40 L", "25 L", "15 L", "10 L"] },
  { spec: "Resíduos animais (máx./dia)", values: ["150 L", "120 L", "75 L", "45 L", "30 L"] },
  { spec: "Aplicação recomendada", values: ["Industrial", "Médio-grande", "Agroindústria", "Peq-médio", "Pequeno"] },
];

const accessories = [
  {
    name: "Gasômetro Bag GT-BIOSTORAGE",
    desc: "Sistema de armazenamento flexível para biogás produzido em biodigestores. Projetado para acumular o gás gerado entre períodos de utilização, garantindo disponibilidade contínua e estabilidade de pressão no sistema.",
    specs: ["Material de alta resistência", "Proteção UV e intempéries", "Conexões padronizadas", "Volumes de 1.000 a 10.000 L"],
    img: ACC_IMG_1,
  },
  {
    name: "Analisador de Biogás MCA 100 BIO",
    desc: "Analisador portátil para medição da composição do biogás em campo. Permite a verificação rápida dos níveis de metano (CH₄), dióxido de carbono (CO₂) e ácido sulfídrico (H₂S), essencial para controle de qualidade e eficiência.",
    specs: ["Medição de CH₄, CO₂ e H₂S", "Display digital integrado", "Portátil e de fácil operação", "Calibração rastreável"],
    img: ACC_IMG_2,
  },
];

/* ────────────────────────────────────────────────────────
   HEADING HELPER
   ──────────────────────────────────────────────────────── */
const heading = (overline: string, title: string, light = false) => (
  <div className="text-center" style={{ marginBottom: 48 }}>
    <span style={{ display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: light ? "#1a7f4c" : "#FF6A00", marginBottom: 12 }}>
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
export default function BiodigestorPortes() {
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
            PORTES GT-BIODIGEST
          </span>
          <h1 style={{ fontFamily: "'Knockout HTF68', sans-serif", fontSize: "clamp(41px, 6vw, 85px)", fontWeight: 500, lineHeight: 0.95, textTransform: "uppercase", color: "#fff", maxWidth: 800, margin: 0 }}>
            Portes GT-BIODIGEST
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
                  Linha de Produtos
                </span>
                <h2 style={{ fontFamily: "'Knockout HTF68', sans-serif", fontSize: "clamp(28px, 3vw, 36px)", fontWeight: 400, lineHeight: 1.15, textTransform: "uppercase", marginBottom: 24, color: "#1a1a1a" }}>
                  Biodigestores Para Cada Escala
                </h2>
                <p style={{ fontSize: 16, lineHeight: 1.75, color: "#555", marginBottom: 20 }}>
                  Os biodigestores da linha GT-BIODIGEST são equipamentos projetados para acelerar a decomposição da matéria orgânica na ausência de oxigênio, por meio do processo de biodigestão anaeróbia. O resultado é a produção simultânea de biogás e biofertilizante — com eficiência proporcional ao dimensionamento de cada modelo.
                </p>
                <p style={{ fontSize: 16, lineHeight: 1.75, color: "#555" }}>
                  Com cinco modelos distintos, a linha atende desde pequenas propriedades rurais e projetos educacionais até grandes plantas agroindustriais, garantindo desempenho otimizado para cada realidade operacional.
                </p>
              </div>
              <div className="relative overflow-hidden" style={{ borderRadius: 4 }}>
                <img loading="lazy" src={INTRO_IMG} alt="Biodigestor GT-BIODIGEST" className="w-full h-full object-cover" style={{ aspectRatio: "16/11", display: "block" }} />
                <div className="absolute bottom-0 left-0" style={{ width: 80, height: 4, backgroundColor: "#FF6A00" }} />
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          3) PRODUCT CARDS — responsive grid
         ═══════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#f7f7f7", padding: "80px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            {heading("MODELOS", "Especificações por Modelo")}
          </AnimateOnScroll>

          <div className="space-y-6">
            {models.map((m, i) => (
              <AnimateOnScroll key={m.name} delay={i * 0.08}>
                <div
                  style={{
                    backgroundColor: "#fff",
                    border: "1px solid #e5e5e5",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                    overflow: "hidden",
                    transition: "box-shadow 0.3s ease, transform 0.3s ease",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 12px 32px rgba(0,0,0,0.12)"; e.currentTarget.style.transform = "translateY(-4px)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"; e.currentTarget.style.transform = "translateY(0)"; }}
                >
                  <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-0">
                    {/* Left — model identity */}
                    <div style={{ backgroundColor: "#0a0a0a", padding: "32px 28px", display: "flex", flexDirection: "column", justifyContent: "center", position: "relative", overflow: "hidden" }}>
                      <div style={{ position: "absolute", top: 0, left: 0, width: 4, height: "100%", backgroundColor: "#FF6A00" }} />
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#FF6A00", marginBottom: 8, display: "block" }}>
                        {m.porte}
                      </span>
                      <h4 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(24px, 2.5vw, 32px)", fontWeight: 500, color: "#fff", textTransform: "uppercase", lineHeight: 1.05, marginBottom: 16 }}>
                        {m.name}
                      </h4>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
                        <span style={{ fontFamily: KNOCKOUT, fontSize: 42, fontWeight: 500, color: "#FF6A00", lineHeight: 1 }}>
                          {m.highlight}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                          {m.highlightLabel}
                        </span>
                      </div>
                      <p style={{ fontSize: 13, lineHeight: 1.5, color: "rgba(255,255,255,0.45)" }}>
                        {m.application}
                      </p>
                    </div>

                    {/* Right — full specs */}
                    <div style={{ padding: "28px 32px" }}>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4" style={{ marginBottom: 20 }}>
                        {m.specs.map((s) => (
                          <div key={s.label}>
                            <span style={{ display: "block", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#999", marginBottom: 4 }}>
                              {s.label}
                            </span>
                            <span style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a", fontFamily: KNOCKOUT }}>
                              {s.value}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div style={{ borderTop: "1px solid #e5e5e5", paddingTop: 16, display: "flex", justifyContent: "flex-end" }}>
                        <Link
                          to="/contato"
                          className="group"
                          style={{ display: "inline-flex", alignItems: "center", gap: 8, border: "2px solid #FF6A00", color: "#FF6A00", padding: "10px 24px", fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", textDecoration: "none", transition: "all 0.3s ease" }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#FF6A00"; e.currentTarget.style.color = "#000"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#FF6A00"; }}
                        >
                          Solicitar Orçamento <ArrowRight size={12} />
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              </AnimateOnScroll>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          4) COMPARISON TABLE — dark bg
         ═══════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#1a1a1a", padding: "80px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            {heading("COMPARATIVO", "Tabela de Especificações", true)}
          </AnimateOnScroll>

          <AnimateOnScroll delay={0.1}>
            <div className="overflow-x-auto" style={{ borderRadius: 4, border: "1px solid #333" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
                <thead>
                  <tr>
                    <th style={{ backgroundColor: "#FF6A00", color: "#000", padding: "14px 16px", fontSize: 13, fontWeight: 700, textAlign: "left", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "2px solid #e5b800" }}>
                      Especificação
                    </th>
                    {["10.0", "8.0", "5.0", "3.0", "2.0"].map((m) => (
                      <th key={m} style={{ backgroundColor: "#FF6A00", color: "#000", padding: "14px 16px", fontSize: 13, fontWeight: 700, textAlign: "center", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "2px solid #e5b800", borderLeft: "1px solid rgba(0,0,0,0.1)" }}>
                        GT-{m}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row, ri) => (
                    <tr key={row.spec}>
                      <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600, color: "#ccc", backgroundColor: ri % 2 === 0 ? "#222" : "#1e1e1e", borderBottom: "1px solid #333" }}>
                        {row.spec}
                      </td>
                      {row.values.map((v, ci) => (
                        <td key={ci} style={{ padding: "12px 16px", fontSize: 13, color: "#aaa", textAlign: "center", backgroundColor: ri % 2 === 0 ? "#222" : "#1e1e1e", borderBottom: "1px solid #333", borderLeft: "1px solid #333" }}>
                          {v}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Technical note */}
            <div style={{ marginTop: 24, borderLeft: "3px solid #FF6A00", paddingLeft: 16 }}>
              <p style={{ fontSize: 13, color: "#888", lineHeight: 1.6 }}>
                <strong style={{ color: "#ccc" }}>Observação técnica:</strong> Os valores apresentados representam capacidades máximas de referência. O desempenho real do sistema depende de: tipo e composição do resíduo orgânico, frequência e regularidade da alimentação, condições operacionais e climáticas, controle do processo e instrumentação instalada.
              </p>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          5) ACCESSORIES — horizontal feature cards
         ═══════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#fff", padding: "80px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            {heading("ACESSÓRIOS", "Produtos Complementares")}
          </AnimateOnScroll>

          <div className="space-y-8">
            {accessories.map((acc, i) => (
              <AnimateOnScroll key={acc.name} delay={i * 0.15}>
                <div
                  className="grid grid-cols-1 md:grid-cols-2 gap-0 overflow-hidden"
                  style={{
                    backgroundColor: "#fff",
                    border: "1px solid #e5e5e5",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                    borderRadius: 4,
                    transition: "box-shadow 0.3s ease",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.1)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"; }}
                >
                  {/* Image — left */}
                  <div style={{ position: "relative", minHeight: 280, overflow: "hidden" }}>
                    <img
                      src={acc.img}
                      alt={acc.name}
                      style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" }}
                    />
                    <div className="absolute bottom-0 left-0" style={{ width: 60, height: 4, backgroundColor: "#FF6A00" }} />
                  </div>

                  {/* Specs — right */}
                  <div style={{ padding: "32px 28px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                    <span style={{ display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#FF6A00", marginBottom: 8 }}>
                      Acessório
                    </span>
                    <h3 style={{ fontFamily: "'Knockout HTF68', sans-serif", fontSize: 24, fontWeight: 400, color: "#1a1a1a", marginBottom: 12, textTransform: "uppercase" }}>
                      {acc.name}
                    </h3>
                    <p style={{ fontSize: 14, lineHeight: 1.7, color: "#666", marginBottom: 20 }}>
                      {acc.desc}
                    </p>

                    <div style={{ marginBottom: 20 }}>
                      {acc.specs.map((s) => (
                        <div key={s} className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#1a7f4c", flexShrink: 0 }} />
                          <span style={{ fontSize: 13, color: "#555" }}>{s}</span>
                        </div>
                      ))}
                    </div>

                    <Link
                      to="/contato"
                      style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, color: "#1a1a1a", textDecoration: "none", textTransform: "uppercase", letterSpacing: "0.5px", transition: "color 0.3s ease" }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "#FF6A00"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "#1a1a1a"; }}
                    >
                      Solicitar Informações <ArrowRight size={12} />
                    </Link>
                  </div>
                </div>
              </AnimateOnScroll>
            ))}
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
                  Encontre o modelo ideal para sua operação
                </h2>
                <p style={{ fontSize: 15, color: "#888", lineHeight: 1.6 }}>
                  Cada sistema é dimensionado conforme a capacidade de processamento e o tipo de resíduo. O correto dimensionamento garante eficiência, segurança e maior aproveitamento energético.
                </p>
              </div>

              <div className="flex flex-wrap gap-4 justify-center lg:justify-end" style={{ flexShrink: 0 }}>
                <Link
                  to="/contato"
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, backgroundColor: "#FF6A00", color: "#000", padding: "14px 32px", fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.5px", textDecoration: "none", borderRadius: 4, transition: "all 0.3s ease" }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#e5b800"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#FF6A00"; }}
                >
                  Solicitar Orçamento <ChevronRight size={14} />
                </Link>
                <Link
                  to="/contato"
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, backgroundColor: "transparent", color: "#fff", padding: "14px 32px", fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.5px", textDecoration: "none", borderRadius: 4, border: "2px solid #444", transition: "all 0.3s ease" }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#FF6A00"; e.currentTarget.style.color = "#FF6A00"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#444"; e.currentTarget.style.color = "#fff"; }}
                >
                  Fale com um Especialista <ChevronRight size={14} />
                </Link>
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>
    </>
  );
}
