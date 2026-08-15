import { useEffect } from "react";

/**
 * Componente SEO sem dependência externa (TASK 28).
 *
 * Usa useEffect para manipular document.head diretamente — equivalente
 * funcional ao react-helmet-async sem o overhead de ~30KB.
 *
 * Aplicado em todas as páginas principais com:
 *   - <title> dinâmico
 *   - meta description, keywords, canonical
 *   - Open Graph (Facebook, LinkedIn, WhatsApp)
 *   - Twitter Cards
 *   - Schema.org JSON-LD
 *
 * @example
 * <SEO
 *   title="Aplicações Industriais"
 *   description="Casos de uso reais..."
 *   path="/aplicacoes"
 *   schema={{ "@context": "https://schema.org", "@type": "CollectionPage", ... }}
 * />
 */

const BASE_URL = "https://gaiatecsistemas.com.br";
const SITE_NAME = "Gaiatec Sistemas";
const DEFAULT_IMAGE = `${BASE_URL}/images/social/gaiatec-institucional.jpg`;

interface SEOProps {
  /** Título da página (será concatenado com " — Gaiatec Sistemas" automaticamente) */
  title: string;
  /** Meta description (recomendado: 140-160 caracteres) */
  description: string;
  /** Path da página (ex: "/produtos/1-medidor-vazao") — usado em canonical e OG URL */
  path: string;
  /** URL absoluta da imagem para OG/Twitter Card. Default: imagem social institucional da Gaiatec. */
  image?: string;
  /** Tipo OG (default "website" — pra páginas use "article" ou "product") */
  ogType?: "website" | "article" | "product";
  /** Keywords (separadas por vírgula) — opcional */
  keywords?: string;
  /** Schema.org JSON-LD object — gerado dinamicamente por página */
  schema?: Record<string, unknown> | Array<Record<string, unknown>>;
  /** Se true, marca como noindex (raro — usado em busca interna, etc) */
  noindex?: boolean;
}

/** Helper: cria ou atualiza uma meta tag */
function upsertMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

/** Helper: cria ou atualiza um link tag (canonical, etc) */
function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/** Helper: cria ou atualiza o JSON-LD schema script (id-marked) */
function upsertSchema(schema: SEOProps["schema"]) {
  // Remove qualquer schema dinâmico anterior (id="seo-dynamic-schema")
  const existing = document.head.querySelector('script[id="seo-dynamic-schema"]');
  if (existing) existing.remove();

  if (!schema) return;

  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.id = "seo-dynamic-schema";
  script.text = JSON.stringify(schema);
  document.head.appendChild(script);
}

export function SEO({
  title,
  description,
  path,
  image = DEFAULT_IMAGE,
  ogType = "website",
  keywords,
  schema,
  noindex = false,
}: SEOProps) {
  useEffect(() => {
    const fullTitle = title.includes(SITE_NAME) ? title : `${title} — ${SITE_NAME}`;
    const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;
    const imageUrl = image
      ? image.startsWith("http")
        ? image
        : `${BASE_URL}${image}`
      : DEFAULT_IMAGE;

    // Title
    document.title = fullTitle;

    // Meta description + keywords + robots
    upsertMeta("name", "description", description);
    if (keywords) upsertMeta("name", "keywords", keywords);
    upsertMeta("name", "robots", noindex ? "noindex, nofollow" : "index, follow");

    // Canonical
    upsertLink("canonical", url);

    // Open Graph
    upsertMeta("property", "og:type", ogType);
    upsertMeta("property", "og:site_name", SITE_NAME);
    upsertMeta("property", "og:title", fullTitle);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:url", url);
    upsertMeta("property", "og:image", imageUrl);
    upsertMeta("property", "og:locale", "pt_BR");

    // Twitter Cards
    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", fullTitle);
    upsertMeta("name", "twitter:description", description);
    upsertMeta("name", "twitter:image", imageUrl);

    // Schema.org JSON-LD
    upsertSchema(schema);

    // Cleanup quando desmontar (volta ao default genérico)
    return () => {
      // Não limpamos meta tags pra evitar flicker — o próximo SEO sobrescreve
      // Apenas removemos o schema dinâmico
      const scriptEl = document.head.querySelector('script[id="seo-dynamic-schema"]');
      if (scriptEl) scriptEl.remove();
    };
  }, [title, description, path, image, ogType, keywords, schema, noindex]);

  return null;
}

/* ─────────────────────────────────────────────────────────
   Helpers para gerar schemas Schema.org comuns
   ───────────────────────────────────────────────────────── */

/** Schema.org BreadcrumbList — usado em páginas com hierarquia */
export function buildBreadcrumb(items: { label: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.label,
      item: item.path.startsWith("http") ? item.path : `${BASE_URL}${item.path}`,
    })),
  };
}

/** Schema.org Product — produtos comerciais com offers */
export function buildProductSchema(p: {
  name: string;
  description: string;
  image: string;
  category?: string;
  sku?: string;
  brand?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.description,
    image: p.image.startsWith("http") ? p.image : `${BASE_URL}${p.image}`,
    ...(p.category ? { category: p.category } : {}),
    ...(p.sku ? { sku: p.sku } : {}),
    brand: {
      "@type": "Brand",
      name: p.brand ?? SITE_NAME,
    },
    offers: {
      "@type": "Offer",
      availability: "https://schema.org/InStock",
      priceCurrency: "BRL",
      url: BASE_URL,
      seller: {
        "@type": "Organization",
        name: SITE_NAME,
      },
    },
  };
}

/** Schema.org Service — serviços técnicos */
export function buildServiceSchema(s: {
  name: string;
  description: string;
  image?: string;
  provider?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: s.name,
    description: s.description,
    ...(s.image
      ? { image: s.image.startsWith("http") ? s.image : `${BASE_URL}${s.image}` }
      : {}),
    provider: {
      "@type": "Organization",
      name: s.provider ?? SITE_NAME,
      url: BASE_URL,
    },
    areaServed: {
      "@type": "Country",
      name: "Brasil",
    },
  };
}

/** Schema.org CollectionPage — listings de itens (ex: /produtos, /servicos) */
export function buildCollectionPageSchema(c: {
  name: string;
  description: string;
  itemCount?: number;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: c.name,
    description: c.description,
    ...(c.itemCount ? { numberOfItems: c.itemCount } : {}),
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: BASE_URL,
    },
  };
}
