import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { AdminError, AdminFrame } from "../components/AdminFrame";
import { operatorErrorMessage } from "../operator-error-message";

export default function AdminSetPasswordPage() {
  const { session, status, updatePassword } = useAdminAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status !== "loading" && !session) return <Navigate to="/admin/login" replace />;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 12) return setError("Use pelo menos 12 caracteres.");
    if (password !== confirmation) return setError("As senhas não coincidem.");
    setBusy(true);
    try {
      const result = await updatePassword(password);
      if (result.error)
        setError(
          operatorErrorMessage(result.error, {
            fallback: "Não foi possível salvar a nova senha. Tente novamente.",
          }),
        );
      else navigate("/admin", { replace: true });
    } catch (caught) {
      setError(
        operatorErrorMessage(caught, {
          fallback: "Não foi possível salvar a nova senha. Tente novamente.",
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminFrame
      title="Definir nova senha"
      description="Crie uma senha exclusiva com pelo menos 12 caracteres. Não reutilize a senha do e-mail."
    >
      <form onSubmit={submit} className="admin-form">
        <label htmlFor="admin-new-password">Nova senha</label>
        <input
          id="admin-new-password"
          type="password"
          minLength={12}
          autoComplete="new-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-describedby="admin-new-password-help"
        />
        <small id="admin-new-password-help">Use uma frase longa e exclusiva para o CMS.</small>
        <label htmlFor="admin-confirm-password">Confirmar senha</label>
        <input
          id="admin-confirm-password"
          type="password"
          minLength={12}
          autoComplete="new-password"
          required
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          aria-describedby="admin-confirm-password-help"
        />
        <small id="admin-confirm-password-help">Repita exatamente a senha informada acima.</small>
        {error && <AdminError>{error}</AdminError>}
        <button className="admin-button" type="submit" disabled={busy}>
          {busy ? "Salvando…" : "Salvar senha"}
        </button>
      </form>
    </AdminFrame>
  );
}
