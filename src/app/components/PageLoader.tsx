export function PageLoader() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center" role="status" aria-live="polite" aria-busy="true" data-route-loading="true">
      <span className="sr-only">Carregando conteúdo…</span>
      <div aria-hidden="true" className="w-8 h-8 border-2 border-[#0057DE]/20 border-t-[#0057DE] rounded-full animate-spin" />
    </div>
  );
}
