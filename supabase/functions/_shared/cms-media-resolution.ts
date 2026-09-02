import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export async function resolveMediaAssets(
  client: SupabaseClient,
  assetIds: string[],
  primaryId: string | undefined,
  ttlSeconds: number,
) {
  const mediaUrls: Record<string, string> = {};
  const mediaAlt: Record<string, string> = {};
  if (!assetIds.length) return { mediaUrls, mediaAlt };

  const uniqueIds = [...new Set(assetIds)];
  const { data: replacements, error: replacementError } = await client
    .from("cms_dam_replacements")
    .select("source_asset_id,target_asset_id")
    .eq("status", "active")
    .in("source_asset_id", uniqueIds);
  if (replacementError) throw replacementError;
  const replacementBySource = new Map(
    (replacements ?? []).map((replacement) => [replacement.source_asset_id, replacement.target_asset_id]),
  );
  const resolvedBySource = new Map(uniqueIds.map((id) => [id, replacementBySource.get(id) ?? id]));
  const resolvedIds = [...new Set(resolvedBySource.values())];
  const now = Date.now();
  const { data: assets, error: assetError } = await client
    .from("cms_media_assets")
    .select("id,alt_text,processing_status,scan_status,rights_confirmed,rights_expires_at,archived_at")
    .in("id", resolvedIds);
  if (assetError) throw assetError;
  const publishable = new Map(
    (assets ?? [])
      .filter(
        (asset) =>
          asset.processing_status === "ready" &&
          asset.scan_status === "clean" &&
          asset.rights_confirmed === true &&
          !asset.archived_at &&
          (!asset.rights_expires_at || Date.parse(asset.rights_expires_at) > now),
      )
      .map((asset) => [asset.id, asset]),
  );
  const eligibleIds = [...publishable.keys()];
  const { data: variants, error: variantError } = eligibleIds.length
    ? await client
        .from("cms_media_variants")
        .select("asset_id,variant_key,format,transform_path")
        .in("asset_id", eligibleIds)
    : { data: [], error: null };
  if (variantError) throw variantError;
  const paths = (variants ?? []).map((variant) => variant.transform_path);
  const { data: signedVariants, error: signingError } = paths.length
    ? await client.storage.from("cms-media-private").createSignedUrls(paths, ttlSeconds)
    : { data: [], error: null };
  if (signingError) throw signingError;
  const signedByPath = new Map((signedVariants ?? []).map((signed) => [signed.path, signed.signedUrl]));

  for (const sourceId of uniqueIds) {
    const resolvedId = resolvedBySource.get(sourceId)!;
    const asset = publishable.get(resolvedId);
    if (asset) mediaAlt[sourceId] = asset.alt_text;
    for (const variant of (variants ?? []).filter((entry) => entry.asset_id === resolvedId)) {
      const signedUrl = signedByPath.get(variant.transform_path);
      if (!signedUrl) continue;
      const key = `${variant.variant_key}.${variant.format}`;
      mediaUrls[`${sourceId}:${key}`] = signedUrl;
      if (sourceId === primaryId) mediaUrls[key] = signedUrl;
    }
  }
  return { mediaUrls, mediaAlt };
}
