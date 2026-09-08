import { useEffect, useId, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router";
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

const MODAL_FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function ModalPortal({ children }: { children: React.ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div data-admin-modal-layer style={{ display: "contents" }}>
      {children}
    </div>,
    document.body,
  );
}

function useModalAccessibility({
  open,
  dialogRef,
  initialFocusRef,
  onDismiss,
}: {
  open: boolean;
  dialogRef: React.RefObject<HTMLElement | null>;
  initialFocusRef: React.RefObject<HTMLElement | null>;
  onDismiss: () => void;
}) {
  const dismissRef = useRef(onDismiss);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  dismissRef.current = onDismiss;

  useLayoutEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const layer = dialog.closest<HTMLElement>("[data-admin-modal-layer]");
    const background = Array.from(document.body.children).filter(
      (element): element is HTMLElement => element instanceof HTMLElement && element !== layer,
    );
    const previousInert = background.map((element) => [element, element.hasAttribute("inert")] as const);
    background.forEach((element) => element.setAttribute("inert", ""));

    const focusable = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(MODAL_FOCUSABLE_SELECTOR)).filter(
        (element) => !element.hidden && element.getAttribute("aria-hidden") !== "true",
      );
    (initialFocusRef.current ?? focusable()[0] ?? dialog).focus();

    const containFocus = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        dismissRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const candidates = focusable();
      if (candidates.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = candidates[0];
      const last = candidates[candidates.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", containFocus, true);
    return () => {
      document.removeEventListener("keydown", containFocus, true);
      previousInert.forEach(([element, wasInert]) => {
        if (!wasInert) element.removeAttribute("inert");
      });
      const restoreTarget = restoreFocusRef.current;
      if (restoreTarget?.isConnected) restoreTarget.focus();
    };
  }, [dialogRef, initialFocusRef, open]);
}

