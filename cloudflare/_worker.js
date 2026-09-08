const STATIC_PUBLIC_ROUTES = [
  /^\/(blog|busca|servicos|produtos|industrias|aplicacoes|solucoes)\/?$/,
  /^\/produtos\/comparador\/?$/,
];

const CMS_PUBLIC_API = "__CMS_PUBLIC_API__";
const CMS_PUBLIC_ANON_KEY = "__CMS_PUBLIC_ANON_KEY__";

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "script-src 'self' https://challenges.cloudflare.com",
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://challenges.cloudflare.com https://brasilapi.com.br https://nominatim.openstreetmap.org",
  "frame-src https://challenges.cloudflare.com https://www.google.com https://www.openstreetmap.org",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

const AVIF_ENCODER_WORKER_PATH = /^\/assets\/avif-encoder\.worker-[A-Za-z0-9_-]+\.js$/;
const AVIF_ENCODER_WORKER_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "connect-src 'self'",
  "worker-src 'none'",
].join("; ");
const PUBLIC_DOCUMENT_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "sandbox",
].join("; ");

// Cloudflare module workers only accept callable named exports. Keeping the
// policy behind this function makes it testable without exporting raw data as
// an invalid Worker entrypoint.
export function contentSecurityPolicy(pathname = "/") {
  return AVIF_ENCODER_WORKER_PATH.test(pathname)
    ? AVIF_ENCODER_WORKER_CONTENT_SECURITY_POLICY
    : CONTENT_SECURITY_POLICY;
}

const STATIC_REDIRECTS = new Map([
  ["/servicos/calibracao-rbc-laboratorio", "/servicos/calibracao-de-instrumentos"],
  ["/setores", "/industrias"],
  ["/setores/saneamento", "/industrias/saneamento"],
  ["/setores/gas-petroleo", "/industrias/oleo-e-gas"],
  ["/setores/hvac", "/industrias/hvac"],
  ["/setores/agronegocio", "/industrias/agronegocio"],
  ["/setores/industria", "/industrias/processos-industriais"],
  ["/setores/biogas-biometano", "/industrias/biogas-biometano"],
  ["/setores/protecao-catodica", "/industrias/protecao-catodica"],
  ["/setores/controle-ambiental", "/industrias/controle-ambiental"],
  ["/setores/seguranca-operacional", "/industrias/seguranca-operacional"],
  ["/setores/instrumentacao", "/industrias/instrumentacao"],
  ["/setores/telemetria", "/industrias/telemetria"],
]);

const SITEMAP_CONTENT_TYPES = new Map([
  ["/sitemap-produtos.xml", "product"],
  ["/sitemap-blog.xml", "post"],
  ["/sitemap-conteudo.xml", "service,industry,application,solution,campaign,page,homepage"],
]);

function schemaSpecificationValue(item) {
  if (item?.type === "enum" && Array.isArray(item.value)) return item.value.join(", ");
  if (
    item?.type === "range" &&
    item.value &&
    typeof item.value === "object" &&
    Number.isFinite(item.value.min) &&
    Number.isFinite(item.value.max)
  ) {
    return {
      "@type": "QuantitativeValue",
      minValue: item.value.min,
      maxValue: item.value.max,
      ...(item.unit ? { unitText: item.unit } : {}),
    };
  }
  if (typeof item?.value === "boolean") return item.value ? "Sim" : "Não";
  return typeof item?.value === "string" || typeof item?.value === "number" ? item.value : "";
}

function isPublicRoute(path) {
  return STATIC_PUBLIC_ROUTES.some((pattern) => pattern.test(path));
}

const PRIVATE_ROUTE = /^\/(relatorio-de-obra|admin|preview|cms\/conteudo)(?:\/|$)/;
const RDO_ROUTES =
  /^\/relatorio-de-obra(?:\/(login|definir-senha|assinar\/[^/]+|arquivo|novo|relatorio\/[^/]+|equipe))?\/?$/;
const ADMIN_ROUTES =
  /^\/admin(?:\/(login|recuperar-senha|definir-senha|mfa|meu-trabalho|assistente|assistente\/execucao|conteudo(?:\/novo|\/[0-9a-f-]{36})?|produtos(?:\/novo|\/importacao|\/[0-9a-f-]{36})?|descoberta\/(?:service|industry|application|solution)(?:\/(?:novo|[0-9a-f-]{36}))?|busca|qualidade|listas-mestras|dados-mestres|pim|paginas(?:\/(?:novo|[0-9a-f-]{36}))?|estudio-visual(?:\/[0-9a-f-]{36})?|sites|site|marketing(?:\/campanhas\/(?:novo|[0-9a-f-]{36})|\/formularios)?|leads|midia|perfil|usuarios|auditoria|diagnosticos))?\/?$/;
const PREVIEW_ROUTES = /^\/preview\/[A-Za-z0-9_-]{43}\/?$/;
const CMS_DEMO_ROUTES = /^\/cms\/conteudo\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/;
const ASSET_PATH =
  /^\/(assets|images|fonts)\/|\.(?:js|mjs|css|map|png|jpe?g|webp|avif|svg|gif|ico|woff2?|ttf|pdf|xlsx|xml|txt|json|webmanifest)$/i;

