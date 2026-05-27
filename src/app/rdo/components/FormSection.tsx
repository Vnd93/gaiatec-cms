export function FormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--rdo-ink-3)]">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function Labeled({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline gap-1.5">
        <span className="text-[12px] font-medium text-[var(--rdo-ink-2)]">
          {label}
          {required && <span className="ml-0.5 text-[var(--rdo-blue)]">*</span>}
        </span>
        {hint && <span className="text-[11px] text-[var(--rdo-ghost)]">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

/** Input compacto (~36px de altura), foco azul. */
export const inputClass =
  "w-full rounded-md border border-[var(--rdo-line)] bg-white px-3 py-2 text-[13px] text-[var(--rdo-ink)] outline-none transition-colors placeholder:text-[var(--rdo-ghost)] focus:border-[var(--rdo-blue)] focus:ring-2 focus:ring-[var(--rdo-blue-soft)]";
