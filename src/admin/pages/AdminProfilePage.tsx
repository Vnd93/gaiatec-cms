import { useAdminAuth } from "../auth/AdminAuthContext";

export default function AdminProfilePage() {
  const { session, user, profile, signOut } = useAdminAuth();
  const expiresAt = session?.expires_at ? new Date(session.expires_at * 1000) : null;
  return (
    <section>
      <p className="admin-eyebrow">IDENTIDADE ATIVA</p>
      <h1>Perfil e sessão</h1>
      <div className="admin-profile-grid">
        <article>
          <h2>Perfil</h2>
          <dl>
            <dt>E-mail</dt>
            <dd>{user?.email ?? "Indisponível"}</dd>
            <dt>Status</dt>
            <dd>{profile?.status ?? "Indisponível"}</dd>
            <dt>Papéis</dt>
            <dd>{profile?.roles.join(", ") || "Nenhum"}</dd>
            <dt>MFA</dt>
            <dd>
              {profile?.mfaVerified ? "Verificado" : profile?.mfaRequired ? "Obrigatório" : "Não exigido"}
            </dd>
          </dl>
        </article>
        <article>
          <h2>Sessão atual</h2>
          <dl>
            <dt>Expiração</dt>
            <dd>{expiresAt ? expiresAt.toLocaleString("pt-BR") : "Indisponível"}</dd>
            <dt>Escopo administrativo</dt>
            <dd>{profile?.accessGranted ? "Concedido pelo servidor" : "Negado"}</dd>
          </dl>
          <button className="admin-button admin-button--secondary" onClick={() => void signOut()}>
            Encerrar esta sessão
          </button>
        </article>
      </div>
      <div className="admin-actions">
        <h2>Permissões efetivas</h2>
        <p>{profile?.permissions.join(", ") || "Nenhuma permissão efetiva."}</p>
      </div>
    </section>
  );
}
