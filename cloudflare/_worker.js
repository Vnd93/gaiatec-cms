const STATIC_PUBLIC_ROUTES = [
  /^\/$/,
  /^\/(sobre|blog|busca|contato|setores|servicos|produtos|aplicacoes|deteccao-de-gas|politica-de-privacidade|termos-de-uso)\/?$/,
  /^\/biodigestor(?:\/(como-funciona|portes|beneficios|monitoramento|biogas-biometano|automacao|escolas))?\/?$/,
];

const CMS_PUBLIC_API = "__CMS_PUBLIC_API__";
const CMS_PUBLIC_ANON_KEY = "__CMS_PUBLIC_ANON_KEY__";

// Manifesto fechado das rotas dinâmicas já implementadas em código. Não é
// conteúdo de CMS: serve apenas para devolver HTTP 404 real a entidades falsas.
const ENTITY_ROUTES = new Set([
  ..."saneamento gas-petroleo biogas-biometano protecao-catodica hvac controle-ambiental seguranca-operacional agronegocio industria instrumentacao telemetria".split(" ").map((slug) => `/setores/${slug}`),
  ..."instalacoes-comissionamentos medicoes-em-campo deteccao-vazamento-gas deteccao-vazamento-agua calibracao-rastreavel-laboratorio calibracao-rastreavel-campo manutencoes testes automacoes controle-monitoramento locacao-comodato plataforma-controle protecao-catodica inspecao-revestimentos projetos consultoria-inspecoes-tecnicas".split(" ").map((slug) => `/servicos/${slug}`),
  ..."macromedicao-redes-distribuicao producao-biogas-aterros deteccao-vazamentos-gasodutos monitoramento-h2s-refinarias calibracao-medidores-vazao protecao-catodica-dutos-subterraneos automacao-eta-ete telemetria-estacoes-remotas climatizacao-industrial-hvac analise-biogas-biodigestores controle-pressao-adutoras inspecao-revestimento-dutos".split(" ").map((slug) => `/aplicacoes/${slug}`),
  "/produtos/comparador",
]);

const DG_ROUTES = {
  "deteccao-movel": "s-series s800 s800-bomba s600 s700 ks100 veiculo-autonomo m10 c200mini uf100 ws100mini h10 ws100",
  "monitoramento-online": "sz100 poste-ia gq-tx100 z983 gtq-wx200 gtq-wx200mini gq-pm100 gq-pm200 bomba-poco-de-valvula dt-kny-wx300 dm10 c10 vibracao-acustico poste-de-solo enterrado pressao-sem-fio poco-de-valvula",
  "localizacao-tubulacao-pe": "a200",
  "deteccao-rede-enterrada-gas": "st100",
  "detectores-portateis": "dg100 dg100-tht dx300 dx200 cl01 dx100 cp dx200-2 f40",
  "monitoramento-meteorologico": "estacao-portatil estacao-movel",
};
for (const [category, products] of Object.entries(DG_ROUTES)) {
  ENTITY_ROUTES.add(`/deteccao-de-gas/${category}`);
  for (const product of products.split(" ")) ENTITY_ROUTES.add(`/deteccao-de-gas/${category}/${product}`);
}

function isPublicRoute(path) {
  const normalized = path.length > 1 ? path.replace(/\/$/, "") : path;
  return STATIC_PUBLIC_ROUTES.some((pattern) => pattern.test(path)) || ENTITY_ROUTES.has(normalized);
}

