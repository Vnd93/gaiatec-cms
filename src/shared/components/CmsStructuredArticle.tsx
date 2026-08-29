type Block = { id: string; type: string; data: Record<string, unknown> };
export type CmsArticlePayload = {
  title: string;
  summary?: string;
  excerpt?: string;
  authorName?: string;
  blocks: Block[];
  seo?: { title?: string; description?: string };
};

export function CmsStructuredArticle({
  payload,
  preview = false,
}: {
  payload: CmsArticlePayload;
  preview?: boolean;
}) {
  return (
    <article className="cms-rendered-article" data-cms-renderer="structured-article">
      {preview && (
        <p className="cms-preview-banner" role="status">
          Preview privado — conteúdo ainda não público
        </p>
      )}
      <header>
        <p className="admin-eyebrow">{preview ? "PREVIEW CMS" : "CONTEÚDO PUBLICADO"}</p>
        <h1>{payload.title}</h1>
        {payload.summary && <p className="cms-rendered-lead">{payload.summary}</p>}
        {payload.authorName && <p>Por {payload.authorName}</p>}
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
        if (block.type === "image" && block.data.url)
          return (
            <figure key={block.id}>
              <img src={String(block.data.url)} alt={String(block.data.alt ?? "")} />
              <figcaption>{String(block.data.caption ?? "")}</figcaption>
            </figure>
          );
        return (
          <section key={block.id} aria-label={"Bloco " + block.type}>
            <pre>{JSON.stringify(block.data, null, 2)}</pre>
          </section>
        );
      })}
    </article>
  );
}
