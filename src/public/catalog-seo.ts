export function applyCatalogSeo(input: { title: string; canonicalPath: string; indexable?: boolean }) {
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
  return canonical.href;
}
