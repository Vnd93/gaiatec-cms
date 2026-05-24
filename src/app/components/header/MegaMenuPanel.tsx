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
  /** Tema do painel — segue o estado do header (dark no topo, light ao rolar) */
  theme?: "dark" | "light";
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
 * Painel de mega menu — Indústrias / Produtos / Serviços (desktop ≥1024px).
 *
 * Theme-aware: herda o estado visual do header via prop `theme`.
 *   - dark  (topo da página, header preto)  → superfície near-black
 *   - light (rolado, header branco)         → superfície branca
 *
 * Linguagem visual: tipográfica e contida — sem pills arredondadas nem
 * barra colorida na lateral. Estado ativo é comunicado por cor de acento
 * + peso + chevron deslizante. Azul-brand (#0057DE) reservado só para
 * interação (categoria ativa, hover, CTA). Mobile usa o drawer do Header.
 */
export function MegaMenuPanel({
  item,
  setores: setoresProp,
  theme = "light",
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
      data-theme={theme}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      role="menu"
      aria-label={`Menu de ${item.label}`}
    >
      <style>{`
        .hdr-mega-panel-v2 {
          --mm-bg: #ffffff;
          --mm-border: rgba(15, 23, 42, 0.08);
          --mm-divider: rgba(15, 23, 42, 0.07);
          --mm-text: #0f172a;
          --mm-muted: #5b6675;
          --mm-subtle: #94a3b8;
          --mm-accent: #0057DE;
          --mm-shadow: 0 18px 44px -16px rgba(2, 16, 43, 0.16);

          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: var(--mm-bg);
          border-top: 1px solid var(--mm-border);
          border-bottom: 1px solid var(--mm-border);
          box-shadow: var(--mm-shadow);
          z-index: 590;
          animation: hdr-mm-fadein 0.22s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .hdr-mega-panel-v2[data-theme="dark"] {
          --mm-bg: #0a0a0a;
          --mm-border: rgba(255, 255, 255, 0.10);
          --mm-divider: rgba(255, 255, 255, 0.08);
          --mm-text: #f4f6fb;
          --mm-muted: rgba(255, 255, 255, 0.58);
          --mm-subtle: rgba(255, 255, 255, 0.38);
          --mm-accent: #4d86f0;
          --mm-shadow: 0 26px 60px -22px rgba(0, 0, 0, 0.7);
        }
        @keyframes hdr-mm-fadein {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .hdr-mega-inner {
          max-width: 1440px;
          margin: 0 auto;
          padding: 28px 32px 36px 32px;
        }
        /* ─── Tabs de filtro por setor (texto + underline ativo, sem pill) ─── */
        .hdr-mega-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 2px 22px;
          margin-bottom: 28px;
          border-bottom: 1px solid var(--mm-divider);
        }
        .hdr-mega-tab {
          padding: 0 0 14px 0;
          font-size: 12px;
          font-weight: 500;
          line-height: 1.2;
          background: transparent;
          color: var(--mm-muted);
          border: 0;
          border-bottom: 2px solid transparent;
          margin-bottom: -1px;
          cursor: pointer;
          white-space: nowrap;
          transition: color 0.18s ease, border-color 0.18s ease;
        }
        .hdr-mega-tab:hover { color: var(--mm-text); }
        .hdr-mega-tab.active {
          color: var(--mm-text);
          font-weight: 600;
          border-bottom-color: var(--mm-accent);
        }
        /* ─── Grid principal: 1fr 3fr ─── */
        .hdr-mega-grid {
          display: grid;
          grid-template-columns: minmax(216px, 1fr) 3fr;
          gap: 40px;
          min-height: 340px;
        }
        /* ─── Coluna 1: lista de categorias ─── */
        .hdr-mega-col1 {
          display: flex;
          flex-direction: column;
          gap: 1px;
          padding-right: 28px;
          border-right: 1px solid var(--mm-divider);
        }
        .hdr-mega-cat-btn {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 2px;
          font-size: 14px;
          font-weight: 500;
          line-height: 1.3;
          color: var(--mm-muted);
          background: transparent;
          border: 0;
          cursor: pointer;
          text-align: left;
          transition: color 0.15s ease;
        }
        .hdr-mega-cat-btn:hover { color: var(--mm-text); }
        .hdr-mega-cat-btn.active {
          color: var(--mm-accent);
          font-weight: 600;
        }
        .hdr-mega-cat-btn .chev {
          flex-shrink: 0;
          opacity: 0;
          transform: translateX(-4px);
          transition: opacity 0.2s ease, transform 0.2s ease;
        }
        .hdr-mega-cat-btn:hover .chev { opacity: 0.45; transform: translateX(0); }
        .hdr-mega-cat-btn.active .chev { opacity: 1; transform: translateX(0); color: var(--mm-accent); }
        .hdr-mega-bottom-cta {
          margin-top: auto;
          padding-top: 18px;
          border-top: 1px solid var(--mm-divider);
        }
        .hdr-mega-bottom-cta a {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--mm-accent);
          text-decoration: none;
          transition: gap 0.2s ease;
        }
        .hdr-mega-bottom-cta a:hover { gap: 12px; }
        /* ─── Colunas 2-4: sub-categorias ─── */
        .hdr-mega-col2 {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 28px 36px;
          align-content: start;
        }
        .hdr-mega-subcat {
          display: flex;
          flex-direction: column;
          gap: 9px;
        }
        .hdr-mega-subcat-title {
          display: block;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--mm-text);
          padding-bottom: 10px;
          border-bottom: 1px solid var(--mm-divider);
          margin-bottom: 3px;
          text-decoration: none;
          transition: color 0.15s ease;
        }
        .hdr-mega-subcat-title:hover { color: var(--mm-accent); }
        .hdr-mega-subcat-link {
          display: block;
          font-size: 13px;
          line-height: 1.5;
          color: var(--mm-muted);
          padding: 3px 0;
          text-decoration: none;
          transition: color 0.15s ease;
        }
        .hdr-mega-subcat-link:hover { color: var(--mm-accent); }
        .hdr-mega-subcat-note {
          font-size: 13px;
          line-height: 1.6;
          color: var(--mm-subtle);
        }
        /* Empty state quando filtro de setor não encontra nada */
        .hdr-mega-empty {
          grid-column: 1 / -1;
          padding: 48px 20px;
          text-align: center;
          color: var(--mm-subtle);
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
                <span className="hdr-mega-subcat-note">
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
