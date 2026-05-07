import { useMemo } from "react";
import { useParams, Navigate, Link } from "react-router";
import { getSectorBySlug, sectors } from "../data/sectors";
import { useSetor, useSetores } from "../hooks/useSiteData";
import { PageHero } from "../components/PageHero";
import { CTABanner } from "../components/CTABanner";
import { AnimateOnScroll } from "../components/useScrollAnimation";
import { ArrowRight, ChevronRight } from "lucide-react";

const KNOCKOUT = "'Knockout HTF68', sans-serif";

export default function SectorPage() {
  const { slug } = useParams();
  const { setor: apiSetor, loading } = useSetor(slug || "");
  const { setores: apiSetores } = useSetores();
  const fallback = getSectorBySlug(slug || "");

  const sector = useMemo(() => {
    if (apiSetor) {
      return {
        slug: apiSetor.slug,
        title: apiSetor.titulo,
        overline: apiSetor.overline || "",
        description: apiSetor.descricao_curta || "",
        image: apiSetor.imagem_url || "/images/industries/5.1.png",
        about: apiSetor.descricao_sobre || "",
        aboutExtra: apiSetor.descricao_extra || undefined,
        stats: (apiSetor.stats as Array<{ value: string; label: string }>) || [],
        highlights: (apiSetor.destaques as Array<{ title: string; desc: string }>) || [],
        applications: apiSetor.aplicacoes || [],
        products: (apiSetor.produtos_relacionados as Array<{ category: string; items: string }>) || [],
        services: apiSetor.servicos_relacionados || [],
        ctaText: apiSetor.cta_texto || "",
      };
    }
    return fallback;
  }, [apiSetor, fallback]);

  // Use API setores for "other sectors" section, fallback to static
  const allSectors = useMemo(() => {
    if (apiSetores.length > 0) {
      return apiSetores.map(s => ({
        slug: s.slug, title: s.titulo, overline: s.overline || "",
        description: s.descricao_curta || "",
        image: s.imagem_url || "/images/industries/5.1.png",
      }));
    }
    return sectors.map(s => ({ slug: s.slug, title: s.title, overline: s.overline, description: s.description, image: s.image }));
  }, [apiSetores]);

  if (!sector && !loading) return <Navigate to="/" replace />;
  if (!sector) return null;

  return (
    <>
      {/* ═══════════════════════════════════════════════════
          0) BREADCRUMB (Indústrias > [Nome])
         ═══════════════════════════════════════════════════ */}
      <nav
        aria-label="Breadcrumb"
        className="bg-slate-50 border-b border-slate-200"
      >
        <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-3 text-sm">
          <ol className="flex items-center gap-2 text-slate-500">
            <li>
              <Link to="/" className="hover:text-[#0057DE] transition-colors">
                Início
              </Link>
            </li>
            <li className="text-slate-300">/</li>
            <li>
              <Link to="/setores" className="hover:text-[#0057DE] transition-colors">
                Indústrias
              </Link>
            </li>
            <li className="text-slate-300">/</li>
            <li className="text-slate-900 font-medium truncate max-w-[200px] md:max-w-none">
              {sector.overline || sector.title}
            </li>
          </ol>
        </div>
      </nav>

      {/* ═══════════════════════════════════════════════════
          1) HERO
         ═══════════════════════════════════════════════════ */}
      <PageHero
        overline={sector.overline}
        title={sector.title}
        image={sector.image}
      />

      {/* ═══════════════════════════════════════════════════
          2) ABOUT — asymmetric two columns with image
         ═══════════════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#fff", paddingTop: 0, paddingBottom: 100 }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-16 lg:gap-24 items-center">
              <div>
                <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#0057DE", marginBottom: 20 }}>
                  SOBRE O SETOR
                </span>
                <h2 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(32px, 4vw, 52px)", fontWeight: 500, lineHeight: 1, textTransform: "uppercase", marginBottom: 28, color: "#111" }}>
                  {sector.overline}
                </h2>
                <p style={{ fontSize: 17, lineHeight: 1.8, color: "#555", marginBottom: 24 }}>
                  {sector.about}
                </p>
                {sector.aboutExtra && (
                  <p style={{ fontSize: 17, lineHeight: 1.8, color: "#555", marginBottom: 36 }}>
                    {sector.aboutExtra}
                  </p>
                )}
                {!sector.aboutExtra && <div style={{ marginBottom: 36 }} />}
                <Link
                  to="/contato"
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, border: "2px solid #0057DE", color: "#0057DE", padding: "14px 32px", fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.08em", textDecoration: "none", transition: "all 0.3s ease" }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#0057DE"; e.currentTarget.style.color = "#000"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#0057DE"; }}
                >
                  Fale com um Especialista <ArrowRight size={14} />
                </Link>
              </div>
              <div className="relative overflow-hidden">
                <img loading="lazy" src={sector.image} alt={sector.overline} className="w-full object-cover" style={{ aspectRatio: "4/3", display: "block" }} />
                <div style={{ position: "absolute", bottom: 0, left: 0, width: "100%", height: 4, backgroundColor: "#0057DE" }} />
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          3) STATS BAR — unique per sector
         ═══════════════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#f8fafc", padding: "60px 0", borderTop: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {sector.stats.map((s, i) => (
              <AnimateOnScroll key={s.label} delay={i * 0.1}>
                <div style={{ textAlign: "center" }}>
                  <span style={{ fontFamily: KNOCKOUT, fontSize: "clamp(40px, 5vw, 64px)", fontWeight: 500, lineHeight: 1, color: "#0057DE", display: "block" }}>
                    {s.value}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#475569", marginTop: 8, display: "block" }}>
                    {s.label}
                  </span>
                </div>
              </AnimateOnScroll>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          4) HIGHLIGHTS — 3 unique differentials per sector
         ═══════════════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#fff", padding: "100px 0" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div style={{ maxWidth: 600, marginBottom: 60 }}>
              <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#0057DE", marginBottom: 16 }}>
                DIFERENCIAIS
              </span>
              <h2 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 500, lineHeight: 1, textTransform: "uppercase", color: "#111" }}>
                Por que a Gaiatec em {sector.overline}
              </h2>
            </div>
          </AnimateOnScroll>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-0" style={{ borderTop: "1px solid #e0e0e0", borderLeft: "1px solid #e0e0e0" }}>
            {sector.highlights.map((h, i) => (
              <AnimateOnScroll key={h.title} delay={i * 0.1}>
                <div
                  style={{ padding: "40px 32px", borderRight: "1px solid #e0e0e0", borderBottom: "1px solid #e0e0e0", height: "100%", transition: "background-color 0.3s", cursor: "default" }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#fafafa"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                >
                  <span style={{ fontFamily: KNOCKOUT, fontSize: 48, fontWeight: 500, color: "rgba(0,87,222,0.15)", lineHeight: 1, display: "block", marginBottom: 20 }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h4 style={{ fontFamily: KNOCKOUT, fontSize: 24, fontWeight: 500, color: "#111", marginBottom: 14, textTransform: "uppercase", lineHeight: 1.1 }}>
                    {h.title}
                  </h4>
                  <p style={{ fontSize: 15, lineHeight: 1.7, color: "#777" }}>
                    {h.desc}
                  </p>
                </div>
              </AnimateOnScroll>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          5) APLICAÇÕES — two-column sticky layout
         ═══════════════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#f8fafc", padding: "100px 0", position: "relative", overflow: "hidden" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-16 lg:gap-24">
              {/* Left — sticky title */}
              <div style={{ position: "sticky", top: 120, alignSelf: "start" }}>
                <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#0057DE", marginBottom: 16 }}>
                  APLICAÇÕES
                </span>
                <h2 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 500, lineHeight: 1, textTransform: "uppercase", color: "#0f172a", marginBottom: 24 }}>
                  {`Aplicações em ${sector.overline}`}
                </h2>
                <p style={{ fontSize: 16, lineHeight: 1.8, color: "#64748b", maxWidth: 400 }}>
                  {sector.description}
                </p>
              </div>

              {/* Right — numbered steps */}
              <div>
                {sector.applications.map((app, i) => (
                  <AnimateOnScroll key={i} delay={i * 0.05}>
                    <div style={{ display: "flex", gap: 24, padding: "28px 0", borderBottom: i < sector.applications.length - 1 ? "1px solid #e2e8f0" : "none" }}>
                      <span style={{ fontFamily: KNOCKOUT, fontSize: 42, fontWeight: 500, color: "#0057DE", lineHeight: 1, flexShrink: 0, width: 60 }}>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div style={{ paddingTop: 6 }}>
                        <span style={{ fontSize: 16, lineHeight: 1.6, color: "#334155", fontWeight: 500 }}>
                          {app}
                        </span>
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
          6) PRODUTOS — premium card grid
         ═══════════════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#fff", padding: "100px 0" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6" style={{ marginBottom: 60 }}>
              <div>
                <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#0057DE", marginBottom: 16 }}>
                  PRODUTOS
                </span>
                <h2 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 500, lineHeight: 1, textTransform: "uppercase", color: "#111" }}>
                  {`Produtos para ${sector.overline}`}
                </h2>
              </div>
              <Link
                to="/produtos"
                style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: "#111", textDecoration: "none", textTransform: "uppercase", letterSpacing: "0.08em", transition: "color 0.3s", flexShrink: 0 }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "#0057DE"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "#111"; }}
              >
                Ver catálogo completo <ArrowRight size={14} />
              </Link>
            </div>
          </AnimateOnScroll>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sector.products.map((prod, i) => (
              <AnimateOnScroll key={prod.category} delay={i * 0.08}>
                <div
                  style={{ backgroundColor: "#f7f7f7", padding: "36px 28px", height: "100%", transition: "all 0.3s", cursor: "default", borderBottom: "3px solid transparent", position: "relative" }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderBottomColor = "#0057DE"; e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 12px 40px rgba(0,0,0,0.08)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderBottomColor = "transparent"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
                >
                  <span style={{ fontFamily: KNOCKOUT, fontSize: 42, fontWeight: 500, color: "rgba(0,87,222,0.12)", lineHeight: 1, display: "block", marginBottom: 16 }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h4 style={{ fontFamily: KNOCKOUT, fontSize: 22, fontWeight: 500, color: "#111", marginBottom: 12, textTransform: "uppercase", lineHeight: 1.1 }}>
                    {prod.category}
                  </h4>
                  <p style={{ fontSize: 14, lineHeight: 1.7, color: "#777" }}>
                    {prod.items}
                  </p>
                </div>
              </AnimateOnScroll>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          7) SERVIÇOS — horizontal strip
         ═══════════════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#ffffff", padding: "80px 0", borderTop: "1px solid #e2e8f0" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div className="flex flex-col lg:flex-row lg:items-center gap-12">
              <div style={{ flexShrink: 0, maxWidth: 360 }}>
                <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#0057DE", marginBottom: 16 }}>
                  SERVIÇOS
                </span>
                <h2 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(28px, 3.5vw, 40px)", fontWeight: 500, lineHeight: 1, textTransform: "uppercase", color: "#0f172a" }}>
                  Serviços Aplicáveis
                </h2>
              </div>
              <div className="flex flex-wrap gap-4 flex-1">
                {sector.services.map((srv, i) => (
                  <AnimateOnScroll key={srv} delay={i * 0.08}>
                    <Link
                      to="/contato"
                      style={{ display: "inline-flex", alignItems: "center", gap: 10, border: "1px solid #e2e8f0", color: "#334155", backgroundColor: "#f8fafc", padding: "16px 24px", fontSize: 14, fontWeight: 600, textDecoration: "none", transition: "all 0.3s", borderRadius: 8 }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#0057DE"; e.currentTarget.style.color = "#0057DE"; e.currentTarget.style.backgroundColor = "#ffffff"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.color = "#334155"; e.currentTarget.style.backgroundColor = "#f8fafc"; }}
                    >
                      <ChevronRight size={14} color="#0057DE" />
                      {srv}
                    </Link>
                  </AnimateOnScroll>
                ))}
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          8) OUTRAS INDÚSTRIAS — image cards with overlay
         ═══════════════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#f8fafc", padding: "100px 0", borderTop: "1px solid #e2e8f0" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6" style={{ marginBottom: 60 }}>
              <div>
                <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#0057DE", marginBottom: 16 }}>
                  OUTRAS INDÚSTRIAS
                </span>
                <h2 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 500, lineHeight: 1, textTransform: "uppercase", color: "#0f172a" }}>
                  Explore Mais Indústrias
                </h2>
              </div>
              <Link
                to="/setores"
                style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: "#0057DE", textDecoration: "none", textTransform: "uppercase", letterSpacing: "0.08em", transition: "color 0.3s", flexShrink: 0 }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "#0046b3"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "#0057DE"; }}
              >
                Ver todas as indústrias <ArrowRight size={14} />
              </Link>
            </div>
          </AnimateOnScroll>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {allSectors
              .filter((s) => s.slug !== slug)
              .slice(0, 8)
              .map((s, i) => (
                <AnimateOnScroll key={s.slug} delay={i * 0.06}>
                  <Link to={`/setores/${s.slug}`} className="block group" style={{ position: "relative", overflow: "hidden", aspectRatio: "3/4" }}>
                    <div
                      style={{ position: "absolute", inset: 0, backgroundImage: `url(${s.image})`, backgroundSize: "cover", backgroundPosition: "center", transition: "transform 0.6s ease" }}
                      className="group-hover:scale-110"
                    />
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.1) 100%)" }} />
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 24 }}>
                      <span style={{ display: "block", fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#0057DE", marginBottom: 8 }}>
                        {s.overline}
                      </span>
                      <span style={{ display: "block", fontSize: 16, fontWeight: 600, color: "#fff", lineHeight: 1.3, transition: "color 0.3s" }} className="group-hover:text-[#0057DE]">
                        {s.title.length > 60 ? s.title.substring(0, 60) + "..." : s.title}
                      </span>
                      <div
                        style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, fontSize: 11, fontWeight: 700, color: "#0057DE", textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0, transform: "translateY(8px)", transition: "all 0.3s ease" }}
                        className="group-hover:opacity-100 group-hover:translate-y-0"
                      >
                        Ver setor <ArrowRight size={12} />
                      </div>
                    </div>
                    <div
                      style={{ position: "absolute", bottom: 0, left: 0, width: "0%", height: 3, backgroundColor: "#0057DE", transition: "width 0.4s ease" }}
                      className="group-hover:w-full"
                    />
                  </Link>
                </AnimateOnScroll>
              ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          9) CTA
         ═══════════════════════════════════════════════════ */}
      <CTABanner
        text={sector.ctaText + " Nossa equipe técnica especializada está pronta para ajudar."}
        primaryLabel={`Fale com um Especialista em ${sector.overline}`}
      />
    </>
  );
}
