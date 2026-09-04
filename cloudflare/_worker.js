const STATIC_PUBLIC_ROUTES = [
  /^\/(blog|busca|servicos|produtos|industrias|aplicacoes|solucoes)\/?$/,
  /^\/produtos\/comparador\/?$/,
];

const CMS_PUBLIC_API = "__CMS_PUBLIC_API__";
const CMS_PUBLIC_ANON_KEY = "__CMS_PUBLIC_ANON_KEY__";

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

function isPublicRoute(path) {
  return STATIC_PUBLIC_ROUTES.some((pattern) => pattern.test(path));
}

const PRIVATE_ROUTE = /^\/(relatorio-de-obra|admin|preview|cms\/conteudo)(?:\/|$)/;
const RDO_ROUTES =
  /^\/relatorio-de-obra(?:\/(login|definir-senha|assinar\/[^/]+|arquivo|novo|relatorio\/[^/]+|equipe))?\/?$/;
const ADMIN_ROUTES =
  /^\/admin(?:\/(login|recuperar-senha|definir-senha|mfa|assistente|conteudo(?:\/novo|\/[0-9a-f-]{36})?|produtos(?:\/novo|\/importacao|\/[0-9a-f-]{36})?|descoberta\/(?:service|industry|application|solution)(?:\/[0-9a-f-]{36})?|busca|paginas(?:\/(?:novo|[0-9a-f-]{36}))?|estudio-visual(?:\/[0-9a-f-]{36})?|sites|site|marketing(?:\/campanhas\/(?:novo|[0-9a-f-]{36})|\/formularios)?|leads|midia|perfil|usuarios|diagnosticos))?\/?$/;
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
  headers.set(
    "Content-Security-Policy-Report-Only",
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://challenges.cloudflare.com https://api.resend.com; frame-src https://challenges.cloudflare.com https://www.google.com https://www.openstreetmap.org; form-action 'self'",
  );
  if (noindex) headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  if (privateRoute) headers.set("Cache-Control", "private, no-store, max-age=0");
  return headers;
}