const PRIVATE_ROUTE = /^\/(relatorio-de-obra|admin|preview|cms\/conteudo)(?:\/|$)/;
const RDO_ROUTES = /^\/relatorio-de-obra(?:\/(login|definir-senha|assinar\/[^/]+|arquivo|novo|relatorio\/[^/]+|equipe))?\/?$/;
const ADMIN_ROUTES = /^\/admin(?:\/(login|recuperar-senha|definir-senha|mfa|conteudo(?:\/novo|\/[0-9a-f-]{36})?|produtos(?:\/novo|\/[0-9a-f-]{36})?|midia|perfil|usuarios|diagnosticos))?\/?$/;
const PREVIEW_ROUTES = /^\/preview\/[A-Za-z0-9_-]{43}\/?$/;
const CMS_DEMO_ROUTES = /^\/cms\/conteudo\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/;
const ASSET_PATH = /^\/(assets|images|fonts)\/|\.(?:js|mjs|css|map|png|jpe?g|webp|avif|svg|gif|ico|woff2?|ttf|pdf|xml|txt|json|webmanifest)$/i;

function securityHeaders(headers, { noindex = false, privateRoute = false } = {}) {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", privateRoute ? "DENY" : "SAMEORIGIN");
  headers.set("Referrer-Policy", privateRoute ? "no-referrer" : "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", privateRoute ? "camera=(self), microphone=(), geolocation=(self)" : "camera=(), microphone=(), geolocation=()");
  headers.set("Strict-Transport-Security", "max-age=31536000");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Content-Security-Policy-Report-Only", "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://challenges.cloudflare.com https://api.resend.com; frame-src https://challenges.cloudflare.com https://www.google.com https://www.openstreetmap.org; form-action 'self'");
  if (noindex) headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  if (privateRoute) headers.set("Cache-Control", "private, no-store, max-age=0");
  return headers;
}

function withHeaders(response, options) {
  const headers = securityHeaders(new Headers(response.headers), options);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function spaResponse(request, env, status, options = {}) {
  // O asset binding do Pages normaliza /index.html para /; buscar a raiz evita
  // a resposta de redirect sem corpo e não reentra no Worker.
  const indexUrl = new URL("/", request.url);
  const index = await env.ASSETS.fetch(new Request(indexUrl, request));
  const headers = new Headers(index.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");
  securityHeaders(headers, options);
  return new Response(index.body, { status, headers });
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

    if (path === "/servicos/calibracao-rbc-laboratorio") {
      return new Response(null, { status: 301, headers: { Location: "/servicos/calibracao-rastreavel-laboratorio" } });
    }

    if (path === "/sitemap-produtos.xml") {
      const sitemap = await cmsPublic({ type: "sitemap", origin: url.origin });
      if (!sitemap?.ok) return new Response("Not Found", { status: 404, headers: securityHeaders(new Headers(), { noindex: true }) });
      return withHeaders(sitemap, { noindex: stagingHost });
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
      return spaResponse(request, env, ENTITY_ROUTES.has(path) ? 200 : 404, { noindex: true });
    }

    if (ASSET_PATH.test(path) || path === "/sw.js" || path === "/manifest.json") {
      const asset = await env.ASSETS.fetch(request);
      const requestedExecutable = /\.(?:js|mjs|css)$/i.test(path);
      if (asset.status === 404 || (requestedExecutable && asset.headers.get("Content-Type")?.includes("text/html"))) {
        return new Response("Not Found", { status: 404, headers: securityHeaders(new Headers({ "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }), { noindex: true }) });
      }
      return withHeaders(asset, { noindex: stagingHost });
    }

    if (PRIVATE_ROUTE.test(path)) {
      if (!RDO_ROUTES.test(path) && !ADMIN_ROUTES.test(path) && !PREVIEW_ROUTES.test(path) && !CMS_DEMO_ROUTES.test(path)) return spaResponse(request, env, 404, { noindex: true, privateRoute: true });
      return spaResponse(request, env, 200, { noindex: true, privateRoute: true });
    }

    if (isPublicRoute(path)) {
      return spaResponse(request, env, 200, { noindex: stagingHost });
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
    } catch (_error) {
      response = new Response("Internal Server Error", {
        status: 500,
        headers: securityHeaders(new Headers({ "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }), {
          noindex: true,
        }),
      });
    }

    const headers = new Headers(response.headers);
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
