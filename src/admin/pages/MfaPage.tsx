import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { AdminError, AdminFrame } from "../components/AdminFrame";

type Enrollment = { factorId: string; qrCode: string; secret: string };

export default function AdminMfaPage() {
  const { session, status, beginMfaEnrollment, verifyMfa, signOut } = useAdminAuth();
  const navigate = useNavigate();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === "ready") navigate("/admin", { replace: true });
  }, [navigate, status]);

  if (status !== "loading" && !session) return <Navigate to="/admin/login" replace />;
  const enrolling = status === "mfa_enroll";

  async function startEnrollment() {
    setBusy(true);
    setError(null);
    const result = await beginMfaEnrollment();
    setBusy(false);
    if (result.error) setError(result.error);
    else setEnrollment(result.enrollment);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (code.replace(/\D/g, "").length !== 6)
      return setError("Digite os 6 números do aplicativo autenticador.");
    setBusy(true);
    setError(null);
    const result = await verifyMfa(code, enrollment?.factorId);
    setBusy(false);
    if (result.error) setError(result.error);
  }

  if (status === "loading") return <AdminFrame title="Validando segundo fator" loading />;

  return (
    <AdminFrame title={enrolling ? "Ativar verificação em duas etapas" : "Confirmar segundo fator"}>
      {enrolling && !enrollment && (
        <>
          <p>
            Este perfil exige MFA. Use um aplicativo autenticador, como Microsoft Authenticator, Google
            Authenticator ou 1Password.
          </p>
          <button className="admin-button" onClick={() => void startEnrollment()} disabled={busy}>
            {busy ? "Preparando…" : "Configurar autenticador"}
          </button>
        </>
      )}
      {enrollment && (
        <div className="admin-mfa-setup">
          <img src={enrollment.qrCode} alt="QR Code para configurar o autenticador" />
          <p>Se não puder ler o QR Code, informe manualmente esta chave:</p>
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
          />
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
