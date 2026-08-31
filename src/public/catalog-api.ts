import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase";
import type {
  CmsCampaignContent,
  CmsFormVersion,
  CmsPostContent,
  CmsProductContent,
} from "@/shared/contracts/cms-content";
import { CmsCampaignContentSchema, CmsPostContentSchema } from "@/shared/contracts/cms-content";
import type {
  CmsApplicationContent,
  CmsIndustryContent,
  CmsNavigationContent,
  CmsPageContent,
  CmsPlacementContent,
  CmsServiceContent,
  CmsSiteSettingsContent,
  CmsSolutionContent,
} from "@/shared/contracts/cms-content";
import type { CmsRelatedItem } from "./components/CmsPageRenderer";

type CmsProductModel = CmsProductContent["models"][number];
export type CmsPublicProductContent = Omit<
  CmsProductContent,
  | "fieldVisibility"
  | "brand"
  | "manufacturer"
  | "productLine"
  | "classification"
  | "function"
  | "technology"
  | "models"
  | "relations"
  | "controlledClassification"
> & {
  brand?: CmsProductContent["brand"];
  manufacturer?: CmsProductContent["manufacturer"];
  productLine?: CmsProductContent["productLine"];
  classification?: CmsProductContent["classification"];
  function?: string;
  technology?: string;
  models: Array<
    Omit<CmsProductModel, "model" | "manufacturerReference" | "sku"> &
      Partial<Pick<CmsProductModel, "model" | "manufacturerReference" | "sku">>
  >;
  relations?: CmsProductContent["relations"];
  controlledClassification?: Partial<
    Record<
      | "productCategory"
      | "applicationMagnitude"
      | "technology"
      | "installationOperation"
      | "monitoredElement",
      { slug: string; label: string }
    >
  >;
};

export type PublishedProduct = {
  item_id: string;
  revision_id: string;
  slug: string;
  payload: CmsPublicProductContent;
  seo: CmsProductContent["seo"];
  content_version: number;
  etag: string;
  published_at: string;
  media_urls?: Record<string, string>;
  media_alt?: Record<string, string>;
  document_urls?: Record<string, string>;
};
export type ProductCollection = {
  items: PublishedProduct[];
  total: number;
  facets: Record<
    "productCategory" | "applicationMagnitude" | "technology" | "installationOperation" | "monitoredElement",
    string[]
  >;
  query: string;
};
export type DiscoveryType = "service" | "industry" | "application" | "solution";
export type SearchPageType = "page" | "homepage";
export type PublishedDiscovery = Omit<PublishedProduct, "payload"> & {
  content_type: DiscoveryType;
  path: string;
  payload: CmsServiceContent | CmsIndustryContent | CmsApplicationContent | CmsSolutionContent;
  matched_by?: string;
  score?: number;
};
export type UnifiedSearchResult = {
  items: Array<
    | (PublishedProduct & { content_type: "product"; path: string; matched_by?: string; score?: number })
    | PublishedDiscovery
    | (PublishedPage & { content_type: SearchPageType; matched_by?: string; score?: number })
    | (PublishedPost & { content_type: "post"; matched_by?: string; score?: number })
  >;
  total: number;
  facets: ProductCollection["facets"];
  groups: Record<"product" | DiscoveryType | SearchPageType | "post", number>;
  query: string;
};

export type PublishedPage = Omit<PublishedProduct, "payload"> & {
  content_type: "page" | "homepage";
  path: string;
  payload: CmsPageContent;
  related_items?: CmsRelatedItem[];
};
export type PublishedPageResolution =
  | { kind: "page"; page: PublishedPage }
  | { kind: "route"; rule: { destination_path: string | null; status_code: 301 | 302 | 404 | 410 } }
  | { kind: "fallback" };

export type PublishedPost = Omit<PublishedProduct, "payload"> & {
  content_type: "post";
  path: string;
  payload: CmsPostContent;
  related_items?: CmsRelatedItem[];
};
export type PublishedCampaign = Omit<PublishedProduct, "payload"> & {
  content_type: "campaign";
  path: string;
  payload: CmsCampaignContent;
  form?: CmsFormVersion;
  related_items?: CmsRelatedItem[];
};

export type PublishedSiteShell = {
  navigation: CmsNavigationContent | null;
  settings: CmsSiteSettingsContent | null;
  placements:
    | (Omit<CmsPlacementContent, "placements"> & {
        placements: Array<
          CmsPlacementContent["placements"][number] & {
            target: {
              itemId: string;
              contentType: string;
              title: string;
              summary?: string;
              path: string;
            };
          }
        >;
      })
    | null;
};

