import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routeState = vi.hoisted(() => ({
  slug: "",
  pathname: "/",
  productParam: "",
}));

const api = vi.hoisted(() => ({
  getPublishedProduct: vi.fn(),
  getPublishedPost: vi.fn(),
  getPublishedCampaign: vi.fn(),
  comparePublishedProducts: vi.fn(),
}));

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useParams: () => ({ slug: routeState.slug }),
    useLocation: () => ({
      pathname: routeState.pathname,
      search: "",
      hash: "",
      state: null,
      key: "qa-route",
    }),
    useSearchParams: () => [
      new URLSearchParams(routeState.productParam ? { produtos: routeState.productParam } : undefined),
      vi.fn(),
    ],
  };
});

vi.mock("../../src/public/catalog-api", () => api);
vi.mock("../../src/public/components/CmsProductRenderer", () => ({
  CmsProductRenderer: ({ payload }: { payload: { title: string } }) => <div>{payload.title}</div>,
}));
vi.mock("@/shared/components/CmsStructuredArticle", () => ({
  CmsStructuredArticle: ({ payload }: { payload: { title: string } }) => <article>{payload.title}</article>,
}));
vi.mock("../../src/public/components/CmsPageRenderer", () => ({
  CmsPageRenderer: ({ payload }: { payload: { title: string } }) => <article>{payload.title}</article>,
}));
vi.mock("../../src/public/components/CmsLeadForm", () => ({
  CmsLeadForm: () => <form aria-label="Formulário da campanha" />,
}));

import CmsBlogPostPage from "../../src/public/pages/CmsBlogPostPage";
import CmsCampaignPage from "../../src/public/pages/CmsCampaignPage";
import CmsComparePage from "../../src/public/pages/CmsComparePage";
import CmsProductPage from "../../src/public/pages/CmsProductPage";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}

function publishedProduct(title: string, slug: string) {
  return {
    key: `/produtos/${slug}`,
    kind: "product",
    slug,
    path: `/produtos/${slug}`,
    payload: {
      title,
      models: [],
      specifications: [],
      commercial: { shortDescription: `Descrição de ${title}` },
    },
    seo: {
      title: `${title} | GAIATEC`,
      description: `SEO de ${title}`,
      canonicalPath: `/produtos/${slug}`,
      indexable: true,
      socialImage: `https://media.example.test/${slug}.webp`,
    },
    publishedAt: "2026-09-06T12:00:00.000Z",
  };
}

function publishedPost(title: string, slug: string) {
  return {
    key: `/blog/${slug}`,
    slug,
    kind: "post",
    path: `/blog/${slug}`,
    payload: { title },
    seo: {
      title: `${title} | GAIATEC`,
      description: `SEO de ${title}`,
      canonicalPath: `/blog/${slug}`,
      indexable: true,
      socialImage: `https://media.example.test/${slug}.webp`,
    },
    publishedAt: "2026-09-06T12:00:00.000Z",
  };
}

function publishedCampaign(title: string, slug: string) {
  return {
    key: `/campanhas/${slug}`,
    slug,
    kind: "campaign",
    path: `/campanhas/${slug}`,
    payload: {
      title,
      blocks: [],
      tracking: {
        enabled: false,
        requiresConsent: true,
        provider: "internal",
        eventName: "campaign-view",
      },
    },
    seo: {
      title: `${title} | GAIATEC`,
      description: `SEO de ${title}`,
      canonicalPath: `/campanhas/${slug}`,
      indexable: true,
      socialImage: `https://media.example.test/${slug}.webp`,
    },
    publishedAt: "2026-09-06T12:00:00.000Z",
  };
}

const headContent = (selector: string) => document.head.querySelector<HTMLMetaElement>(selector)?.content;

