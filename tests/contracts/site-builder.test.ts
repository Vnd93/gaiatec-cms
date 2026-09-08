import { describe, expect, it } from "vitest";
import {
  CmsManagedPageContentSchema,
  CmsNavigationContentSchema,
  CmsPlacementContentSchema,
  CmsSiteSettingsContentSchema,
} from "../../src/shared/contracts/cms-content";
import {
  MANAGED_PAGE_TEMPLATES,
  PAGE_BUILDER_BLOCK_TYPES,
  createEmptyPageBlock,
  createInitialPagePayload,
  createPageBlock,
  duplicateManagedPagePayload,
  duplicatePageBlock,
  governedFormBindingIssue,
  movePageBlock,
  publishedFormForBlock,
  type PublishedFormOption,
} from "../../src/admin/page-builder-model";
import { createSiteDocument } from "../../src/admin/site-document-model";

const id = (suffix: number) => `60000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
const publishedForm: PublishedFormOption = {
  id: id(903),
  formKey: "qa-site-builder",
  versionId: id(904),
  title: "Formulário QA Site Builder",
};
const references = { assetId: id(901), relatedItemId: id(902), form: publishedForm };
const seo = {
  title: "Página de teste | GAIATEC",
  description: "Página sintética para validar o contrato governado do site builder GAIATEC.",
  canonicalPath: "/pagina-de-teste",
  indexable: false,
};
const provenance = [
  {
    sourceKind: "owner_authored" as const,
    rightsConfirmed: true as const,
    commercialOwner: "Owner comercial sintético",
    technicalOwner: "Owner técnico sintético",
    verifiedAt: "2026-08-29T12:00:00.000Z",
  },
];
const page = {
  consumerId: "cms.managed-page.v1" as const,
  contentType: "page" as const,
  schemaVersion: 1 as const,
  title: "Página de teste",
  summary: "Conteúdo sintético.",
  pageKind: "institutional" as const,
  templateKey: "standard" as const,
  route: { path: "/pagina-de-teste", navigationLabel: "Teste", breadcrumbLabel: "Teste" },
  blocks: [
    {
      id: id(1),
      type: "hero" as const,
      hidden: false,
      width: "wide" as const,
      tone: "dark" as const,
      data: { title: "Página de teste", text: "Hero sintético", alignment: "left" as const },
    },
  ],
  seo,
  provenance,
  governanceState: "synthetic_test" as const,
  relations: { productIds: [], serviceIds: [], industryIds: [], applicationIds: [], solutionIds: [] },
  retirement: { mode: "not_found" as const },
  approval: { businessOwner: "Owner sintético", editorialReviewer: "Revisor sintético" },
};

const navigationBase = {
  consumerId: "cms.site-navigation.v1" as const,
  contentType: "navigation" as const,
  schemaVersion: 1 as const,
  title: "Navegação",
  blocks: [],
  seo: { ...seo, canonicalPath: "/_site/navigation" },
  provenance,
};

describe("F6 governed site builder contracts", () => {
  it("starts the real editor empty and keeps explicit contract fixtures for every renderer", () => {
    const draft = createInitialPagePayload("page");
    expect(CmsManagedPageContentSchema.safeParse(draft).success).toBe(false);
    expect(draft.title).toBe("");
    expect(draft.seo.title).toBe("");
    expect(draft.provenance[0]?.rightsConfirmed).toBe(false);
    expect(
      CmsManagedPageContentSchema.safeParse({ ...page, blocks: [createEmptyPageBlock("hero")] }).success,
    ).toBe(false);

    for (const type of PAGE_BUILDER_BLOCK_TYPES) {
      expect(
        CmsManagedPageContentSchema.safeParse({ ...page, blocks: [createPageBlock(type, references)] })
          .success,
      ).toBe(true);
    }
  });

  it("materializa modelos aprovados em rascunhos válidos e distintos", () => {
    for (const template of MANAGED_PAGE_TEMPLATES) {
      const draft = createInitialPagePayload("page", template.key);
      expect(CmsManagedPageContentSchema.safeParse(draft).success).toBe(false);
      expect(draft.blocks.map((block) => block.type)).toEqual(template.blockTypes);
      expect(draft.blocks).toHaveLength(template.blockTypes.length);
      expect(draft.title).toBe("");
      expect(draft.pageKind).toBe(template.pageKind);
      expect(draft.templateKey).toBe(template.templateKey);
    }
    expect(createInitialPagePayload("page", "standard").blocks.map((block) => block.type)).toEqual(
      MANAGED_PAGE_TEMPLATES[0].blockTypes,
    );
    expect(createInitialPagePayload("page", "landing").templateKey).toBe("landing");
    expect(createInitialPagePayload("page", "sector").pageKind).toBe("thematic");
  });

  it("duplicates and reorders blocks without reusing identities", () => {
    const first = { ...createPageBlock("rich_text"), anchor: "texto-principal" };
    const second = createPageBlock("cta");
    const duplicate = duplicatePageBlock(first);
    expect(duplicate.id).not.toBe(first.id);
    expect(duplicate.anchor).toBeUndefined();
    expect(movePageBlock([first, second], 0, 1).map((block) => block.id)).toEqual([second.id, first.id]);
    expect(movePageBlock([first, second], 0, -1)).toEqual([first, second]);

    const originalPage = CmsManagedPageContentSchema.parse(page);
    const duplicatePage = duplicateManagedPagePayload(originalPage, "pagina-copiada");
    expect(CmsManagedPageContentSchema.safeParse(duplicatePage).success).toBe(false);
    expect(duplicatePage.route.path).toBe("/pagina-copiada");
    expect(duplicatePage.seo.indexable).toBe(false);
    expect(duplicatePage.governanceState).toBe("awaiting_owner");
    expect(duplicatePage.provenance.at(-1)?.rightsConfirmed).toBe(false);
    expect(duplicatePage.approval).toEqual({ businessOwner: "", editorialReviewer: "" });
    expect(duplicatePage.blocks.map((block) => block.id)).not.toEqual(
      originalPage.blocks.map((block) => block.id),
    );
    expect(() =>
      duplicateManagedPagePayload(
        {
          ...originalPage,
          blocks: [createPageBlock("split_content", references)],
          visual: {
            schemaVersion: 1,
            branchId: crypto.randomUUID(),
            documentHash: "a".repeat(64),
            registryVersion: 1,
            themeKey: "gaiatec-default",
            mode: "guided",
            grid: { desktop: 12, tablet: 8, mobile: 4 },
          },
        },
        "pagina-visual-copiada",
      ),
    ).toThrow("Páginas vinculadas ao Estúdio Visual não podem ser duplicadas pelo builder v1");
  });

  it("requires an exact active form definition and version binding", () => {
    const block = createPageBlock("form", references);

    expect(publishedFormForBlock(block, [publishedForm])).toEqual(publishedForm);
    expect(governedFormBindingIssue([block], [publishedForm])).toBeNull();
    expect(governedFormBindingIssue([block], [{ ...publishedForm, versionId: id(905) }])).toContain(
      "não está vinculado à versão publicada atual",
    );
    expect(governedFormBindingIssue([createPageBlock("form")], [publishedForm])).toContain(
      "não está vinculado à versão publicada atual",
    );
    expect(governedFormBindingIssue([block], [])).toContain("Nenhum formulário publicado está disponível");
    expect(governedFormBindingIssue([createPageBlock("rich_text")], [])).toBeNull();
  });

  it("starts global documents incomplete until identity, SEO and rights are explicitly governed", () => {
    const navigation = createSiteDocument("navigation");
    expect(CmsNavigationContentSchema.safeParse(navigation).success).toBe(false);
    expect(navigation.title).toBe("");
    expect(navigation.provenance[0]?.rightsConfirmed).toBe(false);
    expect(
      CmsNavigationContentSchema.safeParse({
        ...navigation,
        title: "Navegação global",
        seo: { ...seo, canonicalPath: "/_site/navigation" },
        provenance,
      }).success,
    ).toBe(true);

    const settings = createSiteDocument("site_settings");
    if (settings.contentType !== "site_settings") throw new Error("Fixture de configurações inválida.");
    expect(CmsSiteSettingsContentSchema.safeParse(settings).success).toBe(false);
    expect(
      CmsSiteSettingsContentSchema.safeParse({
        ...settings,
        title: "Configurações globais",
        seo: { ...seo, canonicalPath: "/_site/settings" },
        provenance,
        company: {
          name: "GAIATEC SISTEMAS",
          phone: "",
          whatsapp: "",
          email: "contato@example.test",
          address: "",
        },
        defaultCta: { label: "Contato", href: "/contato" },
      }).success,
    ).toBe(true);

    const placement = createSiteDocument("placement");
    expect(CmsPlacementContentSchema.safeParse(placement).success).toBe(false);
    expect(
      CmsPlacementContentSchema.safeParse({
        ...placement,
        title: "Destaques globais",
        seo: { ...seo, canonicalPath: "/_site/placements" },
        provenance,
      }).success,
    ).toBe(true);
  });

  it("accepts a complete non-indexable managed page", () => {
    expect(CmsManagedPageContentSchema.parse(page)).toEqual(page);
  });

  it("reserves the root route for the homepage and requires approval when homologated", () => {
    expect(
      CmsManagedPageContentSchema.safeParse({
        ...page,
        route: { ...page.route, path: "/" },
        seo: { ...page.seo, canonicalPath: "/" },
      }).success,
    ).toBe(false);
    expect(
      CmsManagedPageContentSchema.safeParse({
        ...page,
        governanceState: "homologated",
      }).success,
    ).toBe(false);
    expect(
      CmsManagedPageContentSchema.safeParse({
        ...page,
        seo: { ...page.seo, canonicalPath: "/outra-rota" },
      }).success,
    ).toBe(false);
    expect(
      CmsManagedPageContentSchema.safeParse({
        ...page,
        route: { ...page.route, path: "/pagina-de-teste/" },
        seo: { ...page.seo, canonicalPath: "/pagina-de-teste/" },
        retirement: { mode: "redirect", destinationPath: "/pagina-de-teste" },
      }).success,
    ).toBe(false);
  });

  it("rejects executable and malformed editorial links", () => {
    expect(
      CmsManagedPageContentSchema.safeParse({
        ...page,
        blocks: [
          {
            ...page.blocks[0],
            data: {
              ...page.blocks[0].data,
              primaryCta: { label: "Inseguro", href: "javascript:alert(1)" },
            },
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      CmsNavigationContentSchema.safeParse({
        ...navigationBase,
        items: [
          {
            id: id(90),
            parentId: null,
            location: "header",
            label: "Inválido",
            href: "#",
            order: 0,
            newTab: false,
            visible: true,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("accepts three menu levels and rejects cycles or a fourth level", () => {
    const items = [
      {
        id: id(10),
        parentId: null,
        location: "header" as const,
        label: "Raiz",
        href: "/",
        order: 0,
        newTab: false,
        visible: true,
      },
      {
        id: id(11),
        parentId: id(10),
        location: "header" as const,
        label: "Filho",
        href: "/filho",
        order: 0,
        newTab: false,
        visible: true,
      },
      {
        id: id(12),
        parentId: id(11),
        location: "header" as const,
        label: "Neto",
        href: "/neto",
        order: 0,
        newTab: false,
        visible: true,
      },
    ];
    expect(CmsNavigationContentSchema.safeParse({ ...navigationBase, items }).success).toBe(true);
    expect(
      CmsNavigationContentSchema.safeParse({
        ...navigationBase,
        items: items.map((item, index) => (index === 0 ? { ...item, parentId: id(12) } : item)),
      }).success,
    ).toBe(false);
    expect(
      CmsNavigationContentSchema.safeParse({
        ...navigationBase,
        items: [
          ...items,
          {
            id: id(13),
            parentId: id(12),
            location: "header",
            label: "Quarto",
            href: "/quarto",
            order: 0,
            newTab: false,
            visible: true,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("validates settings and placement schedules", () => {
    expect(
      CmsSiteSettingsContentSchema.safeParse({
        ...navigationBase,
        consumerId: "cms.site-settings.v1",
        contentType: "site_settings",
        company: { name: "GAIATEC", phone: "", whatsapp: "", email: "contato@example.test", address: "" },
        socialLinks: [],
        defaultCta: { label: "Contato", href: "/contato" },
      }).success,
    ).toBe(true);
    expect(
      CmsPlacementContentSchema.safeParse({
        ...navigationBase,
        consumerId: "cms.site-placements.v1",
        contentType: "placement",
        placements: [
          {
            id: id(20),
            slot: "catalog_featured",
            targetType: "product",
            targetId: id(21),
            startsAt: "2026-09-02T00:00:00.000Z",
            endsAt: "2026-09-01T00:00:00.000Z",
            priority: 1,
            enabled: true,
          },
        ],
      }).success,
    ).toBe(false);
  });
});
