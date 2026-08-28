import { useAdminAuth } from "../auth/AdminAuthContext";
import "../admin.css";

export default function AdminHomePage() {
  const { user, profile, signOut } = useAdminAuth();
  return (
    <main className="admin-shell" data-admin-surface>
      <header className="admin-shell__header">
        <img src="/logo-gaiatec.png" alt="Gaiatec Sistemas" />
        <button className="admin-button admin-button--secondary" onClick={() => void signOut()}>
          Sair
        </button>
      </header>
      <section className="admin-shell__content">
        <p className="admin-eyebrow">CMS GAIATEC</p>
        <h1>Acesso administrativo protegido</h1>
        <p>
          A autenticação, a recuperação de senha e a validação de MFA estão operacionais. Os módulos
          editoriais serão liberados em pacotes separados após seus contratos de dados e permissões.
        </p>
        <dl className="admin-session-summary">
          <div>
            <dt>Identidade</dt>
            <dd>{user?.email ?? "—"}</dd>
          </div>
          <div>
            <dt>Papéis</dt>
            <dd>{profile?.roles.join(", ") || "—"}</dd>
          </div>
          <div>
            <dt>MFA</dt>
            <dd>{profile?.mfaVerified ? "Verificado" : "Não obrigatório"}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
