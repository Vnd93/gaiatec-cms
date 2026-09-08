import { SUPABASE_URL } from "@/lib/supabase";

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

const safeArticlePath = (value: unknown) =>
  typeof value === "string" && /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/?)*$/.test(value) ? value : null;

const safeArticleAssetUrl = (value: unknown, allowGovernedPreview: boolean) => {
  if (typeof value !== "string" || value.length > 2_000) return "";
  try {
    const parsed = new URL(value);
    const configured = new URL(SUPABASE_URL);
    const governedProxy =
      parsed.origin === configured.origin &&
      parsed.pathname === "/functions/v1/cms-public" &&
      parsed.searchParams.get("type") === "media";
    const governedPreviewAsset =
      allowGovernedPreview &&
      parsed.origin === configured.origin &&
      /^\/storage\/v1\/object\/sign\/cms-media-private\//.test(parsed.pathname);
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    const ipv4 = host.split(".").map(Number);
    const privateIpv4 =
      ipv4.length === 4 &&
      ipv4.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) &&
      (ipv4[0] === 0 ||
        ipv4[0] === 10 ||
        ipv4[0] === 127 ||
        (ipv4[0] === 100 && ipv4[1] >= 64 && ipv4[1] <= 127) ||
        (ipv4[0] === 169 && ipv4[1] === 254) ||
        (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31) ||
        (ipv4[0] === 192 && ipv4[1] === 168) ||
        ipv4[0] >= 224);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      (!governedPreviewAsset &&
        [...parsed.searchParams.keys()].some((key) =>
          /^(?:access[_-]?token|refresh[_-]?token|token|api[_-]?key|apikey|key|secret|signature|sig|credential|authorization|password)$/i.test(
            key,
          ),
        )) ||
      ((!host.includes(".") ||
        host === "localhost" ||
        host.endsWith(".localhost") ||
        host.endsWith(".local") ||
        host.endsWith(".internal") ||
        host === "::" ||
        host === "::1" ||
        /^(?:fc|fd|fe[89ab])/i.test(host) ||
        privateIpv4) &&
        !governedProxy &&
        !governedPreviewAsset)
    )
      return "";
    return parsed.href;
  } catch {
    return "";
  }
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
  relatedItems?: Array<{ title: string; path: string; summary?: string }>;
}) {
  const imageUrl = (assetId: string) =>
    safeArticleAssetUrl(
      mediaUrls[`${assetId}:large.avif`] ??
        mediaUrls[`${assetId}:large.webp`] ??
        mediaUrls[`${assetId}:medium.webp`],
      preview,
    );
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
  const articleSchemaJson = JSON.stringify(articleSchema).replaceAll("<", "\\u003c");
  return (
    <article className="cms-rendered-article">
      <script type="application/ld+json">{articleSchemaJson}</script>
      {preview && (
        <p className="cms-preview-banner" role="status">
          Preview privado — visualização restrita para revisão
        </p>
      )}
      <header>
        <p className="admin-eyebrow">{preview ? "PREVIEW CMS" : "ARTIGO TÉCNICO"}</p>
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
          const href = safeArticlePath(block.data.href);
          return (
            <p key={block.id}>
              {href ? (
                <a className="admin-button" href={href}>
                  {String(block.data.label ?? "Continuar")}
                </a>
              ) : (
                <span>{String(block.data.label ?? "Continuar")}</span>
              )}
            </p>
          );
        }
        if (block.type === "image" && block.data.assetId) {
          const assetId = String(block.data.assetId ?? "");
          const url = imageUrl(assetId);
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
                    <li key={item.path}>
                      {safeArticlePath(item.path) ? (
                        <a href={item.path}>{item.title}</a>
                      ) : (
                        <span>{item.title}</span>
                      )}
                      {item.summary && <p>{item.summary}</p>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Nenhum conteúdo relacionado disponível.</p>
              )}
            </section>
          );
        return null;
      })}
    </article>
  );
}
