import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
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
      <p className="admin-eyebrow">IDENTIDADES E SESSÕES</p>
      <h1>Usuários administrativos</h1>
      {loading ? (
        <div className="admin-state" aria-busy="true">
          Carregando usuários…
        </div>
      ) : error ? (
        <p className="admin-notice admin-notice--error" role="alert">
          {error}
        </p>
      ) : items.length === 0 ? (
        <div className="admin-state">
          <h2>Nenhum usuário administrativo</h2>
          <p>O cadastro permanece fechado por convite.</p>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table>
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
                  <td>{item.status}</td>
                  <td>{item.last_seen_at ? new Date(item.last_seen_at).toLocaleString("pt-BR") : "Nunca"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
