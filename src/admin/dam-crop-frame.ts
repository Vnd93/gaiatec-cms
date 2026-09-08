export type NormalizedCropFrame = { width: number; height: number };

export function maximumDamCropFrame(
  aspectWidth: number,
  aspectHeight: number,
  imageWidth: number | null,
  imageHeight: number | null,
): NormalizedCropFrame {
  const validImageDimensions =
    imageWidth !== null && imageHeight !== null && imageWidth > 0 && imageHeight > 0;
  const sourceRatio = validImageDimensions ? imageWidth / imageHeight : 1;
  const normalizedRatio = aspectWidth / aspectHeight / sourceRatio;
  return normalizedRatio >= 1
    ? { width: 1, height: 1 / normalizedRatio }
    : { width: normalizedRatio, height: 1 };
}
