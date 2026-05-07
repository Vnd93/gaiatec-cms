import { useState, useMemo } from "react";
import { Search, Lightbulb } from "lucide-react";
import { AnimateOnScroll } from "../components/useScrollAnimation";
import { CTABanner } from "../components/CTABanner";
import { AplicacaoCard } from "../components/aplicacoes/AplicacaoCard";
import { aplicacoes, setoresFromAplicacoes } from "../data/aplicacoes";
import { SEO, buildCollectionPageSchema } from "../components/SEO";

const KNOCKOUT = "'Knockout HTF68', sans-serif";

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

  const setoresList = useMemo(() => ["Todos", ...setoresFromAplicacoes], []);

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
  }, [busca, setorAtivo]);

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
      <section
        className="relative w-full overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #f8fafc 0%, #ffffff 50%, rgba(0, 87, 222, 0.05) 100%)",
          paddingTop: 120,
          paddingBottom: 60,
        }}
      >
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-12 items-center">
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
                  APLICAÇÕES
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
                  Aplicações Práticas para Sua Operação
                </h1>
                <p
                  style={{
                    fontSize: 17,
                    lineHeight: 1.7,
                    color: "#475569",
                    maxWidth: 640,
                  }}
                >
                  Casos de uso reais onde a Gaiatec entrega solução técnica integrada — instrumentação, automação e serviços trabalhando juntos para resolver desafios específicos da sua operação industrial.
                </p>
              </AnimateOnScroll>
            </div>

            {/* Visual decorativo */}
            <AnimateOnScroll direction="left">
              <div className="relative aspect-square max-w-[360px] mx-auto lg:mx-0">
                <div className="absolute inset-0 bg-gradient-to-br from-[#0057DE]/10 to-[#0057DE]/0 rounded-full blur-3xl" />
                <div className="relative w-full h-full flex items-center justify-center">
                  <div className="grid grid-cols-3 gap-4 w-full">
                    {aplicacoes.slice(0, 9).map((a, i) => (
                      <div
                        key={a.slug}
                        className="aspect-square rounded-lg bg-white border border-slate-200 shadow-sm flex items-center justify-center overflow-hidden"
                        style={{ animationDelay: `${i * 50}ms` }}
                      >
                        <img
                          src={a.imagem}
                          alt=""
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </AnimateOnScroll>
          </div>
        </div>
      </section>

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
