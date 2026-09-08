import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getPublishedCampaign,
  getPublishedPageByPath,
  getPublishedPost,
  getPublishedPosts,
} from "../../src/public/catalog-api";

const seo = (canonicalPath: string) => ({
  title: "Conteúdo público | GAIATEC",
  description: "Conteúdo público saneado para validar o consumidor do CMS.",
  canonicalPath,
  indexable: true,
});

const postPayload = {
  title: "Artigo público saneado",
  summary: "Resumo público.",
  excerpt: "Resumo público.",
  authorName: "Autora pública",
  author: { name: "Autora pública", slug: "autora-publica" },
  category: { name: "Categoria pública", slug: "categoria-publica" },
  tags: [{ name: "Público", slug: "publico" }],
  readingMinutes: 3,
  blocks: [{ type: "rich_text", data: { text: "Texto público." } }],
  seo: seo("/blog/artigo-publico"),
};

const campaignPayload = {
  title: "Campanha pública saneada",
  summary: "Resumo público da campanha.",
  campaignKind: "institutional",
  route: { path: "/campanhas/campanha-publica" },
  window: {
    startsAt: "2026-09-01T12:00:00.000Z",
    endsAt: "2026-09-30T12:00:00.000Z",
    timezone: "America/Sao_Paulo",
  },
  blocks: [{ type: "hero", data: { title: "Campanha pública saneada", alignment: "left" } }],
  tracking: {
    enabled: false,
    requiresConsent: true,
    provider: "internal",
    eventName: "campaign-view",
  },
  seo: seo("/campanhas/campanha-publica"),
};

function response(body: unknown) {
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

afterEach(() => vi.unstubAllGlobals());

describe("contratos do catálogo público saneado", () => {
  it("aceita artigo individual e listagem sem metadados editoriais internos", async () => {
    const row = {
      kind: "post",
      slug: "artigo-publico",
      path: "/blog/artigo-publico",
      payload: postPayload,
      seo: postPayload.seo,
      publishedAt: "2026-09-07T12:00:00.000Z",
    };
    response(row);
    await expect(getPublishedPost("artigo-publico")).resolves.toMatchObject({
      kind: "post",
      path: "/blog/artigo-publico",
    });

    response({ items: [row], total: 1 });
    await expect(getPublishedPosts()).resolves.toMatchObject({
      items: [{ kind: "post", path: "/blog/artigo-publico" }],
      total: 1,
    });
  });

  it("aceita campanha saneada e mantém validações públicas cruzadas", async () => {
    const row = {
      kind: "campaign",
      slug: "campanha-publica",
      path: "/campanhas/campanha-publica",
      payload: campaignPayload,
      seo: campaignPayload.seo,
      publishedAt: "2026-09-07T12:00:00.000Z",
    };
    response(row);
    await expect(getPublishedCampaign("/campanhas/campanha-publica")).resolves.toMatchObject({
      kind: "campaign",
      path: "/campanhas/campanha-publica",
    });

    response({
      ...row,
      payload: { ...campaignPayload, route: { path: "/campanhas/outra" } },
    });
    await expect(getPublishedCampaign("/campanhas/campanha-publica")).rejects.toThrow(
      "Campanha incompatível",
    );
  });

  it("reidrata cada bloco relacionado somente com os seus caminhos públicos", async () => {
    const relatedItems = [
      { kind: "service", title: "Primeiro", path: "/servicos/primeiro" },
      { kind: "solution", title: "Segundo", path: "/solucoes/segundo" },
      { kind: "product", title: "Relação geral", path: "/produtos/relacao-geral" },
    ];
    response({
      kind: "page",
      page: {
        kind: "page",
        slug: "pagina-relacionada",
        path: "/pagina-relacionada",
        payload: {
          title: "Página relacionada",
          route: { path: "/pagina-relacionada" },
          blocks: [
            {
              type: "related_content",
              data: { heading: "Primeiro bloco", itemPaths: ["/servicos/primeiro"] },
            },
            {
              type: "related_content",
              data: { heading: "Segundo bloco", itemPaths: ["/solucoes/segundo"] },
            },
            {
              type: "related_content",
              data: { heading: "Sem correspondência", itemPaths: [] },
            },
          ],
        },
        seo: seo("/pagina-relacionada"),
        publishedAt: "2026-09-07T12:00:00.000Z",
        relatedItems,
      },
    });

    const result = await getPublishedPageByPath("/pagina-relacionada");
    if (result.kind !== "page") throw new Error("Página pública esperada.");

    expect(
      result.page.payload.blocks.map((block) =>
        block.type === "related_content" ? block.data.itemIds : null,
      ),
    ).toEqual([["/servicos/primeiro"], ["/solucoes/segundo"], []]);
    expect(result.page.payload.blocks.every((block) => !("itemPaths" in block.data))).toBe(true);
    expect(result.page.relatedItems).toEqual(relatedItems);
  });

  it("rejeita metadados internos e UUID em qualquer nível da resposta pública", async () => {
    response({
      kind: "post",
      slug: "artigo-publico",
      path: "/blog/artigo-publico",
      payload: {
        ...postPayload,
        governanceState: "homologated",
        author: { ...postPayload.author, id: "84000000-0000-4000-8000-000000000001" },
      },
      seo: postPayload.seo,
      publishedAt: "2026-09-07T12:00:00.000Z",
    });
    await expect(getPublishedPost("artigo-publico")).rejects.toThrow("incompatível");
  });

  it("rejeita também UUID canônico fora das variantes RFC usadas pelo banco", async () => {
    response({
      kind: "post",
      slug: "artigo-publico",
      path: "/blog/artigo-publico",
      payload: {
        ...postPayload,
        summary: "Referência 00000000-0000-0000-0000-000000000000",
      },
      seo: postPayload.seo,
      publishedAt: "2026-09-07T12:00:00.000Z",
    });
    await expect(getPublishedPost("artigo-publico")).rejects.toThrow("incompatível");
  });

  it("rejeita variantes de nomes técnicos mesmo sem um valor identificável", async () => {
    response({
      kind: "post",
      slug: "artigo-publico",
      path: "/blog/artigo-publico",
      payload: {
        ...postPayload,
        delivery: { owner_id: "opaque", documentHash: "opaque", storageBucket: "opaque" },
      },
      seo: postPayload.seo,
      publishedAt: "2026-09-07T12:00:00.000Z",
    });
    await expect(getPublishedPost("artigo-publico")).rejects.toThrow("incompatível");
  });

  it("rejeita hashes hexadecimais de comprimentos usuais em qualquer valor público", async () => {
    for (const length of [40, 64, 128]) {
      response({
        kind: "post",
        slug: "artigo-publico",
        path: "/blog/artigo-publico",
        payload: { ...postPayload, summary: `referência-${"a".repeat(length)}` },
        seo: postPayload.seo,
        publishedAt: "2026-09-07T12:00:00.000Z",
      });
      await expect(getPublishedPost("artigo-publico"), `${length}-hex`).rejects.toThrow("incompatível");
    }
  });
});
