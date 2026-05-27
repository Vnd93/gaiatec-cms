export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full border-b border-[var(--rdo-line)] bg-transparent py-2.5 text-sm text-[var(--rdo-ink)] outline-none transition-colors placeholder:text-[var(--rdo-ghost)] focus:border-[var(--rdo-ink)]"
    />
  );
}
