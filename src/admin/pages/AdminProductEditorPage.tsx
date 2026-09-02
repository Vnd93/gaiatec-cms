import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { supabase } from "@/lib/supabase";
import { CmsProductContentSchema } from "@/shared/contracts/cms-content";
import {
  buildProductPayload,
  createInitialProductDraft,
  describeProductValidationIssue,
  hydrateProductDraft,
  tabForProductPath,
  type GovernedJsonField,
  type ProductEditorDraft,
  type ProductEditorTab,
} from "../product-editor-model";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { UnsavedChangesGuard } from "../components/UnsavedChangesGuard";
import {
  controlledVocabularyCommand,
  editorialCommand,
  issuePreview,
  type ControlledVocabularyList,
  type ControlledVocabularyOption,
} from "../api/cms-api";
import { openExternalAfterAsync } from "../open-external-preview";
import { useDraftBackup } from "../hooks/useDraftBackup";
import { DraftBackupNotice } from "../components/DraftBackupNotice";
import { ProductModelsEditor } from "../components/ProductModelsEditor";

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

const tabs: [ProductEditorTab, string][] = [
  ["identificacao", "Identificação"],
  ["classificacao", "Classificação"],
  ["comercial", "Conteúdo comercial"],
  ["especificacoes", "Técnica e mídia"],
  ["relacoes", "Relações e busca"],
  ["visibilidade", "Visibilidade e SEO"],
  ["governanca", "Governança"],
  ["historico", "Publicação e histórico"],
];

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
  const listId = `controlled-${list?.list_key ?? label.replaceAll(" ", "-")}`;
  return (
    <label>
      {label}
      <input
        role="combobox"
        aria-controls={listId}
        aria-expanded="false"
        list={listId}
        value={value}
        disabled={disabled || !list}
        placeholder={list ? "Digite para pesquisar" : "Lista indisponível"}
        onChange={(event) => {
          const input = event.target.value;
          onChange(
            list?.options.find((option) => option.label === input || option.slug === input),
            input,
          );
        }}
      />
      <datalist id={listId}>
        {list?.options
          .filter((option) => option.active)
          .map((option) => (
            <option key={option.id} value={option.label}>
              {option.slug}
            </option>
          ))}
      </datalist>
    </label>
  );
}

const jsonHelp: Record<GovernedJsonField, string> = {
  modelsJson:
    "Lista validada de modelos, SKU, status e variantes. O modelo comercial e a referência do fabricante do primeiro item são espelhados pelos campos acima.",
  specificationsJson:
    "Lista validada de atributos text, number, boolean, enum ou range, incluindo unidade e flags required/filterable/comparable/searchable.",
  mediaJson:
    "Lista validada de ativos da biblioteca com role, ALT, legenda e ordem. Nenhum caminho de arquivo do frontend é aceito.",
  documentsJson:
    "Lista validada de documentos com tipo, URL ou storage privado, hash, revisão, idioma, visibilidade e direitos.",
  redirectsJson: "Lista validada de sourcePath e statusCode 301/302.",
  blocksJson:
    "Lista validada de blocos rich_text, image, gallery, cta, specifications e related_content. A descrição completa espelha o primeiro rich_text.",
  provenanceJson: "Lista validada de fontes, hashes, autorização, direitos, owners e datas de verificação.",
};