function securityHeaders(headers, { noindex = false, privateRoute = false } = {}) {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", privateRoute ? "DENY" : "SAMEORIGIN");
  headers.set("Referrer-Policy", privateRoute ? "no-referrer" : "strict-origin-when-cross-origin");
  headers.set(
    "Permissions-Policy",
    privateRoute
      ? "camera=(self), microphone=(), geolocation=(self)"
      : "camera=(), microphone=(), geolocation=()",
  );
  headers.set("Strict-Transport-Security", "max-age=31536000");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  if (noindex) headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  if (privateRoute) headers.set("Cache-Control", "private, no-store, max-age=0");
  return headers;
}

function withHeaders(response, options) {
  const headers = securityHeaders(new Headers(response.headers), options);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function redirectResponse(location, status) {
  return new Response(null, {
    status,
    headers: { Location: location, "Cache-Control": "public, max-age=0, must-revalidate" },
  });
}

function deploymentEnvironment(requestUrl, env) {
  const hostname = requestUrl.hostname.toLowerCase();
  if (hostname === "127.0.0.1" || hostname === "localhost") return "local";
  if (hostname === "gaiatec-cms-staging.pages.dev" || hostname.endsWith(".gaiatec-cms-staging.pages.dev"))
    return "staging";
  if (hostname === "gaiatec-website.pages.dev" || hostname.endsWith(".gaiatec-website.pages.dev"))
    return "production-preview";
  if (
    (hostname === "gaiatecsistemas.com.br" || hostname === "www.gaiatecsistemas.com.br") &&
    env.CF_PAGES_BRANCH === "main"
  )
    return "production";
  return "unknown";
}

function applyContentSecurityPolicy(headers, environment, env, pathname) {
  if (
    pathname === PUBLIC_ASSET_BRIDGE_PATH &&
    (headers.get("Content-Type") ?? "").toLowerCase().startsWith("application/pdf")
  ) {
    headers.delete("Content-Security-Policy-Report-Only");
    headers.set("Content-Security-Policy", PUBLIC_DOCUMENT_CONTENT_SECURITY_POLICY);
    return headers;
  }
  const enforce =
    environment === "production" ||
    environment === "production-preview" ||
    (environment === "staging" && env.CF_PAGES_BRANCH === "ev2-g16-csp-canary");
  headers.delete(enforce ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy");
  headers.set(
    enforce ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only",
    contentSecurityPolicy(pathname),
  );
  return headers;
}

function healthResponse(request, env) {
  const requestUrl = new URL(request.url);
  const environment = deploymentEnvironment(requestUrl, env);
  const release = env.CF_PAGES_COMMIT_SHA ?? "local";
  const headers = securityHeaders(
    new Headers({
      "Cache-Control": "no-store, max-age=0",
      "Content-Type": "application/json; charset=utf-8",
    }),
    { noindex: environment !== "production" },
  );
  return new Response(
    JSON.stringify({
      schemaVersion: 1,
      status: environment === "unknown" ? "degraded" : "ready",
      release,
      environment,
    }),
    { status: environment === "unknown" ? 503 : 200, headers },
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function replaceMeta(html, attribute, name, content) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<meta\\s+${attribute}=["']${escapedName}["'][^>]*>`, "i");
  const tag = `<meta ${attribute}="${escapeHtml(name)}" content="${escapeHtml(content)}" />`;
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace("</head>", `  ${tag}\n  </head>`);
}

function injectPageMetadata(html, page, requestUrl, env, stagingHost) {
  const seo = page?.seo ?? {};
  const canonicalOrigin = String(env.PUBLIC_SITE_ORIGIN || "https://gaiatecsistemas.com.br").replace(
    /\/$/,
    "",
  );
  const canonicalUrl = `${canonicalOrigin}${seo.canonicalPath || requestUrl.pathname}`;
  const title = seo.title || page?.payload?.title || "Gaiatec Sistemas";
  const description = seo.description || page?.payload?.summary || "Soluções tecnológicas Gaiatec Sistemas.";
  const indexable = seo.indexable === true && !stagingHost;
  const ogImage = typeof seo.socialImage === "string" ? seo.socialImage : undefined;

  let result = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  result = replaceMeta(result, "name", "description", description);
  result = replaceMeta(result, "name", "robots", indexable ? "index, follow" : "noindex, follow");
  result = replaceMeta(result, "property", "og:title", title);
  result = replaceMeta(result, "property", "og:description", description);
  result = replaceMeta(result, "property", "og:url", canonicalUrl);
  result = replaceMeta(result, "property", "og:type", page?.kind === "post" ? "article" : "website");
  result = replaceMeta(result, "name", "twitter:title", title);
  result = replaceMeta(result, "name", "twitter:description", description);
  if (ogImage) {
    result = replaceMeta(result, "property", "og:image", ogImage);
    result = replaceMeta(result, "name", "twitter:image", ogImage);
  }

  const canonicalTag = `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`;
  result = /<link\s+rel=["']canonical["'][^>]*>/i.test(result)
    ? result.replace(/<link\s+rel=["']canonical["'][^>]*>/i, canonicalTag)
    : result.replace("</head>", `  ${canonicalTag}\n  </head>`);

  const schema = JSON.stringify(
    page?.kind === "post"
      ? {
          "@context": "https://schema.org",
          "@type": "Article",
          headline: page.payload?.title || title,
          description,
          url: canonicalUrl,
          datePublished: page.publishedAt,
          author: page.payload?.author?.name
            ? { "@type": "Person", name: page.payload.author.name }
            : undefined,
          articleSection: page.payload?.category?.name,
          keywords: page.payload?.tags?.map((tag) => tag.name).join(", "),
        }
      : page?.kind === "product"
        ? {
            "@context": "https://schema.org",
            "@type": "Product",
            name: page.payload?.title || title,
            description,
            url: canonicalUrl,
            image: ogImage,
            brand: page.payload?.brand?.name
              ? { "@type": "Brand", name: page.payload.brand.name }
              : undefined,
            manufacturer: page.payload?.manufacturer?.name
              ? { "@type": "Organization", name: page.payload.manufacturer.name }
              : undefined,
            model: page.payload?.models?.[0]?.model,
            sku: page.payload?.models?.[0]?.sku,
            category:
              page.payload?.controlledClassification?.productCategory?.label ??
              page.payload?.classification?.category,
            additionalProperty: (page.payload?.specifications ?? []).slice(0, 50).map((item) => ({
              "@type": "PropertyValue",
              name: item.label,
              value: schemaSpecificationValue(item),
              ...(item.type === "range" || !item.unit ? {} : { unitText: item.unit }),
            })),
          }
        : {
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: title,
            description,
            url: canonicalUrl,
          },
  ).replaceAll("<", "\\u003c");
  return result.replace(
    "</head>",
    `  <script type="application/ld+json" data-cms-page>${schema}</script>\n  </head>`,
  );
}

async function spaResponse(request, env, status, options = {}) {
  const { page, stagingHost = false, ...headerOptions } = options;
  // O asset binding do Pages normaliza /index.html para /; buscar a raiz evita
  // a resposta de redirect sem corpo e não reentra no Worker.
  const indexUrl = new URL("/", request.url);
  const index = await env.ASSETS.fetch(new Request(indexUrl, request));
  const headers = new Headers(index.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");
  if (page) headers.set("Cache-Control", "public, max-age=0, must-revalidate");
  else if (status >= 400) headers.set("Cache-Control", "no-store, max-age=0");
  securityHeaders(headers, headerOptions);
  if (!page) return new Response(index.body, { status, headers });

  const requestUrl = new URL(request.url);
  const html = injectPageMetadata(
    await index.text(),
    legacyMetadataPage(page, requestUrl),
    requestUrl,
    env,
    stagingHost,
  );
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  headers.delete("ETag");
  return new Response(html, { status, headers });
}

async function cmsPublic(params, env = {}) {
  const endpoint = env.CMS_PUBLIC_API ?? CMS_PUBLIC_API;
  const anonKey = env.CMS_PUBLIC_ANON_KEY ?? CMS_PUBLIC_ANON_KEY;
  if (endpoint.startsWith("__") || anonKey.startsWith("__")) return null;
  const target = new URL(endpoint);
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    return await fetch(target, {
      headers: { apikey: anonKey },
      signal: controller.signal,
    });
  } catch {
    return new Response(null, { status: 503 });
  } finally {
    clearTimeout(timeout);
  }
}

const PUBLIC_ASSET_BRIDGE_PATH = "/__cms-public-asset";
const PUBLIC_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PUBLIC_PATH_PATTERN = /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/?)*$/;
const LEGACY_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUBLIC_MEDIA_SLOT_PATTERN =
  /^(?:primary|social|media-[1-9][0-9]?|block-[1-9][0-9]?(?:-(?:image|item)-[1-9][0-9]?)?)$/;
const PUBLIC_ASSET_KINDS = new Set([
  "product",
  "service",
  "industry",
  "application",
  "solution",
  "page",
  "homepage",
  "post",
  "campaign",
]);

function isObjectRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function compatiblePublicRouteRule(value) {
  if (!isObjectRecord(value)) return null;
  const keys = Object.keys(value);
  const camel = keys.length === 2 && keys.includes("destinationPath") && keys.includes("status");
  const snake = keys.length === 2 && keys.includes("destination_path") && keys.includes("status_code");
  if (!camel && !snake) return null;
  const status = Number(camel ? value.status : value.status_code);
  const destination = camel ? value.destinationPath : value.destination_path;
  if (![301, 302, 404, 410].includes(status)) return null;
  if (status === 301 || status === 302) {
    if (typeof destination !== "string" || !PUBLIC_PATH_PATTERN.test(destination)) return null;
    return { destinationPath: destination, status };
  }
  return destination === null ? { destinationPath: null, status } : null;
}

function compatibleAssetPath(kind, slug, path) {
  const prefixes = {
    product: "/produtos/",
    service: "/servicos/",
    industry: "/industrias/",
    application: "/aplicacoes/",
    solution: "/solucoes/",
    post: "/blog/",
    campaign: "/campanhas/",
  };
  if (kind === "homepage") return path === "/";
  if (kind === "page") return PUBLIC_PATH_PATTERN.test(path);
  return prefixes[kind] ? path === `${prefixes[kind]}${slug}` : false;
}

function parsePublicAssetRequest(request) {
  if (request.method !== "GET") return null;
  const url = new URL(request.url);
  if (url.pathname !== PUBLIC_ASSET_BRIDGE_PATH) return null;
  const type = url.searchParams.get("type");
  const expectedKeys =
    type === "media"
      ? ["type", "kind", "slug", "path", "slot"]
      : ["type", "kind", "slug", "path", "position"];
  const keys = [...url.searchParams.keys()];
  if (
    !["media", "document"].includes(type) ||
    keys.length !== expectedKeys.length ||
    new Set(keys).size !== keys.length ||
    !expectedKeys.every((key) => keys.includes(key))
  )
    return null;
  const kind = url.searchParams.get("kind") ?? "";
  const slug = url.searchParams.get("slug") ?? "";
  const path = url.searchParams.get("path") ?? "";
  if (
    !PUBLIC_ASSET_KINDS.has(kind) ||
    !PUBLIC_SLUG_PATTERN.test(slug) ||
    slug.length > 160 ||
    path.length > 300 ||
    !compatibleAssetPath(kind, slug, path)
  )
    return null;
  if (type === "media") {
    const slot = url.searchParams.get("slot") ?? "";
    return PUBLIC_MEDIA_SLOT_PATTERN.test(slot) ? { type, kind, slug, path, selector: slot } : null;
  }
  const positionText = url.searchParams.get("position") ?? "";
  const position = Number(positionText);
  return /^(?:[1-9]|[12][0-9]|30)$/.test(positionText) && Number.isInteger(position)
    ? { type, kind, slug, path, selector: positionText }
    : null;
}

function publicAssetUrl(origin, row, type, selector) {
  if (
    !isObjectRecord(row) ||
    !PUBLIC_ASSET_KINDS.has(row.content_type) ||
    !PUBLIC_SLUG_PATTERN.test(row.slug ?? "") ||
    typeof row.path !== "string" ||
    !compatibleAssetPath(row.content_type, row.slug, row.path)
  )
    return null;
  const url = new URL(PUBLIC_ASSET_BRIDGE_PATH, origin);
  url.search = new URLSearchParams({
    type,
    kind: row.content_type,
    slug: row.slug,
    path: row.path,
    [type === "media" ? "slot" : "position"]: selector,
  }).toString();
  return url.toString();
}

function legacyMediaSlots(payload, seo) {
  const slots = new Map();
  if (!isObjectRecord(payload)) return slots;
  const register = (slot, id) => {
    if (typeof id === "string" && LEGACY_UUID_PATTERN.test(id)) slots.set(slot, id.toLowerCase());
  };
  const media = Array.isArray(payload.media) ? payload.media : [];
  media.forEach((entry, index) => {
    if (isObjectRecord(entry))
      register(entry.role === "primary" ? "primary" : `media-${index + 1}`, entry.assetId);
  });
  const blocks = Array.isArray(payload.blocks) ? payload.blocks : [];
  blocks.forEach((block, blockIndex) => {
    if (!isObjectRecord(block) || !isObjectRecord(block.data)) return;
    const prefix = `block-${blockIndex + 1}`;
    register(prefix, block.data.assetId);
    if (Array.isArray(block.data.assetIds))
      block.data.assetIds.forEach((id, index) => register(`${prefix}-image-${index + 1}`, id));
    if (Array.isArray(block.data.items))
      block.data.items.forEach((item, index) => {
        if (isObjectRecord(item)) register(`${prefix}-item-${index + 1}`, item.assetId);
      });
  });
  if (isObjectRecord(seo)) register("social", seo.ogImageId);
  return slots;
}

function legacySignedStorageIdentity(source, type, apiEndpoint) {
  if (typeof source !== "string" || source.length > 8_000) return null;
  try {
    const parsed = new URL(source);
    const api = new URL(apiEndpoint);
    const bucket = type === "media" ? "cms-media-private" : "cms-documents-private";
    const parameters = [...parsed.searchParams.entries()];
    if (
      parsed.origin !== api.origin ||
      parsed.username ||
      parsed.password ||
      !parsed.pathname.startsWith(`/storage/v1/object/sign/${bucket}/`) ||
      parameters.length !== 1 ||
      parameters[0]?.[0] !== "token" ||
      !parameters[0]?.[1]
    )
      return null;
    return parsed.pathname;
  } catch {
    return null;
  }
}

async function boundedJson(response, maximum = 2_000_000) {
  const declared = Number(response.headers.get("Content-Length") ?? 0);
  if (declared && (!Number.isSafeInteger(declared) || declared > maximum)) return null;
  const text = await response.text();
  if (text.length > maximum) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function unwrapLegacyAssetRow(value, descriptor) {
  const row =
    descriptor.kind === "page" || descriptor.kind === "homepage"
      ? value?.kind === "page"
        ? value.page
        : null
      : value;
  if (
    !isObjectRecord(row) ||
    row.content_type !== descriptor.kind ||
    row.slug !== descriptor.slug ||
    row.path !== descriptor.path ||
    !LEGACY_UUID_PATTERN.test(row.item_id ?? "") ||
    !LEGACY_UUID_PATTERN.test(row.revision_id ?? "") ||
    !isObjectRecord(row.payload) ||
    !isObjectRecord(row.seo) ||
    !isObjectRecord(row.media_urls) ||
    !isObjectRecord(row.media_alt) ||
    !isObjectRecord(row.document_urls)
  )
    return null;
  if (
    (descriptor.kind === "page" || descriptor.kind === "campaign") &&
    (!isObjectRecord(row.payload.route) || row.payload.route.path !== descriptor.path)
  )
    return null;
  return row;
}

async function loadAssetResource(fetchPublic, descriptor) {
  const params =
    descriptor.kind === "page" || descriptor.kind === "homepage"
      ? { type: "page-by-path", path: descriptor.path }
      : descriptor.kind === "campaign"
        ? { type: "campaign-by-path", path: descriptor.path }
        : descriptor.kind === "post"
          ? { type: "post-detail", slug: descriptor.slug }
          : descriptor.kind === "product"
            ? { type: "detail", contentType: "product", slug: descriptor.slug }
            : { type: "entity-detail", contentType: descriptor.kind, slug: descriptor.slug };
  const response = await fetchPublic(params);
  if (!response?.ok)
    return {
      generation: "error",
      status: response?.status === 404 ? 404 : response?.status === 429 ? 429 : 503,
    };
  const value = await boundedJson(response);
  const legacy = unwrapLegacyAssetRow(value, descriptor);
  if (legacy) return { generation: "legacy", row: legacy };
  const candidate =
    descriptor.kind === "page" || descriptor.kind === "homepage"
      ? value?.kind === "page"
        ? value.page
        : null
      : value;
  return isObjectRecord(candidate) &&
    candidate.kind === descriptor.kind &&
    candidate.slug === descriptor.slug &&
    candidate.path === descriptor.path &&
    isObjectRecord(candidate.payload) &&
    isObjectRecord(candidate.seo)
    ? { generation: "candidate", row: candidate }
    : null;
}

function legacyAssetSource(row, descriptor, apiEndpoint) {
  if (descriptor.type === "media") {
    const assetId = legacyMediaSlots(row.payload, row.seo).get(descriptor.selector);
    if (!assetId) return null;
    const variants = [
      "large.avif",
      "large.webp",
      "medium.webp",
      "thumbnail.webp",
      "medium.avif",
      "thumbnail.avif",
    ];
    const source = variants.map((variant) => row.media_urls[`${assetId}:${variant}`]).find(Boolean);
    const identity = legacySignedStorageIdentity(source, "media", apiEndpoint);
    return identity ? { id: assetId, source, identity, title: "imagem" } : null;
  }
  const document = Array.isArray(row.payload.documents)
    ? row.payload.documents[Number(descriptor.selector) - 1]
    : null;
  if (
    !isObjectRecord(document) ||
    document.visibility !== "public" ||
    !LEGACY_UUID_PATTERN.test(document.id ?? "")
  )
    return null;
  const source = row.document_urls[String(document.id).toLowerCase()] ?? row.document_urls[document.id];
  const identity = legacySignedStorageIdentity(source, "document", apiEndpoint);
  return identity ? { id: String(document.id).toLowerCase(), source, identity, title: document.title } : null;
}

function assetBytesMatch(type, contentType, bytes) {
  if (type === "document")
    return contentType === "application/pdf" && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  if (!/^image\/(?:avif|webp|png|jpeg|gif)$/.test(contentType)) return false;
  if (contentType === "image/png")
    return (
      bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
    );
  if (contentType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === "image/gif") return new TextDecoder().decode(bytes.slice(0, 4)) === "GIF8";
  if (contentType === "image/webp")
    return (
      new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
      new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
    );
  return new TextDecoder().decode(bytes.slice(4, 32)).includes("ftypavif");
}

async function readPublicAsset(response, type) {
  const maximum = type === "media" ? 20_000_000 : 50_000_000;
  const contentType = (response.headers.get("Content-Type") ?? "").split(";", 1)[0].trim().toLowerCase();
  const declared = Number(response.headers.get("Content-Length") ?? 0);
  if (!response.ok || (declared && (!Number.isSafeInteger(declared) || declared > maximum))) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  return bytes.byteLength > 0 && bytes.byteLength <= maximum && assetBytesMatch(type, contentType, bytes)
    ? { bytes, contentType }
    : null;
}

function safeAssetResponse(asset, type, title = "documento") {
  const headers = new Headers({
    "Content-Type": asset.contentType,
    "Content-Length": String(asset.bytes.byteLength),
    "X-Content-Type-Options": "nosniff",
  });
  if (type === "media") {
    headers.set("Cache-Control", "public, max-age=0, must-revalidate");
    headers.set("Cross-Origin-Resource-Policy", "same-origin");
  } else {
    const stem = String(title ?? "documento")
      .replace(/\.pdf$/i, "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 170);
    headers.set("Cache-Control", "private, no-store");
    headers.set("Content-Disposition", `attachment; filename="${stem || "documento"}.pdf"`);
    headers.set("Content-Security-Policy", "sandbox");
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  }
  return new Response(asset.bytes, { status: 200, headers });
}

function publicAssetFailure(status = 404) {
  const normalized = status === 429 ? 429 : status >= 500 ? 503 : 404;
  return new Response(
    normalized === 429 ? "Too Many Requests" : normalized === 503 ? "Service Unavailable" : "Not Found",
    {
      status: normalized,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    },
  );
}

export async function publicAssetCompatibilityResponse(
  request,
  fetchPublic = cmsPublic,
  apiEndpoint = CMS_PUBLIC_API,
) {
  const descriptor = parsePublicAssetRequest(request);
  if (!descriptor) return publicAssetFailure(404);
  const resource = await loadAssetResource(fetchPublic, descriptor);
  if (!resource) return publicAssetFailure(404);
  if (resource.generation === "error") return publicAssetFailure(resource.status);
  if (resource.generation === "candidate") {
    const candidate = await fetchPublic({
      type: descriptor.type,
      kind: descriptor.kind,
      slug: descriptor.slug,
      [descriptor.type === "media" ? "slot" : "position"]: descriptor.selector,
    });
    if (!candidate?.ok) return publicAssetFailure(candidate?.status ?? 503);
    const asset = await readPublicAsset(candidate, descriptor.type);
    return asset ? safeAssetResponse(asset, descriptor.type) : publicAssetFailure(503);
  }

  const source = legacyAssetSource(resource.row, descriptor, apiEndpoint);
  if (!source) return publicAssetFailure(404);
  let upstream;
  try {
    upstream = await fetch(source.source, { redirect: "error", signal: AbortSignal.timeout(5_000) });
  } catch {
    return publicAssetFailure(503);
  }
  const asset = await readPublicAsset(upstream, descriptor.type);
  if (!asset) return publicAssetFailure(503);
  const confirmedResource = await loadAssetResource(fetchPublic, descriptor);
  const confirmed =
    confirmedResource?.generation === "legacy"
      ? legacyAssetSource(confirmedResource.row, descriptor, apiEndpoint)
      : null;
  if (!confirmed || confirmed.id !== source.id || confirmed.identity !== source.identity)
    return publicAssetFailure(404);
  return safeAssetResponse(asset, descriptor.type, source.title);
}

export function legacyMetadataPage(page, requestUrl) {
  if (!isObjectRecord(page)) return page;
  if (
    !PUBLIC_ASSET_KINDS.has(page.content_type) ||
    !isObjectRecord(page.payload) ||
    !isObjectRecord(page.seo) ||
    typeof page.published_at !== "string"
  )
    return page;
  const normalized = { ...page, kind: page.content_type, publishedAt: page.published_at };
  if (typeof page.seo.socialImage === "string" || !isObjectRecord(page.media_urls)) return normalized;
  const socialId = legacyMediaSlots(page.payload, page.seo).get("social");
  if (!socialId || !Object.keys(page.media_urls).some((key) => key.startsWith(`${socialId}:`)))
    return normalized;
  const socialImage = publicAssetUrl(requestUrl.origin, page, "media", "social");
  return socialImage ? { ...normalized, seo: { ...page.seo, socialImage } } : normalized;
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const stagingHost = url.hostname.endsWith(".pages.dev");
  const fetchCmsPublic = (params) => cmsPublic(params, env);
  const publicApiEndpoint = env.CMS_PUBLIC_API ?? CMS_PUBLIC_API;

  if (path === "/healthz") return healthResponse(request, env);
  if (path === PUBLIC_ASSET_BRIDGE_PATH)
    return publicAssetCompatibilityResponse(request, fetchCmsPublic, publicApiEndpoint);

  const normalizedPath = path.length > 1 ? path.replace(/\/$/, "") : path;
  const staticRedirect = STATIC_REDIRECTS.get(normalizedPath);
  if (staticRedirect) return redirectResponse(staticRedirect, 301);

  if (
    ["/sitemap.xml", "/sitemap-conteudo.xml", "/sitemap-produtos.xml", "/sitemap-blog.xml"].includes(path)
  ) {
    const contentTypes = SITEMAP_CONTENT_TYPES.get(path);
    const sitemap = await fetchCmsPublic({
      type: "sitemap",
      origin: url.origin,
      ...(contentTypes ? { contentTypes } : {}),
    });
    if (!sitemap?.ok) {
      const status = sitemap?.status === 404 ? 404 : 503;
      return new Response(status === 404 ? "Not Found" : "Service Unavailable", {
        status,
        headers: securityHeaders(new Headers({ "Cache-Control": "no-store, max-age=0" }), {
          noindex: true,
        }),
      });
    }
    return withHeaders(sitemap, { noindex: stagingHost });
  }

  if (/^\/blog\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(path)) {
    const slug = path.replace(/^\/blog\//, "").replace(/\/$/, "");
    const detail = await fetchCmsPublic({ type: "post-detail", slug });
    if (detail?.ok) {
      const page = await detail.json();
      return spaResponse(request, env, 200, {
        noindex: stagingHost || page?.seo?.indexable !== true,
        page,
        stagingHost,
      });
    }
    if (detail?.status === 404) {
      const redirect = await fetchCmsPublic({ type: "redirect", path: path.replace(/\/$/, "") });
      if (redirect?.ok) {
        const rule = compatiblePublicRouteRule(await redirect.json());
        const status = rule?.status;
        const destination = rule?.destinationPath;
        if ((status === 301 || status === 302) && destination) {
          return redirectResponse(destination, status);
        }
        if (status === 404 || status === 410) {
          return spaResponse(request, env, status, { noindex: true });
        }
      }
      return spaResponse(request, env, redirect && redirect.status !== 404 ? 503 : 404, {
        noindex: true,
      });
    }
    return spaResponse(request, env, 503, { noindex: true });
  }

  if (/^\/campanhas\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(path)) {
    const detail = await fetchCmsPublic({ type: "campaign-by-path", path: path.replace(/\/$/, "") });
    if (!detail?.ok) return spaResponse(request, env, detail?.status === 404 ? 404 : 503, { noindex: true });
    const resolution = await detail.json();
    if (resolution.kind === "route") {
      const rule = compatiblePublicRouteRule(resolution.rule);
      const status = rule?.status;
      const destination = rule?.destinationPath;
      if ((status === 301 || status === 302) && destination) return redirectResponse(destination, status);
      return spaResponse(request, env, status === 410 ? 410 : 404, { noindex: true });
    }
    if (resolution.kind === "fallback") return spaResponse(request, env, 404, { noindex: true });
    return spaResponse(request, env, 200, {
      noindex: stagingHost || resolution?.seo?.indexable !== true,
      page: resolution,
      stagingHost,
    });
  }

  if (/^\/produtos\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(path) && path !== "/produtos/comparador") {
    const slug = path.replace(/^\/produtos\//, "").replace(/\/$/, "");
    const detail = await fetchCmsPublic({ type: "detail", slug });
    if (detail?.ok) {
      const page = await detail.json();
      return spaResponse(request, env, 200, {
        noindex: stagingHost || page?.seo?.indexable !== true,
        page,
        stagingHost,
      });
    }
    if (detail?.status === 404) {
      const redirect = await fetchCmsPublic({ type: "redirect", path });
      if (redirect?.ok) {
        const rule = compatiblePublicRouteRule(await redirect.json());
        const status = rule?.status;
        const destination = rule?.destinationPath;
        if ((status === 301 || status === 302) && destination) {
          return redirectResponse(destination, status);
        }
        if (status === 404 || status === 410) {
          return spaResponse(request, env, status, { noindex: true });
        }
      }
      return spaResponse(request, env, redirect && redirect.status !== 404 ? 503 : 404, {
        noindex: true,
      });
    }
    return spaResponse(request, env, detail?.status ?? 503, { noindex: true });
  }

  const discoveryMatch = path.match(
    /^\/(servicos|industrias|aplicacoes|solucoes)\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/,
  );
  if (discoveryMatch) {
    const contentTypeByCollection = {
      servicos: "service",
      industrias: "industry",
      aplicacoes: "application",
      solucoes: "solution",
    };
    const [, collection, slug] = discoveryMatch;
    const detail = await fetchCmsPublic({
      type: "entity-detail",
      contentType: contentTypeByCollection[collection],
      slug,
    });
    if (detail?.ok) {
      const page = await detail.json();
      return spaResponse(request, env, 200, {
        noindex: stagingHost || page?.seo?.indexable !== true,
        page,
        stagingHost,
      });
    }
    if (detail?.status === 404) {
      const redirect = await fetchCmsPublic({ type: "redirect", path: path.replace(/\/$/, "") });
      if (redirect?.ok) {
        const rule = compatiblePublicRouteRule(await redirect.json());
        const status = rule?.status;
        const destination = rule?.destinationPath;
        if ((status === 301 || status === 302) && destination) {
          return redirectResponse(destination, status);
        }
        if (status === 404 || status === 410) {
          return spaResponse(request, env, status, { noindex: true });
        }
      }
      return spaResponse(request, env, redirect && redirect.status !== 404 ? 503 : 404, {
        noindex: true,
      });
    }
    return spaResponse(request, env, 503, { noindex: true });
  }

  if (ASSET_PATH.test(path) || path === "/sw.js" || path === "/manifest.json") {
    const asset = await env.ASSETS.fetch(request);
    const requestedExecutable = /\.(?:js|mjs|css)$/i.test(path);
    if (
      asset.status === 404 ||
      (requestedExecutable && asset.headers.get("Content-Type")?.includes("text/html"))
    ) {
      return new Response("Not Found", {
        status: 404,
        headers: securityHeaders(
          new Headers({ "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }),
          { noindex: true },
        ),
      });
    }
    return withHeaders(asset, { noindex: stagingHost });
  }

  if (PRIVATE_ROUTE.test(path)) {
    if (
      !RDO_ROUTES.test(path) &&
      !ADMIN_ROUTES.test(path) &&
      !PREVIEW_ROUTES.test(path) &&
      !CMS_DEMO_ROUTES.test(path)
    )
      return spaResponse(request, env, 404, { noindex: true, privateRoute: true });
    return spaResponse(request, env, 200, { noindex: true, privateRoute: true });
  }

  const managed = await fetchCmsPublic({ type: "page-by-path", path });
  if (managed?.ok) {
    const resolution = await managed.json();
    if (resolution.kind === "page") {
      return spaResponse(request, env, 200, {
        noindex: stagingHost || resolution.page?.seo?.indexable !== true,
        page: resolution.page,
        stagingHost,
      });
    }
    if (resolution.kind === "route") {
      const rule = compatiblePublicRouteRule(resolution.rule);
      const status = rule?.status;
      const destination = rule?.destinationPath;
      if ((status === 301 || status === 302) && destination) {
        return redirectResponse(destination, status);
      }
      if (status === 404 || status === 410) return spaResponse(request, env, status, { noindex: true });
    }
  }
  if (managed && !managed.ok && managed.status !== 404) {
    return spaResponse(request, env, 503, { noindex: true });
  }

  if (isPublicRoute(path)) {
    return spaResponse(request, env, 200, { noindex: stagingHost });
  }

  const redirect = await fetchCmsPublic({ type: "redirect", path });
  if (redirect?.ok) {
    const rule = compatiblePublicRouteRule(await redirect.json());
    const status = rule?.status;
    const destination = rule?.destinationPath;
    if ((status === 301 || status === 302) && destination) {
      return redirectResponse(destination, status);
    }
    if (status === 404 || status === 410) {
      return spaResponse(request, env, status, { noindex: true });
    }
    return spaResponse(request, env, 503, { noindex: true });
  }
  if (redirect && redirect.status !== 404) {
    return spaResponse(request, env, 503, { noindex: true });
  }

  return spaResponse(request, env, 404, { noindex: true });
}

export function telemetryRoute(pathname = "/") {
  if (pathname === "/") return "/";
  if (/^\/assets(?:\/|$)/.test(pathname)) return "/assets/:asset";
  if (pathname === PUBLIC_ASSET_BRIDGE_PATH) return PUBLIC_ASSET_BRIDGE_PATH;
  if (/^\/preview(?:\/|$)/.test(pathname)) return "/preview/:token";
  if (/^\/admin(?:\/|$)/.test(pathname)) return "/admin/:route";
  if (/^\/relatorio-de-obra(?:\/|$)/.test(pathname)) return "/relatorio-de-obra/:route";
  if (/^\/cms(?:\/|$)/.test(pathname)) return "/cms/:route";
  if (
    new Set([
      "/sitemap.xml",
      "/sitemap-conteudo.xml",
      "/sitemap-produtos.xml",
      "/sitemap-blog.xml",
      "/robots.txt",
      "/healthz",
      "/release-manifest.json",
    ]).has(pathname)
  ) {
    return pathname;
  }
  const collection = pathname.match(
    /^\/(blog|busca|servicos|produtos|industrias|aplicacoes|solucoes|campanhas)\/?$/,
  );
  if (collection) return `/${collection[1]}`;
  const detail = pathname.match(
    /^\/(blog|servicos|produtos|industrias|aplicacoes|solucoes|campanhas)\/[^/]+(?:\/.*)?$/,
  );
  if (detail) return `/${detail[1]}/:slug`;
  if (/^\/(?:favicon\.ico|manifest\.webmanifest|modelos)(?:\/|$)/.test(pathname)) {
    return "/static/:resource";
  }
  return "/public/:route";
}

export default {
  async fetch(request, env) {
    const startedAt = Date.now();
    const url = new URL(request.url);
    let response;

    try {
      response = await handleRequest(request, env);
    } catch {
      response = new Response("Internal Server Error", {
        status: 500,
        headers: securityHeaders(
          new Headers({ "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }),
          {
            noindex: true,
          },
        ),
      });
    }

    const headers = new Headers(response.headers);
    const environment = deploymentEnvironment(url, env);
    securityHeaders(headers, {
      noindex: headers.has("X-Robots-Tag") || response.status >= 400 || environment !== "production",
      privateRoute: PRIVATE_ROUTE.test(url.pathname),
    });
    applyContentSecurityPolicy(headers, environment, env, url.pathname);
    headers.set("X-Release", env.CF_PAGES_COMMIT_SHA ?? "local");
    headers.set("Server-Timing", `edge;dur=${Date.now() - startedAt}`);
    const finalResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });

    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: response.status >= 500 ? "error" : "info",
        event: "api.request",
        route: telemetryRoute(url.pathname),
        context: { method: request.method, status: response.status, durationMs: Date.now() - startedAt },
      }),
    );
    return finalResponse;
  },
};
