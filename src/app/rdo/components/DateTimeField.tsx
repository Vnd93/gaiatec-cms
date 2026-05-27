import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { DayPicker } from "react-day-picker";
import { ptBR } from "date-fns/locale";
import { formatDateTime } from "../lib/format";

/** Campo de data + hora com popover de calendário (estilo minimal). value/onChange em ISO. */
export function DateTimeField({
  value,
  onChange,
  placeholder = "Selecionar data e hora",
}: {
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? new Date(value) : undefined;
  const validSel = selected && !isNaN(selected.getTime()) ? selected : undefined;
  const timeStr = validSel
    ? `${String(validSel.getHours()).padStart(2, "0")}:${String(validSel.getMinutes()).padStart(2, "0")}`
    : "";

  function commit(day: Date | undefined, hm: string) {
    if (!day) return onChange("");
    const [h, m] = (hm || "08:00").split(":").map((n) => parseInt(n, 10));
    const d = new Date(day);
    d.setHours(isNaN(h) ? 8 : h, isNaN(m) ? 0 : m, 0, 0);
    onChange(d.toISOString());
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between border border-[var(--rdo-line)] bg-white px-3.5 py-2.5 text-left text-sm outline-none transition-colors hover:border-[var(--rdo-ink-3)] data-[state=open]:border-[var(--rdo-orange)]"
        >
          <span className={validSel ? "text-[var(--rdo-ink)]" : "text-[var(--rdo-ghost)]"}>
            {validSel ? formatDateTime(value) : placeholder}
          </span>
          <span className="ml-3 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--rdo-ghost)]">
            {validSel ? "editar" : "abrir"}
          </span>
        </button>
      </Popover.Trigger>

      <Popover.Content
        className="rdo-pop z-50 w-[300px] p-3"
        sideOffset={6}
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DayPicker
          className="rdo-daypicker"
          mode="single"
          locale={ptBR}
          selected={validSel}
          defaultMonth={validSel}
          onSelect={(day) => commit(day, timeStr)}
          showOutsideDays
        />

        <div className="mt-2 flex items-center justify-between border-t border-[var(--rdo-line)] pt-3">
          <label className="flex items-center gap-2 text-[12px] font-medium text-[var(--rdo-ink-2)]">
            Hora
            <input
              type="time"
              value={timeStr}
              onChange={(e) => commit(validSel ?? new Date(), e.target.value)}
              className="border border-[var(--rdo-line)] bg-white px-2 py-1 text-[13px] text-[var(--rdo-ink)] outline-none focus:border-[var(--rdo-orange)]"
            />
          </label>
          <div className="flex items-center gap-3 text-[12px] font-medium">
            {validSel && (
              <button
                type="button"
                onClick={() => onChange("")}
                className="text-[var(--rdo-ink-3)] transition-colors hover:text-[var(--rdo-ink)]"
              >
                Limpar
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[var(--rdo-orange-strong)] transition-colors hover:text-[var(--rdo-orange)]"
            >
              Concluir
            </button>
          </div>
        </div>
      </Popover.Content>
    </Popover.Root>
  );
}
