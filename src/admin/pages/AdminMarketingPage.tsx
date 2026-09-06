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
    void supabase
      .from("cms_content_items")
      .select("id,slug,workflow_status,updated_at,cms_content_drafts(payload)")
      .eq("content_type", "campaign")
      .order("updated_at", { ascending: false })
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) setError("Não foi possível carregar as campanhas.");
        else setItems((data ?? []) as unknown as CampaignRow[]);
        setLoading(false);
      });
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
          <p className="admin-eyebrow">MARKETING GOVERNADO</p>
          <h1>Campanhas e landing pages</h1>
          <p className="admin-help">
            Períodos, destaques, formulários, tracking consentido e expiração em uma única fonte.
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
              placeholder="Título ou URL"
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
          <p>Crie a primeira campanha no CMS novo. Nenhum material anterior será importado.</p>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Campanha</th>
                <th>URL</th>
                <th>Período</th>
                <th>Status</th>
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
                      <span className="admin-status">{item.workflow_status}</span>
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
            {selected?.workflow_status.replaceAll("_", " ")}
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
        summary="Campanha governada com landing page, vigência e expiração automática."
        primary={selected && <Link to={`/admin/marketing/campanhas/${selected.id}`}>Ver ficha completa</Link>}
        onClose={() => setSelected(null)}
      />
    </section>
  );
}
