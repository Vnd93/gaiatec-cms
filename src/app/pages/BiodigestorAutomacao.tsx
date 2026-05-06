import { Link } from "react-router";
import { AnimateOnScroll } from "../components/useScrollAnimation";
import { ChevronRight, Settings, Shield, Flame, CheckCircle } from "lucide-react";

/* ────────────────────────────────────────────────────────
   IMAGES
   ──────────────────────────────────────────────────────── */
const HERO_IMG = "/images/heroes/1.1.png";
const INTRO_IMG = "/images/heroes/1.2.png";

/* ────────────────────────────────────────────────────────
   DATA
   ──────────────────────────────────────────────────────── */
const flowCards = [
  {
    icon: Settings,
    title: "Producao Controlada",
    bullets: [
      "Entrada de residuos adequada",
      "Digestao anaerobia em ambiente fechado",
      "Pressao regulada naturalmente",
    ],
  },
  {
    icon: Shield,
    title: "Distribuicao Segura",
    bullets: [
      "Tubulacoes adequadas",
      "Conexoes vedadas",
      "Valvulas manuais de controle e sistemas de alivio de pressao",
    ],
  },
  {
    icon: Flame,
    title: "Fogareiro como Elemento de Controle",
    bullets: [
      "Confirma qualidade do biogas",
      "Avalia estabilidade da producao",
      "Chama estavel indica controle adequado",
    ],
  },
];

const safetyFeatures = [
  "Sistema fechado e vedado",
  "Valvula hidraulica automatica de alivio",
  "Controle natural de pressao",
  "Reducao de riscos de vazamento",
  "Operacao sem ignicao interna",
];

const advancedTags = [
  "Sensores de pressao",
  "Medidores de vazao",
  "Analisadores de biogas",
  "Sistemas de monitoramento",
  "Alarmes de seguranca",
];

/* ────────────────────────────────────────────────────────
   HEADING HELPER
   ──────────────────────────────────────────────────────── */
const heading = (overline: string, title: string, light = false, subtitle?: string) => (
  <div className="text-center" style={{ marginBottom: 48 }}>
    <span style={{ display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#FF6A00", marginBottom: 12 }}>
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
export default function BiodigestorAutomacao() {
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
            AUTOMACAO E CONTROLE
          </span>
          <h1 style={{ fontFamily: "'Knockout HTF68', sans-serif", fontSize: "clamp(41px, 6vw, 85px)", fontWeight: 500, lineHeight: 0.95, textTransform: "uppercase", color: "#fff", maxWidth: 800, margin: 0 }}>
            Automacao e Controle do Processo
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
                  GT-BIODIGEST
                </span>
                <h2 style={{ fontFamily: "'Knockout HTF68', sans-serif", fontSize: "clamp(28px, 3vw, 36px)", fontWeight: 400, lineHeight: 1.15, textTransform: "uppercase", marginBottom: 24, color: "#1a1a1a" }}>
                  Controle Inteligente e Autonomo
                </h2>
                <p style={{ fontSize: 16, lineHeight: 1.75, color: "#555", marginBottom: 20 }}>
                  No GT-BIODIGEST, automacao e controle nao significam eletronica complexa ou dependencia energetica. Significam controle fisico, hidraulico e operacional do processo — garantindo seguranca, estabilidade e aproveitamento eficiente do biogas.
                </p>
                <p style={{ fontSize: 16, lineHeight: 1.75, color: "#555" }}>
                  O sistema foi projetado para funcionar de forma autonoma, com componentes simples, confiaveis e de baixa manutencao, desenhados para operar continuamente sem necessidade de energia eletrica externa.
                </p>
              </div>
              <div className="relative overflow-hidden" style={{ borderRadius: 4 }}>
                <img loading="lazy" src={INTRO_IMG} alt="Controle de Biodigestor" className="w-full h-full object-cover" style={{ aspectRatio: "16/11", display: "block" }} />
                <div className="absolute bottom-0 left-0" style={{ width: 80, height: 4, backgroundColor: "#FF6A00" }} />
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          3) FLOW — dark bg, 3 cards
         ═══════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#1a1a1a", padding: "80px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            {heading("DA GERACAO AO USO", "Fluxo do Biogas — Da Geracao ao Uso", true)}
          </AnimateOnScroll>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {flowCards.map((card, i) => {
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
                    <div style={{ height: 4, backgroundColor: "#FF6A00" }} />
                    <div style={{ padding: "28px 24px", flex: 1 }}>
                      <Icon size={28} style={{ color: "#FF6A00", marginBottom: 16 }} />
                      <h4 style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 16, textTransform: "uppercase" }}>
                        {card.title}
                      </h4>
                      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                        {card.bullets.map((b) => (
                          <li key={b} className="flex items-start gap-3" style={{ marginBottom: 10 }}>
                            <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#FF6A00", flexShrink: 0, marginTop: 6 }} />
                            <span style={{ fontSize: 14, color: "#aaa", lineHeight: 1.55 }}>{b}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </AnimateOnScroll>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          4) SAFETY — vertical list with yellow border
         ═══════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#fff", padding: "80px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            {heading("SEGURANCA", "Seguranca Operacional por Projeto")}
          </AnimateOnScroll>

          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            <div
              style={{
                borderLeft: "4px solid #FF6A00",
                paddingLeft: 0,
              }}
            >
              {safetyFeatures.map((f, i) => (
                <AnimateOnScroll key={f} delay={i * 0.08}>
                  <div
                    className="flex items-center gap-4"
                    style={{
                      padding: "18px 24px",
                      backgroundColor: i % 2 === 0 ? "#f9f9f9" : "#fff",
                      borderBottom: "1px solid #eee",
                      transition: "background-color 0.3s ease",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#fffbea"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = i % 2 === 0 ? "#f9f9f9" : "#fff"; }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        backgroundColor: "#FF6A00",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <CheckCircle size={16} style={{ color: "#fff" }} />
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a" }}>
                      {f}
                    </span>
                  </div>
                </AnimateOnScroll>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          5) ADVANCED — light gray, pill badges
         ═══════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#f8f8f8", padding: "80px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            {heading(
              "INTEGRACAO",
              "Integracao com Automacao Avancada",
              false,
              "Para aplicacoes maiores ou mais tecnicas, o sistema pode ser integrado a instrumentacao avancada. Essa integracao permite gestao mais precisa sem comprometer a autossuficiencia do biodigestor."
            )}
          </AnimateOnScroll>

          <AnimateOnScroll delay={0.15}>
            <div className="flex flex-wrap justify-center gap-4">
              {advancedTags.map((tag, i) => (
                <span
                  key={tag}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    backgroundColor: "#FF6A00",
                    color: "#000",
                    padding: "12px 24px",
                    borderRadius: 50,
                    fontWeight: 700,
                    fontSize: 13,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    transition: "all 0.3s ease",
                    cursor: "default",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#1a1a1a"; e.currentTarget.style.color = "#FF6A00"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#FF6A00"; e.currentTarget.style.color = "#000"; }}
                >
                  {tag}
                </span>
              ))}
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
                  Automacao inteligente para sua operacao de biogas
                </h2>
                <p style={{ fontSize: 15, color: "#888", lineHeight: 1.6 }}>
                  Fale com a Gaiatec Sistemas e descubra como otimizar o controle do seu biodigestor.
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
