import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { safeAdminDestination } from "../auth/admin-auth-route";
import { AdminError, AdminFrame } from "../components/AdminFrame";
import { operatorErrorMessage } from "../operator-error-message";

type Enrollment = { factorId: string; qrCode: string; secret: string };

export default function AdminMfaPage() {
  const { session, status, beginMfaEnrollment, verifyMfa, retryAccess, signOut } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigationState = location.state as { from?: unknown; purpose?: unknown } | null;
  const passwordUpdate = navigationState?.purpose === "password_update";
  const destination = passwordUpdate ? "/admin/definir-senha" : safeAdminDestination(navigationState?.from);

  useEffect(() => {
    if (status === "ready") navigate(destination, { replace: true });
    if (status === "unauthorized") navigate(passwordUpdate ? "/admin" : destination, { replace: true });
    if (status === "temporarily_unavailable" && !passwordUpdate) navigate(destination, { replace: true });
  }, [destination, navigate, passwordUpdate, status]);

  if (status !== "loading" && !session) return <Navigate to="/admin/login" replace />;
  const enrolling = status === "mfa_enroll";

  async function startEnrollment() {
    setBusy(true);
    setError(null);
    try {
      const result = await beginMfaEnrollment();
      if (result.error)
        setError(
          operatorErrorMessage(result.error, {
            fallback: "Não foi possível preparar a verificação em duas etapas.",
          }),
        );
      else setEnrollment(result.enrollment);
    } catch (caught) {
      setError(
        operatorErrorMessage(caught, {
          fallback: "Não foi possível preparar a verificação em duas etapas.",
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (code.replace(/\D/g, "").length !== 6)
      return setError("Digite os 6 números do aplicativo autenticador.");
    setBusy(true);
    setError(null);
    try {
      const result = await verifyMfa(code, enrollment?.factorId);
      if (result.error)
        setError(
          operatorErrorMessage(result.error, { fallback: "Não foi possível confirmar sua identidade." }),
        );
    } catch (caught) {
      setError(operatorErrorMessage(caught, { fallback: "Não foi possível confirmar sua identidade." }));
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading")
    return (
      <AdminFrame title="Validando sua identidade" description="Confirmando a segurança da sessão." loading />
    );

  if (status === "temporarily_unavailable" && passwordUpdate)
    return (
      <AdminFrame
        title="Validação da recuperação temporariamente indisponível"
        description="Sua sessão segura foi preservada. Tente validar o acesso novamente para continuar a troca de senha."
      >
        <button className="admin-button admin-button--primary" onClick={() => void retryAccess()}>
          Tentar novamente
        </button>
        <button className="admin-button admin-button--secondary" onClick={() => void signOut()}>
          Cancelar e sair
        </button>
      </AdminFrame>
    );

  return (
    <AdminFrame
      title={enrolling ? "Ativar verificação em duas etapas" : "Confirmar sua identidade"}
      description={
        enrolling
          ? "Vincule um aplicativo autenticador para proteger ações críticas."
          : "Digite o código atual do seu aplicativo autenticador."
      }
    >
      {enrolling && !enrollment && (
        <>
          <p>
            Esta conta exige verificação em duas etapas. Use um aplicativo autenticador, como Microsoft
            Authenticator, Google Authenticator ou 1Password.
          </p>
          <button className="admin-button" onClick={() => void startEnrollment()} disabled={busy}>
            {busy ? "Preparando…" : "Configurar autenticador"}
          </button>
        </>
      )}
      {enrollment && (
        <div className="admin-mfa-setup">
          <img src={enrollment.qrCode} alt="Imagem para configurar o aplicativo autenticador" />
          <p>Se não puder ler a imagem, informe manualmente esta chave no aplicativo:</p>
          <code>{enrollment.secret}</code>
        </div>
      )}
      {(!enrolling || enrollment) && (
        <form onSubmit={submit} className="admin-form">
          <label htmlFor="admin-mfa-code">Código de 6 dígitos</label>
          <input
            id="admin-mfa-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            aria-describedby="admin-mfa-code-help"
          />
          <small id="admin-mfa-code-help">O código muda periodicamente e não deve ser compartilhado.</small>
          {error && <AdminError>{error}</AdminError>}
          <button className="admin-button" type="submit" disabled={busy || code.length !== 6}>
            {busy ? "Verificando…" : "Verificar e entrar"}
          </button>
        </form>
      )}
      <button className="admin-link admin-link--button" onClick={() => void signOut()}>
        Cancelar e sair
      </button>
    </AdminFrame>
  );
}
