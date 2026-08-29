import type {
  CmsNavigationContent,
  CmsPlacementContent,
  CmsSiteSettingsContent,
} from "@/shared/contracts/cms-content";

export type SiteDocumentType = "navigation" | "site_settings" | "placement";
export type SiteDocumentPayload = CmsNavigationContent | CmsSiteSettingsContent | CmsPlacementContent;

const uid = () => crypto.randomUUID();
const provenance = () => [
  {
    sourceKind: "owner_authored" as const,
    authorizationReference: "CONFIGURACAO-MANUAL-CMS",
    authorizationDate: new Date().toISOString().slice(0, 10),
    rightsScope: "Configuração criada no novo CMS",
    rightsConfirmed: true as const,
    commercialOwner: "Administrador GAIATEC",
    technicalOwner: "Administrador GAIATEC",
    verifiedAt: new Date().toISOString(),
  },
];
const base = (title: string, path: string) => ({
  schemaVersion: 1 as const,
  title,
  blocks: [],
  seo: {
    title,
    description: "Documento global e não indexável do novo CMS GAIATEC.",
    canonicalPath: path,
    indexable: false,
  },
  provenance: provenance(),
});

export function createSiteDocument(type: SiteDocumentType): SiteDocumentPayload {
  if (type === "navigation")
    return {
      ...base("Navegação global", "/_site/navigation"),
      consumerId: "cms.site-navigation.v1",
      contentType: "navigation",
      items: [
        {
          id: uid(),
          parentId: null,
          location: "header",
          label: "Produtos",
          href: "/produtos",
          order: 0,
          newTab: false,
          visible: true,
        },
        {
          id: uid(),
          parentId: null,
          location: "header",
          label: "Serviços",
          href: "/servicos",
          order: 1,
          newTab: false,
          visible: true,
        },
        {
          id: uid(),
          parentId: null,
          location: "header",
          label: "Indústrias",
          href: "/industrias",
          order: 2,
          newTab: false,
          visible: true,
        },
        {
          id: uid(),
          parentId: null,
          location: "header",
          label: "Aplicações",
          href: "/aplicacoes",
          order: 3,
          newTab: false,
          visible: true,
        },
        {
          id: uid(),
          parentId: null,
          location: "header",
          label: "Soluções",
          href: "/solucoes",
          order: 4,
          newTab: false,
          visible: true,
        },
        {
          id: uid(),
          parentId: null,
          location: "header",
          label: "Contato",
          href: "/contato",
          order: 5,
          newTab: false,
          visible: true,
        },
      ],
    };
  if (type === "site_settings")
    return {
      ...base("Configurações globais", "/_site/settings"),
      consumerId: "cms.site-settings.v1",
      contentType: "site_settings",
      company: {
        name: "GAIATEC SISTEMAS",
        phone: "",
        whatsapp: "",
        email: "",
        address: "",
      },
      socialLinks: [],
      defaultCta: { label: "Falar com especialista", href: "/contato" },
    };
  const start = new Date();
  const end = new Date(start.getTime() + 30 * 86400000);
  return {
    ...base("Destaques e posicionamentos", "/_site/placements"),
    consumerId: "cms.site-placements.v1",
    contentType: "placement",
    placements: [
      {
        id: uid(),
        slot: "home_featured",
        targetType: "product",
        targetId: uid(),
        label: "Destaque temporário",
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        priority: 0,
        enabled: false,
      },
    ],
  };
}

export const siteDocumentMeta = {
  navigation: { label: "Menus", slug: "site-navigation", permission: "cms:navigation" },
  site_settings: { label: "Dados globais", slug: "site-settings", permission: "cms:settings" },
  placement: { label: "Destaques", slug: "site-placements", permission: "cms:placements" },
} as const;
