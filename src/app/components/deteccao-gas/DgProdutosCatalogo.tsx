import { useState, useMemo } from "react";
import { Link } from "react-router";
import { ArrowRight, Search, X } from "lucide-react";
import { AnimateOnScroll } from "../useScrollAnimation";
import { dgCategorias, dgProdutos, getDgCategoria, HUB_BASE } from "../../data/deteccaoGas";
import { DgProdutoMidia } from "./DgProdutoMidia";

const KNOCKOUT = "'Knockout HTF68', sans-serif";
const BRAND = "#0057DE";

/** Remove acentos e caixa para busca tolerante. */
function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Catálogo completo da linha de Detecção de Gás — busca + filtro por categoria.
 * Ao selecionar uma categoria, abre uma barra de filtros personalizados à
 * esquerda (aplicações daquela categoria) ao lado dos produtos. Minimalista:
 * chips e checkboxes retos, cards com fio fino, código do modelo em destaque.
 */
export function DgProdutosCatalogo() {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [aplFilters, setAplFilters] = useState<string[]>([]);

  const selectCat = (slug: string | null) => {
    setCat(slug);
    setAplFilters([]);
  };
  const toggleApl = (a: string) =>
    setAplFilters((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));

  /* Facetas de aplicação da categoria ativa (com contagem, ordenadas por frequência). */
  const aplFacets = useMemo(() => {
    if (!cat) return [] as { label: string; count: number }[];
    const m = new Map<string, number>();
    dgProdutos
      .filter((p) => p.categoriaSlug === cat)
      .forEach((p) => (p.aplicacoes || []).forEach((a) => m.set(a, (m.get(a) || 0) + 1)));
    return [...m.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [cat]);

  const results = useMemo(() => {
    const q = normalize(query.trim());
    return dgProdutos.filter((p) => {
      if (cat && p.categoriaSlug !== cat) return false;
      if (q && !(normalize(p.nome).includes(q) || normalize(p.modelo).includes(q) || normalize(p.descricao).includes(q))) return false;
      if (aplFilters.length && !aplFilters.some((a) => (p.aplicacoes || []).includes(a))) return false;
      return true;
    });
  }, [query, cat, aplFilters]);

  const showSidebar = cat !== null && aplFacets.length > 0;

  const chip = (on: boolean) =>
    `inline-flex items-center px-4 py-2 text-[13px] whitespace-nowrap border transition-colors ${
      on ? "border-[#0057DE] bg-[#0057DE] text-white" : "border-slate-300 text-slate-600 hover:border-[#0057DE] hover:text-[#0057DE]"
    }`;

  const gridCols = showSidebar
    ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
    : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

  const ProdGrid = (
    results.length === 0 ? (
      <div className="border border-slate-200 bg-white py-20 px-6 text-center">
        <p className="text-slate-600 text-[15px] mb-2">Nenhum produto encontrado.</p>
        <p className="text-slate-400 text-[13px]">Ajuste a busca ou os filtros.</p>
      </div>
    ) : (
      <div className={`grid ${gridCols} gap-4`}>
        {results.map((p) => (
          <Link
            key={`${p.categoriaSlug}-${p.slug}`}
            to={`${HUB_BASE}/${p.categoriaSlug}/${p.slug}`}
            className="group flex flex-col bg-white border border-slate-200 hover:border-[#0057DE] transition-colors overflow-hidden"
          >
            <DgProdutoMidia modelo={p.modelo} imagem={p.imagem} aspect="66%" modeloSize={30} />
            <div className="flex flex-col gap-2 p-5 flex-1">
              <span style={{ fontFamily: KNOCKOUT, fontSize: 16, fontWeight: 500, color: BRAND, textTransform: "uppercase", lineHeight: 1, letterSpacing: "0.02em" }}>
                {p.modelo}
              </span>
              <h3 className="text-[14px] font-semibold text-slate-900 leading-snug" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                {p.nome}
              </h3>
              <div className="mt-auto pt-2 flex items-center justify-between gap-3">
                <span className="text-[10px] uppercase tracking-[0.1em] text-slate-400 leading-tight">
                  {getDgCategoria(p.categoriaSlug)?.nome}
                </span>
                <ArrowRight size={16} className="flex-shrink-0 text-slate-300 group-hover:text-[#0057DE] group-hover:translate-x-1 transition-all" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    )
  );

  return (
    <section className="bg-slate-50 border-t border-slate-200" style={{ padding: "100px 0" }}>
      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
        <AnimateOnScroll>
          <div className="mb-10 md:mb-12 max-w-[640px]">
            <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: BRAND, marginBottom: 16 }}>
              Catálogo completo
            </span>
            <h2 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 500, lineHeight: 1, textTransform: "uppercase", color: "#111" }}>
              Todos os produtos
            </h2>
          </div>
        </AnimateOnScroll>

        {/* Busca + filtros por categoria */}
        <div className="flex flex-col gap-5 mb-7">
          <div className="relative max-w-[480px]">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome ou modelo…"
              className="w-full bg-white border border-slate-200 pl-11 pr-10 py-3 text-[14px] text-slate-800 placeholder:text-slate-400 outline-none focus:border-[#0057DE] transition-colors"
            />
            {query && (
              <button type="button" aria-label="Limpar busca" onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors">
                <X size={16} />
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => selectCat(null)} className={chip(cat === null)}>
              Todos
            </button>
            {dgCategorias.map((c) => (
              <button key={c.slug} type="button" onClick={() => selectCat(c.slug)} className={chip(cat === c.slug)}>
                {c.nome}
              </button>
            ))}
          </div>
        </div>

        <p className="text-[13px] text-slate-500 mb-6">
          {results.length} {results.length === 1 ? "produto" : "produtos"}
          {cat ? ` · ${getDgCategoria(cat)?.nome}` : ""}
          {aplFilters.length > 0 ? ` · ${aplFilters.length} ${aplFilters.length === 1 ? "filtro" : "filtros"}` : ""}
        </p>

        {showSidebar ? (
          <div className="grid grid-cols-1 lg:grid-cols-[250px_1fr] gap-8 lg:gap-12 items-start">
            {/* ─── Sidebar de filtros personalizados ─── */}
            <aside className="lg:sticky lg:top-28">
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-300 mb-4">
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#0f172a" }}>
                  Aplicações
                </span>
                {aplFilters.length > 0 && (
                  <button type="button" onClick={() => setAplFilters([])} className="text-[12px] text-[#0057DE] hover:text-[#0046b3] transition-colors">
                    Limpar
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-1 max-h-[460px] overflow-y-auto pr-1 [scrollbar-width:thin]">
                {aplFacets.map((f) => {
                  const on = aplFilters.includes(f.label);
                  return (
                    <label key={f.label} className="group flex items-start gap-3 cursor-pointer py-1.5">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleApl(f.label)}
                        className="mt-0.5 w-4 h-4 flex-shrink-0 accent-[#0057DE] cursor-pointer"
                      />
                      <span className={`text-[13px] leading-snug transition-colors ${on ? "text-slate-900" : "text-slate-600 group-hover:text-slate-900"}`}>
                        {f.label} <span className="text-slate-400">({f.count})</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </aside>

            {/* ─── Produtos ─── */}
            <div>{ProdGrid}</div>
          </div>
        ) : (
          ProdGrid
        )}
      </div>
    </section>
  );
}
