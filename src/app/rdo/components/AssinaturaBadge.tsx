import type { AssinaturaStatus } from "../lib/types";
import { ASSINATURA_LABEL } from "../lib/types";

const STYLES: Record<AssinaturaStatus, string> = {
  nao_assinado: "bg-zinc-100 text-zinc-500",
  aguardando_cliente: "bg-amber-50 text-amber-700",
  assinado_gaiatec: "bg-[var(--rdo-blue-soft)] text-[var(--rdo-blue)]",
  assinado: "bg-[#e8f5ee] text-[#1a7f43]",
};

const DOT: Record<AssinaturaStatus, string> = {
  nao_assinado: "bg-zinc-400",
  aguardando_cliente: "bg-amber-500",
  assinado_gaiatec: "bg-[var(--rdo-blue)]",
  assinado: "bg-[#1a9750]",
};

export function AssinaturaBadge({ status }: { status: AssinaturaStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] ${STYLES[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[status]}`} />
      {ASSINATURA_LABEL[status]}
    </span>
  );
}

/** Mostra o badge de assinatura só quando faz sentido (finalizado ou com algum progresso). */
export function shouldShowAssinatura(status: string, assinatura: AssinaturaStatus): boolean {
  return status === "finalizado" || assinatura !== "nao_assinado";
}
