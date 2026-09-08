import type { PublicNavigationItem } from "./catalog-api";

/**
 * The public shell renders only the navigation actually published by the CMS.
 * Missing or unavailable data stays empty so an operational failure cannot be
 * disguised as governed content.
 */
export function publishedNavigationItems(
  items: PublicNavigationItem[] | null | undefined,
): PublicNavigationItem[] {
  return items ?? [];
}
