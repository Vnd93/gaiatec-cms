import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { supabase } from "@/lib/supabase";
import { CmsContentPayloadSchema } from "@/shared/contracts/cms-content";
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
export default function AdminEditorPage() {
  const { id } = useParams(),
    navigate = useNavigate(),
    { session, profile, user } = useAdminAuth();
  const [loaded, setLoaded] = useState<Loaded | null>(null),
    [loading, setLoading] = useState(id !== "novo"),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [slug, setSlug] = useState("demo-sintetica-" + Date.now());
  const [title, setTitle] = useState("Demonstração sintética descartável"),
    [summary, setSummary] = useState("Conteúdo fictício criado exclusivamente para validar o Gate G3."),
    [body, setBody] = useState("Este texto não descreve produto, serviço ou informação real da GAIATEC."),
    [authorName, setAuthorName] = useState("Equipe sintética de validação"),
    [authorSlug, setAuthorSlug] = useState("equipe-sintetica"),
    [authorId, setAuthorId] = useState<string>(() => crypto.randomUUID()),
    [categoryName, setCategoryName] = useState("Validação sintética"),
    [categorySlug, setCategorySlug] = useState("validacao-sintetica"),
    [categoryId, setCategoryId] = useState<string>(() => crypto.randomUUID()),
    [tags, setTags] = useState("teste-local, clean-room"),
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
    [reason, setReason] = useState("Validação sintética do fluxo editorial");
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
    void supabase
      .from("cms_content_items")
      .select(
        "id,slug,workflow_status,cms_content_drafts(payload,lock_version),cms_content_revisions(id,revision_number,reason,created_at,payload)",
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
            blocks?: Array<{
              type?: string;
              data?: { assetId?: string; assetIds?: string[]; alt?: string; label?: string; href?: string };
            }>;
          };
          setAuthorName(structured.author?.name ?? "");
          setAuthorSlug(structured.author?.slug ?? "");
          if (structured.author?.id) setAuthorId(structured.author.id);
          setCategoryName(structured.category?.name ?? "");
          setCategorySlug(structured.category?.slug ?? "");
          if (structured.category?.id) setCategoryId(structured.category.id);
          setTags(
            (structured.tags ?? [])
              .map((tag) => tag.name)
              .filter(Boolean)
              .join(", "),
          );
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
  }, [id]);
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
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, tagIds.length)
        .map((name, index) => ({
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
        title: title.slice(0, 70) || "Demonstração sintética",
        description: summary.slice(0, 170) || "Validação sintética",
        canonicalPath: "/blog/" + slug,
        indexable: false,
      },
      provenance: [
        {
          sourceKind: "owner_authored" as const,
          rightsConfirmed: true as const,
          commercialOwner: "Owner sintético",
          technicalOwner: "Owner sintético",
          verifiedAt: new Date().toISOString(),
        },
      ],
    }),
    [
      authorId,
      authorName,
      authorSlug,
      blockIds,
      body,
      categoryId,
      categoryName,
      categorySlug,
      ctaHref,
      ctaLabel,
      galleryIds,
      imageAlt,
      imageId,
      publishAfter,
      readingMinutes,
      relationIds,
      slug,
      summary,
      tagIds,
      tags,
      title,
    ],
  );
  async function run(action: string, extras: Record<string, unknown> = {}) {
    if (!session) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      if ((action === "create" || action === "save") && !CmsContentPayloadSchema.safeParse(payload).success)
        throw new Error("Revise os campos obrigatórios.");
      const result = await editorialCommand(session, {
        action,
        itemId: loaded?.id ?? null,
        contentType: loaded ? null : "post",
        slug,
        payload: action === "create" || action === "save" ? payload : null,
        expectedLockVersion: loaded?.cms_content_drafts.lock_version ?? null,
        reason,
        ...extras,
      });
      setSuccess("Operação concluída: " + result.status + ". Código " + result.correlationId.slice(0, 8));
      if (!loaded && result.itemId) navigate("/admin/conteudo/" + result.itemId, { replace: true });
      else window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha editorial.");
    } finally {
      setBusy(false);
    }
  }
  async function preview(revisionId?: string) {
    if (!session || !loaded) return;
    setBusy(true);
    try {
      const result = await issuePreview(session, loaded.id, revisionId);
      // The token is issued asynchronously, so opening a new tab here is
      // commonly blocked as a popup. Same-tab navigation is deterministic and
      // keeps the editor one browser Back action away.
      window.location.assign(result.path);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha no preview.");
    } finally {
      setBusy(false);
    }
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
  return (
    <section>
      <p className="admin-eyebrow">EDITOR E REVISÕES</p>
      <h1>{loaded ? title : "Novo conteúdo sintético"}</h1>
      <p className="admin-help">
        Ambiente limpo: use somente texto fictício e descartável, sem dados comerciais reais.
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
      <div className="admin-editor-grid">
        <form
          className="admin-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(loaded ? "save" : "create");
          }}
        >
          <label>
            Slug
            <input
              value={slug}
              disabled={Boolean(loaded) || busy}
              onChange={(e) => setSlug(e.target.value)}
            />
          </label>
          <label>
            Título
            <input
              value={title}
              disabled={!can("cms:posts.edit") || busy}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Resumo
            <textarea
              value={summary}
              disabled={!can("cms:posts.edit") || busy}
              onChange={(e) => setSummary(e.target.value)}
            />
          </label>
          <label>
            Corpo sintético
            <textarea
              rows={8}
              value={body}
              disabled={!can("cms:posts.edit") || busy}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <fieldset>
            <legend>Mídia nova e chamadas</legend>
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
                          ? current.filter((id) => id !== item.id)
                          : [...current, item.id],
                      )
                    }
                  />{" "}
                  {item.original_filename}
                </label>
              ))}
            </fieldset>
            <label>
              Rótulo da CTA opcional
              <input value={ctaLabel} onChange={(event) => setCtaLabel(event.target.value)} />
            </label>
            <label>
              Destino da CTA
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
                onChange={(e) => setAuthorName(e.target.value)}
              />
            </label>
            <label>
              Slug do autor
              <input
                value={authorSlug}
                disabled={!can("cms:posts.edit") || busy}
                onChange={(e) => setAuthorSlug(e.target.value)}
              />
            </label>
            <label>
              Categoria
              <input
                value={categoryName}
                disabled={!can("cms:posts.edit") || busy}
                onChange={(e) => setCategoryName(e.target.value)}
              />
            </label>
            <label>
              Slug da categoria
              <input
                value={categorySlug}
                disabled={!can("cms:posts.edit") || busy}
                onChange={(e) => setCategorySlug(e.target.value)}
              />
            </label>
            <label>
              Tags separadas por vírgula
              <input
                value={tags}
                disabled={!can("cms:posts.edit") || busy}
                onChange={(e) => setTags(e.target.value)}
              />
            </label>
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
                      {item.payload.title ?? item.slug} <small>({item.content_type})</small>
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
          <label>
            Motivo da revisão
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          {can("cms:posts.edit") && (state === "new" || state === "draft" || state === "in_review") && (
            <button className="admin-button" disabled={busy}>
              {loaded ? "Salvar com controle de versão" : "Criar rascunho"}
            </button>
          )}
        </form>
        <aside className="admin-workflow">
          <h2>Workflow</h2>
          <p>
            Status: <strong>{state}</strong>
          </p>
          <button onClick={() => void preview()} disabled={!loaded || busy}>
            Preview do rascunho
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
              Abrir projeção publicada
            </a>
          )}
        </aside>
      </div>
      {loaded && (
        <section className="admin-history">
          <h2>Histórico imutável</h2>
          {loaded.cms_content_revisions.length === 0 ? (
            <p>Nenhuma revisão congelada.</p>
          ) : (
            loaded.cms_content_revisions
              .sort((a, b) => b.revision_number - a.revision_number)
              .map((revision, index) => (
                <details key={revision.id}>
                  <summary>
                    Revisão {revision.revision_number} — {revision.reason}
                  </summary>
                  <pre>{JSON.stringify(revision.payload, null, 2)}</pre>
                  <button onClick={() => void preview(revision.id)}>Preview desta revisão</button>
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
        Sessão: {user?.email}. As ações disponíveis refletem permissões reais resolvidas no servidor.
      </p>
    </section>
  );
}
