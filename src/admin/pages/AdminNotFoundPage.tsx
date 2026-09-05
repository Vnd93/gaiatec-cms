import { Link } from "react-router";
import { PageHeader, StatePanel } from "../components/AdminUI";

export default function AdminNotFoundPage() {
  return (
    <section>
      <PageHeader
        eyebrow="ROTA ADMINISTRATIVA"
        title="Página não encontrada"
        description="O endereço não corresponde a uma área disponível para esta versão do CMS."
      />
      <StatePanel
        kind="unavailable"
        title="Verifique o endereço"
        description="Use o menu para preservar seu contexto e abrir uma área disponível."
        action={
          <Link className="admin-button" to="/admin">
            Voltar à visão geral
          </Link>
        }
      />
    </section>
  );
}
