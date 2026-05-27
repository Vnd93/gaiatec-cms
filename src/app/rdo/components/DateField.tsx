import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Calendar } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { ptBR } from "date-fns/locale";

function parseYMD(s: string): Date | undefined {
  if (!s) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return isNaN(dt.getTime()) ? undefined : dt;
}
function toYMD(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Campo de data (apenas data) com popover de calendário. value = "YYYY-MM-DD". */
export function DateField({
  value,
  onChange,
  placeholder = "Selecionar data",
}: {
  value: string;
  onChange: (ymd: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const sel = parseYMD(value);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-md border border-[var(--rdo-line)] bg-white px-3 py-2 text-[13px] outline-none transition-colors hover:border-[var(--rdo-ink-3)] focus:border-[var(--rdo-blue)] focus:ring-2 focus:ring-[var(--rdo-blue-soft)] data-[state=open]:border-[var(--rdo-blue)]"
        >
          <span className={sel ? "text-[var(--rdo-ink)]" : "text-[var(--rdo-ghost)]"}>
            {sel ? sel.toLocaleDateString("pt-BR") : placeholder}
          </span>
          <Calendar size={15} className="text-[var(--rdo-ink-3)]" />
        </button>
      </Popover.Trigger>
      <Popover.Content className="rdo-pop z-[55] p-2" sideOffset={6} align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DayPicker
          className="rdo-daypicker"
          mode="single"
          locale={ptBR}
          selected={sel}
          defaultMonth={sel}
          onSelect={(d) => {
            onChange(d ? toYMD(d) : "");
            setOpen(false);
          }}
          showOutsideDays
        />
      </Popover.Content>
    </Popover.Root>
  );
}
