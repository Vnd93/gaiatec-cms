import { useState, useMemo, useEffect, useCallback } from "react";
import { Link } from "react-router";
import useEmblaCarousel from "embla-carousel-react";
import { Search, Lightbulb, ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { AnimateOnScroll } from "../components/useScrollAnimation";
import { CTABanner } from "../components/CTABanner";
import { PageHero } from "../components/PageHero";
import { AplicacaoCard } from "../components/aplicacoes/AplicacaoCard";
import { ResponsiveApplicationImage } from "../components/aplicacoes/ResponsiveApplicationImage";
import { aplicacoes as FALLBACK_APLICACOES, setoresFromAplicacoes } from "../data/aplicacoes";
import { useAplicacoes } from "../hooks/useSiteData";
import { SEO, buildCollectionPageSchema } from "../components/SEO";

const KNOCKOUT = "'Knockout HTF68', sans-serif";
const BRAND = "#0057DE";

type AplicacaoView = {
  slug: string;
  nome: string;
  descricaoCurta: string;
  imagem: string;
  setores: string[];
};

/* Carrossel de destaques (embla) — cards com imagem real da aplicação. */
function DestaquesAplicacoes({ items }: { items: AplicacaoView[] }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ align: "start", loop: false });
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
            Casos que entregam resultado
          </h2>
        </div>
        <div className="hidden md:flex items-center gap-2" style={{ flexShrink: 0 }}>
          <button type="button" aria-label="Anterior" onClick={() => emblaApi?.scrollPrev()} disabled={!canPrev} className="w-11 h-11 inline-flex items-center justify-center border border-slate-300 text-slate-700 transition-all hover:border-[#0057DE] hover:text-[#0057DE] disabled:opacity-30">
            <ChevronLeft size={18} />
          </button>
          <button type="button" aria-label="Próximo" onClick={() => emblaApi?.scrollNext()} disabled={!canNext} className="w-11 h-11 inline-flex items-center justify-center border border-slate-300 text-slate-700 transition-all hover:border-[#0057DE] hover:text-[#0057DE] disabled:opacity-30">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div ref={emblaRef} className="overflow-hidden">
        <div className="flex" style={{ gap: 24 }}>
          {items.map((a) => (
            <div key={a.slug} className="flex-[0_0_86%] sm:flex-[0_0_48%] lg:flex-[0_0_31.5%]">
              <Link to={`/aplicacoes/${a.slug}`} className="group block h-full overflow-hidden bg-white border border-slate-200" style={{ textDecoration: "none" }}>
                <div style={{ position: "relative", paddingTop: "60%", overflow: "hidden", background: "#eef2f7" }}>
                  <ResponsiveApplicationImage
                    src={a.imagem}
                    alt={a.nome}
                    loading="lazy"
                    sizes="(max-width: 640px) 86vw, (max-width: 1024px) 48vw, 32vw"
                    className="group-hover:scale-105"
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.6s ease" }}
                  />
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(5,11,24,0.55) 0%, rgba(5,11,24,0) 55%)" }} />
                  <ArrowUpRight size={20} className="opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ position: "absolute", top: 16, right: 16, color: "#fff" }} />
                </div>
                <div style={{ padding: "22px 22px 26px", display: "flex", flexDirection: "column", minHeight: 168 }}>
                  <h3 style={{ fontSize: 17, fontWeight: 600, color: "#0f172a", lineHeight: 1.3, marginBottom: 10 }}>{a.nome}</h3>
                  <p style={{ fontSize: 14, lineHeight: 1.65, color: "#64748b", marginBottom: 18, flex: 1, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{a.descricaoCurta}</p>
                  <span className="group-hover:gap-2.5" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: BRAND, textTransform: "uppercase", letterSpacing: "0.08em", transition: "gap 0.3s ease" }}>
                    Ver aplicação <ArrowRight size={13} />
                  </span>
                </div>
              </Link>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 md:hidden" style={{ marginTop: 24 }}>
        {snaps.map((_, i) => (
          <button key={i} type="button" aria-label={`Ir para ${i + 1}`} onClick={() => emblaApi?.scrollTo(i)} style={{ width: i === selected ? 24 : 8, height: 8, borderRadius: 999, background: i === selected ? BRAND : "#cbd5e1", transition: "all 0.3s ease" }} />
        ))}
      </div>
    </div>
  );
}

/**
 * /aplicacoes — Listagem de Aplicações Industriais (TASK 10).
 *
 * Estrutura:
 *   1. Hero claro com gradient brand
 *   2. Toolbar sticky: search + filtro setor
 *   3. Grid 3 cols de AplicacaoCard
 *   4. Empty state
 *   5. CTA final
 */
