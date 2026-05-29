import type { Relatorio } from "../lib/types";
import { StatusBadge } from "./StatusBadge";
import { AssinaturaBadge, shouldShowAssinatura } from "./AssinaturaBadge";
import { formatDateTime } from "../lib/format";

export function RelatorioCard({
  relatorio,
  busyDownload,
  onOpen,
  onDownload,
  onArchive,
  onRestore,
  onDelete,
}: {
  relatorio: Relatorio;
  busyDownload?: boolean;
  onOpen: () => void;
  onDownload?: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
  onDelete?: () => void;
}) {
  const r = relatorio;
  const eng = [r.eng_gaiatec, r.eng_cliente].filter(Boolean).join(" · ");

  return (
    <div className="group flex flex-col gap-3 border-b border-[var(--rdo-line)] px-4 py-3.5 transition-colors last:border-b-0 hover:bg-[var(--rdo-bg-2)] sm:flex-row sm:items-center sm:gap-5">
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="flex items-baseline gap-2.5">
          <span className="truncate text-[15px] font-semibold tracking-[-0.01em] text-[var(--rdo-ink)]">
            {r.cliente || "Sem cliente"}
          </span>
          <span className="shrink-0 text-[12px] font-medium text-[var(--rdo-ink-3)]">{r.contrato || "—"}</span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-[var(--rdo-ink-3)]">
          <StatusBadge status={r.status} />
          {shouldShowAssinatura(r.status, r.assinatura_status) && <AssinaturaBadge status={r.assinatura_status} />}
          <span className="text-[var(--rdo-line-strong)]">·</span>
          <span>{formatDateTime(r.updated_at)}</span>
          {eng && (
            <>
              <span className="hidden text-[var(--rdo-line-strong)] sm:inline">·</span>
              <span className="hidden truncate sm:inline">{eng}</span>
            </>
          )}
        </div>
      </button>

      <div className="flex shrink-0 items-center gap-3.5 text-[12px] font-medium">
        <TextAction onClick={onOpen} label="Ver" />
        {onDownload && <TextAction onClick={onDownload} label={busyDownload ? "Gerando…" : "PDF"} accent disabled={busyDownload} />}
        {onRestore && <TextAction onClick={onRestore} label="Restaurar" />}
        {onArchive && <TextAction onClick={onArchive} label="Arquivar" />}
        {onDelete && <TextAction onClick={onDelete} label="Excluir" danger />}
      </div>
    </div>
  );
}

function TextAction({
  onClick,
  label,
  accent,
  danger,
  disabled,
}: {
  onClick?: () => void;
  label: string;
  accent?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  const color = accent
    ? "text-[var(--rdo-blue)] hover:text-[var(--rdo-blue-strong)]"
    : danger
      ? "text-[var(--rdo-ink-3)] hover:text-red-600"
      : "text-[var(--rdo-ink-3)] hover:text-[var(--rdo-ink)]";
  return (
    <button onClick={onClick} disabled={disabled} className={`transition-colors disabled:opacity-55 ${color}`}>
      {label}
    </button>
  );
}
