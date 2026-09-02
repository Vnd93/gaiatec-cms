import { useId } from "react";

export type EntityPickerOption = {
  id: string;
  label: string;
  secondaryLabel?: string;
  disabled?: boolean;
};

export function EntityPicker({
  label,
  value,
  options,
  disabled,
  loading,
  unavailableMessage = "Lista indisponível",
  onChange,
}: {
  label: string;
  value: string;
  options: EntityPickerOption[];
  disabled?: boolean;
  loading?: boolean;
  unavailableMessage?: string;
  onChange(option: EntityPickerOption | undefined, input: string): void;
}) {
  const generatedId = useId();
  const safeId = generatedId.replaceAll(":", "");
  const inputId = `admin-entity-picker-input-${safeId}`;
  const listId = `admin-entity-picker-list-${safeId}`;
  const helpId = `admin-entity-picker-help-${safeId}`;
  const available = options.filter((option) => !option.disabled);
  const blocked = disabled || loading || available.length === 0;
  return (
    <div className="admin-entity-picker">
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        role="combobox"
        aria-controls={listId}
        aria-describedby={!loading && !available.length ? helpId : undefined}
        aria-expanded="false"
        aria-busy={loading || undefined}
        list={listId}
        value={value}
        disabled={blocked}
        placeholder={loading ? "Carregando opções…" : blocked ? unavailableMessage : "Digite para pesquisar"}
        onChange={(event) => {
          const input = event.target.value;
          onChange(
            available.find((option) => option.label === input || option.secondaryLabel === input),
            input,
          );
        }}
      />
      <datalist id={listId}>
        {available.map((option) => (
          <option key={option.id} value={option.label}>
            {option.secondaryLabel}
          </option>
        ))}
      </datalist>
      {!loading && !available.length && (
        <span id={helpId} className="admin-help">
          {unavailableMessage}
        </span>
      )}
    </div>
  );
}
