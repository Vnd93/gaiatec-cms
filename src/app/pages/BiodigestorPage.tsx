import { Link } from "react-router";
import { AnimateOnScroll } from "../components/useScrollAnimation";
import { ChevronRight, ArrowRight } from "lucide-react";
import { DynamicBlocks } from "../components/BlockRenderer";

const KNOCKOUT = "'Knockout HTF68', sans-serif";

/* ────────────────────────────────────────────────────────
   IMAGES
   ──────────────────────────────────────────────────────── */
const HERO_IMG = "/hero-biodigestor.png";
const INTRO_IMG = "/images/heroes/1.1.png";
const PROD_IMG_1 = "/images/heroes/1.2.png";
const PROD_IMG_2 = "/images/heroes/1.3.png";
const PROD_IMG_3 = "/images/heroes/1.4.png";
const PROD_IMG_4 = "/images/heroes/1.5.png";

/* ────────────────────────────────────────────────────────
   DATA
   ──────────────────────────────────────────────────────── */
const stats = [
  { value: "20+", label: "Anos de experiência" },
  { value: "500+", label: "Projetos entregues" },
  { value: "98%", label: "Satisfação dos clientes" },
  { value: "24/7", label: "Suporte técnico" },
];

const bioComponents = [
  { num: "01", title: "Câmara de Digestão Anaeróbia", desc: "Ambiente vedado onde ocorre a decomposição biológica dos resíduos orgânicos na ausência de oxigênio." },
  { num: "02", title: "Sistema de Entrada Controlada", desc: "Regula o tipo, volume e frequência da alimentação do biodigestor com resíduos orgânicos." },
  { num: "03", title: "Produção e Armazenamento de Biogás", desc: "Espaço superior do biodigestor onde o gás gerado é acumulado antes do consumo ou tratamento." },
  { num: "04", title: "Alívio e Segurança de Pressão", desc: "Válvulas e dispositivos que impedem sobrepressão, garantindo operação segura e contínua." },
  { num: "05", title: "Saída do Biofertilizante", desc: "Estrutura de descarga do material digerido, pronto para uso como fertilizante agrícola." },
  { num: "06", title: "Controle Hidráulico", desc: "Componentes que regulam o fluxo interno do sistema sem necessidade de energia elétrica." },
];

const stages = [
  { num: "01", title: "Hidrólise", desc: "Quebra de moléculas complexas em compostos mais simples e solúveis." },
  { num: "02", title: "Acidogênese", desc: "Conversão em ácidos orgânicos, álcoois e CO₂ por bactérias acidogênicas." },
  { num: "03", title: "Acetogênese", desc: "Conversão dos ácidos em acetato, hidrogênio e dióxido de carbono." },
  { num: "04", title: "Metanogênese", desc: "Produção de metano (CH₄) a partir do acetato e hidrogênio — etapa final e mais sensível." },
];

const products = [
  { model: "GT-BIODIGEST 10.0", desc: "Biodigestor de grande porte para plantas industriais e agroindustriais de alta capacidade.", img: PROD_IMG_1 },
  { model: "GT-BIODIGEST 8.0", desc: "Modelo intermediário-avançado para operações de médio a grande porte.", img: PROD_IMG_1 },
  { model: "GT-BIODIGEST 5.0", desc: "Solução de médio porte para propriedades rurais e agroindústrias.", img: PROD_IMG_1 },
  { model: "GT-BIODIGEST 3.0", desc: "Modelo compacto para pequenas e médias operações agropecuárias.", img: PROD_IMG_4 },
  { model: "Gasômetro Bag GT-BIOSTORAGE", desc: "Sistema de armazenamento flexível para biogás produzido em biodigestores.", img: PROD_IMG_2 },
  { model: "Analisador MCA 100 BIO", desc: "Analisador portátil para medição da composição do biogás em campo.", img: PROD_IMG_3 },
];

const subpages = [
  { title: "Como Funciona", desc: "Entenda o processo completo de digestão anaeróbia", href: "/biodigestor/como-funciona" },
  { title: "Portes GT-BIODIGEST", desc: "Modelos dimensionados para cada escala de operação", href: "/biodigestor/portes" },
  { title: "Benefícios Econômicos", desc: "Transforme passivos ambientais em ativos energéticos", href: "/biodigestor/beneficios" },
  { title: "Monitoramento", desc: "Controle técnico para maximizar a produção de biogás", href: "/biodigestor/monitoramento" },
  { title: "Biogás x Biometano", desc: "Diferenças, processos e aplicações de cada um", href: "/biodigestor/biogas-biometano" },
  { title: "Automação e Controle", desc: "Controle físico e hidráulico para estabilidade operacional", href: "/biodigestor/automacao" },
];

