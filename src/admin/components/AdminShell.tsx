import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { useAdminAuth } from "../auth/AdminAuthContext";
import "../admin.css";

export function AdminShell() {
  const { profile, user, signOut } = useAdminAuth();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const menuButton = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const can = (permission: string) => profile?.permissions.includes(permission) ?? false;
  const segments = location.pathname.split("/").filter(Boolean);
  const links = [
    ["/admin", "Visão geral", true],
    ["/admin/conteudo", "Conteúdo", can("cms:posts.read")],
    ["/admin/midia", "Mídia", can("cms:media.read")],
    ["/admin/perfil", "Perfil e sessão", true],
    ["/admin/usuarios", "Usuários", can("cms:users.read")],
    ["/admin/diagnosticos", "Diagnósticos", can("cms:diagnostics.read")],
  ] as const;
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      menuButton.current?.focus();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);
  return (
    <div className="admin-app" data-admin-surface>
      <header className="admin-topbar">
        <button
          ref={menuButton}
          className="admin-menu-button"
          aria-expanded={open}
          aria-controls="admin-navigation"
          onClick={() => setOpen(!open)}
        >
          Menu
        </button>
        <Link to="/admin" aria-label="CMS GAIATEC — início">
          <img src="/logo-gaiatec.png" alt="" />
        </Link>
        {can("cms:posts.read") && (
          <form
            className="admin-global-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              navigate("/admin/conteudo?q=" + encodeURIComponent(search.trim()));
            }}
          >
            <label htmlFor="admin-global-search">Busca global no CMS</label>
            <input
              id="admin-global-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar conteúdo"
            />
            <button type="submit">Buscar</button>
          </form>
        )}
        <button className="admin-button admin-button--secondary" onClick={() => void signOut()}>
          Sair
        </button>
      </header>
      <aside id="admin-navigation" className={open ? "admin-sidebar is-open" : "admin-sidebar"}>
        <p className="admin-eyebrow">CMS GAIATEC</p>
        <nav aria-label="Administração">
          {links
            .filter((entry) => entry[2])
            .map(([to, label]) => (
              <NavLink key={to} to={to} end={to === "/admin"} onClick={() => setOpen(false)}>
                {label}
              </NavLink>
            ))}
        </nav>
        <p className="admin-sidebar__identity">
          {user?.email}
          <br />
          <span>{profile?.roles.join(", ")}</span>
        </p>
      </aside>
      <main className="admin-main" id="admin-main">
        <nav className="admin-breadcrumbs" aria-label="Breadcrumb">
          <Link to="/admin">Início</Link>
          {segments.slice(1).map((segment, index) => (
            <span key={segment + index}> / {decodeURIComponent(segment)}</span>
          ))}
        </nav>
        <Outlet />
      </main>
    </div>
  );
}
