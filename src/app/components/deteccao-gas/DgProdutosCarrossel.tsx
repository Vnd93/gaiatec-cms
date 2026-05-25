import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router";
import useEmblaCarousel from "embla-carousel-react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { AnimateOnScroll } from "../useScrollAnimation";
import {
  dgCategorias,
  getDgProdutosByCategoria,
  HUB_BASE,
  type DgProduto,
  type DgCategoria,
} from "../../data/deteccaoGas";

const KNOCKOUT = "'Knockout HTF68', sans-serif";
const BRAND = "#0057DE";
const BRAND_GRADIENT = "linear-gradient(135deg, #0057DE 0%, #0a2540 70%, #050b18 100%)";
const AUTOPLAY_MS = 3800;

/* Imagem representativa por categoria (card "Explorar …" no fim do carrossel).
   Móvel/online usam os banners da página; as demais usam o render do produto-âncora.
   Trocar para os banners dedicados dg-cat-* quando existirem. */
const CAT_IMG: Record<string, string> = {
  "deteccao-movel": "/images/pages/dg-movel.webp",
  "monitoramento-online": "/images/pages/dg-online.webp",
  "localizacao-tubulacao-pe": "/images/deteccao-gas/a200.webp",
  "deteccao-rede-enterrada-gas": "/images/deteccao-gas/st100.webp",
  "detectores-portateis": "/images/deteccao-gas/dx300.webp",
  "monitoramento-meteorologico": "/images/deteccao-gas/estacao-portatil.webp",
};

/* Card de produto — imagem (ou placeholder de marca) com overlay inferior. */
function ProdutoSlide({ p, basis }: { p: DgProduto; basis: string }) {
  return (
    <div className={`flex-[0_0_86%] sm:flex-[0_0_48.5%] ${basis}`}>
      <Link
        to={`${HUB_BASE}/${p.categoriaSlug}/${p.slug}`}
        className="group relative block overflow-hidden h-[440px] sm:h-[480px] lg:h-[520px]"
      >
        <div className="absolute inset-0 transition-transform duration-[800ms] ease-out group-hover:scale-105" style={{ background: BRAND_GRADIENT }}>
          {p.imagem && <img src={p.imagem} alt={p.nome} loading="lazy" className="w-full h-full object-cover" />}
        </div>
        <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(5,11,24,0.94) 0%, rgba(5,11,24,0.45) 48%, rgba(5,11,24,0.08) 100%)" }} />
        <span className="absolute top-5 left-5" style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>
          Gaiatec
        </span>
        <div className="absolute inset-x-0 bottom-0 p-6 md:p-7">
          <span style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "#9ec1ff", marginBottom: 8 }}>
            {p.modelo}
          </span>
          <h3 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(19px, 1.7vw, 24px)", fontWeight: 500, lineHeight: 1.05, textTransform: "uppercase", color: "#fff", marginBottom: 16, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {p.nome}
          </h3>
          <span
            className="inline-flex items-center gap-2 bg-white text-[#0057DE] px-5 py-2.5 text-[11px] uppercase tracking-[0.08em] transition-colors group-hover:bg-[#0057DE] group-hover:text-white"
            style={{ fontWeight: 700 }}
          >
            Ver produto <ArrowRight size={13} />
          </span>
        </div>
      </Link>
    </div>
  );
}

/* Card final — atalho para a categoria completa (imagem + overlay, como os de produto). */
function CategoriaCtaSlide({ cat, count, basis }: { cat: DgCategoria; count: number; basis: string }) {
  const img = CAT_IMG[cat.slug];
  return (
    <div className={`flex-[0_0_86%] sm:flex-[0_0_48.5%] ${basis}`}>
      <Link
        to={`${HUB_BASE}/${cat.slug}`}
        className="group relative block overflow-hidden h-[440px] sm:h-[480px] lg:h-[520px] border border-[#0057DE]/30 hover:border-[#0057DE] transition-colors"
      >
        <div className="absolute inset-0 transition-transform duration-[800ms] ease-out group-hover:scale-105" style={{ background: BRAND_GRADIENT }}>
          {img && <img src={img} alt={cat.nome} loading="lazy" className="w-full h-full object-cover" />}
        </div>
        <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(5,11,24,0.94) 0%, rgba(5,11,24,0.5) 50%, rgba(5,11,24,0.12) 100%)" }} />
        <span className="absolute top-5 left-5" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "#9ec1ff" }}>
          Categoria
        </span>
        <div className="absolute inset-x-0 bottom-0 p-6 md:p-7">
          <h3 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(20px, 1.9vw, 27px)", fontWeight: 500, lineHeight: 1.05, textTransform: "uppercase", color: "#fff", marginBottom: 16 }}>
            Explorar {cat.nome}
          </h3>
          <span
            className="inline-flex items-center gap-2 bg-white text-[#0057DE] px-5 py-2.5 text-[11px] uppercase tracking-[0.08em] transition-colors group-hover:bg-[#0057DE] group-hover:text-white"
            style={{ fontWeight: 700 }}
          >
            Ver {count} {count === 1 ? "produto" : "produtos"} <ArrowRight size={13} />
          </span>
        </div>
      </Link>
    </div>
  );
}

