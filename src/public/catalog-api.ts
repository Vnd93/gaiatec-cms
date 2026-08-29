import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase";
import type { CmsProductContent } from "@/shared/contracts/cms-content";

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
};
export type ProductCollection = {
  items: PublishedProduct[];
  total: number;
  facets: Record<"segment" | "category" | "family" | "technology", string[]>;
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
  return catalogFetch<ProductCollection>(new URLSearchParams({ type: "search", q: query }));
}
export function comparePublishedProducts(slugs: string[]) {
  return catalogFetch<ProductCollection>(new URLSearchParams({ type: "products", ids: slugs.join(",") }));
}
