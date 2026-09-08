import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getCampaignPlacements,
  getPublicRouteRule,
  getPublishedPageByPath,
  getPublishedProduct,
  getPublishedProducts,
  getPublishedSiteShell,
  searchPublishedProducts,
} from "../../src/public/catalog-api";
import { applyCatalogSeo } from "../../src/public/catalog-seo";

const product = {
  kind: "product",
  slug: "produto-seguro",
  path: "/produtos/produto-seguro",
  payload: {
    title: "Produto seguro",
    commercial: { shortDescription: "Descrição pública" },
    models: [],
    specifications: [],
    documents: [],
    media: [],
    blocks: [],
  },
  seo: {
    title: "Produto seguro | GAIATEC",
    description: "Descrição pública segura.",
    canonicalPath: "/produtos/produto-seguro",
    indexable: true,
  },
  publishedAt: "2026-09-07T12:00:00.000Z",
};

function respond(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.head.querySelectorAll('[data-public-security-test="true"]').forEach((element) => element.remove());
});

describe("fronteira adversarial dos consumidores públicos", () => {
  it.each([
    ["marcação executável", { payload: { ...product.payload, summary: '<img src=x onerror="alert(1)">' } }],
    ["protocolo executável", { payload: { ...product.payload, cta: { href: "javascript:alert(1)" } } }],
    ["segredo em texto", { payload: { ...product.payload, summary: "Bearer eyJhbGciOiJIUzI1NiJ9.secret" } }],
    [
      "credencial em URL",
      { seo: { ...product.seo, socialImage: "https://cdn.example.test/image.webp?access_token=secret" } },
    ],
    ["chave confidencial", { payload: { ...product.payload, apiKey: "secret-value" } }],
    ["chave privada", { payload: { ...product.payload, privateKey: "opaque" } }],
    ["token de provedor", { payload: { ...product.payload, summary: "github_pat_AAAAAAAAAAAAAAAAAAAA" } }],
  ])("recusa %s recebido de uma origem remota", async (_label, mutation) => {
    respond({ ...product, ...mutation });
    await expect(getPublishedProduct(product.slug)).rejects.toThrow("incompatível");
  });

  it("recusa recursos com tipo, caminho, data ou SEO incompatíveis", async () => {
    for (const mutation of [
      { kind: "campaign" },
      { path: "/admin/produtos/produto-seguro" },
      { publishedAt: "not-a-date" },
      { seo: { ...product.seo, canonicalPath: "https://evil.example.test/phishing" } },
    ]) {
      respond({ ...product, ...mutation });
      await expect(getPublishedProduct(product.slug)).rejects.toThrow("incompatível");
    }
  });

  it("recusa uma resposta remota anormalmente profunda com mensagem pública estável", async () => {
    let nested: unknown = "conteúdo";
    for (let depth = 0; depth < 70; depth += 1) nested = { value: nested };
    respond({ ...product, payload: { ...product.payload, nested } });
    await expect(getPublishedProduct(product.slug)).rejects.toThrow(
      "Conteúdo público incompatível com o contrato vigente.",
    );
  });

  it("recusa redirects, shell e placements que poderiam navegar para destinos não públicos", async () => {
    respond({ kind: "route", rule: { destinationPath: "https://evil.example.test", status: 301 } });
    await expect(getPublishedPageByPath("/legado")).rejects.toThrow("incompatível");

    respond({ destinationPath: "javascript:alert(1)", status: 301 });
    await expect(getPublicRouteRule("/legado")).rejects.toThrow("incompatível");

    respond({
      navigation: {
        title: "Menu",
        items: [{ location: "header", label: "Inseguro", href: "javascript:alert(1)", newTab: false }],
      },
      settings: null,
      placements: null,
    });
    await expect(getPublishedSiteShell()).rejects.toThrow("incompatível");

    respond({
      items: [
        {
          slot: "home_hero",
          priority: 1,
          startsAt: "2026-09-01T00:00:00.000Z",
          endsAt: "2026-10-01T00:00:00.000Z",
          campaign: { title: "Campanha", summary: "Resumo", path: "//evil.example.test" },
        },
      ],
    });
    await expect(getCampaignPlacements("/")).rejects.toThrow("incompatível");
  });

  it("aceita apenas redirects internos e traduz a explicação da busca sem expor score bruto", async () => {
    respond({
      items: [{ ...product, matchedBy: "exact_title" }],
      total: 1,
      facets: {},
      groups: { product: 1 },
      query: "produto",
    });
    const result = await searchPublishedProducts("produto");
    expect(result.items[0]).toMatchObject({ matchedBy: "Correspondência pelo título" });
    expect(result.items[0]).not.toHaveProperty("score");

    respond({ kind: "route", rule: { destinationPath: "/destino-seguro", status: 301 } });
    await expect(getPublishedPageByPath("/legado")).resolves.toEqual({
      kind: "route",
      rule: { destinationPath: "/destino-seguro", status: 301 },
    });

    respond({
      navigation: {
        title: "Menu público",
        items: [{ location: "header", label: "Produtos", href: "/produtos", newTab: false }],
      },
      settings: {
        title: "Configuração pública",
        company: {
          name: "GAIATEC",
          phone: "11 0000-0000",
          whatsapp: "11 90000-0000",
          email: "contato@example.test",
          address: "Endereço público",
        },
        socialLinks: [{ network: "LinkedIn", url: "https://www.linkedin.com/company/gaiatec" }],
        defaultCta: { label: "Contato", href: "/contato" },
      },
      placements: null,
    });
    await expect(getPublishedSiteShell()).resolves.toMatchObject({
      navigation: { title: "Menu público" },
      settings: { company: { name: "GAIATEC" } },
    });

    respond({
      items: [
        {
          slot: "home_hero",
          priority: 1,
          startsAt: "2026-09-01T00:00:00.000Z",
          endsAt: "2026-10-01T00:00:00.000Z",
          campaign: {
            title: "Campanha pública",
            summary: "Resumo público",
            path: "/campanhas/campanha-publica",
          },
        },
      ],
    });
    await expect(getCampaignPlacements("/")).resolves.toMatchObject({
      items: [{ campaign: { path: "/campanhas/campanha-publica" } }],
    });
  });

  it("não permite que parâmetros da URL troquem o endpoint ou o tipo governado do catálogo", async () => {
    respond({ items: [], total: 0, facets: {}, groups: { product: 0 }, query: "" });
    await expect(
      getPublishedProducts({ type: "site-shell", contentType: "post", q: "" }),
    ).resolves.toMatchObject({ items: [], total: 0 });

    const requestUrl = String(vi.mocked(fetch).mock.calls[0]?.[0]);
    const request = new URL(requestUrl);
    expect(request.searchParams.get("type")).toBe("products");
    expect(request.searchParams.get("contentType")).toBe("product");
    expect(request.searchParams.getAll("type")).toHaveLength(1);
    expect(request.searchParams.getAll("contentType")).toHaveLength(1);
  });

  it("mantém canonical e Open Graph na origem segura mesmo se um chamador local errar", () => {
    const canonical = document.createElement("link");
    canonical.rel = "canonical";
    canonical.dataset.publicSecurityTest = "true";
    document.head.append(canonical);
    const og = document.createElement("meta");
    og.setAttribute("property", "og:image");
    og.dataset.publicSecurityTest = "true";
    document.head.append(og);

    applyCatalogSeo({
      title: "Teste",
      canonicalPath: "https://evil.example.test/phishing",
      indexable: true,
      ogImage: "javascript:alert(1)",
    });

    expect(canonical.href).toBe(`${window.location.origin}/`);
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute("content", "noindex,follow");
    expect(document.head.querySelector('meta[property="og:image"]')).toBeNull();
  });
});
