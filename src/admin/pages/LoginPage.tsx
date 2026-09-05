import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { AdminError, AdminFrame } from "../components/AdminFrame";
import { AdminAlert } from "../components/AdminUI";

export default function AdminLoginPage() {
  const { status, signIn } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === "ready") navigate("/admin", { replace: true });
    if (status === "mfa_enroll" || status === "mfa_challenge") navigate("/admin/mfa", { replace: true });
  }, [navigate, status]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const result = await signIn(email, password);
    setBusy(false);
    if (result.error) setError(result.error);
  }

  return (
    <AdminFrame
      title="Entrar no painel"
      description="Acesso exclusivo para operadores previamente convidados. O RDO usa permissões separadas."
    >
      {(location.state as { reason?: string } | null)?.reason === "session_required" && (
        <AdminAlert title="Entre para continuar">
          Sua sessão não está ativa. Entre novamente para acessar a área solicitada.
        </AdminAlert>
      )}
      <form onSubmit={submit} className="admin-form">
        <label htmlFor="admin-email">E-mail corporativo</label>
        <input
          id="admin-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-describedby="admin-login-email-help"
        />
        <small id="admin-login-email-help">Use o e-mail associado ao convite do CMS.</small>
        <label htmlFor="admin-password">Senha</label>
        <input
          id="admin-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-describedby="admin-login-password-help"
        />
        <small id="admin-login-password-help">Sua senha não é exibida nem registrada pelo painel.</small>
        {error && <AdminError>{error}</AdminError>}
        <button className="admin-button" type="submit" disabled={busy}>
          {busy ? "Validando…" : "Entrar"}
        </button>
      </form>
      <Link className="admin-link" to="/admin/recuperar-senha">
        Esqueci minha senha
      </Link>
    </AdminFrame>
  );
}
