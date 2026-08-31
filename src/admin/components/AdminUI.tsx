import { useEffect, useId, useRef } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CircleSlash2,
  Info,
  LoaderCircle,
  SearchX,
  TriangleAlert,
  X,
} from "lucide-react";

type ActionContent = React.ReactNode;

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ActionContent;
  meta?: ActionContent;
}) {
  return (
    <header className="admin-page-header">
      <div className="admin-page-header__copy">
        {eyebrow && <p className="admin-eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        <p>{description}</p>
        {meta && <div className="admin-page-header__meta">{meta}</div>}
      </div>
      {actions && <ActionBar label={`Ações de ${title}`}>{actions}</ActionBar>}
    </header>
  );
}

export function ActionBar({
  children,
  label = "Ações da página",
  sticky = false,
}: {
  children: React.ReactNode;
  label?: string;
  sticky?: boolean;
}) {
  return (
    <div
      className={sticky ? "admin-action-bar is-sticky" : "admin-action-bar"}
      role="group"
      aria-label={label}
    >
      {children}
    </div>
  );
}

export function SectionCard({
  title,
  description,
  actions,
  children,
  as = "section",
}: {
  title?: string;
  description?: string;
  actions?: ActionContent;
  children: React.ReactNode;
  as?: "section" | "article";
}) {
  const Component = as;
  return (
    <Component className="admin-section-card">
      {(title || description || actions) && (
        <header className="admin-section-card__header">
          <div>
            {title && <h2>{title}</h2>}
            {description && <p>{description}</p>}
          </div>
          {actions && <ActionBar label={title ? `Ações de ${title}` : undefined}>{actions}</ActionBar>}
        </header>
      )}
      <div className="admin-section-card__content">{children}</div>
    </Component>
  );
}

export function FieldGroup({
  legend,
  description,
  children,
}: {
  legend: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="admin-field-group">
      <legend>{legend}</legend>
      {description && <p className="admin-field-group__description">{description}</p>}
      <div className="admin-field-group__grid">{children}</div>
    </fieldset>
  );
}

export function FieldHelp({
  children,
  visibility,
  id,
}: {
  children: React.ReactNode;
  visibility?: "public" | "internal";
  id?: string;
}) {
  return (
    <span className="admin-field-help" id={id}>
      {children}
      {visibility && (
        <Badge tone={visibility === "public" ? "info" : "neutral"}>
          {visibility === "public" ? "Visível no site" : "Uso interno"}
        </Badge>
      )}
    </span>
  );
}

export function StepTabs<T extends string>({
  label,
  steps,
  active,
  onChange,
  errors = {},
}: {
  label: string;
  steps: Array<{ id: T; label: string; description?: string }>;
  active: T;
  onChange: (id: T) => void;
  errors?: Partial<Record<T, number>>;
}) {
  const baseId = useId();
  return (
    <div className="admin-step-tabs" role="tablist" aria-label={label}>
      {steps.map((step, index) => {
        const selected = step.id === active;
        const issueCount = errors[step.id] ?? 0;
        return (
          <button
            key={step.id}
            id={`${baseId}-tab-${step.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`${baseId}-panel-${step.id}`}
            tabIndex={selected ? 0 : -1}
            title={step.description}
            onClick={() => onChange(step.id)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
              event.preventDefault();
              const next = (index + (event.key === "ArrowRight" ? 1 : -1) + steps.length) % steps.length;
              onChange(steps[next].id);
              document.getElementById(`${baseId}-tab-${steps[next].id}`)?.focus();
            }}
          >
            <span>{index + 1}</span>
            {step.label}
            {issueCount > 0 && <Badge tone="danger">{issueCount}</Badge>}
          </button>
        );
      })}
    </div>
  );
}

export function StatusRail({
  title = "Status e próximos passos",
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <aside className="admin-status-rail" aria-label={title}>
      <h2>{title}</h2>
      {children}
    </aside>
  );
}

const stateIcons = {
  empty: SearchX,
  error: AlertCircle,
  success: CheckCircle2,
  unavailable: CircleSlash2,
  forbidden: CircleSlash2,
  warning: TriangleAlert,
};

export function StatePanel({
  kind = "empty",
  title,
  description,
  action,
}: {
  kind?: keyof typeof stateIcons;
  title: string;
  description: string;
  action?: ActionContent;
}) {
  const Icon = stateIcons[kind];
  return (
    <section className={`admin-state-panel is-${kind}`} role={kind === "error" ? "alert" : "status"}>
      <Icon aria-hidden="true" size={24} />
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
        {action && <ActionBar label={`Ação para ${title}`}>{action}</ActionBar>}
      </div>
    </section>
  );
}

export const EmptyState = (props: Omit<React.ComponentProps<typeof StatePanel>, "kind">) => (
  <StatePanel kind="empty" {...props} />
);
export const ErrorState = (props: Omit<React.ComponentProps<typeof StatePanel>, "kind">) => (
  <StatePanel kind="error" {...props} />
);

export function LoadingSkeleton({
  label = "Carregando conteúdo",
  rows = 3,
}: {
  label?: string;
  rows?: number;
}) {
  return (
    <div className="admin-loading-skeleton" aria-busy="true" role="status" aria-label={label}>
      <LoaderCircle aria-hidden="true" className="admin-loading-skeleton__icon" size={20} />
      <span className="admin-sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} className="admin-loading-skeleton__row" />
      ))}
    </div>
  );
}

export function FilterBar({ children, summary }: { children: React.ReactNode; summary?: React.ReactNode }) {
  return (
    <section className="admin-filter-bar" aria-label="Busca e filtros">
      <div className="admin-filter-bar__fields">{children}</div>
      {summary && (
        <div className="admin-filter-bar__summary" aria-live="polite">
          {summary}
        </div>
      )}
    </section>
  );
}

export function DataTable({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <div className="admin-data-table">
      <table>
        <caption>{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "info" | "success" | "warning" | "danger";
}) {
  return <span className={`admin-badge is-${tone}`}>{children}</span>;
}

export function AdminAlert({
  children,
  tone = "info",
  title,
}: {
  children: React.ReactNode;
  tone?: "info" | "success" | "warning" | "danger";
  title?: string;
}) {
  const Icon =
    tone === "success"
      ? CheckCircle2
      : tone === "warning"
        ? TriangleAlert
        : tone === "danger"
          ? AlertCircle
          : Info;
  return (
    <div className={`admin-alert-message is-${tone}`} role={tone === "danger" ? "alert" : "status"}>
      <Icon aria-hidden="true" size={20} />
      <div>
        {title && <strong>{title}</strong>}
        <div>{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancelar",
  dangerous = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  dangerous?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onCancel, open]);
  if (!open) return null;
  return (
    <div
      className="admin-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onCancel()}
    >
      <section
        className="admin-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="admin-confirm-title"
        aria-describedby="admin-confirm-description"
      >
        <button
          className="admin-dialog-close"
          type="button"
          aria-label="Fechar confirmação"
          onClick={onCancel}
        >
          <X aria-hidden="true" size={20} />
        </button>
        <h2 id="admin-confirm-title">{title}</h2>
        <p id="admin-confirm-description">{description}</p>
        <div className="admin-confirm-dialog__actions">
          <button
            ref={cancelRef}
            className="admin-button admin-button--secondary"
            type="button"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            className={dangerous ? "admin-button admin-button--danger" : "admin-button"}
            type="button"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

export function StickyFooter({ status, children }: { status: React.ReactNode; children: React.ReactNode }) {
  return (
    <footer className="admin-sticky-footer">
      <div className="admin-sticky-footer__status">{status}</div>
      <ActionBar label="Ações do editor">{children}</ActionBar>
    </footer>
  );
}
