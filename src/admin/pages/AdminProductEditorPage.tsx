import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { supabase } from "@/lib/supabase";
import { CmsProductContentSchema, omitLegacyExternalProductDocuments } from "@/shared/contracts/cms-content";
import {
  Ev2PimAttributeCatalogResultSchema,
  type Ev2PimAttributeCatalogResult,
} from "@/shared/contracts/ev2-pim";
import {
  buildProductPayload,
  createInitialProductDraft,
  describeProductValidationIssue,
  hydrateProductDraft,
  tabForProductPath,
  type ProductEditorDraft,
  type ProductEditorTab,
} from "../product-editor-model";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { UnsavedChangesGuard } from "../components/UnsavedChangesGuard";
import {
  controlledVocabularyCommand,
  attributesCommand,
  editorialCommand,
  issuePreview,
  type ControlledVocabularyList,
  type ControlledVocabularyOption,
} from "../api/cms-api";
import { openExternalAfterAsync } from "../open-external-preview";
import { useDraftBackup } from "../hooks/useDraftBackup";
import { DraftBackupNotice } from "../components/DraftBackupNotice";
import { ProductModelsEditor } from "../components/ProductModelsEditor";
import { EntityPicker } from "../components/EntityPicker";
import { useProgressiveDraftAutosave } from "../hooks/useProgressiveDraftAutosave";
import { ProgressiveDraftStatus } from "../components/ProgressiveDraftStatus";
import { cmsEnvironment, isEv2FeatureEnabled } from "../ev2-runtime";
import { EditorialArchiveAction } from "../components/EditorialArchiveAction";
import { ProductDocumentsEditor } from "../components/ProductDocumentsEditor";
import {
  ProductBlocksEditor,
  ProductIdentifiersEditor,
  ProductMediaEditor,
  ProductOgImagePicker,
  ProductProvenanceEditor,
  ProductRedirectsEditor,
  ProductRelationsEditor,
  ProductSpecificationsEditor,
  type ProductRelationOption,
} from "../components/ProductSemanticEditors";
import { humanValidationIssue } from "../validation-field-label";
import {
  fetchAuthoritativeEditorialItem,
  INVALIDATED_EDITOR_SNAPSHOT,
  saveWithPublishedRevisionReconciliation,
} from "../published-revision-save";

const CMS_ENVIRONMENT = cmsEnvironment();

function attributeEnvelope() {
  return {
    schemaVersion: 1 as const,
    commandId: crypto.randomUUID(),
    correlationId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    actorContext: { environment: CMS_ENVIRONMENT, siteKey: "main" },
  };
}

type Loaded = {
  id: string;
  slug: string;
  workflow_status: string;
  updated_at: string;
  cms_content_drafts: { payload: Record<string, unknown>; lock_version: number };
  cms_content_revisions: {
    id: string;
    revision_number: number;
    reason: string;
    created_at: string;
    payload: Record<string, unknown>;
  }[];
};

type ProductStage = "identificacao" | "especificacoes" | "relacoes" | "visibilidade";

const tabs: [ProductStage, string][] = [
  ["identificacao", "Dados essenciais"],
  ["especificacoes", "Modelos"],
  ["relacoes", "Mídia"],
  ["visibilidade", "SEO e publicação"],
];

const workflowLabels: Record<string, string> = {
  new: "Novo",
  draft: "Rascunho",
  in_review: "Em revisão",
  approved: "Aprovado",
  published: "Publicado",
  archived: "Arquivado",
};

