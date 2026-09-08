import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  autocompletePublished,
  getCampaignPlacements,
  getPublicRouteRule,
  getPublishedCampaign,
  getPublishedDiscoveryCollection,
  getPublishedForm,
  getPublishedPageByPath,
  getPublishedProduct,
  getPublishedProducts,
  getPublishedPosts,
  getPublishedSiteShell,
  type PublicFormVersion,
} from "../../src/public/catalog-api";
import { submitGovernedLead } from "../../src/public/lead-api";
import { SUPABASE_URL } from "../../src/lib/supabase";

const formId = "91000000-0000-4000-8000-000000000006";
const versionId = "91000000-0000-4000-8000-000000000007";
const fieldId = "91000000-0000-4000-8000-000000000008";
const correlationId = "91000000-0000-4000-8000-000000000009";
const embeddedUuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const legacyFormResponse = {
  schemaVersion: 1,
  formId,
  versionId,
  version: 2,
  key: "contato-principal",
  title: "Contato",
  purpose: "Atendimento comercial",
  fields: [
    {
      id: fieldId,
      key: "email",
      label: "E-mail",
      type: "email",
      required: true,
      maxLength: 320,
      options: [],
      personalData: true,
      order: 0,
    },
  ],
  consent: {
    required: true as const,
    text: "Autorizo o contato conforme a política de privacidade.",
    version: "2026-v1",
    privacyPath: "/politica-de-privacidade",
  },
  slaMinutes: 60,
  retentionDays: 30,
  successMessage: "Recebido.",
  submitLabel: "Enviar",
  status: "published",
};

const publicFormResponse: PublicFormVersion = {
  key: legacyFormResponse.key,
  version: legacyFormResponse.version,
  title: legacyFormResponse.title,
  purpose: legacyFormResponse.purpose,
  fields: [
    {
      key: "email",
      label: "E-mail",
      type: "email",
      required: true,
      maxLength: 320,
      options: [],
      order: 0,
    },
  ],
  consent: legacyFormResponse.consent,
  successMessage: legacyFormResponse.successMessage,
  submitLabel: legacyFormResponse.submitLabel,
};

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function legacyResource({
  kind,
  slug,
  path,
  itemId,
  payload,
  form,
}: {
  kind: "campaign" | "page" | "product";
  slug: string;
  path: string;
  itemId: string;
  payload: Record<string, unknown>;
  form?: typeof legacyFormResponse;
}) {
  return {
    item_id: itemId,
    revision_id: "92000000-0000-4000-8000-000000000002",
    content_type: kind,
    slug,
    schema_version: 1,
    consumer_id:
      kind === "campaign"
        ? "cms.campaign-landing.v1"
        : kind === "page"
          ? "cms.managed-page.v1"
          : "cms.product.v1",
    renderer_key:
      kind === "campaign" ? "campaign-landing" : kind === "page" ? "managed-page" : "product-detail",
    payload,
    seo: {
      title: `${payload.title} | GAIATEC`,
      description: "Conteúdo público controlado para a ponte de compatibilidade.",
      canonicalPath: path,
      indexable: false,
    },
    content_version: 1,
    cache_tag: `cms-${kind}-compatibility`,
    etag: `etag-${kind}-compatibility`,
    published_at: "2026-09-08T09:00:00.000Z",
    path,
    media_urls: {},
    media_alt: {},
    document_urls: {},
    ...(form ? { form } : {}),
  };
}

const submit = (
  form: PublicFormVersion,
  context: {
    source?: string;
    campaignPath?: string;
    productSlug?: string;
  } = {},
) =>
  submitGovernedLead({
    form,
    fields: { email: "pessoa@example.test" },
    idempotencyKey: "01234567-89ab-4cde-af01-23456789abcd",
    source: context.source ?? "contact",
    campaignPath: context.campaignPath,
    productSlug: context.productSlug,
    consentAccepted: true,
    captchaToken: "captcha-publico",
  });

