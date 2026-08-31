import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Badge, DataTable, EmptyState, ErrorState, LoadingSkeleton, PageHeader } from "../components/AdminUI";
type Profile = {
  user_id: string;
  display_name: string;
  display_email: string | null;
  status: string;
  last_seen_at: string | null;
};
export default function AdminUsersPage() {
  const [items, setItems] = useState<Profile[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void supabase
      .from("cms_profiles")
      .select("user_id,display_name,display_email,status,last_seen_at")
      .order("display_name")
      .then(({ data, error: resultError }) => {
        if (!active) return;
        if (resultError) setError("Usuários indisponíveis ou sem permissão.");
        else setItems((data ?? []) as Profile[]);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section>
      <PageHeader
        eyebrow="IDENTIDADES E SESSÕES"
        title="Usuários e acessos"
        description="Consulte identidades convidadas, estado da conta e último acesso conhecido."
      />
      {loading ? (
        <LoadingSkeleton label="Carregando usuários" rows={4} />
      ) : error ? (
        <ErrorState title="Usuários indisponíveis" description={error} />
      ) : items.length === 0 ? (
        <EmptyState
          title="Nenhum usuário administrativo"
          description="O cadastro permanece fechado e depende de convite autorizado."
        />
      ) : (
        <DataTable caption={`${items.length} usuários administrativos`}>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Status</th>
              <th>Último acesso</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.user_id}>
                <td>
                  {item.display_name}
                  <small>{item.display_email}</small>
                </td>
                <td>
                  <Badge
                    tone={
                      item.status === "active"
                        ? "success"
                        : item.status === "suspended"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {item.status}
                  </Badge>
                </td>
                <td>{item.last_seen_at ? new Date(item.last_seen_at).toLocaleString("pt-BR") : "Nunca"}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </section>
  );
}
