import { useEffect, useState } from "react";
import { FilePlus2, Home, Search } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { supabase } from "@/lib/supabase";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { isEv2FeatureEnabled } from "../ev2-runtime";
import { PagesModuleTabs } from "../components/AdminModuleTabs";
import { Badge, RecordDrawer } from "../components/AdminUI";
import {
  MANAGED_PAGE_TEMPLATES,
  PAGE_BLOCK_LABELS,
  PAGE_BUILDER_BLOCK_TYPES,
  pageBlockReferenceRequirement,
} from "../page-builder-model";

type PageRow = {
  id: string;
  slug: string;
  content_type: "page" | "homepage";
  workflow_status: string;
  updated_at: string;
  cms_content_drafts: {
    payload: {
      title?: string;
      summary?: string;
      route?: { path?: string };
      pageKind?: string;
      blocks?: Array<{ type?: string }>;
    };
  } | null;
};

const pageStatusLabels: Record<string, string> = {
  new: "Nova",
  draft: "Rascunho",
  in_review: "Em revisão",
  approved: "Aprovada",
  scheduled: "Agendada",
  published: "Publicada",
  archived: "Arquivada",
  trashed: "Na lixeira",
};

const pageKindLabels: Record<string, string> = {
  institutional: "Institucional",
  thematic: "Temática",
  landing: "Página de campanha",
  campaign: "Campanha",
  home: "Página inicial",
};

function pageStatusLabel(status: string | undefined): string {
  return status ? (pageStatusLabels[status] ?? "Situação indisponível") : "Situação indisponível";
}

function pageKindLabel(pageKind: string | undefined): string {
  return pageKind ? (pageKindLabels[pageKind] ?? "Página") : "Página";
}

