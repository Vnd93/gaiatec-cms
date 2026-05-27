export function EmptyState({
  kicker,
  title,
  subtitle,
  action,
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="border-t border-[var(--rdo-line)] py-20 text-center">
      {kicker && (
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--rdo-ghost)]">
          {kicker}
        </p>
      )}
      <h3 className="text-lg font-semibold tracking-[-0.02em] text-[var(--rdo-ink)]">{title}</h3>
      {subtitle && <p className="mx-auto mt-2 max-w-sm text-sm text-[var(--rdo-ink-2)]">{subtitle}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
