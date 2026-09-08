export type DamPublishabilityState = {
  processing_status: string;
  scan_status: string;
  rights_confirmed: boolean;
  rights_expires_at: string | null;
  archived_at: string | null;
};

export function isDamResolvedAssetPublishable(asset: DamPublishabilityState, now = Date.now()): boolean {
  const rightsExpiry = asset.rights_expires_at ? Date.parse(asset.rights_expires_at) : null;
  return (
    asset.processing_status === "ready" &&
    asset.scan_status === "clean" &&
    asset.rights_confirmed === true &&
    !asset.archived_at &&
    (rightsExpiry === null || (Number.isFinite(rightsExpiry) && rightsExpiry > now))
  );
}

export function damCropMatchesAspect(
  crop: {
    width: number;
    height: number;
    aspectWidth: number;
    aspectHeight: number;
  },
  imageWidth: number,
  imageHeight: number,
  tolerance = 0.01,
): boolean {
  if (
    ![crop.width, crop.height, crop.aspectWidth, crop.aspectHeight, imageWidth, imageHeight, tolerance].every(
      Number.isFinite,
    ) ||
    crop.width <= 0 ||
    crop.height <= 0 ||
    crop.aspectWidth <= 0 ||
    crop.aspectHeight <= 0 ||
    imageWidth < 1 ||
    imageHeight < 1 ||
    tolerance < 0 ||
    tolerance > 0.1
  )
    return false;
  const left = crop.width * imageWidth * crop.aspectHeight;
  const right = crop.height * imageHeight * crop.aspectWidth;
  return Math.abs(left - right) <= Math.max(Math.abs(left), Math.abs(right)) * tolerance;
}
