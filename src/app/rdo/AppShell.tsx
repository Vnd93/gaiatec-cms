import { Link, NavLink, useNavigate } from "react-router";
import { useAuth } from "./AuthContext";
import "./rdo.css";

export function AppShell({
  children,
  showNav = true,
}: {
  children: React.ReactNode;
  showNav?: boolean;
}) {
  const navigate = useNavigate();
  const { signOut } = useAuth();

  async function handleSignOut() {
    await signOut();
    navigate("/relatorio-de-obra/login", { replace: true });
  }

  return (
    <div className="rdo-root flex min-h-[100dvh] flex-col bg-[var(--rdo-surface)]">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-[var(--rdo-line)] bg-[var(--rdo-surface)]">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-5 px-5 sm:px-8">
          <Link to="/relatorio-de-obra" className="flex items-center gap-3">
            <img src="/logo-gaiatec.png" alt="Gaiatec Sistemas" className="h-8 w-auto" />
            <span className="hidden border-l border-[var(--rdo-line)] pl-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--rdo-ink-3)] sm:block">
              Relatório Diário de Obra
            </span>
          </Link>

          <div className="flex-1" />

          {showNav && (
            <nav className="hidden items-center gap-1 lg:flex">
              <TopNavLink to="/relatorio-de-obra" end label="Relatórios" />
              <TopNavLink to="/relatorio-de-obra/arquivo" label="Arquivo" />
            </nav>
          )}

          <button
            onClick={handleSignOut}
            className="text-[13px] font-medium text-[var(--rdo-ink-3)] transition-colors hover:text-[var(--rdo-ink)] lg:ml-3"
          >
            Sair
          </button>
        </div>
      </header>

      {/* Content */}
      <main
        className={`mx-auto w-full max-w-5xl flex-1 px-5 py-9 sm:px-8 sm:py-12 ${
          showNav ? "pb-28 lg:pb-12" : "pb-12"
        }`}
      >
        {children}
      </main>

      {/* Bottom tabs — mobile only */}
      {showNav && (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--rdo-line)] bg-[var(--rdo-surface)] lg:hidden">
          <div className="mx-auto flex w-full max-w-5xl">
            <BottomTab to="/relatorio-de-obra" end label="Relatórios" />
            <BottomTab to="/relatorio-de-obra/arquivo" label="Arquivo" />
          </div>
        </nav>
      )}
    </div>
  );
}

function TopNavLink({ to, end, label }: { to: string; end?: boolean; label: string }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `border-b-2 px-3 py-[22px] text-[13px] font-medium transition-colors ${
          isActive
            ? "border-[var(--rdo-orange)] text-[var(--rdo-ink)]"
            : "border-transparent text-[var(--rdo-ink-3)] hover:text-[var(--rdo-ink)]"
        }`
      }
    >
      {label}
    </NavLink>
  );
}

function BottomTab({ to, end, label }: { to: string; end?: boolean; label: string }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex flex-1 items-center justify-center border-t-2 py-4 text-[13px] font-semibold transition-colors ${
          isActive
            ? "border-[var(--rdo-orange)] text-[var(--rdo-orange)]"
            : "border-transparent text-[var(--rdo-ink-3)]"
        }`
      }
    >
      {label}
    </NavLink>
  );
}
