import { useState } from "react";
import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { AnimateOnScroll } from "../useScrollAnimation";
import { dgCategorias, HUB_BASE } from "../../data/deteccaoGas";

// master-detail (hover) — substitui o antigo showcase de abas+carrossel
const KNOCKOUT = "'Knockout HTF68', sans-serif";
const BRAND = "#0057DE";

/** Imagem + subtítulo curto por categoria (chaveado por slug). */
const META: Record<string, { imagem: string; subtitulo: string }> = {
  "deteccao-movel": { imagem: "/images/pages/dg-cat-movel.webp", subtitulo: "Veículos · drones · laser em movimento" },
  "monitoramento-online": { imagem: "/images/pages/dg-cat-online.webp", subtitulo: "Vigilância 24/7 em tempo real" },
  "localizacao-tubulacao-pe": { imagem: "/images/pages/dg-cat-pe.webp", subtitulo: "Tubos de polietileno enterrados" },
  "deteccao-rede-enterrada-gas": { imagem: "/images/pages/dg-cat-enterrada.webp", subtitulo: "Inspeção de redes subterrâneas" },
  "detectores-portateis": { imagem: "/images/pages/dg-cat-portateis.webp", subtitulo: "Handhelds para o trabalho de campo" },
  "monitoramento-meteorologico": { imagem: "/images/pages/dg-cat-meteo.webp", subtitulo: "Vento, temperatura e dispersão" },
};

const CATS = dgCategorias.map((c) => ({
  ...c,
  imagem: META[c.slug]?.imagem ?? "/images/pages/2.2.webp",
  subtitulo: META[c.slug]?.subtitulo ?? "",
}));

/**
 * Categorias da linha de Detecção de Gás — showcase master-detail.
 * Lista de frentes à esquerda (hover/foco define a ativa e revela o resumo)
 * + imagem à direita com overlay (subtítulo, título e CTA) na base.
 * Mesmo modelo da seção "Serviços Especializados" da home.
 */
export function DgCategoriasShowcase() {
  const [active, setActive] = useState(0);
  const atual = CATS[active];

  return (
    <section className="bg-white py-20 md:py-28 border-t border-slate-200">
      <div className="max-w-[1440px] mx-auto px-5 md:px-[30px]">
        {/* ─── Header ─── */}
        <AnimateOnScroll>
          <div className="mb-12 md:mb-16 max-w-[640px]">
            <span className="inline-block text-xs md:text-[13px] font-semibold tracking-[0.2em] uppercase text-[#0057DE] mb-3">
              Portfólio
            </span>
            <h2 className="text-3xl md:text-4xl lg:text-5xl text-slate-900 leading-tight" style={{ fontFamily: KNOCKOUT, fontWeight: 500, textTransform: "uppercase" }}>
              Seis frentes de detecção
            </h2>
          </div>
        </AnimateOnScroll>

        <div className="grid grid-cols-1 lg:grid-cols-[0.92fr_1.08fr] gap-8 lg:gap-16 items-stretch">
          {/* ─── Esquerda — lista de categorias ─── */}
          <AnimateOnScroll>
            <div className="border-b border-slate-200">
              {CATS.map((c, i) => {
                const on = i === active;
                return (
                  <button
                    key={c.slug}
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onClick={() => setActive(i)}
                    aria-pressed={on}
                    className="group block w-full text-left border-t border-slate-200 py-5 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <h3
                        className="leading-none transition-colors duration-300"
                        style={{ fontFamily: KNOCKOUT, fontSize: "clamp(20px, 2.4vw, 30px)", fontWeight: 500, textTransform: "uppercase", color: on ? BRAND : "#0f172a" }}
                      >
                        {c.nome}
                      </h3>
                      <ArrowRight
                        size={18}
                        className="flex-shrink-0 transition-all duration-300"
                        style={{ color: BRAND, opacity: on ? 1 : 0, transform: on ? "translateX(0)" : "translateX(-6px)" }}
                      />
                    </div>
                    <div
                      className="overflow-hidden transition-all duration-300"
                      style={{ maxHeight: on ? 120 : 0, opacity: on ? 1 : 0, marginTop: on ? 10 : 0 }}
                    >
                      <p className="text-sm md:text-[15px] leading-relaxed text-slate-600 max-w-[460px]">
                        {c.resumo}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </AnimateOnScroll>

          {/* ─── Direita — imagem da categoria ativa + overlay ─── */}
          <AnimateOnScroll delay={0.1}>
            <div className="relative overflow-hidden h-full min-h-[360px]" style={{ aspectRatio: "4 / 3" }}>
              {CATS.map((c, i) => (
                <img
                  key={c.slug}
                  src={c.imagem}
                  alt={c.nome}
                  loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover transition-opacity duration-500"
                  style={{ opacity: i === active ? 1 : 0 }}
                />
              ))}
              {/* Overlay inferior dentro da imagem */}
              <div
                className="absolute inset-x-0 bottom-0 p-7 md:p-9"
                style={{ background: "linear-gradient(to top, rgba(5,11,24,0.92) 0%, rgba(5,11,24,0.45) 55%, transparent 100%)" }}
              >
                <span style={{ display: "block", fontSize: 12, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "#9ec1ff", marginBottom: 8 }}>
                  {atual.subtitulo}
                </span>
                <h3 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(26px, 3.2vw, 40px)", fontWeight: 500, lineHeight: 1, textTransform: "uppercase", color: "#fff", marginBottom: 18 }}>
                  {atual.nome}
                </h3>
                <Link
                  to={`${HUB_BASE}/${atual.slug}`}
                  className="inline-flex items-center gap-2 bg-white text-[#0057DE] px-6 py-3 text-[12px] font-bold uppercase tracking-[0.08em] hover:bg-[#0057DE] hover:text-white transition-colors"
                >
                  Ver categoria <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </div>
    </section>
  );
}
