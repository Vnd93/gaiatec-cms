import { createContext, useContext, useEffect, useState, useCallback } from "react";

/**
 * Comparador de Produtos (TASK 14)
 *
 * Context Provider que mantém uma lista de até 3 produtos selecionados pra
 * comparação, persistindo em localStorage entre sessões.
 *
 * API:
 *   const { comparados, add, remove, clear, isFull } = useComparador();
 *
 * Uso típico:
 *   - ProdutoCard chama `add(produto)` quando clica em "+ Comparar"
 *   - ComparadorFloating mostra barra fixa quando `comparados.length > 0`
 *   - ComparadorPage (/produtos/comparador) renderiza a tabela de specs
 */

export interface ProdutoComparavel {
  id: string | number;
  slug?: string;
  name: string;
  category?: string;
  image?: string;
  badge?: string;
  spec?: string;
  price?: string;
  /** Specs estruturadas pra render em colunas da tabela (key → value) */
  specs?: Record<string, string | number | undefined>;
}

const MAX_COMPARE = 3;
const STORAGE_KEY = "gaiatec:comparador:v1";

interface ComparadorContextValue {
  comparados: ProdutoComparavel[];
  add: (p: ProdutoComparavel) => boolean;
  remove: (idOrSlug: string | number) => void;
  clear: () => void;
  isFull: boolean;
  has: (idOrSlug: string | number) => boolean;
}

const ComparadorContext = createContext<ComparadorContextValue | null>(null);

export function ComparadorProvider({ children }: { children: React.ReactNode }) {
  const [comparados, setComparados] = useState<ProdutoComparavel[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as ProdutoComparavel[]) : [];
    } catch {
      return [];
    }
  });

  // Persiste em localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(comparados));
    } catch {
      // ignora erro de quota
    }
  }, [comparados]);

  const add = useCallback((p: ProdutoComparavel): boolean => {
    let result = false;
    setComparados((prev) => {
      // Já está? remove (toggle)
      const existente = prev.find(
        (item) => item.id === p.id || (p.slug && item.slug === p.slug),
      );
      if (existente) {
        result = false;
        return prev.filter((item) => item !== existente);
      }
      // Limite atingido?
      if (prev.length >= MAX_COMPARE) {
        result = false;
        return prev;
      }
      result = true;
      return [...prev, p];
    });
    return result;
  }, []);

  const remove = useCallback((idOrSlug: string | number) => {
    setComparados((prev) =>
      prev.filter((item) => item.id !== idOrSlug && item.slug !== idOrSlug),
    );
  }, []);

  const clear = useCallback(() => setComparados([]), []);

  const has = useCallback(
    (idOrSlug: string | number) =>
      comparados.some((item) => item.id === idOrSlug || item.slug === idOrSlug),
    [comparados],
  );

  return (
    <ComparadorContext.Provider
      value={{
        comparados,
        add,
        remove,
        clear,
        isFull: comparados.length >= MAX_COMPARE,
        has,
      }}
    >
      {children}
    </ComparadorContext.Provider>
  );
}

export function useComparador(): ComparadorContextValue {
  const ctx = useContext(ComparadorContext);
  if (!ctx) {
    // Fallback safe se ComparadorProvider não envolveu a árvore (ex: SSR / testes).
    // Retorna estado vazio + ações no-op pra não quebrar a UI.
    return {
      comparados: [],
      add: () => false,
      remove: () => {},
      clear: () => {},
      isFull: false,
      has: () => false,
    };
  }
  return ctx;
}
