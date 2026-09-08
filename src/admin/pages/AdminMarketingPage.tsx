import { useEffect, useState } from "react";
import { FilePlus2, Search } from "lucide-react";
import { Link } from "react-router";
import { supabase } from "@/lib/supabase";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { campaignWindowLabel } from "../campaign-window";
import { Badge, RecordDrawer } from "../components/AdminUI";

type CampaignRow = {
  id: string;
  slug: string;
  workflow_status: string;
  updated_at: string;
  cms_content_drafts: {
    payload: { title?: string; route?: { path?: string }; window?: { startsAt?: string; endsAt?: string } };
  } | null;
};

const campaignStatusLabels: Record<string, string> = {
  draft: "Rascunho",
  in_review: "Em revisão",
  approved: "Aprovada",
  published: "Publicada",
  archived: "Arquivada",
};

function campaignStatusLabel(status: string | undefined): string {
  return status ? (campaignStatusLabels[status] ?? "Situação indisponível") : "Situação indisponível";
}

export default function AdminMarketingPage() {
  const { profile } = useAdminAuth();
  const [items, setItems] = useState<CampaignRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<CampaignRow | null>(null);
  const canCreate = profile?.permissions.includes("cms:campaigns.edit") ?? false;

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const { data, error: loadError } = await supabase
          .from("cms_content_items")
          .select("id,slug,workflow_status,updated_at,cms_content_drafts(payload)")
          .eq("content_type", "campaign")
          .order("updated_at", { ascending: false });
        if (!active) return;
        if (loadError) setError("Não foi possível carregar as campanhas.");
        else setItems((data ?? []) as unknown as CampaignRow[]);
        setLoading(false);
      } catch {
        if (!active) return;
        setError("Não foi possível carregar as campanhas.");
        setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const normalized = query.trim().toLocaleLowerCase("pt-BR");
  const visible = items.filter((item) => {
    const payload = item.cms_content_drafts?.payload;
    return (
      !normalized ||
      [payload?.title, payload?.route?.path, item.slug].some((value) =>
        String(value ?? "")
          .toLocaleLowerCase("pt-BR")
          .includes(normalized),
      )
    );
  });

  return (
    <section>
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">MARKETING</p>
          <h1>Campanhas e páginas de campanha</h1>
          <p className="admin-help">
            Organize períodos, destaques, formulários, origem autorizada e encerramento em um só lugar.
          </p>
        </div>
        <div className="admin-heading-actions">
          <Link className="admin-button admin-button--secondary" to="/admin/marketing/formularios">
            Formulários
          </Link>
          {canCreate && (
            <Link className="admin-button" to="/admin/marketing/campanhas/novo">
              <FilePlus2 size={16} aria-hidden="true" /> Nova campanha
            </Link>
          )}
        </div>
      </div>

      <div className="admin-filters">
        <label>
          Buscar campanha
          <span className="admin-input-with-icon">
            <Search size={16} aria-hidden="true" />
            <input
              maxLength={120}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Título ou endereço público"
            />
          </span>
        </label>
      </div>

      {loading ? (
        <div className="admin-state" aria-busy="true">
          Carregando campanhas…
        </div>
      ) : error ? (
        <div className="admin-state admin-notice--error" role="alert">
          {error}
        </div>
      ) : visible.length === 0 ? (
        <div className="admin-state">
          <h2>Nenhuma campanha cadastrada</h2>
          <p>Crie a primeira campanha. Nenhum material anterior será importado automaticamente.</p>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Campanha</th>
                <th>Endereço público</th>
                <th>Período</th>
                <th>Situação</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => {
                const payload = item.cms_content_drafts?.payload;
                return (
                  <tr key={item.id}>
                    <td>
                      <strong>{payload?.title ?? "Sem título"}</strong>
                    </td>
                    <td>
                      <code>{payload?.route?.path ?? `/campanhas/${item.slug}`}</code>
                    </td>
                    <td>{campaignWindowLabel(payload?.window)}</td>
                    <td>
                      <span className="admin-status">{campaignStatusLabel(item.workflow_status)}</span>
                    </td>
                    <td>
                      <button type="button" onClick={() => setSelected(item)}>
                        Abrir
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <RecordDrawer
        open={Boolean(selected)}
        eyebrow="CAMPANHA"
        title={selected?.cms_content_drafts?.payload.title ?? "Sem título"}
        address={
          selected?.cms_content_drafts?.payload.route?.path ??
          (selected ? `/campanhas/${selected.slug}` : undefined)
        }
        status={
          <Badge tone={selected?.workflow_status === "published" ? "success" : "info"}>
            {campaignStatusLabel(selected?.workflow_status)}
          </Badge>
        }
        fields={
          selected
            ? [
                {
                  label: "Vigência",
                  value: campaignWindowLabel(selected.cms_content_drafts?.payload.window),
                },
                { label: "Atualização", value: new Date(selected.updated_at).toLocaleString("pt-BR") },
              ]
            : undefined
        }
        summary="Campanha com página pública, período de exibição e encerramento automático."
        primary={selected && <Link to={`/admin/marketing/campanhas/${selected.id}`}>Ver ficha completa</Link>}
        onClose={() => setSelected(null)}
      />
    </section>
  );
}
