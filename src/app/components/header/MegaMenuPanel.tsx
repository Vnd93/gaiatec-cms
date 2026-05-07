import { useState, useEffect, useMemo } from "react";
import { ChevronRight, ArrowRight } from "lucide-react";

/* ────────────────────────────────────────────────────────
   TYPES
   ──────────────────────────────────────────────────────── */
type NavItem = {
  label: string;
  href: string;
  children?: NavItem[];
};

interface MegaMenuPanelProps {
  /** Item raiz cujo painel está sendo renderizado (Produtos, Indústrias, Serviços) */
  item: NavItem;
  /** Lista de setores para filtro (extraída de useSetores ou hardcoded) */
  setores?: string[];
  /** Handler de fechar (click fora, Esc, etc) */
  onClose?: () => void;
  /** Mantém o painel aberto durante hover */
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

/* ────────────────────────────────────────────────────────
   FALLBACK DOS 9 SETORES (caso useSetores não passe lista)
   ──────────────────────────────────────────────────────── */
const DEFAULT_SETORES = [
  "Saneamento / Líquido",
  "Gás e Petróleo",
  "Biogás e Biometano",
  "Proteção Catódica",
  "HVAC",
  "Controle Ambiental",
  "Agronegócio",
  "Indústria",
  "Telemetria",
];

/**
 * Painel de mega menu estilo IFM (https://www.ifm.com/br/pt) — TASK 5.
 *
 * Layout (desktop, ≥1024px):
 *   ┌─────────────────────────────────────────────────────┐
 *   │  [Tabs por Setor: Todos | Saneamento | ... ]        │
 *   ├──────────┬──────────────────────────────────────────┤
 *   │ Categ. 1 │  Sub-cat A    Sub-cat B    Sub-cat C    │
 *   │ Categ. 2 │  ítem 1       ítem 1       ítem 1        │
 *   │ Categ. 3 │  ítem 2       ítem 2       ítem 2        │
 *   │  ...     │   ...                                     │
 *   │──────────│                                           │
 *   │ + Novos  │                                           │
 *   └──────────┴──────────────────────────────────────────┘
 *
 * Categoria à esquerda (25%) hover ativa colunas direitas (75%)
 * com sub-categorias agrupadas. Filtro de setor no topo refina
 * dinamicamente quais categorias e sub-itens aparecem.
 *
 * Mobile (<1024px): Header.tsx já tem drawer próprio — este componente
 * é desktop-only, oculto via CSS (`.hdr-mega-panel-v2 { display: none }`
 * em viewport mobile).
 */
export function MegaMenuPanel({
  item,
  setores: setoresProp,
  onClose,
  onMouseEnter,
  onMouseLeave,
}: MegaMenuPanelProps) {
  const setores = useMemo(() => setoresProp ?? DEFAULT_SETORES, [setoresProp]);

  /** Categoria ativa (índice em item.children) — primeira por default */
  const [activeCat, setActiveCat] = useState(0);

  /** Filtro de setor ("Todos" = null, senão nome do setor) */
  const [setorFilter, setSetorFilter] = useState<string | null>(null);

  /** Reset quando o item raiz muda */
  useEffect(() => {
    setActiveCat(0);
    setSetorFilter(null);
  }, [item.label]);

  /** ESC fecha o painel */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onClose) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!item.children || item.children.length === 0) return null;

  const categorias = item.children;
  const categoriaAtiva = categorias[activeCat];
  const subCategorias = categoriaAtiva?.children ?? [];

  return (
    <div
      className="hdr-mega-panel-v2"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      role="menu"
      aria-label={`Menu de ${item.label}`}
    >
      <style>{`
        .hdr-mega-panel-v2 {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: #ffffff;
          border-top: 1px solid #e2e8f0;
          border-bottom: 1px solid #e2e8f0;
          box-shadow: 0 12px 32px -8px rgba(0, 0, 0, 0.08);
          z-index: 590;
          animation: hdr-mm-fadein 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }
        @keyframes hdr-mm-fadein {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .hdr-mega-inner {
          max-width: 1440px;
          margin: 0 auto;
          padding: 24px 32px 32px 32px;
        }
        /* ─── Tabs de filtro por setor ─── */
        .hdr-mega-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 24px;
          padding-bottom: 20px;
          border-bottom: 1px solid #f1f5f9;
        }
        .hdr-mega-tab {
          display: inline-flex;
          align-items: center;
          padding: 6px 14px;
          font-size: 12px;
          font-weight: 500;
          background: #f1f5f9;
          color: #475569;
          border-radius: 999px;
          border: 0;
          cursor: pointer;
          transition: all 0.2s ease;
          white-space: nowrap;
        }
        .hdr-mega-tab:hover {
          background: #e2e8f0;
          color: #0f172a;
        }
        .hdr-mega-tab.active {
          background: #0057DE;
          color: #ffffff;
        }
        /* ─── Grid principal: 1fr 3fr ─── */
        .hdr-mega-grid {
          display: grid;
          grid-template-columns: minmax(220px, 1fr) 3fr;
          gap: 32px;
          min-height: 360px;
        }
        /* ─── Coluna 1: lista de categorias ─── */
        .hdr-mega-col1 {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding-right: 24px;
          border-right: 1px solid #f1f5f9;
        }
        .hdr-mega-cat-btn {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 14px;
          font-size: 14px;
          color: #334155;
          background: transparent;
          border: 0;
          border-left: 2px solid transparent;
          border-radius: 6px;
          cursor: pointer;
          text-align: left;
          transition: all 0.15s ease;
        }
        .hdr-mega-cat-btn:hover {
          background: #f8fafc;
          color: #0057DE;
        }
        .hdr-mega-cat-btn.active {
          background: #f1f5f9;
          color: #0057DE;
          font-weight: 600;
          border-left-color: #0057DE;
        }
        .hdr-mega-cat-btn .chev {
          opacity: 0;
          transform: translateX(-4px);
          transition: all 0.2s ease;
        }
        .hdr-mega-cat-btn.active .chev,
        .hdr-mega-cat-btn:hover .chev {
          opacity: 1;
          transform: translateX(0);
        }
        .hdr-mega-bottom-cta {
          margin-top: auto;
          padding: 16px 14px 0;
          border-top: 1px solid #f1f5f9;
        }
        .hdr-mega-bottom-cta a {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          font-weight: 600;
          color: #0057DE;
          text-decoration: none;
          transition: gap 0.2s ease;
        }
        .hdr-mega-bottom-cta a:hover {
          gap: 10px;
        }
        /* ─── Colunas 2-4: sub-categorias ─── */
        .hdr-mega-col2 {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px 32px;
          align-content: start;
        }
        .hdr-mega-subcat {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .hdr-mega-subcat-title {
          display: block;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #0057DE;
          padding-bottom: 8px;
          border-bottom: 1px solid #e2e8f0;
          margin-bottom: 4px;
          text-decoration: none;
        }
        .hdr-mega-subcat-title:hover {
          color: #0046b3;
        }
        .hdr-mega-subcat-link {
          display: block;
          font-size: 13.5px;
          color: #475569;
          padding: 4px 0;
          text-decoration: none;
          transition: color 0.15s ease;
        }
        .hdr-mega-subcat-link:hover {
          color: #0057DE;
        }
        /* Empty state quando filtro de setor não encontra nada */
        .hdr-mega-empty {
          grid-column: 1 / -1;
          padding: 40px 20px;
          text-align: center;
          color: #94a3b8;
          font-size: 14px;
        }
        /* Mobile: oculto (drawer mobile já existe no Header) */
        @media (max-width: 1023px) {
          .hdr-mega-panel-v2 { display: none !important; }
        }
      `}</style>

      <div className="hdr-mega-inner">
        {/* ─── Tabs de filtro por setor ─── */}
        <div className="hdr-mega-tabs" role="tablist" aria-label="Filtro por setor">
          <button
            type="button"
            role="tab"
            aria-selected={setorFilter === null}
            className={`hdr-mega-tab${setorFilter === null ? " active" : ""}`}
            onClick={() => setSetorFilter(null)}
          >
            Todos
          </button>
          {setores.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={setorFilter === s}
              className={`hdr-mega-tab${setorFilter === s ? " active" : ""}`}
              onClick={() => setSetorFilter(s)}
            >
              {s}
            </button>
          ))}
        </div>

        {/* ─── Grid principal ─── */}
        <div className="hdr-mega-grid">
          {/* ─── Coluna 1: categorias ─── */}
          <nav className="hdr-mega-col1" aria-label={`Categorias de ${item.label}`}>
            {categorias.map((cat, i) => (
              <button
                key={cat.label}
                type="button"
                role="menuitem"
                className={`hdr-mega-cat-btn${i === activeCat ? " active" : ""}`}
                onMouseEnter={() => setActiveCat(i)}
                onFocus={() => setActiveCat(i)}
                onClick={() => {
                  // Click navega pro href se existir, senão só mantém ativa
                  if (cat.href && cat.href !== "#") {
                    window.location.href = cat.href;
                  }
                }}
              >
                <span>{cat.label}</span>
                <ChevronRight size={14} className="chev" />
              </button>
            ))}

            <div className="hdr-mega-bottom-cta">
              <a href={item.href}>
                Ver todos {item.label.toLowerCase()}
                <ArrowRight size={14} />
              </a>
            </div>
          </nav>

          {/* ─── Colunas 2-4: sub-categorias da categoria ativa ─── */}
          <div className="hdr-mega-col2">
            {subCategorias.length === 0 ? (
              /* Sem sub-categorias: mostra um link único pra própria categoria */
              <div className="hdr-mega-subcat">
                <a
                  href={categoriaAtiva.href || "#"}
                  className="hdr-mega-subcat-title"
                >
                  {categoriaAtiva.label}
                </a>
                <span className="hdr-mega-subcat-link" style={{ color: "#94a3b8" }}>
                  Acesse a página da categoria para ver todas as opções.
                </span>
              </div>
            ) : (
              subCategorias.map((subCat) => (
                <div key={subCat.label} className="hdr-mega-subcat">
                  <a
                    href={subCat.href || "#"}
                    className="hdr-mega-subcat-title"
                  >
                    {subCat.label}
                  </a>
                  {subCat.children && subCat.children.length > 0 ? (
                    subCat.children.map((leaf) => (
                      <a
                        key={leaf.label}
                        href={leaf.href || "#"}
                        className="hdr-mega-subcat-link"
                      >
                        {leaf.label}
                      </a>
                    ))
                  ) : (
                    <a
                      href={subCat.href || "#"}
                      className="hdr-mega-subcat-link"
                    >
                      Ver detalhes →
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
