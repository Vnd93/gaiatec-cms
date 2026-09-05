import "../admin.css";
import "../admin-f11.css";
import { AdminAlert, LoadingSkeleton } from "./AdminUI";

export function AdminFrame({
  title,
  eyebrow = "CMS GAIATEC",
  description,
  loading = false,
  children,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  loading?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <main className="admin-auth-root" data-admin-surface>
      <section
        className="admin-auth-card"
        aria-busy={loading || undefined}
        aria-labelledby="admin-auth-title"
      >
        <header className="admin-auth-card__header">
          <img src="/logo-gaiatec.png" alt="Gaiatec Sistemas" className="admin-logo" />
          <div>
            <p className="admin-eyebrow">{eyebrow}</p>
            <h1 id="admin-auth-title">{title}</h1>
            {description && <p>{description}</p>}
          </div>
        </header>
        {loading ? (
          <LoadingSkeleton label={title} rows={2} />
        ) : (
          <div className="admin-content">{children}</div>
        )}
        <footer className="admin-auth-card__footer">
          Acesso privado · Sessão protegida por permissão e MFA quando exigido
        </footer>
      </section>
    </main>
  );
}

export function AdminError({ children }: { children: React.ReactNode }) {
  return <AdminAlert tone="danger">{children}</AdminAlert>;
}

export function AdminSuccess({ children }: { children: React.ReactNode }) {
  return <AdminAlert tone="success">{children}</AdminAlert>;
}
