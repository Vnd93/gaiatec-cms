import { Link } from "react-router";
import { useMemo } from "react";
import { services as FALLBACK_SERVICES, type Service } from "../data/services";
import { useServicos } from "../hooks/useSiteData";
import { AnimateOnScroll } from "../components/useScrollAnimation";
import { CTABanner } from "../components/CTABanner";
import { ArrowRight } from "lucide-react";

const KNOCKOUT = "'Knockout HTF68', sans-serif";

const HERO_IMG =
  "/images/heroes/1.1.png";

export default function ServicosPage() {
  const { servicos, loading } = useServicos();

  // Map API data → component shape, fallback to static data
  const services: Service[] = useMemo(() => {
    if (servicos.length === 0) return FALLBACK_SERVICES;
    return servicos.map((s) => ({
      slug: s.slug,
      title: s.titulo,
      overline: s.overline,
      shortDesc: s.descricao_curta,
      image: s.imagem_url,
      fullDesc: "",
      includes: [],
    }));
  }, [servicos]);

  const featured = services.filter((s, i) => {
    // If API data has `destaque`, use it; otherwise first 3
    const apiItem = servicos.find((a) => a.slug === s.slug);
    return apiItem ? apiItem.destaque : i < 3;
  }).slice(0, 3);

  const featuredSlugs = new Set(featured.map((s) => s.slug));
  const rest = services.filter((s) => !featuredSlugs.has(s.slug));

  return (
    <>
      {/* ═══════════════════════════════════════════════════
          1) HERO
         ═══════════════════════════════════════════════════ */}
      <section className="relative w-full overflow-hidden" style={{ height: 772 }}>
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${HERO_IMG})`, transform: "scale(1.05)", transition: "transform 8s ease-out" }}
        />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to right, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.25) 50%, transparent 100%)" }} />
        <div
          className="relative z-10 flex flex-col justify-end h-full"
          style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px 100px 30px" }}
        >
          <span style={{ display: "inline-block", fontSize: 13, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#0057DE", marginBottom: 16 }}>
            SERVIÇOS TÉCNICOS
          </span>
          <h1 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(41px, 6vw, 85px)", fontWeight: 500, lineHeight: 0.95, textTransform: "uppercase", color: "#fff", maxWidth: 800, margin: 0 }}>
            Serviços Técnicos Especializados
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.6, color: "rgba(255,255,255,0.7)", maxWidth: 600, marginTop: 24 }}>
            Da calibração acreditada RBC à automação industrial completa — soluções técnicas com rastreabilidade, precisão e suporte de especialistas.
          </p>
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
          2) INTRO
         ═══════════════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#fff", paddingTop: 0, paddingBottom: 80 }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-24 items-start">
              <div>
                <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#0057DE", marginBottom: 20 }}>
                  PORTFÓLIO COMPLETO
                </span>
                <h2 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(32px, 4vw, 52px)", fontWeight: 500, lineHeight: 1, textTransform: "uppercase", marginBottom: 28, color: "#111" }}>
                  {services.length} Serviços Especializados
                </h2>
              </div>
              <div>
                <p style={{ fontSize: 17, lineHeight: 1.8, color: "#555", marginBottom: 24 }}>
                  A Gaiatec Sistemas oferece um portfólio completo de serviços técnicos para a indústria — da especificação e instalação de instrumentos à automação de processos, calibração metrológica e manutenção contínua.
                </p>
                <p style={{ fontSize: 17, lineHeight: 1.8, color: "#555" }}>
                  Cada serviço é executado por equipe técnica qualificada, com documentação rastreada e conformidade normativa. Mais de 20 anos de experiência em campo garantem a confiabilidade que sua operação exige.
                </p>
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          3) FEATURED SERVICES — large hero cards
         ═══════════════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#000", padding: "100px 0" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div style={{ marginBottom: 60 }}>
              <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#0057DE", marginBottom: 16 }}>
                SERVIÇOS PRINCIPAIS
              </span>
              <h2 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 500, lineHeight: 1, textTransform: "uppercase", color: "#fff" }}>
                Áreas de Destaque
              </h2>
            </div>
          </AnimateOnScroll>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {featured.map((s, i) => (
              <AnimateOnScroll key={s.slug} delay={i * 0.1}>
                <Link
                  to={`/servicos/${s.slug}`}
                  className="block group"
                  style={{ position: "relative", overflow: "hidden", aspectRatio: "3/4" }}
                >
                  <div
                    style={{ position: "absolute", inset: 0, backgroundImage: `url(${s.image})`, backgroundSize: "cover", backgroundPosition: "center", transition: "transform 0.6s ease" }}
                    className="group-hover:scale-110"
                  />
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0.1) 100%)" }} />

                  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "32px" }}>
                    <span style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#0057DE", marginBottom: 12 }}>
                      {s.overline}
                    </span>
                    <h3 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(24px, 2.5vw, 32px)", fontWeight: 500, lineHeight: 1.05, textTransform: "uppercase", color: "#fff", marginBottom: 12, transition: "color 0.3s" }} className="group-hover:text-[#0057DE]">
                      {s.title}
                    </h3>
                    <p style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(255,255,255,0.5)", marginBottom: 16, maxHeight: 44, overflow: "hidden" }}>
                      {s.shortDesc}
                    </p>
                    <div
                      style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700, color: "#0057DE", textTransform: "uppercase", letterSpacing: "0.1em" }}
                    >
                      Ver serviço <ArrowRight size={14} />
                    </div>
                  </div>

                  <div
                    style={{ position: "absolute", bottom: 0, left: 0, width: "0%", height: 4, backgroundColor: "#0057DE", transition: "width 0.4s ease" }}
                    className="group-hover:w-full"
                  />
                </Link>
              </AnimateOnScroll>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          4) ALL SERVICES GRID
         ═══════════════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#fff", padding: "100px 0" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div style={{ marginBottom: 60 }}>
              <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#0057DE", marginBottom: 16 }}>
                TODOS OS SERVIÇOS
              </span>
              <h2 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 500, lineHeight: 1, textTransform: "uppercase", color: "#111" }}>
                Explore Cada Serviço
              </h2>
            </div>
          </AnimateOnScroll>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0" style={{ borderTop: "1px solid #e0e0e0", borderLeft: "1px solid #e0e0e0" }}>
            {rest.map((s, i) => (
              <AnimateOnScroll key={s.slug} delay={i * 0.06}>
                <Link
                  to={`/servicos/${s.slug}`}
                  className="block group"
                  style={{ borderRight: "1px solid #e0e0e0", borderBottom: "1px solid #e0e0e0", transition: "background-color 0.3s", textDecoration: "none" }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#fafafa"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                >
                  {/* Image strip */}
                  <div style={{ width: "100%", height: 200, overflow: "hidden", position: "relative" }}>
                    <div
                      style={{ position: "absolute", inset: 0, backgroundImage: `url(${s.image})`, backgroundSize: "cover", backgroundPosition: "center", transition: "transform 0.6s ease" }}
                      className="group-hover:scale-110"
                    />
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.4) 0%, transparent 60%)" }} />
                  </div>

                  {/* Content */}
                  <div style={{ padding: "28px 28px 32px" }}>
                    <span style={{ display: "block", fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#0057DE", marginBottom: 10 }}>
                      {s.overline}
                    </span>
                    <h4 style={{ fontFamily: KNOCKOUT, fontSize: 22, fontWeight: 500, color: "#111", textTransform: "uppercase", lineHeight: 1.1, marginBottom: 10, transition: "color 0.3s" }} className="group-hover:text-[#0057DE]">
                      {s.title}
                    </h4>
                    <p style={{ fontSize: 14, lineHeight: 1.6, color: "#999", marginBottom: 16, maxHeight: 44, overflow: "hidden" }}>
                      {s.shortDesc}
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#0057DE", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      Ver serviço <ArrowRight size={12} />
                    </div>
                  </div>
                </Link>
              </AnimateOnScroll>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          5) DIFERENCIAIS
         ═══════════════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#111", padding: "80px 0" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div style={{ marginBottom: 60, textAlign: "center" }}>
              <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#0057DE", marginBottom: 16 }}>
                DIFERENCIAIS
              </span>
              <h2 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 500, lineHeight: 1, textTransform: "uppercase", color: "#fff" }}>
                Por que a Gaiatec
              </h2>
            </div>
          </AnimateOnScroll>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { value: "+20", label: "Anos de Experiência", desc: "Portfólio técnico consolidado em múltiplos setores industriais" },
              { value: String(services.length), label: "Serviços Especializados", desc: "Portfólio completo de serviços técnicos para a indústria" },
              { value: "BR", label: "Atendimento Nacional", desc: "Equipe técnica com atuação em todo o território brasileiro" },
            ].map((item, i) => (
              <AnimateOnScroll key={item.label} delay={i * 0.1}>
                <div style={{ textAlign: "center", padding: "24px 16px" }}>
                  <span style={{ fontFamily: KNOCKOUT, fontSize: "clamp(40px, 5vw, 64px)", fontWeight: 500, lineHeight: 1, color: "#0057DE", display: "block", marginBottom: 12 }}>
                    {item.value}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#fff", display: "block", marginBottom: 8 }}>
                    {item.label}
                  </span>
                  <p style={{ fontSize: 13, lineHeight: 1.5, color: "rgba(255,255,255,0.4)" }}>
                    {item.desc}
                  </p>
                </div>
              </AnimateOnScroll>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          6) CTA
         ═══════════════════════════════════════════════════ */}
      <CTABanner
        text="Precisa de um serviço técnico especializado? Fale com nossa equipe de especialistas e receba uma análise técnica gratuita para o seu caso."
        primaryLabel="Solicitar Análise Técnica"
        secondaryLabel="Ver Todos os Produtos"
        secondaryHref="/produtos"
      />
    </>
  );
}
