import { useEffect, useMemo, useState } from "react";
import { Archive, Copy, Eye, Plus, Save, Send, Trash2 } from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { supabase } from "@/lib/supabase";
import { CmsPageContentSchema, type CmsPageBlock, type CmsPageContent } from "@/shared/contracts/cms-content";
import { PageBlockEditor, type BuilderMedia, type BuilderRelation } from "../components/PageBlockEditor";
import { UnsavedChangesGuard } from "../components/UnsavedChangesGuard";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { editorialCommand, issuePreview } from "../api/cms-api";
import { openExternalAfterAsync } from "../open-external-preview";
import { useDraftBackup } from "../hooks/useDraftBackup";
import { DraftBackupNotice } from "../components/DraftBackupNotice";
import {
  createInitialPagePayload,
  createPageBlock,
  duplicateManagedPagePayload,
  duplicatePageBlock,
  movePageBlock,
  pageTypeMeta,
  type ManagedPageType,
} from "../page-builder-model";

type Loaded = {
  id: string;
  slug: string;
  content_type: ManagedPageType;
  workflow_status: string;
  scheduled_for?: string | null;
  cms_content_drafts: { payload: Record<string, unknown>; lock_version: number };
  cms_content_revisions: {
    id: string;
    revision_number: number;
    reason: string;
    created_at: string;
    payload: Record<string, unknown>;
  }[];
};

const tabs = [
  ["structure", "Estrutura"],
  ["content", "Blocos"],
  ["relations", "Relações"],
  ["seo", "SEO e URL"],
  ["governance", "Governança"],
  ["workflow", "Publicação"],
] as const;
type Tab = (typeof tabs)[number][0];

const blockLabels: Record<CmsPageBlock["type"], string> = {
  hero: "Hero",
  rich_text: "Texto",
  image: "Imagem",
  gallery: "Galeria",
  benefit_grid: "Grade de benefícios",
  content_grid: "Grade de conteúdo",
  steps: "Etapas",
  metrics: "Métricas",
  testimonial: "Depoimento",
  faq: "Perguntas frequentes",
  form: "Formulário",
  cta: "Chamada para ação",
  related_content: "Conteúdo relacionado",
};

