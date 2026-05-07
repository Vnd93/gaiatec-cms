import { useMemo } from "react";
import { useParams, Navigate, Link } from "react-router";
import { getServiceBySlug, services as FALLBACK_SERVICES, type Service } from "../data/services";
import { useServico, useServicos } from "../hooks/useSiteData";
import { AnimateOnScroll } from "../components/useScrollAnimation";
import { CTABanner } from "../components/CTABanner";
import { ArrowRight } from "lucide-react";
import { SEO, buildBreadcrumb, buildServiceSchema } from "../components/SEO";

const KNOCKOUT = "'Knockout HTF68', sans-serif";

export default function ServicoPage() {
  const { slug } = useParams();
  const { servico, loading } = useServico(slug || "");
  const { servicos } = useServicos();

  // Map API detail → component shape, fallback to static data
  const service: Service | undefined = useMemo(() => {
    if (!servico) return getServiceBySlug(slug || "");
    return {
      slug: servico.slug,
      title: servico.titulo,
      overline: servico.overline,
      shortDesc: servico.descricao_curta,
      fullDesc: servico.descricao_completa ?? "",
      image: servico.imagem_hero_url || servico.imagem_url,
      includes: servico.inclui ?? [],
      sectors: (servico as Record<string, unknown>).setores_relacionados as string[] | undefined,
      norms: (servico as Record<string, unknown>).normas as string[] | undefined,
      extra:
        (servico as Record<string, unknown>).extra_label && (servico as Record<string, unknown>).extra_items
          ? {
              label: (servico as Record<string, unknown>).extra_label as string,
              items: (servico as Record<string, unknown>).extra_items as string[],
            }
          : undefined,
    };
  }, [servico, slug]);

  if (!loading && !service) return <Navigate to="/servicos" replace />;

  // While loading with no cached data, show fallback or nothing
  if (loading && !service) {
    const fallback = getServiceBySlug(slug || "");
    if (!fallback) return <Navigate to="/servicos" replace />;
    // Will re-render when API data arrives; for now render with fallback
  }

  // Safe — at this point service is defined (either API or fallback)
  const svc = service ?? getServiceBySlug(slug || "")!;

  /* Other services for cross-links (exclude current) */
  const related = useMemo(() => {
    if (servicos.length > 0) {
      return servicos
        .filter((s) => s.slug !== svc.slug)
        .slice(0, 3)
        .map((s) => ({
          slug: s.slug,
          title: s.titulo,
          overline: s.overline,
          shortDesc: s.descricao_curta,
          image: s.imagem_url,
          fullDesc: "",
          includes: [],
        }));
    }
    return FALLBACK_SERVICES.filter((s) => s.slug !== svc.slug).slice(0, 3);
  }, [servicos, svc.slug]);

  return (
    <>
      <SEO
        title={svc.title}
        description={svc.shortDesc}
        path={`/servicos/${svc.slug}`}
        image={svc.image}
        keywords={[svc.title, svc.overline, "Gaiatec", "serviços técnicos"].filter(Boolean).join(", ")}
        schema={[
          buildServiceSchema({
            name: svc.title,
            description: svc.fullDesc || svc.shortDesc,
            image: svc.image,
          }),
          buildBreadcrumb([
            { label: "Início", path: "/" },
            { label: "Serviços", path: "/servicos" },
            { label: svc.title, path: `/servicos/${svc.slug}` },
          ]),
        ]}
      />

      {/* ═══════════════════════════════════════════════════
          0) BREADCRUMB (Início > Serviços > [Nome])
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
              <Link to="/servicos" className="hover:text-[#0057DE] transition-colors">
                Serviços
              </Link>
            </li>
            <li className="text-slate-300">/</li>
            <li className="text-slate-900 font-medium truncate max-w-[200px] md:max-w-none">
              {svc.title}
            </li>
          </ol>
        </div>
      </nav>

      {/* ═══════════════════════════════════════════════════
          1) HERO
         ═══════════════════════════════════════════════════ */}
      <section className="relative w-full overflow-hidden" style={{ height: 600 }}>
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${svc.image})`, transform: "scale(1.05)", transition: "transform 8s ease-out" }}
        />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to right, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 50%, transparent 100%)" }} />
        <div
          className="relative z-10 flex flex-col justify-end h-full"
          style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px 80px 30px" }}
        >
          <span style={{ display: "inline-block", fontSize: 13, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#0057DE", marginBottom: 16 }}>
            {svc.overline}
          </span>
          <h1 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(36px, 5vw, 72px)", fontWeight: 500, lineHeight: 0.95, textTransform: "uppercase", color: "#fff", maxWidth: 700, margin: 0 }}>
            {svc.title}
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
          2) ABOUT — two columns: text + image
         ═══════════════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#fff", paddingTop: 0, paddingBottom: 100 }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-16 lg:gap-24 items-center">
              <div>
                <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#0057DE", marginBottom: 20 }}>
                  SOBRE O SERVIÇO
                </span>
                <h2 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(32px, 4vw, 52px)", fontWeight: 500, lineHeight: 1, textTransform: "uppercase", marginBottom: 28, color: "#111" }}>
                  {svc.title}
                </h2>
                {svc.fullDesc.split("\n\n").map((p, i) => (
                  <p key={i} style={{ fontSize: 17, lineHeight: 1.8, color: "#555", marginBottom: 24 }}>
                    {p}
                  </p>
                ))}
                <Link
                  to="/contato"
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, border: "2px solid #0057DE", color: "#0057DE", padding: "14px 32px", fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.08em", textDecoration: "none", transition: "all 0.3s ease" }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#0057DE"; e.currentTarget.style.color = "#000"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#0057DE"; }}
                >
                  Solicitar Orçamento <ArrowRight size={14} />
                </Link>
              </div>
              <div className="relative overflow-hidden">
                <img loading="lazy" src={svc.image} alt={svc.title} className="w-full object-cover" style={{ aspectRatio: "4/3", display: "block" }} />
                <div style={{ position: "absolute", bottom: 0, left: 0, width: "100%", height: 4, backgroundColor: "#0057DE" }} />
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          3) O QUE INCLUI — numbered list
         ═══════════════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#0a0a0a", padding: "100px 0", position: "relative", overflow: "hidden" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-16 lg:gap-24">
              {/* Left — sticky title */}
              <div style={{ position: "sticky", top: 120, alignSelf: "start" }}>
                <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#0057DE", marginBottom: 16 }}>
                  ESCOPO DO SERVIÇO
                </span>
                <h2 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 500, lineHeight: 1, textTransform: "uppercase", color: "#fff", marginBottom: 24 }}>
                  O Que Inclui
                </h2>
                <p style={{ fontSize: 16, lineHeight: 1.8, color: "rgba(255,255,255,0.5)", maxWidth: 400 }}>
                  {svc.shortDesc}
                </p>
              </div>

              {/* Right — numbered items */}
              <div>
                {svc.includes.map((item, i) => (
                  <AnimateOnScroll key={i} delay={i * 0.05}>
                    <div style={{ display: "flex", gap: 24, padding: "28px 0", borderBottom: i < svc.includes.length - 1 ? "1px solid rgba(255,255,255,0.08)" : "none" }}>
                      <span style={{ fontFamily: KNOCKOUT, fontSize: 42, fontWeight: 500, color: "#0057DE", lineHeight: 1, flexShrink: 0, width: 60 }}>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div style={{ paddingTop: 6 }}>
                        <span style={{ fontSize: 16, lineHeight: 1.6, color: "rgba(255,255,255,0.8)", fontWeight: 500 }}>
                          {item}
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
          4) EXTRA INFO (techniques, modalities, plans, etc.)
         ═══════════════════════════════════════════════════ */}
      {(svc.extra || svc.norms || svc.sectors) && (
        <section style={{ backgroundColor: "#fff", padding: "100px 0" }}>
          <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
              {/* Extra block */}
              {svc.extra && (
                <AnimateOnScroll>
                  <div>
                    <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#0057DE", marginBottom: 16 }}>
                      {svc.extra.label.toUpperCase()}
                    </span>
                    <div style={{ borderTop: "1px solid #e0e0e0" }}>
                      {svc.extra.items.map((item, i) => (
                        <div key={i} style={{ padding: "16px 0", borderBottom: "1px solid #e0e0e0", display: "flex", gap: 16, alignItems: "flex-start" }}>
                          <span style={{ fontFamily: KNOCKOUT, fontSize: 20, fontWeight: 500, color: "#0057DE", flexShrink: 0, width: 28, lineHeight: 1.4 }}>
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <span style={{ fontSize: 15, lineHeight: 1.6, color: "#555" }}>
                            {item}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </AnimateOnScroll>
              )}

              {/* Norms block */}
              {svc.norms && (
                <AnimateOnScroll delay={0.1}>
                  <div>
                    <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#0057DE", marginBottom: 16 }}>
                      NORMAS E REFERÊNCIAS
                    </span>
                    <div style={{ borderTop: "1px solid #e0e0e0" }}>
                      {svc.norms.map((norm, i) => (
                        <div key={i} style={{ padding: "16px 0", borderBottom: "1px solid #e0e0e0" }}>
                          <span style={{ fontSize: 15, lineHeight: 1.6, color: "#111", fontWeight: 600 }}>
                            {norm}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </AnimateOnScroll>
              )}

              {/* Sectors block */}
              {svc.sectors && (
                <AnimateOnScroll delay={0.2}>
                  <div>
                    <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#0057DE", marginBottom: 16 }}>
                      INDÚSTRIAS ATENDIDAS
                    </span>
                    <div style={{ borderTop: "1px solid #e0e0e0" }}>
                      {svc.sectors.map((sector, i) => (
                        <div key={i} style={{ padding: "16px 0", borderBottom: "1px solid #e0e0e0" }}>
                          <span style={{ fontSize: 15, lineHeight: 1.6, color: "#555" }}>
                            {sector}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </AnimateOnScroll>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════
          5) OUTROS SERVIÇOS — cross-links
         ═══════════════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#f8fafc", padding: "100px 0" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div style={{ marginBottom: 60 }}>
              <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#0057DE", marginBottom: 16 }}>
                EXPLORE TAMBÉM
              </span>
              <h2 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 500, lineHeight: 1, textTransform: "uppercase", color: "#fff" }}>
                Outros Serviços
              </h2>
            </div>
          </AnimateOnScroll>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {related.map((s, i) => (
              <AnimateOnScroll key={s.slug} delay={i * 0.1}>
                <Link
                  to={`/servicos/${s.slug}`}
                  className="block group"
                  style={{ position: "relative", overflow: "hidden", aspectRatio: "16/10" }}
                >
                  <div
                    style={{ position: "absolute", inset: 0, backgroundImage: `url(${s.image})`, backgroundSize: "cover", backgroundPosition: "center", transition: "transform 0.6s ease" }}
                    className="group-hover:scale-110"
                  />
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.1) 100%)" }} />

                  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "28px" }}>
                    <span style={{ display: "block", fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#0057DE", marginBottom: 8 }}>
                      {s.overline}
                    </span>
                    <h3 style={{ fontFamily: KNOCKOUT, fontSize: 24, fontWeight: 500, lineHeight: 1.05, textTransform: "uppercase", color: "#fff", marginBottom: 8, transition: "color 0.3s" }} className="group-hover:text-[#0057DE]">
                      {s.title}
                    </h3>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: "#0057DE", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      Ver serviço <ArrowRight size={12} />
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

          <AnimateOnScroll delay={0.3}>
            <div style={{ textAlign: "center", marginTop: 48 }}>
              <Link
                to="/servicos"
                style={{ display: "inline-flex", alignItems: "center", gap: 8, border: "2px solid #0057DE", color: "#0057DE", padding: "14px 32px", fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.08em", textDecoration: "none", transition: "all 0.3s ease" }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#0057DE"; e.currentTarget.style.color = "#000"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#0057DE"; }}
              >
                Ver Todos os Serviços <ArrowRight size={14} />
              </Link>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          6) CTA
         ═══════════════════════════════════════════════════ */}
      <CTABanner
        text={`Precisa de ${svc.title.toLowerCase()}? Nossa equipe técnica está pronta para apresentar a melhor solução para a sua operação.`}
        primaryLabel="Fale com um Especialista"
        secondaryLabel="Solicitar Proposta"
      />
    </>
  );
}