function withHeaders(response, options) {
  const headers = securityHeaders(new Headers(response.headers), options);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
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
  const ogImage = Object.entries(page?.media_urls ?? {}).find(
    ([key, value]) => key.startsWith(`${seo.ogImageId}:`) && typeof value === "string",
  )?.[1];

  let result = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  result = replaceMeta(result, "name", "description", description);
  result = replaceMeta(result, "name", "robots", indexable ? "index, follow" : "noindex, follow");
  result = replaceMeta(result, "property", "og:title", title);
  result = replaceMeta(result, "property", "og:description", description);
  result = replaceMeta(result, "property", "og:url", canonicalUrl);
  result = replaceMeta(result, "property", "og:type", page?.content_type === "post" ? "article" : "website");
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
    page?.content_type === "post"
      ? {
          "@context": "https://schema.org",
          "@type": "Article",
          headline: page.payload?.title || title,
          description,
          url: canonicalUrl,
          datePublished: page.published_at,
          author: page.payload?.author?.name
            ? { "@type": "Person", name: page.payload.author.name }
            : undefined,
          articleSection: page.payload?.category?.name,
          keywords: page.payload?.tags?.map((tag) => tag.name).join(", "),
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
  securityHeaders(headers, headerOptions);
  if (!page) return new Response(index.body, { status, headers });

  const html = injectPageMetadata(await index.text(), page, new URL(request.url), env, stagingHost);
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  headers.delete("ETag");
  return new Response(html, { status, headers });
}

async function cmsPublic(params) {
  if (CMS_PUBLIC_API.startsWith("__") || CMS_PUBLIC_ANON_KEY.startsWith("__")) return null;
  const target = new URL(CMS_PUBLIC_API);
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
  return fetch(target, { headers: { apikey: CMS_PUBLIC_ANON_KEY } });
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const stagingHost = url.hostname.endsWith(".pages.dev");

  if (path === "/healthz") return healthResponse(request, env);

  const normalizedPath = path.length > 1 ? path.replace(/\/$/, "") : path;
  const staticRedirect = STATIC_REDIRECTS.get(normalizedPath);
  if (staticRedirect) {
    return new Response(null, {
      status: 301,
      headers: { Location: staticRedirect },
    });
  }

  if (
    ["/sitemap.xml", "/sitemap-conteudo.xml", "/sitemap-produtos.xml", "/sitemap-blog.xml"].includes(path)
  ) {
    const sitemap = await cmsPublic({ type: "sitemap", origin: url.origin });
    if (!sitemap?.ok)
      return new Response("Not Found", {
        status: 404,
        headers: securityHeaders(new Headers(), { noindex: true }),
      });
    return withHeaders(sitemap, { noindex: stagingHost });
  }

  if (/^\/blog\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(path)) {
    const slug = path.replace(/^\/blog\//, "").replace(/\/$/, "");
    const detail = await cmsPublic({ type: "post-detail", slug });
    if (detail?.ok) {
      const page = await detail.json();
      return spaResponse(request, env, 200, {
        noindex: stagingHost || page?.seo?.indexable !== true,
        page,
        stagingHost,
      });
    }
    return spaResponse(request, env, detail?.status === 404 ? 404 : 503, { noindex: true });
  }

  if (/^\/campanhas\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(path)) {
    const detail = await cmsPublic({ type: "campaign-by-path", path: path.replace(/\/$/, "") });
    if (!detail?.ok) return spaResponse(request, env, detail?.status === 404 ? 404 : 503, { noindex: true });
    const resolution = await detail.json();
    if (resolution.kind === "route") {
      const status = Number(resolution.rule?.status_code);
      const destination = resolution.rule?.destination_path;
      if ((status === 301 || status === 302) && destination)
        return new Response(null, { status, headers: { Location: destination } });
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
    const detail = await cmsPublic({ type: "detail", slug });
    if (detail?.ok) return spaResponse(request, env, 200, { noindex: stagingHost });
    if (detail?.status === 404) {
      const redirect = await cmsPublic({ type: "redirect", path });
      if (redirect?.ok) {
        const rule = await redirect.json();
        return new Response(null, { status: rule.status_code, headers: { Location: rule.destination_path } });
      }
      return spaResponse(request, env, 404, { noindex: true });
    }
    return spaResponse(request, env, 404, { noindex: true });
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
    const detail = await cmsPublic({
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
      const redirect = await cmsPublic({ type: "redirect", path: path.replace(/\/$/, "") });
      if (redirect?.ok) {
        const rule = await redirect.json();
        return new Response(null, {
          status: rule.status_code,
          headers: { Location: rule.destination_path },
        });
      }
      return spaResponse(request, env, 404, { noindex: true });
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

  const managed = await cmsPublic({ type: "page-by-path", path });
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
      const status = Number(resolution.rule?.status_code);
      const destination = resolution.rule?.destination_path;
      if ((status === 301 || status === 302) && destination) {
        return new Response(null, { status, headers: { Location: destination } });
      }
      if (status === 404 || status === 410) return spaResponse(request, env, status, { noindex: true });
    }
  }

  if (isPublicRoute(path)) {
    return spaResponse(request, env, 200, { noindex: stagingHost });
  }

  const redirect = await cmsPublic({ type: "redirect", path });
  if (redirect?.ok) {
    const rule = await redirect.json();
    return new Response(null, { status: rule.status_code, headers: { Location: rule.destination_path } });
  }

  return spaResponse(request, env, 404, { noindex: true });
}

function correlationId(request) {
  const incoming = request.headers.get("x-correlation-id") ?? "";
  return /^[a-zA-Z0-9-]{8,80}$/.test(incoming) ? incoming : crypto.randomUUID();
}

export default {
  async fetch(request, env) {
    const startedAt = Date.now();
    const id = correlationId(request);
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
    headers.set("X-Release", env.CF_PAGES_COMMIT_SHA ?? "local");
    headers.set("X-Correlation-ID", id);
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
        correlationId: id,
        release: env.CF_PAGES_COMMIT_SHA ?? "local",
        route: url.pathname.slice(0, 160),
        context: { method: request.method, status: response.status, durationMs: Date.now() - startedAt },
      }),
    );
    return finalResponse;
  },
};
