export function applyCatalogSeo(input: {
  title: string;
  description?: string;
  canonicalPath: string;
  indexable?: boolean;
  ogImage?: string;
}) {
  document.title = input.title;
  let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.append(canonical);
  }
  canonical.href = new URL(input.canonicalPath, window.location.origin).href;

  let robots = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
  if (!robots) {
    robots = document.createElement("meta");
    robots.name = "robots";
    document.head.append(robots);
  }
  robots.content = input.indexable ? "index,follow" : "noindex,follow";
  const setMeta = (selector: string, attribute: "name" | "property", key: string, content?: string) => {
    let meta = document.querySelector(selector) as HTMLMetaElement | null;
    if (!content) {
      meta?.remove();
      return;
    }
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute(attribute, key);
      document.head.append(meta);
    }
    meta.content = content;
  };
  setMeta('meta[name="description"]', "name", "description", input.description);
  setMeta('meta[property="og:title"]', "property", "og:title", input.title);
  setMeta('meta[property="og:description"]', "property", "og:description", input.description);
  setMeta('meta[property="og:image"]', "property", "og:image", input.ogImage);
  return canonical.href;
}
