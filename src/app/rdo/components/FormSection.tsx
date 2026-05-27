export function FormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-[var(--rdo-line)] pt-8">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--rdo-ink-3)]">
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function Labeled({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[13px] font-medium text-[var(--rdo-ink-2)]">
        {label}
        {required && <span className="ml-0.5 text-[var(--rdo-orange)]">*</span>}
      </span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full border border-[var(--rdo-line)] bg-white px-3.5 py-2.5 text-sm text-[var(--rdo-ink)] outline-none transition-colors placeholder:text-[var(--rdo-ghost)] focus:border-[var(--rdo-orange)]";
