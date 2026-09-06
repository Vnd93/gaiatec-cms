import { useEffect, useMemo, useRef, useState } from "react";
import { LogOut, Menu, PanelLeftClose, PanelLeftOpen, Search, X } from "lucide-react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";
import {
  adminNavigation,
  adminPageTitle,
  canAccessNavigationItem,
  globalSearchTarget,
  isNavigationItemActive,
  resolveAdminBreadcrumbs,
} from "../admin-navigation";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { resolveAdminRouteGuidance } from "../admin-route-guidance";
import { isEv2FeatureEnabled } from "../ev2-runtime";
import "../admin.css";

export function AdminShell() {
  const { profile, user, signOut } = useAdminAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => window.localStorage.getItem("gaiatec.admin.sidebar-collapsed") === "true",
  );
  const [guideOpen, setGuideOpen] = useState(false);
  const [search, setSearch] = useState("");
  const menuButton = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const permissions = useMemo(() => profile?.permissions ?? [], [profile?.permissions]);
  const visibleGroups = useMemo(
    () =>
      adminNavigation
        .filter((group) => group.id !== "subferramentas")
        .map((group) => ({
          ...group,
          items: group.items.filter(
            (item) =>
              item.menu !== false &&
              canAccessNavigationItem(item, permissions) &&
              (!item.candidate || isEv2FeatureEnabled(profile, item.candidate)),
          ),
        }))
        .filter((group) => group.items.length > 0),
    [permissions, profile],
  );
  const breadcrumbs = resolveAdminBreadcrumbs(location.pathname, location.search);
  const routeGuidance = resolveAdminRouteGuidance(location.pathname);
  const displayName =
    (typeof user?.user_metadata?.display_name === "string" && user.user_metadata.display_name) ||
    user?.email?.split("@")[0] ||
    "Operador";
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  useEffect(() => {
    document.title = adminPageTitle(location.pathname, location.search);
    setGuideOpen(false);
    setMobileOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    window.localStorage.setItem("gaiatec.admin.sidebar-collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInput.current?.focus();
      }
      if (event.key === "Escape" && mobileOpen) {
        setMobileOpen(false);
        menuButton.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    if (!search.trim()) return;
    navigate(globalSearchTarget(search, permissions, isEv2FeatureEnabled(profile, "ev2.search_quality")));
  };

  return (
    <div className="admin-app" data-admin-surface data-sidebar-collapsed={sidebarCollapsed}>
      <a className="admin-skip-link" href="#admin-main">
        Ir para o conteúdo principal
      </a>
      <header className="admin-mobile-bar">
        <button
          ref={menuButton}
          className="admin-menu-button"
          type="button"
          aria-expanded={mobileOpen}
          aria-controls="admin-navigation"
          aria-label={mobileOpen ? "Fechar menu administrativo" : "Abrir menu administrativo"}
          onClick={() => setMobileOpen((open) => !open)}
        >
          {mobileOpen ? <X aria-hidden="true" size={20} /> : <Menu aria-hidden="true" size={20} />}
          <span>Menu</span>
        </button>
        <strong>
          GAIATEC <span>CMS</span>
        </strong>
      </header>
      {mobileOpen && (
        <button
          className="admin-sidebar-backdrop"
          type="button"
          aria-label="Fechar menu administrativo"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        id="admin-navigation"
        className={mobileOpen ? "admin-sidebar is-open" : "admin-sidebar"}
        aria-label="Menu principal do CMS"
      >
        <div className="admin-sidebar__heading">
          <Link className="admin-sidebar__brand" to="/admin" aria-label="CMS GAIATEC — visão geral">
            <span>GAIATEC</span>
            <small>CMS</small>
          </Link>
          <button
            className="admin-sidebar__collapse"
            type="button"
            aria-label={sidebarCollapsed ? "Expandir menu administrativo" : "Recolher menu administrativo"}
            aria-pressed={sidebarCollapsed}
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen aria-hidden="true" size={17} />
            ) : (
              <PanelLeftClose aria-hidden="true" size={17} />
            )}
          </button>
        </div>
        {(permissions.includes("cms:posts.read") ||
          permissions.includes("cms:products.read") ||
          permissions.includes("cms:pages.read")) && (
          <form className="admin-global-search" role="search" onSubmit={submitSearch}>
            <label className="admin-sr-only" htmlFor="admin-global-search">
              Busca global no CMS — conteúdo permitido
            </label>
            <Search aria-hidden="true" size={15} />
            <input
              ref={searchInput}
              id="admin-global-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar no CMS…"
              aria-keyshortcuts="Control+K Meta+K"
            />
            <kbd>⌘K</kbd>
          </form>
        )}
        <nav aria-label="Administração">
          {visibleGroups.map((group) => (
            <section className="admin-nav-group" key={group.id}>
              <p className="admin-nav-group__label">{group.label}</p>
              <div className="admin-nav-group__items">
                {group.items.map((item) => {
                  const ItemIcon = item.icon;
                  const active = isNavigationItemActive(item, location.pathname, location.search);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={active ? "active" : undefined}
                      aria-current={active ? "page" : undefined}
                      title={item.description}
                    >
                      <ItemIcon aria-hidden="true" size={16} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>
        <div className="admin-sidebar__footer">
          <Link className="admin-sidebar__profile" to="/admin/perfil">
            <span className="admin-sidebar__avatar">{initials || "GA"}</span>
            <span>
              <strong>{displayName}</strong>
              <small>{profile?.roles[0]?.replace(/_/g, " ") ?? "Operador"} · ver perfil</small>
            </span>
          </Link>
          <button type="button" className="admin-sidebar__logout" onClick={() => void signOut()}>
            <LogOut aria-hidden="true" size={16} /> <span>Sair</span>
          </button>
        </div>
      </aside>

      <main className="admin-main" id="admin-main">
        <nav className="admin-breadcrumbs" aria-label="Caminho da página">
          <ol>
            {breadcrumbs.map((breadcrumb, index) => (
              <li key={`${breadcrumb.label}-${index}`}>
                {breadcrumb.to && index < breadcrumbs.length - 1 ? (
                  <Link to={breadcrumb.to}>{breadcrumb.label}</Link>
                ) : (
                  <span aria-current={index === breadcrumbs.length - 1 ? "page" : undefined}>
                    {breadcrumb.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
        <button
          className="admin-screen-help__trigger"
          type="button"
          aria-expanded={guideOpen}
          aria-controls="admin-screen-help"
          onClick={() => setGuideOpen((open) => !open)}
        >
          Sobre esta tela
        </button>
        {guideOpen && (
          <aside
            id="admin-screen-help"
            className="admin-route-guide"
            aria-label="Orientação operacional desta tela"
          >
            <div>
              <strong>Nesta tela</strong>
              <span>{routeGuidance.task}</span>
            </div>
            <div>
              <strong>Impacto público</strong>
              <span>{routeGuidance.publicImpact}</span>
            </div>
            <div>
              <strong>Próximo passo</strong>
              <span>{routeGuidance.nextStep}</span>
            </div>
          </aside>
        )}
        <p className="admin-route-announcer" aria-live="polite">
          {breadcrumbs.at(-1)?.label}. {routeGuidance.task}
        </p>
        <Outlet />
      </main>
    </div>
  );
}