/**
 * Carrossel de produtos por frente de detecção — abas (categorias) no topo;
 * ao selecionar, o carrossel abaixo mostra os produtos da categoria em cards
 * de imagem com overlay. Gira sozinho quando há itens suficientes; pausa no hover.
 */
export function DgProdutosCarrossel() {
  const [activeIdx, setActiveIdx] = useState(0);
  const activeCat = dgCategorias[activeIdx];
  const produtos = getDgProdutosByCategoria(activeCat.slug);

  const totalSlides = produtos.length + 1;
  const autoplay = totalSlides > 3;
  const basis =
    totalSlides >= 3 ? "lg:flex-[0_0_31.5%]" : totalSlides === 2 ? "lg:flex-[0_0_48.5%]" : "lg:flex-[0_0_64%]";

  const [emblaRef, emblaApi] = useEmblaCarousel({ align: "start", loop: autoplay });
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.reInit({ align: "start", loop: autoplay });
    emblaApi.scrollTo(0, true);
  }, [activeIdx, emblaApi, autoplay]);

  useEffect(() => {
    if (!emblaApi || !autoplay || paused) return;
    const id = setInterval(() => emblaApi.scrollNext(), AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [emblaApi, autoplay, paused, activeIdx]);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  const navBtn =
    "w-11 h-11 inline-flex items-center justify-center border border-slate-300 text-slate-700 transition-all hover:border-[#0057DE] hover:text-[#0057DE]";

  return (
    <section id="categorias" className="bg-white" style={{ padding: "100px 0", scrollMarginTop: 90 }}>
      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
        <AnimateOnScroll>
          <div className="mb-12 md:mb-14 max-w-[640px]">
            <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: BRAND, marginBottom: 16 }}>
              Produtos
            </span>
            <h2 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 500, lineHeight: 1, textTransform: "uppercase", color: "#111" }}>
              Equipamentos em destaque
            </h2>
          </div>
        </AnimateOnScroll>

        {/* Abas + navegação */}
        <div className="flex items-end justify-between gap-6 mb-10">
          <div className="flex gap-6 lg:gap-8 overflow-x-auto border-b border-slate-200 flex-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {dgCategorias.map((c, i) => {
              const on = i === activeIdx;
              return (
                <button
                  key={c.slug}
                  type="button"
                  onClick={() => setActiveIdx(i)}
                  aria-pressed={on}
                  className={`relative whitespace-nowrap pb-4 text-[13px] uppercase tracking-[0.08em] transition-colors ${on ? "text-[#0057DE]" : "text-slate-400 hover:text-slate-900"}`}
                  style={{ fontWeight: on ? 700 : 600 }}
                >
                  {c.nome}
                  <span style={{ position: "absolute", left: 0, bottom: -1, height: 2, width: "100%", background: BRAND, transform: on ? "scaleX(1)" : "scaleX(0)", transformOrigin: "left", transition: "transform 0.3s ease" }} />
                </button>
              );
            })}
          </div>

          {autoplay && (
            <div className="hidden md:flex items-center gap-2" style={{ flexShrink: 0, paddingBottom: 8 }}>
              <button type="button" aria-label="Anterior" onClick={scrollPrev} className={navBtn}>
                <ChevronLeft size={18} />
              </button>
              <button type="button" aria-label="Próximo" onClick={scrollNext} className={navBtn}>
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </div>

        {/* Carrossel */}
        <div ref={emblaRef} className="overflow-hidden" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
          <div className="flex" style={{ gap: 24 }}>
            {produtos.map((p) => (
              <ProdutoSlide key={`${activeCat.slug}-${p.slug}`} p={p} basis={basis} />
            ))}
            <CategoriaCtaSlide cat={activeCat} count={produtos.length} basis={basis} />
          </div>
        </div>

        <AnimateOnScroll key={activeCat.slug}>
          <p style={{ fontSize: 15, lineHeight: 1.75, color: "#64748b", maxWidth: 720, marginTop: 36 }}>
            {activeCat.resumo}
          </p>
        </AnimateOnScroll>
      </div>
    </section>
  );
}