export default function AdminProductEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { session, profile } = useAdminAuth();
  const [draft, setDraft] = useState(createInitialProductDraft);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [activeTab, setActiveTab] = useState<ProductEditorTab>("identificacao");
  const [loading, setLoading] = useState(id !== "novo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [previewFallback, setPreviewFallback] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(draft));
  const [vocabularies, setVocabularies] = useState<ControlledVocabularyList[]>([]);
  const [vocabularyError, setVocabularyError] = useState("");
  const set = (key: keyof ProductEditorDraft, value: string | boolean) =>
    setDraft((current) => ({ ...current, [key]: value }));
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
          const parsed = CmsProductContentSchema.safeParse(item.cms_content_drafts.payload);
          if (!parsed.success) {
            setError(`Rascunho incompatível com o contrato: ${parsed.error.issues[0]?.path.join(".")}.`);
          } else {
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
      if (action === "save" && loaded?.workflow_status === "published") {
        await editorialCommand(session, {
          action: "reopen",
          itemId: loaded.id,
          contentType: null,
          slug: null,
          payload: null,
          expectedLockVersion: null,
          reason: draft.reason,
        });
      }
      const result = await editorialCommand(session, {
        action,
        itemId: loaded?.id ?? null,
        contentType: loaded ? null : "product",
        slug: draft.slug,
        payload: action === "create" || action === "save" ? built.payload : null,
        expectedLockVersion: loaded?.cms_content_drafts.lock_version ?? null,
        reason: draft.reason,
        ...extras,
      });
      setSuccess(
        `Operação concluída: ${result.status}. Código de acompanhamento ${result.correlationId.slice(0, 8)}.`,
      );
      if (action === "create" || action === "save") setSavedSnapshot(currentSnapshot);
      if (["create", "save", "publish"].includes(action)) backup.clear();
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
  const governedArea = (label: string, field: GovernedJsonField) => {
    const jsonError = built.jsonErrors.find((entry) => entry.field === field);
    return (
      <div className="admin-governed-json">
        {area(`${label} — JSON governado`, field, 12)}
        <p
          className={jsonError ? "admin-notice admin-notice--error" : "admin-help"}
          role={jsonError ? "alert" : undefined}
        >
          {jsonError
            ? jsonError.message
            : `${jsonHelp[field]} JSON válido: ${built.counts[field]} registro(s).`}
        </p>
      </div>
    );
  };

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
            disabled={busy || !can("cms:products.edit")}
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
            {draft.title || "Sem título"} · /produtos/{draft.slug}
          </dd>
        </div>
        <div>
          <dt>Situação</dt>
          <dd>{dirty ? "Alterações não salvas" : `Rascunho salvo · estado ${state}`}</dd>
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
      <div className="admin-tabs" role="tablist" aria-label="Seções do produto">
        {tabs.map(([key, label], index) => (
          <button
            key={key}
            id={`product-tab-${key}`}
            type="button"
            role="tab"
            aria-selected={activeTab === key}
            aria-controls="product-tabpanel"
            tabIndex={activeTab === key ? 0 : -1}
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
          aria-labelledby={`product-tab-${activeTab}`}
          className="admin-product-form"
          onSubmit={(event) => {
            event.preventDefault();
            void run(loaded ? "save" : "create");
          }}
        >
          {activeTab === "identificacao" && (
            <fieldset>
              <legend>Marca, fabricante, linha, modelo comercial e referência do fabricante</legend>
              {input("Slug", "slug")}
              {input("Nome comercial do produto", "title")}
              {input("Marca comercial", "brandName")}
              {input("Slug da marca", "brandSlug")}
              {input("Fabricante/OEM nominal", "manufacturerName")}
              {input("Slug do fabricante/OEM", "manufacturerSlug")}
              {input("Site oficial do fabricante/OEM", "manufacturerUrl", "url")}
              {input("Linha", "lineName")}
              {input("Slug da linha", "lineSlug")}
              {input("Modelo comercial GAIATEC", "commercialModel")}
              {input("Referência/modelo do fabricante", "manufacturerReference")}
              <ProductModelsEditor
                value={draft.modelsJson}
                onChange={(value) => set("modelsJson", value)}
                disabled={busy}
              />
              <details className="admin-advanced-panel">
                <summary>Área avançada — estrutura JSON de modelos</summary>
                {governedArea("Modelos e variantes completos", "modelsJson")}
              </details>
            </fieldset>
          )}
          {activeTab === "classificacao" && (
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
          {activeTab === "comercial" && (
            <fieldset>
              <legend>Conteúdo comercial e blocos</legend>
              {area("Resumo", "summary")}
              {area("Descrição curta", "shortDescription")}
              {area("Proposta de valor", "valueProposition")}
              {area("Benefícios — um por linha", "benefits")}
              {area("Diferenciais — um por linha", "differentiators")}
              {area("Descrição completa (obrigatória) — espelha o primeiro bloco rich_text", "body", 7)}
              <details className="admin-advanced-panel">
                <summary>Área avançada — JSON dos blocos</summary>
                {governedArea("Blocos completos", "blocksJson")}
              </details>
            </fieldset>
          )}
          {activeTab === "especificacoes" && (
            <fieldset>
              <legend>Atributos tipados</legend>
              {governedArea("Especificações", "specificationsJson")}
              <details className="admin-advanced-panel">
                <summary>Área avançada — mídia e documentos</summary>
                {governedArea("Mídias", "mediaJson")}
                {governedArea("Documentos", "documentsJson")}
              </details>
            </fieldset>
          )}
          {activeTab === "relacoes" && (
            <fieldset>
              <legend>Relações por UUID novo — uma por linha</legend>
              {area("Produtos relacionados", "productIds")}
              {area("Aplicações", "applicationIds")}
              {area("Setores", "sectorIds")}
              {area("Serviços", "serviceIds")}
              {area("Sinônimos", "synonyms")}
              {area("Palavras-chave", "keywords")}
              <p className="admin-help">Relação com produto não publicado é negada na publicação.</p>
            </fieldset>
          )}
          {activeTab === "visibilidade" && (
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
              {input("Canonical path", "canonicalPath")}
              {input("UUID da imagem Open Graph", "ogImageId")}
              <details className="admin-advanced-panel">
                <summary>Área avançada — redirects</summary>
                {governedArea("Redirects", "redirectsJson")}
              </details>
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
          {activeTab === "governanca" && (
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
              {governedArea("Fontes e direitos", "provenanceJson")}
              {input("Owner do portfólio", "portfolioOwner")}
              {input("Revisor técnico", "technicalReviewer")}
              {input("Revisor comercial", "commercialReviewer")}
              {input("Revisor editorial", "editorialReviewer")}
              {input("Homologado em", "homologatedAt", "datetime-local")}
            </fieldset>
          )}
          {activeTab === "historico" && (
            <fieldset>
              <legend>Workflow, preview e histórico imutável</legend>
              {input("Motivo da revisão", "reason")}
              <p>
                Status: <strong>{state}</strong>
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
          {activeTab !== "historico" && can("cms:products.edit") && (
            <button className="admin-button" disabled={busy}>
              {loaded ? "Salvar rascunho versionado" : "Criar rascunho manual"}
            </button>
          )}
        </form>
        <aside className="admin-editor-rail" aria-label="Status do cadastro">
          <section>
            <h2>Status do cadastro</h2>
            <span className={`admin-status admin-status--${state}`}>{state.replaceAll("_", " ")}</span>
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
                {issue.path.join(".")}
              </button>
            ))}
          </section>
          <section>
            <h2>Visibilidade</h2>
            <p>Campos internos são removidos da API, busca, filtros, SEO, sitemap e JSON-LD.</p>
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
            ? `${built.jsonErrors.length} JSON(s) inválido(s)`
            : validation?.success
              ? "100% — pronto para workflow"
              : `${contractIssues.length} pendência(s)`}
          .
        </p>
        {contractIssues.length > 0 && (
          <ul>
            {contractIssues.slice(0, 8).map((issue) => (
              <li key={`${issue.path.join(".")}-${issue.message}`}>
                {issue.path.join(".")} — {issue.message}
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
              setActiveTab(tabs[Math.max(0, tabs.findIndex(([key]) => key === activeTab) - 1)][0])
            }
            disabled={activeTab === tabs[0][0]}
          >
            Voltar
          </button>
          <button
            type="button"
            className="admin-button"
            disabled={busy || !can("cms:products.edit")}
            onClick={async () => {
              const saved = await run(loaded ? "save" : "create");
              const index = tabs.findIndex(([key]) => key === activeTab);
              if (saved && loaded && index >= 0 && index < tabs.length - 1) setActiveTab(tabs[index + 1][0]);
            }}
          >
            {activeTab === tabs.at(-1)?.[0] ? "Salvar rascunho" : "Salvar e continuar"}
          </button>
        </div>
      </footer>
    </section>
  );
}
