import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { supabase } from "@/lib/supabase";
import { CmsProductContentSchema } from "@/shared/contracts/cms-content";
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
type Tab =
  | "identificacao"
  | "classificacao"
  | "comercial"
  | "especificacoes"
  | "midia"
  | "documentos"
  | "relacoes"
  | "busca"
  | "seo"
  | "governanca"
  | "historico";
const tabs: [Tab, string][] = [
  ["identificacao", "Identificação"],
  ["classificacao", "Classificação"],
  ["comercial", "Conteúdo comercial"],
  ["especificacoes", "Especificações"],
  ["midia", "Imagens"],
  ["documentos", "Documentos"],
  ["relacoes", "Relações"],
  ["busca", "Busca"],
  ["seo", "SEO"],
  ["governanca", "Governança"],
  ["historico", "Histórico/publicação"],
];
const splitLines = (value: string) =>
  value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
const uuidList = (value: string) => splitLines(value);
const parseJsonArray = (value: string): unknown[] => {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [{ invalidJsonArray: true }];
  } catch {
    return [{ invalidJson: true }];
  }
};

function initialDraft() {
  return {
    slug: `produto-novo-${Date.now()}`,
    title: "",
    summary: "",
    manufacturerName: "",
    manufacturerSlug: "",
    manufacturerUrl: "",
    lineName: "",
    lineSlug: "",
    segment: "",
    category: "",
    subcategory: "",
    family: "",
    functionText: "",
    technology: "",
    modelId: crypto.randomUUID(),
    model: "",
    sku: "",
    variantId: crypto.randomUUID(),
    variantName: "",
    variantCode: "",
    shortDescription: "",
    valueProposition: "",
    benefits: "",
    differentiators: "",
    body: "",
    richBlockId: crypto.randomUUID(),
    specificationBlockId: crypto.randomUUID(),
    imageBlockId: crypto.randomUUID(),
    attributeId: crypto.randomUUID(),
    attributeKey: "",
    attributeLabel: "",
    attributeValue: "",
    attributeUnit: "",
    additionalSpecificationsJson: "[]",
    mediaId: "",
    mediaAlt: "",
    mediaCaption: "",
    additionalMediaJson: "[]",
    documentId: crypto.randomUUID(),
    documentKind: "datasheet",
    documentTitle: "",
    documentUrl: "",
    documentStoragePath: "",
    documentHash: "",
    documentRevision: "",
    documentLanguage: "pt-BR",
    documentVisibility: "public",
    additionalDocumentsJson: "[]",
    productIds: "",
    applicationIds: "",
    sectorIds: "",
    serviceIds: "",
    synonyms: "",
    keywords: "",
    redirectPaths: "",
    seoTitle: "",
    seoDescription: "",
    canonicalPath: "",
    indexable: false,
    pilotState: "awaiting_owner",
    sourceKind: "official_manufacturer",
    sourceUrl: "",
    sourcePath: "",
    fileModifiedAt: "",
    sourceVersion: "",
    sourceDate: "",
    sourceHash: "",
    authorizationReference: "",
    authorizationDate: "",
    rightsScope: "",
    additionalProvenanceJson: "[]",
    additionalBlocksJson: "[]",
    rightsConfirmed: false,
    commercialOwner: "",
    technicalOwner: "",
    verifiedAt: "",
    portfolioOwner: "",
    technicalReviewer: "",
    commercialReviewer: "",
    editorialReviewer: "",
    homologatedAt: "",
    reason: "Cadastro manual do produto piloto",
  };
}

