import { publicWireLeak } from "./cms-public-wire.ts";

type SitemapRow = {
  content_type?: unknown;
  slug?: unknown;
  published_at?: unknown;
  route?: unknown;
};

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const publicPathPattern = /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/?)*$/;
const embeddedDigestPattern = /(?:^|[^0-9a-f])[0-9a-f]{40,128}(?:$|[^0-9a-f])/i;
const publicPrefixes = new Map([
  ["product", "/produtos/"],
  ["service", "/servicos/"],
  ["industry", "/industrias/"],
  ["application", "/aplicacoes/"],
  ["solution", "/solucoes/"],
  ["post", "/blog/"],
]);
const routedTypes = new Set(["campaign", "page", "homepage"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPublicInternetHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    !host.includes(".") ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "::" ||
    host === "::1" ||
    /^(?:fc|fd|fe[89ab])/i.test(host)
  )
    return false;
  const ipv4 = host.split(".").map(Number);
  if (ipv4.length !== 4 || ipv4.some((part) => !Number.isInteger(part) || part < 0 || part > 255))
    return true;
  const [first, second] = ipv4;
  return !(
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    first >= 224
  );
}

function canonicalPublicOrigin(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 300 || embeddedDigestPattern.test(value)) return null;
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash ||
      !isPublicInternetHostname(parsed.hostname)
    )
      return null;
    return publicWireLeak({ origin: parsed.origin }) ? null : parsed.origin;
  } catch {
    return null;
  }
}

function sitemapPath(row: SitemapRow): string | null {
  if (typeof row.content_type !== "string") return null;
  const prefix = publicPrefixes.get(row.content_type);
  let path: unknown;
  if (prefix) path = typeof row.slug === "string" && slugPattern.test(row.slug) ? `${prefix}${row.slug}` : null;
  else if (routedTypes.has(row.content_type)) path = isRecord(row.route) ? row.route.path : null;
  else return null;
  if (
    typeof path !== "string" ||
    path.length > 300 ||
    !publicPathPattern.test(path) ||
    embeddedDigestPattern.test(path) ||
    publicWireLeak({ path })
  )
    return null;
  return path;
}

export function buildPublicSitemapXml(rows: SitemapRow[], originValue: unknown): string | null {
  const origin = canonicalPublicOrigin(originValue);
  if (!origin || !Array.isArray(rows)) return null;
  const paths = new Set<string>();
  const entries: string[] = [];
  for (const row of rows) {
    const path = sitemapPath(row);
    if (!path || paths.has(path) || typeof row.published_at !== "string") return null;
    const timestamp = Date.parse(row.published_at);
    if (!Number.isFinite(timestamp)) return null;
    const lastModified = new Date(timestamp).toISOString();
    if (publicWireLeak({ path, lastModified })) return null;
    paths.add(path);
    entries.push(`<url><loc>${origin}${path}</loc><lastmod>${lastModified}</lastmod></url>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join("")}</urlset>`;
}
