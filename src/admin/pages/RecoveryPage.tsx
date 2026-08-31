import { useState } from "react";
import { Link } from "react-router";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { AdminError, AdminFrame, AdminSuccess } from "../components/AdminFrame";

export default function AdminRecoveryPage() {
  const { requestRecovery } = useAdminAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const result = await requestRecovery(email);
    setBusy(false);
    if (result.error) setError(result.error);
    else setSent(true);
  }

  return (
    <AdminFrame
      title="Recuperar acesso"
      description="Solicite um link seguro. A resposta não confirma se a conta existe."
    >
      <form onSubmit={submit} className="admin-form">
        <label htmlFor="admin-recovery-email">E-mail corporativo</label>
        <input
          id="admin-recovery-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-describedby="admin-recovery-help"
        />
        <small id="admin-recovery-help">
          O link é enviado somente para convites administrativos válidos.
        </small>
        {error && <AdminError>{error}</AdminError>}
        {sent && <AdminSuccess>Solicitação recebida. Verifique a caixa de entrada e o spam.</AdminSuccess>}
        <button className="admin-button" type="submit" disabled={busy || sent}>
          {busy ? "Enviando…" : sent ? "Link solicitado" : "Solicitar link"}
        </button>
      </form>
      <Link className="admin-link" to="/admin/login">
        Voltar ao login
      </Link>
    </AdminFrame>
  );
}
