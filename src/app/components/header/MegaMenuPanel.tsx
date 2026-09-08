import { useState, useEffect } from "react";
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
  /** Tema do painel — segue o estado do header (dark no topo, light ao rolar) */
  theme?: "dark" | "light";
  /** Handler de fechar (click fora, Esc, etc) */
  onClose?: () => void;
  /** Mantém o painel aberto durante hover */
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

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
  theme = "light",
  onClose,
  onMouseEnter,
  onMouseLeave,
}: MegaMenuPanelProps) {
  /** Categoria ativa (índice em item.children) — primeira por default */
  const [activeCat, setActiveCat] = useState(0);

  /** Reset quando o item raiz muda */
  useEffect(() => {
    setActiveCat(0);
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
  const activeIndex = Math.min(activeCat, categorias.length - 1);
  const categoriaAtiva = categorias[activeIndex];
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
          text-decoration: none;
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
        /* Mobile: oculto (drawer mobile já existe no Header) */
        @media (max-width: 1023px) {
          .hdr-mega-panel-v2 { display: none !important; }
        }
      `}</style>

      <div className="hdr-mega-inner">
        {/* ─── Grid principal ─── */}
        <div className="hdr-mega-grid">
          {/* ─── Coluna 1: categorias ─── */}
          <nav className="hdr-mega-col1" aria-label={`Categorias de ${item.label}`}>
            {categorias.map((cat, i) => (
              <a
                key={cat.label}
                href={cat.href}
                role="menuitem"
                className={`hdr-mega-cat-btn${i === activeIndex ? " active" : ""}`}
                onMouseEnter={() => setActiveCat(i)}
                onFocus={() => setActiveCat(i)}
              >
                <span>{cat.label}</span>
                <ChevronRight size={14} className="chev" />
              </a>
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
                  href={categoriaAtiva.href}
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
                    href={subCat.href}
                    className="hdr-mega-subcat-title"
                  >
                    {subCat.label}
                  </a>
                  {subCat.children && subCat.children.length > 0 ? (
                    subCat.children.map((leaf) => (
                      <a
                        key={leaf.label}
                        href={leaf.href}
                        className="hdr-mega-subcat-link"
                      >
                        {leaf.label}
                      </a>
                    ))
                  ) : (
                    <a
                      href={subCat.href}
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
