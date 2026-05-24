import { useParams, Navigate, Link } from "react-router";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { aplicacaoBySlug, aplicacoes } from "../data/aplicacoes";
import { servicesList } from "../data/servicesList";
import { AnimateOnScroll } from "../components/useScrollAnimation";
import { PageHero } from "../components/PageHero";
import { CTABanner } from "../components/CTABanner";
import { SEO, buildBreadcrumb } from "../components/SEO";

const KNOCKOUT = "'Knockout HTF68', sans-serif";
const BRAND = "#0057DE";

/* Container alinhado com o PageHero (maxWidth 1440 · padding lateral 30px). */
const CONTAINER = "max-w-[1440px] mx-auto px-5 md:px-[30px]";

/**
 * /aplicacoes/[slug] — Detalhe de uma Aplicação.
 *
 * Redesenho minimalista/editorial, consistente com o restante do site:
 *   1. PageHero (mesmo padrão 772px do biodigestor)
 *   2. Intro editorial (lead + corpo) + setores como tags retas
 *   3. Soluções relacionadas (produtos · serviços) em listas com fios
 *   4. Casos de uso (numeração Knockout, sem caixas)
 *   5. Benefícios / ROI (seção escura para contraste)
 *   6. Aplicações similares (imagem + legenda, sem cartões pesados)
 *   7. CTA final compartilhado
 */
