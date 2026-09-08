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
  createEmptyPageBlock,
  duplicatePageBlock,
  governedFormBindingIssue,
  movePageBlock,
  pageBlockReferenceRequirement,
  type PublishedFormOption,
} from "../page-builder-model";
import { useDraftBackup } from "../hooks/useDraftBackup";
import { DraftBackupNotice } from "../components/DraftBackupNotice";
import { EditorialArchiveAction } from "../components/EditorialArchiveAction";
import { operatorErrorMessage } from "../operator-error-message";
import { urlSegmentFromText } from "../url-segment";
import { humanValidationIssue } from "../validation-field-label";
import {
  fetchAuthoritativeEditorialItem,
  INVALIDATED_EDITOR_SNAPSHOT,
  saveWithPublishedRevisionReconciliation,
} from "../published-revision-save";

type Loaded = {
  id: string;
  slug: string;
  workflow_status: string;
  cms_content_drafts: { payload: Record<string, unknown>; lock_version: number };
  cms_content_revisions: Array<{
    id: string;
    revision_number: number;
    reason: string;
    created_at: string;
    payload: Record<string, unknown>;
  }>;
};
const uid = () => crypto.randomUUID();
const toInput = (value: string) => value.slice(0, 16);
const fromInput = (value: string) => (value ? new Date(value).toISOString() : "");

const campaignBlockTypes = [
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
] as const satisfies readonly CmsPageBlock["type"][];
type CampaignBlockType = (typeof campaignBlockTypes)[number];
const campaignBlockLabels = {
  hero: "Destaque principal",
  rich_text: "Texto",
  image: "Imagem",
  gallery: "Galeria",
  benefit_grid: "Grade de benefícios",
  content_grid: "Grade de conteúdo",
  steps: "Etapas",
  metrics: "Indicadores",
  testimonial: "Depoimento",
  faq: "Perguntas frequentes",
  form: "Formulário",
  cta: "Chamada para ação",
  related_content: "Conteúdo relacionado",
} satisfies Record<CampaignBlockType, string>;

type CampaignPlacement = CmsCampaignContent["placements"][number];
const campaignSlotOptions = [
  "home_hero",
  "home_featured",
  "global_announcement",
  "article_inline",
  "product_banner",
  "service_banner",
  "solution_banner",
  "page_banner",
] as const satisfies readonly CampaignPlacement["slot"][];
const campaignSlotLabels = {
  home_hero: "Destaque principal da página inicial",
  home_featured: "Destaques da página inicial",
  global_announcement: "Aviso em todo o site",
  article_inline: "Dentro de artigos",
  product_banner: "Faixa em produtos",
  service_banner: "Faixa em serviços",
  solution_banner: "Faixa em soluções",
  page_banner: "Faixa em páginas",
} satisfies Record<CampaignPlacement["slot"], string>;

const campaignContextOptions = [
  "global",
  "product",
  "service",
  "solution",
  "page",
  "post",
] as const satisfies readonly CampaignPlacement["contextType"][];
const campaignContextLabels = {
  global: "Todo o site",
  product: "Produto específico",
  service: "Serviço específico",
  solution: "Solução específica",
  page: "Página específica",
  post: "Artigo específico",
} satisfies Record<CampaignPlacement["contextType"], string>;

const campaignExpiryLabels = {
  not_found: "Mostrar página não encontrada",
  gone: "Informar que a campanha foi encerrada",
  redirect: "Levar o visitante para outra página",
  fallback: "Mostrar outra campanha",
} satisfies Record<CmsCampaignContent["expiry"]["mode"], string>;

const trackingProviderLabels = {
  internal: "Medição interna da GAIATEC",
  ga4: "Google Analytics 4",
  meta: "Meta",
} satisfies Record<CmsCampaignContent["tracking"]["provider"], string>;

const campaignWorkflowLabels: Record<string, string> = {
  new: "Nova campanha",
  draft: "Rascunho",
  in_review: "Em revisão",
  approved: "Aprovada",
  scheduled: "Agendada",
  published: "Publicada",
  archived: "Arquivada",
  trashed: "Na lixeira",
};

function campaignPathFromTitle(title: string) {
  const addressName = urlSegmentFromText(title, 180);
  return `/campanhas/${addressName}`;
}

function campaignAddressName(path: string) {
  return path.startsWith("/campanhas/") ? path.slice("/campanhas/".length) : "";
}

