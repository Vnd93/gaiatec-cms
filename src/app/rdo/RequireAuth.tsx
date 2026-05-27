import { Navigate, useLocation } from "react-router";
import { useAuth } from "./AuthContext";

/** Bypass SÓ em dev (vite) para inspecionar telas autenticadas sem usuário real.
 *  Em build de produção `import.meta.env.DEV` é false → vira dead code (removido). */
function devPreview(): boolean {
  return import.meta.env.DEV && typeof localStorage !== "undefined" && localStorage.getItem("rdo_preview") === "1";
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="rdo-root flex min-h-[100dvh] items-center justify-center">
        <span className="rdo-spin h-7 w-7 rounded-full border-2 border-[var(--rdo-orange)]/25 border-t-[var(--rdo-orange)]" />
      </div>
    );
  }

  if (!session && !devPreview()) {
    return <Navigate to="/relatorio-de-obra/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