async function catalogFetch<T>(params: URLSearchParams): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/cms-public?${params}`, {
    headers: { apikey: SUPABASE_ANON_KEY },
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Catálogo temporariamente indisponível.");
  return data;
}
export function getPublishedProduct(slug: string) {
  return catalogFetch<PublishedProduct>(new URLSearchParams({ type: "detail", slug }));
}
export function getPublishedProducts(params: Record<string, string>) {
  return catalogFetch<ProductCollection>(
    new URLSearchParams({ type: "products", contentType: "product", ...params }),
  );
}
export function searchPublishedProducts(query: string) {
  return catalogFetch<UnifiedSearchResult>(new URLSearchParams({ type: "search", q: query }));
}
export function comparePublishedProducts(slugs: string[]) {
  return catalogFetch<ProductCollection>(
    new URLSearchParams({ type: "products", contentType: "product", ids: slugs.join(",") }),
  );
}
export function getPublishedDiscovery(contentType: DiscoveryType, slug: string) {
  return catalogFetch<PublishedDiscovery>(new URLSearchParams({ type: "entity-detail", contentType, slug }));
}
export function getPublishedDiscoveryCollection(contentType: DiscoveryType, query = "") {
  return catalogFetch<UnifiedSearchResult>(
    new URLSearchParams({ type: "collection", contentType, ...(query ? { q: query } : {}) }),
  );
}
export function autocompletePublished(query: string) {
  return catalogFetch<UnifiedSearchResult>(new URLSearchParams({ type: "autocomplete", q: query }));
}

export function getPublishedPageByPath(path: string) {
  return catalogFetch<PublishedPageResolution>(new URLSearchParams({ type: "page-by-path", path }));
}

export function getPublicRouteRule(path: string) {
  return catalogFetch<{ destination_path: string | null; status_code: 301 | 302 | 404 | 410 }>(
    new URLSearchParams({ type: "redirect", path }),
  );
}

export function getPublishedSiteShell() {
  return catalogFetch<PublishedSiteShell>(new URLSearchParams({ type: "site-shell" }));
}

export async function getPublishedPosts() {
  const result = await catalogFetch<{ items?: unknown[]; total?: number }>(
    new URLSearchParams({ type: "posts" }),
  );
  if (!Array.isArray(result.items)) throw new Error("Resposta do blog inválida.");
  const items = result.items.filter((item): item is PublishedPost => {
    if (!item || typeof item !== "object") return false;
    const candidate = item as Partial<PublishedPost>;
    return candidate.content_type === "post" && CmsPostContentSchema.safeParse(candidate.payload).success;
  });
  return { items, total: items.length };
}

export async function getPublishedPost(slug: string) {
  const result = await catalogFetch<PublishedPost>(new URLSearchParams({ type: "post-detail", slug }));
  if (result.content_type !== "post" || !CmsPostContentSchema.safeParse(result.payload).success)
    throw new Error("Artigo incompatível com o contrato editorial vigente.");
  return result;
}

export async function getPublishedCampaign(path: string) {
  const result = await catalogFetch<PublishedCampaign | PublishedPageResolution>(
    new URLSearchParams({ type: "campaign-by-path", path }),
  );
  if ("kind" in result) return result;
  if (result.content_type !== "campaign" || !CmsCampaignContentSchema.safeParse(result.payload).success)
    throw new Error("Campanha incompatível com o contrato vigente.");
  return result;
}

export async function getPublishedForm(key: string): Promise<CmsFormVersion | null> {
  const params = new URLSearchParams({ type: "form", key });
  const response = await fetch(`${SUPABASE_URL}/functions/v1/cms-public?${params}`, {
    headers: { apikey: SUPABASE_ANON_KEY },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 204) return null;
  const data = (await response.json().catch(() => ({}))) as CmsFormVersion & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Formulário temporariamente indisponível.");
  return data;
}

export function getCampaignPlacements(path: string) {
  return catalogFetch<{
    items: Array<{
      id: string;
      slot: string;
      priority: number;
      startsAt: string;
      endsAt: string;
      campaign: { itemId: string; title: string; summary: string; path: string };
    }>;
  }>(new URLSearchParams({ type: "campaign-placements", contextPath: path }));
}
