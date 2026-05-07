import { useParams, Navigate, Link } from "react-router";
import { CheckCircle2, ArrowRight, ArrowUpRight, ChevronRight } from "lucide-react";
import { aplicacaoBySlug, aplicacoes } from "../data/aplicacoes";
import { servicesList } from "../data/servicesList";
import { AnimateOnScroll } from "../components/useScrollAnimation";
import { CTABanner } from "../components/CTABanner";

const KNOCKOUT = "'Knockout HTF68', sans-serif";

/**
 * /aplicacoes/[slug] — Página de detalhe de uma Aplicação (TASK 11).
 *
 * Estrutura:
 *   0. Breadcrumb
 *   1. Hero gradient com título + descrição + imagem direita
 *   2. Sobre a Aplicação (rich text)
 *   3. Setores Atendidos (chips)
 *   4. Produtos Relacionados (lista linear)
 *   5. Serviços Relacionados (cards com hyperlink)
 *   6. Casos de Uso (grid)
 *   7. Benefícios / ROI (bullets bg-slate-50)
 *   8. CTA final
 *   9. "Aplicações Similares" (3 cards)
 */
export default function AplicacaoPage() {
  const { slug } = useParams();
  const aplicacao = aplicacaoBySlug(slug || "");

  if (!aplicacao) return <Navigate to="/aplicacoes" replace />;

  // Aplicações similares (mesmo setor primário, exclui a atual)
  const similares = aplicacoes
    .filter(
      (a) =>
        a.slug !== aplicacao.slug &&
        a.setores.some((s) => aplicacao.setores.includes(s)),
    )
    .slice(0, 3);

  // Resolve serviços relacionados via slug → objeto da servicesList
  const servicosResolvidos = aplicacao.servicosRelacionados
    .map((slugServico) => servicesList.find((s) => s.slug === slugServico))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  return (
    <>
      {/* ═══════════════════════════════════════════════════
          0) BREADCRUMB
         ═══════════════════════════════════════════════════ */}
      <nav aria-label="Breadcrumb" className="bg-slate-50 border-b border-slate-200">
        <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-3 text-sm">
          <ol className="flex items-center gap-2 text-slate-500">
            <li>
              <Link to="/" className="hover:text-[#0057DE] transition-colors">
                Início
              </Link>
            </li>
            <li className="text-slate-300">/</li>
            <li>
              <Link to="/aplicacoes" className="hover:text-[#0057DE] transition-colors">
                Aplicações
              </Link>
            </li>
            <li className="text-slate-300">/</li>
            <li className="text-slate-900 font-medium truncate max-w-[200px] md:max-w-none">
              {aplicacao.nome}
            </li>
          </ol>
        </div>
      </nav>

      {/* ═══════════════════════════════════════════════════
          1) HERO
         ═══════════════════════════════════════════════════ */}
      <section
        className="relative w-full overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #f8fafc 0%, #ffffff 50%, rgba(0, 87, 222, 0.05) 100%)",
          paddingTop: 80,
          paddingBottom: 80,
        }}
      >
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-12 lg:gap-16 items-center">
            {/* Texto */}
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
                  APLICAÇÃO
                </span>
                <h1
                  style={{
                    fontFamily: KNOCKOUT,
                    fontSize: "clamp(32px, 4.5vw, 56px)",
                    fontWeight: 500,
                    lineHeight: 1,
                    textTransform: "uppercase",
                    color: "#0f172a",
                    marginBottom: 20,
                  }}
                >
                  {aplicacao.nome}
                </h1>
                <p
                  style={{
                    fontSize: 17,
                    lineHeight: 1.7,
                    color: "#475569",
                    marginBottom: 24,
                  }}
                >
                  {aplicacao.descricaoCurta}
                </p>

                {/* Setores chips */}
                <div className="flex flex-wrap gap-2">
                  {aplicacao.setores.map((s) => (
                    <Link
                      key={s}
                      to="/setores"
                      className="inline-flex items-center px-3 py-1.5 text-xs font-medium uppercase tracking-wide bg-[#0057DE]/10 text-[#0057DE] rounded-full hover:bg-[#0057DE]/15 transition-colors"
                    >
                      {s}
                    </Link>
                  ))}
                </div>
              </AnimateOnScroll>
            </div>

            {/* Imagem */}
            <AnimateOnScroll direction="left">
              <div className="relative aspect-[4/3] overflow-hidden rounded-2xl shadow-xl">
                <img
                  src={aplicacao.imagem}
                  alt={aplicacao.nome}
                  loading="eager"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-tr from-[#0057DE]/10 to-transparent" />
              </div>
            </AnimateOnScroll>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          2) SOBRE A APLICAÇÃO
         ═══════════════════════════════════════════════════ */}
      <section className="bg-white py-16 md:py-20 border-t border-slate-200">
        <div className="max-w-[1440px] mx-auto px-4 md:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-12 lg:gap-16">
            <AnimateOnScroll>
              <div className="lg:sticky lg:top-32">
                <span className="text-xs font-bold tracking-[0.2em] uppercase text-[#0057DE] mb-3 block">
                  Sobre a Aplicação
                </span>
                <h2
                  className="text-2xl md:text-3xl font-bold leading-tight text-slate-900"
                  style={{ fontFamily: KNOCKOUT, textTransform: "uppercase", fontWeight: 500 }}
                >
                  Como a Gaiatec resolve este desafio
                </h2>
              </div>
            </AnimateOnScroll>

            <AnimateOnScroll>
              <div className="prose max-w-none">
                <p className="text-base md:text-[17px] text-slate-700 leading-relaxed">
                  {aplicacao.descricaoCompleta}
                </p>
              </div>
            </AnimateOnScroll>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          3) PRODUTOS RELACIONADOS
         ═══════════════════════════════════════════════════ */}
      {aplicacao.produtosRelacionados.length > 0 && (
        <section className="bg-slate-50 py-16 md:py-20 border-t border-slate-200">
          <div className="max-w-[1440px] mx-auto px-4 md:px-8">
            <AnimateOnScroll>
              <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10">
                <div>
                  <span className="text-xs font-bold tracking-[0.2em] uppercase text-[#0057DE] mb-3 block">
                    PRODUTOS
                  </span>
                  <h2
                    className="text-2xl md:text-3xl font-bold leading-tight text-slate-900"
                    style={{ fontFamily: KNOCKOUT, textTransform: "uppercase", fontWeight: 500 }}
                  >
                    Produtos para esta aplicação
                  </h2>
                </div>
                <Link
                  to="/produtos"
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-[#0057DE] hover:text-[#0046b3] transition-colors"
                >
                  Ver catálogo completo <ArrowUpRight size={16} />
                </Link>
              </div>
            </AnimateOnScroll>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {aplicacao.produtosRelacionados.map((produto, i) => (
                <AnimateOnScroll key={produto} delay={i * 0.05}>
                  <Link
                    to="/produtos"
                    target="_blank"
                    rel="noopener"
                    className="group flex items-center justify-between gap-4 p-5 bg-white border border-slate-200 rounded-lg hover:border-[#0057DE] hover:shadow-md transition-all"
                  >
                    <span className="text-sm md:text-base font-semibold text-slate-900 group-hover:text-[#0057DE] transition-colors">
                      {produto}
                    </span>
                    <ArrowRight
                      size={16}
                      className="text-[#0057DE] flex-shrink-0 group-hover:translate-x-1 transition-transform"
                    />
                  </Link>
                </AnimateOnScroll>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════
          4) SERVIÇOS RELACIONADOS
         ═══════════════════════════════════════════════════ */}
      {servicosResolvidos.length > 0 && (
        <section className="bg-white py-16 md:py-20 border-t border-slate-200">
          <div className="max-w-[1440px] mx-auto px-4 md:px-8">
            <AnimateOnScroll>
              <div className="mb-10">
                <span className="text-xs font-bold tracking-[0.2em] uppercase text-[#0057DE] mb-3 block">
                  SERVIÇOS APLICÁVEIS
                </span>
                <h2
                  className="text-2xl md:text-3xl font-bold leading-tight text-slate-900"
                  style={{ fontFamily: KNOCKOUT, textTransform: "uppercase", fontWeight: 500 }}
                >
                  Serviços técnicos para esta aplicação
                </h2>
              </div>
            </AnimateOnScroll>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {servicosResolvidos.map((srv, i) => (
                <AnimateOnScroll key={srv.slug} delay={i * 0.05}>
                  <Link
                    to={`/servicos/${srv.slug}`}
                    target="_blank"
                    rel="noopener"
                    className="group flex flex-col gap-3 p-5 bg-slate-50 border border-slate-200 rounded-lg hover:border-[#0057DE] hover:bg-white hover:shadow-md transition-all h-full"
                  >
                    <h3 className="text-sm md:text-base font-semibold text-slate-900 group-hover:text-[#0057DE] transition-colors leading-tight">
                      {srv.nome}
                    </h3>
                    <p className="text-xs text-slate-600 line-clamp-2 flex-1">
                      {srv.descricaoCurta}
                    </p>
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0057DE] group-hover:gap-2.5 transition-all">
                      Ver serviço <ChevronRight size={14} />
                    </span>
                  </Link>
                </AnimateOnScroll>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════
          5) CASOS DE USO
         ═══════════════════════════════════════════════════ */}
      {aplicacao.casosUso.length > 0 && (
        <section className="bg-slate-50 py-16 md:py-20 border-t border-slate-200">
          <div className="max-w-[1440px] mx-auto px-4 md:px-8">
            <AnimateOnScroll>
              <div className="mb-10 max-w-[700px]">
                <span className="text-xs font-bold tracking-[0.2em] uppercase text-[#0057DE] mb-3 block">
                  CASOS DE USO
                </span>
                <h2
                  className="text-2xl md:text-3xl font-bold leading-tight text-slate-900 mb-4"
                  style={{ fontFamily: KNOCKOUT, textTransform: "uppercase", fontWeight: 500 }}
                >
                  Onde esta aplicação é utilizada
                </h2>
              </div>
            </AnimateOnScroll>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
              {aplicacao.casosUso.map((caso, i) => (
                <AnimateOnScroll key={caso} delay={i * 0.05}>
                  <div className="flex items-start gap-3 p-5 bg-white border border-slate-200 rounded-lg">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#0057DE]/10 text-[#0057DE] flex items-center justify-center font-bold text-sm">
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <span className="text-sm md:text-base text-slate-700 leading-relaxed pt-1">
                      {caso}
                    </span>
                  </div>
                </AnimateOnScroll>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════
          6) BENEFÍCIOS / ROI
         ═══════════════════════════════════════════════════ */}
      {aplicacao.beneficios.length > 0 && (
        <section className="bg-white py-16 md:py-20 border-t border-slate-200">
          <div className="max-w-[1440px] mx-auto px-4 md:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-12 lg:gap-16 items-start">
              <AnimateOnScroll>
                <div>
                  <span className="text-xs font-bold tracking-[0.2em] uppercase text-[#0057DE] mb-3 block">
                    ROI E IMPACTO
                  </span>
                  <h2
                    className="text-2xl md:text-3xl font-bold leading-tight text-slate-900 mb-4"
                    style={{ fontFamily: KNOCKOUT, textTransform: "uppercase", fontWeight: 500 }}
                  >
                    Benefícios diretos
                  </h2>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Resultados mensuráveis que clientes Gaiatec alcançam ao implantar esta solução.
                  </p>
                </div>
              </AnimateOnScroll>

              <AnimateOnScroll>
                <ul className="space-y-3">
                  {aplicacao.beneficios.map((b, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-3 p-4 bg-slate-50 border border-slate-200 rounded-lg"
                    >
                      <CheckCircle2
                        size={20}
                        className="text-[#0057DE] flex-shrink-0 mt-0.5"
                        strokeWidth={2}
                      />
                      <span className="text-sm md:text-base text-slate-800 leading-relaxed">{b}</span>
                    </li>
                  ))}
                </ul>
              </AnimateOnScroll>
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════
          7) APLICAÇÕES SIMILARES
         ═══════════════════════════════════════════════════ */}
      {similares.length > 0 && (
        <section className="bg-slate-50 py-16 md:py-20 border-t border-slate-200">
          <div className="max-w-[1440px] mx-auto px-4 md:px-8">
            <AnimateOnScroll>
              <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10">
                <div>
                  <span className="text-xs font-bold tracking-[0.2em] uppercase text-[#0057DE] mb-3 block">
                    EXPLORE MAIS
                  </span>
                  <h2
                    className="text-2xl md:text-3xl font-bold leading-tight text-slate-900"
                    style={{ fontFamily: KNOCKOUT, textTransform: "uppercase", fontWeight: 500 }}
                  >
                    Aplicações similares
                  </h2>
                </div>
                <Link
                  to="/aplicacoes"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-[#0057DE] hover:text-[#0046b3] transition-colors"
                >
                  Ver todas as aplicações <ArrowRight size={16} />
                </Link>
              </div>
            </AnimateOnScroll>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
              {similares.map((sim, i) => (
                <AnimateOnScroll key={sim.slug} delay={i * 0.05}>
                  <Link
                    to={`/aplicacoes/${sim.slug}`}
                    className="group flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-[#0057DE] hover:shadow-lg transition-all"
                  >
                    <div className="h-40 overflow-hidden bg-slate-100">
                      <img
                        src={sim.imagem}
                        alt={sim.nome}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    </div>
                    <div className="p-4">
                      <h3 className="text-sm md:text-[15px] font-semibold text-slate-900 group-hover:text-[#0057DE] transition-colors leading-tight line-clamp-2">
                        {sim.nome}
                      </h3>
                    </div>
                  </Link>
                </AnimateOnScroll>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════
          8) CTA FINAL
         ═══════════════════════════════════════════════════ */}
      <CTABanner
        text={`Pronto para implantar ${aplicacao.nome.toLowerCase()} na sua operação? Nossa equipe técnica desenvolve solução customizada após análise técnica gratuita.`}
        primaryLabel="Solicitar Análise Técnica"
        secondaryLabel="Falar com Especialista"
      />
    </>
  );
}
