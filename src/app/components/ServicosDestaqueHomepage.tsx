import { useState } from "react";
import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { AnimateOnScroll } from "./useScrollAnimation";
import { featuredServices } from "../data/servicesList";

const KNOCKOUT = "'Knockout HTF68', sans-serif";
const BRAND = "#0057DE";

/** Imagem + subtítulo curto por serviço em destaque (chaveado por slug). */
const META: Record<string, { imagem: string; subtitulo: string }> = {
  "instalacoes-comissionamentos": { imagem: "/images/services/4.7.webp", subtitulo: "Instalação e startup técnico em campo" },
  "medicoes-em-campo": { imagem: "/images/services/4.9.webp", subtitulo: "Vazão, pressão, nível e gases" },
  "calibracao-rastreavel-laboratorio": { imagem: "/images/services/4.5.webp", subtitulo: "Calibração rastreável ao INMETRO" },
  "manutencoes": { imagem: "/images/services/4.6.webp", subtitulo: "Preventiva e corretiva, com SLA" },
  "automacoes": { imagem: "/images/services/4.1.webp", subtitulo: "CLP · SCADA · integração de campo" },
  "protecao-catodica": { imagem: "/images/services/4.3.webp", subtitulo: "Prevenção e controle da corrosão" },
};

const SERVICES = featuredServices.map((s) => ({
  ...s,
  imagem: META[s.slug]?.imagem ?? "/images/services/4.2.webp",
  subtitulo: META[s.slug]?.subtitulo ?? "",
}));

/**
 * Seção "Serviços Especializados" da homepage — showcase master-detail.
 * Lista de serviços à esquerda (hover/foco define o ativo e revela a
 * descrição) + imagem do serviço à direita com overlay (subtítulo, título
 * e CTA) na base. Sem ícones em caixa — foco em tipografia e imagem.
 */
export function ServicosDestaqueHomepage() {
  const [active, setActive] = useState(0);
  const atual = SERVICES[active];

  return (
    <section className="bg-slate-50 py-20 md:py-28">
      <div className="max-w-[1440px] mx-auto px-4 md:px-6 lg:px-8">
        {/* ─── Header ─── */}
        <AnimateOnScroll>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12 md:mb-16">
            <div className="flex-1 max-w-[640px]">
              <span className="inline-block text-xs md:text-[13px] font-semibold tracking-[0.2em] uppercase text-[#0057DE] mb-3">
                O que fazemos
              </span>
              <h2 className="text-3xl md:text-4xl lg:text-5xl text-slate-900 leading-tight" style={{ fontFamily: KNOCKOUT, fontWeight: 500, textTransform: "uppercase" }}>
                Serviços Especializados
              </h2>
            </div>
            <Link to="/servicos" className="hidden md:inline-flex items-center gap-2 text-[#0057DE] hover:text-[#0046b3] text-sm font-semibold tracking-wide group transition-colors flex-shrink-0">
              Ver todos os serviços
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </AnimateOnScroll>

        <div className="grid grid-cols-1 lg:grid-cols-[0.92fr_1.08fr] gap-8 lg:gap-16 items-stretch">
          {/* ─── Esquerda — lista de serviços ─── */}
          <AnimateOnScroll>
            <div className="border-b border-slate-200">
              {SERVICES.map((s, i) => {
                const on = i === active;
                return (
                  <button
                    key={s.slug}
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
                        {s.nome}
                      </h3>
                      <ArrowRight
                        size={18}
                        className="flex-shrink-0 transition-all duration-300"
                        style={{ color: BRAND, opacity: on ? 1 : 0, transform: on ? "translateX(0)" : "translateX(-6px)" }}
                      />
                    </div>
                    <div
                      className="overflow-hidden transition-all duration-300"
                      style={{ maxHeight: on ? 80 : 0, opacity: on ? 1 : 0, marginTop: on ? 10 : 0 }}
                    >
                      <p className="text-sm md:text-[15px] leading-relaxed text-slate-600 max-w-[440px]">
                        {s.descricaoCurta}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </AnimateOnScroll>

          {/* ─── Direita — imagem do serviço ativo + overlay ─── */}
          <AnimateOnScroll delay={0.1}>
            <div className="relative overflow-hidden h-full min-h-[360px]" style={{ aspectRatio: "4 / 3" }}>
              {SERVICES.map((s, i) => (
                <img
                  key={s.slug}
                  src={s.imagem}
                  alt={s.nome}
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
                  to={`/servicos/${atual.slug}`}
                  className="inline-flex items-center gap-2 bg-white text-[#0057DE] px-6 py-3 text-[12px] font-bold uppercase tracking-[0.08em] hover:bg-[#0057DE] hover:text-white transition-colors"
                >
                  Ver serviço <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          </AnimateOnScroll>
        </div>

        {/* CTA "Ver todos" — mobile */}
        <div className="md:hidden mt-10 text-center">
          <Link to="/servicos" className="inline-flex items-center gap-2 bg-[#0057DE] text-white px-7 py-3 text-sm font-semibold tracking-wide transition-colors">
            Ver todos os serviços <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}
