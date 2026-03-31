import { Link } from "react-router";
import { AnimateOnScroll } from "../components/useScrollAnimation";
import { ChevronRight, Award, Shield, CheckCircle, Users, Briefcase, Settings, Target } from "lucide-react";
import { useRef, useEffect } from "react";

/* ────────────────────────────────────────────────────────
   IMAGES
   ──────────────────────────────────────────────────────── */
const HERO_IMAGE = "/images/heroes/1.1.png";
const TEAM_IMAGE = "/images/heroes/1.2.png";

/* ────────────────────────────────────────────────────────
   DATA
   ──────────────────────────────────────────────────────── */
const principles = [
  {
    num: "01",
    title: "Missao",
    text: "Desenvolver sistemas e tecnologias inovadoras para atender as necessidades da industria nacional e internacional, oferecendo solucoes completas em controle de gases e fluidos.",
  },
  {
    num: "02",
    title: "Visao",
    text: "Ser referencia em solucoes tecnologicas para a industria, reconhecida pela excelencia, inovacao e compromisso com a satisfacao dos clientes.",
  },
  {
    num: "03",
    title: "Valores",
    text: "Qualidade e excelencia em produtos e servicos. Inovacao continua em processos e tecnologias. Compromisso com o cliente. Adaptabilidade frente as demandas do mercado. Responsabilidade em todas as acoes.",
  },
];

const timeline = [
  { year: "2004", title: "Fundacao", desc: "Gaiatec Sistemas e fundada com foco em solucoes para controle de gases e fluidos na industria brasileira." },
  { year: "2007", title: "Expansao de Portfolio", desc: "Ampliacao do portfolio para atender novos segmentos: petroleo e gas, mineracao e agronegocio." },
  { year: "2010", title: "Protecao Catodica", desc: "Estruturacao da area de protecao catodica com equipe tecnica especializada." },
  { year: "2013", title: "Automacao Industrial", desc: "Implantacao de projetos de automacao industrial e sistemas supervisorios." },
  { year: "2016", title: "Biodigestores", desc: "Inicio da linha GT-BIODIGEST para biodigestores e aproveitamento de biogas." },
  { year: "2019", title: "Certificacoes", desc: "Obtencao de acreditacoes e homologacoes: RBC Acreditado, INMETRO Homologado, ISO." },
  { year: "2022", title: "Telemetria e IoT", desc: "Expansao para solucoes de telemetria remota, monitoramento IoT e sistemas conectados." },
  { year: "2025", title: "20+ Anos de Mercado", desc: "Mais de 20 anos consolidando expertise tecnica em 11 setores industriais no Brasil." },
];

const diferenciais = [
  { icon: Award, title: "Acreditacao RBC", desc: "Calibracoes rastreaveis e reconhecidas internacionalmente" },
  { icon: Shield, title: "Homologacao INMETRO", desc: "Conformidade com normas metrologicas brasileiras" },
  { icon: CheckCircle, title: "Certificacao ISO", desc: "Sistema de gestao da qualidade consolidado" },
  { icon: Briefcase, title: "20+ anos de experiencia", desc: "Portfolio tecnico amplo e credibilidade de mercado" },
  { icon: Target, title: "11 Setores Atendidos", desc: "Atuacao transversal na industria brasileira" },
  { icon: Users, title: "Equipe especializada", desc: "Engenheiros e tecnicos com expertise em campo" },
  { icon: Settings, title: "Projetos sob medida", desc: "Cada solucao dimensionada para a realidade do cliente" },
];

/* ────────────────────────────────────────────────────────
   COMPONENT
   ──────────────────────────────────────────────────────── */