export default function AdminPageBuilderPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { session, profile } = useAdminAuth();
  const requestedType = searchParams.get("type") === "homepage" ? "homepage" : "page";
  const [payload, setPayload] = useState<CmsPageContent>(() => createInitialPagePayload(requestedType));
  const [slug, setSlug] = useState(() =>
    requestedType === "homepage" ? "homepage" : `pagina-${Date.now()}`,
  );
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [media, setMedia] = useState<BuilderMedia[]>([]);
  const [relations, setRelations] = useState<BuilderRelation[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("structure");
  const [blockType, setBlockType] = useState<CmsPageBlock["type"]>("rich_text");
  const [loading, setLoading] = useState(id !== "novo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [previewFallback, setPreviewFallback] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify({ payload, slug }));
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(payload.blocks[0]?.id ?? null);
  const [reason, setReason] = useState("Atualização pelo site builder");
  const [publishAt, setPublishAt] = useState("");

  const contentType = payload.contentType as ManagedPageType;
  const meta = pageTypeMeta[contentType];
  const can = (action: "read" | "edit" | "approve" | "publish") =>
    profile?.permissions.includes(`${meta.permission}.${action}`) ?? false;
  const canHardDelete = profile?.permissions.includes("cms:content.hard_delete") ?? false;

  const update = (patch: Record<string, unknown>) =>
    setPayload((current) => ({ ...current, ...patch }) as CmsPageContent);

  useEffect(() => {
    let active = true;
    void Promise.all([
      supabase
        .from("cms_media_assets")
        .select("id,original_filename,alt_text")
        .eq("processing_status", "ready")
        .order("created_at", { ascending: false }),
      supabase
        .from("cms_content_items")
        .select("id,content_type,slug,cms_content_drafts(payload)")
        .in("content_type", ["product", "service", "industry", "application", "solution", "page"])
        .neq("workflow_status", "trashed")
        .order("updated_at", { ascending: false }),
    ]).then(([mediaResult, relationResult]) => {
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
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!id || id === "novo") return;
    let active = true;
    setLoading(true);
    void supabase
      .from("cms_content_items")
      .select(
        "id,slug,content_type,workflow_status,scheduled_for,cms_content_drafts(payload,lock_version),cms_content_revisions(id,revision_number,reason,created_at,payload)",
      )
      .eq("id", id)
      .in("content_type", ["page", "homepage"])
      .single()
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) setError("Página indisponível ou sem permissão.");
        else {
          const item = data as unknown as Loaded;
          const parsed = CmsPageContentSchema.safeParse(item.cms_content_drafts.payload);
          if (!parsed.success)
            setError(
              `Rascunho incompatível: ${parsed.error.issues[0]?.path.join(".")} — ${parsed.error.issues[0]?.message}`,
            );
          else {
            setLoaded(item);
            setPayload(parsed.data);
            setSlug(item.slug);
            setSavedSnapshot(JSON.stringify({ payload: parsed.data, slug: item.slug }));
            setSelectedBlockId((current) => current ?? parsed.data.blocks[0]?.id ?? null);
          }
        }
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, refreshToken]);

  const validation = useMemo(() => CmsPageContentSchema.safeParse(payload), [payload]);
  const latestRevision = loaded?.cms_content_revisions
    .slice()
    .sort((a, b) => b.revision_number - a.revision_number)[0];
  const state = loaded?.workflow_status ?? "new";
  const currentSnapshot = JSON.stringify({ payload, slug });
  const dirty = currentSnapshot !== savedSnapshot;
  const backup = useDraftBackup({
    userId: session?.user.id,
    editorType: contentType,
    itemKey: id ?? "novo",
    value: { payload, slug, activeTab, selectedBlockId },
    dirty,
    enabled: !loading,
    onRestore: (stored) => {
      setPayload(stored.payload);
      setSlug(stored.slug);
      setActiveTab(stored.activeTab);
      setSelectedBlockId(stored.selectedBlockId);
    },
  });
  const selectedBlock = payload.blocks.find((block) => block.id === selectedBlockId) ?? payload.blocks[0];
  const selectedBlockIndex = selectedBlock
    ? payload.blocks.findIndex((block) => block.id === selectedBlock.id)
    : -1;
  const nextAction = dirty
    ? "Salvar o rascunho antes de avançar no workflow"
    : state === "draft"
      ? "Enviar para revisão"
      : state === "in_review"
        ? "Aprovar a revisão"
        : state === "approved"
          ? "Publicar agora ou agendar"
          : state === "published"
            ? "Abrir nova versão para editar"
            : state === "scheduled"
              ? "Aguardar a publicação agendada"
              : "Revisar o histórico e restaurar se necessário";

  async function run(action: string, extras: Record<string, unknown> = {}) {
    if (!session) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      if (!["create", "save"].includes(action) && dirty)
        throw new Error(
          "Salve as alterações do rascunho antes de executar uma ação de revisão ou publicação.",
        );
      if ((action === "create" || action === "save") && !validation.success) {
        const issue = validation.error.issues[0];
        throw new Error(`Página incompleta: ${issue.path.join(".")} — ${issue.message}`);
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
        contentType: loaded ? null : contentType,
        slug,
        payload: action === "create" || action === "save" ? payload : null,
        expectedLockVersion: loaded?.cms_content_drafts.lock_version ?? null,
        reason,
        ...extras,
      });
      setSuccess(
        `Operação concluída: ${result.status}. Código de acompanhamento ${result.correlationId.slice(0, 8)}.`,
      );
      if (action === "create" || action === "save") setSavedSnapshot(currentSnapshot);
      if (["create", "save", "publish"].includes(action)) backup.clear();
      if (!loaded && result.itemId) navigate(`/admin/paginas/${result.itemId}`, { replace: true });
      else if (action === "hard_delete") navigate("/admin/paginas", { replace: true });
      else setRefreshToken((current) => current + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Operação não concluída.");
    } finally {
      setBusy(false);
    }
  }

  async function retire() {
    if (!session || !loaded || !validation.success) return;
    setBusy(true);
    setError("");
    try {
      await editorialCommand(session, {
        action: "retire",
        itemId: loaded.id,
        contentType: null,
        slug,
        payload,
        expectedLockVersion: loaded.cms_content_drafts.lock_version,
        reason,
      });
      navigate("/admin/paginas", { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível retirar a página.");
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
    } else if (result.status === "failed") setError(result.error.message);
    setBusy(false);
  }

  async function duplicatePage() {
    if (!session || !loaded || payload.contentType !== "page") return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const suffix = Date.now().toString().slice(-8);
      const duplicateSlug = `${slug.slice(0, 140).replace(/-+$/, "")}-copia-${suffix}`;
      const duplicatePayload = CmsPageContentSchema.parse(
        duplicateManagedPagePayload(payload, duplicateSlug),
      );
      const result = await editorialCommand(session, {
        action: "create",
        itemId: null,
        contentType: "page",
        slug: duplicateSlug,
        payload: duplicatePayload,
        expectedLockVersion: null,
        reason: `Duplicação da página ${loaded.id}`,
      });
      if (!result.itemId) throw new Error("A cópia não retornou um identificador válido.");
      navigate(`/admin/paginas/${result.itemId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível duplicar a página.");
      setBusy(false);
    }
  }

  if (loading)
    return (
      <div className="admin-state" aria-busy="true">
        Carregando site builder…
      </div>
    );
  if (error && !loaded && id !== "novo")
    return (
      <div className="admin-state admin-notice--error" role="alert">
        {error}
      </div>
    );

  return (
    <section>
      <UnsavedChangesGuard dirty={dirty && !busy} />
      <DraftBackupNotice backup={backup} />
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">SITE BUILDER · {contentType === "homepage" ? "HOMEPAGE" : "PÁGINA"}</p>
          <h1>{payload.title}</h1>
          <p className="admin-help">
            Editor estruturado: todo bloco abaixo possui consumidor no frontend público.
          </p>
        </div>
        <div className="admin-heading-actions">
          {loaded && payload.contentType === "page" && can("edit") && (
            <button type="button" onClick={() => void duplicatePage()} disabled={busy}>
              <Copy size={16} aria-hidden="true" /> Duplicar página
            </button>
          )}
          <Link to="/admin/paginas">Voltar às páginas</Link>
        </div>
      </div>

      {error && (
        <p className="admin-notice admin-notice--error" role="alert">
          {error}
          {previewFallback && (
            <>
              {" "}
              <a href={previewFallback} target="_blank" rel="noopener noreferrer">
                Abrir preview em nova aba
              </a>
            </>
          )}
        </p>
      )}
      {success && (
        <p className="admin-notice admin-notice--success" role="status">
          {success}
        </p>
      )}

      <div className="admin-builder-status">
        <span>
          Status: <strong>{state}</strong>
        </span>
        <span>
          Blocos: <strong>{payload.blocks.length}</strong>
        </span>
        <span>
          Contrato:{" "}
          <strong>{validation.success ? "válido" : `${validation.error.issues.length} pendência(s)`}</strong>
        </span>
      </div>

      <dl className="admin-editor-context" aria-label="Contexto da edição">
        <div>
          <dt>Conteúdo em edição</dt>
          <dd>
            {payload.title || "Sem título"} · {payload.route.path}
          </dd>
        </div>
        <div>
          <dt>Versão e situação</dt>
          <dd>
            {dirty ? "Rascunho com alterações não salvas" : `Rascunho salvo · estado ${state}`}
            {latestRevision ? ` · revisão ${latestRevision.revision_number}` : " · sem revisão congelada"}
          </dd>
        </div>
        <div>
          <dt>Área selecionada e próxima ação</dt>
          <dd>
            {selectedBlock
              ? `${blockLabels[selectedBlock.type]} · bloco ${selectedBlockIndex + 1} de ${payload.blocks.length} · ${selectedBlock.hidden ? "oculto no site" : "público após publicação"}`
              : "Nenhum bloco selecionado"}
            <br />
            {nextAction}
          </dd>
        </div>
      </dl>

      <div className="admin-tabs" role="tablist" aria-label="Seções do site builder">
        {tabs.map(([key, label], index) => (
          <button
            key={key}
            id={`page-tab-${key}`}
            type="button"
            role="tab"
            aria-selected={activeTab === key}
            aria-controls="page-builder-panel"
            tabIndex={activeTab === key ? 0 : -1}
            onClick={() => setActiveTab(key)}
            onKeyDown={(event) => {
              const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
              const targetIndex =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? tabs.length - 1
                    : offset
                      ? (index + offset + tabs.length) % tabs.length
                      : -1;
              if (targetIndex >= 0) {
                event.preventDefault();
                const target = tabs[targetIndex][0];
                setActiveTab(target);
                document.getElementById(`page-tab-${target}`)?.focus();
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <form
        id="page-builder-panel"
        role="tabpanel"
        aria-labelledby={`page-tab-${activeTab}`}
        className="admin-page-builder"
        onSubmit={(event) => {
          event.preventDefault();
          void run(loaded ? "save" : "create");
        }}
      >
        {activeTab === "structure" && (
          <fieldset>
            <legend>Identificação e template</legend>
            <label>
              Título administrativo e público
              <input value={payload.title} onChange={(event) => update({ title: event.target.value })} />
            </label>
            <label>
              Resumo
              <textarea
                rows={4}
                value={payload.summary ?? ""}
                onChange={(event) => update({ summary: event.target.value || undefined })}
              />
            </label>
            <label>
              Identificador da URL
              <input
                value={slug}
                disabled={contentType === "homepage" || Boolean(loaded)}
                onChange={(event) => setSlug(event.target.value)}
              />
              <small>
                Use letras minúsculas, números e hífens. Depois da criação, a alteração é bloqueada.
              </small>
            </label>
            <label>
              Tipo de página
              <select
                value={payload.pageKind}
                disabled={contentType === "homepage"}
                onChange={(event) => update({ pageKind: event.target.value })}
              >
                <option value="institutional">Institucional</option>
                <option value="thematic">Temática</option>
                <option value="landing">Landing page</option>
                <option value="campaign">Campanha</option>
                {contentType === "homepage" && <option value="home">Homepage</option>}
              </select>
            </label>
            <label>
              Template
              <select
                value={payload.templateKey}
                disabled={contentType === "homepage"}
                onChange={(event) => update({ templateKey: event.target.value })}
              >
                <option value="standard">Padrão</option>
                <option value="editorial">Editorial</option>
                <option value="landing">Landing</option>
                <option value="technical">Técnico</option>
                {contentType === "homepage" && <option value="home">Homepage</option>}
              </select>
            </label>
            <label>
              Rótulo de navegação
              <input
                value={payload.route.navigationLabel ?? ""}
                onChange={(event) =>
                  update({ route: { ...payload.route, navigationLabel: event.target.value || undefined } })
                }
              />
            </label>
            <label>
              Rótulo do breadcrumb
              <input
                value={payload.route.breadcrumbLabel ?? ""}
                onChange={(event) =>
                  update({ route: { ...payload.route, breadcrumbLabel: event.target.value || undefined } })
                }
              />
            </label>
          </fieldset>
        )}

        {activeTab === "content" && (
          <div>
            <div className="admin-block-palette">
              <label>
                Adicionar bloco
                <select
                  value={blockType}
                  onChange={(event) => setBlockType(event.target.value as CmsPageBlock["type"])}
                >
                  {Object.entries(blockLabels).map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => {
                  const block = createPageBlock(blockType);
                  update({ blocks: [...payload.blocks, block] });
                  setSelectedBlockId(block.id);
                }}
              >
                <Plus size={16} /> Adicionar ao final
              </button>
            </div>
            <div className="admin-page-blocks">
              {payload.blocks.map((block, index) => (
                <div
                  className={
                    selectedBlock?.id === block.id
                      ? "admin-block-selection is-selected"
                      : "admin-block-selection"
                  }
                  key={block.id}
                  onClick={() => setSelectedBlockId(block.id)}
                  onFocusCapture={() => setSelectedBlockId(block.id)}
                >
                  <PageBlockEditor
                    block={block}
                    index={index}
                    total={payload.blocks.length}
                    media={media}
                    relations={relations.filter((item) => item.id !== loaded?.id)}
                    onChange={(next) =>
                      update({ blocks: payload.blocks.map((item) => (item.id === block.id ? next : item)) })
                    }
                    onRemove={() => {
                      if (!window.confirm(`Remover o bloco “${blockLabels[block.type]}” desta página?`))
                        return;
                      update({ blocks: payload.blocks.filter((item) => item.id !== block.id) });
                      setSelectedBlockId(payload.blocks.find((item) => item.id !== block.id)?.id ?? null);
                    }}
                    onDuplicate={() => {
                      const duplicate = duplicatePageBlock(block);
                      update({
                        blocks: [
                          ...payload.blocks.slice(0, index + 1),
                          duplicate,
                          ...payload.blocks.slice(index + 1),
                        ],
                      });
                      setSelectedBlockId(duplicate.id);
                    }}
                    onMove={(offset) => update({ blocks: movePageBlock(payload.blocks, index, offset) })}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "relations" && (
          <fieldset>
            <legend>Relações com o catálogo e a descoberta</legend>
            <p className="admin-help">
              Selecione conteúdos do CMS novo. Relações não publicadas bloqueiam a publicação da página.
            </p>
            {(["product", "service", "industry", "application", "solution"] as const).map((kind) => {
              const key = `${kind}Ids` as keyof CmsPageContent["relations"];
              const labels = {
                product: "Produtos",
                service: "Serviços",
                industry: "Indústrias",
                application: "Aplicações",
                solution: "Soluções",
              };
              return (
                <fieldset className="admin-check-grid" key={kind}>
                  <legend>{labels[kind]}</legend>
                  {relations
                    .filter((item) => item.content_type === kind)
                    .map((item) => (
                      <label className="admin-checkbox" key={item.id}>
                        <input
                          type="checkbox"
                          checked={payload.relations[key].includes(item.id)}
                          onChange={(event) =>
                            update({
                              relations: {
                                ...payload.relations,
                                [key]: event.target.checked
                                  ? [...payload.relations[key], item.id]
                                  : payload.relations[key].filter((value) => value !== item.id),
                              },
                            })
                          }
                        />{" "}
                        {item.label}
                      </label>
                    ))}
                </fieldset>
              );
            })}
          </fieldset>
        )}

        {activeTab === "seo" && (
          <fieldset>
            <legend>URL, indexação e retirada</legend>
            <label>
              Caminho público
              <input
                value={payload.route.path}
                disabled={contentType === "homepage"}
                onChange={(event) =>
                  update({
                    route: { ...payload.route, path: event.target.value },
                    seo: { ...payload.seo, canonicalPath: event.target.value },
                  })
                }
              />
            </label>
            <label>
              Meta title
              <input
                value={payload.seo.title}
                onChange={(event) => update({ seo: { ...payload.seo, title: event.target.value } })}
              />
            </label>
            <label>
              Meta description
              <textarea
                rows={4}
                value={payload.seo.description}
                onChange={(event) => update({ seo: { ...payload.seo, description: event.target.value } })}
              />
            </label>
            <label>
              Endereço oficial da página
              <input value={payload.seo.canonicalPath} readOnly />
              <small>Usado pelos mecanismos de busca como endereço principal deste conteúdo.</small>
            </label>
            <label>
              Imagem de compartilhamento
              <select
                value={payload.seo.ogImageId ?? ""}
                onChange={(event) =>
                  update({ seo: { ...payload.seo, ogImageId: event.target.value || undefined } })
                }
              >
                <option value="">Sem imagem</option>
                {media.map((asset) => (
                  <option value={asset.id} key={asset.id}>
                    {asset.original_filename}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-checkbox">
              <input
                type="checkbox"
                checked={payload.seo.indexable}
                onChange={(event) => update({ seo: { ...payload.seo, indexable: event.target.checked } })}
              />{" "}
              Permitir indexação após homologação
            </label>
            <fieldset>
              <legend>Ao retirar esta página</legend>
              <label>
                Comportamento
                <select
                  value={payload.retirement.mode}
                  onChange={(event) =>
                    update({
                      retirement: {
                        mode: event.target.value as CmsPageContent["retirement"]["mode"],
                        ...(event.target.value === "redirect"
                          ? { destinationPath: payload.retirement.destinationPath ?? "/" }
                          : {}),
                      },
                    })
                  }
                >
                  <option value="not_found">404 — não encontrada</option>
                  <option value="gone">410 — removida definitivamente</option>
                  <option value="redirect">301 — redirecionar</option>
                </select>
              </label>
              {payload.retirement.mode === "redirect" && (
                <label>
                  Destino
                  <input
                    value={payload.retirement.destinationPath ?? ""}
                    onChange={(event) =>
                      update({ retirement: { ...payload.retirement, destinationPath: event.target.value } })
                    }
                  />
                </label>
              )}
            </fieldset>
          </fieldset>
        )}

        {activeTab === "governance" && (
          <fieldset>
            <legend>Proveniência, direitos e aprovação</legend>
            <label>
              Estado
              <select
                value={payload.governanceState}
                onChange={(event) => update({ governanceState: event.target.value })}
              >
                <option value="synthetic_test">Teste sintético</option>
                <option value="awaiting_owner">Aguardando owner</option>
                <option value="homologated">Homologado</option>
              </select>
            </label>
            <label>
              Owner de negócio
              <input
                value={payload.approval.businessOwner}
                onChange={(event) =>
                  update({ approval: { ...payload.approval, businessOwner: event.target.value } })
                }
              />
            </label>
            <label>
              Revisor editorial
              <input
                value={payload.approval.editorialReviewer}
                onChange={(event) =>
                  update({ approval: { ...payload.approval, editorialReviewer: event.target.value } })
                }
              />
            </label>
            <label>
              Data de aprovação
              <input
                type="datetime-local"
                value={payload.approval.approvedAt ? payload.approval.approvedAt.slice(0, 16) : ""}
                onChange={(event) =>
                  update({
                    approval: {
                      ...payload.approval,
                      approvedAt: event.target.value ? new Date(event.target.value).toISOString() : undefined,
                    },
                  })
                }
              />
            </label>
            {payload.provenance.map((source, sourceIndex) => {
              const patchSource = (patch: Record<string, unknown>) =>
                update({
                  provenance: payload.provenance.map((item, index) =>
                    index === sourceIndex ? { ...item, ...patch } : item,
                  ),
                });
              return (
                <fieldset key={`${source.sourceKind}-${sourceIndex}`}>
                  <legend>Fonte {sourceIndex + 1}</legend>
                  <label>
                    Tipo
                    <select
                      value={source.sourceKind}
                      onChange={(event) => patchSource({ sourceKind: event.target.value })}
                    >
                      <option value="owner_authored">Criada pelo owner</option>
                      <option value="official_company">Fonte oficial GAIATEC</option>
                      <option value="official_manufacturer">Fabricante oficial</option>
                    </select>
                  </label>
                  {source.sourceKind !== "owner_authored" && (
                    <>
                      <label>
                        URL da fonte
                        <input
                          type="url"
                          value={source.sourceUrl ?? ""}
                          onChange={(event) => patchSource({ sourceUrl: event.target.value || undefined })}
                        />
                      </label>
                      <label>
                        Caminho do arquivo
                        <input
                          value={source.sourcePath ?? ""}
                          onChange={(event) => patchSource({ sourcePath: event.target.value || undefined })}
                        />
                      </label>
                      <label>
                        SHA-256 do documento
                        <input
                          value={source.sourceSha256 ?? ""}
                          maxLength={64}
                          onChange={(event) => patchSource({ sourceSha256: event.target.value || undefined })}
                        />
                      </label>
                      <label>
                        Versão do documento
                        <input
                          value={source.documentVersion ?? ""}
                          onChange={(event) =>
                            patchSource({ documentVersion: event.target.value || undefined })
                          }
                        />
                      </label>
                      <label>
                        Data do documento
                        <input
                          type="date"
                          value={source.documentDate ?? ""}
                          onChange={(event) => patchSource({ documentDate: event.target.value || undefined })}
                        />
                      </label>
                    </>
                  )}
                  <label>
                    Referência da autorização
                    <input
                      value={source.authorizationReference ?? ""}
                      onChange={(event) =>
                        patchSource({ authorizationReference: event.target.value || undefined })
                      }
                    />
                  </label>
                  <label>
                    Data da autorização
                    <input
                      type="date"
                      value={source.authorizationDate ?? ""}
                      onChange={(event) =>
                        patchSource({ authorizationDate: event.target.value || undefined })
                      }
                    />
                  </label>
                  <label>
                    Escopo dos direitos
                    <input
                      value={source.rightsScope ?? ""}
                      onChange={(event) => patchSource({ rightsScope: event.target.value || undefined })}
                    />
                  </label>
                  <label>
                    Owner comercial
                    <input
                      value={source.commercialOwner}
                      onChange={(event) => patchSource({ commercialOwner: event.target.value })}
                    />
                  </label>
                  <label>
                    Owner técnico
                    <input
                      value={source.technicalOwner}
                      onChange={(event) => patchSource({ technicalOwner: event.target.value })}
                    />
                  </label>
                  <label>
                    Verificado em
                    <input
                      type="datetime-local"
                      value={source.verifiedAt.slice(0, 16)}
                      onChange={(event) =>
                        event.target.value &&
                        patchSource({ verifiedAt: new Date(event.target.value).toISOString() })
                      }
                    />
                  </label>
                  <label className="admin-checkbox">
                    <input
                      type="checkbox"
                      checked={source.rightsConfirmed}
                      onChange={(event) => patchSource({ rightsConfirmed: event.target.checked })}
                    />{" "}
                    Direitos de uso confirmados
                  </label>
                </fieldset>
              );
            })}
          </fieldset>
        )}

        {activeTab === "workflow" && (
          <fieldset>
            <legend>Preview, aprovação, agendamento e histórico</legend>
            <label>
              Motivo da alteração
              <input value={reason} onChange={(event) => setReason(event.target.value)} />
            </label>
            <div className="admin-workflow-actions">
              <button type="button" onClick={() => void preview()} disabled={!loaded || busy}>
                <Eye size={16} /> Preview salvo
              </button>
              {state === "draft" && can("edit") && (
                <button type="button" onClick={() => void run("submit")} disabled={busy}>
                  <Send size={16} /> Enviar para revisão
                </button>
              )}
              {state === "in_review" && can("approve") && (
                <button
                  type="button"
                  onClick={() => void run("approve", { revisionId: latestRevision?.id })}
                  disabled={busy}
                >
                  Aprovar revisão
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
                    onClick={() =>
                      void run("schedule", {
                        publishAt: publishAt ? new Date(publishAt).toISOString() : null,
                      })
                    }
                    disabled={busy || !publishAt}
                  >
                    Agendar
                  </button>
                </>
              )}
              {state === "published" && (
                <>
                  <a href={payload.route.path} target="_blank" rel="noreferrer">
                    Abrir página pública
                  </a>
                  {can("publish") && (
                    <button
                      type="button"
                      className="admin-danger-link"
                      onClick={() => void retire()}
                      disabled={busy}
                    >
                      <Archive size={16} /> Retirar do ar
                    </button>
                  )}
                  {can("edit") && (
                    <button type="button" onClick={() => void run("reopen")} disabled={busy}>
                      Abrir nova versão
                    </button>
                  )}
                </>
              )}
              {["draft", "in_review", "approved", "scheduled"].includes(state) &&
                loaded &&
                can("publish") && (
                  <button type="button" onClick={() => void run("archive")} disabled={busy}>
                    <Archive size={16} /> Arquivar
                  </button>
                )}
              {state === "archived" && can("edit") && (
                <button type="button" onClick={() => void run("trash")} disabled={busy}>
                  <Trash2 size={16} /> Mover para lixeira
                </button>
              )}
              {state === "draft" && loaded && canHardDelete && loaded.cms_content_revisions.length === 0 && (
                <button
                  type="button"
                  className="admin-danger-link"
                  onClick={() => void run("hard_delete")}
                  disabled={busy}
                >
                  <Trash2 size={16} /> Excluir rascunho definitivamente
                </button>
              )}
            </div>
            <div className="admin-history">
              <h2>Histórico imutável</h2>
              {loaded?.cms_content_revisions.length ? (
                loaded.cms_content_revisions
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
                        <button
                          type="button"
                          onClick={() => void run("restore", { revisionId: revision.id })}
                        >
                          Restaurar como nova revisão
                        </button>
                      )}
                    </details>
                  ))
              ) : (
                <p>Nenhuma revisão congelada.</p>
              )}
            </div>
          </fieldset>
        )}

        {activeTab !== "workflow" && can("edit") && (
          <button className="admin-button" disabled={busy || !validation.success}>
            <Save size={16} /> {loaded ? "Salvar rascunho" : "Criar página"}
          </button>
        )}
      </form>

      {!validation.success && (
        <aside className="admin-contract-issues" aria-live="polite">
          <h2>Pendências antes de salvar</h2>
          <ul>
            {validation.error.issues.slice(0, 12).map((issue) => (
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
