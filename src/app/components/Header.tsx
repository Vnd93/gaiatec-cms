import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Search, Phone, ChevronRight, Menu, X, ChevronDown, ArrowRight } from "lucide-react";
import { searchIndex, type SearchItem } from "../data/searchIndex";
import { useMenu } from "../hooks/useSiteData";
import type { SiteMenuItem } from "../../lib/supabase";

/* The hardcoded `navItems` below stays as fallback. When the CMS API
   returns at least one item, it overrides. This makes the menu safely
   editable from the ERP painel without breaking the site if Supabase
   is briefly unreachable. */
type NavItem = {
  label: string;
  href: string;
  children?: NavItem[];
};

function adaptApiMenu(items: SiteMenuItem[]): NavItem[] {
  return items.map((it) => ({
    label: it.label,
    // The API allows href=null (pure groupers). The Header's hover/click
    // logic assumes `href` is always a string, so coerce to "#".
    href: it.href ?? "#",
    children:
      it.children && it.children.length > 0 ? adaptApiMenu(it.children) : undefined,
  }));
}

/* ────────────────────────────────────────────────────────
   NAV DATA
   ──────────────────────────────────────────────────────── */
const navItems = [
  {
    label: "Setores",
    href: "/setores",
    children: [
      { label: "Saneamento", href: "/setores/saneamento" },
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
        href: "/servicos/instrumentacao-industrial",
        children: [
          { label: "Instalação e Comissionamento", href: "/servicos/instalacao-e-comissionamento" },
          { label: "Manutenção Industrial", href: "/servicos/manutencao-industrial" },
          { label: "Consultoria Técnica", href: "/servicos/consultoria-tecnica" },
          { label: "Medições Especializadas", href: "/servicos/medicoes-especializadas" },
        ],
      },
      {
        label: "Automação Industrial",
        href: "/servicos/automacao-industrial",
        children: [
          { label: "Proteção Catódica", href: "/servicos/protecao-catodica" },
          { label: "Inspeção de Revestimento", href: "/servicos/inspecao-de-revestimento" },
        ],
      },
      {
        label: "Calibração e Certificação",
        href: "/servicos/calibracao-rbc",
        children: [
          { label: "Calibração RBC Acreditada", href: "/servicos/calibracao-rbc" },
          { label: "Verificação Metrológica", href: "/servicos/calibracao-rbc" },
        ],
      },
    ],
  },
  {
    label: "Biodigestor",
    href: "/biodigestor",
  },
  {
    label: "Blog",
    href: "/blog",
    children: [
      { label: "Artigos Técnicos", href: "/blog" },
      { label: "Estudos de Caso", href: "/blog" },
      { label: "Novidades do Setor", href: "/blog" },
    ],
  },
  {
    label: "Sobre",
    href: "/sobre",
    children: [
      { label: "A Empresa", href: "/sobre" },
      { label: "Certificações", href: "/sobre" },
      { label: "Carreiras", href: "/sobre" },
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
    if (cmsMenu && cmsMenu.length > 0) return adaptApiMenu(cmsMenu);
    return navItems as NavItem[];
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
          color: rgb(255, 106, 0);
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
          color: rgb(255, 106, 0);
        }
        .hdr-nav-li.active .hdr-nav-link {
          color: rgb(255, 106, 0);
        }
        .hdr-mega-l1-link {
          color: rgb(255, 255, 255);
          cursor: pointer;
          display: inline-block;
          font-size: 22px;
          line-height: 33px;
          padding-right: 24px;
          position: relative;
          text-decoration: none;
          transition: color 0.3s;
        }
        .hdr-mega-l1-link:hover {
          color: rgb(255, 106, 0);
        }
        .hdr-mega-l2-link {
          color: rgba(255, 255, 255, 0.6);
          cursor: pointer;
          display: inline-block;
          font-size: 15px;
          line-height: 24px;
          padding-right: 16px;
          position: relative;
          text-decoration: none;
          transition: color 0.25s;
        }
        .hdr-mega-l2-link:hover {
          color: rgb(255, 106, 0);
        }
        .hdr-top-bar {
          display: flex;
          margin-bottom: 18px;
          transition: all 0.5s ease;
        }
        .hdr-top-bar.hidden {
          margin-bottom: 0;
          max-height: 0;
          overflow: hidden;
          opacity: 0;
        }
        .hdr-mega-panel {
          position: absolute;
          left: 0;
          width: 100%;
          background-color: rgba(0, 0, 0, 0.92);
          overflow: hidden;
          padding-top: 40px;
          padding-bottom: 30px;
          z-index: 50;
          animation: megaFadeIn 0.25s ease;
        }
        @keyframes megaFadeIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 1023px) {
          .hdr-top-bar { display: none; }
          .hdr-nav-desktop { display: none !important; }
          .hdr-mega-panel { display: none !important; }
        }
        @media (min-width: 1024px) {
          .hdr-mobile-btn { display: none !important; }
        }

        /* ─── LIGHT MODE — aplicado quando o header rolou ─── */
        .hdr-light .hdr-nav-link {
          color: rgb(0, 0, 0);
        }
        .hdr-light .hdr-nav-link:hover {
          color: rgb(255, 106, 0);
        }
        .hdr-light .hdr-nav-li.active .hdr-nav-link {
          color: rgb(255, 106, 0);
        }
        .hdr-light .hdr-mobile-btn button {
          color: rgb(0, 0, 0) !important;
        }
        /* ícones inline (search, chevrons) que herdam currentColor */
        .hdr-light svg {
          color: inherit;
        }
        /* Mega menu painel + links em modo light */
        .hdr-light .hdr-mega-panel {
          background-color: rgba(255, 255, 255, 0.98) !important;
          border-top: 1px solid rgba(0, 0, 0, 0.06);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
        }
        .hdr-light .hdr-mega-l1-link {
          color: rgb(15, 23, 42);
        }
        .hdr-light .hdr-mega-l1-link:hover {
          color: rgb(255, 106, 0);
        }
        .hdr-light .hdr-mega-l2-link {
          color: rgba(15, 23, 42, 0.65);
        }
        .hdr-light .hdr-mega-l2-link:hover {
          color: rgb(255, 106, 0);
        }
        /* O título de cada coluna do mega menu (usa ::before laranja
           e texto, geralmente herda) */
        .hdr-light .hdr-mega-panel h3,
        .hdr-light .hdr-mega-panel h4,
        .hdr-light .hdr-mega-panel span,
        .hdr-light .hdr-mega-panel p {
          color: rgb(15, 23, 42);
        }
        .hdr-light .hdr-mega-panel a {
          color: inherit;
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
              backgroundColor: "rgb(255, 106, 0)",
              height: 4,
              width: `${scrollProgress}%`,
              transition: "width 100ms linear",
            }}
          />
        </div>

        {/* ── SKIP TO CONTENT ── */}
        <a
          href="#Main"
          style={{
            position: "absolute",
            top: -10,
            left: 0,
            width: 1,
            height: 1,
            overflow: "hidden",
            zIndex: -999,
            color: "#fff",
            textDecoration: "underline",
          }}
        >
          Skip to main content
        </a>

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
          {/* ── TOP UTILITY BAR ── */}
          <div className={`hdr-top-bar${scrolled ? " hidden" : ""}`}>
            <ul
              style={{
                color: "rgb(255, 106, 0)",
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
                    onClick={() => {
                      setSearchOpen(!searchOpen);
                      if (searchOpen) setSearchQuery("");
                    }}
                    className="hdr-utility-link"
                    style={{ background: "none", border: "none", padding: "4px 4px 4px 0" }}
                  >
                    <Search size={14} color="rgb(255, 106, 0)" />
                  </button>
                  {searchOpen && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        marginLeft: 8,
                        borderBottom: "1px solid rgb(255, 106, 0)",
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
                          placeholder="Buscar setores, produtos, serviços..."
                          autoFocus
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          style={{
                            background: "transparent",
                            border: "none",
                            outline: "none",
                            color: "#fff",
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
                            color: "#fff",
                            padding: "4px 0",
                            display: "flex",
                            alignItems: "center",
                          }}
                        >
                          <ArrowRight size={10} color="#fff" />
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
                        border: "1px solid rgba(255, 106, 0, 0.3)",
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
                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(255, 106, 0, 0.1)")}
                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                          >
                            <span
                              style={{
                                flexShrink: 0,
                                fontSize: 10,
                                fontWeight: 700,
                                letterSpacing: "0.05em",
                                textTransform: "uppercase",
                                color: "rgb(255, 106, 0)",
                                backgroundColor: "rgba(255, 106, 0, 0.12)",
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
              <li
                className="hdr-phone-pulse"
                style={{ paddingLeft: 24, display: "inline-block", verticalAlign: "top" }}
              >
                <a href="https://wa.me/551122071986" className="hdr-utility-link">
                  <Phone
                    size={12}
                    color="rgb(255, 106, 0)"
                    style={{ marginRight: 2, display: "inline", verticalAlign: "middle", transform: "translateY(1px)" }}
                  />
                  <span style={{ verticalAlign: "middle" }}>Falar pelo WhatsApp</span>
                </a>
              </li>
              <li style={{ paddingLeft: 24, display: "inline-block", verticalAlign: "top" }}>
                <a href="#" className="hdr-utility-link">Localização</a>
              </li>
              <li style={{ paddingLeft: 24, display: "inline-block", verticalAlign: "top" }}>
                <a href="#" className="hdr-utility-link">Carreiras</a>
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

            {/* ── MOBILE BUTTON ── */}
            <div className="hdr-mobile-btn" style={{ marginLeft: "auto" }}>
              <button
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

        {/* ── MEGA MENU DROPDOWN (rendered at header level, not inside li) ── */}
        {hasChildren && activeMenu !== null && (
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
                        href={col.href || "#"}
                        className="hdr-mega-l1-link"
                        style={{ fontWeight: 500 }}
                      >
                        <ChevronRight
                          size={14}
                          color="rgb(255, 106, 0)"
                          style={{
                            display: "inline",
                            marginRight: 8,
                            verticalAlign: "middle",
                          }}
                        />
                        {col.label}
                      </a>
                    </div>
                    {col.children && (
                      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                        {col.children.map((sub: any) => (
                          <li key={sub.label} style={{ marginBottom: 8 }}>
                            <a href={sub.href || "#"} className="hdr-mega-l2-link">
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
                        href={child.href || "#"}
                        className="hdr-mega-l1-link"
                        style={{ fontSize: 20, lineHeight: "30px", marginBottom: 12 }}
                      >
                        <ChevronRight
                          size={12}
                          color="rgb(255, 106, 0)"
                          style={{
                            display: "inline",
                            marginRight: 8,
                            verticalAlign: "middle",
                          }}
                        />
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
        <div
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
              <Phone size={12} color="rgb(255, 106, 0)" />
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
                        color="rgb(255, 106, 0)"
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
                                    <ChevronRight size={10} color="rgb(255, 106, 0)" />
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
                                        href={third.href || "#"}
                                        style={{
                                          display: "block",
                                          padding: "6px 0",
                                          color: "rgba(255,255,255,0.5)",
                                          fontSize: 14,
                                          textDecoration: "none",
                                          transition: "color 0.25s",
                                        }}
                                        onMouseEnter={(e) => (e.currentTarget.style.color = "rgb(255, 106, 0)")}
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
                                href={child.href || "#"}
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
                                onMouseEnter={(e) => (e.currentTarget.style.color = "rgb(255, 106, 0)")}
                                onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}
                              >
                                <ChevronRight size={10} color="rgb(255, 106, 0)" />
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
                    onMouseEnter={(e) => (e.currentTarget.style.color = "rgb(255, 106, 0)")}
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
                border: "1px solid rgb(255, 106, 0)",
                color: "rgb(255, 106, 0)",
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
        </div>
      )}
    </>
  );
}
