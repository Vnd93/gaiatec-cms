import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router";
import useEmblaCarousel from "embla-carousel-react";
import { ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { AnimateOnScroll } from "../components/useScrollAnimation";
import { CTABanner } from "../components/CTABanner";
import { PageHero } from "../components/PageHero";
import { getServiceIcon } from "../components/servicos/serviceIcons";
import {
  servicesList,
  featuredServices,
  categoriaLabels,
  type ServicoCategoria,
  type ServicoListItem,
} from "../data/servicesList";
import { SEO, buildCollectionPageSchema } from "../components/SEO";

const KNOCKOUT = "'Knockout HTF68', sans-serif";
const BRAND = "#0057DE";

const CATEGORIA_ORDER: ServicoCategoria[] = [
  "instalacao",
  "manutencao",
  "calibracao",
  "consultoria",
  "outros",
];

/* ────────────────────────────────────────────────────────
   CARROSSEL DE DESTAQUES (embla)
   ──────────────────────────────────────────────────────── */
function DestaquesCarousel({ items }: { items: ServicoListItem[] }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ align: "start", loop: false, dragFree: false });
  const [selected, setSelected] = useState(0);
  const [snaps, setSnaps] = useState<number[]>([]);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelected(emblaApi.selectedScrollSnap());
    setCanPrev(emblaApi.canScrollPrev());
    setCanNext(emblaApi.canScrollNext());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    setSnaps(emblaApi.scrollSnapList());
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, onSelect]);

  return (
    <div>
      <div className="flex items-end justify-between gap-6" style={{ marginBottom: 36 }}>
        <div>
          <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: BRAND, marginBottom: 14 }}>
            Em destaque
          </span>
          <h2 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(28px, 3.6vw, 46px)", fontWeight: 500, lineHeight: 1, textTransform: "uppercase", color: "#0f172a" }}>
            Serviços que mais movem operações
          </h2>
        </div>
        <div className="hidden md:flex items-center gap-2" style={{ flexShrink: 0 }}>
          <button
            type="button"
            aria-label="Anterior"
            onClick={() => emblaApi?.scrollPrev()}
            disabled={!canPrev}
            className="w-11 h-11 inline-flex items-center justify-center border border-slate-300 text-slate-700 transition-all hover:border-[#0057DE] hover:text-[#0057DE] disabled:opacity-30 disabled:hover:border-slate-300 disabled:hover:text-slate-700"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            aria-label="Próximo"
            onClick={() => emblaApi?.scrollNext()}
            disabled={!canNext}
            className="w-11 h-11 inline-flex items-center justify-center border border-slate-300 text-slate-700 transition-all hover:border-[#0057DE] hover:text-[#0057DE] disabled:opacity-30 disabled:hover:border-slate-300 disabled:hover:text-slate-700"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div ref={emblaRef} className="overflow-hidden">
        <div className="flex" style={{ gap: 24 }}>
          {items.map((s) => {
            const Icon = getServiceIcon(s.icone);
            return (
              <div key={s.slug} className="flex-[0_0_86%] sm:flex-[0_0_48%] lg:flex-[0_0_31.5%]">
                <Link
                  to={`/servicos/${s.slug}`}
                  className="group block h-full overflow-hidden"
                  style={{ background: "#0a0a0a", textDecoration: "none" }}
                >
                  <div style={{ position: "relative", padding: "32px 28px 28px", background: "linear-gradient(135deg, #0057DE 0%, #0a2540 70%, #050b18 100%)" }}>
                    <Icon size={34} strokeWidth={1.5} color="#fff" />
                    <ArrowUpRight size={20} className="opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ position: "absolute", top: 24, right: 24, color: "#fff" }} />
                  </div>
                  <div style={{ padding: "26px 28px 30px", display: "flex", flexDirection: "column", minHeight: 200 }}>
                    <h3 style={{ fontFamily: KNOCKOUT, fontSize: 22, fontWeight: 500, lineHeight: 1.1, textTransform: "uppercase", color: "#fff", marginBottom: 12 }}>
                      {s.nome}
                    </h3>
                    <p style={{ fontSize: 14, lineHeight: 1.7, color: "rgba(255,255,255,0.55)", marginBottom: 22, flex: 1 }}>
                      {s.descricaoCurta}
                    </p>
                    <span className="group-hover:gap-2.5" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#6ea8ff", textTransform: "uppercase", letterSpacing: "0.08em", transition: "gap 0.3s ease" }}>
                      Ver serviço <ArrowRight size={13} />
                    </span>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dots */}
      <div className="flex items-center gap-2 md:hidden" style={{ marginTop: 24 }}>
        {snaps.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Ir para ${i + 1}`}
            onClick={() => emblaApi?.scrollTo(i)}
            style={{ width: i === selected ? 24 : 8, height: 8, borderRadius: 999, background: i === selected ? BRAND : "#cbd5e1", transition: "all 0.3s ease" }}
          />
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────
   CARD DE SERVIÇO (editorial)
   ──────────────────────────────────────────────────────── */
function ServicoTile({ servico }: { servico: ServicoListItem }) {
  const Icon = getServiceIcon(servico.icone);
  return (
    <Link
      to={`/servicos/${servico.slug}`}
      className="group relative flex flex-col bg-white border border-slate-200 p-7 transition-all duration-300 hover:-translate-y-1 hover:border-[#0057DE] hover:shadow-[0_18px_44px_-16px_rgba(2,16,43,0.16)] overflow-hidden h-full"
    >
      <div className="flex items-start justify-between" style={{ marginBottom: 22 }}>
        <span className="inline-flex items-center justify-center transition-colors duration-300 group-hover:bg-[#0057DE] group-hover:text-white" style={{ width: 48, height: 48, background: "rgba(0,87,222,0.08)", color: BRAND }}>
          <Icon size={24} strokeWidth={1.6} />
        </span>
        <ArrowUpRight size={20} className="opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" style={{ color: BRAND }} />
      </div>
      <h3 style={{ fontSize: 17, fontWeight: 600, color: "#0f172a", lineHeight: 1.3, marginBottom: 10 }}>
        {servico.nome}
      </h3>
      <p style={{ fontSize: 14, lineHeight: 1.65, color: "#64748b", marginBottom: 18, flex: 1, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
        {servico.descricaoCurta}
      </p>
      {servico.setores.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {servico.setores.slice(0, 3).map((s) => (
            <span key={s} style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", padding: "4px 8px", background: "#f1f5f9", color: "#64748b" }}>
              {s}
            </span>
          ))}
        </div>
      )}
      {/* Linha de acento que cresce no hover */}
      <span className="absolute left-0 bottom-0 h-[3px] w-0 group-hover:w-full transition-all duration-500 ease-out" style={{ background: BRAND }} />
    </Link>
  );
}

/* ────────────────────────────────────────────────────────
   PÁGINA
   ──────────────────────────────────────────────────────── */
export default function ServicosPage() {
  const categoriasComItens = CATEGORIA_ORDER.map((cat) => ({
    cat,
    label: categoriaLabels[cat],
    itens: servicesList.filter((s) => s.categoria === cat),
  })).filter((g) => g.itens.length > 0);

  return (
    <>
      <SEO
        title="Serviços Especializados"
        description="Serviços técnicos da Gaiatec: instalação, calibração rastreável, manutenção, automação, proteção catódica e consultoria. Atendimento técnico em todo o Brasil."
        path="/servicos"
        keywords="serviços técnicos, calibração rastreável, instalação, manutenção, automação, proteção catódica, inspeção"
        schema={buildCollectionPageSchema({
          name: "Serviços Especializados — Gaiatec Sistemas",
          description: "Serviços técnicos para indústria com equipe qualificada e calibração rastreável ao INMETRO.",
          itemCount: servicesList.length,
        })}
      />

      {/* ═══════════════ 1) HERO (padrão Biodigestor) ═══════════════ */}
      <PageHero overline="Serviços" title="Engenharia de Campo" image="/images/servicos/engenharia-de-campo/hero.webp" />

      {/* ═══════════════ 2) CARROSSEL DESTAQUES ═══════════════ */}
      <section style={{ background: "#fff", padding: "80px 0 90px" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <DestaquesCarousel items={featuredServices} />
          </AnimateOnScroll>
        </div>
      </section>

      {/* ═══════════════ 3) SERVIÇOS POR CATEGORIA ═══════════════ */}
      <section style={{ background: "#f8fafc", padding: "20px 0 40px" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          {categoriasComItens.map((grupo, gi) => (
            <div key={grupo.cat} style={{ padding: "60px 0", borderTop: gi > 0 ? "1px solid #e6ebf2" : "none" }}>
              <AnimateOnScroll>
                <div className="flex items-end gap-4" style={{ marginBottom: 36 }}>
                  <h2 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(26px, 3.2vw, 42px)", fontWeight: 500, lineHeight: 1, textTransform: "uppercase", color: "#0f172a" }}>
                    {grupo.label}
                  </h2>
                  <span style={{ fontFamily: KNOCKOUT, fontSize: 20, fontWeight: 500, color: "rgba(0,87,222,0.4)", marginBottom: 2 }}>
                    {String(grupo.itens.length).padStart(2, "0")}
                  </span>
                </div>
              </AnimateOnScroll>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
                {grupo.itens.map((s, i) => (
                  <AnimateOnScroll key={s.slug} delay={Math.min(i * 0.05, 0.3)}>
                    <ServicoTile servico={s} />
                  </AnimateOnScroll>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════ 4) CTA ═══════════════ */}
      <CTABanner
        text="Precisa de um serviço técnico especializado? Fale com nossa equipe e receba uma análise técnica gratuita para o seu caso."
        primaryLabel="Solicitar análise técnica"
        secondaryLabel="Ver todos os produtos"
        secondaryHref="/produtos"
      />
    </>
  );
}
