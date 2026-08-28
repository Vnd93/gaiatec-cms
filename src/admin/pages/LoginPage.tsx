import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { AdminError, AdminFrame } from "../components/AdminFrame";

export default function AdminLoginPage() {
  const { status, signIn } = useAdminAuth();
  const navigate = useNavigate();
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
    <AdminFrame title="Entrar no painel">
      <p>Acesso exclusivo para pessoas previamente convidadas.</p>
      <form onSubmit={submit} className="admin-form">
        <label htmlFor="admin-email">E-mail corporativo</label>
        <input
          id="admin-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <label htmlFor="admin-password">Senha</label>
        <input
          id="admin-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
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
