import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Search, Phone, ChevronRight, Menu, X, ChevronDown, ArrowRight } from "lucide-react";
import { searchIndex, type SearchItem } from "../data/searchIndex";
import { useMenu } from "../hooks/useSiteData";
import type { SiteMenuItem } from "../../lib/supabase";
import { MegaMenuPanel } from "./header/MegaMenuPanel";

/** Itens da nav que renderizam o painel V2 (IFM-style) ao invés do dropdown legado. */
const MEGA_PANEL_ITEMS = ["Indústrias", "Produtos", "Serviços"];

/* The hardcoded `navItems` below stays as fallback. When the CMS API
   returns at least one item, it overrides. This makes the menu safely
   editable from the ERP painel without breaking the site if Supabase
   is briefly unreachable. */
type NavItem = {
  label: string;
  href: string;
  children?: NavItem[];
};

/**
 * Props de link externo. O menu aceita itens apontando para fora do site
 * (ex.: o catálogo em ruyang.gaiatecsistemas.com, que é outro domínio).
 * Abre em nova aba e usa noopener para a página de destino não conseguir
 * manipular window.opener. Retorna {} para link interno, que segue normal.
 */
function externalLinkProps(href?: string) {
  return href && /^https?:\/\//i.test(href)
    ? { target: "_blank" as const, rel: "noopener noreferrer" }
    : {};
}

function adaptApiMenu(items: SiteMenuItem[]): NavItem[] {
  return items.map((it) => ({
    label: it.label,
    // The API allows href=null (pure groupers). The Header's hover/click
    // Grupos sem destino usam a página de contato, evitando links inertes.
    href: it.href ?? "/contato",
    children:
      it.children && it.children.length > 0 ? adaptApiMenu(it.children) : undefined,
  }));
}

/* ────────────────────────────────────────────────────────
   NAV DATA
   ──────────────────────────────────────────────────────── */
const navItems = [
  {
    label: "Indústrias",
    href: "/setores",
    children: [
      { label: "Saneamento / Líquido", href: "/setores/saneamento" },
      { label: "Gás e Petróleo", href: "/setores/gas-petroleo" },
      { label: "Biogás e Biometano", href: "/setores/biogas-biometano" },
      { label: "Proteção Catódica", href: "/setores/protecao-catodica" },
      { label: "HVAC", href: "/setores/hvac" },
      { label: "Controle Ambiental", href: "/setores/controle-ambiental" },
      { label: "Agronegócio", href: "/setores/agronegocio" },
      { label: "Indústria", href: "/setores/industria" },
      { label: "Telemetria", href: "/setores/telemetria" },
    ],
  },
  {
    label: "Produtos",
    href: "/produtos",
    children: [
      {
        label: "Medição de Vazão",
        href: "/setores/instrumentacao",
        children: [
          { label: "Ultrassônico Clamp-On", href: "/setores/instrumentacao" },
          { label: "Eletromagnético", href: "/setores/instrumentacao" },
          { label: "Coriolis", href: "/setores/instrumentacao" },
          { label: "Turbina", href: "/setores/instrumentacao" },
          { label: "Vortex", href: "/setores/instrumentacao" },
        ],
      },
      {
        label: "Detecção de Gases",
        href: "/setores/seguranca-operacional",
        children: [
          { label: "Analisadores de Biogás", href: "/setores/seguranca-operacional" },
          { label: "Detectores de Gás", href: "/setores/seguranca-operacional" },
          { label: "Cromatógrafos", href: "/setores/seguranca-operacional" },
          { label: "Qualidade da Água", href: "/setores/seguranca-operacional" },
        ],
      },
      {
        label: "Automação e Controle",
        href: "/setores/industria",
        children: [
          { label: "CLPs", href: "/setores/industria" },
          { label: "IHMs", href: "/setores/industria" },
          { label: "Supervisórios SCADA", href: "/setores/industria" },
          { label: "Telemetria", href: "/setores/telemetria" },
        ],
      },
    ],
  },
  {
    label: "Serviços",
    href: "/servicos",
    children: [
      {
        label: "Instrumentação Industrial",
        href: "/servicos",
        children: [
          { label: "Instalações e Comissionamentos", href: "/servicos/instalacoes-comissionamentos" },
          { label: "Medições em Campo", href: "/servicos/medicoes-em-campo" },
          { label: "Manutenções", href: "/servicos/manutencoes" },
          { label: "Consultoria e Inspeções Técnicas", href: "/servicos/consultoria-inspecoes-tecnicas" },
        ],
      },
      {
        label: "Automação Industrial",
        href: "/servicos/automacoes",
        children: [
          { label: "Automações", href: "/servicos/automacoes" },
          { label: "Controle e Monitoramento", href: "/servicos/controle-monitoramento" },
          { label: "Proteção Catódica", href: "/servicos/protecao-catodica" },
          { label: "Inspeção de Revestimentos", href: "/servicos/inspecao-revestimentos" },
        ],
      },
      {
        label: "Calibração e Certificação",
        href: "/servicos/calibracao-rastreavel-laboratorio",
        children: [
          { label: "Calibração Rastreável em Laboratório", href: "/servicos/calibracao-rastreavel-laboratorio" },
          { label: "Calibração Rastreável em Campo", href: "/servicos/calibracao-rastreavel-campo" },
        ],
      },
    ],
  },
  {
    label: "Aplicações",
    href: "/aplicacoes",
  },
  {
    label: "Biodigestor",
    href: "/biodigestor",
  },
  {
    label: "Detecção de Gás",
    href: "/deteccao-de-gas",
    children: [
      { label: "Detecção Móvel", href: "/deteccao-de-gas/deteccao-movel" },
      { label: "Monitoramento Online", href: "/deteccao-de-gas/monitoramento-online" },
      { label: "Localização de Tubulação PE", href: "/deteccao-de-gas/localizacao-tubulacao-pe" },
      { label: "Detecção de Rede Enterrada", href: "/deteccao-de-gas/deteccao-rede-enterrada-gas" },
      { label: "Detectores Portáteis", href: "/deteccao-de-gas/detectores-portateis" },
      { label: "Monitoramento Meteorológico", href: "/deteccao-de-gas/monitoramento-meteorologico" },
      /* Catálogo fica em domínio próprio — abre em nova aba (ver externalLinkProps) */
      { label: "Catálogo de Produtos", href: "https://ruyang.gaiatecsistemas.com/" },
    ],
  },
  {
    label: "Contato",
    href: "/contato",
  },
];