describe("estado e SEO durante navegação pública", () => {
  beforeEach(() => {
    routeState.slug = "";
    routeState.pathname = "/";
    routeState.productParam = "";
    for (const mock of Object.values(api)) mock.mockReset();
  });

  it("limpa erro do produto ao trocar o slug e publica o SEO completo só após carregar", async () => {
    routeState.slug = "produto-ausente";
    api.getPublishedProduct.mockRejectedValueOnce(new Error("Produto ausente"));
    const view = render(
      <MemoryRouter>
        <CmsProductPage />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Produto ausente");
    expect(headContent('meta[name="robots"]')).toBe("noindex,follow");

    routeState.slug = "produto-valido";
    const request = deferred<ReturnType<typeof publishedProduct>>();
    api.getPublishedProduct.mockReturnValueOnce(request.promise);
    view.rerender(
      <MemoryRouter>
        <CmsProductPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Carregando produto…")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(headContent('meta[name="robots"]')).toBe("noindex,follow");
    await act(async () => request.resolve(publishedProduct("Produto válido", "produto-valido")));
    expect(await screen.findByText("Produto válido")).toBeVisible();
    expect(document.title).toBe("Produto válido | GAIATEC");
    expect(headContent('meta[name="description"]')).toBe("SEO de Produto válido");
    expect(headContent('meta[property="og:title"]')).toBe("Produto válido | GAIATEC");
    expect(headContent('meta[property="og:image"]')).toBe("https://media.example.test/produto-valido.webp");
    expect(headContent('meta[name="robots"]')).toBe("index,follow");
    const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
    expect(canonical && new URL(canonical).pathname).toBe("/produtos/produto-valido");
  });

  it("limpa erro do artigo ao trocar o slug e substitui metadados herdados", async () => {
    routeState.slug = "artigo-ausente";
    api.getPublishedPost.mockRejectedValueOnce(new Error("falha"));
    const view = render(
      <MemoryRouter>
        <CmsBlogPostPage />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Artigo não encontrado");

    routeState.slug = "artigo-valido";
    const request = deferred<ReturnType<typeof publishedPost>>();
    api.getPublishedPost.mockReturnValueOnce(request.promise);
    view.rerender(
      <MemoryRouter>
        <CmsBlogPostPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("Carregando artigo…")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await act(async () => request.resolve(publishedPost("Artigo válido", "artigo-valido")));
    expect(await screen.findByText("Artigo válido")).toBeVisible();
    expect(document.title).toBe("Artigo válido | GAIATEC");
    expect(headContent('meta[name="description"]')).toBe("SEO de Artigo válido");
    expect(headContent('meta[property="og:image"]')).toBe("https://media.example.test/artigo-valido.webp");
    expect(headContent('meta[name="robots"]')).toBe("index,follow");
  });

  it("limpa uma resolução encerrada ao navegar para outra campanha e aplica seu SEO", async () => {
    routeState.pathname = "/campanhas/encerrada";
    api.getPublishedCampaign.mockResolvedValueOnce({ kind: "fallback" });
    const view = render(
      <MemoryRouter>
        <CmsCampaignPage />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Campanha encerrada" })).toBeVisible();

    routeState.pathname = "/campanhas/ativa";
    const request = deferred<ReturnType<typeof publishedCampaign>>();
    api.getPublishedCampaign.mockReturnValueOnce(request.promise);
    view.rerender(
      <MemoryRouter>
        <CmsCampaignPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("Carregando campanha…")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Campanha encerrada" })).not.toBeInTheDocument();
    expect(headContent('meta[name="robots"]')).toBe("noindex,follow");

    await act(async () => request.resolve(publishedCampaign("Campanha ativa", "ativa")));
    expect(await screen.findByText("Campanha ativa")).toBeVisible();
    expect(document.title).toBe("Campanha ativa | GAIATEC");
    expect(headContent('meta[name="description"]')).toBe("SEO de Campanha ativa");
    expect(headContent('meta[property="og:image"]')).toBe("https://media.example.test/ativa.webp");
    expect(headContent('meta[name="robots"]')).toBe("index,follow");
  });

  it("limpa erro e produtos antigos quando os parâmetros do comparador mudam", async () => {
    routeState.productParam = "produto-a,produto-b";
    api.comparePublishedProducts.mockRejectedValueOnce(new Error("Comparação indisponível"));
    const view = render(
      <MemoryRouter>
        <CmsComparePage />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Comparação indisponível");

    routeState.productParam = "produto-c,produto-d";
    const request = deferred<{ items: ReturnType<typeof publishedProduct>[] }>();
    api.comparePublishedProducts.mockReturnValueOnce(request.promise);
    view.rerender(
      <MemoryRouter>
        <CmsComparePage />
      </MemoryRouter>,
    );
    expect(screen.getByText("Carregando comparação…")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await act(async () =>
      request.resolve({
        items: [publishedProduct("Produto C", "produto-c"), publishedProduct("Produto D", "produto-d")],
      }),
    );
    expect(await screen.findByRole("columnheader", { name: "Produto C" })).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "Produto D" })).toBeVisible();
    expect(headContent('meta[name="robots"]')).toBe("noindex,follow");
    expect(headContent('meta[name="description"]')).toBe(
      "Compare especificações técnicas dos produtos disponíveis no catálogo GAIATEC.",
    );
  });
});
