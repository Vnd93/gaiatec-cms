import type { RdoStatus } from "../lib/types";
import { STATUS_LABEL } from "../lib/types";

const STYLES: Record<RdoStatus, string> = {
  rascunho: "bg-amber-50 text-amber-700",
  finalizado: "bg-[var(--rdo-orange-soft)] text-[var(--rdo-orange-strong)]",
  arquivado: "bg-zinc-100 text-zinc-500",
};

const DOT: Record<RdoStatus, string> = {
  rascunho: "bg-amber-500",
  finalizado: "bg-[var(--rdo-orange)]",
  arquivado: "bg-zinc-400",
};

export function StatusBadge({ status }: { status: RdoStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] ${STYLES[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[status]}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}