export function Header() {
  // Menu vem do CMS (ERP painel /marketing/site, tab Menu). Cai pro
  // hardcoded `navItems` se a API ainda não respondeu, falhou, ou
  // retornou vazio — o site nunca fica sem menu.
  const { menu: cmsMenu } = useMenu();
  const effectiveNavItems = useMemo<NavItem[]>(() => {
    const base = cmsMenu && cmsMenu.length > 0 ? adaptApiMenu(cmsMenu) : (navItems as NavItem[]);
    // Blog (fica no rodapé) e Sobre (fica na barra superior, ao lado de Localização)
    // saem do menu principal — filtra mesmo se vier do CMS.
    return base.filter((it) => {
      const l = it.label.toLowerCase();
      return it.href !== "/blog" && it.href !== "/sobre" && l !== "blog" && l !== "sobre";
    });
  }, [cmsMenu]);

  const [scrolled, setScrolled] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<number | null>(null);
  const [mobileAccordion, setMobileAccordion] = useState<number | null>(null);
  const [mobileSecond, setMobileSecond] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const menuTimeout = useRef<ReturnType<typeof setTimeout>>();
  const headerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    const terms = q.split(/\s+/);
    return searchIndex
      .filter((item) => {
        const haystack = `${item.label} ${item.category} ${item.keywords}`.toLowerCase();
        return terms.every((t) => haystack.includes(t));
      })
      .slice(0, 8);
  }, [searchQuery]);

  // Close search on click outside
  useEffect(() => {
    if (!searchOpen) return;
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
        setSearchQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [searchOpen]);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 50);
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      setScrollProgress(docHeight > 0 ? (window.scrollY / docHeight) * 100 : 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMobileOpen(false);
      setMobileAccordion(null);
      setMobileSecond(null);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [mobileOpen]);

  const openMenu = useCallback((i: number) => {
    clearTimeout(menuTimeout.current);
    setActiveMenu(i);
  }, []);

  const closeMenu = useCallback(() => {
    menuTimeout.current = setTimeout(() => {
      setActiveMenu(null);
    }, 150);
  }, []);

  const keepMenu = useCallback(() => {
    clearTimeout(menuTimeout.current);
  }, []);

  const activeItem = activeMenu !== null ? effectiveNavItems[activeMenu] : null;
  const hasChildren = activeItem?.children && activeItem.children.length > 0;

  return (
    <>
      <style>{`
        @keyframes pulse-phone {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        .hdr-phone-pulse {
          animation: pulse-phone 2s infinite;
        }
        .hdr-utility-link {
          color: rgb(0, 87, 222);
          cursor: pointer;
          display: inline-block;
          font-size: 14px;
          font-weight: 600;
          line-height: 21px;
          position: relative;
          text-underline-offset: 3px;
          transition: opacity 0.25s;
          text-decoration: none;
        }
        .hdr-utility-link:hover {
          opacity: 0.8;
        }
        /* Campo de busca — texto/placeholder seguem o tema do header
           (claro no topo escuro, preto quando rolado/branco). */
        .hdr-search-input {
          color: #fff;
          caret-color: #fff;
        }
        .hdr-search-input::placeholder {
          color: rgba(255, 255, 255, 0.6);
        }
        .hdr-light .hdr-search-input {
          color: #000;
          caret-color: #000;
        }
        .hdr-light .hdr-search-input::placeholder {
          color: rgba(0, 0, 0, 0.45);
        }
        .hdr-nav-link {
          color: rgb(255, 255, 255);
          cursor: pointer;
          display: inline-block;
          font-size: 16px;
          line-height: 24px;
          position: relative;
          transition: color 0.4s ease;
          text-decoration: none;
          text-underline-offset: 3px;
          transition: color 0.25s;
          padding: 8px 0;
        }
        .hdr-nav-link:hover {
          color: rgb(0, 87, 222);
        }
        .hdr-nav-li.active .hdr-nav-link {
          color: rgb(0, 87, 222);
        }
        .hdr-mega-l1-link {
          color: var(--mm-text);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          font-size: 16px;
          font-weight: 500;
          line-height: 1.4;
          padding-right: 24px;
          position: relative;
          text-decoration: none;
          transition: color 0.2s ease;
        }
        .hdr-mega-l1-link:hover {
          color: var(--mm-accent);
        }
        .hdr-mega-l1-link svg {
          color: var(--mm-accent);
          flex-shrink: 0;
          opacity: 0.5;
          transition: opacity 0.2s ease, transform 0.2s ease;
        }
        .hdr-mega-l1-link:hover svg {
          opacity: 1;
          transform: translateX(2px);
        }
        .hdr-mega-l2-link {
          color: var(--mm-muted);
          cursor: pointer;
          display: inline-block;
          font-size: 13.5px;
          line-height: 1.6;
          padding-right: 16px;
          position: relative;
          text-decoration: none;
          transition: color 0.2s ease;
        }
        .hdr-mega-l2-link:hover {
          color: var(--mm-accent);
        }
        .hdr-top-bar {
          display: flex;
          margin-bottom: 18px;
          transition: margin 0.5s ease;
        }
        /* Quando o header está em modo light (rolado), a top bar
           encolhe um pouco mas continua visível com os links laranjas. */
        .hdr-light .hdr-top-bar {
          margin-bottom: 8px;
        }
        .hdr-mega-panel {
          --mm-bg: #0a0a0a;
          --mm-border: rgba(255, 255, 255, 0.10);
          --mm-text: #f4f6fb;
          --mm-muted: rgba(255, 255, 255, 0.58);
          --mm-accent: #4d86f0;
          --mm-shadow: 0 26px 60px -22px rgba(0, 0, 0, 0.7);
          position: absolute;
          left: 0;
          width: 100%;
          color: var(--mm-text);
          background-color: var(--mm-bg);
          border-top: 1px solid var(--mm-border);
          border-bottom: 1px solid var(--mm-border);
          box-shadow: var(--mm-shadow);
          overflow: hidden;
          padding-top: 28px;
          padding-bottom: 36px;
          z-index: 50;
          animation: megaFadeIn 0.22s cubic-bezier(0.4, 0, 0.2, 1);
        }
        @keyframes megaFadeIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        /* ─── WhatsApp Button (pílula moderna) ─── */
        .hdr-whatsapp-btn {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          margin-left: 16px;
          padding: 8px 16px 8px 10px;
          flex-shrink: 0;
          text-decoration: none;
          background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
          color: #ffffff;
          border-radius: 999px;
          box-shadow: 0 4px 14px rgba(37, 211, 102, 0.35), 0 1px 2px rgba(0, 0, 0, 0.1);
          transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1),
                      box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1),
                      filter 0.2s ease;
          position: relative;
          overflow: hidden;
        }
        .hdr-whatsapp-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 50%);
          border-radius: inherit;
          pointer-events: none;
        }
        .hdr-whatsapp-btn:hover {
          transform: translateY(-2px) scale(1.02);
          box-shadow: 0 8px 24px rgba(37, 211, 102, 0.5), 0 2px 4px rgba(0, 0, 0, 0.12);
          filter: brightness(1.05);
        }
        .hdr-whatsapp-btn:active {
          transform: translateY(0) scale(0.98);
        }
        .hdr-whatsapp-icon-wrap {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.18);
          color: #ffffff;
          flex-shrink: 0;
          backdrop-filter: blur(4px);
          animation: hdr-wa-pulse 2.4s ease-in-out infinite;
        }
        @keyframes hdr-wa-pulse {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.4);
          }
          50% {
            box-shadow: 0 0 0 6px rgba(255, 255, 255, 0);
          }
        }
        .hdr-whatsapp-text {
          display: inline-flex;
          flex-direction: column;
          align-items: flex-start;
          line-height: 1.1;
        }
        .hdr-whatsapp-eyebrow {
          font-size: 10px;
          font-weight: 500;
          opacity: 0.85;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 2px;
        }
        .hdr-whatsapp-label {
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.01em;
        }
        .hdr-whatsapp-arrow {
          color: #ffffff;
          transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .hdr-whatsapp-btn:hover .hdr-whatsapp-arrow {
          transform: translateX(3px);
        }

        @media (max-width: 1023px) {
          .hdr-top-bar { display: none; }
          .hdr-nav-desktop { display: none !important; }
          .hdr-mega-panel { display: none !important; }
          .hdr-whatsapp-btn { display: none !important; }
        }
        @media (min-width: 1024px) {
          .hdr-mobile-btn { display: none !important; }
        }

        /* ─── LIGHT MODE — aplicado quando o header rolou ─── */
        .hdr-light .hdr-nav-link {
          color: rgb(0, 0, 0);
        }
        .hdr-light .hdr-nav-link:hover {
          color: rgb(0, 87, 222);
        }
        .hdr-light .hdr-nav-li.active .hdr-nav-link {
          color: rgb(0, 87, 222);
        }
        .hdr-light .hdr-mobile-btn button {
          color: rgb(0, 0, 0) !important;
        }
        /* ícones inline (search, chevrons) que herdam currentColor */
        .hdr-light svg {
          color: inherit;
        }
        /* Mega menu legado em modo light — só troca os tokens, o resto cascateia */
        .hdr-light .hdr-mega-panel {
          --mm-bg: #ffffff;
          --mm-border: rgba(15, 23, 42, 0.08);
          --mm-text: #0f172a;
          --mm-muted: #5b6675;
          --mm-accent: #0057DE;
          --mm-shadow: 0 18px 44px -16px rgba(2, 16, 43, 0.16);
        }
      `}</style>

      {/* ── OUTER WRAPPER — fixed ──
         Modo claro (light) entra pelo simples fato de ter rolado.
         Independente do mega menu estar aberto ou não, a paleta
         segue o estado de scroll:
           - scrolled=false (topo da página)        → escuro (gradient preto), textos brancos
           - scrolled=true                          → branco, textos pretos, borda + sombra suaves
         Mega menu também segue: quando .hdr-light estiver ativa,
         o painel que abre embaixo fica branco com textos pretos.
       */}
      <div
        ref={headerRef}
        className={scrolled ? "hdr-light" : ""}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          zIndex: 600,
          backgroundImage: scrolled
            ? "none"
            : activeMenu !== null
              ? "none"
              : "linear-gradient(rgb(0, 0, 0) 0px, rgba(0, 0, 0, 0) 100%)",
          backgroundColor: scrolled
            ? "#fff"
            : activeMenu !== null
              ? "rgb(0, 0, 0)"
              : "transparent",
          borderBottom: scrolled ? "1px solid rgba(0, 0, 0, 0.08)" : "none",
          boxShadow: scrolled ? "0 2px 12px rgba(0, 0, 0, 0.06)" : "none",
          paddingTop: scrolled ? 10 : 28,
          paddingBottom: scrolled ? 10 : 24,
          transition:
            "padding 0.5s ease, background 0.5s ease, background-image 0.5s ease, border-color 0.5s ease, box-shadow 0.5s ease, color 0.5s ease",
          fontFamily: "Arial, sans-serif",
          fontSize: 16,
          fontWeight: 400,
          lineHeight: "28.8px",
          color: scrolled ? "#000" : "#fff",
        }}
      >
        {/* ── SCROLL PROGRESS BAR ── */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            overflow: "hidden",
          }}
        >
          <span
            style={{
              display: "block",
              backgroundColor: "rgb(0, 87, 222)",
              height: 4,
              width: `${scrollProgress}%`,
              transition: "width 100ms linear",
            }}
          />
        </div>

        {/* ── CONTAINER ── */}
        <div
          style={{
            marginLeft: "auto",
            marginRight: "auto",
            maxWidth: 1440,
            paddingLeft: 30,
            paddingRight: 30,
            width: "100%",
          }}
        >
          {/* ── TOP UTILITY BAR ── sempre visível (busca, WhatsApp, localização, carreiras) */}
          <div className="hdr-top-bar">
            <ul
              style={{
                color: "rgb(0, 87, 222)",
                fontSize: 14,
                lineHeight: "25.2px",
                textAlign: "right",
                listStyle: "none",
                padding: 0,
                marginTop: 0,
                marginBottom: 0,
                marginRight: 0,
                marginLeft: "auto",
                display: "flex",
                alignItems: "center",
                gap: 0,
              }}
            >
              <li style={{ paddingLeft: 24, display: "inline-block", verticalAlign: "top" }}>
                <div ref={searchRef} style={{ display: "flex", alignItems: "center", position: "relative" }}>
                  <button
                    type="button"
                    aria-label={searchOpen ? "Fechar busca" : "Abrir busca"}
                    aria-expanded={searchOpen}
                    onClick={() => {
                      setSearchOpen(!searchOpen);
                      if (searchOpen) setSearchQuery("");
                    }}
                    className="hdr-utility-link"
                    style={{ background: "none", border: "none", padding: "4px 4px 4px 0" }}
                  >
                    <Search size={14} color="rgb(0, 87, 222)" />
                  </button>
                  {searchOpen && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        marginLeft: 8,
                        borderBottom: "1px solid rgb(0, 87, 222)",
                        height: 27,
                        minWidth: 280,
                        position: "relative",
                      }}
                    >
                      <form
                        role="search"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (searchResults.length > 0) {
                            window.location.href = searchResults[0].href;
                            setSearchOpen(false);
                            setSearchQuery("");
                          }
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          width: "100%",
                          paddingLeft: 6,
                          paddingRight: 20,
                        }}
                      >
                        <input
                          type="text"
                          className="hdr-search-input"
                          placeholder="Buscar setores, produtos, serviços..."
                          autoFocus
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          style={{
                            background: "transparent",
                            border: "none",
                            outline: "none",
                            fontSize: 14,
                            lineHeight: "25.2px",
                            width: "100%",
                            padding: "0 6px",
                          }}
                        />
                        <button
                          type="submit"
                          style={{
                            position: "absolute",
                            right: 0,
                            top: 0,
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            color: scrolled ? "#000" : "#fff",
                            padding: "4px 0",
                            display: "flex",
                            alignItems: "center",
                          }}
                        >
                          <ArrowRight size={10} color={scrolled ? "#000" : "#fff"} />
                        </button>
                      </form>
                    </div>
                  )}
                  {/* Search Results Dropdown */}
                  {searchOpen && searchQuery.length >= 2 && (
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        right: 0,
                        marginTop: 8,
                        width: 380,
                        maxHeight: 420,
                        overflowY: "auto",
                        backgroundColor: "rgba(0, 0, 0, 0.95)",
                        border: "1px solid rgba(0, 87, 222, 0.3)",
                        borderRadius: 8,
                        zIndex: 1000,
                        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                      }}
                    >
                      {searchResults.length === 0 ? (
                        <div style={{ padding: "16px 20px", color: "rgba(255,255,255,0.5)", fontSize: 14 }}>
                          Nenhum resultado para "{searchQuery}"
                        </div>
                      ) : (
                        searchResults.map((item, idx) => (
                          <a
                            key={`${item.href}-${idx}`}
                            href={item.href}
                            onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                              padding: "12px 20px",
                              color: "#fff",
                              textDecoration: "none",
                              borderBottom: idx < searchResults.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
                              transition: "background 0.15s",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(0, 87, 222, 0.1)")}
                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                          >
                            <span
                              style={{
                                flexShrink: 0,
                                fontSize: 10,
                                fontWeight: 700,
                                letterSpacing: "0.05em",
                                textTransform: "uppercase",
                                color: "rgb(0, 87, 222)",
                                backgroundColor: "rgba(0, 87, 222, 0.12)",
                                padding: "2px 8px",
                                borderRadius: 4,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {item.category}
                            </span>
                            <span style={{ fontSize: 14, lineHeight: "20px" }}>{item.label}</span>
                            <ChevronRight size={12} color="rgba(255,255,255,0.3)" style={{ marginLeft: "auto", flexShrink: 0 }} />
                          </a>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </li>
              <li style={{ paddingLeft: 24, display: "inline-block", verticalAlign: "top" }}>
                <a href="/contato" className="hdr-utility-link">Localização</a>
              </li>
              <li style={{ paddingLeft: 24, display: "inline-block", verticalAlign: "top" }}>
                <a href="/sobre" className="hdr-utility-link">Sobre</a>
              </li>
              <li style={{ paddingLeft: 24, display: "inline-block", verticalAlign: "top" }}>
                <a href="/contato" className="hdr-utility-link">Carreiras</a>
              </li>
            </ul>
          </div>

          {/* ── HEADER ROW ── */}
          <header
            style={{
              display: "flex",
              alignItems: "center",
            }}
          >
            {/* Logo — troca dinâmica:
                  topo da página / mega menu aberto (fundo escuro) → logo com texto branco
                  rolando, header em modo light (fundo branco)     → logo com texto preto
                Pré-carrega ambas via display:block + opacity pra cross-fade fluido. */}
            <a
              href="/"
              style={{
                marginRight: 16,
                flexShrink: 0,
                textDecoration: "none",
                display: "inline-block",
                position: "relative",
                height: 60,
              }}
            >
              <img
                src="/logo-gaiatec-white.png"
                alt="Gaiatec Sistemas"
                style={{
                  height: 60,
                  width: "auto",
                  display: "block",
                  opacity: scrolled ? 0 : 1,
                  transition: "opacity 0.4s ease",
                }}
              />
              <img
                src="/logo-gaiatec.png"
                alt=""
                aria-hidden="true"
                style={{
                  height: 60,
                  width: "auto",
                  display: "block",
                  position: "absolute",
                  top: 0,
                  left: 0,
                  opacity: scrolled ? 1 : 0,
                  transition: "opacity 0.4s ease",
                  pointerEvents: "none",
                }}
              />
            </a>

            {/* ── DESKTOP NAV ── */}
            <nav className="hdr-nav-desktop" style={{ display: "block", flex: 1 }}>
              <ul
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0,
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                }}
              >
                {effectiveNavItems.map((item, i) => (
                  <li
                    key={item.label}
                    className={`hdr-nav-li${activeMenu === i ? " active" : ""}`}
                    style={{
                      marginLeft: 24,
                      position: "relative",
                    }}
                    onMouseEnter={() => item.children ? openMenu(i) : setActiveMenu(null)}
                    onMouseLeave={closeMenu}
                  >
                    <a href={item.href} className="hdr-nav-link">
                      {item.label}
                      {item.children && (
                        <ChevronDown
                          size={12}
                          style={{
                            display: "inline",
                            marginLeft: 4,
                            verticalAlign: "middle",
                            transition: "transform 0.3s",
                            transform: activeMenu === i ? "rotate(180deg)" : "rotate(0deg)",
                          }}
                        />
                      )}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            {/* ── WHATSAPP BUTTON ── pílula moderna, visível só em desktop */}
            <a
              href="https://wa.me/551122071986"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Fale conosco no WhatsApp"
              className="hdr-whatsapp-btn"
            >
              <span className="hdr-whatsapp-icon-wrap" aria-hidden="true">
                {/* Logo oficial do WhatsApp */}
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                </svg>
              </span>
              <span className="hdr-whatsapp-text">
                <span className="hdr-whatsapp-eyebrow">Atendimento rápido</span>
                <span className="hdr-whatsapp-label">Fale no WhatsApp</span>
              </span>
              <ChevronRight size={16} className="hdr-whatsapp-arrow" strokeWidth={2.5} />
            </a>

            {/* ── MOBILE BUTTON ── */}
            <div className="hdr-mobile-btn" style={{ marginLeft: "auto" }}>
              <button
                type="button"
                aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
                aria-expanded={mobileOpen}
                aria-controls="mobile-navigation"
                onClick={() => {
                  setMobileOpen(!mobileOpen);
                  setMobileAccordion(null);
                  setMobileSecond(null);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "#fff",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 15,
                  lineHeight: "15px",
                }}
              >
                {mobileOpen ? <X size={22} /> : <Menu size={22} />}
                <span>{mobileOpen ? "Fechar" : "Menu"}</span>
              </button>
            </div>
          </header>
        </div>

        {/* ── MEGA MENU V2 (IFM-style) — Indústrias / Produtos / Serviços ── */}
        {hasChildren && activeMenu !== null && activeItem && MEGA_PANEL_ITEMS.includes(activeItem.label) && (
          <MegaMenuPanel
            item={activeItem}
            theme={scrolled ? "light" : "dark"}
            onMouseEnter={keepMenu}
            onMouseLeave={closeMenu}
            onClose={() => setActiveMenu(null)}
          />
        )}

        {/* ── MEGA MENU LEGADO (rendered at header level, not inside li) — outros itens (Sobre, Blog) ── */}
        {hasChildren && activeMenu !== null && activeItem && !MEGA_PANEL_ITEMS.includes(activeItem.label) && (
          <div
            className="hdr-mega-panel"
            onMouseEnter={keepMenu}
            onMouseLeave={closeMenu}
          >
            <div
              style={{
                display: "flex",
                marginLeft: "auto",
                marginRight: "auto",
                maxWidth: 1440,
                paddingLeft: 30,
                paddingRight: 30,
                width: "100%",
              }}
            >
              {activeItem!.children![0]?.children ? (
                /* 3-column layout for Produtos, Serviços */
                activeItem!.children!.map((col: any) => (
                  <div
                    key={col.label}
                    style={{
                      width: "33.333%",
                      paddingBottom: 40,
                    }}
                  >
                    <div style={{ marginBottom: 20 }}>
                      <a
                        href={col.href || "/contato"}
                        {...externalLinkProps(col.href)}
                        className="hdr-mega-l1-link"
                        style={{ fontWeight: 500 }}
                      >
                        <ChevronRight size={14} style={{ marginRight: 8 }} />
                        {col.label}
                      </a>
                    </div>
                    {col.children && (
                      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                        {col.children.map((sub: any) => (
                          <li key={sub.label} style={{ marginBottom: 8 }}>
                            <a href={sub.href || "/contato"} {...externalLinkProps(sub.href)} className="hdr-mega-l2-link">
                              {sub.label}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))
              ) : (
                /* Simple grid for Setores, Blog, Sobre */
                <div style={{ width: "100%", paddingBottom: 20 }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, 1fr)",
                      gap: "8px 40px",
                    }}
                  >
                    {activeItem!.children!.map((child: any) => (
                      <a
                        key={child.label}
                        href={child.href || "/contato"}
                        {...externalLinkProps(child.href)}
                        className="hdr-mega-l1-link"
                        style={{ marginBottom: 12 }}
                      >
                        <ChevronRight size={14} style={{ marginRight: 8 }} />
                        {child.label}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── MOBILE MENU ── */}
      {mobileOpen && (
        <nav
          id="mobile-navigation"
          aria-label="Menu principal mobile"
          className="lg:hidden"
          style={{
            position: "fixed",
            inset: 0,
            top: scrolled ? 60 : 100,
            backgroundColor: "#000",
            zIndex: 599,
            overflowY: "auto",
            paddingBottom: 80,
            fontFamily: "Arial, sans-serif",
          }}
        >
          <div style={{ padding: "24px 24px 0" }}>
            <a
              href="https://wa.me/551122071986"
              className="hdr-utility-link"
              style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              <Phone size={12} color="rgb(0, 87, 222)" />
              Falar pelo WhatsApp
            </a>
          </div>

          <div style={{ marginTop: 16 }}>
            {effectiveNavItems.map((item, i) => (
              <div key={item.label} style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                {item.children ? (
                  <>
                    <button
                      onClick={() => {
                        setMobileAccordion(mobileAccordion === i ? null : i);
                        setMobileSecond(null);
                      }}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "16px 24px",
                        color: "#fff",
                        fontSize: 17,
                        fontWeight: 400,
                        lineHeight: "20.4px",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      {item.label}
                      <ChevronDown
                        size={16}
                        color="rgb(0, 87, 222)"
                        style={{
                          transition: "transform 0.3s",
                          transform: mobileAccordion === i ? "rotate(180deg)" : "rotate(0deg)",
                        }}
                      />
                    </button>

                    {mobileAccordion === i && (
                      <div style={{ backgroundColor: "rgba(255,255,255,0.03)", paddingLeft: 24, paddingRight: 24, paddingBottom: 16 }}>
                        {item.children.map((child: any, ci: number) => (
                          <div key={child.label}>
                            {child.children ? (
                              <>
                                <button
                                  onClick={() => setMobileSecond(mobileSecond === ci ? null : ci)}
                                  style={{
                                    width: "100%",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    padding: "10px 0",
                                    color: "rgba(255,255,255,0.7)",
                                    fontSize: 15,
                                    lineHeight: "22px",
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                    textAlign: "left",
                                  }}
                                >
                                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <ChevronRight size={10} color="rgb(0, 87, 222)" />
                                    {child.label}
                                  </span>
                                  <ChevronRight
                                    size={12}
                                    color="rgba(255,255,255,0.4)"
                                    style={{
                                      transition: "transform 0.3s",
                                      transform: mobileSecond === ci ? "rotate(90deg)" : "rotate(0deg)",
                                    }}
                                  />
                                </button>

                                {mobileSecond === ci && (
                                  <div style={{ paddingLeft: 24, paddingBottom: 8 }}>
                                    {child.children.map((third: any) => (
                                      <a
                                        key={third.label}
                                        href={third.href || "/contato"}
                                        {...externalLinkProps(third.href)}
                                        style={{
                                          display: "block",
                                          padding: "6px 0",
                                          color: "rgba(255,255,255,0.5)",
                                          fontSize: 14,
                                          textDecoration: "none",
                                          transition: "color 0.25s",
                                        }}
                                        onMouseEnter={(e) => (e.currentTarget.style.color = "rgb(0, 87, 222)")}
                                        onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.5)")}
                                      >
                                        {third.label}
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </>
                            ) : (
                              <a
                                href={child.href || "/contato"}
                                {...externalLinkProps(child.href)}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  padding: "10px 0",
                                  color: "rgba(255,255,255,0.7)",
                                  fontSize: 15,
                                  lineHeight: "22px",
                                  textDecoration: "none",
                                  transition: "color 0.25s",
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.color = "rgb(0, 87, 222)")}
                                onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}
                              >
                                <ChevronRight size={10} color="rgb(0, 87, 222)" />
                                {child.label}
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <a
                    href={item.href}
                    style={{
                      display: "block",
                      padding: "16px 24px",
                      color: "#fff",
                      fontSize: 17,
                      fontWeight: 400,
                      lineHeight: "20.4px",
                      textDecoration: "none",
                      transition: "color 0.25s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "rgb(0, 87, 222)")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#fff")}
                  >
                    {item.label}
                  </a>
                )}
              </div>
            ))}
          </div>

          <div style={{ padding: "24px 24px 0", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
            <a
              href="/contato"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                border: "1px solid rgb(0, 87, 222)",
                color: "rgb(0, 87, 222)",
                padding: "12px 0",
                fontSize: 14,
                fontWeight: 600,
                letterSpacing: "0.05em",
                textDecoration: "none",
                transition: "all 0.3s",
              }}
            >
              Solicitar Orçamento <ChevronRight size={14} />
            </a>
          </div>
        </nav>
      )}
    </>
  );
}