export function ModuleTabs({
  label,
  items,
}: {
  label: string;
  items: Array<{ label: string; to: string; end?: boolean }>;
}) {
  const location = useLocation();
  return (
    <nav className="admin-module-tabs" aria-label={label}>
      {items.map((item) => {
        const [pathname, search = ""] = item.to.split("?");
        const active =
          location.pathname === pathname &&
          (search
            ? new URLSearchParams(location.search).toString() === search
            : !item.end || !location.search);
        return (
          <Link key={item.to} to={item.to} aria-current={active ? "page" : undefined}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function RecordDrawer({
  open,
  eyebrow,
  title,
  address,
  status,
  fields,
  summary,
  primary,
  children,
  onClose,
}: {
  open: boolean;
  eyebrow: string;
  title: string;
  address?: string;
  status?: React.ReactNode;
  fields?: Array<{ label: string; value: React.ReactNode }>;
  summary?: React.ReactNode;
  primary?: React.ReactNode;
  children?: React.ReactNode;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const titleId = useId();
  useModalAccessibility({ open, dialogRef, initialFocusRef: closeRef, onDismiss: onClose });
  if (!open) return null;
  return (
    <ModalPortal>
      <>
        <button
          className="admin-record-drawer-backdrop"
          type="button"
          aria-label="Fechar resumo"
          onClick={onClose}
        />
        <aside
          ref={dialogRef}
          className="admin-record-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
        >
          <header className="admin-record-drawer__header">
            <div>
              <p className="admin-eyebrow">{eyebrow}</p>
              <h2 id={titleId}>{title}</h2>
              {address && <code>{address}</code>}
            </div>
            <button ref={closeRef} type="button" aria-label="Fechar resumo" onClick={onClose}>
              <X aria-hidden="true" size={18} />
            </button>
          </header>
          {primary && <div className="admin-record-drawer__primary">{primary}</div>}
          {status && <div className="admin-record-drawer__status">{status}</div>}
          {fields && (
            <dl className="admin-record-drawer__fields">
              {fields.map((field) => (
                <div key={field.label}>
                  <dt>{field.label}</dt>
                  <dd>{field.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {summary && (
            <section className="admin-record-drawer__summary">
              <h3>Resumo</h3>
              {summary}
            </section>
          )}
          {children}
        </aside>
      </>
    </ModalPortal>
  );
}

export function AdminToast({
  message,
  tone = "success",
  duration = 2600,
  onDismiss,
}: {
  message: string;
  tone?: "success" | "danger" | "info";
  duration?: number;
  onDismiss?: () => void;
}) {
  useEffect(() => {
    if (!message || !onDismiss) return;
    const timer = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(timer);
  }, [duration, message, onDismiss]);
  if (!message) return null;
  return (
    <div className={`admin-toast is-${tone}`} role={tone === "danger" ? "alert" : "status"}>
      {message}
      {onDismiss && (
        <button type="button" aria-label="Fechar confirmação" onClick={onDismiss}>
          <X aria-hidden="true" size={16} />
        </button>
      )}
    </div>
  );
}

export function RelationMatrix({
  rowLabel,
  columnLabel,
  rows,
  columns,
  linked,
  disabled,
  onToggle,
}: {
  rowLabel: string;
  columnLabel: string;
  rows: Array<{ id: string; label: string }>;
  columns: Array<{ id: string; label: string }>;
  linked: (rowId: string, columnId: string) => boolean;
  disabled?: boolean;
  onToggle: (rowId: string, columnId: string, next: boolean) => void;
}) {
  return (
    <div className="admin-relation-matrix">
      <table>
        <caption>
          Matriz {rowLabel} × {columnLabel}
        </caption>
        <thead>
          <tr>
            <th scope="col">{rowLabel}</th>
            {columns.map((column) => (
              <th scope="col" key={column.id}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <th scope="row">{row.label}</th>
              {columns.map((column) => {
                const active = linked(row.id, column.id);
                return (
                  <td key={column.id}>
                    <button
                      type="button"
                      className={active ? "is-linked" : undefined}
                      aria-pressed={active}
                      aria-label={`${active ? "Remover" : "Adicionar"} vínculo entre ${row.label} e ${column.label}`}
                      disabled={disabled}
                      onClick={() => onToggle(row.id, column.id, !active)}
                    >
                      <span aria-hidden="true">{active ? "✓" : "—"}</span>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

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
  disabled = false,
  children,
}: {
  legend: string;
  description?: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="admin-field-group" disabled={disabled}>
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
  idPrefix,
}: {
  label: string;
  steps: Array<{ id: T; label: string; description?: string }>;
  active: T;
  onChange: (id: T) => void;
  errors?: Partial<Record<T, number>>;
  idPrefix?: string;
}) {
  const generatedId = useId();
  const baseId = idPrefix ?? generatedId;
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
              if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? steps.length - 1
                    : (index + (event.key === "ArrowRight" ? 1 : -1) + steps.length) % steps.length;
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
  confirmDisabled = false,
  children,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  dangerous?: boolean;
  confirmDisabled?: boolean;
  children?: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useModalAccessibility({ open, dialogRef, initialFocusRef: cancelRef, onDismiss: onCancel });
  if (!open) return null;
  return (
    <ModalPortal>
      <div
        className="admin-dialog-backdrop"
        role="presentation"
        onMouseDown={(event) => event.target === event.currentTarget && onCancel()}
      >
        <section
          ref={dialogRef}
          className="admin-confirm-dialog"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          tabIndex={-1}
        >
          <button
            className="admin-dialog-close"
            type="button"
            aria-label="Fechar confirmação"
            onClick={onCancel}
          >
            <X aria-hidden="true" size={20} />
          </button>
          <h2 id={titleId}>{title}</h2>
          <p id={descriptionId}>{description}</p>
          {children}
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
              disabled={confirmDisabled}
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
          </div>
        </section>
      </div>
    </ModalPortal>
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
