export function applyCatalogSeo(input: {
  title: string;
  description?: string;
  canonicalPath: string;
  indexable?: boolean;
  ogImage?: string;
}) {
  const publicPath = /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/?)*$/;
  const safeCanonicalPath =
    input.canonicalPath.length <= 300 && publicPath.test(input.canonicalPath) ? input.canonicalPath : "/";
  const safeOgImage = (() => {
    if (!input.ogImage || input.ogImage.length > 2_000) return undefined;
    try {
      const url = new URL(input.ogImage);
      if (url.protocol !== "https:" || url.username || url.password) return undefined;
      if (
        [...url.searchParams.keys()].some((key) =>
          /^(?:access[_-]?token|refresh[_-]?token|token|api[_-]?key|apikey|key|secret|signature|sig|credential|authorization|password)$/i.test(
            key,
          ),
        )
      )
        return undefined;
      return url.href;
    } catch {
      return undefined;
    }
  })();
  document.title = input.title;
  let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.append(canonical);
  }
  canonical.href = new URL(safeCanonicalPath, window.location.origin).href;

  let robots = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
  if (!robots) {
    robots = document.createElement("meta");
    robots.name = "robots";
    document.head.append(robots);
  }
  robots.content =
    input.indexable && safeCanonicalPath === input.canonicalPath ? "index,follow" : "noindex,follow";
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
  setMeta('meta[property="og:image"]', "property", "og:image", safeOgImage);
  return canonical.href;
}
