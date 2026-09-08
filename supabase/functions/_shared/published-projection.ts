export const PUBLISHED_PROJECTION_COLUMNS =
  "item_id,revision_id,content_type,slug,schema_version,consumer_id,renderer_key,payload,seo,content_version,cache_tag,etag,published_at";

export const PUBLISHED_PROJECTION_PAGE_SIZE = 500;

export async function loadPublishedProjection(client: any, contentTypes: string[]) {
  const rows: any[] = [];

  for (let offset = 0; ; offset += PUBLISHED_PROJECTION_PAGE_SIZE) {
    const { data, error } = await client
      .from("cms_published_projection")
      .select(PUBLISHED_PROJECTION_COLUMNS)
      .in("content_type", contentTypes)
      .order("published_at", { ascending: false })
      .order("item_id", { ascending: true })
      .range(offset, offset + PUBLISHED_PROJECTION_PAGE_SIZE - 1);

    if (error) return { data: null, error };
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PUBLISHED_PROJECTION_PAGE_SIZE) return { data: rows, error: null };
  }
}