/* ────────────────────────────────────────────────────────
   COMPONENT
   ──────────────────────────────────────────────────────── */
export default function BiodigestorPage() {
  return (
    <>
      {/* ═══════════════════════════════════════════════════
          1) HERO SECTION — DO NOT TOUCH
         ═══════════════════════════════════════════════════ */}
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
          <span
            style={{
              display: "inline-block",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "#FF6A00",
              marginBottom: 16,
            }}
          >
            BIODIGESTOR
          </span>
          <h1
            style={{
              fontFamily: KNOCKOUT,
              fontSize: "clamp(41px, 6vw, 85px)",
              fontWeight: 500,
              lineHeight: 0.95,
              textTransform: "uppercase",
              color: "#fff",
              maxWidth: 800,
              margin: 0,
            }}
          >
            Linha GT-BIODIGEST
          </h1>
        </div>
      </section>

      {/* ── Vertical line connector ── */}
      <div style={{ position: "relative" }}>
        {/* White half (over hero area) */}
        <div style={{ position: "relative", height: 60, backgroundColor: "transparent", marginTop: -60, zIndex: 20 }}>
          <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px", position: "relative", height: "100%" }}>
            <div style={{ position: "absolute", left: 30, top: 0, width: 1, height: "100%", backgroundColor: "#fff" }} />
          </div>
        </div>
        {/* Black half (over section 2 white bg) */}
        <div style={{ position: "relative", height: 60, backgroundColor: "#fff" }}>
          <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px", position: "relative", height: "100%" }}>
            <div style={{ position: "absolute", left: 30, top: 0, width: 1, height: "100%", backgroundColor: "#000" }} />
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          2) INTRO — asymmetric two columns
         ═══════════════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#fff", paddingTop: 0, paddingBottom: 100 }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-16 lg:gap-24 items-center">
              <div>
                <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#FF6A00", marginBottom: 20 }}>
                  Biodigestão Anaeróbia
                </span>
                <h2 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(32px, 4vw, 52px)", fontWeight: 500, lineHeight: 1, textTransform: "uppercase", marginBottom: 28, color: "#111" }}>
                  Engenharia Aplicada à Sustentabilidade
                </h2>
                <p style={{ fontSize: 17, lineHeight: 1.8, color: "#555", marginBottom: 24 }}>
                  Um biodigestor não é apenas uma solução ambiental — é uma solução de engenharia que exige dimensionamento, controle e conformidade técnica. A Gaiatec Sistemas oferece soluções de instrumentação e automação projetadas para maximizar a eficiência dos sistemas de biodigestão.
                </p>
                <p style={{ fontSize: 17, lineHeight: 1.8, color: "#555", marginBottom: 36 }}>
                  Oferecemos soluções completas que garantem operações controladas, produzindo biogás de qualidade de forma contínua e sustentável.
                </p>
                <Link
                  to="/contato"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    border: "2px solid #FF6A00", color: "#FF6A00",
                    padding: "14px 32px", fontWeight: 700, fontSize: 13,
                    textTransform: "uppercase", letterSpacing: "0.08em",
                    textDecoration: "none", transition: "all 0.3s ease",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#FF6A00"; e.currentTarget.style.color = "#000"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#FF6A00"; }}
                >
                  Solicitar Orçamento <ArrowRight size={14} />
                </Link>
              </div>

              <div className="relative overflow-hidden">
                <img loading="lazy" src={INTRO_IMG} alt="Biodigestor" className="w-full object-cover" style={{ aspectRatio: "4/3", display: "block" }} />
                <div style={{ position: "absolute", bottom: 0, left: 0, width: "100%", height: 4, backgroundColor: "#FF6A00" }} />
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          3) STATS BAR — full-width dark strip
         ═══════════════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#111", padding: "60px 0" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((s, i) => (
              <AnimateOnScroll key={s.label} delay={i * 0.1}>
                <div style={{ textAlign: "center" }}>
                  <span style={{ fontFamily: KNOCKOUT, fontSize: "clamp(40px, 5vw, 64px)", fontWeight: 500, lineHeight: 1, color: "#FF6A00", display: "block" }}>
                    {s.value}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)", marginTop: 8, display: "block" }}>
                    {s.label}
                  </span>
                </div>
              </AnimateOnScroll>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          4) COMPONENTS — numbered grid
         ═══════════════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#fff", padding: "100px 0" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div style={{ maxWidth: 600, marginBottom: 60 }}>
              <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#FF6A00", marginBottom: 16 }}>
                COMPONENTES
              </span>
              <h2 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 500, lineHeight: 1, textTransform: "uppercase", color: "#111" }}>
                Anatomia do Biodigestor
              </h2>
            </div>
          </AnimateOnScroll>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0" style={{ borderTop: "1px solid #e0e0e0", borderLeft: "1px solid #e0e0e0" }}>
            {bioComponents.map((c, i) => (
              <AnimateOnScroll key={c.num} delay={i * 0.06}>
                <div
                  style={{
                    padding: "36px 32px",
                    borderRight: "1px solid #e0e0e0",
                    borderBottom: "1px solid #e0e0e0",
                    height: "100%",
                    transition: "background-color 0.3s ease",
                    cursor: "default",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#fafafa"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                >
                  <span style={{ fontFamily: KNOCKOUT, fontSize: 48, fontWeight: 500, color: "rgba(255, 106, 0, 0.15)", lineHeight: 1, display: "block", marginBottom: 16 }}>
                    {c.num}
                  </span>
                  <h4 style={{ fontFamily: KNOCKOUT, fontSize: 22, fontWeight: 500, color: "#111", marginBottom: 12, textTransform: "uppercase", lineHeight: 1.1 }}>
                    {c.title}
                  </h4>
                  <p style={{ fontSize: 14, lineHeight: 1.7, color: "#777" }}>
                    {c.desc}
                  </p>
                </div>
              </AnimateOnScroll>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          5) PROCESS — 4 stages, vertical steps
         ═══════════════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#0a0a0a", padding: "100px 0", position: "relative", overflow: "hidden" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-16 lg:gap-24">
              {/* Left — title */}
              <div style={{ position: "sticky", top: 120, alignSelf: "start" }}>
                <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#FF6A00", marginBottom: 16 }}>
                  PROCESSO BIOLÓGICO
                </span>
                <h2 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 500, lineHeight: 1, textTransform: "uppercase", color: "#fff", marginBottom: 24 }}>
                  O que Acontece Dentro do Biodigestor
                </h2>
                <p style={{ fontSize: 16, lineHeight: 1.8, color: "rgba(255,255,255,0.5)", maxWidth: 400 }}>
                  A digestão anaeróbia é um processo biológico em quatro etapas que transforma resíduos orgânicos em biogás e biofertilizante.
                </p>
              </div>

              {/* Right — steps */}
              <div>
                {stages.map((s, i) => (
                  <AnimateOnScroll key={s.num} delay={i * 0.12}>
                    <div
                      style={{
                        display: "flex",
                        gap: 24,
                        padding: "36px 0",
                        borderBottom: i < stages.length - 1 ? "1px solid rgba(255,255,255,0.08)" : "none",
                      }}
                    >
                      <span style={{ fontFamily: KNOCKOUT, fontSize: 56, fontWeight: 500, color: "#FF6A00", lineHeight: 1, flexShrink: 0, width: 70 }}>
                        {s.num}
                      </span>
                      <div>
                        <h4 style={{ fontFamily: KNOCKOUT, fontSize: 26, fontWeight: 500, color: "#fff", marginBottom: 10, textTransform: "uppercase", lineHeight: 1.1 }}>
                          {s.title}
                        </h4>
                        <p style={{ fontSize: 15, lineHeight: 1.7, color: "rgba(255,255,255,0.45)" }}>
                          {s.desc}
                        </p>
                      </div>
                    </div>
                  </AnimateOnScroll>
                ))}
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          6) PRODUCTS — premium grid
         ═══════════════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#fff", padding: "100px 0" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6" style={{ marginBottom: 60 }}>
              <div>
                <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#FF6A00", marginBottom: 16 }}>
                  PRODUTOS
                </span>
                <h2 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 500, lineHeight: 1, textTransform: "uppercase", color: "#111" }}>
                  Linha GT-BIODIGEST
                </h2>
              </div>
              <Link
                to="/biodigestor/portes"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  fontSize: 13, fontWeight: 700, color: "#111",
                  textDecoration: "none", textTransform: "uppercase",
                  letterSpacing: "0.08em", transition: "color 0.3s",
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "#FF6A00"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "#111"; }}
              >
                Ver todos os modelos <ArrowRight size={14} />
              </Link>
            </div>
          </AnimateOnScroll>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map((p, i) => (
              <AnimateOnScroll key={p.model} delay={i * 0.06}>
                <div
                  style={{
                    backgroundColor: "#fafafa",
                    overflow: "hidden",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    transition: "transform 0.4s ease",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-6px)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
                >
                  <div style={{ position: "relative", paddingTop: "65%", overflow: "hidden", backgroundColor: "#eee" }}>
                    <img
                      src={p.img}
                      alt={p.model}
                      style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.6s ease" }}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.06)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                    />
                  </div>
                  <div style={{ padding: "28px 24px", flex: 1, display: "flex", flexDirection: "column" }}>
                    <h4 style={{ fontFamily: KNOCKOUT, fontSize: 20, fontWeight: 500, color: "#111", marginBottom: 10, textTransform: "uppercase", lineHeight: 1.1 }}>
                      {p.model}
                    </h4>
                    <p style={{ fontSize: 14, lineHeight: 1.7, color: "#777", marginBottom: 20, flex: 1 }}>
                      {p.desc}
                    </p>
                    <Link
                      to="/biodigestor/portes"
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        fontSize: 12, fontWeight: 700, color: "#FF6A00",
                        textDecoration: "none", textTransform: "uppercase",
                        letterSpacing: "0.08em", transition: "gap 0.3s ease",
                      }}
                    >
                      Saiba Mais <ArrowRight size={12} />
                    </Link>
                  </div>
                </div>
              </AnimateOnScroll>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          7) EXPLORE — full-width dark navigation
         ═══════════════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#111", padding: "100px 0" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div style={{ marginBottom: 60 }}>
              <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#FF6A00", marginBottom: 16 }}>
                EXPLORE
              </span>
              <h2 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 500, lineHeight: 1, textTransform: "uppercase", color: "#fff" }}>
                Conheça Mais sobre Biodigestores
              </h2>
            </div>
          </AnimateOnScroll>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0" style={{ borderTop: "1px solid rgba(255,255,255,0.1)", borderLeft: "1px solid rgba(255,255,255,0.1)" }}>
            {subpages.map((page, i) => (
              <AnimateOnScroll key={page.href} delay={i * 0.06}>
                <Link
                  to={page.href}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    padding: "36px 32px",
                    textDecoration: "none",
                    borderRight: "1px solid rgba(255,255,255,0.1)",
                    borderBottom: "1px solid rgba(255,255,255,0.1)",
                    height: "100%",
                    minHeight: 180,
                    transition: "background-color 0.3s ease",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,106,0,0.06)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                >
                  <div>
                    <h4 style={{ fontFamily: KNOCKOUT, fontSize: 24, fontWeight: 500, color: "#fff", marginBottom: 10, textTransform: "uppercase", lineHeight: 1.1 }}>
                      {page.title}
                    </h4>
                    <p style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(255,255,255,0.4)" }}>
                      {page.desc}
                    </p>
                  </div>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#FF6A00", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 20 }}>
                    Saiba mais <ArrowRight size={12} />
                  </span>
                </Link>
              </AnimateOnScroll>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          8) CTA — full-width with background image
         ═══════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden" style={{ padding: "100px 0" }}>
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${PROD_IMG_1})` }} />
        <div className="absolute inset-0" style={{ backgroundColor: "rgba(0,0,0,0.8)" }} />

        <div className="relative z-10" style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-12">
              <div style={{ maxWidth: 650 }}>
                <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#FF6A00", marginBottom: 16 }}>
                  PRÓXIMO PASSO
                </span>
                <h2 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(28px, 4vw, 48px)", fontWeight: 500, lineHeight: 1, textTransform: "uppercase", color: "#fff", marginBottom: 16 }}>
                  Transforme Resíduos em Energia Renovável
                </h2>
                <p style={{ fontSize: 16, color: "rgba(255,255,255,0.5)", lineHeight: 1.7 }}>
                  Cada sistema é dimensionado especificamente para as condições do seu projeto. Fale com nossos engenheiros.
                </p>
              </div>

              <div className="flex flex-wrap gap-4" style={{ flexShrink: 0 }}>
                <Link
                  to="/contato"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    backgroundColor: "#FF6A00", color: "#000",
                    padding: "16px 36px", fontWeight: 700, fontSize: 13,
                    textTransform: "uppercase", letterSpacing: "0.08em",
                    textDecoration: "none", transition: "all 0.3s ease",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#fff"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#FF6A00"; }}
                >
                  Solicitar Orçamento <ArrowRight size={14} />
                </Link>
                <Link
                  to="/contato"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    backgroundColor: "transparent", color: "#fff",
                    padding: "16px 36px", fontWeight: 700, fontSize: 13,
                    textTransform: "uppercase", letterSpacing: "0.08em",
                    textDecoration: "none",
                    border: "2px solid rgba(255,255,255,0.3)", transition: "all 0.3s ease",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#FF6A00"; e.currentTarget.style.color = "#FF6A00"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)"; e.currentTarget.style.color = "#fff"; }}
                >
                  Fale Conosco <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          CMS-driven sections (editáveis em /marketing/site)
          Pula o hero (já fixo acima) e linked_list (n/a aqui)
         ═══════════════════════════════════════════════════ */}
      <DynamicBlocks slug="biodigestor" skip={["hero_slides", "linked_list"]} />
    </>
  );
}
