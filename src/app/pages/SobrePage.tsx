import { Link } from "react-router";
import { AnimateOnScroll } from "../components/useScrollAnimation";
import { ChevronRight, Award, Shield, CheckCircle, Users, Briefcase, Settings, Target } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSobreContent, type SobreDiferencial } from "../hooks/useSiteData";
import { Timeline } from "../components/sobre/Timeline";
import { SEO } from "../components/SEO";

/* ────────────────────────────────────────────────────────
   IMAGES
   ──────────────────────────────────────────────────────── */
const HERO_IMAGE = "/images/heroes/1.1.png";
const TEAM_IMAGE = "/images/heroes/1.2.png";

/* ────────────────────────────────────────────────────────
   FALLBACK DATA — usado quando o CMS está indisponível ou
   nenhum bloco foi criado. Pedro edita pelo painel ERP em
   /marketing/site → tab Sobre a Gaiatec.
   ──────────────────────────────────────────────────────── */
const FALLBACK_PRINCIPLES = [
  {
    num: "01",
    title: "Missão",
    text: "Desenvolver sistemas e tecnologias inovadoras para atender às necessidades da indústria nacional e internacional, oferecendo soluções completas em controle de gases e fluidos.",
  },
  {
    num: "02",
    title: "Visão",
    text: "Ser referência em soluções tecnológicas para a indústria, reconhecida pela excelência, inovação e compromisso com a satisfação dos clientes.",
  },
  {
    num: "03",
    title: "Valores",
    text: "Qualidade e excelência em produtos e serviços. Inovação contínua em processos e tecnologias. Compromisso com o cliente. Adaptabilidade frente às demandas do mercado.",
  },
];

const FALLBACK_TIMELINE = [
  { year: "2004", title: "Fundação", desc: "Gaiatec Sistemas é fundada com foco em soluções para controle de gases e fluidos na indústria brasileira." },
  { year: "2007", title: "Expansão de Portfólio", desc: "Ampliação do portfólio para atender novos segmentos: petróleo e gás, mineração e agronegócio." },
  { year: "2010", title: "Proteção Catódica", desc: "Estruturação da área de proteção catódica com equipe técnica especializada." },
  { year: "2013", title: "Automação Industrial", desc: "Implantação de projetos de automação industrial e sistemas supervisórios." },
  { year: "2016", title: "Biodigestores", desc: "Início da linha GT-BIODIGEST para biodigestores e aproveitamento de biogás." },
  { year: "2019", title: "Metrologia", desc: "Estruturação da calibração com rastreabilidade metrológica ao INMETRO e boas práticas ISO." },
  { year: "2022", title: "Telemetria e IoT", desc: "Expansão para soluções de telemetria remota, monitoramento IoT e sistemas conectados." },
  { year: "2025", title: "20+ Anos de Mercado", desc: "Mais de 20 anos consolidando expertise técnica em 11 setores industriais no Brasil." },
];

const FALLBACK_DIFERENCIAIS = [
  { iconName: "💼", title: "20+ anos de experiência", desc: "Portfólio técnico amplo e credibilidade de mercado" },
  { iconName: "🎯", title: "11 Indústrias Atendidas", desc: "Atuação transversal na indústria brasileira" },
  { iconName: "👥", title: "Equipe especializada", desc: "Engenheiros e técnicos com expertise em campo" },
  { iconName: "⚙️", title: "Projetos sob medida", desc: "Cada solução dimensionada para a realidade do cliente" },
];

/**
 * Mapeia uma string (emoji ou keyword) para um Lucide Icon. Mantém o
 * design original com ícones nítidos quando possível; se vier emoji
 * direto, renderiza como texto. SobrePage chama isso pra cada
 * diferencial.
 */
