type JsonRecord = Record<string, any>;

const clean = (value: unknown, maximum: number) =>
  (typeof value === "string" ? value.trim() : "").slice(0, maximum);

export function deterministicSeoDefaults(seoValue: unknown, payloadValue: unknown, canonicalPath: string): JsonRecord {
  const seo = seoValue && typeof seoValue === "object" && !Array.isArray(seoValue) ? structuredClone(seoValue) as JsonRecord : {};
  const payload = payloadValue && typeof payloadValue === "object" && !Array.isArray(payloadValue) ? payloadValue as JsonRecord : {};
  const title = clean(seo.title, 70) || clean(payload.title, 70);
  const description = clean(seo.description, 180) || clean(payload.summary, 180);
  return {
    ...seo,
    title,
    description,
    canonicalPath: clean(seo.canonicalPath, 240) || canonicalPath,
    ogTitle: clean(seo.ogTitle, 70) || title,
    ogDescription: clean(seo.ogDescription, 180) || description,
  };
}
