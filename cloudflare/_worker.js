const STATIC_PUBLIC_ROUTES = [
  /^\/$/,
  /^\/(sobre|blog|contato|setores|servicos|produtos|aplicacoes|deteccao-de-gas|politica-de-privacidade|termos-de-uso)\/?$/,
  /^\/biodigestor(?:\/(como-funciona|portes|beneficios|monitoramento|biogas-biometano|automacao|escolas))?\/?$/,
];

// Manifesto fechado das rotas dinâmicas já implementadas em código. Não é
// conteúdo de CMS: serve apenas para devolver HTTP 404 real a entidades falsas.
const ENTITY_ROUTES = new Set([
  ..."saneamento gas-petroleo biogas-biometano protecao-catodica hvac controle-ambiental seguranca-operacional agronegocio industria instrumentacao telemetria".split(" ").map((slug) => `/setores/${slug}`),
  ..."instalacoes-comissionamentos medicoes-em-campo deteccao-vazamento-gas deteccao-vazamento-agua calibracao-rastreavel-laboratorio calibracao-rastreavel-campo manutencoes testes automacoes controle-monitoramento locacao-comodato plataforma-controle protecao-catodica inspecao-revestimentos projetos consultoria-inspecoes-tecnicas".split(" ").map((slug) => `/servicos/${slug}`),
  ..."macromedicao-redes-distribuicao producao-biogas-aterros deteccao-vazamentos-gasodutos monitoramento-h2s-refinarias calibracao-medidores-vazao protecao-catodica-dutos-subterraneos automacao-eta-ete telemetria-estacoes-remotas climatizacao-industrial-hvac analise-biogas-biodigestores controle-pressao-adutoras inspecao-revestimento-dutos".split(" ").map((slug) => `/aplicacoes/${slug}`),
  ..."1-medidor-eletromagnetico-flangeado 2-macromedidor-ultrasonico-clamp-on 3-medidor-ultrasonico-clamp-on-para-gas 4-sensor-de-nivel-radar-para-efluentes 5-transmissor-de-pressao-serie-gp 6-modulo-de-telemetria-gaiatec 7-detector-portatil-de-vazamento-de-gas 8-junta-isolante-flangeada 9-biodigestor-industrial-modular-biogaia-m 10-biodigestor-compacto-rural-biogaia-r 11-sistema-fixo-de-analise-de-biogas-gaiasense-s 12-analisador-portatil-de-biogas-gaiasense-p 13-controlador-logico-programavel-clp 14-retificador-de-protecao-catodica 15-sensores-agricolas-inteligentes 16-unidade-de-tratamento-de-ar-uta 17-valvula-de-controle-automatica".split(" ").map((slug) => `/produtos/${slug}`),
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

const PRIVATE_ROUTE = /^\/(relatorio-de-obra|admin|preview)(?:\/|$)/;
const RDO_ROUTES = /^\/relatorio-de-obra(?:\/(login|definir-senha|assinar\/[^/]+|arquivo|novo|relatorio\/[^/]+|equipe))?\/?$/;
const ASSET_PATH = /^\/(assets|images|fonts)\/|\.(?:js|mjs|css|map|png|jpe?g|webp|avif|svg|gif|ico|woff2?|ttf|pdf|xml|txt|json|webmanifest)$/i;

function securityHeaders(headers, { noindex = false, privateRoute = false } = {}) {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", privateRoute ? "DENY" : "SAMEORIGIN");
  headers.set("Referrer-Policy", privateRoute ? "no-referrer" : "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", privateRoute ? "camera=(self), microphone=(), geolocation=(self)" : "camera=(), microphone=(), geolocation=()");
  headers.set("Strict-Transport-Security", "max-age=31536000");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Content-Security-Policy-Report-Only", "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://challenges.cloudflare.com https://api.resend.com; frame-src https://challenges.cloudflare.com https://www.google.com; form-action 'self'");
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const stagingHost = url.hostname.endsWith(".pages.dev");

    if (path === "/servicos/calibracao-rbc-laboratorio") {
      return new Response(null, { status: 301, headers: { Location: "/servicos/calibracao-rastreavel-laboratorio" } });
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
      if (!RDO_ROUTES.test(path)) return spaResponse(request, env, 404, { noindex: true, privateRoute: true });
      return spaResponse(request, env, 200, { noindex: true, privateRoute: true });
    }

    if (isPublicRoute(path)) {
      return spaResponse(request, env, 200, { noindex: stagingHost });
    }

    return spaResponse(request, env, 404, { noindex: true });
  },
};
