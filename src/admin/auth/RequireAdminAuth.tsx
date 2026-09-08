import { Navigate, useLocation } from "react-router";
import { useAdminAuth } from "./AdminAuthContext";
import { AdminFrame } from "../components/AdminFrame";

export function RequireAdminAuth({ children }: { children: React.ReactNode }) {
  const { status, retryAccess, signOut, user } = useAdminAuth();
  const location = useLocation();

  if (status === "loading")
    return (
      <AdminFrame
        title="Validando acesso"
        description="Confirmando sessão, verificação em duas etapas e permissões desta conta."
        loading
      />
    );
  if (status === "signed_out")
    return (
      <Navigate
        to="/admin/login"
        replace
        state={{
          from: `${location.pathname}${location.search}${location.hash}`,
          reason: "session_required",
        }}
      />
    );
  if (status === "password_update") return <Navigate to="/admin/definir-senha" replace />;
  if (status === "mfa_enroll" || status === "mfa_challenge")
    return (
      <Navigate
        to="/admin/mfa"
        replace
        state={{ from: `${location.pathname}${location.search}${location.hash}` }}
      />
    );
  if (status === "temporarily_unavailable") {
    return (
      <AdminFrame
        title="Validação de acesso temporariamente indisponível"
        description="Sua sessão não foi classificada como inválida. O serviço de autorização não respondeu e pode ser consultado novamente."
      >
        <button className="admin-button admin-button--primary" onClick={() => void retryAccess()}>
          Tentar novamente
        </button>
      </AdminFrame>
    );
  }
  if (status === "unauthorized") {
    return (
      <AdminFrame
        title="Acesso administrativo não autorizado"
        description="Sua sessão está ativa, mas não possui permissão válida para o CMS."
      >
        <p>
          Esta conta não possui um convite ativo para o CMS. O acesso ao RDO não concede acesso
          administrativo.
        </p>
        {user?.email && (
          <p>
            Conta autenticada: <strong>{user.email}</strong>
          </p>
        )}
        <button className="admin-button admin-button--primary" onClick={() => void retryAccess()}>
          Verificar acesso novamente
        </button>
        <button className="admin-button admin-button--secondary" onClick={() => void signOut()}>
          Sair com segurança
        </button>
      </AdminFrame>
    );
  }
  return <>{children}</>;
}