function initialPayload(): CmsCampaignContent {
  const start = new Date(Date.now() + 3600000);
  const end = new Date(start.getTime() + 7 * 86400000);
  const path = "/campanhas/";
  return {
    schemaVersion: 1,
    consumerId: "cms.campaign-landing.v1",
    contentType: "campaign",
    title: "",
    summary: "",
    campaignKind: "lead_generation",
    templateKey: "landing_conversion",
    route: { path },
    window: { startsAt: start.toISOString(), endsAt: end.toISOString(), timezone: "America/Sao_Paulo" },
    blocks: [createEmptyPageBlock("hero"), createEmptyPageBlock("rich_text")],
    placements: [],
    tracking: { enabled: false, requiresConsent: true, provider: "internal", eventName: "campaign-view" },
    expiry: { mode: "not_found" },
    relations: { productIds: [], serviceIds: [], solutionIds: [], pageIds: [] },
    seo: {
      title: "",
      description: "",
      canonicalPath: path,
      indexable: false,
    },
    provenance: [
      {
        sourceKind: "owner_authored",
        rightsConfirmed: false as true,
        commercialOwner: "",
        technicalOwner: "",
        verifiedAt: "",
      },
    ],
    governanceState: "awaiting_owner",
    approval: {
      businessOwner: "",
      marketingReviewer: "",
      privacyReviewer: "",
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
  const [forms, setForms] = useState<PublishedFormOption[]>([]);
  const [campaigns, setCampaigns] = useState<Array<{ id: string; title: string }>>([]);
  const [blockType, setBlockType] = useState<CampaignBlockType>("rich_text");
  const [customizeAddress, setCustomizeAddress] = useState(false);
  const [customAddressName, setCustomAddressName] = useState("");
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
  const patchProvenance = (value: Record<string, unknown>) =>
    patch({
      provenance: payload.provenance.map((source, index) =>
        index === 0 ? { ...source, ...value } : source,
      ) as CmsCampaignContent["provenance"],
    });

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
      setForms(
        (formResult.data ?? []).flatMap((row) =>
          row.active_version_id
            ? [
                {
                  id: row.id,
                  formKey: row.form_key,
                  versionId: row.active_version_id,
                  title: row.title,
                },
              ]
            : [],
        ),
      );
      setCampaigns(
        (campaignResult.data ?? []).map((row: any) => ({
          id: row.id,
          title: row.cms_content_drafts?.payload?.title ?? "Campanha sem título",
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
      .select(
        "id,slug,workflow_status,cms_content_drafts(payload,lock_version),cms_content_revisions(id,revision_number,reason,created_at,payload)",
      )
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
            setError(`Rascunho incompatível. ${humanValidationIssue(parsed.error.issues[0])}`);
          else {
            setLoaded(item);
            setPayload(parsed.data);
            setCustomizeAddress(parsed.data.route.path !== campaignPathFromTitle(parsed.data.title));
            setCustomAddressName(campaignAddressName(parsed.data.route.path));
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
        throw new Error(`Campanha incompleta. ${humanValidationIssue(issue)}`);
      }
      if (formBindingIssue && ["create", "save", "submit", "approve", "publish", "schedule"].includes(action))
        throw new Error(formBindingIssue);
      const publishedItem = action === "save" && loaded?.workflow_status === "published" ? loaded : null;
      const result = await saveWithPublishedRevisionReconciliation({
        reopen: publishedItem
          ? () =>
              editorialCommand(session, {
                action: "reopen",
                itemId: publishedItem.id,
                contentType: null,
                slug: null,
                payload: null,
                expectedLockVersion: null,
                reason,
              })
          : null,
        save: () =>
          editorialCommand(session, {
            action,
            itemId: loaded?.id ?? null,
            contentType: loaded ? null : "campaign",
            slug,
            payload: action === "create" || action === "save" ? payload : null,
            expectedLockVersion: loaded?.cms_content_drafts.lock_version ?? null,
            reason,
            ...extras,
          }),
        invalidateSnapshot: () => setSavedSnapshot(INVALIDATED_EDITOR_SNAPSHOT),
        reconcile: async () => {
          if (!publishedItem) return;
          setLoaded((await fetchAuthoritativeEditorialItem(publishedItem.id, "campaign")) as Loaded);
        },
      });
      setSuccess(
        action === "archive"
          ? `${loaded?.workflow_status === "published" ? "Campanha despublicada e arquivada" : "Campanha arquivada"}. A alteração foi registrada na auditoria.`
          : "Operação concluída e registrada na auditoria.",
      );
      if (action === "create" || action === "save") setSavedSnapshot(JSON.stringify(payload));
      if (["create", "save", "publish", "archive"].includes(action)) backup.clear();
      if (!loaded && result.itemId)
        navigate(`/admin/marketing/campanhas/${result.itemId}`, { replace: true });
      else setRefreshToken((current) => current + 1);
    } catch (caught) {
      setError(operatorErrorMessage(caught, { fallback: "Não foi possível concluir a operação." }));
    } finally {
      setBusy(false);
    }
  }

  async function preview(revisionId?: string) {
    if (!session || !loaded) return;
    setBusy(true);
    setError("");
    setPreviewFallback("");
    const result = await openExternalAfterAsync(
      async () => (await issuePreview(session, loaded.id, revisionId)).path,
    );
    if (result.status === "blocked") {
      setPreviewFallback(result.url);
      setError("O navegador bloqueou a nova aba. Abra o preview pelo link abaixo.");
    } else if (result.status === "failed")
      setError(
        operatorErrorMessage(result.error, { fallback: "Não foi possível abrir a pré-visualização." }),
      );
    setBusy(false);
  }

  const dirty = JSON.stringify(payload) !== savedSnapshot;
  const state = loaded?.workflow_status ?? "new";
  const selectedCampaignForm = useMemo(
    () =>
      payload.form
        ? (forms.find(
            (form) =>
              form.id === payload.form?.formId &&
              form.versionId === payload.form?.versionId &&
              form.formKey === payload.form?.key,
          ) ?? null)
        : null,
    [forms, payload.form],
  );
  const formBindingIssue = useMemo(() => {
    const blockIssue = governedFormBindingIssue(payload.blocks, forms);
    if (blockIssue) return blockIssue;
    if (payload.form && !selectedCampaignForm)
      return "O formulário principal da campanha não corresponde à versão publicada atual. Selecione-o novamente antes de salvar ou publicar.";
    return null;
  }, [forms, payload.blocks, payload.form, selectedCampaignForm]);
  const backup = useDraftBackup({
    userId: session?.user.id,
    editorType: "campaign",
    itemKey: id ?? "novo",
    value: payload,
    dirty,
    enabled: !loading,
    onRestore: (restored) => {
      setPayload(restored);
      setCustomizeAddress(restored.route.path !== campaignPathFromTitle(restored.title));
      setCustomAddressName(campaignAddressName(restored.route.path));
    },
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
          <h1>{payload.title || "Nova campanha"}</h1>
          <p className="admin-help">Modelo aprovado, período, distribuição, conversão e encerramento.</p>
        </div>
      </div>
      <dl className="admin-editor-context" aria-label="Contexto da edição">
        <div>
          <dt>Campanha em edição</dt>
          <dd>
            {payload.title || "Sem título"} · {payload.route.path || "endereço gerado pelo título"}
          </dd>
        </div>
        <div>
          <dt>Situação</dt>
          <dd>
            {dirty
              ? "Alterações não salvas"
              : `Rascunho salvo · ${campaignWorkflowLabels[loaded?.workflow_status ?? "new"] ?? "Situação indisponível"}`}
          </dd>
        </div>
        <div>
          <dt>Impacto público</dt>
          <dd>Página da campanha, formulário, locais de exibição, vigência e medição após publicação.</dd>
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
          <input
            value={payload.title}
            onChange={(event) => {
              const title = event.target.value;
              setPayload((current) => {
                if (customizeAddress) return { ...current, title };
                const path = campaignPathFromTitle(title);
                return {
                  ...current,
                  title,
                  route: { path },
                  seo: { ...current.seo, canonicalPath: path },
                };
              });
            }}
          />
        </label>
        <label>
          Resumo
          <textarea rows={3} value={payload.summary} onChange={(e) => patch({ summary: e.target.value })} />
        </label>
        <div className="admin-field">
          <span className="admin-field__label">Endereço público</span>
          <output aria-label="Endereço público gerado">{payload.route.path || "/campanhas/"}</output>
          <label className="admin-checkbox">
            <input
              type="checkbox"
              checked={customizeAddress}
              onChange={(event) => {
                const customize = event.target.checked;
                setCustomizeAddress(customize);
                if (customize) setCustomAddressName(campaignAddressName(payload.route.path));
                else {
                  const path = campaignPathFromTitle(payload.title);
                  patch({ route: { path }, seo: { ...payload.seo, canonicalPath: path } });
                }
              }}
            />
            Personalizar o endereço público
          </label>
          {customizeAddress && (
            <label>
              Nome personalizado do endereço
              <input
                value={customAddressName}
                maxLength={180}
                placeholder="ex.: Semana da Indústria"
                onChange={(event) => {
                  const name = event.target.value;
                  setCustomAddressName(name);
                  const path = `/campanhas/${urlSegmentFromText(name, 180)}`;
                  patch({ route: { path }, seo: { ...payload.seo, canonicalPath: path } });
                }}
              />
            </label>
          )}
        </div>
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
          Modelo aprovado
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
            value={payload.form ? (selectedCampaignForm?.id ?? "__invalid__") : ""}
            aria-invalid={Boolean(payload.form && !selectedCampaignForm)}
            aria-describedby={
              payload.form && !selectedCampaignForm ? "campaign-form-binding-help" : undefined
            }
            onChange={(e) => {
              const form = forms.find((item) => item.id === e.target.value);
              if (!form) {
                if (
                  payload.blocks.some((block) => block.type === "form") &&
                  !window.confirm("Remover também todos os blocos de formulário desta campanha?")
                )
                  return;
                patch({
                  form: undefined,
                  blocks: payload.blocks.filter((block) => block.type !== "form"),
                });
                return;
              }
              patch({
                form: { formId: form.id, versionId: form.versionId, key: form.formKey },
                blocks: payload.blocks.map((block) =>
                  block.type === "form"
                    ? {
                        ...block,
                        data: {
                          ...block.data,
                          formKey: form.formKey,
                          formId: form.id,
                          formVersionId: form.versionId,
                        },
                      }
                    : block,
                ),
              });
            }}
          >
            <option value="">Sem formulário (remove os blocos de formulário)</option>
            {payload.form && !selectedCampaignForm && (
              <option value="__invalid__" disabled>
                Vínculo anterior indisponível — selecione novamente
              </option>
            )}
            {forms.map((form) => (
              <option key={form.id} value={form.id}>
                {form.title}
              </option>
            ))}
          </select>
        </label>
        {payload.form && !selectedCampaignForm && (
          <p id="campaign-form-binding-help" className="admin-notice admin-notice--error" role="alert">
            A definição, chave ou versão antes vinculada deixou de ser a versão publicada atual.
          </p>
        )}
      </div>

      <h2>Blocos da página da campanha</h2>
      <div className="admin-heading-actions">
        <select
          aria-label="Tipo de novo bloco"
          value={blockType}
          onChange={(e) => setBlockType(e.target.value as CampaignBlockType)}
        >
          {campaignBlockTypes.map((type) => (
            <option key={type} value={type}>
              {campaignBlockLabels[type]}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="admin-button admin-button--secondary"
          disabled={
            (pageBlockReferenceRequirement(blockType) === "media" && media.length === 0) ||
            (pageBlockReferenceRequirement(blockType) === "relation" && relations.length === 0) ||
            (pageBlockReferenceRequirement(blockType) === "form" && forms.length === 0)
          }
          onClick={() => {
            const form = forms[0];
            const block = createEmptyPageBlock(blockType, {
              assetId: media[0]?.id,
              relatedItemId: relations[0]?.id,
              form,
            });
            patch({
              blocks: [...payload.blocks, block],
              ...(block.type === "form" && form
                ? { form: { formId: form.id, versionId: form.versionId, key: form.formKey } }
                : {}),
            });
          }}
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
            forms={forms}
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
            Local de exibição
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
              {campaignSlotOptions.map((slot) => (
                <option key={slot} value={slot}>
                  {campaignSlotLabels[slot]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Onde mostrar
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
              {campaignContextOptions.map((type) => (
                <option key={type} value={type}>
                  {campaignContextLabels[type]}
                </option>
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

      <h2>Medição, encerramento e governança</h2>
      <div className="admin-form-grid">
        <label>
          <input
            type="checkbox"
            checked={payload.tracking.enabled}
            onChange={(e) => patch({ tracking: { ...payload.tracking, enabled: e.target.checked } })}
          />{" "}
          Medir visitas somente após o consentimento do visitante
        </label>
        <label>
          Ferramenta de medição
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
            {Object.entries(trackingProviderLabels).map(([provider, label]) => (
              <option key={provider} value={provider}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="admin-field">
          <span className="admin-field__label">Ação medida</span>
          <span>Visualização da campanha</span>
        </div>
        <label>
          Após expiração
          <select
            value={payload.expiry.mode}
            onChange={(e) => patch({ expiry: { mode: e.target.value as typeof payload.expiry.mode } })}
          >
            {Object.entries(campaignExpiryLabels).map(([mode, label]) => (
              <option key={mode} value={mode}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {payload.expiry.mode === "redirect" && (
          <label>
            Página de destino
            <input
              value={payload.expiry.destinationPath ?? ""}
              onChange={(e) => patch({ expiry: { ...payload.expiry, destinationPath: e.target.value } })}
            />
          </label>
        )}
        {payload.expiry.mode === "fallback" && (
          <label>
            Campanha substituta
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
          Permitir exibição nos mecanismos de busca
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
        <fieldset>
          <legend>Proveniência e direitos</legend>
          <label>
            Referência da autorização
            <input
              value={payload.provenance[0]?.authorizationReference ?? ""}
              onChange={(e) => patchProvenance({ authorizationReference: e.target.value || undefined })}
            />
          </label>
          <label>
            Data da autorização
            <input
              type="date"
              value={payload.provenance[0]?.authorizationDate ?? ""}
              onChange={(e) => patchProvenance({ authorizationDate: e.target.value || undefined })}
            />
          </label>
          <label>
            Escopo dos direitos
            <input
              value={payload.provenance[0]?.rightsScope ?? ""}
              onChange={(e) => patchProvenance({ rightsScope: e.target.value || undefined })}
            />
          </label>
          <label>
            Responsável comercial
            <input
              value={payload.provenance[0]?.commercialOwner ?? ""}
              onChange={(e) => patchProvenance({ commercialOwner: e.target.value })}
            />
          </label>
          <label>
            Responsável técnico
            <input
              value={payload.provenance[0]?.technicalOwner ?? ""}
              onChange={(e) => patchProvenance({ technicalOwner: e.target.value })}
            />
          </label>
          <label>
            Data da verificação
            <input
              type="datetime-local"
              value={payload.provenance[0]?.verifiedAt ? toInput(payload.provenance[0].verifiedAt) : ""}
              onChange={(e) =>
                patchProvenance({ verifiedAt: e.target.value ? fromInput(e.target.value) : "" })
              }
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={payload.provenance[0]?.rightsConfirmed === true}
              onChange={(e) => patchProvenance({ rightsConfirmed: e.target.checked })}
            />{" "}
            Confirmo os direitos para uso desta campanha
          </label>
        </fieldset>
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
              disabled={busy || !validation.success || Boolean(formBindingIssue)}
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
              disabled={busy || Boolean(formBindingIssue)}
              onClick={() => void run("submit")}
            >
              <Send size={16} /> Enviar à revisão
            </button>
          )}
          {loaded && can("approve") && (
            <button
              className="admin-button admin-button--secondary"
              disabled={busy || Boolean(formBindingIssue)}
              onClick={() => void run("approve")}
            >
              Aprovar
            </button>
          )}
          {loaded && can("publish") && (
            <button
              className="admin-button"
              disabled={busy || !validation.success || Boolean(formBindingIssue)}
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
          {loaded && (
            <EditorialArchiveAction
              state={state}
              entityLabel="campanha"
              article="A"
              allowed={can("publish")}
              busy={busy}
              onArchive={() => void run("archive")}
            />
          )}
        </div>
      </div>
      {loaded && loaded.cms_content_revisions.length > 0 && (
        <section className="admin-history">
          <h2>Histórico imutável</h2>
          {loaded.cms_content_revisions
            .slice()
            .sort((a, b) => b.revision_number - a.revision_number)
            .map((revision, index) => (
              <details key={revision.id}>
                <summary>
                  Revisão {revision.revision_number} — {revision.reason}
                </summary>
                <p>Criada em {new Date(revision.created_at).toLocaleString("pt-BR")}</p>
                <button type="button" disabled={busy} onClick={() => void preview(revision.id)}>
                  Preview desta revisão
                </button>
                {(state === "archived" || (state === "published" && index > 0)) && can("publish") && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run("restore", { revisionId: revision.id })}
                  >
                    Restaurar como nova revisão
                  </button>
                )}
              </details>
            ))}
        </section>
      )}
      {(!validation.success || formBindingIssue) && (
        <div className="admin-notice admin-notice--error" role="status">
          Pendência:{" "}
          {formBindingIssue ??
            (!validation.success
              ? humanValidationIssue(validation.error.issues[0])
              : "Revise os dados da campanha.")}
        </div>
      )}
    </section>
  );
}
