import type {
  CmsNavigationContent,
  CmsPlacementContent,
  CmsSiteSettingsContent,
} from "@/shared/contracts/cms-content";

export type SiteDocumentType = "navigation" | "site_settings" | "placement";
export type SiteDocumentPayload = CmsNavigationContent | CmsSiteSettingsContent | CmsPlacementContent;

const provenance = () => [
  {
    sourceKind: "owner_authored" as const,
    rightsConfirmed: false as true,
    commercialOwner: "",
    technicalOwner: "",
    verifiedAt: "",
  },
];
const base = (path: string) => ({
  schemaVersion: 1 as const,
  title: "",
  blocks: [],
  seo: {
    title: "",
    description: "",
    canonicalPath: path,
    indexable: false,
  },
  provenance: provenance(),
});

export function createSiteDocument(type: SiteDocumentType): SiteDocumentPayload {
  if (type === "navigation")
    return {
      ...base("/_site/navigation"),
      consumerId: "cms.site-navigation.v1",
      contentType: "navigation",
      items: [],
    };
  if (type === "site_settings")
    return {
      ...base("/_site/settings"),
      consumerId: "cms.site-settings.v1",
      contentType: "site_settings",
      company: {
        name: "",
        phone: "",
        whatsapp: "",
        email: "",
        address: "",
      },
      socialLinks: [],
      defaultCta: { label: "", href: "" },
    };
  return {
    ...base("/_site/placements"),
    consumerId: "cms.site-placements.v1",
    contentType: "placement",
    placements: [],
  };
}

export const siteDocumentMeta = {
  navigation: { label: "Menus", slug: "site-navigation", permission: "cms:navigation" },
  site_settings: { label: "Dados globais", slug: "site-settings", permission: "cms:settings" },
  placement: { label: "Destaques", slug: "site-placements", permission: "cms:placements" },
} as const;
