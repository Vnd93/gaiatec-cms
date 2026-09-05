import { describe, expect, it } from "vitest";
import {
  CmsCampaignContentSchema,
  CmsFormVersionSchema,
  CmsLeadCaptureSchema,
  CmsPostContentSchema,
} from "../../src/shared/contracts/cms-content";
import { createPageBlock } from "../../src/admin/page-builder-model";

const id = (suffix: number) => `70000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
const provenance = [
  {
    sourceKind: "owner_authored" as const,
    authorizationReference: "TESTE-LOCAL-F7",
    authorizationDate: "2026-08-29",
    rightsScope: "Fixture sintética local",
    rightsConfirmed: true as const,
    commercialOwner: "Owner sintético",
    technicalOwner: "Owner sintético",
    verifiedAt: "2026-08-29T12:00:00.000Z",
  },
];

const form = {
  schemaVersion: 1 as const,
  formId: id(1),
  versionId: id(2),
  version: 1,
  key: "contato-sintetico",
  title: "Contato sintético",
  purpose: "Validar o contrato local sem dados reais.",
  fields: [
    {
      id: id(3),
      key: "email",
      label: "E-mail",
      type: "email" as const,
      required: true,
      maxLength: 254,
      options: [],
      personalData: true,
      order: 0,
    },
  ],
  consent: {
    required: true as const,
    text: "Aceito o tratamento dos dados sintéticos.",
    version: "teste-v1",
    privacyPath: "/politica-de-privacidade",
  },
  slaMinutes: 60,
  retentionDays: 30,
  successMessage: "Recebido.",
  submitLabel: "Enviar",
  status: "published" as const,
};

describe("F7 marketing, blog and lead contracts", () => {
  it("accepts structured blog authorship, taxonomy, relations and scheduling", () => {
    const post = {
      schemaVersion: 1 as const,
      consumerId: "cms.blog-article.v1",
      contentType: "post" as const,
      title: "Artigo sintético",
      summary: "Resumo sintético.",
      excerpt: "Resumo sintético.",
      authorName: "Autora sintética",
      author: { id: id(10), name: "Autora sintética", slug: "autora-sintetica" },
      category: { id: id(11), name: "Categoria sintética", slug: "categoria-sintetica" },
      tags: [{ id: id(12), name: "Teste local", slug: "teste-local" }],
      relations: { postIds: [], productIds: [], serviceIds: [], applicationIds: [], solutionIds: [] },
      readingMinutes: 4,
      publishAfter: "2026-08-30T12:00:00.000Z",
      blocks: [{ id: id(13), type: "rich_text" as const, data: { text: "Texto sintético." } }],
      seo: {
        title: "Artigo sintético",
        description: "Descrição sintética do artigo técnico.",
        canonicalPath: "/blog/artigo-sintetico",
        indexable: false,
      },
      provenance,
    };
    expect(CmsPostContentSchema.safeParse(post).success).toBe(true);
    expect(
      CmsPostContentSchema.safeParse({ ...post, author: { ...post.author, id: "antigo" } }).success,
    ).toBe(false);
  });

  it("freezes a valid form version and rejects selects without options", () => {
    expect(CmsFormVersionSchema.safeParse(form).success).toBe(true);
    expect(
      CmsFormVersionSchema.safeParse({
        ...form,
        fields: [{ ...form.fields[0], type: "select", options: [] }],
      }).success,
    ).toBe(false);
  });

  it("requires explicit consent and typed origin in lead capture", () => {
    const capture = {
      formId: form.formId,
      formVersionId: form.versionId,
      idempotencyKey: id(20),
      fields: { email: "sintetico@example.test" },
      origin: {
        path: "/campanhas/campanha-sintetica",
        source: "campaign",
        campaignId: id(21),
        utm: { source: "fixture" },
      },
      consent: { accepted: true as const, text: form.consent.text, version: form.consent.version },
      honeypot: "",
    };
    expect(CmsLeadCaptureSchema.safeParse(capture).success).toBe(true);
    expect(
      CmsLeadCaptureSchema.safeParse({ ...capture, consent: { ...capture.consent, accepted: false } })
        .success,
    ).toBe(false);
  });

  it("validates campaign windows, templates, consented tracking, form pinning and expiry", () => {
    const campaign = {
      schemaVersion: 1 as const,
      consumerId: "cms.campaign-landing.v1" as const,
      contentType: "campaign" as const,
      title: "Campanha sintética",
      summary: "Landing page sintética para teste local.",
      campaignKind: "lead_generation" as const,
      templateKey: "landing_conversion" as const,
      route: { path: "/campanhas/campanha-sintetica" },
      window: {
        startsAt: "2026-08-29T12:00:00.000Z",
        endsAt: "2026-09-05T12:00:00.000Z",
        timezone: "America/Sao_Paulo" as const,
      },
      blocks: [createPageBlock("hero"), createPageBlock("form")],
      placements: [
        { id: id(30), slot: "home_featured" as const, contextType: "global" as const, priority: 10 },
      ],
      form: { formId: form.formId, versionId: form.versionId, key: form.key },
      tracking: {
        enabled: true,
        requiresConsent: true as const,
        provider: "internal" as const,
        eventName: "campaign-view",
      },
      expiry: { mode: "redirect" as const, destinationPath: "/contato" },
      relations: { productIds: [], serviceIds: [], solutionIds: [], pageIds: [] },
      seo: {
        title: "Campanha sintética",
        description: "Descrição sintética da campanha para validação.",
        canonicalPath: "/campanhas/campanha-sintetica",
        indexable: false,
      },
      provenance,
      governanceState: "synthetic_test" as const,
      approval: { businessOwner: "Owner", marketingReviewer: "Marketing", privacyReviewer: "Privacidade" },
    };
    expect(CmsCampaignContentSchema.safeParse(campaign).success).toBe(true);
    expect(
      CmsCampaignContentSchema.safeParse({
        ...campaign,
        window: { ...campaign.window, endsAt: campaign.window.startsAt },
      }).success,
    ).toBe(false);
    expect(CmsCampaignContentSchema.safeParse({ ...campaign, expiry: { mode: "fallback" } }).success).toBe(
      false,
    );
  });
});
