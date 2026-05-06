import { useMemo } from "react";
import { Link } from "react-router";
import { sectors as FALLBACK_SECTORS } from "../data/sectors";
import { useSetores } from "../hooks/useSiteData";
import { AnimateOnScroll } from "../components/useScrollAnimation";
import { CTABanner } from "../components/CTABanner";
import { ArrowRight } from "lucide-react";

const KNOCKOUT = "'Knockout HTF68', sans-serif";

const HERO_IMG =
  "/images/heroes/1.1.png";

export default function SetoresPage() {
  const { setores: apiSetores } = useSetores();

  const sectors = useMemo(() => {
    if (apiSetores.length === 0) return FALLBACK_SECTORS;
    return apiSetores.map(s => ({
      slug: s.slug,
      title: s.titulo,
      overline: s.overline || "",
      description: s.descricao_curta || "",
      image: s.imagem_url || "/images/industries/5.1.png",
      about: "", aboutExtra: "", stats: [], highlights: [],
      applications: [], products: [], services: [], ctaText: "",
    }));
  }, [apiSetores]);

  /* Split into featured (first 3) and rest */
  const featured = sectors.slice(0, 3);
  const rest = sectors.slice(3);

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
        <div className="absolute inset-0" style={{ background: "linear-gradient(to right, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.2) 50%, transparent 100%)" }} />
        <div
          className="relative z-10 flex flex-col justify-end h-full"
          style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px 100px 30px" }}
        >
          <span style={{ display: "inline-block", fontSize: 13, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#FF6A00", marginBottom: 16 }}>
            SETORES DE ATUAÇÃO
          </span>
          <h1 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(41px, 6vw, 85px)", fontWeight: 500, lineHeight: 0.95, textTransform: "uppercase", color: "#fff", maxWidth: 800, margin: 0 }}>
            Soluções para Cada Setor Industrial
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
          2) INTRO
         ═══════════════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#fff", paddingTop: 0, paddingBottom: 80 }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-24 items-start">
              <div>
                <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#FF6A00", marginBottom: 20 }}>
                  ATUAÇÃO MULTISSETORIAL
                </span>
                <h2 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(32px, 4vw, 52px)", fontWeight: 500, lineHeight: 1, textTransform: "uppercase", marginBottom: 28, color: "#111" }}>
                  {sectors.length} Setores de Atuação
                </h2>
              </div>
              <div>
                <p style={{ fontSize: 17, lineHeight: 1.8, color: "#555", marginBottom: 24 }}>
                  A Gaiatec Sistemas atua com instrumentação, automação e controle de processos em mais de 11 setores industriais. Cada setor tem suas particularidades técnicas, normativas e operacionais — e nós entendemos cada uma delas.
                </p>
                <p style={{ fontSize: 17, lineHeight: 1.8, color: "#555" }}>
                  De saneamento a petróleo, de agronegócio a salas limpas: nossas soluções são dimensionadas para a realidade de cada operação.
                </p>
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          3) FEATURED SECTORS — large hero cards
         ═══════════════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#000", padding: "100px 0" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div style={{ marginBottom: 60 }}>
              <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#FF6A00", marginBottom: 16 }}>
                PRINCIPAIS SETORES
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
                  to={`/setores/${s.slug}`}
                  className="block group"
                  style={{ position: "relative", overflow: "hidden", aspectRatio: "3/4" }}
                >
                  <div
                    style={{ position: "absolute", inset: 0, backgroundImage: `url(${s.image})`, backgroundSize: "cover", backgroundPosition: "center", transition: "transform 0.6s ease" }}
                    className="group-hover:scale-110"
                  />
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0.1) 100%)" }} />

                  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "32px" }}>
                    <span style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#FF6A00", marginBottom: 12 }}>
                      {s.overline}
                    </span>
                    <h3 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(24px, 2.5vw, 32px)", fontWeight: 500, lineHeight: 1.05, textTransform: "uppercase", color: "#fff", marginBottom: 12, transition: "color 0.3s" }} className="group-hover:text-[#FF6A00]">
                      {s.title}
                    </h3>
                    <p style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(255,255,255,0.5)", marginBottom: 16, maxHeight: 44, overflow: "hidden" }}>
                      {s.description}
                    </p>
                    <div
                      style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700, color: "#FF6A00", textTransform: "uppercase", letterSpacing: "0.1em" }}
                    >
                      Ver setor <ArrowRight size={14} />
                    </div>
                  </div>

                  <div
                    style={{ position: "absolute", bottom: 0, left: 0, width: "0%", height: 4, backgroundColor: "#FF6A00", transition: "width 0.4s ease" }}
                    className="group-hover:w-full"
                  />
                </Link>
              </AnimateOnScroll>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          4) ALL SECTORS GRID — remaining sectors
         ═══════════════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#fff", padding: "100px 0" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div style={{ marginBottom: 60 }}>
              <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#FF6A00", marginBottom: 16 }}>
                TODOS OS SETORES
              </span>
              <h2 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 500, lineHeight: 1, textTransform: "uppercase", color: "#111" }}>
                Explore Cada Setor
              </h2>
            </div>
          </AnimateOnScroll>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0" style={{ borderTop: "1px solid #e0e0e0", borderLeft: "1px solid #e0e0e0" }}>
            {rest.map((s, i) => (
              <AnimateOnScroll key={s.slug} delay={i * 0.06}>
                <Link
                  to={`/setores/${s.slug}`}
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
                    <span style={{ display: "block", fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#FF6A00", marginBottom: 10 }}>
                      {s.overline}
                    </span>
                    <h4 style={{ fontFamily: KNOCKOUT, fontSize: 22, fontWeight: 500, color: "#111", textTransform: "uppercase", lineHeight: 1.1, marginBottom: 10, transition: "color 0.3s" }} className="group-hover:text-[#FF6A00]">
                      {s.title.length > 55 ? s.title.substring(0, 55) + "..." : s.title}
                    </h4>
                    <p style={{ fontSize: 14, lineHeight: 1.6, color: "#999", marginBottom: 16, maxHeight: 44, overflow: "hidden" }}>
                      {s.description}
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#FF6A00", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      Ver setor <ArrowRight size={12} />
                    </div>
                  </div>
                </Link>
              </AnimateOnScroll>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          5) STATS BAR
         ═══════════════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#111", padding: "60px 0" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { value: String(sectors.length), label: "Setores de Atuação" },
              { value: "+20", label: "Anos de Experiência" },
              { value: "BR", label: "Atendimento Nacional" },
            ].map((s, i) => (
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
          6) CTA
         ═══════════════════════════════════════════════════ */}
      <CTABanner
        text="Não encontrou o seu setor? A Gaiatec Sistemas atende qualquer processo industrial que demande instrumentação, automação ou controle."
        primaryLabel="Fale com um Especialista"
      />
    </>
  );
}