export default function AplicacoesPage() {
  const [busca, setBusca] = useState("");
  const [setorAtivo, setSetorAtivo] = useState<string>("Todos");

  // CMS-driven (TASK 26a) — busca via Edge Function, fallback no array hardcoded
  const { aplicacoes: apiAplicacoes, loading } = useAplicacoes();

  // Adapter: mapeia API (snake_case) → shape do componente (camelCase)
  // Quando API não retorna nada (loading ou erro), usa fallback
  const aplicacoes = useMemo(() => {
    if (apiAplicacoes && apiAplicacoes.length > 0) {
      return apiAplicacoes.map((a) => ({
        slug: a.slug,
        nome: a.nome,
        descricaoCurta: a.descricao_curta || "",
        descricaoCompleta: "", // fetched only in detail page
        imagem: a.imagem_url || "/images/aplicacoes/hero-aplicacoes-industriais.webp",
        icone: a.icone || "Wrench",
        setores: a.setores,
        produtosRelacionados: [],
        servicosRelacionados: [],
        beneficios: [],
        casosUso: [],
        destaque: a.destaque,
      }));
    }
    return FALLBACK_APLICACOES;
  }, [apiAplicacoes]);

  // Setores únicos (vem da API ou do fallback)
  const setoresList = useMemo(() => {
    const fromApi = Array.from(new Set(aplicacoes.flatMap((a) => a.setores))).sort();
    return ["Todos", ...(fromApi.length > 0 ? fromApi : setoresFromAplicacoes)];
  }, [aplicacoes]);

  const filtered = useMemo(() => {
    const buscaLower = busca.trim().toLowerCase();
    return aplicacoes.filter((a) => {
      if (setorAtivo !== "Todos" && !a.setores.includes(setorAtivo)) return false;
      if (buscaLower) {
        const haystack = `${a.nome} ${a.descricaoCurta} ${a.setores.join(" ")}`.toLowerCase();
        if (!haystack.includes(buscaLower)) return false;
      }
      return true;
    });
  }, [busca, setorAtivo, aplicacoes]);

  // loading aviso silencioso — fallback hardcoded já carrega instantâneo
  void loading;

  const destaques = useMemo<AplicacaoView[]>(() => {
    const flagged = aplicacoes.filter((a) => (a as { destaque?: boolean }).destaque);
    return (flagged.length > 0 ? flagged : aplicacoes).slice(0, 8).map((a) => ({
      slug: a.slug,
      nome: a.nome,
      descricaoCurta: a.descricaoCurta,
      imagem: a.imagem,
      setores: a.setores,
    }));
  }, [aplicacoes]);

  return (
    <>
      <SEO
        title="Aplicações Industriais"
        description="Casos de uso reais onde a Gaiatec entrega soluções técnicas integradas — instrumentação, automação e serviços para macromedição, biogás, proteção catódica, HVAC e telemetria."
        path="/aplicacoes"
        keywords="aplicações industriais, casos de uso, macromedição, biogás, proteção catódica, automação"
        schema={buildCollectionPageSchema({
          name: "Aplicações Industriais — Gaiatec Sistemas",
          description: "Catálogo de aplicações práticas com instrumentação e automação Gaiatec.",
          itemCount: aplicacoes.length,
        })}
      />

      {/* ═══════════════════════════════════════════════════
          1) HERO
         ═══════════════════════════════════════════════════ */}
      <PageHero overline="Aplicações" title="Aplicações Industriais" image="/images/aplicacoes/hero-aplicacoes-industriais.webp" />

      {/* ═══════════════════════════════════════════════════
          1.5) CARROSSEL DE DESTAQUES
         ═══════════════════════════════════════════════════ */}
      {destaques.length > 0 && (
        <section style={{ background: "#fff", padding: "70px 0 80px" }}>
          <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
            <AnimateOnScroll>
              <DestaquesAplicacoes items={destaques} />
            </AnimateOnScroll>
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════
          2) TOOLBAR STICKY
         ═══════════════════════════════════════════════════ */}
      <div className="sticky top-[100px] md:top-[80px] z-30 bg-white/95 backdrop-blur-md border-y border-slate-200 shadow-sm">
        <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-4 space-y-3">
          {/* Search */}
          <div className="relative">
            <Search
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar aplicação ou tecnologia..."
              className="w-full pl-11 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-full outline-none focus:border-[#0057DE] focus:bg-white transition-colors"
            />
          </div>

          {/* Filtro setor */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {setoresList.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSetorAtivo(s)}
                className={`flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-full transition-all whitespace-nowrap ${
                  setorAtivo === s
                    ? "bg-[#0057DE] text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          3) GRID
         ═══════════════════════════════════════════════════ */}
      <section className="bg-slate-50 py-16 md:py-20 min-h-[400px]">
        <div className="max-w-[1440px] mx-auto px-4 md:px-8">
          <div className="mb-8 flex items-center justify-between">
            <p className="text-sm text-slate-600">
              <span className="font-semibold text-slate-900">{filtered.length}</span>{" "}
              {filtered.length === 1 ? "aplicação encontrada" : "aplicações encontradas"}
              {(setorAtivo !== "Todos" || busca) && (
                <button
                  type="button"
                  onClick={() => {
                    setBusca("");
                    setSetorAtivo("Todos");
                  }}
                  className="ml-3 text-[#0057DE] hover:text-[#0046b3] font-medium"
                >
                  Limpar filtros
                </button>
              )}
            </p>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-20">
              <Lightbulb size={48} className="text-slate-300 mx-auto mb-4" strokeWidth={1.5} />
              <p className="text-lg text-slate-500 mb-2">Nenhuma aplicação encontrada.</p>
              <p className="text-sm text-slate-400 mb-6">
                Não localizamos aplicações com os filtros selecionados.
              </p>
              <button
                type="button"
                onClick={() => {
                  setBusca("");
                  setSetorAtivo("Todos");
                }}
                className="inline-flex items-center gap-2 text-[#0057DE] hover:text-[#0046b3] font-semibold"
              >
                Limpar filtros e ver todas
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
              {filtered.map((a, i) => (
                <AnimateOnScroll key={a.slug} delay={Math.min(i * 0.04, 0.4)}>
                  <AplicacaoCard aplicacao={a} />
                </AnimateOnScroll>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          4) CTA FINAL
         ═══════════════════════════════════════════════════ */}
      <CTABanner
        text="Tem um caso de uso específico que não encontrou aqui? Nossa equipe técnica desenvolve soluções customizadas para cada operação."
        primaryLabel="Fale com um Especialista"
        secondaryLabel="Ver Produtos"
        secondaryHref="/produtos"
      />
    </>
  );
}
