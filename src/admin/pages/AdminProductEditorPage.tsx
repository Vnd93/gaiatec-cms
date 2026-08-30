import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { supabase } from "@/lib/supabase";
import { CmsProductContentSchema } from "@/shared/contracts/cms-content";
import {
  buildProductPayload,
  createInitialProductDraft,
  hydrateProductDraft,
  tabForProductPath,
  type GovernedJsonField,
  type ProductEditorDraft,
  type ProductEditorTab,
} from "../product-editor-model";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { editorialCommand, issuePreview } from "../api/cms-api";

type Loaded = {
  id: string;
  slug: string;
  workflow_status: string;
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
  ["especificacoes", "Especificações"],
  ["midia", "Imagens"],
  ["documentos", "Documentos"],
  ["relacoes", "Relações"],
  ["busca", "Busca"],
  ["visibilidade", "Público ou interno"],
  ["seo", "SEO"],
  ["governanca", "Governança"],
  ["historico", "Histórico/publicação"],
];

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
  const set = (key: keyof ProductEditorDraft, value: string | boolean) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const setVisibility = (key: keyof ProductEditorDraft["fieldVisibility"], value: "public" | "internal") =>
    setDraft((current) => ({
      ...current,
      fieldVisibility: { ...current.fieldVisibility, [key]: value },
    }));
  const can = (permission: string) => profile?.permissions.includes(permission) ?? false;

  useEffect(() => {
    if (!id || id === "novo") return;
    let active = true;
    void supabase
      .from("cms_content_items")
      .select(
        "id,slug,workflow_status,cms_content_drafts(payload,lock_version),cms_content_revisions(id,revision_number,reason,created_at,payload)",
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
            setDraft((current) => hydrateProductDraft(parsed.data, item.slug, current));
          }
        }
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  const built = useMemo(() => buildProductPayload(draft), [draft]);
  const validation = useMemo(
    () => (built.jsonErrors.length ? null : CmsProductContentSchema.safeParse(built.payload)),
    [built],
  );
  const contractIssues = validation && !validation.success ? validation.error.issues : [];
  const latestRevision = loaded?.cms_content_revisions
    .slice()
    .sort((a, b) => b.revision_number - a.revision_number)[0];

  async function run(action: string, extras: Record<string, unknown> = {}) {
    if (!session) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      if (action === "create" || action === "save") {
        if (built.jsonErrors[0]) {
          setActiveTab(built.jsonErrors[0].tab);
          throw new Error(built.jsonErrors[0].message);
        }
        if (!validation?.success) {
          const first = contractIssues[0];
          setActiveTab(tabForProductPath(first.path));
          throw new Error(`Cadastro incompleto: ${first.path.join(".")} — ${first.message}`);
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
      setSuccess(`Operação concluída: ${result.status}. Código ${result.correlationId.slice(0, 8)}.`);
      if (!loaded && result.itemId) navigate(`/admin/produtos/${result.itemId}`, { replace: true });
      else window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha no fluxo do produto.");
    } finally {
      setBusy(false);
    }
  }

  async function preview(revisionId?: string) {
    if (!session || !loaded) return;
    setBusy(true);
    try {
      const result = await issuePreview(session, loaded.id, revisionId);
      window.location.assign(result.path);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Preview indisponível.");
    } finally {
      setBusy(false);
    }
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
      <p className="admin-eyebrow">PRODUTO PILOTO VERTICAL</p>
      <h1>{draft.title || "Novo produto"}</h1>
      <p className="admin-help">
        Fonte editorial única. Todo campo abaixo é validado, persistido e versionado; o frontend é atualizado
        após publicação, sem rebuild.
      </p>
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
            {governedArea("Modelos e variantes completos", "modelsJson")}
          </fieldset>
        )}
        {activeTab === "classificacao" && (
          <fieldset>
            <legend>Taxonomia, função e tecnologia</legend>
            {input("Segmento", "segment")}
            {input("Categoria", "category")}
            {input("Subcategoria", "subcategory")}
            {input("Família", "family")}
            {input("Função", "functionText")}
            {input("Tecnologia", "technology")}
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
            {area("Descrição completa — espelha o primeiro bloco rich_text", "body", 7)}
            {governedArea("Blocos completos", "blocksJson")}
          </fieldset>
        )}
        {activeTab === "especificacoes" && (
          <fieldset>
            <legend>Atributos tipados</legend>
            {governedArea("Especificações", "specificationsJson")}
          </fieldset>
        )}
        {activeTab === "midia" && (
          <fieldset>
            <legend>Imagens da biblioteca do CMS</legend>
            {governedArea("Mídias", "mediaJson")}
          </fieldset>
        )}
        {activeTab === "documentos" && (
          <fieldset>
            <legend>Documentos oficiais e privados</legend>
            {governedArea("Documentos", "documentsJson")}
          </fieldset>
        )}
        {activeTab === "relacoes" && (
          <fieldset>
            <legend>Relações por UUID novo — uma por linha</legend>
            {area("Produtos relacionados", "productIds")}
            {area("Aplicações", "applicationIds")}
            {area("Setores", "sectorIds")}
            {area("Serviços", "serviceIds")}
            <p className="admin-help">Relação com produto não publicado é negada na publicação.</p>
          </fieldset>
        )}
        {activeTab === "busca" && (
          <fieldset>
            <legend>Busca e sinônimos governados</legend>
            {area("Sinônimos", "synonyms")}
            {area("Palavras-chave", "keywords")}
          </fieldset>
        )}
        {activeTab === "visibilidade" && (
          <fieldset className="admin-visibility-section">
            <legend>O que o site público pode divulgar</legend>
            <p className="admin-help">
              “Somente interno” mantém o valor no CMS e o remove da API pública, da busca, dos filtros e do
              código estruturado. Título e URL são campos essenciais e permanecem públicos enquanto o produto
              estiver publicado.
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
          </fieldset>
        )}
        {activeTab === "seo" && (
          <fieldset>
            <legend>SEO, canonical e redirects</legend>
            {input("Meta title", "seoTitle")}
            {area("Meta description", "seoDescription")}
            {input("Canonical path", "canonicalPath")}
            {input("UUID da imagem Open Graph", "ogImageId")}
            {governedArea("Redirects", "redirectsJson")}
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
    </section>
  );
}
