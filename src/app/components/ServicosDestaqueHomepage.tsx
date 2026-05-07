import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { AnimateOnScroll } from "./useScrollAnimation";
import { ServicoCard } from "./servicos/ServicoCard";
import { featuredServices } from "../data/servicesList";

/**
 * Seção "Serviços Especializados" da homepage (TASK 7).
 *
 * Exibe os 6 serviços marcados como `destaque: true` em servicesList.ts.
 * Posicionamento sugerido: entre FeaturedProducts e InnovativeSolutions.
 *
 * Layout responsivo:
 *   - Desktop: grid 3 cols
 *   - Tablet: grid 2 cols
 *   - Mobile: grid 1 col com scroll snap (controlado pelo grid)
 */
export function ServicosDestaqueHomepage() {
  return (
    <section className="bg-slate-50 py-20 md:py-28">
      <div className="max-w-[1440px] mx-auto px-4 md:px-6 lg:px-8">
        {/* ─── Header da seção ─── */}
        <AnimateOnScroll>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12 md:mb-16">
            <div className="flex-1 max-w-[640px]">
              <span className="inline-block text-xs md:text-[13px] font-semibold tracking-[0.2em] uppercase text-[#0057DE] mb-3">
                O QUE FAZEMOS
              </span>
              <h2
                className="text-3xl md:text-4xl lg:text-5xl font-bold text-slate-900 leading-tight mb-4"
                style={{ fontFamily: "'Knockout HTF68', sans-serif", textTransform: "uppercase" }}
              >
                Serviços Especializados
              </h2>
              <p className="text-base md:text-lg text-slate-600 leading-relaxed">
                Da especificação à manutenção, atendimento técnico em todo o Brasil.
              </p>
            </div>

            {/* CTA "Ver todos os serviços" — desktop */}
            <Link
              to="/servicos"
              className="hidden md:inline-flex items-center gap-2 text-[#0057DE] hover:text-[#0046b3] text-sm font-semibold tracking-wide group transition-colors flex-shrink-0"
            >
              Ver todos os serviços
              <ArrowRight
                size={16}
                className="group-hover:translate-x-1 transition-transform"
              />
            </Link>
          </div>
        </AnimateOnScroll>

        {/* ─── Grid de cards ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
          {featuredServices.map((servico, i) => (
            <AnimateOnScroll key={servico.slug} delay={i * 0.08}>
              <ServicoCard servico={servico} />
            </AnimateOnScroll>
          ))}
        </div>

        {/* CTA "Ver todos" — mobile (centralizado abaixo do grid) */}
        <div className="md:hidden mt-10 text-center">
          <Link
            to="/servicos"
            className="inline-flex items-center gap-2 bg-[#0057DE] hover:bg-[#0046b3] text-white px-7 py-3 text-sm font-semibold tracking-wide rounded-md transition-colors"
          >
            Ver todos os serviços
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}
