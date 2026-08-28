import "../admin.css";

export function AdminFrame({
  title,
  eyebrow = "CMS GAIATEC",
  loading = false,
  children,
}: {
  title: string;
  eyebrow?: string;
  loading?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <main className="admin-auth-root" data-admin-surface>
      <section className="admin-auth-card" aria-busy={loading || undefined}>
        <img src="/logo-gaiatec.png" alt="Gaiatec Sistemas" className="admin-logo" />
        <p className="admin-eyebrow">{eyebrow}</p>
        <div className="admin-rule" />
        <h1>{title}</h1>
        {loading ? (
          <span className="admin-spinner" aria-label="Carregando" />
        ) : (
          <div className="admin-content">{children}</div>
        )}
      </section>
    </main>
  );
}

export function AdminError({ children }: { children: React.ReactNode }) {
  return (
    <p className="admin-notice admin-notice--error" role="alert">
      {children}
    </p>
  );
}

export function AdminSuccess({ children }: { children: React.ReactNode }) {
  return (
    <p className="admin-notice admin-notice--success" role="status">
      {children}
    </p>
  );
}
