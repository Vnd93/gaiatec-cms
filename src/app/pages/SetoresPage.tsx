import { useMemo } from "react";
import { Link } from "react-router";
import { sectors as FALLBACK_SECTORS } from "../data/sectors";
import { useSetores } from "../hooks/useSiteData";
import { AnimateOnScroll } from "../components/useScrollAnimation";
import { CTABanner } from "../components/CTABanner";
import { SetoresFilterBar } from "../components/setores/SetoresFilterBar";
import { ArrowRight } from "lucide-react";

const KNOCKOUT = "'Knockout HTF68', sans-serif";

/**
 * /setores — Listagem de Indústrias atendidas pela Gaiatec (TASK 8 V2).
 *
 * Estrutura:
 *   1. Hero claro com mosaico 3x3 das indústrias (gradient slate-50 → brand/5)
 *   2. SetoresFilterBar sticky (Ver Todos + 9 botões pílula)
 *   3. Grid de cards detalhados com id="setor-[slug]" para deep-linking
 *   4. CTA final
 *
 * URLs preservadas: /setores e /setores/[slug] (SEO).
 */
export default function SetoresPage() {
  const { setores: apiSetores } = useSetores();

  const sectors = useMemo(() => {
    if (apiSetores.length === 0) return FALLBACK_SECTORS;
    return apiSetores.map((s) => ({
      slug: s.slug,
      title: s.titulo,
      overline: s.overline || "",
      description: s.descricao_curta || "",
      image: s.imagem_url || "/images/industries/5.1.png",
      about: "",
      aboutExtra: "",
      stats: [],
      highlights: [],
      applications: [],
      products: [],
      services: [],
      ctaText: "",
    }));
  }, [apiSetores]);

  // Para o filtro: slug + título curto (sem prefixos)
  const filterItems = sectors.map((s) => ({
    slug: s.slug,
    titulo: s.overline || s.title.split(":")[0],
  }));

  // Mosaico hero: até 9 imagens
  const mosaicImages = sectors.slice(0, 9).map((s) => s.image);

  return (
    <>
      {/* ═══════════════════════════════════════════════════
          1) HERO claro com mosaico
         ═══════════════════════════════════════════════════ */}
      <section
        className="relative w-full overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #f8fafc 0%, #ffffff 50%, rgba(0, 87, 222, 0.05) 100%)",
          paddingTop: 120,
          paddingBottom: 80,
        }}
      >
        <div
          style={{
            maxWidth: 1440,
            margin: "0 auto",
            padding: "0 30px",
          }}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Texto hero */}
            <div>
              <AnimateOnScroll>
                <span
                  style={{
                    display: "inline-block",
                    fontSize: 13,
                    fontWeight: 700,
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    color: "#0057DE",
                    marginBottom: 16,
                  }}
                >
                  INDÚSTRIAS
                </span>
                <h1
                  style={{
                    fontFamily: KNOCKOUT,
                    fontSize: "clamp(36px, 5vw, 64px)",
                    fontWeight: 500,
                    lineHeight: 1,
                    textTransform: "uppercase",
                    color: "#0f172a",
                    marginBottom: 24,
                  }}
                >
                  Principais Indústrias Atendidas pela Gaiatec Sistemas
                </h1>
                <p
                  style={{
                    fontSize: 17,
                    lineHeight: 1.7,
                    color: "#475569",
                    marginBottom: 16,
                    maxWidth: 600,
                  }}
                >
                  A Gaiatec Sistemas atua com instrumentação, automação e controle de processos em mais de {sectors.length} indústrias. Cada setor tem suas particularidades técnicas, normativas e operacionais — e nós entendemos cada uma delas.
                </p>
                <p
                  style={{
                    fontSize: 16,
                    lineHeight: 1.7,
                    color: "#64748b",
                    maxWidth: 600,
                  }}
                >
                  De saneamento a petróleo, de agronegócio a salas limpas: nossas soluções são dimensionadas para a realidade de cada operação.
                </p>
              </AnimateOnScroll>
            </div>

            {/* Mosaico 3x3 */}
            <AnimateOnScroll direction="left">
              <div
                className="grid grid-cols-3 gap-2"
                style={{ aspectRatio: "1/1" }}
              >
                {mosaicImages.map((img, i) => (
                  <div
                    key={i}
                    className="overflow-hidden rounded-md group"
                    style={{ aspectRatio: "1/1" }}
                  >
                    <img
                      src={img}
                      alt=""
                      loading={i < 3 ? "eager" : "lazy"}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  </div>
                ))}
              </div>
            </AnimateOnScroll>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          2) FILTER BAR STICKY
         ═══════════════════════════════════════════════════ */}
      <SetoresFilterBar setores={filterItems} />

      {/* ═══════════════════════════════════════════════════
          3) BLOCOS DETALHADOS (1 por setor com id de scroll)
         ═══════════════════════════════════════════════════ */}
      <section
        id="setores-grid"
        style={{ backgroundColor: "#ffffff", paddingTop: 60, paddingBottom: 80 }}
      >
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          {sectors.map((s, i) => (
            <article
              key={s.slug}
              id={`setor-${s.slug}`}
              className="group"
              style={{
                paddingTop: 48,
                paddingBottom: 48,
                borderBottom: i < sectors.length - 1 ? "1px solid #e2e8f0" : "none",
                scrollMarginTop: 120,
              }}
            >
              <AnimateOnScroll>
                <div
                  className={`grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center ${
                    i % 2 === 1 ? "lg:[&>*:first-child]:order-2" : ""
                  }`}
                >
                  {/* Imagem */}
                  <Link
                    to={`/setores/${s.slug}`}
                    className="block overflow-hidden rounded-2xl shadow-lg"
                    style={{ aspectRatio: "4/3" }}
                  >
                    <img
                      src={s.image}
                      alt={s.title}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-700 hover:scale-105"
                    />
                  </Link>

                  {/* Conteúdo */}
                  <div>
                    <span
                      className="inline-block text-xs font-bold tracking-[0.2em] uppercase text-[#0057DE] mb-3"
                    >
                      {s.overline || "INDÚSTRIA"}
                    </span>
                    <h2
                      className="text-2xl md:text-3xl lg:text-4xl font-bold leading-tight text-slate-900 mb-4"
                      style={{ fontFamily: KNOCKOUT, textTransform: "uppercase", fontWeight: 500 }}
                    >
                      {s.title}
                    </h2>
                    <p className="text-slate-600 leading-relaxed text-base md:text-[17px] mb-6 line-clamp-3">
                      {s.description}
                    </p>

                    {/* CTA */}
                    <Link
                      to={`/setores/${s.slug}`}
                      className="inline-flex items-center gap-2 text-[#0057DE] hover:text-[#0046b3] font-semibold text-sm tracking-wide group/cta transition-colors"
                    >
                      Ver mais sobre esta indústria
                      <ArrowRight
                        size={16}
                        className="group-hover/cta:translate-x-1 transition-transform"
                      />
                    </Link>
                  </div>
                </div>
              </AnimateOnScroll>
            </article>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          4) STATS BAR (V2 tema claro)
         ═══════════════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#f8fafc", padding: "60px 0", borderTop: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { value: String(sectors.length), label: "Indústrias de Atuação" },
              { value: "+20", label: "Anos de Experiência" },
              { value: "BR", label: "Atendimento Nacional" },
            ].map((s, i) => (
              <AnimateOnScroll key={s.label} delay={i * 0.1}>
                <div style={{ textAlign: "center" }}>
                  <span
                    style={{
                      fontFamily: KNOCKOUT,
                      fontSize: "clamp(40px, 5vw, 64px)",
                      fontWeight: 500,
                      lineHeight: 1,
                      color: "#0057DE",
                      display: "block",
                    }}
                  >
                    {s.value}
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: "#475569",
                      marginTop: 8,
                      display: "block",
                    }}
                  >
                    {s.label}
                  </span>
                </div>
              </AnimateOnScroll>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          5) CTA Final
         ═══════════════════════════════════════════════════ */}
      <CTABanner
        text="Não encontrou a sua indústria? A Gaiatec Sistemas atende qualquer processo industrial que demande instrumentação, automação ou controle."
        primaryLabel="Fale com um Especialista"
      />
    </>
  );
}
