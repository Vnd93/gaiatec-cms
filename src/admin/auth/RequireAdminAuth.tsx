import { Navigate, useLocation } from "react-router";
import { useAdminAuth } from "./AdminAuthContext";
import { AdminFrame } from "../components/AdminFrame";

export function RequireAdminAuth({ children }: { children: React.ReactNode }) {
  const { status, signOut } = useAdminAuth();
  const location = useLocation();

  if (status === "loading")
    return (
      <AdminFrame
        title="Validando acesso"
        description="Confirmando sessão, MFA e permissões efetivas."
        loading
      />
    );
  if (status === "signed_out")
    return (
      <Navigate to="/admin/login" replace state={{ from: location.pathname, reason: "session_required" }} />
    );
  if (status === "password_update") return <Navigate to="/admin/definir-senha" replace />;
  if (status === "mfa_enroll" || status === "mfa_challenge") return <Navigate to="/admin/mfa" replace />;
  if (status === "unauthorized") {
    return (
      <AdminFrame
        title="Acesso administrativo não autorizado"
        description="Sua sessão está ativa, mas não possui permissão válida para o CMS."
      >
        <p>
          Esta identidade não possui um convite ativo para o CMS. O acesso ao RDO não concede acesso
          administrativo.
        </p>
        <button className="admin-button admin-button--secondary" onClick={() => void signOut()}>
          Sair com segurança
        </button>
      </AdminFrame>
    );
  }
  return <>{children}</>;
}
