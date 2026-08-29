import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase";
import type { CmsProductContent } from "@/shared/contracts/cms-content";
import type {
  CmsApplicationContent,
  CmsIndustryContent,
  CmsServiceContent,
  CmsSolutionContent,
} from "@/shared/contracts/cms-content";

export type PublishedProduct = {
  item_id: string;
  revision_id: string;
  slug: string;
  payload: CmsProductContent;
  seo: CmsProductContent["seo"];
  content_version: number;
  etag: string;
  published_at: string;
  media_urls?: Record<string, string>;
  document_urls?: Record<string, string>;
};
export type ProductCollection = {
  items: PublishedProduct[];
  total: number;
  facets: Record<"segment" | "category" | "family" | "technology", string[]>;
  query: string;
};
export type DiscoveryType = "service" | "industry" | "application" | "solution";
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
  >;
  total: number;
  facets: ProductCollection["facets"];
  groups: Record<"product" | DiscoveryType, number>;
  query: string;
};

async function catalogFetch<T>(params: URLSearchParams): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/cms-public?${params}`, {
    headers: { apikey: SUPABASE_ANON_KEY },
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Catálogo temporariamente indisponível.");
  return data;
}
export function getPublishedProduct(slug: string) {
  return catalogFetch<PublishedProduct>(new URLSearchParams({ type: "detail", slug }));
}
export function getPublishedProducts(params: Record<string, string>) {
  return catalogFetch<ProductCollection>(new URLSearchParams({ type: "products", ...params }));
}
export function searchPublishedProducts(query: string) {
  return catalogFetch<UnifiedSearchResult>(new URLSearchParams({ type: "search", q: query }));
}
export function comparePublishedProducts(slugs: string[]) {
  return catalogFetch<ProductCollection>(new URLSearchParams({ type: "products", ids: slugs.join(",") }));
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
