import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("public shell and new consumers cannot reintroduce legacy editorial fallbacks", async () => {
  const protectedFiles = [
    "src/lib/supabase.ts",
    "src/public/catalog-api.ts",
    "src/public/site-shell-context.tsx",
    "src/public/pages/CmsProductsPage.tsx",
    "src/public/pages/CmsSearchPage.tsx",
    "src/public/pages/CmsDiscoveryListPage.tsx",
    "src/public/pages/CmsDiscoveryDetailPage.tsx",
    "src/public/pages/CmsManagedPageRoute.tsx",
    "src/app/routes.tsx",
    "src/app/components/Header.tsx",
    "src/app/components/Footer.tsx",
  ];
  for (const file of protectedFiles) {
    const source = await read(file);
    assert.doesNotMatch(source, /app\/data|useSiteData|site-content|SAFE_NAVIGATION|SAFE_COLUMNS/);
  }
  const header = await read("src/app/components/Header.tsx");
  assert.match(header, /autocompletePublished/);
  assert.match(header, /closeOnEscape/);
  assert.match(header, /searchToggleRef\.current\?\.focus/);
  assert.match(header, /mobileToggleRef\.current\?\.focus/);
  assert.doesNotMatch(header, /searchIndex/);
  const shell = await read("src/public/site-shell-context.tsx");
  assert.match(shell, /getPublishedSiteShell/);
  const routes = await read("src/app/routes.tsx");
  assert.doesNotMatch(
    routes,
    /\.\/pages\/(?:HomePage|SobrePage|SectorPage|BiodigestorPage|DeteccaoGasPage|PoliticaPrivacidadePage|TermosDeUsoPage)/,
  );
});

test("legacy adapter is quarantined and absent from CMS/public contract modules", async () => {
  const adapter = await read("src/app/legacy/site-content.ts");
  const hooks = await read("src/app/hooks/useSiteData.ts");
  const cmsApi = await read("src/admin/api/cms-api.ts");
  const publicApi = await read("src/public/catalog-api.ts");
  assert.match(adapter, /functions\/v1\/site-content/);
  assert.match(hooks, /legacy\/site-content/);
  assert.doesNotMatch(cmsApi, /legacy\/site-content|functions\/v1\/site-content/);
  assert.doesNotMatch(publicApi, /legacy\/site-content|functions\/v1\/site-content/);
});

test("redirect map points only to verified new projection paths", async () => {
  const redirects = await read("public/_redirects");
  for (const pair of [
    ["/servicos/calibracao-rbc-laboratorio", "/servicos/calibracao-de-instrumentos"],
    ["/setores", "/industrias"],
    ["/setores/gas-petroleo", "/industrias/oleo-e-gas"],
    ["/setores/industria", "/industrias/processos-industriais"],
    ["/setores/biogas-biometano", "/industrias/biogas-biometano"],
    ["/setores/protecao-catodica", "/industrias/protecao-catodica"],
    ["/setores/controle-ambiental", "/industrias/controle-ambiental"],
    ["/setores/seguranca-operacional", "/industrias/seguranca-operacional"],
    ["/setores/instrumentacao", "/industrias/instrumentacao"],
    ["/setores/telemetria", "/industrias/telemetria"],
  ]) {
    assert.match(redirects, new RegExp(`${pair[0]}\\s+${pair[1]}\\s+301`));
  }
  assert.doesNotMatch(redirects, /\/setores\/:slug/);
  assert.doesNotMatch(redirects, /\/\*\s+\/\s+301/);
});

test("edge removes soft-404 allowlists for every retired legacy consumer", async () => {
  const source = (await read("cloudflare/_worker.js"))
    .replace("__CMS_PUBLIC_API__", "https://example.supabase.co/functions/v1/cms-public")
    .replace("__CMS_PUBLIC_ANON_KEY__", "anon-test-key");
  assert.doesNotMatch(source, /\bENTITY_ROUTES\b/);
  assert.doesNotMatch(source, /instalacoes-comissionamentos|macromedicao-redes-distribuicao/);
  assert.doesNotMatch(source, /LEGACY_PRESERVED_ENTITY_ROUTES|DG_ROUTES/);

  const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  const originalFetch = globalThis.fetch;
  const env = {
    ASSETS: {
      fetch: async () =>
        new Response(
          '<!doctype html><html><head><title>Base</title></head><body><div id="root"></div></body></html>',
          {
            headers: { "Content-Type": "text/html" },
          },
        ),
    },
  };
  globalThis.fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.searchParams.get("type") === "page-by-path") return Response.json({ kind: "fallback" });
    return Response.json({ error: "not-found" }, { status: 404 });
  };
  try {
    const replaced = await module.default.fetch(
      new Request("https://staging.example/servicos/instalacoes-comissionamentos"),
      env,
    );
    assert.equal(replaced.status, 404);

    const redirect = await module.default.fetch(new Request("https://staging.example/setores"), env);
    assert.equal(redirect.status, 301);
    assert.equal(redirect.headers.get("location"), "/industrias");

    const retired = await module.default.fetch(
      new Request("https://staging.example/deteccao-de-gas/deteccao-movel/s800"),
      env,
    );
    assert.equal(retired.status, 404);
    assert.match(retired.headers.get("x-robots-tag") ?? "", /noindex/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("managed pages are clean-room, searchable and publishable only to staging", async () => {
  const publisher = await read("scripts/phase9/publish-staging-clean-room-pages.mjs");
  const publicApi = await read("supabase/functions/cms-public/index.ts");
  assert.match(publisher, /GAIATEC-F9-CLEAN-ROOM-STAGING/);
  assert.match(publisher, /revisão final DPO antes de produção/);
  assert.match(publisher, /productionTouched: false/);
  assert.doesNotMatch(
    publisher,
    /app\/data|site-content|deteccaoGas|dgGaleria|dgImagens|servicesList|searchIndex/,
  );
  assert.match(publicApi, /"page", "homepage"/);
  assert.match(publicApi, /p\.blocks/);
});

test("Gate G8 acceptance and G9 stability blocker remain explicit", async () => {
  const g8 = await read("docs/fase-8/EVIDENCIAS_GATE_G8.md");
  const planning = await read("PLANEJAMENTO_EXECUTIVO_DESENVOLVIMENTO_REMODELAGEM_CMS_GAIATEC.md");
  assert.match(g8, /APROVADO PARA INICIAR A FASE 9 EM LOCAL\/STAGING/);
  assert.match(g8, /produção não autorizada/i);
  assert.match(planning, /Gate G8 fica \*\*APROVADO para iniciar a Fase 9 em local\/staging\*\*/);
  assert.match(g8, /período de estabilidade/i);
});
