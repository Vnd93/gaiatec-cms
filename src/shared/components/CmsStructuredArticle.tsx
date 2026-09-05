type Block = { id: string; type: string; data: Record<string, unknown> };
export type CmsArticlePayload = {
  title: string;
  summary?: string;
  excerpt?: string;
  authorName?: string;
  author?: { name: string; slug: string; role?: string; bio?: string };
  category?: { name: string; slug: string };
  tags?: Array<{ name: string; slug: string }>;
  readingMinutes?: number;
  publishAfter?: string;
  blocks: Block[];
  seo?: { title?: string; description?: string };
};

export function CmsStructuredArticle({
  payload,
  preview = false,
  publishedAt,
  mediaUrls = {},
  mediaAlt = {},
  relatedItems = [],
}: {
  payload: CmsArticlePayload;
  preview?: boolean;
  publishedAt?: string;
  mediaUrls?: Record<string, string>;
  mediaAlt?: Record<string, string>;
  relatedItems?: Array<{ item_id: string; title: string; path: string; summary?: string }>;
}) {
  const imageUrl = (assetId: string) =>
    mediaUrls[`${assetId}:large.avif`] ??
    mediaUrls[`${assetId}:large.webp`] ??
    mediaUrls[`${assetId}:medium.webp`] ??
    "";
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: payload.title,
    description: payload.excerpt ?? payload.summary,
    author: payload.author ? { "@type": "Person", name: payload.author.name } : undefined,
    articleSection: payload.category?.name,
    keywords: payload.tags?.map((tag) => tag.name).join(", "),
    datePublished: publishedAt ?? payload.publishAfter,
  };
  return (
    <article className="cms-rendered-article" data-cms-renderer="structured-article">
      <script type="application/ld+json">{JSON.stringify(articleSchema)}</script>
      {preview && (
        <p className="cms-preview-banner" role="status">
          Preview privado — conteúdo ainda não público
        </p>
      )}
      <header>
        <p className="admin-eyebrow">{preview ? "PREVIEW CMS" : "CONTEÚDO PUBLICADO"}</p>
        <h1>{payload.title}</h1>
        {payload.summary && <p className="cms-rendered-lead">{payload.summary}</p>}
        {(payload.author?.name || payload.authorName) && (
          <p>Por {payload.author?.name ?? payload.authorName}</p>
        )}
        {(payload.category || payload.readingMinutes) && (
          <p>
            {payload.category?.name}
            {payload.category && payload.readingMinutes ? " · " : ""}
            {payload.readingMinutes ? `${payload.readingMinutes} min de leitura` : ""}
          </p>
        )}
        {(payload.tags?.length ?? 0) > 0 && (
          <ul aria-label="Tags do artigo">
            {payload.tags?.map((tag) => (
              <li key={tag.slug}>{tag.name}</li>
            ))}
          </ul>
        )}
      </header>
      {payload.blocks.map((block) => {
        if (block.type === "rich_text")
          return (
            <section key={block.id}>
              <p>{String(block.data.text ?? "")}</p>
            </section>
          );
        if (block.type === "cta") {
          const href = String(block.data.href ?? "");
          return (
            <p key={block.id}>
              <a className="admin-button" href={href}>
                {String(block.data.label ?? "Continuar")}
              </a>
            </p>
          );
        }
        if (block.type === "image" && (block.data.assetId || block.data.url)) {
          const assetId = String(block.data.assetId ?? "");
          const url = String(block.data.url ?? imageUrl(assetId));
          if (!url) return null;
          return (
            <figure key={block.id}>
              <img src={url} alt={String(block.data.alt ?? mediaAlt[assetId] ?? "")} />
              <figcaption>{String(block.data.caption ?? "")}</figcaption>
            </figure>
          );
        }
        if (block.type === "gallery") {
          const assetIds = Array.isArray(block.data.assetIds) ? block.data.assetIds.map(String) : [];
          return (
            <div className="cms-page-gallery" key={block.id}>
              {assetIds.map((assetId) =>
                imageUrl(assetId) ? (
                  <img key={assetId} src={imageUrl(assetId)} alt={mediaAlt[assetId] ?? ""} />
                ) : null,
              )}
            </div>
          );
        }
        if (block.type === "related_content")
          return (
            <section key={block.id} aria-label="Conteúdo relacionado">
              {relatedItems.length ? (
                <ul>
                  {relatedItems.map((item) => (
                    <li key={item.item_id}>
                      <a href={item.path}>{item.title}</a>
                      {item.summary && <p>{item.summary}</p>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Nenhum conteúdo relacionado publicado.</p>
              )}
            </section>
          );
        return null;
      })}
    </article>
  );
}