beforeEach(() => {
  window.history.replaceState({}, "", "/campanhas/qa?utm_source=homologacao");
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => vi.unstubAllGlobals());

describe("public f48 expand/contract bridge", () => {
  it("normalizes the active f48 form when a footer consumer omits the version", async () => {
    const request = vi.fn().mockResolvedValueOnce(response(legacyFormResponse));
    vi.stubGlobal("fetch", request);

    await expect(getPublishedForm("contato-principal")).resolves.toEqual(publicFormResponse);
    const requested = new URL(String(request.mock.calls[0]?.[0]));
    expect(Object.fromEntries(requested.searchParams)).toEqual({
      type: "form",
      key: "contato-principal",
    });
  });

  it("keeps empty f48 post, product, discovery and autocomplete collections valid", async () => {
    const productFacets = {
      productCategory: [],
      applicationMagnitude: [],
      technology: [],
      installationOperation: [],
      monitoredElement: [],
    };
    const request = vi
      .fn()
      .mockResolvedValueOnce(response({ items: [], total: 0 }))
      .mockResolvedValueOnce(
        response({ items: [], total: 0, facets: productFacets, groups: { product: 0 }, query: "" }),
      )
      .mockResolvedValueOnce(response({ items: [], total: 0, facets: {}, groups: { service: 0 }, query: "" }))
      .mockResolvedValueOnce(response({ items: [], total: 0, facets: {}, groups: {}, query: "qa" }));
    vi.stubGlobal("fetch", request);

    await expect(getPublishedPosts()).resolves.toEqual({ items: [], total: 0 });
    await expect(getPublishedProducts({})).resolves.toMatchObject({ items: [], total: 0 });
    await expect(getPublishedDiscoveryCollection("service")).resolves.toMatchObject({
      items: [],
      total: 0,
    });
    await expect(autocompletePublished("qa")).resolves.toMatchObject({ items: [], total: 0 });
  });

  it("normalizes the f48 site shell and campaign placements without internal identifiers", async () => {
    const navigationId = "92000000-0000-4000-8000-000000000050";
    const socialId = "92000000-0000-4000-8000-000000000051";
    const placementId = "92000000-0000-4000-8000-000000000052";
    const targetId = "92000000-0000-4000-8000-000000000053";
    const campaignId = "92000000-0000-4000-8000-000000000054";
    const shell = {
      navigation: {
        schemaVersion: 1,
        consumerId: "cms.site-navigation.v1",
        contentType: "navigation",
        title: "Navegação",
        blocks: [],
        seo: {
          title: "Navegação",
          description: "Configuração pública.",
          canonicalPath: "/_site/navigation",
          indexable: false,
        },
        provenance: [],
        items: [
          {
            id: navigationId,
            parentId: null,
            location: "header",
            label: "Produtos",
            href: "/produtos",
            order: 0,
            newTab: false,
            visible: true,
          },
        ],
      },
      settings: {
        schemaVersion: 1,
        consumerId: "cms.site-settings.v1",
        contentType: "site_settings",
        title: "Configurações",
        blocks: [],
        seo: {
          title: "Configurações",
          description: "Configuração pública.",
          canonicalPath: "/_site/settings",
          indexable: false,
        },
        provenance: [],
        company: {
          name: "GAIATEC",
          phone: "+55 11 0000-0000",
          whatsapp: "+55 11 0000-0000",
          email: "contato@example.test",
          address: "São Paulo",
        },
        socialLinks: [{ id: socialId, network: "LinkedIn", url: "https://www.linkedin.com/company/gaiatec" }],
        defaultCta: { label: "Contato", href: "/contato" },
      },
      placements: {
        schemaVersion: 1,
        consumerId: "cms.site-placements.v1",
        contentType: "placement",
        title: "Destaques",
        blocks: [],
        seo: {
          title: "Destaques",
          description: "Configuração pública.",
          canonicalPath: "/_site/placements",
          indexable: false,
        },
        provenance: [],
        placements: [
          {
            id: placementId,
            slot: "catalog_featured",
            targetType: "product",
            targetId,
            label: "Produto em destaque",
            startsAt: "2026-09-01T00:00:00.000Z",
            endsAt: "2026-10-01T00:00:00.000Z",
            priority: 10,
            enabled: true,
            target: {
              itemId: targetId,
              contentType: "product",
              title: "Produto público",
              summary: "Resumo público.",
              path: "/produtos/produto-publico",
            },
          },
        ],
      },
    };
    const oldCampaignPlacements = {
      items: [
        {
          id: placementId,
          slot: "product_banner",
          contextType: "product",
          contextId: targetId,
          priority: 10,
          startsAt: "2026-09-01T00:00:00.000Z",
          endsAt: "2026-10-01T00:00:00.000Z",
          campaign: {
            itemId: campaignId,
            title: "Campanha pública",
            summary: "Resumo público.",
            path: "/campanhas/campanha-publica",
          },
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(response(shell)).mockResolvedValueOnce(response(oldCampaignPlacements)),
    );

    const normalizedShell = await getPublishedSiteShell();
    expect(normalizedShell.navigation?.items[0]).toEqual({
      location: "header",
      label: "Produtos",
      href: "/produtos",
      newTab: false,
    });
    expect(normalizedShell.placements?.placements[0]?.target).toEqual({
      kind: "product",
      title: "Produto público",
      summary: "Resumo público.",
      path: "/produtos/produto-publico",
    });
    const placements = await getCampaignPlacements("/produtos/produto-publico");
    expect(placements.items[0]?.campaign).toEqual({
      title: "Campanha pública",
      summary: "Resumo público.",
      path: "/campanhas/campanha-publica",
    });
    expect(JSON.stringify({ normalizedShell, placements })).not.toMatch(embeddedUuid);
  });

  it("normalizes exact f48 page, campaign and direct route rules and rejects open redirects", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        response({ kind: "route", rule: { destination_path: "/pagina-nova", status_code: 301 } }),
      )
      .mockResolvedValueOnce(response({ kind: "route", rule: { destination_path: null, status_code: 410 } }))
      .mockResolvedValueOnce(response({ destination_path: "/destino", status_code: 302 }))
      .mockResolvedValueOnce(response({ destination_path: "https://attacker.example", status_code: 301 }));
    vi.stubGlobal("fetch", request);

    await expect(getPublishedPageByPath("/pagina-antiga")).resolves.toEqual({
      kind: "route",
      rule: { destinationPath: "/pagina-nova", status: 301 },
    });
    await expect(getPublishedCampaign("/campanhas/encerrada")).resolves.toEqual({
      kind: "route",
      rule: { destinationPath: null, status: 410 },
    });
    await expect(getPublicRouteRule("/origem")).resolves.toEqual({
      destinationPath: "/destino",
      status: 302,
    });
    await expect(getPublicRouteRule("/origem-maliciosa")).rejects.toThrow(
      "Resposta pública incompatível com o contrato vigente.",
    );
  });

  it("converts f48 media, documents and OG to semantic same-origin selectors", async () => {
    const mediaId = "92000000-0000-4000-8000-000000000030";
    const documentId = "92000000-0000-4000-8000-000000000031";
    const productSlug = "produto-com-midias";
    const product = legacyResource({
      kind: "product",
      slug: productSlug,
      path: `/produtos/${productSlug}`,
      itemId: "92000000-0000-4000-8000-000000000032",
      payload: {
        title: "Produto com mídias",
        media: [{ assetId: mediaId, role: "primary" }],
        blocks: [
          {
            id: "92000000-0000-4000-8000-000000000033",
            type: "image",
            data: { assetId: mediaId, caption: "Aplicação controlada" },
          },
        ],
        documents: [
          {
            id: documentId,
            kind: "manual",
            title: "Manual técnico",
            revision: "A",
            language: "pt-BR",
            visibility: "public",
          },
        ],
        seo: {
          title: "Produto com mídias | GAIATEC",
          description: "Produto com ativos públicos controlados.",
          canonicalPath: `/produtos/${productSlug}`,
          indexable: false,
          ogImageId: mediaId,
        },
      },
    });
    (product as Record<string, unknown>).seo = { ...product.seo, ogImageId: mediaId };
    const backendOrigin = new URL(SUPABASE_URL).origin;
    product.media_urls = {
      [`${mediaId}:large.webp`]: `${backendOrigin}/storage/v1/object/sign/cms-media-private/cms/${mediaId}/large.webp?token=private-media-token`,
      "large.webp": `${backendOrigin}/storage/v1/object/sign/cms-media-private/cms/${mediaId}/large.webp?token=private-media-token`,
    };
    product.media_alt = { [mediaId]: "Produto em operação" };
    product.document_urls = {
      [documentId]: `${backendOrigin}/storage/v1/object/sign/cms-documents-private/cms-documents/${documentId}/manual.pdf?token=private-document-token`,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(product)));

    const result = await getPublishedProduct(productSlug);
    const primaryId = result.payload.media[0]?.assetId;
    const blockId = (result.payload.blocks[0]?.data as { assetId?: string } | undefined)?.assetId;
    const document = result.payload.documents[0];
    expect(result.mediaUrls?.[`${primaryId}:large.webp`]).toContain(
      "/__cms-public-asset?type=media&kind=product&slug=produto-com-midias",
    );
    expect(result.mediaUrls?.[`${blockId}:large.webp`]).toContain("slot=primary");
    expect(result.mediaAlt?.[String(primaryId)]).toBe("Produto em operação");
    expect(result.documentUrls?.[String(document?.id)]).toContain("type=document");
    expect(result.documentUrls?.[String(document?.id)]).toContain("position=1");
    expect(result.seo.socialImage).toContain("slot=social");
    expect((result.payload.seo as { socialImage?: string }).socialImage).toBe(result.seo.socialImage);
    const publicState = JSON.stringify(result);
    expect(publicState).not.toMatch(embeddedUuid);
    expect(publicState).not.toMatch(/storage\/v1|private-(?:media|document)-token/i);
  });

  it("rejects an f48 resource whose signed asset points outside the configured backend", async () => {
    const mediaId = "92000000-0000-4000-8000-000000000040";
    const product = legacyResource({
      kind: "product",
      slug: "produto-ssrf",
      path: "/produtos/produto-ssrf",
      itemId: "92000000-0000-4000-8000-000000000041",
      payload: { title: "Produto inválido", media: [{ assetId: mediaId, role: "primary" }], blocks: [] },
    });
    product.media_urls = {
      [`${mediaId}:large.webp`]:
        "https://attacker.example/storage/v1/object/sign/cms-media-private/file.webp?token=stolen",
    };
    product.media_alt = { [mediaId]: "Imagem" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(product)));

    await expect(getPublishedProduct("produto-ssrf")).rejects.toThrow(
      "Conteúdo público incompatível com o contrato vigente.",
    );
  });

  it("normalizes an f48 page envelope before it reaches public state", async () => {
    const pagePath = "/qa-legacy-page";
    const page = legacyResource({
      kind: "page",
      slug: "qa-legacy-page",
      path: pagePath,
      itemId: "92000000-0000-4000-8000-000000000001",
      payload: {
        schemaVersion: 1,
        consumerId: "cms.managed-page.v1",
        contentType: "page",
        title: "Página legada",
        pageKind: "institutional",
        templateKey: "standard",
        route: { path: pagePath, navigationLabel: "Página legada" },
        blocks: [
          {
            id: "92000000-0000-4000-8000-000000000003",
            type: "rich_text",
            hidden: false,
            width: "content",
            tone: "light",
            data: { heading: "Conteúdo", text: "Conteúdo público da página legada." },
          },
        ],
        seo: {
          title: "Página legada | GAIATEC",
          description: "Conteúdo público controlado para a ponte de compatibilidade.",
          canonicalPath: pagePath,
          indexable: false,
        },
        provenance: [{ sourceKind: "owner_authored", verifiedAt: "2026-09-08T09:00:00.000Z" }],
        governanceState: "synthetic_test",
        relations: {
          productIds: [],
          serviceIds: [],
          industryIds: [],
          applicationIds: [],
          solutionIds: [],
        },
        retirement: { mode: "gone" },
        approval: { businessOwner: "QA", editorialReviewer: "QA" },
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response({ kind: "page", page })));

    const result = await getPublishedPageByPath(pagePath);
    expect(result).toMatchObject({
      kind: "page",
      page: {
        kind: "page",
        path: pagePath,
        payload: {
          title: "Página legada",
          blocks: [{ id: "block-1", type: "rich_text" }],
        },
      },
    });
    expect(JSON.stringify(result)).not.toMatch(embeddedUuid);
    expect(JSON.stringify(result)).not.toMatch(/schemaVersion|consumerId|governanceState|provenance/);
  });

  it("normalizes the complete f48 form privately and emits the exact legacy submission once", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(response(legacyFormResponse))
      .mockResolvedValueOnce(response({ reference: "LD-0123ABCDEF", duplicate: false, correlationId }, 201));
    vi.stubGlobal("fetch", request);

    const form = await getPublishedForm("contato-principal", 2);
    expect(form).toEqual(publicFormResponse);
    expect(JSON.stringify(form)).not.toMatch(embeddedUuid);
    expect(form).not.toHaveProperty("formId");
    expect(form).not.toHaveProperty("versionId");
    expect(form).not.toHaveProperty("status");
    expect(document.documentElement.innerHTML).not.toMatch(embeddedUuid);
    expect(JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } })).not.toMatch(
      embeddedUuid,
    );

    await expect(submit(form!)).resolves.toEqual({ reference: "LD-0123ABCDEF", duplicate: false });
    expect(request).toHaveBeenCalledTimes(2);
    const getUrl = new URL(String(request.mock.calls[0]?.[0]));
    expect(Object.fromEntries(getUrl.searchParams)).toEqual({
      type: "form",
      key: "contato-principal",
      version: "2",
    });
    const body = JSON.parse(String(request.mock.calls[1]?.[1]?.body));
    expect(body).toEqual({
      formId,
      formVersionId: versionId,
      idempotencyKey: "01234567-89ab-4cde-af01-23456789abcd",
      fields: { email: "pessoa@example.test" },
      origin: {
        path: "/campanhas/qa",
        source: "contact",
        utm: { source: "homologacao" },
      },
      consent: {
        accepted: true,
        text: legacyFormResponse.consent.text,
        version: legacyFormResponse.consent.version,
      },
      honeypot: "",
      captchaToken: "captcha-publico",
    });
    expect(body.origin).not.toHaveProperty("campaignId");
    expect(body.origin).not.toHaveProperty("productId");
  });

  it("emits the exact UUID-free candidate contract for a candidate response", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(response(publicFormResponse))
      .mockResolvedValueOnce(response({ reference: "LD-ABCDEF0123", duplicate: true }, 201));
    vi.stubGlobal("fetch", request);

    const form = await getPublishedForm("contato-principal", 2);
    await expect(submit(form!, { source: "campaign", campaignPath: "/campanhas/qa" })).resolves.toEqual({
      reference: "LD-ABCDEF0123",
      duplicate: true,
    });

    const body = JSON.parse(String(request.mock.calls[1]?.[1]?.body));
    expect(body).toEqual({
      formKey: "contato-principal",
      formVersion: 2,
      submissionToken: "0123456789ab4cdeaf0123456789abcd",
      fields: { email: "pessoa@example.test" },
      origin: {
        path: "/campanhas/qa",
        source: "campaign",
        campaignPath: "/campanhas/qa",
        utm: { source: "homologacao" },
      },
      consent: {
        accepted: true,
        text: publicFormResponse.consent.text,
        version: publicFormResponse.consent.version,
      },
      honeypot: "",
      captchaToken: "captcha-publico",
    });
    expect(JSON.stringify(body)).not.toMatch(embeddedUuid);
    expect(body).not.toHaveProperty("formId");
    expect(body).not.toHaveProperty("formVersionId");
  });

  it("keeps candidate product context public and UUID-free", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(response({ reference: "LD-ABCDEF0123", duplicate: false }, 201));
    vi.stubGlobal("fetch", request);
    window.history.replaceState({}, "", "/produtos/produto-qa?utm_source=homologacao");

    await expect(
      submit(publicFormResponse, { source: "product", productSlug: "produto-qa" }),
    ).resolves.toEqual({ reference: "LD-ABCDEF0123", duplicate: false });

    const body = JSON.parse(String(request.mock.calls[0]?.[1]?.body));
    expect(body.origin).toEqual({
      path: "/produtos/produto-qa",
      source: "product",
      productSlug: "produto-qa",
      utm: { source: "homologacao" },
    });
    expect(JSON.stringify(body)).not.toMatch(embeddedUuid);
  });

  it("binds a legacy campaign path to its private item identifier", async () => {
    const campaignId = "92000000-0000-4000-8000-000000000010";
    const blockId = "92000000-0000-4000-8000-000000000011";
    const campaignPath = "/campanhas/qa-legacy";
    const campaign = legacyResource({
      kind: "campaign",
      slug: "qa-legacy",
      path: campaignPath,
      itemId: campaignId,
      form: legacyFormResponse,
      payload: {
        schemaVersion: 1,
        consumerId: "cms.campaign-landing.v1",
        contentType: "campaign",
        title: "Campanha legada",
        summary: "Campanha controlada para validar a ponte.",
        campaignKind: "lead_generation",
        templateKey: "landing_conversion",
        route: { path: campaignPath },
        window: {
          startsAt: "2026-09-01T00:00:00.000Z",
          endsAt: "2026-09-30T00:00:00.000Z",
          timezone: "America/Sao_Paulo",
        },
        blocks: [
          {
            id: blockId,
            type: "form",
            hidden: false,
            width: "content",
            tone: "light",
            data: {
              formKey: "chave-obsoleta",
              formId,
              formVersionId: versionId,
              heading: "Contato",
            },
          },
        ],
        placements: [],
        form: { formId, versionId, key: "chave-obsoleta" },
        tracking: {
          enabled: false,
          requiresConsent: true,
          provider: "internal",
          eventName: "campaign-view",
        },
        expiry: { mode: "gone" },
        relations: { productIds: [], serviceIds: [], solutionIds: [], pageIds: [] },
        seo: {
          title: "Campanha legada | GAIATEC",
          description: "Conteúdo público controlado para a ponte de compatibilidade.",
          canonicalPath: campaignPath,
          indexable: false,
        },
        provenance: [{ sourceKind: "owner_authored", verifiedAt: "2026-09-08T09:00:00.000Z" }],
        governanceState: "synthetic_test",
        approval: {
          businessOwner: "QA",
          marketingReviewer: "QA",
          privacyReviewer: "QA",
        },
      },
    });
    const request = vi
      .fn()
      .mockResolvedValueOnce(response(campaign))
      .mockResolvedValueOnce(response({ reference: "LD-ABCDEF0123", duplicate: false }, 201));
    vi.stubGlobal("fetch", request);

    const result = await getPublishedCampaign(campaignPath);
    if (result.kind !== "campaign" || !result.form) throw new Error("Campanha com formulário esperada.");
    expect(result.payload).not.toHaveProperty("form");
    expect(JSON.stringify(result)).not.toMatch(embeddedUuid);
    expect(result.payload.blocks[0]?.data).toMatchObject({
      formKey: "contato-principal",
      formVersion: 2,
      governed: true,
    });

    window.history.replaceState({}, "", `${campaignPath}?utm_source=homologacao`);
    await submit(result.form, { source: "campaign", campaignPath });
    const body = JSON.parse(String(request.mock.calls[1]?.[1]?.body));
    expect(body.origin).toEqual({
      path: campaignPath,
      source: "campaign",
      campaignId,
      utm: { source: "homologacao" },
    });
    expect(body.origin).not.toHaveProperty("campaignPath");
  });

  it("binds a legacy product slug to its private item identifier", async () => {
    const productId = "92000000-0000-4000-8000-000000000020";
    const productSlug = "produto-legacy";
    const product = legacyResource({
      kind: "product",
      slug: productSlug,
      path: `/produtos/${productSlug}`,
      itemId: productId,
      payload: {
        schemaVersion: 1,
        consumerId: "cms.product.v1",
        contentType: "product",
        title: "Produto legado",
        blocks: [],
        seo: {
          title: "Produto legado | GAIATEC",
          description: "Conteúdo público controlado para a ponte de compatibilidade.",
          canonicalPath: `/produtos/${productSlug}`,
          indexable: false,
        },
      },
    });
    const request = vi
      .fn()
      .mockResolvedValueOnce(response(product))
      .mockResolvedValueOnce(response(legacyFormResponse))
      .mockResolvedValueOnce(response({ reference: "LD-ABCDEF0123", duplicate: false }, 201));
    vi.stubGlobal("fetch", request);

    const normalizedProduct = await getPublishedProduct(productSlug);
    expect(JSON.stringify(normalizedProduct)).not.toMatch(embeddedUuid);
    const form = await getPublishedForm("contato-principal", 2);
    window.history.replaceState({}, "", `/produtos/${productSlug}?utm_source=homologacao`);
    await submit(form!, { source: "product", productSlug });

    const body = JSON.parse(String(request.mock.calls[2]?.[1]?.body));
    expect(body.origin).toEqual({
      path: `/produtos/${productSlug}`,
      source: "product",
      productId,
      utm: { source: "homologacao" },
    });
    expect(body.origin).not.toHaveProperty("productSlug");
  });

  it("accepts the sanitized candidate confirmation for a legacy-bound form", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(response(legacyFormResponse))
      .mockResolvedValueOnce(response({ reference: "LD-ABCDEF0123", duplicate: false }, 201));
    vi.stubGlobal("fetch", request);

    const form = await getPublishedForm("contato-principal", 2);
    await expect(submit(form!)).resolves.toEqual({ reference: "LD-ABCDEF0123", duplicate: false });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("never retries across contracts after a legacy submission failure", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(response(legacyFormResponse))
      .mockResolvedValueOnce(response({ error: "envelope rejeitado" }, 400));
    vi.stubGlobal("fetch", request);

    const form = await getPublishedForm("contato-principal", 2);
    await expect(submit(form!)).rejects.toThrow("Não foi possível enviar. Tente novamente.");
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("does not transfer an ephemeral legacy binding to a cloned public form", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(response(legacyFormResponse))
      .mockResolvedValueOnce(response({ reference: "LD-0123ABCDEF", duplicate: false }, 201));
    vi.stubGlobal("fetch", request);

    const form = await getPublishedForm("contato-principal", 2);
    await submit({ ...form! });

    const body = JSON.parse(String(request.mock.calls[1]?.[1]?.body));
    expect(body).toMatchObject({ formKey: "contato-principal", formVersion: 2 });
    expect(body).not.toHaveProperty("formId");
    expect(body).not.toHaveProperty("formVersionId");
  });
});
