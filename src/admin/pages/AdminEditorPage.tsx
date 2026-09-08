import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { supabase } from "@/lib/supabase";
import { CmsContentPayloadSchema } from "@/shared/contracts/cms-content";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { UnsavedChangesGuard } from "../components/UnsavedChangesGuard";
import { editorialCommand, issuePreview } from "../api/cms-api";
import { openExternalAfterAsync } from "../open-external-preview";
import { useDraftBackup } from "../hooks/useDraftBackup";
import { DraftBackupNotice } from "../components/DraftBackupNotice";
import { DamPicker, type DamPickerSelection } from "../components/DamPicker";
import { isEv2FeatureEnabled } from "../ev2-runtime";
import { EditorialArchiveAction } from "../components/EditorialArchiveAction";
import { urlSegmentFromText } from "../url-segment";
import { operatorErrorMessage } from "../operator-error-message";
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
  cms_content_revisions: {
    id: string;
    revision_number: number;
    reason: string;
    created_at: string;
  }[];
};
type RelationKind = "postIds" | "productIds" | "serviceIds" | "applicationIds" | "solutionIds";
type RelationOption = { item_id: string; content_type: string; payload: { title?: string }; slug: string };
type MediaOption = { id: string; original_filename: string; alt_text: string };
const emptyRelations: Record<RelationKind, string[]> = {
  postIds: [],
  productIds: [],
  serviceIds: [],
  applicationIds: [],
  solutionIds: [],
};
const relationTypeLabels: Record<string, string> = {
  product: "Produto",
  service: "Serviço",
  industry: "Indústria",
  application: "Aplicação",
  solution: "Solução",
  page: "Página",
  post: "Artigo",
};
const editorialStatusLabels: Record<string, string> = {
  new: "Novo",
  draft: "Rascunho",
  in_review: "Em revisão",
  approved: "Aprovado",
  scheduled: "Agendado",
  published: "Publicado",
  archived: "Arquivado",
  trashed: "Na lixeira",
};

function editorialStatusLabel(status: string): string {
  return editorialStatusLabels[status] ?? "Situação indisponível";
}

