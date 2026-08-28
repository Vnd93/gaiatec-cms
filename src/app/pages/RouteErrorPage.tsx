import { useEffect, useMemo } from "react";
import { Link, isRouteErrorResponse, useLocation, useRouteError } from "react-router";

function errorMessage(error: unknown): string {
  if (isRouteErrorResponse(error)) return `${error.status}:${error.statusText}`;
  if (error instanceof Error) return error.message;
  return "unknown-route-error";
}

export default function RouteErrorPage() {
  const error = useRouteError();
  const location = useLocation();
  const message = errorMessage(error);
  const chunkFailure = /ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed/i.test(message);
  const supportCode = useMemo(() => {
    let hash = 2166136261;
    for (const char of `${location.pathname}:${message}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return `WEB-${(hash >>> 0).toString(16).toUpperCase().padStart(8, "0")}`;
  }, [location.pathname, message]);

  useEffect(() => {
    if (!chunkFailure) return;
    const asset = message.match(/https?:\/\/[^\s)]+|\/assets\/[^\s)]+/)?.[0] ?? message;
    const key = `gaiatec-chunk-retry:${location.pathname}:${asset}`;
    if (sessionStorage.getItem(key) === "1") return;
    sessionStorage.setItem(key, "1");
    window.location.reload();
  }, [chunkFailure, location.pathname, message]);

  return (
    <main className="flex min-h-[70dvh] items-center justify-center bg-slate-50 px-6 py-16" role="alert">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0057DE]">Código {supportCode}</p>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">Não foi possível abrir esta página</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {chunkFailure ? "Tentamos atualizar os arquivos do site uma vez. Se o problema continuar, recarregue ou volte ao início." : "O erro foi contido nesta rota. Tente novamente sem perder o restante da navegação."}
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <button onClick={() => window.location.reload()} className="rounded-md bg-[#0057DE] px-5 py-2.5 text-sm font-semibold text-white">Recarregar</button>
          <Link to="/" className="rounded-md border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-800">Voltar ao início</Link>
        </div>
      </div>
    </main>
  );
}