export default function SobrePage() {
  const timelineRef = useRef<HTMLDivElement>(null);

  /* Horizontal scroll drag for timeline on mobile */
  useEffect(() => {
    const el = timelineRef.current;
    if (!el) return;
    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;

    const onDown = (e: MouseEvent) => {
      isDown = true;
      startX = e.pageX - el.offsetLeft;
      scrollLeft = el.scrollLeft;
      el.style.cursor = "grabbing";
    };
    const onUp = () => {
      isDown = false;
      el.style.cursor = "grab";
    };
    const onMove = (e: MouseEvent) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - el.offsetLeft;
      el.scrollLeft = scrollLeft - (x - startX) * 1.5;
    };

    el.addEventListener("mousedown", onDown);
    el.addEventListener("mouseleave", onUp);
    el.addEventListener("mouseup", onUp);
    el.addEventListener("mousemove", onMove);

    return () => {
      el.removeEventListener("mousedown", onDown);
      el.removeEventListener("mouseleave", onUp);
      el.removeEventListener("mouseup", onUp);
      el.removeEventListener("mousemove", onMove);
    };
  }, []);

  return (
    <>
      {/* ═══════════════════════════════════════════════════
          1) HERO SECTION
         ═══════════════════════════════════════════════════ */}
      <section className="relative w-full overflow-hidden" style={{ height: 772 }}>
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${HERO_IMAGE})`, transform: "scale(1.05)", transition: "transform 8s ease-out" }}
        />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to right, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.2) 50%, transparent 100%)" }} />
        <div
          className="relative z-10 flex flex-col justify-end h-full"
          style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px 100px 30px" }}
        >
          <span style={{ display: "inline-block", fontSize: 13, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#FF6A00", marginBottom: 16 }}>
            SOBRE
          </span>
          <h1 style={{ fontFamily: "'Knockout HTF68', sans-serif", fontSize: "clamp(41px, 6vw, 85px)", fontWeight: 500, lineHeight: 0.95, textTransform: "uppercase", color: "#fff", maxWidth: 800, margin: 0 }}>
            Sobre a Gaiatec Sistemas
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

      {/* ═══════════════════════════════════════════════════
          2) ABOUT SECTION — two columns
         ═══════════════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#fff", padding: "80px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
              {/* Left — Text */}
              <div>
                <span
                  style={{
                    display: "inline-block",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    color: "#FF6A00",
                    marginBottom: 16,
                  }}
                >
                  Quem Somos
                </span>
                <h2
                  style={{
                    fontFamily: "'Knockout HTF68', sans-serif",
                    fontSize: "clamp(28px, 3vw, 36px)",
                    fontWeight: 400,
                    lineHeight: 1.15,
                    textTransform: "uppercase",
                    marginBottom: 24,
                    color: "#1a1a1a",
                  }}
                >
                  Desde 2004 Desenvolvendo Solucoes para a Industria
                </h2>
                <p style={{ fontSize: 16, lineHeight: 1.75, color: "#555", marginBottom: 20 }}>
                  A Gaiatec Sistemas e uma empresa brasileira fundada em 2004 com o objetivo de desenvolver sistemas e tecnologias para atender a industria do petroleo, mineracao, agronegocio, quimica, eletrica, maritima, saneamento e para tudo que envolve o controle de gases e fluidos.
                </p>
                <p style={{ fontSize: 16, lineHeight: 1.75, color: "#555", marginBottom: 0 }}>
                  Com uma equipe altamente qualificada e especializada, a empresa se destaca pela capacidade de inovar e oferecer solucoes completas para as necessidades de seus clientes, atuando em 11 setores industriais com excelencia tecnica reconhecida pelo mercado.
                </p>
              </div>

              {/* Right — Image */}
              <div className="relative overflow-hidden" style={{ borderRadius: 4 }}>
                <img
                  src={TEAM_IMAGE}
                  alt="Equipe Gaiatec Sistemas"
                  className="w-full h-full object-cover"
                  style={{ aspectRatio: "16/11", display: "block" }}
                />
                {/* Yellow accent bar */}
                <div
                  className="absolute bottom-0 left-0"
                  style={{ width: 80, height: 4, backgroundColor: "#FF6A00" }}
                />
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          3) MISSION / VISION / VALUES — white cards
         ═══════════════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#f7f7f7", padding: "80px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div className="text-center" style={{ marginBottom: 48 }}>
              <span
                style={{
                  display: "inline-block",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  color: "#FF6A00",
                  marginBottom: 12,
                }}
              >
                Principios
              </span>
              <h2
                style={{
                  fontFamily: "'Knockout HTF68', sans-serif",
                  fontSize: "clamp(28px, 3vw, 36px)",
                  fontWeight: 400,
                  lineHeight: 1.15,
                  textTransform: "uppercase",
                  color: "#1a1a1a",
                }}
              >
                Missao, Visao e Valores
              </h2>
            </div>
          </AnimateOnScroll>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {principles.map((p, i) => (
              <AnimateOnScroll key={p.num} delay={i * 0.15}>
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
                  }}
                >
                  {/* Yellow accent top bar */}
                  <div style={{ height: 4, backgroundColor: "#FF6A00" }} />
                  <div style={{ padding: "32px 28px" }}>
                    <span
                      style={{
                        fontFamily: "'Knockout HTF68', sans-serif",
                        fontSize: 48,
                        fontWeight: 400,
                        color: "#FF6A00",
                        lineHeight: 1,
                        display: "block",
                        marginBottom: 12,
                      }}
                    >
                      {p.num}
                    </span>
                    <h3
                      style={{
                        fontSize: 20,
                        fontWeight: 700,
                        color: "#1a1a1a",
                        marginBottom: 12,
                        textTransform: "uppercase",
                        letterSpacing: "0.02em",
                      }}
                    >
                      {p.title}
                    </h3>
                    <p style={{ fontSize: 14, lineHeight: 1.7, color: "#666" }}>
                      {p.text}
                    </p>
                  </div>
                </div>
              </AnimateOnScroll>
            ))}
          </div>
        </div>
      </section>

      {/* ═════════════════════════════════════════════��═════
          4) TIMELINE — horizontal, dark background
         ═══════════════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#1a1a1a", padding: "80px 0", overflow: "hidden" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div className="text-center" style={{ marginBottom: 48 }}>
              <span
                style={{
                  display: "inline-block",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  color: "#1a7f4c",
                  marginBottom: 12,
                }}
              >
                Nossa Historia
              </span>
              <h2
                style={{
                  fontFamily: "'Knockout HTF68', sans-serif",
                  fontSize: "clamp(28px, 3vw, 36px)",
                  fontWeight: 400,
                  lineHeight: 1.15,
                  textTransform: "uppercase",
                  color: "#fff",
                }}
              >
                Linha do Tempo
              </h2>
            </div>
          </AnimateOnScroll>
        </div>

        {/* Horizontal scrollable timeline */}
        <div
          ref={timelineRef}
          className="relative"
          style={{
            overflowX: "auto",
            overflowY: "hidden",
            cursor: "grab",
            paddingBottom: 24,
            WebkitOverflowScrolling: "touch",
          }}
        >
          {/* Scoped scrollbar style */}
          <style>{`
            .timeline-scroll::-webkit-scrollbar { height: 6px; }
            .timeline-scroll::-webkit-scrollbar-track { background: #2a2a2a; }
            .timeline-scroll::-webkit-scrollbar-thumb { background: #1a7f4c; border-radius: 3px; }
          `}</style>

          <div
            className="timeline-scroll"
            style={{
              display: "flex",
              alignItems: "flex-start",
              position: "relative",
              minWidth: "max-content",
              padding: "0 30px",
            }}
          >
            {/* Connecting horizontal line */}
            <div
              style={{
                position: "absolute",
                top: 28,
                left: 30,
                right: 30,
                height: 2,
                backgroundColor: "#333",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: 28,
                left: 30,
                right: 30,
                height: 2,
                background: "linear-gradient(90deg, #1a7f4c 0%, #1a7f4c 100%)",
                opacity: 0.5,
              }}
            />

            {timeline.map((item, i) => (
              <div
                key={item.year}
                style={{
                  flex: "0 0 auto",
                  width: 220,
                  marginRight: i < timeline.length - 1 ? 16 : 0,
                  position: "relative",
                  paddingTop: 50,
                }}
              >
                {/* Dot */}
                <div
                  style={{
                    position: "absolute",
                    top: 20,
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    backgroundColor: "#1a7f4c",
                    border: "3px solid #1a1a1a",
                    boxShadow: "0 0 0 2px #1a7f4c",
                    zIndex: 2,
                  }}
                />

                {/* Card */}
                <div
                  style={{
                    backgroundColor: "#242424",
                    border: "1px solid #333",
                    borderRadius: 4,
                    padding: "24px 20px",
                    transition: "border-color 0.3s ease, transform 0.3s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "#1a7f4c";
                    e.currentTarget.style.transform = "translateY(-4px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "#333";
                    e.currentTarget.style.transform = "translateY(0)";
                  }}
                >
                  <span
                    style={{
                      fontFamily: "'Knockout HTF68', sans-serif",
                      fontSize: 32,
                      fontWeight: 400,
                      color: "#1a7f4c",
                      display: "block",
                      marginBottom: 8,
                      lineHeight: 1,
                    }}
                  >
                    {item.year}
                  </span>
                  <h4
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: "#fff",
                      marginBottom: 8,
                    }}
                  >
                    {item.title}
                  </h4>
                  <p style={{ fontSize: 13, lineHeight: 1.6, color: "#888" }}>
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          5) DIFERENCIAIS — grid
         ═══════════════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#fff", padding: "80px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div className="text-center" style={{ marginBottom: 48 }}>
              <span
                style={{
                  display: "inline-block",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  color: "#FF6A00",
                  marginBottom: 12,
                }}
              >
                Diferenciais
              </span>
              <h2
                style={{
                  fontFamily: "'Knockout HTF68', sans-serif",
                  fontSize: "clamp(28px, 3vw, 36px)",
                  fontWeight: 400,
                  lineHeight: 1.15,
                  textTransform: "uppercase",
                  color: "#1a1a1a",
                }}
              >
                Por que a Gaiatec Sistemas
              </h2>
            </div>
          </AnimateOnScroll>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {diferenciais.map((d, i) => (
              <AnimateOnScroll key={d.title} delay={i * 0.08}>
                <div
                  style={{
                    backgroundColor: "#fff",
                    border: "1px solid #e5e5e5",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                    borderRadius: 4,
                    padding: "28px 24px",
                    height: "100%",
                    transition: "box-shadow 0.3s ease, transform 0.3s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.12)";
                    e.currentTarget.style.transform = "translateY(-4px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)";
                    e.currentTarget.style.transform = "translateY(0)";
                  }}
                >
                  <d.icon size={28} style={{ color: "#FF6A00", marginBottom: 16 }} />
                  <h4
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: "#1a1a1a",
                      marginBottom: 8,
                    }}
                  >
                    {d.title}
                  </h4>
                  <p style={{ fontSize: 13, lineHeight: 1.6, color: "#888" }}>
                    {d.desc}
                  </p>
                </div>
              </AnimateOnScroll>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          6) CTA BANNER — dark bottom section
         ═══════════════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#111", padding: "80px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div className="flex flex-col lg:flex-row items-center justify-between gap-8 text-center lg:text-left">
              <div>
                <h2
                  style={{
                    fontFamily: "'Knockout HTF68', sans-serif",
                    fontSize: "clamp(24px, 3vw, 36px)",
                    fontWeight: 400,
                    lineHeight: 1.2,
                    textTransform: "uppercase",
                    color: "#fff",
                    marginBottom: 8,
                  }}
                >
                  Pronto para transformar sua operacao?
                </h2>
                <p style={{ fontSize: 15, color: "#888", lineHeight: 1.6 }}>
                  Conte com mais de 20 anos de expertise tecnica em solucoes industriais.
                </p>
              </div>

              <div className="flex flex-wrap gap-4 justify-center lg:justify-end">
                <Link
                  to="/contato"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    backgroundColor: "#FF6A00",
                    color: "#000",
                    padding: "14px 32px",
                    fontWeight: 700,
                    fontSize: 13,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    textDecoration: "none",
                    borderRadius: 4,
                    transition: "all 0.3s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#e5b800";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "#FF6A00";
                  }}
                >
                  Solicitar Orcamento <ChevronRight size={14} />
                </Link>
                <Link
                  to="/contato"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    backgroundColor: "transparent",
                    color: "#fff",
                    padding: "14px 32px",
                    fontWeight: 700,
                    fontSize: 13,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    textDecoration: "none",
                    borderRadius: 4,
                    border: "2px solid #444",
                    transition: "all 0.3s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "#FF6A00";
                    e.currentTarget.style.color = "#FF6A00";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "#444";
                    e.currentTarget.style.color = "#fff";
                  }}
                >
                  Fale Conosco <ChevronRight size={14} />
                </Link>
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>
    </>
  );
}
