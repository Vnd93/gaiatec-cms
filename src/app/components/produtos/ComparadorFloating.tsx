import { Link } from "react-router";
import { X, ArrowRight, GitCompare } from "lucide-react";
import { useComparador } from "./ComparadorContext";

/**
 * Barra flutuante (fixed bottom-0) que aparece quando há 1+ produtos
 * no comparador (TASK 14).
 *
 * Mostra thumbnails dos produtos selecionados + botão "Comparar agora"
 * e indicador "X de 3" pra contagem visual.
 */
export function ComparadorFloating() {
  const { comparados, remove, clear } = useComparador();

  if (comparados.length === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[140] bg-white border-t border-slate-200 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
      <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4">
          {/* Header */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[#0057DE]/10 text-[#0057DE]">
              <GitCompare size={18} strokeWidth={2} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 leading-tight">
                Comparar produtos
              </p>
              <p className="text-xs text-slate-500">
                {comparados.length} de 3 selecionados
              </p>
            </div>
          </div>

          {/* Thumbnails */}
          <div className="flex flex-wrap gap-2 flex-1">
            {comparados.map((p) => (
              <div
                key={String(p.id)}
                className="group relative inline-flex items-center gap-2 pl-2 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg hover:border-[#0057DE] transition-colors"
              >
                {p.image && (
                  <div className="w-8 h-8 rounded overflow-hidden flex-shrink-0 bg-white">
                    <img
                      src={p.image}
                      alt={p.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <span className="text-xs font-medium text-slate-700 max-w-[140px] truncate">
                  {p.name}
                </span>
                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full text-slate-400 hover:bg-red-100 hover:text-red-600 transition-colors"
                  aria-label={`Remover ${p.name} da comparação`}
                >
                  <X size={14} />
                </button>
              </div>
            ))}

            {/* Slots vazios */}
            {Array.from({ length: 3 - comparados.length }).map((_, i) => (
              <div
                key={`slot-${i}`}
                className="hidden md:inline-flex items-center gap-2 pl-2 pr-3 py-1.5 border border-dashed border-slate-300 rounded-lg text-slate-400 text-xs"
              >
                <div className="w-8 h-8 rounded bg-slate-100" />
                Vazio
              </div>
            ))}
          </div>

          {/* CTAs */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={clear}
              className="text-xs text-slate-500 hover:text-slate-900 transition-colors px-3 py-2"
            >
              Limpar
            </button>
            <Link
              to="/produtos/comparador"
              className="inline-flex items-center gap-2 bg-[#0057DE] hover:bg-[#0046b3] text-white px-5 py-2.5 text-sm font-semibold rounded-md transition-colors"
            >
              Comparar agora
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