export default function AdminPagesPage() {
  const { profile } = useAdminAuth();
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const activeTab = requestedTab === "modelos" || requestedTab === "blocos" ? requestedTab : "paginas";
  const [items, setItems] = useState<PageRow[]>([]);
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<PageRow | null>(null);
  const canCreatePage = profile?.permissions.includes("cms:pages.edit") ?? false;
  const canCreateHome = profile?.permissions.includes("cms:homepage.edit") ?? false;
  const canUseVisualStudio =
    isEv2FeatureEnabled(profile, "ev2.visual_studio") &&
    (profile?.permissions.includes("cms:visual.read") ?? false);

  useEffect(() => {
    setQuery(searchParams.get("q") ?? "");
  }, [searchParams]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    let request = supabase
      .from("cms_content_items")
      .select("id,slug,content_type,workflow_status,updated_at,cms_content_drafts(payload)")
      .in("content_type", ["page", "homepage"])
      .order("updated_at", { ascending: false });
    if (status !== "all") request = request.eq("workflow_status", status);
    void request.then(({ data, error: loadError }) => {
      if (!active) return;
      if (loadError) setError("Não foi possível carregar as páginas administradas.");
      else setItems((data ?? []) as unknown as PageRow[]);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [status]);

  const normalized = query.trim().toLocaleLowerCase("pt-BR");
  const visible = items.filter((item) => {
    if (!normalized) return true;
    const payload = item.cms_content_drafts?.payload;
    return [payload?.title, payload?.route?.path, item.slug]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(normalized));
  });
  const blockUsage = Object.fromEntries(
    PAGE_BUILDER_BLOCK_TYPES.map((type) => [
      type,
      items.filter((item) => item.cms_content_drafts?.payload.blocks?.some((block) => block.type === type))
        .length,
    ]),
  ) as Record<(typeof PAGE_BUILDER_BLOCK_TYPES)[number], number>;

  return (
    <section>
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">ESTRUTURA DO SITE</p>
          <h1>Páginas e página inicial</h1>
          <p className="admin-help">
            Crie e altere páginas por blocos, com visualização, revisão e publicação.
          </p>
        </div>
        <div className="admin-heading-actions">
          {canCreateHome &&
            !items.some((item) => item.content_type === "homepage" && item.workflow_status !== "trashed") && (
              <Link className="admin-button admin-button--secondary" to="/admin/paginas/novo?type=homepage">
                <Home size={16} aria-hidden="true" /> Criar página inicial
              </Link>
            )}
          {canCreatePage && (
            <Link className="admin-button" to="/admin/paginas/novo?type=page">
              <FilePlus2 size={16} aria-hidden="true" /> Nova página
            </Link>
          )}
        </div>
      </div>
      <PagesModuleTabs />
      {activeTab === "modelos" ? (
        <div className="admin-template-grid">
          {MANAGED_PAGE_TEMPLATES.map((template) => (
            <article className="admin-section-card" key={template.key}>
              <h2>{template.name}</h2>
              <p>{template.blockTypes.length} blocos · estrutura aprovada</p>
              {canCreatePage ? (
                <Link className="admin-button" to={`/admin/paginas/novo?type=page&template=${template.key}`}>
                  Usar modelo
                </Link>
              ) : (
                <p className="admin-help">Somente leitura · requer permissão para editar páginas.</p>
              )}
            </article>
          ))}
        </div>
      ) : activeTab === "blocos" ? (
        loading ? (
          <div className="admin-state" aria-busy="true">
            Carregando biblioteca de blocos…
          </div>
        ) : error ? (
          <div className="admin-state admin-notice--error" role="alert">
            {error}
          </div>
        ) : (
          <div className="admin-template-grid">
            {PAGE_BUILDER_BLOCK_TYPES.map((type) => {
              const usage = blockUsage[type];
              const referenceRequirement = pageBlockReferenceRequirement(type);
              return (
                <article className="admin-section-card" key={type}>
                  <h2>{PAGE_BLOCK_LABELS[type]}</h2>
                  <p>
                    Usado em {usage} {usage === 1 ? "página" : "páginas"}
                  </p>
                  {!canCreatePage ? (
                    <p className="admin-help">Somente leitura · requer permissão para editar páginas.</p>
                  ) : referenceRequirement ? (
                    <p className="admin-help">
                      Disponível no editor após selecionar{" "}
                      {referenceRequirement === "media"
                        ? "uma mídia"
                        : referenceRequirement === "form"
                          ? "um formulário publicado"
                          : "um conteúdo relacionado"}
                      .
                    </p>
                  ) : (
                    <Link to={`/admin/paginas/novo?type=page&block=${type}`}>Usar em nova página</Link>
                  )}
                </article>
              );
            })}
            <p className="admin-help">
              A biblioteca mostra os blocos disponíveis no editor e quantas páginas em edição usam cada um.
            </p>
          </div>
        )
      ) : (
        <>
          <div className="admin-filters">
            <label>
              Buscar página
              <span className="admin-input-with-icon">
                <Search size={16} aria-hidden="true" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Título ou endereço público"
                />
              </span>
            </label>
            <label>
              Situação
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="all">Todos</option>
                <option value="draft">Rascunho</option>
                <option value="in_review">Em revisão</option>
                <option value="approved">Aprovado</option>
                <option value="scheduled">Agendado</option>
                <option value="published">Publicado</option>
                <option value="archived">Arquivado</option>
                <option value="trashed">Lixeira</option>
              </select>
            </label>
          </div>

          {loading ? (
            <div className="admin-state" aria-busy="true">
              Carregando páginas…
            </div>
          ) : error ? (
            <div className="admin-state admin-notice--error" role="alert">
              {error}
            </div>
          ) : visible.length === 0 ? (
            <div className="admin-state">
              <h2>Nenhuma página encontrada</h2>
              <p>Crie a primeira página no editor. Nenhum conteúdo antigo será importado.</p>
            </div>
          ) : (
            <div className="admin-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Página</th>
                    <th>Endereço</th>
                    <th>Tipo</th>
                    <th>Situação</th>
                    <th>Atualização</th>
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
                          <code>{payload?.route?.path ?? `/${item.slug}`}</code>
                        </td>
                        <td>
                          {item.content_type === "homepage"
                            ? "Página inicial"
                            : pageKindLabel(payload?.pageKind)}
                        </td>
                        <td>
                          <span className="admin-status">{pageStatusLabel(item.workflow_status)}</span>
                        </td>
                        <td>{new Date(item.updated_at).toLocaleString("pt-BR")}</td>
                        <td>
                          <button type="button" onClick={() => setSelected(item)}>
                            Abrir
                          </button>
                          {canUseVisualStudio && (
                            <>
                              {" · "}
                              <Link to={`/admin/estudio-visual/${item.id}`}>Estúdio Visual</Link>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <RecordDrawer
        open={Boolean(selected)}
        eyebrow="PÁGINA"
        title={selected?.cms_content_drafts?.payload.title ?? "Sem título"}
        address={
          selected?.cms_content_drafts?.payload.route?.path ?? (selected ? `/${selected.slug}` : undefined)
        }
        status={
          <Badge tone={selected?.workflow_status === "published" ? "success" : "info"}>
            {pageStatusLabel(selected?.workflow_status)}
          </Badge>
        }
        fields={
          selected
            ? [
                {
                  label: "Blocos",
                  value: `${selected.cms_content_drafts?.payload.blocks?.length ?? 0} blocos`,
                },
                { label: "Atualização", value: new Date(selected.updated_at).toLocaleString("pt-BR") },
              ]
            : undefined
        }
        summary={selected?.cms_content_drafts?.payload.summary ?? "Página montada por blocos governados."}
        primary={selected && <Link to={`/admin/paginas/${selected.id}`}>Abrir editor completo</Link>}
        onClose={() => setSelected(null)}
      />
    </section>
  );
}
