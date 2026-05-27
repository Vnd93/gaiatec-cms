import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router";
import { Archive, FileText, LogOut, Menu, X } from "lucide-react";
import { useAuth } from "./AuthContext";
import { InviteDialog } from "./components/InviteDialog";
import "./rdo.css";

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <img
        src="/logo-gaiatec-emblema.png"
        alt="Gaiatec Sistemas"
        className={compact ? "h-7 w-7 object-contain" : "h-9 w-9 object-contain"}
      />
      <span className="leading-none">
        <span className="block text-[15px] font-extrabold tracking-[-0.02em] text-[var(--rdo-ink)]">
          GAIATEC
        </span>
        <span className="mt-[3px] block text-[9px] font-semibold uppercase tracking-[0.24em] text-[var(--rdo-ink-3)]">
          Sistemas
        </span>
      </span>
    </span>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { signOut, isAdmin, user } = useAuth();
  const [open, setOpen] = useState(false);

  async function handleSignOut() {
    await signOut();
    navigate("/relatorio-de-obra/login", { replace: true });
  }

  const close = () => setOpen(false);

  return (
    <div className="rdo-root min-h-[100dvh] bg-[var(--rdo-bg)]">
      {/* Top bar — mobile */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[var(--rdo-line)] bg-white px-4 lg:hidden">
        <button
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--rdo-ink-2)] transition-colors hover:bg-[var(--rdo-bg-2)]"
        >
          <Menu size={20} />
        </button>
        <Link to="/relatorio-de-obra" onClick={close}>
          <Brand compact />
        </Link>
      </header>

      {/* Overlay — mobile */}
      {open && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={close} />}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-[var(--rdo-line)] bg-white transition-transform duration-200 ease-out lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Link to="/relatorio-de-obra" onClick={close}>
            <Brand />
          </Link>
          <button
            onClick={close}
            aria-label="Fechar menu"
            className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--rdo-ink-3)] hover:bg-[var(--rdo-bg-2)] lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-3 pb-2 pt-1">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--rdo-ghost)]">
            Obras
          </p>
          <nav className="space-y-1">
            <NavItem to="/relatorio-de-obra" end icon={<FileText size={18} strokeWidth={1.8} />} label="Relatórios" onClick={close} />
            <NavItem to="/relatorio-de-obra/arquivo" icon={<Archive size={18} strokeWidth={1.8} />} label="Arquivo" onClick={close} />
          </nav>
        </div>

        <div className="flex-1" />

        <div className="border-t border-[var(--rdo-line)] p-3">
          {isAdmin && (
            <div className="mb-1">
              <InviteDialog />
            </div>
          )}
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-[13.5px] font-medium text-[var(--rdo-ink-2)] transition-colors hover:bg-[var(--rdo-bg-2)]"
          >
            <LogOut size={18} strokeWidth={1.8} />
            Sair
          </button>
          {user?.email && (
            <div className="mt-2 flex items-center gap-2 px-3">
              <span className="truncate text-[11px] text-[var(--rdo-ghost)]">{user.email}</span>
              {isAdmin && (
                <span className="shrink-0 rounded bg-[var(--rdo-blue-soft)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--rdo-blue)]">
                  Admin
                </span>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Content */}
      <div className="lg:pl-64">
        <main className="mx-auto w-full max-w-5xl px-5 py-7 sm:px-8 lg:py-10">{children}</main>
      </div>
    </div>
  );
}

function NavItem({
  to,
  end,
  icon,
  label,
  onClick,
}: {
  to: string;
  end?: boolean;
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-md px-3 py-2 text-[13.5px] transition-colors ${
          isActive
            ? "bg-[var(--rdo-blue-soft)] font-semibold text-[var(--rdo-blue)]"
            : "font-medium text-[var(--rdo-ink-2)] hover:bg-[var(--rdo-bg-2)]"
        }`
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}