function pathSegment(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

function stageForTab(tab: ProductEditorTab): ProductStage {
  if (["identificacao", "classificacao", "comercial"].includes(tab)) return "identificacao";
  if (tab === "especificacoes") return "especificacoes";
  if (tab === "relacoes") return "relacoes";
  return "visibilidade";
}

function stageFromSearch(value: string | null): ProductStage {
  if (value === "modelos") return "especificacoes";
  if (value === "midia") return "relacoes";
  if (value === "seo") return "visibilidade";
  return "identificacao";
}

function ControlledTermSelect({
  label,
  list,
  value,
  onChange,
  disabled,
}: {
  label: string;
  list?: ControlledVocabularyList;
  value: string;
  onChange(option: ControlledVocabularyOption | undefined, input: string): void;
  disabled?: boolean;
}) {
  return (
    <EntityPicker
      label={label}
      value={value}
      disabled={disabled || !list}
      options={(list?.options ?? []).map((option) => ({
        id: option.id,
        label: option.label,
        disabled: !option.active,
      }))}
      onChange={(option, input) =>
        onChange(option ? list?.options.find((candidate) => candidate.id === option.id) : undefined, input)
      }
    />
  );
}

function ProductTextList({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange(value: string): void;
}) {
  const items = value === "" ? [""] : value.split(/\r?\n|,/);
  const commit = (next: string[]) => onChange(next.join("\n"));
  const move = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  };

  return (
    <fieldset className="admin-semantic-editor">
      <legend>{label}</legend>
      <p className="admin-help">Adicione cada item separadamente.</p>
      {items.map((item, index) => (
        <div className="admin-inline-fields" key={`${label}-${index}`}>
          <label>
            {index === 0 ? label : `${label} ${index + 1}`}
            <input
              value={item}
              maxLength={240}
              disabled={disabled}
              onChange={(event) =>
                commit(
                  items.map((current, currentIndex) =>
                    currentIndex === index ? event.target.value : current,
                  ),
                )
              }
            />
          </label>
          <button type="button" disabled={disabled || index === 0} onClick={() => move(index, -1)}>
            Mover para cima
          </button>
          <button
            type="button"
            disabled={disabled || index === items.length - 1}
            onClick={() => move(index, 1)}
          >
            Mover para baixo
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              commit(items.length === 1 ? [""] : items.filter((_, current) => current !== index))
            }
          >
            Remover
          </button>
        </div>
      ))}
      <button type="button" disabled={disabled || items.length >= 30} onClick={() => commit([...items, ""])}>
        Adicionar item em {label.toLocaleLowerCase("pt-BR")}
      </button>
    </fieldset>
  );
}