export default function AdminProductEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { session, profile } = useAdminAuth();
  const [draft, setDraft] = useState(initialDraft);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("identificacao");
  const [loading, setLoading] = useState(id !== "novo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const set = (key: keyof ReturnType<typeof initialDraft>, value: string | boolean) =>
    setDraft((current) => ({ ...current, [key]: value }));
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
          const p = item.cms_content_drafts.payload as any;
          setLoaded(item);
          setDraft((current) => ({
            ...current,
            slug: item.slug,
            title: p.title ?? "",
            summary: p.summary ?? "",
            manufacturerName: p.manufacturer?.name ?? "",
            manufacturerSlug: p.manufacturer?.slug ?? "",
            manufacturerUrl: p.manufacturer?.officialUrl ?? "",
            lineName: p.productLine?.name ?? "",
            lineSlug: p.productLine?.slug ?? "",
            segment: p.classification?.segment ?? "",
            category: p.classification?.category ?? "",
            subcategory: p.classification?.subcategory ?? "",
            family: p.classification?.family ?? "",
            functionText: p.function ?? "",
            technology: p.technology ?? "",
            modelId: p.models?.[0]?.id ?? current.modelId,
            model: p.models?.[0]?.model ?? "",
            sku: p.models?.[0]?.sku ?? "",
            variantId: p.models?.[0]?.variants?.[0]?.id ?? current.variantId,
            variantName: p.models?.[0]?.variants?.[0]?.name ?? "",
            variantCode: p.models?.[0]?.variants?.[0]?.code ?? "",
            shortDescription: p.commercial?.shortDescription ?? "",
            valueProposition: p.commercial?.valueProposition ?? "",
            benefits: (p.commercial?.benefits ?? []).join("\n"),
            differentiators: (p.commercial?.differentiators ?? []).join("\n"),
            body: p.blocks?.find((block: any) => block.type === "rich_text")?.data?.text ?? "",
            richBlockId:
              p.blocks?.find((block: any) => block.type === "rich_text")?.id ?? current.richBlockId,
            specificationBlockId:
              p.blocks?.find((block: any) => block.type === "specifications")?.id ??
              current.specificationBlockId,
            imageBlockId: p.blocks?.find((block: any) => block.type === "image")?.id ?? current.imageBlockId,
            attributeId: p.specifications?.[0]?.id ?? current.attributeId,
            attributeKey: p.specifications?.[0]?.key ?? "",
            attributeLabel: p.specifications?.[0]?.label ?? "",
            attributeValue: String(p.specifications?.[0]?.value ?? ""),
            attributeUnit: p.specifications?.[0]?.unit ?? "",
            additionalSpecificationsJson: JSON.stringify(p.specifications?.slice(1) ?? [], null, 2),
            mediaId: p.media?.[0]?.assetId ?? "",
            mediaAlt: p.media?.[0]?.alt ?? "",
            mediaCaption: p.media?.[0]?.caption ?? "",
            additionalMediaJson: JSON.stringify(p.media?.slice(1) ?? [], null, 2),
            documentId: p.documents?.[0]?.id ?? current.documentId,
            documentKind: p.documents?.[0]?.kind ?? "datasheet",
            documentTitle: p.documents?.[0]?.title ?? "",
            documentUrl: p.documents?.[0]?.officialUrl ?? "",
            documentStoragePath: p.documents?.[0]?.storagePath ?? "",
            documentHash: p.documents?.[0]?.sha256 ?? "",
            documentRevision: p.documents?.[0]?.revision ?? "",
            documentLanguage: p.documents?.[0]?.language ?? "pt-BR",
            documentVisibility: p.documents?.[0]?.visibility ?? "public",
            additionalDocumentsJson: JSON.stringify(p.documents?.slice(1) ?? [], null, 2),
            productIds: (p.relations?.productIds ?? []).join("\n"),
            applicationIds: (p.relations?.applicationIds ?? []).join("\n"),
            sectorIds: (p.relations?.sectorIds ?? []).join("\n"),
            serviceIds: (p.relations?.serviceIds ?? []).join("\n"),
            synonyms: (p.search?.synonyms ?? []).join("\n"),
            keywords: (p.search?.keywords ?? []).join("\n"),
            redirectPaths: (p.redirects ?? []).map((entry: any) => entry.sourcePath).join("\n"),
            seoTitle: p.seo?.title ?? "",
            seoDescription: p.seo?.description ?? "",
            canonicalPath: p.seo?.canonicalPath ?? "",
            indexable: p.seo?.indexable ?? false,
            pilotState: p.pilotState ?? "awaiting_owner",
            sourceKind: p.provenance?.[0]?.sourceKind ?? "official_manufacturer",
            sourceUrl: p.provenance?.[0]?.sourceUrl ?? "",
            sourcePath: p.provenance?.[0]?.sourcePath ?? "",
            fileModifiedAt: p.provenance?.[0]?.fileModifiedAt?.slice(0, 16) ?? "",
            sourceVersion: p.provenance?.[0]?.documentVersion ?? "",
            sourceDate: p.provenance?.[0]?.documentDate ?? "",
            sourceHash: p.provenance?.[0]?.sourceSha256 ?? "",
            authorizationReference: p.provenance?.[0]?.authorizationReference ?? "",
            authorizationDate: p.provenance?.[0]?.authorizationDate ?? "",
            rightsScope: p.provenance?.[0]?.rightsScope ?? "",
            additionalProvenanceJson: JSON.stringify(p.provenance?.slice(1) ?? [], null, 2),
            additionalBlocksJson: JSON.stringify(
              (p.blocks ?? []).filter(
                (block: any) => !["rich_text", "specifications", "image"].includes(block.type),
              ),
              null,
              2,
            ),
            rightsConfirmed: p.provenance?.[0]?.rightsConfirmed ?? false,
            commercialOwner: p.provenance?.[0]?.commercialOwner ?? "",
            technicalOwner: p.provenance?.[0]?.technicalOwner ?? "",
            verifiedAt: p.provenance?.[0]?.verifiedAt?.slice(0, 16) ?? "",
            portfolioOwner: p.approval?.portfolioOwner ?? "",
            technicalReviewer: p.approval?.technicalReviewer ?? "",
            commercialReviewer: p.approval?.commercialReviewer ?? "",
            editorialReviewer: p.approval?.editorialReviewer ?? "",
            homologatedAt: p.approval?.homologatedAt?.slice(0, 16) ?? "",
          }));
        }
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  const payload = useMemo(
    () => ({
      schemaVersion: 1 as const,
      consumerId: "cms.catalog-product.v1" as const,
      contentType: "product" as const,
      pilotState: draft.pilotState,
      title: draft.title,
      summary: draft.summary || undefined,
      manufacturer: {
        name: draft.manufacturerName,
        slug: draft.manufacturerSlug,
        ...(draft.manufacturerUrl ? { officialUrl: draft.manufacturerUrl } : {}),
      },
      productLine: { name: draft.lineName, slug: draft.lineSlug },
      classification: {
        segment: draft.segment,
        category: draft.category,
        ...(draft.subcategory ? { subcategory: draft.subcategory } : {}),
        family: draft.family,
      },
      commercial: {
        shortDescription: draft.shortDescription,
        valueProposition: draft.valueProposition,
        benefits: splitLines(draft.benefits),
        differentiators: splitLines(draft.differentiators),
      },
      function: draft.functionText,
      technology: draft.technology,
      models: [
        {
          id: draft.modelId,
          model: draft.model,
          sku: draft.sku,
          status: "active" as const,
          variants: [{ id: draft.variantId, name: draft.variantName, code: draft.variantCode, order: 0 }],
        },
      ],
      specifications: [
        {
          id: draft.attributeId,
          key: draft.attributeKey,
          label: draft.attributeLabel,
          type: "text" as const,
          value: draft.attributeValue,
          ...(draft.attributeUnit ? { unit: draft.attributeUnit } : {}),
          required: true,
          filterable: true,
          comparable: true,
          searchable: true,
        },
        ...parseJsonArray(draft.additionalSpecificationsJson),
      ],
      media: [
        ...(draft.mediaId
          ? [
              {
                assetId: draft.mediaId,
                role: "primary" as const,
                alt: draft.mediaAlt,
                ...(draft.mediaCaption ? { caption: draft.mediaCaption } : {}),
                order: 0,
              },
            ]
          : []),
        ...parseJsonArray(draft.additionalMediaJson),
      ],
      documents: [
        ...(draft.documentTitle
          ? [
              {
                id: draft.documentId,
                kind: draft.documentKind,
                title: draft.documentTitle,
                ...(draft.documentUrl ? { officialUrl: draft.documentUrl } : {}),
                ...(draft.documentStoragePath ? { storagePath: draft.documentStoragePath } : {}),
                sha256: draft.documentHash,
                revision: draft.documentRevision,
                language: draft.documentLanguage,
                visibility: draft.documentVisibility,
                rightsConfirmed: draft.rightsConfirmed,
              },
            ]
          : []),
        ...parseJsonArray(draft.additionalDocumentsJson),
      ],
      relations: {
        productIds: uuidList(draft.productIds),
        applicationIds: uuidList(draft.applicationIds),
        sectorIds: uuidList(draft.sectorIds),
        serviceIds: uuidList(draft.serviceIds),
      },
      search: { synonyms: splitLines(draft.synonyms), keywords: splitLines(draft.keywords) },
      redirects: splitLines(draft.redirectPaths).map((sourcePath) => ({
        sourcePath,
        statusCode: "301" as const,
      })),
      blocks: [
        { id: draft.richBlockId, type: "rich_text" as const, data: { text: draft.body } },
        {
          id: draft.specificationBlockId,
          type: "specifications" as const,
          data: { source: "typed-attributes" },
        },
        ...(draft.mediaId
          ? [
              {
                id: draft.imageBlockId,
                type: "image" as const,
                data: { assetId: draft.mediaId, alt: draft.mediaAlt, caption: draft.mediaCaption },
              },
            ]
          : []),
        ...parseJsonArray(draft.additionalBlocksJson),
      ],
      seo: {
        title: draft.seoTitle,
        description: draft.seoDescription,
        canonicalPath: draft.canonicalPath || `/produtos/${draft.slug}`,
        indexable: draft.indexable,
      },
      provenance: [
        {
          sourceKind: draft.sourceKind,
          ...(draft.sourceUrl ? { sourceUrl: draft.sourceUrl } : {}),
          ...(draft.sourcePath ? { sourcePath: draft.sourcePath } : {}),
          ...(draft.fileModifiedAt ? { fileModifiedAt: new Date(draft.fileModifiedAt).toISOString() } : {}),
          ...(draft.sourceVersion ? { documentVersion: draft.sourceVersion } : {}),
          ...(draft.sourceDate ? { documentDate: draft.sourceDate } : {}),
          ...(draft.sourceHash ? { sourceSha256: draft.sourceHash } : {}),
          ...(draft.authorizationReference ? { authorizationReference: draft.authorizationReference } : {}),
          ...(draft.authorizationDate ? { authorizationDate: draft.authorizationDate } : {}),
          ...(draft.rightsScope ? { rightsScope: draft.rightsScope } : {}),
          rightsConfirmed: draft.rightsConfirmed,
          commercialOwner: draft.commercialOwner,
          technicalOwner: draft.technicalOwner,
          verifiedAt: draft.verifiedAt ? new Date(draft.verifiedAt).toISOString() : "",
        },
        ...parseJsonArray(draft.additionalProvenanceJson),
      ],
      approval: {
        portfolioOwner: draft.portfolioOwner,
        technicalReviewer: draft.technicalReviewer,
        commercialReviewer: draft.commercialReviewer,
        editorialReviewer: draft.editorialReviewer,
        ...(draft.homologatedAt ? { homologatedAt: new Date(draft.homologatedAt).toISOString() } : {}),
      },
    }),
    [draft],
  );
  const validation = CmsProductContentSchema.safeParse(payload);

  async function run(action: string, extras: Record<string, unknown> = {}) {
    if (!session) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      if ((action === "create" || action === "save") && !validation.success) {
        const first = validation.error.issues[0];
        setActiveTab(
          first.path[0] === "seo"
            ? "seo"
            : first.path[0] === "provenance" || first.path[0] === "approval"
              ? "governanca"
              : "identificacao",
        );
        throw new Error(`Cadastro incompleto: ${first.path.join(".")} — ${first.message}`);
      }
      const result = await editorialCommand(session, {
        action,
        itemId: loaded?.id ?? null,
        contentType: loaded ? null : "product",
        slug: draft.slug,
        payload: action === "create" || action === "save" ? payload : null,
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
  const input = (label: string, key: keyof ReturnType<typeof initialDraft>, type = "text") => (
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
  const area = (label: string, key: keyof ReturnType<typeof initialDraft>) => (
    <label>
      {label}
      <textarea
        rows={4}
        value={String(draft[key])}
        onChange={(event) => set(key, event.target.value)}
        disabled={busy}
      />
    </label>
  );
  return (
    <section>
      <p className="admin-eyebrow">PRODUTO PILOTO VERTICAL</p>
      <h1>{draft.title || "Novo produto"}</h1>
      <p className="admin-help">
        Cadastro manual clean-room. Salvar exige proveniência verificável; indexação exige homologação do
        owner.
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
        {tabs.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={activeTab === key} onClick={() => setActiveTab(key)}>
            {label}
          </button>
        ))}
      </div>
      <form
        className="admin-product-form"
        onSubmit={(event) => {
          event.preventDefault();
          void run(loaded ? "save" : "create");
        }}
      >
        {activeTab === "identificacao" && (
          <fieldset>
            <legend>Identificação, fabricante, linha, modelo e variante</legend>
            {input("Slug", "slug")}
            {input("Nome comercial", "title")}
            {input("Fabricante", "manufacturerName")}
            {input("Slug do fabricante", "manufacturerSlug")}
            {input("Site oficial do fabricante", "manufacturerUrl", "url")}
            {input("Linha", "lineName")}
            {input("Slug da linha", "lineSlug")}
            {input("Modelo", "model")}
            {input("SKU/código novo", "sku")}
            {input("Variante", "variantName")}
            {input("Código da variante", "variantCode")}
          </fieldset>
        )}
        {activeTab === "classificacao" && (
          <fieldset>
            <legend>Taxonomia nova</legend>
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
            <legend>Conteúdo comercial novo</legend>
            {area("Resumo", "summary")}
            {area("Descrição curta", "shortDescription")}
            {area("Proposta de valor", "valueProposition")}
            {area("Benefícios — um por linha", "benefits")}
            {area("Diferenciais — um por linha", "differentiators")}
            {area("Descrição completa", "body")}
          </fieldset>
        )}
        {activeTab === "especificacoes" && (
          <fieldset>
            <legend>Atributo tipado inicial</legend>
            {input("Chave técnica", "attributeKey")}
            {input("Rótulo", "attributeLabel")}
            {input("Valor", "attributeValue")}
            {input("Unidade", "attributeUnit")}
            {area("Atributos adicionais — JSON governado", "additionalSpecificationsJson")}
            <p className="admin-help">
              Este atributo é obrigatório, filtrável, comparável e pesquisável. O contrato suporta texto,
              número, booleano, enum e faixa.
            </p>
          </fieldset>
        )}
        {activeTab === "midia" && (
          <fieldset>
            <legend>Mídia nova autorizada</legend>
            {input("UUID do ativo da biblioteca", "mediaId")}
            {input("ALT", "mediaAlt")}
            {area("Legenda", "mediaCaption")}
            {area("Mídias adicionais — JSON governado", "additionalMediaJson")}
            <p className="admin-help">
              Use somente ativo enviado à biblioteca vazia do CMS, nunca arquivo do site atual.
            </p>
          </fieldset>
        )}
        {activeTab === "documentos" && (
          <fieldset>
            <legend>Documento oficial</legend>
            <label>
              Tipo
              <select
                value={draft.documentKind}
                onChange={(event) => set("documentKind", event.target.value)}
              >
                <option value="datasheet">Datasheet</option>
                <option value="manual">Manual</option>
                <option value="certificate">Certificado</option>
                <option value="drawing">Desenho</option>
                <option value="other">Outro</option>
              </select>
            </label>
            {input("Título", "documentTitle")}
            {input("URL oficial", "documentUrl", "url")}
            {input("Caminho no storage privado", "documentStoragePath")}
            {input("SHA-256", "documentHash")}
            {input("Revisão", "documentRevision")}
            {input("Idioma", "documentLanguage")}
            {area("Documentos adicionais — JSON governado", "additionalDocumentsJson")}
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
        {activeTab === "seo" && (
          <fieldset>
            <legend>SEO, canonical e redirects</legend>
            {input("Meta title", "seoTitle")}
            {area("Meta description", "seoDescription")}
            {input("Canonical path", "canonicalPath")}
            {area("Redirects de origem — um path por linha", "redirectPaths")}
            <label className="admin-checkbox">
              <input
                type="checkbox"
                checked={draft.indexable}
                onChange={(event) => set("indexable", event.target.checked)}
              />{" "}
              Indexável — disponível somente após homologação
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
            <label>
              Tipo da fonte
              <select value={draft.sourceKind} onChange={(event) => set("sourceKind", event.target.value)}>
                <option value="official_manufacturer">Fabricante oficial</option>
                <option value="official_company">GAIATEC oficial</option>
                <option value="owner_authored">Produzida pelo owner</option>
              </select>
            </label>
            {input("URL da fonte", "sourceUrl", "url")}
            {input("Caminho original autorizado", "sourcePath")}
            {input("Arquivo modificado em", "fileModifiedAt", "datetime-local")}
            {input("Versão", "sourceVersion")}
            {input("Data da fonte", "sourceDate", "date")}
            {input("SHA-256 da fonte", "sourceHash")}
            {input("Referência da autorização", "authorizationReference")}
            {input("Data da autorização", "authorizationDate", "date")}
            {area("Escopo dos direitos de uso", "rightsScope")}
            {area("Fontes adicionais — JSON governado", "additionalProvenanceJson")}
            {area("Blocos adicionais — JSON governado", "additionalBlocksJson")}
            {input("Owner comercial", "commercialOwner")}
            {input("Owner técnico", "technicalOwner")}
            {input("Verificado em", "verifiedAt", "datetime-local")}
            <label className="admin-checkbox">
              <input
                type="checkbox"
                checked={draft.rightsConfirmed}
                onChange={(event) => set("rightsConfirmed", event.target.checked)}
              />{" "}
              Direitos de uso confirmados
            </label>
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
                onClick={() => void run("approve", { revisionId: loaded?.cms_content_revisions.at(-1)?.id })}
                disabled={busy}
              >
                Aprovar revisão
              </button>
            )}
            {state === "approved" && can("cms:products.publish") && (
              <button
                type="button"
                onClick={() => void run("publish", { revisionId: loaded?.cms_content_revisions.at(-1)?.id })}
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
      <p className="admin-help">
        Completude do contrato:{" "}
        {validation.success
          ? "100% — pronto para workflow"
          : `${validation.error.issues.length} pendência(s)`}
        .
      </p>
    </section>
  );
}