function normalizeTagNames(value: unknown): string[] {
  const names = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  return names
    .filter((name): name is string => typeof name === "string")
    .map((name) => name.trim())
    .filter((name) => {
      const key = name.toLocaleLowerCase("pt-BR");
      if (!name || name.length > 80 || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);
}
export default function AdminEditorPage() {
  const { id } = useParams(),
    navigate = useNavigate(),
    { session, profile, user } = useAdminAuth();
  const damCandidateEnabled = isEv2FeatureEnabled(profile, "ev2.dam");
  const [loaded, setLoaded] = useState<Loaded | null>(null),
    [loading, setLoading] = useState(id !== "novo"),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [previewFallback, setPreviewFallback] = useState(""),
    [refreshToken, setRefreshToken] = useState(0),
    [savedSnapshot, setSavedSnapshot] = useState<string | null>(null),
    [slug, setSlug] = useState("");
  const [title, setTitle] = useState(""),
    [summary, setSummary] = useState(""),
    [body, setBody] = useState(""),
    [authorName, setAuthorName] = useState(""),
    [authorSlug, setAuthorSlug] = useState(""),
    [authorId, setAuthorId] = useState<string>(() => crypto.randomUUID()),
    [categoryName, setCategoryName] = useState(""),
    [categorySlug, setCategorySlug] = useState(""),
    [categoryId, setCategoryId] = useState<string>(() => crypto.randomUUID()),
    [tags, setTags] = useState<string[]>([]),
    [tagDraft, setTagDraft] = useState(""),
    [tagIds, setTagIds] = useState<string[]>(() => Array.from({ length: 20 }, () => crypto.randomUUID())),
    [relationIds, setRelationIds] = useState<Record<RelationKind, string[]>>(emptyRelations),
    [relationOptions, setRelationOptions] = useState<RelationOption[]>([]),
    [mediaOptions, setMediaOptions] = useState<MediaOption[]>([]),
    [imageId, setImageId] = useState(""),
    [imageAlt, setImageAlt] = useState(""),
    [galleryIds, setGalleryIds] = useState<string[]>([]),
    [ctaLabel, setCtaLabel] = useState(""),
    [ctaHref, setCtaHref] = useState("/contato"),
    [blockIds] = useState(() => ({
      rich: crypto.randomUUID(),
      image: crypto.randomUUID(),
      gallery: crypto.randomUUID(),
      cta: crypto.randomUUID(),
      related: crypto.randomUUID(),
    })),
    [readingMinutes, setReadingMinutes] = useState(3),
    [publishAfter, setPublishAfter] = useState(""),
    [seoTitle, setSeoTitle] = useState(""),
    [seoDescription, setSeoDescription] = useState(""),
    [seoIndexable, setSeoIndexable] = useState(false),
    [authorizationReference, setAuthorizationReference] = useState(""),
    [authorizationDate, setAuthorizationDate] = useState(""),
    [rightsScope, setRightsScope] = useState(""),
    [rightsConfirmed, setRightsConfirmed] = useState(false),
    [commercialOwner, setCommercialOwner] = useState(""),
    [technicalOwner, setTechnicalOwner] = useState(""),
    [verifiedAt, setVerifiedAt] = useState(""),
    [reason, setReason] = useState("Criação ou atualização editorial");
  useEffect(() => {
    let active = true;
    void Promise.all([
      supabase
        .from("cms_published_projection")
        .select("item_id,content_type,slug,payload")
        .in("content_type", ["post", "product", "service", "application", "solution"])
        .order("published_at", { ascending: false }),
      supabase
        .from("cms_media_assets")
        .select("id,original_filename,alt_text")
        .eq("processing_status", "ready")
        .order("created_at", { ascending: false }),
    ]).then(([relationsResult, mediaResult]) => {
      if (!active) return;
      setRelationOptions((relationsResult.data ?? []) as unknown as RelationOption[]);
      setMediaOptions((mediaResult.data ?? []) as MediaOption[]);
    });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!id || id === "novo") return;
    let active = true;
    setSavedSnapshot(null);
    void supabase
      .from("cms_content_items")
      .select(
        "id,slug,workflow_status,cms_content_drafts(payload,lock_version),cms_content_revisions(id,revision_number,reason,created_at)",
      )
      .eq("id", id)
      .single()
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) setError("Conteúdo indisponível ou sem permissão.");
        else {
          const item = data as unknown as Loaded;
          setLoaded(item);
          setSlug(item.slug);
          const payload = item.cms_content_drafts.payload as {
            title?: string;
            summary?: string;
            blocks?: { data?: { text?: string } }[];
          };
          setTitle(payload.title ?? "");
          setSummary(payload.summary ?? "");
          setBody(payload.blocks?.[0]?.data?.text ?? "");
          const structured = item.cms_content_drafts.payload as {
            author?: { id?: string; name?: string; slug?: string };
            category?: { id?: string; name?: string; slug?: string };
            tags?: { id?: string; name?: string }[];
            readingMinutes?: number;
            publishAfter?: string;
            relations?: Record<RelationKind, string[]>;
            seo?: { title?: string; description?: string; indexable?: boolean };
            provenance?: Array<{
              authorizationReference?: string;
              authorizationDate?: string;
              rightsScope?: string;
              rightsConfirmed?: boolean;
              commercialOwner?: string;
              technicalOwner?: string;
              verifiedAt?: string;
            }>;
            blocks?: Array<{
              type?: string;
              data?: { assetId?: string; assetIds?: string[]; alt?: string; label?: string; href?: string };
            }>;
          };
          const loadedAuthorName = structured.author?.name ?? "";
          setAuthorName(loadedAuthorName);
          setAuthorSlug(structured.author?.slug ?? urlSegmentFromText(loadedAuthorName));
          if (structured.author?.id) setAuthorId(structured.author.id);
          const loadedCategoryName = structured.category?.name ?? "";
          setCategoryName(loadedCategoryName);
          setCategorySlug(structured.category?.slug ?? urlSegmentFromText(loadedCategoryName));
          if (structured.category?.id) setCategoryId(structured.category.id);
          setTags(normalizeTagNames((structured.tags ?? []).map((tag) => tag.name)));
          setTagIds(
            [
              ...(structured.tags ?? [])
                .map((tag) => tag.id)
                .filter((value): value is string => Boolean(value)),
              ...Array.from({ length: 20 }, () => crypto.randomUUID()),
            ].slice(0, 20),
          );
          setReadingMinutes(structured.readingMinutes ?? 3);
          setPublishAfter(structured.publishAfter?.slice(0, 16) ?? "");
          setSeoTitle(structured.seo?.title ?? "");
          setSeoDescription(structured.seo?.description ?? "");
          setSeoIndexable(structured.seo?.indexable === true);
          const provenance = structured.provenance?.[0];
          setAuthorizationReference(provenance?.authorizationReference ?? "");
          setAuthorizationDate(provenance?.authorizationDate ?? "");
          setRightsScope(provenance?.rightsScope ?? "");
          setRightsConfirmed(provenance?.rightsConfirmed === true);
          setCommercialOwner(provenance?.commercialOwner ?? "");
          setTechnicalOwner(provenance?.technicalOwner ?? "");
          setVerifiedAt(provenance?.verifiedAt ?? "");
          setRelationIds({ ...emptyRelations, ...(structured.relations ?? {}) });
          const image = structured.blocks?.find((block) => block.type === "image")?.data;
          const gallery = structured.blocks?.find((block) => block.type === "gallery")?.data;
          const cta = structured.blocks?.find((block) => block.type === "cta")?.data;
          setImageId(image?.assetId ?? "");
          setImageAlt(image?.alt ?? "");
          setGalleryIds(gallery?.assetIds ?? []);
          setCtaLabel(cta?.label ?? "");
          setCtaHref(cta?.href ?? "/contato");
        }
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, refreshToken]);
  const can = (permission: string) => profile?.permissions.includes(permission) ?? false;
  const relationKindFor = (contentType: string): RelationKind =>
    contentType === "post" ? "postIds" : (`${contentType}Ids` as RelationKind);
  const toggleRelation = (kind: RelationKind, itemId: string) =>
    setRelationIds((current) => ({
      ...current,
      [kind]: current[kind].includes(itemId)
        ? current[kind].filter((id) => id !== itemId)
        : [...current[kind], itemId],
    }));
  const payload = useMemo(
    () => ({
      schemaVersion: 1 as const,
      consumerId: "cms.blog-article.v1" as const,
      contentType: "post" as const,
      title,
      summary,
      excerpt: summary,
      authorName,
      author: { id: authorId, name: authorName, slug: authorSlug },
      category: { id: categoryId, name: categoryName, slug: categorySlug },
      tags: tags.slice(0, tagIds.length).map((name, index) => ({
        id: tagIds[index],
        name,
        slug: name
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, ""),
      })),
      relations: relationIds,
      readingMinutes,
      ...(publishAfter ? { publishAfter: new Date(publishAfter).toISOString() } : {}),
      blocks: [
        { id: blockIds.rich, type: "rich_text" as const, data: { text: body } },
        ...(imageId
          ? [{ id: blockIds.image, type: "image" as const, data: { assetId: imageId, alt: imageAlt } }]
          : []),
        ...(galleryIds.length
          ? [{ id: blockIds.gallery, type: "gallery" as const, data: { assetIds: galleryIds } }]
          : []),
        ...(ctaLabel
          ? [{ id: blockIds.cta, type: "cta" as const, data: { label: ctaLabel, href: ctaHref } }]
          : []),
        ...(Object.values(relationIds).some((ids) => ids.length)
          ? [{ id: blockIds.related, type: "related_content" as const, data: { state: "selected" } }]
          : []),
      ],
      seo: {
        title: seoTitle,
        description: seoDescription,
        canonicalPath: "/blog/" + slug,
        indexable: seoIndexable,
      },
      provenance: [
        {
          sourceKind: "owner_authored" as const,
          ...(authorizationReference ? { authorizationReference } : {}),
          ...(authorizationDate ? { authorizationDate } : {}),
          ...(rightsScope ? { rightsScope } : {}),
          rightsConfirmed,
          commercialOwner,
          technicalOwner,
          verifiedAt,
        },
      ],
    }),
    [
      authorId,
      authorName,
      authorSlug,
      authorizationDate,
      authorizationReference,
      blockIds,
      body,
      categoryId,
      categoryName,
      categorySlug,
      ctaHref,
      ctaLabel,
      commercialOwner,
      galleryIds,
      imageAlt,
      imageId,
      publishAfter,
      readingMinutes,
      relationIds,
      rightsConfirmed,
      rightsScope,
      seoDescription,
      seoIndexable,
      seoTitle,
      slug,
      summary,
      tagIds,
      tags,
      technicalOwner,
      title,
      verifiedAt,
    ],
  );
  const currentSnapshot = JSON.stringify({ payload, slug });
  const dirty = savedSnapshot !== null && currentSnapshot !== savedSnapshot;
  const backup = useDraftBackup({
    userId: session?.user.id,
    editorType: "post",
    itemKey: id ?? "novo",
    value: {
      slug,
      title,
      summary,
      body,
      authorName,
      authorSlug,
      authorId,
      categoryName,
      categorySlug,
      categoryId,
      tags,
      tagIds,
      relationIds,
      imageId,
      imageAlt,
      galleryIds,
      ctaLabel,
      ctaHref,
      readingMinutes,
      publishAfter,
      seoTitle,
      seoDescription,
      seoIndexable,
      authorizationReference,
      authorizationDate,
      rightsScope,
      rightsConfirmed,
      commercialOwner,
      technicalOwner,
      verifiedAt,
      reason,
    },
    dirty,
    enabled: !loading && savedSnapshot !== null,
    onRestore: (stored) => {
      setSlug(stored.slug);
      setTitle(stored.title);
      setSummary(stored.summary);
      setBody(stored.body);
      setAuthorName(stored.authorName);
      setAuthorSlug(stored.authorSlug);
      setAuthorId(stored.authorId);
      setCategoryName(stored.categoryName);
      setCategorySlug(stored.categorySlug);
      setCategoryId(stored.categoryId);
      setTags(normalizeTagNames(stored.tags));
      setTagIds(stored.tagIds);
      setRelationIds(stored.relationIds);
      setImageId(stored.imageId);
      setImageAlt(stored.imageAlt);
      setGalleryIds(stored.galleryIds);
      setCtaLabel(stored.ctaLabel);
      setCtaHref(stored.ctaHref);
      setReadingMinutes(stored.readingMinutes);
      setPublishAfter(stored.publishAfter);
      setSeoTitle(stored.seoTitle ?? "");
      setSeoDescription(stored.seoDescription ?? "");
      setSeoIndexable(stored.seoIndexable === true);
      setAuthorizationReference(stored.authorizationReference ?? "");
      setAuthorizationDate(stored.authorizationDate ?? "");
      setRightsScope(stored.rightsScope ?? "");
      setRightsConfirmed(stored.rightsConfirmed === true);
      setCommercialOwner(stored.commercialOwner ?? "");
      setTechnicalOwner(stored.technicalOwner ?? "");
      setVerifiedAt(stored.verifiedAt ?? "");
      setReason(stored.reason);
    },
  });
  useEffect(() => {
    if (!loading && savedSnapshot === null) setSavedSnapshot(currentSnapshot);
  }, [currentSnapshot, loading, savedSnapshot]);
  function addTag() {
    const name = tagDraft.trim();
    if (!name || busy || tags.length >= 20) return;
    if (tags.some((tag) => tag.localeCompare(name, "pt-BR", { sensitivity: "accent" }) === 0)) {
      setError("Essa tag já foi adicionada.");
      return;
    }
    setTags((current) => [...current, name]);
    setTagDraft("");
    setError("");
  }
  async function run(action: string, extras: Record<string, unknown> = {}) {
    if (!session) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      if (!["create", "save"].includes(action) && dirty)
        throw new Error("Salve o conteúdo antes de executar uma ação de revisão ou publicação.");
      if ((action === "create" || action === "save") && !CmsContentPayloadSchema.safeParse(payload).success)
        throw new Error("Revise os campos obrigatórios.");
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
            contentType: loaded ? null : "post",
            slug,
            payload: action === "create" || action === "save" ? payload : null,
            expectedLockVersion: loaded?.cms_content_drafts.lock_version ?? null,
            reason,
            ...extras,
          }),
        invalidateSnapshot: () => setSavedSnapshot(INVALIDATED_EDITOR_SNAPSHOT),
        reconcile: async () => {
          if (!publishedItem) return;
          setLoaded((await fetchAuthoritativeEditorialItem(publishedItem.id, "post")) as Loaded);
        },
      });
      setSuccess(
        action === "archive"
          ? `${loaded?.workflow_status === "published" ? "Conteúdo despublicado e arquivado" : "Conteúdo arquivado"}. A alteração foi registrada na auditoria.`
          : "Operação concluída e registrada na auditoria.",
      );
      if (action === "create" || action === "save") setSavedSnapshot(currentSnapshot);
      if (["create", "save", "publish", "archive"].includes(action)) backup.clear();
      if (!loaded && result.itemId) navigate("/admin/conteudo/" + result.itemId, { replace: true });
      else setRefreshToken((current) => current + 1);
    } catch (caught) {
      setError(operatorErrorMessage(caught, { fallback: "Não foi possível concluir a ação editorial." }));
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
      setError("O navegador bloqueou a nova aba. Abra a visualização pelo link abaixo.");
    } else if (result.status === "failed") {
      setError(
        operatorErrorMessage(result.error, {
          fallback: "Não foi possível abrir a visualização deste conteúdo.",
        }),
      );
    }
    setBusy(false);
  }
  if (loading)
    return (
      <div className="admin-state" aria-busy="true">
        Carregando editor…
      </div>
    );
  if (error && !loaded && id !== "novo")
    return (
      <div className="admin-state admin-notice--error" role="alert">
        {error}
      </div>
    );
  const state = loaded?.workflow_status ?? "new";
  const stateLabel = editorialStatusLabel(state);
  return (
    <section>
      <UnsavedChangesGuard dirty={dirty && !busy} />
      <DraftBackupNotice backup={backup} />
      <p className="admin-eyebrow">EDITOR E REVISÕES</p>
      <h1>{loaded ? title : "Novo artigo"}</h1>
      <p className="admin-help">
        Preencha o conteúdo, as responsabilidades e as informações para mecanismos de busca antes de salvar o
        rascunho.
      </p>
      <dl className="admin-editor-context" aria-label="Contexto da edição">
        <div>
          <dt>Conteúdo em edição</dt>
          <dd>
            {title || "Sem título"} · /blog/{slug}
          </dd>
        </div>
        <div>
          <dt>Situação</dt>
          <dd>{dirty ? "Alterações não salvas" : `Rascunho salvo · ${stateLabel}`}</dd>
        </div>
        <div>
          <dt>Impacto público</dt>
          <dd>Blog, página do artigo, busca, sitemap e dados estruturados após publicação.</dd>
        </div>
      </dl>
      {error && (
        <p className="admin-notice admin-notice--error" role="alert">
          {error}
          {previewFallback && (
            <>
              {" "}
              <a href={previewFallback} target="_blank" rel="noopener noreferrer">
                Abrir visualização em nova aba
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
      <div className="admin-editor-grid">
        <form
          className="admin-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(loaded ? "save" : "create");
          }}
        >
          <label>
            Título
            <input
              value={title}
              disabled={!can("cms:posts.edit") || busy}
              onChange={(e) => {
                const nextTitle = e.target.value;
                setTitle(nextTitle);
                if (!loaded) setSlug(urlSegmentFromText(nextTitle));
              }}
            />
          </label>
          <p className="admin-help">
            Endereço público gerado:{" "}
            <output aria-label="Endereço público gerado">/blog/{slug || "aguardando-titulo"}</output>
          </p>
          <label>
            Resumo
            <textarea
              value={summary}
              disabled={!can("cms:posts.edit") || busy}
              onChange={(e) => setSummary(e.target.value)}
            />
          </label>
          <label>
            Corpo do artigo
            <textarea
              rows={8}
              value={body}
              disabled={!can("cms:posts.edit") || busy}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <fieldset>
            <legend>Mídia nova e chamadas</legend>
            {damCandidateEnabled ? (
              <>
                <DamPicker
                  label="Imagem principal opcional"
                  value={
                    imageId
                      ? [
                          {
                            id: imageId,
                            originalFilename:
                              mediaOptions.find((item) => item.id === imageId)?.original_filename ??
                              "Imagem selecionada",
                            altText: imageAlt,
                            previewUrl: null,
                          },
                        ]
                      : []
                  }
                  disabled={!can("cms:posts.edit") || busy}
                  onChange={(selection) => {
                    const asset = selection[0];
                    setImageId(asset?.id ?? "");
                    setImageAlt(asset?.altText ?? "");
                    if (asset)
                      setMediaOptions((current) => [
                        ...current.filter((item) => item.id !== asset.id),
                        {
                          id: asset.id,
                          original_filename: asset.originalFilename,
                          alt_text: asset.altText,
                        },
                      ]);
                  }}
                />
                {imageId && (
                  <label>
                    Texto alternativo no contexto deste conteúdo
                    <input value={imageAlt} onChange={(event) => setImageAlt(event.target.value)} />
                  </label>
                )}
                <DamPicker
                  label="Galeria opcional"
                  multiple
                  value={galleryIds.map((assetId) => {
                    const asset = mediaOptions.find((item) => item.id === assetId);
                    return {
                      id: assetId,
                      originalFilename: asset?.original_filename ?? "Imagem selecionada",
                      altText: asset?.alt_text ?? "",
                      previewUrl: null,
                    } satisfies DamPickerSelection;
                  })}
                  disabled={!can("cms:posts.edit") || busy}
                  onChange={(selection) => {
                    setGalleryIds(selection.map((asset) => asset.id));
                    setMediaOptions((current) => [
                      ...current.filter((item) => !selection.some((asset) => asset.id === item.id)),
                      ...selection.map((asset) => ({
                        id: asset.id,
                        original_filename: asset.originalFilename,
                        alt_text: asset.altText,
                      })),
                    ]);
                  }}
                />
              </>
            ) : (
              <>
                <label>
                  Imagem principal opcional
                  <select
                    value={imageId}
                    onChange={(event) => {
                      const selected = mediaOptions.find((item) => item.id === event.target.value);
                      setImageId(event.target.value);
                      if (selected) setImageAlt(selected.alt_text);
                    }}
                  >
                    <option value="">Sem imagem</option>
                    {mediaOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.original_filename}
                      </option>
                    ))}
                  </select>
                </label>
                {imageId && (
                  <label>
                    Texto alternativo
                    <input value={imageAlt} onChange={(event) => setImageAlt(event.target.value)} />
                  </label>
                )}
                <fieldset>
                  <legend>Galeria opcional</legend>
                  {mediaOptions.map((item) => (
                    <label key={item.id}>
                      <input
                        type="checkbox"
                        checked={galleryIds.includes(item.id)}
                        onChange={() =>
                          setGalleryIds((current) =>
                            current.includes(item.id)
                              ? current.filter((currentId) => currentId !== item.id)
                              : [...current, item.id],
                          )
                        }
                      />{" "}
                      {item.original_filename}
                    </label>
                  ))}
                </fieldset>
              </>
            )}
            <label>
              Texto da chamada para ação (opcional)
              <input value={ctaLabel} onChange={(event) => setCtaLabel(event.target.value)} />
            </label>
            <label>
              Destino da chamada para ação
              <input value={ctaHref} onChange={(event) => setCtaHref(event.target.value)} />
            </label>
          </fieldset>
          <fieldset>
            <legend>Autoria e taxonomia estruturadas</legend>
            <label>
              Autor
              <input
                value={authorName}
                disabled={!can("cms:posts.edit") || busy}
                onChange={(e) => {
                  setAuthorName(e.target.value);
                  setAuthorSlug(urlSegmentFromText(e.target.value));
                }}
              />
            </label>
            <label>
              Categoria
              <input
                value={categoryName}
                disabled={!can("cms:posts.edit") || busy}
                onChange={(e) => {
                  setCategoryName(e.target.value);
                  setCategorySlug(urlSegmentFromText(e.target.value));
                }}
              />
            </label>
            <div role="group" aria-labelledby="article-tags-title">
              <p id="article-tags-title">Tags do artigo</p>
              <div className="admin-inline-fields">
                <label>
                  Nova tag
                  <input
                    value={tagDraft}
                    maxLength={80}
                    disabled={!can("cms:posts.edit") || busy || tags.length >= 20}
                    onChange={(event) => setTagDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      addTag();
                    }}
                  />
                </label>
                <button
                  type="button"
                  disabled={!can("cms:posts.edit") || busy || !tagDraft.trim() || tags.length >= 20}
                  onClick={addTag}
                >
                  Adicionar tag
                </button>
              </div>
              {tags.length === 0 ? (
                <p className="admin-help">Nenhuma tag adicionada.</p>
              ) : (
                <ul className="admin-chip-list" aria-label="Tags adicionadas">
                  {tags.map((tag) => (
                    <li key={tag}>
                      <span>{tag}</span>
                      <button
                        type="button"
                        disabled={!can("cms:posts.edit") || busy}
                        aria-label={`Remover tag ${tag}`}
                        onClick={() => setTags((current) => current.filter((item) => item !== tag))}
                      >
                        Remover
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <small>{tags.length} de 20 tags adicionadas.</small>
            </div>
          </fieldset>
          <fieldset>
            <legend>Relações editoriais publicadas</legend>
            {relationOptions.length === 0 ? (
              <p>Nenhum conteúdo novo publicado está disponível para relacionar.</p>
            ) : (
              relationOptions
                .filter((item) => item.item_id !== loaded?.id)
                .map((item) => {
                  const kind = relationKindFor(item.content_type);
                  return (
                    <label key={item.item_id}>
                      <input
                        type="checkbox"
                        checked={relationIds[kind].includes(item.item_id)}
                        onChange={() => toggleRelation(kind, item.item_id)}
                      />{" "}
                      {item.payload.title ?? "Conteúdo sem título"}{" "}
                      <small>({relationTypeLabels[item.content_type] ?? "Conteúdo"})</small>
                    </label>
                  );
                })
            )}
          </fieldset>
          <label>
            Tempo de leitura (minutos)
            <input
              type="number"
              min={1}
              max={180}
              value={readingMinutes}
              disabled={!can("cms:posts.edit") || busy}
              onChange={(e) => setReadingMinutes(Number(e.target.value))}
            />
          </label>
          <label>
            Publicar a partir de
            <input
              type="datetime-local"
              value={publishAfter}
              disabled={!can("cms:posts.publish") || busy}
              onChange={(e) => setPublishAfter(e.target.value)}
            />
          </label>
          <fieldset>
            <legend>Apresentação nos mecanismos de busca</legend>
            <label>
              Título nos resultados de busca
              <input
                maxLength={70}
                value={seoTitle}
                disabled={!can("cms:posts.edit") || busy}
                onChange={(event) => setSeoTitle(event.target.value)}
              />
            </label>
            <label>
              Descrição nos resultados de busca
              <textarea
                maxLength={170}
                value={seoDescription}
                disabled={!can("cms:posts.edit") || busy}
                onChange={(event) => setSeoDescription(event.target.value)}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={seoIndexable}
                disabled={!can("cms:posts.publish") || busy}
                onChange={(event) => setSeoIndexable(event.target.checked)}
              />{" "}
              Permitir indexação após publicação
            </label>
            <small>Endereço oficial: /blog/{slug || "aguardando-titulo"}</small>
          </fieldset>
          <fieldset>
            <legend>Proveniência e direitos</legend>
            <label>
              Referência de autorização
              <input
                maxLength={300}
                value={authorizationReference}
                onChange={(event) => setAuthorizationReference(event.target.value)}
              />
            </label>
            <label>
              Data da autorização
              <input
                type="date"
                value={authorizationDate}
                onChange={(event) => setAuthorizationDate(event.target.value)}
              />
            </label>
            <label>
              Escopo dos direitos
              <input
                maxLength={300}
                value={rightsScope}
                onChange={(event) => setRightsScope(event.target.value)}
              />
            </label>
            <label>
              Responsável comercial
              <input
                maxLength={120}
                value={commercialOwner}
                onChange={(event) => setCommercialOwner(event.target.value)}
              />
            </label>
            <label>
              Responsável técnico
              <input
                maxLength={120}
                value={technicalOwner}
                onChange={(event) => setTechnicalOwner(event.target.value)}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={rightsConfirmed}
                onChange={(event) => {
                  setRightsConfirmed(event.target.checked);
                  if (event.target.checked) setVerifiedAt(new Date().toISOString());
                }}
              />{" "}
              Confirmo os direitos para uso deste conteúdo
            </label>
          </fieldset>
          <label>
            Motivo da revisão
            <input required value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          {can("cms:posts.edit") &&
            (state === "new" || state === "draft" || state === "in_review" || state === "published") && (
              <button className="admin-button" disabled={busy}>
                {state === "published"
                  ? "Abrir nova versão e salvar"
                  : loaded
                    ? "Salvar com controle de versão"
                    : "Criar rascunho"}
              </button>
            )}
        </form>
        <aside className="admin-workflow">
          <h2>Fluxo editorial</h2>
          <p>
            Situação: <strong>{stateLabel}</strong>
          </p>
          <button onClick={() => void preview()} disabled={!loaded || busy}>
            Visualizar rascunho
          </button>
          {state === "draft" && can("cms:posts.edit") && (
            <button onClick={() => void run("submit")} disabled={busy}>
              Enviar para revisão
            </button>
          )}
          {state === "in_review" && can("cms:posts.approve") && (
            <button
              onClick={() => void run("approve", { revisionId: loaded?.cms_content_revisions.at(-1)?.id })}
              disabled={busy}
            >
              Aprovar revisão
            </button>
          )}
          {state === "approved" && can("cms:posts.publish") && (
            <>
              <button
                onClick={() => void run("publish", { revisionId: loaded?.cms_content_revisions.at(-1)?.id })}
                disabled={busy}
              >
                Publicar agora
              </button>
              <button
                onClick={() =>
                  void run("schedule", {
                    publishAt: publishAfter
                      ? new Date(publishAfter).toISOString()
                      : new Date(Date.now() + 3600000).toISOString(),
                  })
                }
                disabled={busy}
              >
                Agendar +1h
              </button>
            </>
          )}
          {state === "published" && (
            <a href={"/blog/" + slug} target="_blank" rel="noreferrer">
              Abrir artigo no site
            </a>
          )}
          <EditorialArchiveAction
            state={state}
            entityLabel="conteúdo"
            allowed={can("cms:posts.publish")}
            busy={busy}
            onArchive={() => void run("archive")}
          />
        </aside>
      </div>
      {loaded && (
        <section className="admin-history">
          <h2>Histórico de versões</h2>
          {loaded.cms_content_revisions.length === 0 ? (
            <p>Nenhuma versão registrada.</p>
          ) : (
            loaded.cms_content_revisions
              .sort((a, b) => b.revision_number - a.revision_number)
              .map((revision, index) => (
                <details key={revision.id}>
                  <summary>
                    Revisão {revision.revision_number} — {revision.reason}
                  </summary>
                  <p className="admin-help">
                    Registrada em {new Date(revision.created_at).toLocaleString("pt-BR")}. Use a
                    pré-visualização para conferir o conteúdo desta revisão.
                  </p>
                  <button onClick={() => void preview(revision.id)}>Visualizar esta revisão</button>
                  {state === "published" && index > 0 && can("cms:posts.publish") && (
                    <button onClick={() => void run("restore", { revisionId: revision.id })}>
                      Restaurar como nova revisão
                    </button>
                  )}
                </details>
              ))
          )}
        </section>
      )}
      <p className="admin-help">
        Conta: {user?.email}. As ações disponíveis refletem as permissões configuradas para esta conta.
      </p>
    </section>
  );
}
