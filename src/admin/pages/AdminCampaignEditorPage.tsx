import { useEffect, useMemo, useState } from "react";
import { Eye, Plus, Save, Send } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { supabase } from "@/lib/supabase";
import {
  CmsCampaignContentSchema,
  type CmsCampaignContent,
  type CmsPageBlock,
} from "@/shared/contracts/cms-content";
import { editorialCommand, issuePreview } from "../api/cms-api";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { UnsavedChangesGuard } from "../components/UnsavedChangesGuard";
import { openExternalAfterAsync } from "../open-external-preview";
import { PageBlockEditor, type BuilderMedia, type BuilderRelation } from "../components/PageBlockEditor";
import {
  createPageBlock,
  duplicatePageBlock,
  movePageBlock,
  pageBlockReferenceRequirement,
} from "../page-builder-model";
import { useDraftBackup } from "../hooks/useDraftBackup";
import { DraftBackupNotice } from "../components/DraftBackupNotice";

type Loaded = {
  id: string;
  slug: string;
  workflow_status: string;
  cms_content_drafts: { payload: Record<string, unknown>; lock_version: number };
};
type FormOption = { id: string; form_key: string; active_version_id: string; title: string };

const uid = () => crypto.randomUUID();
const toInput = (value: string) => value.slice(0, 16);
const fromInput = (value: string) => new Date(value).toISOString();

function initialPayload(): CmsCampaignContent {
  const start = new Date(Date.now() + 3600000);
  const end = new Date(start.getTime() + 7 * 86400000);
  const suffix = Date.now().toString().slice(-8);
  const path = `/campanhas/campanha-${suffix}`;
  return {
    schemaVersion: 1,
    consumerId: "cms.campaign-landing.v1",
    contentType: "campaign",
    title: "Nova campanha",
    summary: "Rascunho sintético criado manualmente no CMS novo.",
    campaignKind: "lead_generation",
    templateKey: "landing_conversion",
    route: { path },
    window: { startsAt: start.toISOString(), endsAt: end.toISOString(), timezone: "America/Sao_Paulo" },
    blocks: [createPageBlock("hero"), createPageBlock("rich_text"), createPageBlock("form")],
    placements: [],
    tracking: { enabled: false, requiresConsent: true, provider: "internal", eventName: "campaign-view" },
    expiry: { mode: "not_found" },
    relations: { productIds: [], serviceIds: [], solutionIds: [], pageIds: [] },
    seo: {
      title: "Nova campanha | GAIATEC",
      description: "Campanha em preparação.",
      canonicalPath: path,
      indexable: false,
    },
    provenance: [
      {
        sourceKind: "owner_authored",
        authorizationReference: "CADASTRO-MANUAL-CMS",
        authorizationDate: new Date().toISOString().slice(0, 10),
        rightsScope: "Campanha criada manualmente no novo CMS",
        rightsConfirmed: true,
        commercialOwner: "Administrador GAIATEC",
        technicalOwner: "Administrador GAIATEC",
        verifiedAt: new Date().toISOString(),
      },
    ],
    governanceState: "synthetic_test",
    approval: {
      businessOwner: "Administrador GAIATEC",
      marketingReviewer: "Revisor a definir",
      privacyReviewer: "Encarregado a definir",
    },
  };
}

