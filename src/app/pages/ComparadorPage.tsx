import { Link } from "react-router";
import { X, GitCompare, ArrowLeft, Check } from "lucide-react";
import { useComparador } from "../components/produtos/ComparadorContext";
import { CTABanner } from "../components/CTABanner";
import { SEO } from "../components/SEO";

const KNOCKOUT = "'Knockout HTF68', sans-serif";

/**
 * /produtos/comparador — Tabela de comparação até 3 produtos (TASK 14).
 *
 * Layout:
 *   - 3 colunas (uma por produto + uma para nomes de specs)
 *   - Empty state se nenhum produto selecionado
 *   - Highlight em células com diferença
 *   - CTA "Solicitar Orçamento dos selecionados"
 */
export default function ComparadorPage() {
  const { comparados, remove, clear } = useComparador();

  // Coleta todos os "specs" únicos pra montar as linhas da tabela
  const specKeys = Array.from(
    new Set(
      comparados.flatMap((p) =>
        p.specs ? Object.keys(p.specs) : [],
      ),
    ),
  );

  // Specs base que sempre aparecem (mesmo sem dados estruturados)
  const baseRows = [
    { key: "category", label: "Categoria", get: (p: typeof comparados[0]) => p.category },
    { key: "spec", label: "Especificação", get: (p: typeof comparados[0]) => p.spec },
    { key: "price", label: "Preço", get: (p: typeof comparados[0]) => p.price },
  ];

  /** Verifica se valores em uma row são todos iguais (não destaca diferença) */
  const allEqual = (values: (string | undefined)[]) => {
    if (values.length < 2) return true;
    const first = values[0];
    return values.every((v) => v === first);
  };

  return (
    <>
      <SEO
        title="Comparador de Produtos"
        description="Compare até 3 produtos lado a lado por especificações técnicas. Identifique o equipamento ideal para sua aplicação industrial."
        path="/produtos/comparador"
        noindex
      />

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
              <Link to="/produtos" className="hover:text-[#0057DE] transition-colors">
                Produtos
              </Link>
            </li>
            <li className="text-slate-300">/</li>
            <li className="text-slate-900 font-medium">Comparador</li>
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
          paddingBottom: 40,
        }}
      >
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          <div className="flex items-center gap-3 mb-4">
            <Link
              to="/produtos"
              className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-[#0057DE] transition-colors"
            >
              <ArrowLeft size={14} />
              Voltar para produtos
            </Link>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-[#0057DE]/10 text-[#0057DE]">
              <GitCompare size={22} strokeWidth={2} />
            </div>
            <span className="inline-block text-xs font-bold tracking-[0.2em] uppercase text-[#0057DE]">
              COMPARADOR DE PRODUTOS
            </span>
          </div>
          <h1
            style={{
              fontFamily: KNOCKOUT,
              fontSize: "clamp(32px, 4vw, 52px)",
              fontWeight: 500,
              lineHeight: 1,
              textTransform: "uppercase",
              color: "#0f172a",
              marginBottom: 16,
            }}
          >
            {comparados.length === 0
              ? "Comparar Produtos"
              : `Comparando ${comparados.length} ${comparados.length === 1 ? "produto" : "produtos"}`}
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.6, color: "#475569", maxWidth: 640 }}>
            Compare especificações lado a lado e identifique o produto ideal para sua aplicação.
          </p>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          2) TABELA / EMPTY STATE
         ═══════════════════════════════════════════════════ */}
      <section className="bg-white py-16 md:py-20 border-t border-slate-200">
        <div className="max-w-[1440px] mx-auto px-4 md:px-8">
          {comparados.length === 0 ? (
            /* ─── Empty state ─── */
            <div className="max-w-[600px] mx-auto text-center py-16">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-slate-100 text-slate-400 mb-6">
                <GitCompare size={36} strokeWidth={1.5} />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-3">
                Nenhum produto selecionado
              </h2>
              <p className="text-base text-slate-600 mb-8">
                Adicione até 3 produtos à comparação clicando em "+ Comparar" nos cards de produto.
              </p>
              <Link
                to="/produtos"
                className="inline-flex items-center gap-2 bg-[#0057DE] hover:bg-[#0046b3] text-white px-7 py-3 text-sm font-semibold rounded-md transition-colors"
              >
                Explorar Produtos
              </Link>
            </div>
          ) : (
            <>
              {/* Action bar */}
              <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
                <p className="text-sm text-slate-600">
                  Diferenças entre produtos destacadas em <strong className="text-[#0057DE]">azul</strong>.
                </p>
                <button
                  type="button"
                  onClick={clear}
                  className="text-sm text-red-600 hover:text-red-700 font-medium"
                >
                  Limpar comparação
                </button>
              </div>

              {/* Tabela responsiva */}
              <div className="overflow-x-auto -mx-4 md:mx-0">
                <table className="w-full min-w-[640px] md:min-w-0 border-collapse">
                  <thead>
                    <tr>
                      {/* Coluna fixa esquerda */}
                      <th className="sticky left-0 bg-white text-left text-xs font-semibold uppercase tracking-wide text-slate-500 px-4 py-3 border-b border-slate-200 w-[180px]">
                        Especificação
                      </th>
                      {comparados.map((p) => (
                        <th
                          key={String(p.id)}
                          className="text-left px-4 py-3 border-b border-slate-200"
                          style={{ minWidth: 220 }}
                        >
                          <div className="flex flex-col gap-3">
                            {p.image && (
                              <div className="aspect-[4/3] bg-slate-50 rounded-lg overflow-hidden border border-slate-200">
                                <img
                                  src={p.image}
                                  alt={p.name}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            )}
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="text-sm md:text-base font-semibold text-slate-900 leading-tight">
                                {p.name}
                              </h3>
                              <button
                                type="button"
                                onClick={() => remove(p.id)}
                                className="flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full text-slate-400 hover:bg-red-100 hover:text-red-600 transition-colors"
                                aria-label={`Remover ${p.name}`}
                              >
                                <X size={16} />
                              </button>
                            </div>
                          </div>
                        </th>
                      ))}
                      {/* Slots vazios */}
                      {Array.from({ length: 3 - comparados.length }).map((_, i) => (
                        <th
                          key={`empty-${i}`}
                          className="text-left px-4 py-3 border-b border-slate-200 hidden lg:table-cell"
                          style={{ minWidth: 220 }}
                        >
                          <Link
                            to="/produtos"
                            className="flex flex-col items-center justify-center gap-2 aspect-[4/3] border-2 border-dashed border-slate-300 rounded-lg text-slate-400 hover:border-[#0057DE] hover:text-[#0057DE] transition-colors"
                          >
                            <span className="text-3xl font-light">+</span>
                            <span className="text-xs font-medium">Adicionar produto</span>
                          </Link>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {/* Specs base */}
                    {baseRows.map((row) => {
                      const values = comparados.map((p) => row.get(p));
                      const equal = allEqual(values.map((v) => (v ?? "—") as string));
                      return (
                        <tr key={row.key} className="border-b border-slate-100">
                          <td className="sticky left-0 bg-white text-xs font-semibold uppercase tracking-wide text-slate-500 px-4 py-4">
                            {row.label}
                          </td>
                          {values.map((v, i) => (
                            <td
                              key={i}
                              className={`px-4 py-4 text-sm ${
                                equal ? "text-slate-700" : "text-[#0057DE] font-semibold"
                              }`}
                            >
                              {v ?? <span className="text-slate-300">—</span>}
                            </td>
                          ))}
                          {Array.from({ length: 3 - comparados.length }).map((_, i) => (
                            <td key={`empty-${i}`} className="hidden lg:table-cell px-4 py-4 text-slate-300">
                              —
                            </td>
                          ))}
                        </tr>
                      );
                    })}

                    {/* Specs estruturadas (se houver) */}
                    {specKeys.map((key) => {
                      const values = comparados.map((p) =>
                        p.specs?.[key] !== undefined ? String(p.specs[key]) : undefined,
                      );
                      const equal = allEqual(values);
                      return (
                        <tr key={key} className="border-b border-slate-100">
                          <td className="sticky left-0 bg-white text-xs font-semibold uppercase tracking-wide text-slate-500 px-4 py-4">
                            {key}
                          </td>
                          {values.map((v, i) => (
                            <td
                              key={i}
                              className={`px-4 py-4 text-sm ${
                                equal ? "text-slate-700" : "text-[#0057DE] font-semibold"
                              }`}
                            >
                              {v ?? <span className="text-slate-300">—</span>}
                            </td>
                          ))}
                          {Array.from({ length: 3 - comparados.length }).map((_, i) => (
                            <td key={`empty-${i}`} className="hidden lg:table-cell px-4 py-4 text-slate-300">
                              —
                            </td>
                          ))}
                        </tr>
                      );
                    })}

                    {/* Linha CTA por produto */}
                    <tr>
                      <td className="sticky left-0 bg-white px-4 py-4">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Ações
                        </span>
                      </td>
                      {comparados.map((p) => (
                        <td key={String(p.id)} className="px-4 py-4">
                          <div className="flex flex-col gap-2">
                            {p.slug && (
                              <Link
                                to={`/produtos/${p.slug}`}
                                target="_blank"
                                className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-[#0057DE] border border-[#0057DE]/20 hover:bg-[#0057DE]/5 px-3 py-2 rounded-md transition-colors"
                              >
                                <Check size={12} /> Ver detalhes
                              </Link>
                            )}
                            <Link
                              to="/contato"
                              className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold bg-[#0057DE] text-white hover:bg-[#0046b3] px-3 py-2 rounded-md transition-colors"
                            >
                              Solicitar Orçamento
                            </Link>
                          </div>
                        </td>
                      ))}
                      {Array.from({ length: 3 - comparados.length }).map((_, i) => (
                        <td key={`empty-${i}`} className="hidden lg:table-cell px-4 py-4" />
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* CTA bottom */}
              <div className="mt-12 text-center">
                <Link
                  to="/contato"
                  className="inline-flex items-center gap-2 bg-[#0057DE] hover:bg-[#0046b3] text-white px-8 py-4 text-sm font-semibold rounded-md transition-colors"
                >
                  Solicitar Orçamento dos {comparados.length} produtos
                </Link>
              </div>
            </>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          3) CTA FINAL
         ═══════════════════════════════════════════════════ */}
      <CTABanner
        text="Não encontrou o produto certo? Nossa equipe técnica recomenda o produto ideal para sua aplicação após análise gratuita."
        primaryLabel="Falar com Especialista"
        secondaryLabel="Voltar para Produtos"
        secondaryHref="/produtos"
      />
    </>
  );
}