export default function AplicacaoPage() {
  const { slug } = useParams();
  const aplicacao = aplicacaoBySlug(slug || "");

  if (!aplicacao) return <Navigate to="/aplicacoes" replace />;

  const similares = aplicacoes
    .filter((a) => a.slug !== aplicacao.slug && a.setores.some((s) => aplicacao.setores.includes(s)))
    .slice(0, 3);

  const servicosResolvidos = aplicacao.servicosRelacionados
    .map((slugServico) => servicesList.find((s) => s.slug === slugServico))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  const temProdutos = aplicacao.produtosRelacionados.length > 0;
  const temServicos = servicosResolvidos.length > 0;

  return (
    <>
      <SEO
        title={aplicacao.nome}
        description={aplicacao.descricaoCurta}
        path={`/aplicacoes/${aplicacao.slug}`}
        image={aplicacao.imagem}
        ogType="article"
        keywords={[aplicacao.nome, ...aplicacao.setores, "Gaiatec"].join(", ")}
        schema={[
          {
            "@context": "https://schema.org",
            "@type": "Article",
            headline: aplicacao.nome,
            description: aplicacao.descricaoCompleta,
            image: aplicacao.imagem,
            author: { "@type": "Organization", name: "Gaiatec Sistemas" },
            publisher: { "@type": "Organization", name: "Gaiatec Sistemas", url: "https://gaiatecsistemas.com.br" },
          },
          buildBreadcrumb([
            { label: "Início", path: "/" },
            { label: "Aplicações", path: "/aplicacoes" },
            { label: aplicacao.nome, path: `/aplicacoes/${aplicacao.slug}` },
          ]),
        ]}
      />

      {/* ═══════════════════ 1) HERO ═══════════════════ */}
      <PageHero overline="Aplicação" title={aplicacao.nome} image={aplicacao.imagem} />

      {/* ═══════════════════ 2) INTRO ═══════════════════ */}
      <section className="bg-white py-20 md:py-28">
        <div className={CONTAINER}>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.7fr] gap-12 lg:gap-24">
            <AnimateOnScroll>
              <div className="lg:sticky lg:top-32">
                <span style={{ display: "block", fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: BRAND, marginBottom: 16 }}>
                  Sobre a aplicação
                </span>
                <h2 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(28px, 3vw, 40px)", fontWeight: 500, lineHeight: 1.02, textTransform: "uppercase", color: "#0f172a" }}>
                  Como a Gaiatec resolve
                </h2>

                {aplicacao.setores.length > 0 && (
                  <div className="mt-9">
                    <span style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#94a3b8", marginBottom: 12 }}>
                      Setores
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {aplicacao.setores.map((s) => (
                        <Link
                          key={s}
                          to="/setores"
                          className="inline-flex items-center px-4 py-2 text-[13px] border border-slate-300 text-slate-700 hover:border-[#0057DE] hover:text-[#0057DE] transition-colors"
                        >
                          {s}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </AnimateOnScroll>

            <AnimateOnScroll>
              <div>
                <p style={{ fontSize: "clamp(20px, 2.1vw, 26px)", fontWeight: 300, lineHeight: 1.5, color: "#1e293b" }}>
                  {aplicacao.descricaoCurta}
                </p>
                <p style={{ fontSize: 17, lineHeight: 1.85, color: "#64748b", marginTop: 28 }}>
                  {aplicacao.descricaoCompleta}
                </p>
              </div>
            </AnimateOnScroll>
          </div>
        </div>
      </section>

      {/* ═══════════════════ 3) SOLUÇÕES RELACIONADAS ═══════════════════ */}
      {(temProdutos || temServicos) && (
        <section className="bg-slate-50 py-20 md:py-28 border-t border-slate-200">
          <div className={CONTAINER}>
            <AnimateOnScroll>
              <div className="mb-12 md:mb-16 max-w-[640px]">
                <span style={{ display: "block", fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: BRAND, marginBottom: 16 }}>
                  Soluções
                </span>
                <h2 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(28px, 3.4vw, 44px)", fontWeight: 500, lineHeight: 1, textTransform: "uppercase", color: "#0f172a" }}>
                  Produtos e serviços para esta aplicação
                </h2>
              </div>
            </AnimateOnScroll>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-24">
              {/* Produtos */}
              {temProdutos && (
                <AnimateOnScroll>
                  <div>
                    <div className="flex items-end justify-between gap-4 pb-4 border-b border-slate-300">
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "#0f172a" }}>
                        Produtos
                      </span>
                      <Link to="/produtos" className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-[#0057DE] hover:text-[#0046b3] transition-colors">
                        Ver catálogo <ArrowRight size={13} />
                      </Link>
                    </div>
                    {aplicacao.produtosRelacionados.map((produto) => (
                      <Link
                        key={produto}
                        to="/produtos"
                        className="group flex items-center justify-between gap-4 py-5 border-b border-slate-200 transition-colors"
                      >
                        <span className="text-[15px] md:text-base text-slate-800 group-hover:text-[#0057DE] transition-colors">
                          {produto}
                        </span>
                        <ArrowRight size={16} className="flex-shrink-0 text-slate-300 group-hover:text-[#0057DE] group-hover:translate-x-1 transition-all" />
                      </Link>
                    ))}
                  </div>
                </AnimateOnScroll>
              )}

              {/* Serviços */}
              {temServicos && (
                <AnimateOnScroll delay={0.1}>
                  <div>
                    <div className="flex items-end justify-between gap-4 pb-4 border-b border-slate-300">
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "#0f172a" }}>
                        Serviços
                      </span>
                      <Link to="/servicos" className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-[#0057DE] hover:text-[#0046b3] transition-colors">
                        Ver serviços <ArrowRight size={13} />
                      </Link>
                    </div>
                    {servicosResolvidos.map((srv) => (
                      <Link
                        key={srv.slug}
                        to={`/servicos/${srv.slug}`}
                        className="group flex items-center justify-between gap-4 py-5 border-b border-slate-200 transition-colors"
                      >
                        <span className="text-[15px] md:text-base text-slate-800 group-hover:text-[#0057DE] transition-colors">
                          {srv.nome}
                        </span>
                        <ArrowRight size={16} className="flex-shrink-0 text-slate-300 group-hover:text-[#0057DE] group-hover:translate-x-1 transition-all" />
                      </Link>
                    ))}
                  </div>
                </AnimateOnScroll>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════ 4) CASOS DE USO ═══════════════════ */}
      {aplicacao.casosUso.length > 0 && (
        <section className="bg-white py-20 md:py-28 border-t border-slate-200">
          <div className={CONTAINER}>
            <AnimateOnScroll>
              <div className="mb-12 md:mb-16 max-w-[640px]">
                <span style={{ display: "block", fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: BRAND, marginBottom: 16 }}>
                  Casos de uso
                </span>
                <h2 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(28px, 3.4vw, 44px)", fontWeight: 500, lineHeight: 1, textTransform: "uppercase", color: "#0f172a" }}>
                  Onde esta aplicação é utilizada
                </h2>
              </div>
            </AnimateOnScroll>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16 lg:gap-x-24 border-t border-slate-200">
              {aplicacao.casosUso.map((caso, i) => (
                <AnimateOnScroll key={caso} delay={(i % 2) * 0.08}>
                  <div className="flex items-baseline gap-6 py-6 border-b border-slate-200">
                    <span style={{ fontFamily: KNOCKOUT, fontSize: "clamp(28px, 2.6vw, 38px)", fontWeight: 500, lineHeight: 1, color: "rgba(0,87,222,0.30)", flexShrink: 0, minWidth: 52 }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[15px] md:text-base text-slate-700 leading-relaxed">
                      {caso}
                    </span>
                  </div>
                </AnimateOnScroll>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════ 5) BENEFÍCIOS / ROI (dark) ═══════════════════ */}
      {aplicacao.beneficios.length > 0 && (
        <section className="bg-[#080d1a] py-20 md:py-28">
          <div className={CONTAINER}>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.7fr] gap-12 lg:gap-24">
              <AnimateOnScroll>
                <div className="lg:sticky lg:top-32">
                  <span style={{ display: "block", fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#4d94ff", marginBottom: 16 }}>
                    ROI e impacto
                  </span>
                  <h2 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(28px, 3.4vw, 44px)", fontWeight: 500, lineHeight: 1, textTransform: "uppercase", color: "#fff", marginBottom: 18 }}>
                    Benefícios diretos
                  </h2>
                  <p className="text-[15px] leading-relaxed text-slate-400 max-w-[360px]">
                    Resultados mensuráveis que clientes Gaiatec alcançam ao implantar esta solução.
                  </p>
                </div>
              </AnimateOnScroll>

              <AnimateOnScroll delay={0.1}>
                <div className="border-t border-white/10">
                  {aplicacao.beneficios.map((b, i) => (
                    <div key={i} className="flex items-start gap-5 py-6 border-b border-white/10">
                      <CheckCircle2 size={20} strokeWidth={1.75} className="text-[#4d94ff] flex-shrink-0 mt-0.5" />
                      <span className="text-[16px] md:text-[17px] text-slate-200 leading-relaxed">{b}</span>
                    </div>
                  ))}
                </div>
              </AnimateOnScroll>
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════ 6) APLICAÇÕES SIMILARES ═══════════════════ */}
      {similares.length > 0 && (
        <section className="bg-white py-20 md:py-28 border-t border-slate-200">
          <div className={CONTAINER}>
            <AnimateOnScroll>
              <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12 md:mb-16">
                <div>
                  <span style={{ display: "block", fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: BRAND, marginBottom: 16 }}>
                    Explore mais
                  </span>
                  <h2 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(28px, 3.4vw, 44px)", fontWeight: 500, lineHeight: 1, textTransform: "uppercase", color: "#0f172a" }}>
                    Aplicações similares
                  </h2>
                </div>
                <Link to="/aplicacoes" className="inline-flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-[#0057DE] hover:text-[#0046b3] transition-colors flex-shrink-0">
                  Ver todas <ArrowRight size={15} />
                </Link>
              </div>
            </AnimateOnScroll>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 lg:gap-10">
              {similares.map((sim, i) => (
                <AnimateOnScroll key={sim.slug} delay={i * 0.06}>
                  <Link to={`/aplicacoes/${sim.slug}`} className="group block">
                    <div className="overflow-hidden" style={{ aspectRatio: "4 / 3" }}>
                      <img
                        src={sim.imagem}
                        alt={sim.nome}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-4 mt-5">
                      <h3 className="text-[15px] md:text-base font-semibold text-slate-900 group-hover:text-[#0057DE] transition-colors leading-snug">
                        {sim.nome}
                      </h3>
                      <ArrowRight size={16} className="flex-shrink-0 text-slate-300 group-hover:text-[#0057DE] group-hover:translate-x-1 transition-all" />
                    </div>
                  </Link>
                </AnimateOnScroll>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════ 7) CTA FINAL ═══════════════════ */}
      <CTABanner
        text={`Pronto para implantar ${aplicacao.nome.toLowerCase()} na sua operação? Nossa equipe técnica desenvolve solução customizada após análise técnica gratuita.`}
        primaryLabel="Solicitar Análise Técnica"
        secondaryLabel="Falar com Especialista"
      />
    </>
  );
}
