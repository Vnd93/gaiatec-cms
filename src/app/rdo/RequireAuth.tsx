import { Navigate, useLocation } from "react-router";
import { useAuth } from "./AuthContext";

/** Bypass SÓ em dev (vite) para inspecionar telas autenticadas sem usuário real.
 *  Em build de produção `import.meta.env.DEV` é false → vira dead code (removido). */
function devPreview(): boolean {
  return import.meta.env.DEV && typeof localStorage !== "undefined" && localStorage.getItem("rdo_preview") === "1";
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, hasRdoAccess, loading, signOut } = useAuth();
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

  if (session && !hasRdoAccess) {
    return (
      <div className="rdo-root flex min-h-[100dvh] items-center justify-center px-6">
        <div className="max-w-md rounded-xl border border-[var(--rdo-line)] bg-white p-7 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-[var(--rdo-ink)]">Acesso RDO não autorizado</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--rdo-ink-3)]">
            Sua conta não possui convite ativo para o Relatório Diário de Obra. Solicite a liberação a um administrador RDO.
          </p>
          <button onClick={() => signOut()} className="mt-5 rounded-md bg-[var(--rdo-blue)] px-4 py-2 text-sm font-semibold text-white">
            Sair
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
