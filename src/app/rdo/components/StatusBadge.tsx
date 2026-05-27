import type { RdoStatus } from "../lib/types";
import { STATUS_LABEL } from "../lib/types";

const DOT: Record<RdoStatus, string> = {
  finalizado: "bg-[var(--rdo-orange)]",
  rascunho: "bg-[var(--rdo-blue)]",
  arquivado: "bg-[var(--rdo-ghost)]",
};

const TEXT: Record<RdoStatus, string> = {
  finalizado: "text-[var(--rdo-orange-strong)]",
  rascunho: "text-[var(--rdo-blue)]",
  arquivado: "text-[var(--rdo-ink-3)]",
};

/** Status tipográfico: quadrado sólido (sharp) + label uppercase. Sem pill. */
export function StatusBadge({ status }: { status: RdoStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] ${TEXT[status]}`}>
      <span className={`h-[6px] w-[6px] ${DOT[status]}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}
