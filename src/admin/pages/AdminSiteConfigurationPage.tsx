import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  CmsNavigationContentSchema,
  CmsPlacementContentSchema,
  CmsSiteSettingsContentSchema,
  type CmsNavigationContent,
  type CmsPlacementContent,
  type CmsSiteSettingsContent,
} from "@/shared/contracts/cms-content";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { editorialCommand, issuePreview } from "../api/cms-api";
import {
  createSiteDocument,
  siteDocumentMeta,
  type SiteDocumentPayload,
  type SiteDocumentType,
} from "../site-document-model";

type Loaded = {
  id: string;
  slug: string;
  content_type: SiteDocumentType;
  workflow_status: string;
  cms_content_drafts: { payload: Record<string, unknown>; lock_version: number };
  cms_content_revisions: { id: string; revision_number: number; reason: string; created_at: string }[];
};
type Relation = { id: string; content_type: string; slug: string; label: string };

const schemas = {
  navigation: CmsNavigationContentSchema,
  site_settings: CmsSiteSettingsContentSchema,
  placement: CmsPlacementContentSchema,
};

export default function AdminSiteConfigurationPage() {
  const { session, profile } = useAdminAuth();
  const [activeType, setActiveType] = useState<SiteDocumentType>("navigation");
  const [loadedByType, setLoadedByType] = useState<Partial<Record<SiteDocumentType, Loaded>>>({});
  const [payload, setPayload] = useState<SiteDocumentPayload>(() => createSiteDocument("navigation"));
  const [relations, setRelations] = useState<Relation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reason, setReason] = useState("Atualização da estrutura global do site");
  const [publishAt, setPublishAt] = useState("");
  const meta = siteDocumentMeta[activeType];
  const loaded = loadedByType[activeType];
  const state = loaded?.workflow_status ?? "new";
  const can = (action: "read" | "edit" | "approve" | "publish") =>
    profile?.permissions.includes(`${meta.permission}.${action}`) ?? false;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [documents, related] = await Promise.all([
      supabase
        .from("cms_content_items")
        .select(
          "id,slug,content_type,workflow_status,cms_content_drafts(payload,lock_version),cms_content_revisions(id,revision_number,reason,created_at)",
        )
        .in("content_type", ["navigation", "site_settings", "placement"]),
      supabase
        .from("cms_published_projection")
        .select("item_id,content_type,slug,payload")
        .in("content_type", ["product", "service", "industry", "application", "solution", "page"])
        .order("published_at", { ascending: false }),
    ]);
    if (documents.error) setError("Não foi possível carregar as configurações globais.");
    else {
      const map: Partial<Record<SiteDocumentType, Loaded>> = {};
      for (const row of documents.data ?? [])
        map[row.content_type as SiteDocumentType] = row as unknown as Loaded;
      setLoadedByType(map);
      const current = map[activeType];
      if (current) {
        const parsed = schemas[activeType].safeParse(current.cms_content_drafts.payload);
        if (parsed.success) setPayload(parsed.data as SiteDocumentPayload);
        else setError(`Documento incompatível: ${parsed.error.issues[0]?.path.join(".")}.`);
      } else setPayload(createSiteDocument(activeType));
    }
    setRelations(
      (related.data ?? []).map((row: any) => ({
        id: row.item_id,
        content_type: row.content_type,
        slug: row.slug,
        label: row.payload?.title ?? row.slug,
      })),
    );
    setLoading(false);
  }, [activeType]);

  useEffect(() => {
    void load();
  }, [load]);

  const validation = useMemo(() => schemas[activeType].safeParse(payload), [activeType, payload]);
  const latestRevision = loaded?.cms_content_revisions
    .slice()
    .sort((a, b) => b.revision_number - a.revision_number)[0];

  async function run(action: string, extras: Record<string, unknown> = {}) {
    if (!session) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      if ((action === "create" || action === "save") && !validation.success) {
        const issue = validation.error.issues[0];
        throw new Error(`Documento incompleto: ${issue.path.join(".")} — ${issue.message}`);
      }
      if (action === "save" && state === "published" && loaded) {
        await editorialCommand(session, {
          action: "reopen",
          itemId: loaded.id,
          contentType: null,
          slug: null,
          payload: null,
          expectedLockVersion: null,
          reason: `Abrir nova versão: ${reason}`,
        });
      }
      const result = await editorialCommand(session, {
        action,
        itemId: loaded?.id ?? null,
        contentType: loaded ? null : activeType,
        slug: meta.slug,
        payload: action === "create" || action === "save" ? payload : null,
        expectedLockVersion: loaded?.cms_content_drafts.lock_version ?? null,
        reason,
        ...extras,
      });
      setSuccess(`Operação ${result.status} concluída. Código ${result.correlationId.slice(0, 8)}.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Operação não concluída.");
    } finally {
      setBusy(false);
    }
  }

  async function preview(revisionId?: string) {
    if (!session || !loaded) return;
    try {
      const result = await issuePreview(session, loaded.id, revisionId);
      window.location.assign(result.path);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Preview indisponível.");
    }
  }

  if (loading)
    return (
      <div className="admin-state" aria-busy="true">
        Carregando administração do site…
      </div>
    );

  return (
    <section>
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">ADMINISTRAÇÃO GLOBAL</p>
          <h1>Estrutura do site</h1>
          <p className="admin-help">
            Menus, dados globais e destaques usam o mesmo workflow versionado das páginas.
          </p>
        </div>
      </div>

      <div className="admin-tabs" role="tablist" aria-label="Documentos globais">
        {(Object.keys(siteDocumentMeta) as SiteDocumentType[]).map((type) => (
          <button
            key={type}
            role="tab"
            type="button"
            aria-selected={activeType === type}
            onClick={() => setActiveType(type)}
          >
            {siteDocumentMeta[type].label}
            <small>{loadedByType[type]?.workflow_status ?? "não criado"}</small>
          </button>
        ))}
      </div>

      {error && (
        <p className="admin-notice admin-notice--error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="admin-notice admin-notice--success" role="status">
          {success}
        </p>
      )}

      <form
        className="admin-site-document"
        onSubmit={(event) => {
          event.preventDefault();
          void run(loaded ? "save" : "create");
        }}
      >
        {activeType === "navigation" && payload.contentType === "navigation" && (
          <NavigationEditor payload={payload} onChange={(next) => setPayload(next)} />
        )}
        {activeType === "site_settings" && payload.contentType === "site_settings" && (
          <SettingsEditor payload={payload} onChange={(next) => setPayload(next)} />
        )}
        {activeType === "placement" && payload.contentType === "placement" && (
          <PlacementEditor payload={payload} relations={relations} onChange={(next) => setPayload(next)} />
        )}

        <fieldset>
          <legend>Workflow de {meta.label.toLowerCase()}</legend>
          <label>
            Motivo da alteração
            <input value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
          <p>
            Status: <strong>{state}</strong> · Contrato:{" "}
            <strong>{validation.success ? "válido" : "incompleto"}</strong>
          </p>
          <div className="admin-workflow-actions">
            {can("edit") && (
              <button className="admin-button" disabled={busy || !validation.success}>
                <Save size={16} /> {loaded ? "Salvar rascunho" : "Criar documento"}
              </button>
            )}
            {loaded && (
              <button type="button" onClick={() => void preview()} disabled={busy}>
                Preview técnico
              </button>
            )}
            {state === "draft" && can("edit") && (
              <button type="button" onClick={() => void run("submit")} disabled={busy}>
                Enviar para revisão
              </button>
            )}
            {state === "in_review" && can("approve") && (
              <button
                type="button"
                onClick={() => void run("approve", { revisionId: latestRevision?.id })}
                disabled={busy}
              >
                Aprovar
              </button>
            )}
            {state === "approved" && can("publish") && (
              <>
                <button
                  type="button"
                  onClick={() => void run("publish", { revisionId: latestRevision?.id })}
                  disabled={busy}
                >
                  Publicar agora
                </button>
                <label>
                  Agendar publicação
                  <input
                    type="datetime-local"
                    value={publishAt}
                    onChange={(event) => setPublishAt(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void run("schedule", { publishAt: new Date(publishAt).toISOString() })}
                  disabled={busy || !publishAt}
                >
                  Agendar
                </button>
              </>
            )}
            {state === "published" && can("publish") && (
              <button
                type="button"
                className="admin-danger-link"
                onClick={() => void run("archive")}
                disabled={busy}
              >
                <Trash2 size={16} /> Despublicar e arquivar
              </button>
            )}
            {state === "published" && can("edit") && (
              <button type="button" onClick={() => void run("reopen")} disabled={busy}>
                Abrir nova versão
              </button>
            )}
          </div>
          {loaded?.cms_content_revisions.length ? (
            <div className="admin-history">
              <h2>Histórico imutável</h2>
              {loaded.cms_content_revisions
                .slice()
                .sort((a, b) => b.revision_number - a.revision_number)
                .map((revision, index) => (
                  <details key={revision.id}>
                    <summary>
                      Revisão {revision.revision_number} — {revision.reason}
                    </summary>
                    <p>{new Date(revision.created_at).toLocaleString("pt-BR")}</p>
                    <button type="button" onClick={() => void preview(revision.id)}>
                      Preview da revisão
                    </button>
                    {(state === "archived" || (state === "published" && index > 0)) && can("publish") && (
                      <button type="button" onClick={() => void run("restore", { revisionId: revision.id })}>
                        Restaurar como nova revisão
                      </button>
                    )}
                  </details>
                ))}
            </div>
          ) : (
            <p className="admin-help">Nenhuma revisão congelada.</p>
          )}
        </fieldset>
      </form>

      {!validation.success && (
        <aside className="admin-contract-issues">
          <h2>Pendências</h2>
          <ul>
            {validation.error.issues.slice(0, 10).map((issue) => (
              <li key={`${issue.path.join(".")}-${issue.message}`}>
                {issue.path.join(".")} — {issue.message}
              </li>
            ))}
          </ul>
        </aside>
      )}
    </section>
  );
}

function NavigationEditor({
  payload,
  onChange,
}: {
  payload: CmsNavigationContent;
  onChange: (payload: CmsNavigationContent) => void;
}) {
  const updateItem = (index: number, patch: Partial<CmsNavigationContent["items"][number]>) =>
    onChange({
      ...payload,
      items: payload.items.map((item, current) => (current === index ? { ...item, ...patch } : item)),
    });
  return (
    <fieldset>
      <legend>Header, menu mobile e footer</legend>
      <p className="admin-help">Organize até três níveis escolhendo o item pai. Links `#` não são aceitos.</p>
      <div className="admin-repeaters">
        {payload.items.map((item, index) => (
          <fieldset key={item.id}>
            <legend>Item {index + 1}</legend>
            <label>
              Local
              <select
                value={item.location}
                onChange={(event) =>
                  updateItem(index, { location: event.target.value as typeof item.location })
                }
              >
                <option value="header">Header</option>
                <option value="footer">Footer</option>
              </select>
            </label>
            <label>
              Rótulo
              <input
                value={item.label}
                onChange={(event) => updateItem(index, { label: event.target.value })}
              />
            </label>
            <label>
              Destino
              <input
                value={item.href}
                onChange={(event) => updateItem(index, { href: event.target.value })}
              />
            </label>
            <label>
              Item pai
              <select
                value={item.parentId ?? ""}
                onChange={(event) => updateItem(index, { parentId: event.target.value || null })}
              >
                <option value="">Nível principal</option>
                {payload.items
                  .filter((candidate) => candidate.id !== item.id && candidate.location === item.location)
                  .map((candidate) => (
                    <option value={candidate.id} key={candidate.id}>
                      {candidate.label}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Ordem
              <input
                type="number"
                min="0"
                max="999"
                value={item.order}
                onChange={(event) => updateItem(index, { order: Number(event.target.value) })}
              />
            </label>
            <label className="admin-checkbox">
              <input
                type="checkbox"
                checked={item.visible}
                onChange={(event) => updateItem(index, { visible: event.target.checked })}
              />{" "}
              Visível
            </label>
            <label className="admin-checkbox">
              <input
                type="checkbox"
                checked={item.newTab}
                onChange={(event) => updateItem(index, { newTab: event.target.checked })}
              />{" "}
              Abrir em nova aba
            </label>
            <button
              type="button"
              className="admin-danger-link"
              onClick={() =>
                onChange({
                  ...payload,
                  items: payload.items
                    .filter((_, current) => current !== index)
                    .map((candidate) =>
                      candidate.parentId === item.id ? { ...candidate, parentId: null } : candidate,
                    ),
                })
              }
            >
              Remover item
            </button>
          </fieldset>
        ))}
      </div>
      <button
        type="button"
        onClick={() =>
          onChange({
            ...payload,
            items: [
              ...payload.items,
              {
                id: crypto.randomUUID(),
                parentId: null,
                location: "header",
                label: "Novo item",
                href: "/",
                order: payload.items.length,
                newTab: false,
                visible: true,
              },
            ],
          })
        }
      >
        <Plus size={16} /> Adicionar item
      </button>
    </fieldset>
  );
}

function SettingsEditor({
  payload,
  onChange,
}: {
  payload: CmsSiteSettingsContent;
  onChange: (payload: CmsSiteSettingsContent) => void;
}) {
  const company = (patch: Partial<CmsSiteSettingsContent["company"]>) =>
    onChange({ ...payload, company: { ...payload.company, ...patch } });
  return (
    <>
      <fieldset>
        <legend>Empresa e contato</legend>
        <label>
          Nome público
          <input value={payload.company.name} onChange={(event) => company({ name: event.target.value })} />
        </label>
        <label>
          Razão social opcional
          <input
            value={payload.company.legalName ?? ""}
            onChange={(event) => company({ legalName: event.target.value || undefined })}
          />
        </label>
        <label>
          Telefone
          <input value={payload.company.phone} onChange={(event) => company({ phone: event.target.value })} />
        </label>
        <label>
          WhatsApp
          <input
            value={payload.company.whatsapp}
            onChange={(event) => company({ whatsapp: event.target.value })}
          />
        </label>
        <label>
          E-mail
          <input
            type="email"
            value={payload.company.email}
            onChange={(event) => company({ email: event.target.value })}
          />
        </label>
        <label>
          Endereço
          <textarea
            rows={3}
            value={payload.company.address}
            onChange={(event) => company({ address: event.target.value })}
          />
        </label>
      </fieldset>
      <fieldset>
        <legend>CTA padrão</legend>
        <label>
          Rótulo
          <input
            value={payload.defaultCta.label}
            onChange={(event) =>
              onChange({ ...payload, defaultCta: { ...payload.defaultCta, label: event.target.value } })
            }
          />
        </label>
        <label>
          Destino
          <input
            value={payload.defaultCta.href}
            onChange={(event) =>
              onChange({ ...payload, defaultCta: { ...payload.defaultCta, href: event.target.value } })
            }
          />
        </label>
      </fieldset>
      <fieldset>
        <legend>Redes sociais</legend>
        {payload.socialLinks.map((link, index) => (
          <fieldset key={link.id}>
            <legend>Rede {index + 1}</legend>
            <label>
              Nome
              <input
                value={link.network}
                onChange={(event) =>
                  onChange({
                    ...payload,
                    socialLinks: payload.socialLinks.map((item, current) =>
                      current === index ? { ...item, network: event.target.value } : item,
                    ),
                  })
                }
              />
            </label>
            <label>
              URL
              <input
                type="url"
                value={link.url}
                onChange={(event) =>
                  onChange({
                    ...payload,
                    socialLinks: payload.socialLinks.map((item, current) =>
                      current === index ? { ...item, url: event.target.value } : item,
                    ),
                  })
                }
              />
            </label>
            <button
              type="button"
              className="admin-danger-link"
              onClick={() =>
                onChange({
                  ...payload,
                  socialLinks: payload.socialLinks.filter((_, current) => current !== index),
                })
              }
            >
              Remover rede
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          onClick={() =>
            onChange({
              ...payload,
              socialLinks: [
                ...payload.socialLinks,
                { id: crypto.randomUUID(), network: "LinkedIn", url: "https://" },
              ],
            })
          }
        >
          <Plus size={16} /> Adicionar rede
        </button>
      </fieldset>
    </>
  );
}

function PlacementEditor({
  payload,
  relations,
  onChange,
}: {
  payload: CmsPlacementContent;
  relations: Relation[];
  onChange: (payload: CmsPlacementContent) => void;
}) {
  const update = (index: number, patch: Partial<CmsPlacementContent["placements"][number]>) =>
    onChange({
      ...payload,
      placements: payload.placements.map((item, current) =>
        current === index ? { ...item, ...patch } : item,
      ),
    });
  return (
    <fieldset>
      <legend>Destaques agendados</legend>
      <p className="admin-help">
        O frontend recebe somente itens ativos dentro do período, ordenados por prioridade.
      </p>
      <div className="admin-repeaters">
        {payload.placements.map((item, index) => (
          <fieldset key={item.id}>
            <legend>Destaque {index + 1}</legend>
            <label>
              Posição
              <select
                value={item.slot}
                onChange={(event) => update(index, { slot: event.target.value as typeof item.slot })}
              >
                <option value="home_hero">Hero da homepage</option>
                <option value="home_featured">Destaques da homepage</option>
                <option value="catalog_featured">Destaque do catálogo</option>
                <option value="global_announcement">Aviso global</option>
              </select>
            </label>
            <label>
              Conteúdo
              <select
                value={item.targetId}
                onChange={(event) => {
                  const target = relations.find((candidate) => candidate.id === event.target.value);
                  update(index, {
                    targetId: event.target.value,
                    targetType: (target?.content_type ?? "page") as typeof item.targetType,
                  });
                }}
              >
                <option value="">Selecione</option>
                {relations.map((relation) => (
                  <option value={relation.id} key={relation.id}>
                    {relation.label} ({relation.content_type})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Rótulo opcional
              <input
                value={item.label ?? ""}
                onChange={(event) => update(index, { label: event.target.value || undefined })}
              />
            </label>
            <label>
              Início
              <input
                type="datetime-local"
                value={item.startsAt.slice(0, 16)}
                onChange={(event) =>
                  event.target.value &&
                  update(index, { startsAt: new Date(event.target.value).toISOString() })
                }
              />
            </label>
            <label>
              Término
              <input
                type="datetime-local"
                value={item.endsAt.slice(0, 16)}
                onChange={(event) =>
                  event.target.value && update(index, { endsAt: new Date(event.target.value).toISOString() })
                }
              />
            </label>
            <label>
              Prioridade
              <input
                type="number"
                min="0"
                max="999"
                value={item.priority}
                onChange={(event) => update(index, { priority: Number(event.target.value) })}
              />
            </label>
            <label className="admin-checkbox">
              <input
                type="checkbox"
                checked={item.enabled}
                onChange={(event) => update(index, { enabled: event.target.checked })}
              />{" "}
              Ativo
            </label>
            <button
              type="button"
              className="admin-danger-link"
              onClick={() =>
                onChange({
                  ...payload,
                  placements: payload.placements.filter((_, current) => current !== index),
                })
              }
            >
              Remover destaque
            </button>
          </fieldset>
        ))}
      </div>
      <button
        type="button"
        onClick={() => {
          const startsAt = new Date();
          const endsAt = new Date(startsAt.getTime() + 86400000);
          onChange({
            ...payload,
            placements: [
              ...payload.placements,
              {
                id: crypto.randomUUID(),
                slot: "home_featured",
                targetType: "page",
                targetId: crypto.randomUUID(),
                startsAt: startsAt.toISOString(),
                endsAt: endsAt.toISOString(),
                priority: 0,
                enabled: false,
              },
            ],
          });
        }}
      >
        <Plus size={16} /> Adicionar destaque
      </button>
    </fieldset>
  );
}
