import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Search, UserRound, X } from "lucide-react";
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
import "../admin.css";
import "../admin-f11.css";

export function AdminShell() {
  const { profile, user, signOut } = useAdminAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return window.sessionStorage.getItem("gaiatec:cms:ui:sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });
  const [search, setSearch] = useState("");
  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const permissions = useMemo(() => profile?.permissions ?? [], [profile?.permissions]);
  const visibleGroups = useMemo(
    () =>
      adminNavigation
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => canAccessNavigationItem(item, permissions)),
        }))
        .filter((group) => group.items.length > 0),
    [permissions],
  );
  const activeGroupId = visibleGroups.find((group) =>
    group.items.some((item) => isNavigationItemActive(item, location.pathname, location.search)),
  )?.id;
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const breadcrumbs = resolveAdminBreadcrumbs(location.pathname, location.search);
  const routeGuidance = resolveAdminRouteGuidance(location.pathname);

  useEffect(() => {
    document.title = adminPageTitle(location.pathname, location.search);
    if (activeGroupId) setExpandedGroups((current) => ({ ...current, [activeGroupId]: true }));
  }, [activeGroupId, location.pathname, location.search]);

  useEffect(() => {
    if (!mobileOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMobileOpen(false);
      menuButton.current?.focus();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileOpen]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInput.current?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  useEffect(() => {
    try {
      window.sessionStorage.setItem("gaiatec:cms:ui:sidebar-collapsed", String(sidebarCollapsed));
    } catch {
      // Preferência visual não deve bloquear a operação do CMS.
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (!mobileOpen) return;
    document.body.classList.add("admin-navigation-open");
    sidebar.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => document.body.classList.remove("admin-navigation-open");
  }, [mobileOpen]);

  return (
    <div className="admin-app" data-admin-surface data-sidebar-collapsed={sidebarCollapsed || undefined}>
      <a className="admin-skip-link" href="#admin-main">
        Ir para o conteúdo principal
      </a>
      <header className="admin-topbar">
        <button
          ref={menuButton}
          className="admin-menu-button"
          type="button"
          aria-expanded={mobileOpen}
          aria-controls="admin-navigation"
          aria-label={mobileOpen ? "Fechar menu administrativo" : "Abrir menu administrativo"}
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X aria-hidden="true" size={20} /> : <Menu aria-hidden="true" size={20} />}
          <span>Menu</span>
        </button>
        <Link to="/admin" aria-label="CMS GAIATEC — visão geral">
          <img src="/logo-gaiatec.png" alt="" />
        </Link>
        {(permissions.includes("cms:posts.read") ||
          permissions.includes("cms:products.read") ||
          permissions.includes("cms:pages.read")) && (
          <form
            className="admin-global-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              if (search.trim()) navigate(globalSearchTarget(search, permissions));
            }}
          >
            <label htmlFor="admin-global-search">Busca global no CMS — conteúdo permitido</label>
            <input
              ref={searchInput}
              id="admin-global-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar no catálogo e conteúdo"
              aria-keyshortcuts="Control+K Meta+K"
            />
            <button type="submit" aria-label="Executar busca">
              <Search aria-hidden="true" size={18} />
              <span>Buscar</span>
            </button>
          </form>
        )}
        <div className="admin-account" aria-label="Conta e sessão">
          <Link className="admin-account__profile" to="/admin/perfil">
            <span className="admin-account__icon">
              <UserRound aria-hidden="true" size={18} />
            </span>
            <span className="admin-account__copy">
              <strong>{profile?.roles[0]?.replace(/_/g, " ") ?? "Operador"}</strong>
              <small>{user?.email}</small>
            </span>
          </Link>
          <button
            className="admin-icon-button"
            type="button"
            aria-label="Sair do CMS"
            title="Sair do CMS"
            onClick={() => void signOut()}
          >
            <LogOut aria-hidden="true" size={19} />
          </button>
        </div>
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
        ref={sidebar}
        id="admin-navigation"
        className={mobileOpen ? "admin-sidebar is-open" : "admin-sidebar"}
        aria-label="Menu principal do CMS"
      >
        <div className="admin-sidebar__heading">
          <p className="admin-eyebrow">CMS GAIATEC</p>
          <button
            className="admin-sidebar__collapse"
            type="button"
            aria-label={sidebarCollapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
            title={sidebarCollapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
            onClick={() => setSidebarCollapsed((current) => !current)}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen aria-hidden="true" size={18} />
            ) : (
              <PanelLeftClose aria-hidden="true" size={18} />
            )}
          </button>
        </div>
        <nav aria-label="Administração">
          {visibleGroups.map((group) => {
            const GroupIcon = group.icon;
            const groupActive = group.id === activeGroupId;
            const expanded = expandedGroups[group.id] ?? groupActive ?? false;
            const panelId = `admin-navigation-${group.id}`;
            return (
              <section
                className={groupActive ? "admin-nav-group is-active" : "admin-nav-group"}
                key={group.id}
              >
                <button
                  className="admin-nav-group__trigger"
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onClick={() => setExpandedGroups((current) => ({ ...current, [group.id]: !expanded }))}
                >
                  <GroupIcon aria-hidden="true" size={18} />
                  <span>{group.label}</span>
                  <ChevronDown aria-hidden="true" className="admin-nav-group__chevron" size={17} />
                </button>
                <div id={panelId} className="admin-nav-group__items" hidden={!expanded}>
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
                        onClick={() => setMobileOpen(false)}
                      >
                        <ItemIcon aria-hidden="true" size={17} />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </nav>
        <p className="admin-sidebar__identity">
          <span className="admin-sidebar__identity-label">Sessão ativa</span>
          {user?.email}
          <br />
          <span>{profile?.roles.join(", ")}</span>
        </p>
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
        <aside className="admin-route-guide" aria-label="Orientação operacional desta tela">
          <div>
            <strong>Nesta tela</strong>
            <span>{routeGuidance.task}</span>
          </div>
          <div>
            <strong>Impacto público</strong>
            <span>{routeGuidance.publicImpact}</span>
          </div>
          <div>
            <strong>Uso interno</strong>
            <span>{routeGuidance.internal}</span>
          </div>
          <div>
            <strong>Próximo passo</strong>
            <span>{routeGuidance.nextStep}</span>
          </div>
        </aside>
        <p className="admin-route-announcer" aria-live="polite">
          {breadcrumbs.at(-1)?.label}. {routeGuidance.task}
        </p>
        <Outlet />
      </main>
    </div>
  );
}