export default function AdminCampaignEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { session, profile } = useAdminAuth();
  const [payload, setPayload] = useState<CmsCampaignContent>(initialPayload);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [media, setMedia] = useState<BuilderMedia[]>([]);
  const [relations, setRelations] = useState<BuilderRelation[]>([]);
  const [forms, setForms] = useState<FormOption[]>([]);
  const [campaigns, setCampaigns] = useState<Array<{ id: string; title: string }>>([]);
  const [blockType, setBlockType] = useState<CmsPageBlock["type"]>("rich_text");
  const [reason, setReason] = useState("Atualização da campanha");
  const [publishAt, setPublishAt] = useState("");
  const [loading, setLoading] = useState(id !== "novo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [previewFallback, setPreviewFallback] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(payload));
  const can = (action: string) => profile?.permissions.includes(`cms:campaigns.${action}`) ?? false;
  const validation = useMemo(() => CmsCampaignContentSchema.safeParse(payload), [payload]);
  const slug = payload.route.path.split("/").filter(Boolean).at(-1) ?? "campanha";
  const patch = (value: Partial<CmsCampaignContent>) => setPayload((current) => ({ ...current, ...value }));

  useEffect(() => {
    let active = true;
    void Promise.all([
      supabase
        .from("cms_media_assets")
        .select("id,original_filename,alt_text")
        .eq("processing_status", "ready"),
      supabase
        .from("cms_content_items")
        .select("id,content_type,slug,cms_content_drafts(payload)")
        .in("content_type", ["product", "service", "solution", "page", "post"]),
      supabase
        .from("cms_form_definitions")
        .select("id,form_key,active_version_id,title")
        .eq("status", "published")
        .not("active_version_id", "is", null),
      supabase
        .from("cms_content_items")
        .select("id,cms_content_drafts(payload)")
        .eq("content_type", "campaign")
        .neq("workflow_status", "trashed"),
    ]).then(([mediaResult, relationResult, formResult, campaignResult]) => {
      if (!active) return;
      setMedia((mediaResult.data ?? []) as BuilderMedia[]);
      setRelations(
        (relationResult.data ?? []).map((row: any) => ({
          id: row.id,
          content_type: row.content_type,
          slug: row.slug,
          label: row.cms_content_drafts?.payload?.title ?? row.slug,
        })),
      );
      setForms((formResult.data ?? []) as FormOption[]);
      setCampaigns(
        (campaignResult.data ?? []).map((row: any) => ({
          id: row.id,
          title: row.cms_content_drafts?.payload?.title ?? row.id,
        })),
      );
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!id || id === "novo") return;
    let active = true;
    void supabase
      .from("cms_content_items")
      .select("id,slug,workflow_status,cms_content_drafts(payload,lock_version)")
      .eq("id", id)
      .eq("content_type", "campaign")
      .single()
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) setError("Campanha indisponível ou sem permissão.");
        else {
          const item = data as unknown as Loaded;
          const parsed = CmsCampaignContentSchema.safeParse(item.cms_content_drafts.payload);
          if (!parsed.success)
            setError(
              `Rascunho incompatível: ${parsed.error.issues[0]?.path.join(".")} — ${parsed.error.issues[0]?.message}`,
            );
          else {
            setLoaded(item);
            setPayload(parsed.data);
            setSavedSnapshot(JSON.stringify(parsed.data));
          }
        }
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, refreshToken]);

  async function run(action: string, extras: Record<string, unknown> = {}) {
    if (!session) return;
    setBusy(true);
    setError("");
    setSuccess("");
    const dirty = JSON.stringify(payload) !== savedSnapshot;
    try {
      if (!["create", "save"].includes(action) && dirty)
        throw new Error("Salve a campanha antes de executar uma ação de revisão ou publicação.");
      if ((action === "create" || action === "save") && !validation.success) {
        const issue = validation.error.issues[0];
        throw new Error(`Campanha incompleta: ${issue.path.join(".")} — ${issue.message}`);
      }
      if (action === "save" && loaded?.workflow_status === "published") {
        await editorialCommand(session, {
          action: "reopen",
          itemId: loaded.id,
          contentType: null,
          slug: null,
          payload: null,
          expectedLockVersion: null,
          reason,
        });
      }
      const result = await editorialCommand(session, {
        action,
        itemId: loaded?.id ?? null,
        contentType: loaded ? null : "campaign",
        slug,
        payload: action === "create" || action === "save" ? payload : null,
        expectedLockVersion: loaded?.cms_content_drafts.lock_version ?? null,
        reason,
        ...extras,
      });
      setSuccess(
        `Operação concluída: ${result.status}. Código de acompanhamento ${result.correlationId.slice(0, 8)}.`,
      );
      if (action === "create" || action === "save") setSavedSnapshot(JSON.stringify(payload));
      if (["create", "save", "publish"].includes(action)) backup.clear();
      if (!loaded && result.itemId)
        navigate(`/admin/marketing/campanhas/${result.itemId}`, { replace: true });
      else setRefreshToken((current) => current + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Operação não concluída.");
    } finally {
      setBusy(false);
    }
  }

  async function preview() {
    if (!session || !loaded) return;
    setBusy(true);
    setError("");
    setPreviewFallback("");
    const result = await openExternalAfterAsync(async () => (await issuePreview(session, loaded.id)).path);
    if (result.status === "blocked") {
      setPreviewFallback(result.url);
      setError("O navegador bloqueou a nova aba. Abra o preview pelo link abaixo.");
    } else if (result.status === "failed") setError(result.error.message);
    setBusy(false);
  }

  const dirty = JSON.stringify(payload) !== savedSnapshot;
  const backup = useDraftBackup({
    userId: session?.user.id,
    editorType: "campaign",
    itemKey: id ?? "novo",
    value: payload,
    dirty,
    enabled: !loading,
    onRestore: setPayload,
  });
  if (loading)
    return (
      <div className="admin-state" aria-busy="true">
        Carregando campanha…
      </div>
    );

  return (
    <section>
      <UnsavedChangesGuard dirty={dirty && !busy} />
      <DraftBackupNotice backup={backup} />
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">CAMPANHA GOVERNADA</p>
          <h1>{payload.title}</h1>
          <p className="admin-help">Template aprovado, período, distribuição, conversão e expiração.</p>
        </div>
      </div>
      <dl className="admin-editor-context" aria-label="Contexto da edição">
        <div>
          <dt>Campanha em edição</dt>
          <dd>
            {payload.title || "Sem título"} · {payload.route.path}
          </dd>
        </div>
        <div>
          <dt>Situação</dt>
          <dd>
            {dirty ? "Alterações não salvas" : `Rascunho salvo · estado ${loaded?.workflow_status ?? "novo"}`}
          </dd>
        </div>
        <div>
          <dt>Impacto público</dt>
          <dd>Landing page, formulário, posicionamentos, vigência e tracking após publicação.</dd>
        </div>
      </dl>
      {error && (
        <div className="admin-notice admin-notice--error" role="alert">
          {error}
          {previewFallback && (
            <>
              {" "}
              <a href={previewFallback} target="_blank" rel="noopener noreferrer">
                Abrir preview em nova aba
              </a>
            </>
          )}
        </div>
      )}
      {success && (
        <div className="admin-notice" role="status">
          {success}
        </div>
      )}

      <div className="admin-form-grid">
        <label>
          Título
          <input value={payload.title} onChange={(e) => patch({ title: e.target.value })} />
        </label>
        <label>
          Resumo
          <textarea rows={3} value={payload.summary} onChange={(e) => patch({ summary: e.target.value })} />
        </label>
        <label>
          URL
          <input
            value={payload.route.path}
            onChange={(e) => {
              const path = e.target.value;
              patch({ route: { path }, seo: { ...payload.seo, canonicalPath: path } });
            }}
          />
        </label>
        <label>
          Objetivo
          <select
            value={payload.campaignKind}
            onChange={(e) => patch({ campaignKind: e.target.value as CmsCampaignContent["campaignKind"] })}
          >
            <option value="lead_generation">Geração de leads</option>
            <option value="product_launch">Lançamento</option>
            <option value="event">Evento</option>
            <option value="download">Download</option>
            <option value="institutional">Institucional</option>
          </select>
        </label>
        <label>
          Template aprovado
          <select
            value={payload.templateKey}
            onChange={(e) => patch({ templateKey: e.target.value as CmsCampaignContent["templateKey"] })}
          >
            <option value="landing_conversion">Conversão</option>
            <option value="landing_product">Produto</option>
            <option value="landing_event">Evento</option>
            <option value="landing_download">Download</option>
          </select>
        </label>
        <label>
          Início (America/São_Paulo)
          <input
            type="datetime-local"
            value={toInput(payload.window.startsAt)}
            onChange={(e) => patch({ window: { ...payload.window, startsAt: fromInput(e.target.value) } })}
          />
        </label>
        <label>
          Término
          <input
            type="datetime-local"
            value={toInput(payload.window.endsAt)}
            onChange={(e) => patch({ window: { ...payload.window, endsAt: fromInput(e.target.value) } })}
          />
        </label>
        <label>
          Formulário publicado
          <select
            value={payload.form?.formId ?? ""}
            onChange={(e) => {
              const form = forms.find((item) => item.id === e.target.value);
              patch({
                form: form
                  ? { formId: form.id, versionId: form.active_version_id, key: form.form_key }
                  : undefined,
                blocks: payload.blocks.map((block) =>
                  block.type === "form"
                    ? {
                        ...block,
                        data: {
                          ...block.data,
                          formKey: form?.form_key ?? "lead",
                          formId: form?.id,
                          formVersionId: form?.active_version_id,
                        },
                      }
                    : block,
                ),
              });
            }}
          >
            <option value="">Sem formulário vinculado</option>
            {forms.map((form) => (
              <option key={form.id} value={form.id}>
                {form.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      <h2>Blocos da landing page</h2>
      <div className="admin-heading-actions">
        <select
          aria-label="Tipo de novo bloco"
          value={blockType}
          onChange={(e) => setBlockType(e.target.value as CmsPageBlock["type"])}
        >
          {[
            "hero",
            "rich_text",
            "image",
            "gallery",
            "benefit_grid",
            "content_grid",
            "steps",
            "metrics",
            "testimonial",
            "faq",
            "form",
            "cta",
            "related_content",
          ].map((type) => (
            <option key={type} value={type}>
              {type.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="admin-button admin-button--secondary"
          disabled={
            (pageBlockReferenceRequirement(blockType) === "media" && media.length === 0) ||
            (pageBlockReferenceRequirement(blockType) === "relation" && relations.length === 0)
          }
          onClick={() =>
            patch({
              blocks: [
                ...payload.blocks,
                createPageBlock(blockType, {
                  assetId: media[0]?.id,
                  relatedItemId: relations[0]?.id,
                }),
              ],
            })
          }
        >
          <Plus size={16} /> Adicionar bloco
        </button>
      </div>
      <div className="admin-page-blocks">
        {payload.blocks.map((block, index) => (
          <PageBlockEditor
            key={block.id}
            block={block}
            index={index}
            total={payload.blocks.length}
            media={media}
            relations={relations}
            onChange={(next) =>
              patch({ blocks: payload.blocks.map((item, current) => (current === index ? next : item)) })
            }
            onRemove={() => {
              if (!window.confirm(`Remover o bloco ${index + 1} desta campanha?`)) return;
              patch({ blocks: payload.blocks.filter((_, current) => current !== index) });
            }}
            onDuplicate={() =>
              patch({
                blocks: [
                  ...payload.blocks.slice(0, index + 1),
                  duplicatePageBlock(block),
                  ...payload.blocks.slice(index + 1),
                ],
              })
            }
            onMove={(offset) => patch({ blocks: movePageBlock(payload.blocks, index, offset) })}
          />
        ))}
      </div>

      <h2>Posicionamentos temporários</h2>
      {payload.placements.map((placement, index) => (
        <div className="admin-form-grid" key={placement.id}>
          <label>
            Slot
            <select
              value={placement.slot}
              onChange={(e) =>
                patch({
                  placements: payload.placements.map((item, current) =>
                    current === index ? { ...item, slot: e.target.value as typeof item.slot } : item,
                  ),
                })
              }
            >
              {[
                "home_hero",
                "home_featured",
                "global_announcement",
                "article_inline",
                "product_banner",
                "service_banner",
                "solution_banner",
                "page_banner",
              ].map((slot) => (
                <option key={slot}>{slot}</option>
              ))}
            </select>
          </label>
          <label>
            Contexto
            <select
              value={placement.contextType}
              onChange={(e) =>
                patch({
                  placements: payload.placements.map((item, current) =>
                    current === index
                      ? {
                          ...item,
                          contextType: e.target.value as typeof item.contextType,
                          contextId: e.target.value === "global" ? undefined : item.contextId,
                        }
                      : item,
                  ),
                })
              }
            >
              {["global", "product", "service", "solution", "page", "post"].map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
          {placement.contextType !== "global" && (
            <label>
              Destino
              <select
                value={placement.contextId ?? ""}
                onChange={(e) =>
                  patch({
                    placements: payload.placements.map((item, current) =>
                      current === index ? { ...item, contextId: e.target.value || undefined } : item,
                    ),
                  })
                }
              >
                <option value="">Selecione</option>
                {relations
                  .filter((item) => item.content_type === placement.contextType)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label>
            Prioridade
            <input
              type="number"
              min="0"
              max="999"
              value={placement.priority}
              onChange={(e) =>
                patch({
                  placements: payload.placements.map((item, current) =>
                    current === index ? { ...item, priority: Number(e.target.value) } : item,
                  ),
                })
              }
            />
          </label>
          <button
            type="button"
            className="admin-danger-link"
            onClick={() => {
              if (!window.confirm(`Remover o posicionamento ${index + 1} desta campanha?`)) return;
              patch({ placements: payload.placements.filter((_, current) => current !== index) });
            }}
          >
            Remover
          </button>
        </div>
      ))}
      <button
        type="button"
        className="admin-button admin-button--secondary"
        onClick={() =>
          patch({
            placements: [
              ...payload.placements,
              { id: uid(), slot: "home_featured", contextType: "global", priority: 0 },
            ],
          })
        }
      >
        <Plus size={16} /> Novo posicionamento
      </button>

      <h2>Tracking, expiração e governança</h2>
      <div className="admin-form-grid">
        <label>
          <input
            type="checkbox"
            checked={payload.tracking.enabled}
            onChange={(e) => patch({ tracking: { ...payload.tracking, enabled: e.target.checked } })}
          />{" "}
          Tracking condicionado ao consentimento
        </label>
        <label>
          Provedor
          <select
            value={payload.tracking.provider}
            onChange={(e) =>
              patch({
                tracking: {
                  ...payload.tracking,
                  provider: e.target.value as typeof payload.tracking.provider,
                },
              })
            }
          >
            <option value="internal">Interno</option>
            <option value="ga4">GA4</option>
            <option value="meta">Meta</option>
          </select>
        </label>
        <label>
          Evento
          <input
            value={payload.tracking.eventName}
            onChange={(e) => patch({ tracking: { ...payload.tracking, eventName: e.target.value } })}
          />
        </label>
        <label>
          Após expiração
          <select
            value={payload.expiry.mode}
            onChange={(e) => patch({ expiry: { mode: e.target.value as typeof payload.expiry.mode } })}
          >
            <option value="not_found">404</option>
            <option value="gone">410</option>
            <option value="redirect">Redirect</option>
            <option value="fallback">Campanha fallback</option>
          </select>
        </label>
        {payload.expiry.mode === "redirect" && (
          <label>
            Destino
            <input
              value={payload.expiry.destinationPath ?? ""}
              onChange={(e) => patch({ expiry: { ...payload.expiry, destinationPath: e.target.value } })}
            />
          </label>
        )}
        {payload.expiry.mode === "fallback" && (
          <label>
            Fallback
            <select
              value={payload.expiry.fallbackCampaignId ?? ""}
              onChange={(e) =>
                patch({ expiry: { ...payload.expiry, fallbackCampaignId: e.target.value || undefined } })
              }
            >
              <option value="">Selecione</option>
              {campaigns
                .filter((item) => item.id !== loaded?.id)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
            </select>
          </label>
        )}
        <label>
          Estado editorial
          <select
            value={payload.governanceState}
            onChange={(e) =>
              patch({ governanceState: e.target.value as CmsCampaignContent["governanceState"] })
            }
          >
            <option value="synthetic_test">Teste sintético</option>
            <option value="awaiting_owner">Aguardando proprietário</option>
            <option value="homologated">Homologado</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={payload.seo.indexable}
            onChange={(e) => patch({ seo: { ...payload.seo, indexable: e.target.checked } })}
          />{" "}
          Indexável
        </label>
        <label>
          Título SEO
          <input
            value={payload.seo.title}
            onChange={(e) => patch({ seo: { ...payload.seo, title: e.target.value } })}
          />
        </label>
        <label>
          Descrição SEO
          <textarea
            value={payload.seo.description}
            onChange={(e) => patch({ seo: { ...payload.seo, description: e.target.value } })}
          />
        </label>
        <label>
          Responsável de negócio
          <input
            value={payload.approval.businessOwner}
            onChange={(e) => patch({ approval: { ...payload.approval, businessOwner: e.target.value } })}
          />
        </label>
        <label>
          Revisor de marketing
          <input
            value={payload.approval.marketingReviewer}
            onChange={(e) => patch({ approval: { ...payload.approval, marketingReviewer: e.target.value } })}
          />
        </label>
        <label>
          Revisor de privacidade
          <input
            value={payload.approval.privacyReviewer}
            onChange={(e) => patch({ approval: { ...payload.approval, privacyReviewer: e.target.value } })}
          />
        </label>
        <label>
          Data de aprovação
          <input
            type="datetime-local"
            value={payload.approval.approvedAt ? toInput(payload.approval.approvedAt) : ""}
            onChange={(e) =>
              patch({
                approval: {
                  ...payload.approval,
                  approvedAt: e.target.value ? fromInput(e.target.value) : undefined,
                },
              })
            }
          />
        </label>
      </div>

      <div className="admin-workflow-panel">
        <label>
          Justificativa
          <input value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <label>
          Agendar publicação
          <input type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} />
        </label>
        <div className="admin-heading-actions">
          {can("edit") && (
            <button
              className="admin-button"
              disabled={busy}
              onClick={() => void run(loaded ? "save" : "create")}
            >
              <Save size={16} /> Salvar
            </button>
          )}
          {loaded && (
            <button
              className="admin-button admin-button--secondary"
              disabled={busy}
              onClick={() => void preview()}
            >
              <Eye size={16} /> Preview
            </button>
          )}
          {loaded && can("edit") && (
            <button
              className="admin-button admin-button--secondary"
              disabled={busy}
              onClick={() => void run("submit")}
            >
              <Send size={16} /> Enviar à revisão
            </button>
          )}
          {loaded && can("approve") && (
            <button
              className="admin-button admin-button--secondary"
              disabled={busy}
              onClick={() => void run("approve")}
            >
              Aprovar
            </button>
          )}
          {loaded && can("publish") && (
            <button
              className="admin-button"
              disabled={busy || !validation.success}
              onClick={() =>
                void run(
                  publishAt ? "schedule" : "publish",
                  publishAt ? { publishAt: fromInput(publishAt) } : {},
                )
              }
            >
              {publishAt ? "Agendar" : "Publicar"}
            </button>
          )}
          {loaded && can("publish") && (
            <button className="admin-danger-link" disabled={busy} onClick={() => void run("archive")}>
              Expirar agora
            </button>
          )}
        </div>
      </div>
      {!validation.success && (
        <div className="admin-notice admin-notice--error" role="status">
          Pendência: {validation.error.issues[0]?.path.join(".")} — {validation.error.issues[0]?.message}
        </div>
      )}
    </section>
  );
}