function diferencialIcon(d: SobreDiferencial): { Icon: LucideIcon | null; emoji: string | null } {
  const lookup: Record<string, LucideIcon> = {
    award: Award, certificacao: Award, certification: Award, rbc: Award, "🏆": Award,
    shield: Shield, security: Shield, inmetro: Shield, "🛡️": Shield, "🛡": Shield,
    check: CheckCircle, iso: CheckCircle, qualidade: CheckCircle, "✓": CheckCircle, "✔": CheckCircle,
    briefcase: Briefcase, experience: Briefcase, anos: Briefcase, "💼": Briefcase,
    target: Target, setor: Target, "🎯": Target,
    users: Users, equipe: Users, time: Users, "👥": Users,
    settings: Settings, projeto: Settings, custom: Settings, "⚙️": Settings,
  };
  const key = (d.iconName || "").toLowerCase().trim();
  if (lookup[key]) return { Icon: lookup[key], emoji: null };
  // Match by partial keyword (e.g. iconName="award" matches "award")
  for (const k of Object.keys(lookup)) {
    if (key.includes(k)) return { Icon: lookup[k], emoji: null };
  }
  // Fallback: render the raw string (likely an emoji)
  return { Icon: null, emoji: d.iconName || "★" };
}

/* ────────────────────────────────────────────────────────
   COMPONENT
   ──────────────────────────────────────────────────────── */
export default function SobrePage() {
  // Princípios e diferenciais vêm do CMS quando Pedro editar pelo painel
  // /marketing/site → tab Sobre. Caem pros fallbacks acima se a API
  // estiver fora ou os blocos ainda não tiverem sido criados.
  // (Timeline agora é renderizado pelo componente <Timeline> dedicado.)
  const { principles, diferenciais } = useSobreContent({
    principles: FALLBACK_PRINCIPLES,
    timeline: FALLBACK_TIMELINE,
    diferenciais: FALLBACK_DIFERENCIAIS,
  });

  return (
    <>
      <SEO
        title="Sobre a Gaiatec Sistemas"
        description="Há 20+ anos desenvolvendo soluções tecnológicas em instrumentação e automação para indústria brasileira. Linha do tempo com 11 marcos históricos."
        path="/sobre"
        keywords="Gaiatec Sistemas, sobre, história, indústria, instrumentação, automação, rastreabilidade"
        schema={{
          "@context": "https://schema.org",
          "@type": "AboutPage",
          mainEntity: {
            "@type": "Organization",
            name: "Gaiatec Sistemas",
            foundingDate: "2004",
            url: "https://gaiatecsistemas.com.br",
            description: "Soluções tecnológicas em instrumentação industrial desde 2004.",
            address: {
              "@type": "PostalAddress",
              streetAddress: "R. Herói da Força Expedicionária Brasileira, 22",
              addressLocality: "Parque Novo Mundo, São Paulo",
              addressCountry: "BR",
            },
          },
        }}
      />

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
          <span style={{ display: "inline-block", fontSize: 13, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#0057DE", marginBottom: 16 }}>
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
                    color: "#0057DE",
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
                  style={{ width: 80, height: 4, backgroundColor: "#0057DE" }}
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
                  color: "#0057DE",
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
                  <div style={{ height: 4, backgroundColor: "#0057DE" }} />
                  <div style={{ padding: "32px 28px" }}>
                    <span
                      style={{
                        fontFamily: "'Knockout HTF68', sans-serif",
                        fontSize: 48,
                        fontWeight: 400,
                        color: "#0057DE",
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

      {/* ═══════════════════════════════════════════════════
          4) TIMELINE — V2 vertical zigzag (TASK 19)
         ═══════════════════════════════════════════════════ */}
      <Timeline />

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
                  color: "#0057DE",
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
            {diferenciais.map((d, i) => {
              const { Icon, emoji } = diferencialIcon(d);
              return (
              <AnimateOnScroll key={`${d.title}-${i}`} delay={i * 0.08}>
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
                  {Icon ? (
                    <Icon size={28} style={{ color: "#0057DE", marginBottom: 16 }} />
                  ) : (
                    <span style={{ fontSize: 28, color: "#0057DE", marginBottom: 16, display: "block" }}>{emoji}</span>
                  )}
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
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          6) CTA BANNER — dark bottom section
         ═══════════════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#f8fafc", padding: "80px 0" }}>
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
                    backgroundColor: "#0057DE",
                    color: "#fff",
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
                    e.currentTarget.style.backgroundColor = "#0057DE";
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
                    e.currentTarget.style.borderColor = "#0057DE";
                    e.currentTarget.style.color = "#0057DE";
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