export default function AdminProductEditorPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { session, profile } = useAdminAuth();
  const draftV2Enabled = isEv2FeatureEnabled(profile, "ev2.draft_v2");
  const [draft, setDraft] = useState(createInitialProductDraft);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [activeTab, setActiveTab] = useState<ProductEditorTab>(() =>
    stageFromSearch(searchParams.get("etapa")),
  );
  const activeStage = stageForTab(activeTab);
  const [loading, setLoading] = useState(id !== "novo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [previewFallback, setPreviewFallback] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(draft));
  const [vocabularies, setVocabularies] = useState<ControlledVocabularyList[]>([]);
  const [vocabularyError, setVocabularyError] = useState("");
  const [attributeCatalog, setAttributeCatalog] = useState<Ev2PimAttributeCatalogResult | null>(null);
  const [attributeCatalogLoading, setAttributeCatalogLoading] = useState(false);
  const [attributeCatalogError, setAttributeCatalogError] = useState("");
  const [relationOptions, setRelationOptions] = useState<ProductRelationOption[]>([]);
  const [relationError, setRelationError] = useState("");
  const set = (key: keyof ProductEditorDraft, value: string | boolean) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const setProductTitle = (value: string) =>
    setDraft((current) => ({
      ...current,
      title: value,
      ...(id === "novo" ? { slug: pathSegment(value) || current.slug } : {}),
    }));
  const setNamedEntity = (
    nameKey: "brandName" | "manufacturerName" | "lineName",
    addressKey: "brandSlug" | "manufacturerSlug" | "lineSlug",
    value: string,
  ) =>
    setDraft((current) => ({
      ...current,
      [nameKey]: value,
      [addressKey]: pathSegment(value),
    }));
  const setVisibility = (key: keyof ProductEditorDraft["fieldVisibility"], value: "public" | "internal") =>
    setDraft((current) => ({
      ...current,
      fieldVisibility: { ...current.fieldVisibility, [key]: value },
    }));
  const can = (permission: string) => profile?.permissions.includes(permission) ?? false;

  useEffect(() => {
    if (!session) return;
    let active = true;
    void controlledVocabularyCommand<{ items: ControlledVocabularyList[] }>(session, {
      action: "list",
      entityType: "product",
      includeInactive: false,
    })
      .then((result) => {
        if (active) setVocabularies(result.items);
      })
      .catch(() => {
        if (active)
          setVocabularyError(
            "Não foi possível carregar as listas mestras. O salvamento permanece bloqueado.",
          );
      });
    return () => {
      active = false;
    };
  }, [session]);

  useEffect(() => {
    if (!session || !draft.productCategoryId) {
      setAttributeCatalog(null);
      setAttributeCatalogLoading(false);
      setAttributeCatalogError("");
      return;
    }
    let active = true;
    setAttributeCatalog(null);
    setAttributeCatalogLoading(true);
    setAttributeCatalogError("");
    void attributesCommand<unknown>(session, {
      action: "list_catalog",
      envelope: attributeEnvelope(),
      categoryId: draft.productCategoryId,
    })
      .then((result) => {
        if (!active) return;
        const parsed = Ev2PimAttributeCatalogResultSchema.safeParse(result);
        if (!parsed.success) throw new Error("Catálogo técnico retornou uma estrutura inválida.");
        setAttributeCatalog(parsed.data);
        if (!parsed.data.attributeSet || parsed.data.definitions.length === 0) {
          setAttributeCatalogError(
            "A categoria selecionada ainda não possui um conjunto de atributos ativo. O rascunho pode ser preservado, mas não pode ser homologado ou publicado.",
          );
        }
      })
      .catch((caught) => {
        if (!active) return;
        setAttributeCatalogError(
          caught instanceof Error
            ? `Não foi possível carregar os atributos controlados: ${caught.message}`
            : "Não foi possível carregar os atributos controlados.",
        );
      })
      .finally(() => {
        if (active) setAttributeCatalogLoading(false);
      });
    return () => {
      active = false;
    };
  }, [draft.productCategoryId, session]);

  useEffect(() => {
    if (!session) return;
    let active = true;
    void supabase
      .from("cms_content_items")
      .select("id,slug,content_type,workflow_status,cms_content_drafts(payload)")
      .in("content_type", ["product", "application", "industry", "service"])
      .order("updated_at", { ascending: false })
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) {
          setRelationError("Não foi possível carregar os vínculos do catálogo.");
          return;
        }
        const options = (data ?? []).flatMap((row) => {
          if (row.id === id || row.workflow_status === "archived") return [];
          const rawDraft = Array.isArray(row.cms_content_drafts)
            ? row.cms_content_drafts[0]
            : row.cms_content_drafts;
          const payload = rawDraft?.payload;
          const label =
            payload && typeof payload === "object" && !Array.isArray(payload)
              ? [payload.title, payload.name].find((value) => typeof value === "string" && value.trim())
              : undefined;
          const kind = row.content_type as ProductRelationOption["kind"];
          if (!["product", "application", "industry", "service"].includes(kind)) return [];
          return [
            {
              id: row.id,
              kind,
              label:
                typeof label === "string"
                  ? label
                  : row.slug
                      .replaceAll("-", " ")
                      .replace(/(^|\s)\p{L}/gu, (letter: string) => letter.toUpperCase()),
              description: `${
                kind === "product"
                  ? "Produto"
                  : kind === "application"
                    ? "Aplicação"
                    : kind === "industry"
                      ? "Indústria"
                      : "Serviço"
              } · ${workflowLabels[row.workflow_status] ?? "Cadastro editorial"}`,
            },
          ];
        });
        setRelationOptions(options);
        setRelationError("");
      });
    return () => {
      active = false;
    };
  }, [id, session]);

  useEffect(() => {
    if (!id || id === "novo") return;
    let active = true;
    void supabase
      .from("cms_content_items")
      .select(
        "id,slug,workflow_status,updated_at,cms_content_drafts(payload,lock_version),cms_content_revisions(id,revision_number,reason,created_at,payload)",
      )
      .eq("id", id)
      .eq("content_type", "product")
      .single()
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) setError("Produto indisponível ou sem permissão.");
        else {
          const item = data as unknown as Loaded;
          const compatiblePayload = omitLegacyExternalProductDocuments(item.cms_content_drafts.payload);
          const originalDocuments = Array.isArray(item.cms_content_drafts.payload.documents)
            ? item.cms_content_drafts.payload.documents.length
            : 0;
          const compatibleDocuments =
            compatiblePayload &&
            typeof compatiblePayload === "object" &&
            !Array.isArray(compatiblePayload) &&
            Array.isArray((compatiblePayload as Record<string, unknown>).documents)
              ? ((compatiblePayload as Record<string, unknown>).documents as unknown[]).length
              : 0;
          const parsed = CmsProductContentSchema.safeParse(compatiblePayload);
          if (!parsed.success) {
            setError(`Rascunho incompatível. ${humanValidationIssue(parsed.error.issues[0])}`);
          } else {
            if (compatibleDocuments < originalDocuments)
              setError(
                `${originalDocuments - compatibleDocuments} documento(s) externo(s) legado(s) foram omitidos. ` +
                  "Faça a ingestão pela biblioteca governada antes de republicar.",
              );
            setLoaded(item);
            setDraft((current) => {
              const hydrated = hydrateProductDraft(parsed.data, item.slug, current);
              setSavedSnapshot(JSON.stringify(hydrated));
              return hydrated;
            });
          }
        }
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, refreshToken]);

  const built = useMemo(() => buildProductPayload(draft), [draft]);
  const validation = useMemo(
    () => (built.jsonErrors.length ? null : CmsProductContentSchema.safeParse(built.payload)),
    [built],
  );
  const contractIssues = validation && !validation.success ? validation.error.issues : [];
  const latestRevision = loaded?.cms_content_revisions
    .slice()
    .sort((a, b) => b.revision_number - a.revision_number)[0];
  const currentSnapshot = JSON.stringify(draft);
  const dirty = currentSnapshot !== savedSnapshot;
  const backup = useDraftBackup({
    userId: session?.user.id,
    editorType: "product",
    itemKey: id ?? "novo",
    value: { draft, activeTab },
    dirty,
    enabled: !loading,
    onRestore: (stored) => {
      setDraft(stored.draft);
      setActiveTab(stored.activeTab);
    },
  });
  const progressiveValue = useMemo(() => ({ draft, activeTab }), [activeTab, draft]);
  const progressiveDraft = useProgressiveDraftAutosave({
    session,
    enabled: draftV2Enabled && !loading && id === "novo",
    environment: CMS_ENVIRONMENT,
    contentType: "product",
    value: progressiveValue,
    workingTitle: draft.title,
    onRestore: (stored) => {
      setDraft(stored.draft);
      setActiveTab(stored.activeTab);
      setSavedSnapshot(JSON.stringify(stored.draft));
      backup.clear();
    },
    onSynced: (stored) => {
      setSavedSnapshot(JSON.stringify(stored.draft));
      backup.clear();
    },
  });
  const list = (key: string) => vocabularies.find((entry) => entry.list_key === key);
  const setControlled = (
    prefix:
      | "productCategory"
      | "applicationMagnitude"
      | "technologyOption"
      | "installationOperation"
      | "monitoredElement",
    option: ControlledVocabularyOption | undefined,
    input: string,
  ) =>
    setDraft((current) => ({
      ...current,
      [`${prefix}Id`]: option?.id ?? "",
      [`${prefix}Slug`]: option?.slug ?? "",
      [`${prefix}Label`]: option?.label ?? input,
    }));

  async function run(action: string, extras: Record<string, unknown> = {}) {
    if (!session) return false;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      if (!["create", "save"].includes(action) && dirty)
        throw new Error("Salve o produto antes de executar uma ação de revisão ou publicação.");
      if (action === "create" || action === "save") {
        if (!loaded && progressiveDraft.active) {
          const synced = await progressiveDraft.flush();
          if (!synced) {
            throw new Error("O rascunho foi preservado localmente, mas ainda não pôde ser sincronizado.");
          }
          setSavedSnapshot(currentSnapshot);
          backup.clear();
          if (built.jsonErrors.length || !validation?.success) {
            setSuccess("Rascunho incompleto salvo de forma privada. Continue quando estiver pronto.");
            return true;
          }
          const promotedItemId = await progressiveDraft.promote({
            slug: draft.slug || pathSegment(draft.title),
            payload: built.payload,
            reason: draft.reason,
          });
          if (!promotedItemId) {
            throw new Error(
              "O rascunho foi preservado, mas o cadastro oficial não pôde ser concluído. Tente novamente.",
            );
          }
          setSuccess("Cadastro oficial criado a partir do rascunho salvo.");
          navigate(`/admin/produtos/${promotedItemId}`, { replace: true });
          return true;
        }
        if (built.jsonErrors[0]) {
          setActiveTab(built.jsonErrors[0].tab);
          throw new Error(built.jsonErrors[0].message);
        }
        if (!validation?.success) {
          const first = contractIssues[0];
          setActiveTab(tabForProductPath(first.path));
          throw new Error(`Cadastro incompleto: ${describeProductValidationIssue(first)}`);
        }
      }
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
                reason: draft.reason,
              })
          : null,
        save: () =>
          editorialCommand(session, {
            action,
            itemId: loaded?.id ?? null,
            contentType: loaded ? null : "product",
            slug: draft.slug || pathSegment(draft.title),
            payload: action === "create" || action === "save" ? built.payload : null,
            expectedLockVersion: loaded?.cms_content_drafts.lock_version ?? null,
            reason: draft.reason,
            ...extras,
          }),
        invalidateSnapshot: () => setSavedSnapshot(INVALIDATED_EDITOR_SNAPSHOT),
        reconcile: async () => {
          if (!publishedItem) return;
          setLoaded((await fetchAuthoritativeEditorialItem(publishedItem.id, "product")) as Loaded);
        },
      });
      setSuccess(
        action === "archive"
          ? `${loaded?.workflow_status === "published" ? "Produto despublicado e arquivado" : "Produto arquivado"}.`
          : action === "publish"
            ? "Produto publicado com sucesso."
            : action === "submit"
              ? "Produto enviado para revisão."
              : action === "approve"
                ? "Revisão aprovada."
                : action === "restore"
                  ? "Revisão restaurada como novo rascunho."
                  : "Rascunho salvo com sucesso.",
      );
      if (action === "create" || action === "save") setSavedSnapshot(currentSnapshot);
      if (["create", "save", "publish", "archive"].includes(action)) backup.clear();
      if (!loaded && result.itemId) navigate(`/admin/produtos/${result.itemId}`, { replace: true });
      else setRefreshToken((current) => current + 1);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha no fluxo do produto.");
      return false;
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
    } else if (result.status === "failed") setError(result.error.message);
    setBusy(false);
  }

  if (loading)
    return (
      <div className="admin-state" aria-busy="true">
        Carregando editor de produto…
      </div>
    );
  if (error && !loaded && id !== "novo")
    return (
      <div className="admin-state admin-notice--error" role="alert">
        {error}
      </div>
    );

  const state = loaded?.workflow_status ?? "new";
  const input = (label: string, key: keyof ProductEditorDraft, type = "text") => (
    <label>
      {label}
      <input
        type={type}
        value={String(draft[key])}
        onChange={(event) => set(key, event.target.value)}
        disabled={busy}
      />
    </label>
  );
  const area = (label: string, key: keyof ProductEditorDraft, rows = 4) => (
    <label>
      {label}
      <textarea
        rows={rows}
        value={String(draft[key])}
        onChange={(event) => set(key, event.target.value)}
        disabled={busy}
      />
    </label>
  );
  return (
    <section>
      <UnsavedChangesGuard dirty={dirty && !busy} />
      <div className="admin-editor-heading">
        <div>
          <nav aria-label="Breadcrumb">
            <Link to="/admin">Início</Link>
            <span>/</span>
            <Link to="/admin/produtos">Produtos</Link>
            <span>/</span>
            <span>{loaded ? "Editar" : "Novo"}</span>
          </nav>
          <p className="admin-eyebrow">CATÁLOGO GOVERNADO</p>
          <h1>{draft.title || "Novo produto"}</h1>
          <p className="admin-help">Fonte editorial única, versionada e publicada sem rebuild.</p>
        </div>
        <div className="admin-heading-actions">
          {loaded && (
            <button
              type="button"
              className="admin-button admin-button--secondary"
              disabled={busy || dirty}
              onClick={() => void preview()}
            >
              Pré-visualizar
            </button>
          )}
          <button
            type="button"
            className="admin-button"
            disabled={
              busy ||
              !can("cms:products.edit") ||
              progressiveDraft.status === "checking" ||
              progressiveDraft.status === "creating"
            }
            onClick={() => void run(loaded ? "save" : "create")}
          >
            Salvar rascunho
          </button>
          {state === "approved" && can("cms:products.publish") && (
            <button
              type="button"
              className="admin-button admin-button--primary"
              disabled={busy || dirty}
              onClick={() => void run("publish", { revisionId: latestRevision?.id })}
            >
              Publicar
            </button>
          )}
        </div>
      </div>
      <dl className="admin-editor-context" aria-label="Contexto da edição">
        <div>
          <dt>Produto em edição</dt>
          <dd>
            {draft.title || "Sem título"} ·{" "}
            {draft.slug ? `/produtos/${draft.slug}` : "endereço gerado ao salvar"}
          </dd>
        </div>
        <div>
          <dt>Situação</dt>
          <dd>{dirty ? "Alterações não salvas" : `Rascunho salvo · ${workflowLabels[state] ?? state}`}</dd>
        </div>
        <div>
          <dt>Impacto público</dt>
          <dd>Somente campos marcados como públicos chegam à página, busca, filtros e dados estruturados.</dd>
        </div>
      </dl>
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
      {vocabularyError && (
        <p className="admin-notice admin-notice--error" role="alert">
          {vocabularyError}
        </p>
      )}
      <DraftBackupNotice backup={backup} />
      <ProgressiveDraftStatus draft={progressiveDraft} />
      <div className="admin-tabs" role="tablist" aria-label="Seções do produto">
        {tabs.map(([key, label], index) => (
          <button
            key={key}
            id={`product-tab-${key}`}
            type="button"
            role="tab"
            aria-selected={activeStage === key}
            aria-controls="product-tabpanel"
            tabIndex={activeStage === key ? 0 : -1}
            onClick={() => setActiveTab(key)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setActiveTab(key);
                return;
              }
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
                document.getElementById(`product-tab-${target}`)?.focus();
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="admin-editor-workspace">
        <form
          id="product-tabpanel"
          role="tabpanel"
          aria-labelledby={`product-tab-${activeStage}`}
          className="admin-product-form"
          onSubmit={(event) => {
            event.preventDefault();
            void run(loaded ? "save" : "create");
          }}
        >
          {activeStage === "identificacao" && (
            <fieldset>
              <legend>Marca, fabricante, linha, modelo comercial e referência do fabricante</legend>
              <label>
                Nome comercial do produto
                <input
                  required
                  maxLength={180}
                  value={draft.title}
                  onChange={(event) => setProductTitle(event.target.value)}
                  disabled={busy}
                />
              </label>
              <label>
                Marca comercial
                <input
                  required
                  maxLength={160}
                  value={draft.brandName}
                  onChange={(event) => setNamedEntity("brandName", "brandSlug", event.target.value)}
                  disabled={busy}
                />
              </label>
              <label>
                Fabricante/OEM nominal
                <input
                  required
                  maxLength={160}
                  value={draft.manufacturerName}
                  onChange={(event) =>
                    setNamedEntity("manufacturerName", "manufacturerSlug", event.target.value)
                  }
                  disabled={busy}
                />
              </label>
              {input("Site oficial do fabricante/OEM", "manufacturerUrl", "url")}
              <label>
                Linha
                <input
                  required
                  maxLength={160}
                  value={draft.lineName}
                  onChange={(event) => setNamedEntity("lineName", "lineSlug", event.target.value)}
                  disabled={busy}
                />
              </label>
              <p className="admin-help">
                Os endereços amigáveis da marca, do fabricante, da linha e do produto são gerados e validados
                automaticamente. Modelos, referências e códigos são mantidos uma única vez na etapa Modelos.
              </p>
            </fieldset>
          )}
          {activeStage === "identificacao" && (
            <fieldset>
              <legend>Taxonomia, função e tecnologia</legend>
              <ControlledTermSelect
                label="Categoria de produto"
                list={list("product.category")}
                value={draft.productCategoryLabel}
                disabled={busy}
                onChange={(option, input) => setControlled("productCategory", option, input)}
              />
              <ControlledTermSelect
                label="Aplicação / grandeza"
                list={list("product.application_magnitude")}
                value={draft.applicationMagnitudeLabel}
                disabled={busy}
                onChange={(option, input) => setControlled("applicationMagnitude", option, input)}
              />
              <ControlledTermSelect
                label="Tecnologia"
                list={list("product.technology")}
                value={draft.technologyOptionLabel}
                disabled={busy}
                onChange={(option, input) => setControlled("technologyOption", option, input)}
              />
              <ControlledTermSelect
                label="Instalação / operação"
                list={list("product.installation_operation")}
                value={draft.installationOperationLabel}
                disabled={busy}
                onChange={(option, input) => setControlled("installationOperation", option, input)}
              />
              <ControlledTermSelect
                label="Elemento monitorado"
                list={list("product.monitored_element")}
                value={draft.monitoredElementLabel}
                disabled={busy}
                onChange={(option, input) => setControlled("monitoredElement", option, input)}
              />
              {input("Função", "functionText")}
            </fieldset>
          )}
          {activeStage === "identificacao" && (
            <fieldset>
              <legend>Conteúdo comercial e blocos</legend>
              {area("Resumo", "summary")}
              {area("Descrição curta", "shortDescription")}
              {area("Proposta de valor", "valueProposition")}
              <ProductTextList
                label="Benefícios"
                value={draft.benefits}
                disabled={busy}
                onChange={(value) => set("benefits", value)}
              />
              <ProductTextList
                label="Diferenciais"
                value={draft.differentiators}
                disabled={busy}
                onChange={(value) => set("differentiators", value)}
              />
              <ProductBlocksEditor
                value={draft.blocksJson}
                onChange={(value) => set("blocksJson", value)}
                onPrimaryTextChange={(value) => set("body", value)}
                disabled={busy}
              />
            </fieldset>
          )}
          {activeStage === "especificacoes" && (
            <fieldset>
              <legend>Modelos, variantes e atributos técnicos</legend>
              <ProductModelsEditor
                value={draft.modelsJson}
                onChange={(value) => set("modelsJson", value)}
                disabled={busy}
              />
              <ProductSpecificationsEditor
                value={draft.specificationsJson}
                modelsValue={draft.modelsJson}
                definitions={attributeCatalog?.definitions ?? []}
                units={attributeCatalog?.units ?? []}
                catalogLoading={attributeCatalogLoading}
                catalogError={attributeCatalogError}
                onChange={(value) => set("specificationsJson", value)}
                disabled={busy}
              />
              <ProductIdentifiersEditor
                value={draft.identifiersJson}
                modelsValue={draft.modelsJson}
                onChange={(value) => set("identifiersJson", value)}
                disabled={busy}
              />
            </fieldset>
          )}
          {activeStage === "relacoes" && (
            <fieldset>
              <legend>Mídia, documentos e recomendações relacionadas</legend>
              <ProductMediaEditor
                value={draft.mediaJson}
                onChange={(value) => set("mediaJson", value)}
                disabled={busy || !can("cms:products.edit")}
              />
              <ProductDocumentsEditor
                value={draft.documentsJson}
                onChange={(value) => set("documentsJson", value)}
                disabled={busy || !can("cms:products.edit")}
              />
              <ProductRelationsEditor
                values={{
                  productIds: draft.productIds,
                  applicationIds: draft.applicationIds,
                  sectorIds: draft.sectorIds,
                  serviceIds: draft.serviceIds,
                }}
                options={relationOptions}
                onChange={(key, value) => set(key, value)}
                disabled={busy || Boolean(relationError)}
              />
              {relationError && (
                <p className="admin-notice admin-notice--error" role="alert">
                  {relationError} O rascunho foi preservado; tente recarregar antes de alterar os vínculos.
                </p>
              )}
              <ProductTextList
                label="Sinônimos"
                value={draft.synonyms}
                disabled={busy}
                onChange={(value) => set("synonyms", value)}
              />
              <ProductTextList
                label="Palavras-chave"
                value={draft.keywords}
                disabled={busy}
                onChange={(value) => set("keywords", value)}
              />
              <p className="admin-help">Relação com produto não publicado é negada na publicação.</p>
            </fieldset>
          )}
          {activeStage === "visibilidade" && (
            <fieldset className="admin-visibility-section">
              <legend>O que o site público pode divulgar</legend>
              <p className="admin-help">
                “Somente interno” mantém o valor no CMS e o remove da API pública, da busca, dos filtros e do
                código estruturado. Título e URL são campos essenciais e permanecem públicos enquanto o
                produto estiver publicado.
              </p>
              <div className="admin-visibility-grid">
                {(
                  [
                    ["brand", "Marca comercial"],
                    ["manufacturer", "Fabricante/OEM e site oficial"],
                    ["productLine", "Linha de produto"],
                    ["commercialModel", "Modelo comercial GAIATEC"],
                    ["manufacturerReference", "Referência do fabricante"],
                    ["sku", "SKU/código interno"],
                    ["classification", "Classificação e família"],
                    ["function", "Função"],
                    ["technology", "Tecnologia"],
                    ["specifications", "Especificações técnicas"],
                    ["relations", "Relações com outros conteúdos"],
                    ["documents", "Documentos públicos aprovados"],
                  ] as const
                ).map(([key, label]) => (
                  <label className="admin-visibility-field" key={key}>
                    <span>{label}</span>
                    <select
                      value={draft.fieldVisibility[key]}
                      onChange={(event) => setVisibility(key, event.target.value as "public" | "internal")}
                      disabled={busy}
                    >
                      <option value="public">Público no site</option>
                      <option value="internal">Somente interno</option>
                    </select>
                  </label>
                ))}
              </div>
              <p className="admin-notice">
                Fabricante/OEM, referência do fabricante e SKU começam como “Somente interno”.
              </p>
              <h3>SEO, canonical e redirects</h3>
              {input("Meta title", "seoTitle")}
              {area("Meta description", "seoDescription")}
              {input("Endereço canônico no site", "canonicalPath")}
              <ProductOgImagePicker
                value={draft.ogImageId}
                onChange={(value) => set("ogImageId", value)}
                disabled={busy}
              />
              <ProductRedirectsEditor
                value={draft.redirectsJson}
                onChange={(value) => set("redirectsJson", value)}
                disabled={busy}
              />
              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  checked={draft.indexable}
                  onChange={(event) => set("indexable", event.target.checked)}
                />{" "}
                Indexável — somente após homologação
              </label>
            </fieldset>
          )}
          {activeStage === "visibilidade" && (
            <fieldset>
              <legend>Proveniência e aprovação</legend>
              <label>
                Estado do piloto
                <select value={draft.pilotState} onChange={(event) => set("pilotState", event.target.value)}>
                  <option value="awaiting_owner">Aguardando owner</option>
                  <option value="homologated">Homologado</option>
                  <option value="synthetic_test">Teste sintético</option>
                </select>
              </label>
              <ProductProvenanceEditor
                value={draft.provenanceJson}
                onChange={(value) => set("provenanceJson", value)}
                disabled={busy}
              />
              {input("Owner do portfólio", "portfolioOwner")}
              {input("Revisor técnico", "technicalReviewer")}
              {input("Revisor comercial", "commercialReviewer")}
              {input("Revisor editorial", "editorialReviewer")}
              {input("Homologado em", "homologatedAt", "datetime-local")}
            </fieldset>
          )}
          {activeStage === "visibilidade" && (
            <fieldset>
              <legend>Workflow, preview e histórico imutável</legend>
              {input("Motivo da revisão", "reason")}
              <p>
                Situação: <strong>{workflowLabels[state] ?? "Em preparação"}</strong>
              </p>
              <button type="button" onClick={() => void preview()} disabled={!loaded || busy}>
                Preview fiel
              </button>
              {state === "draft" && can("cms:products.edit") && (
                <button type="button" onClick={() => void run("submit")} disabled={busy}>
                  Enviar para revisão
                </button>
              )}
              {state === "in_review" && can("cms:products.approve") && (
                <button
                  type="button"
                  onClick={() => void run("approve", { revisionId: latestRevision?.id })}
                  disabled={busy}
                >
                  Aprovar revisão
                </button>
              )}
              {state === "approved" && can("cms:products.publish") && (
                <button
                  type="button"
                  onClick={() => void run("publish", { revisionId: latestRevision?.id })}
                  disabled={busy}
                >
                  Publicar
                </button>
              )}
              {state === "published" && (
                <a href={`/produtos/${draft.slug}`} target="_blank" rel="noreferrer">
                  Ver produto público
                </a>
              )}
              <EditorialArchiveAction
                state={state}
                entityLabel="produto"
                allowed={can("cms:products.publish")}
                busy={busy}
                onArchive={() => void run("archive")}
              />
              {loaded?.cms_content_revisions
                .slice()
                .sort((a, b) => b.revision_number - a.revision_number)
                .map((revision, index) => (
                  <details key={revision.id}>
                    <summary>
                      Revisão {revision.revision_number} — {revision.reason}
                    </summary>
                    <p>Criada em {new Date(revision.created_at).toLocaleString("pt-BR")}</p>
                    <button type="button" onClick={() => void preview(revision.id)}>
                      Preview
                    </button>
                    {state === "published" && index > 0 && can("cms:products.publish") && (
                      <button type="button" onClick={() => void run("restore", { revisionId: revision.id })}>
                        Restaurar como nova revisão
                      </button>
                    )}
                  </details>
                ))}
            </fieldset>
          )}
          {activeStage !== "visibilidade" && can("cms:products.edit") && (
            <button className="admin-button" disabled={busy}>
              {loaded ? "Salvar rascunho versionado" : "Criar rascunho manual"}
            </button>
          )}
        </form>
        <aside className="admin-editor-rail" aria-label="Status do cadastro">
          <section>
            <h2>Status do cadastro</h2>
            <span className={`admin-status admin-status--${state}`}>
              {workflowLabels[state] ?? "Em preparação"}
            </span>
            <p>{dirty ? "Há alterações locais não salvas." : "Rascunho sincronizado com o CMS."}</p>
          </section>
          <section>
            <h2>Progresso do contrato</h2>
            <strong className="admin-progress-value">
              {built.jsonErrors.length
                ? "Bloqueado"
                : validation?.success
                  ? "100%"
                  : `${Math.max(0, 100 - contractIssues.length * 8)}%`}
            </strong>
            <p>{contractIssues.length} pendência(s) de contrato</p>
            {contractIssues.slice(0, 6).map((issue) => (
              <button
                key={issue.path.join(".")}
                type="button"
                onClick={() => {
                  const tab = tabForProductPath(issue.path);
                  setActiveTab(tab);
                  window.setTimeout(() => document.getElementById(`product-tab-${tab}`)?.focus(), 0);
                }}
              >
                {describeProductValidationIssue(issue)}
              </button>
            ))}
          </section>
          <section>
            <h2>Visibilidade</h2>
            <p>
              Informações marcadas como internas não aparecem no site público nem nos resultados de busca.
            </p>
          </section>
          <section>
            <h2>Última atualização</h2>
            <p>
              {loaded?.updated_at ? new Date(loaded.updated_at).toLocaleString("pt-BR") : "Ainda não salvo"}
            </p>
          </section>
        </aside>
      </div>
      <div className="admin-help" aria-live="polite">
        <p>
          Completude do contrato:{" "}
          {built.jsonErrors.length
            ? `${built.jsonErrors.length} estrutura(s) precisam de reparo`
            : validation?.success
              ? "100% — pronto para workflow"
              : `${contractIssues.length} pendência(s)`}
          .
        </p>
        {contractIssues.length > 0 && (
          <ul>
            {contractIssues.slice(0, 8).map((issue) => (
              <li key={`${issue.path.join(".")}-${issue.message}`}>
                {describeProductValidationIssue(issue)}
              </li>
            ))}
          </ul>
        )}
      </div>
      <footer className="admin-editor-footer">
        <DraftBackupNotice backup={{ ...backup, recoverable: null }} />
        <div className="admin-actions">
          <button
            type="button"
            className="admin-button admin-button--secondary"
            onClick={() =>
              setActiveTab(tabs[Math.max(0, tabs.findIndex(([key]) => key === activeStage) - 1)][0])
            }
            disabled={activeStage === tabs[0][0]}
          >
            Voltar
          </button>
          <button
            type="button"
            className="admin-button"
            disabled={busy || !can("cms:products.edit")}
            onClick={async () => {
              const saved = await run(loaded ? "save" : "create");
              const index = tabs.findIndex(([key]) => key === activeStage);
              if (saved && loaded && index >= 0 && index < tabs.length - 1) setActiveTab(tabs[index + 1][0]);
            }}
          >
            {activeStage === tabs.at(-1)?.[0] ? "Salvar rascunho" : "Salvar e continuar"}
          </button>
        </div>
      </footer>
    </section>
  );
}
