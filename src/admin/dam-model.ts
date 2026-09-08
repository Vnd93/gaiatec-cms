import { inspectRasterImage, MAX_RASTER_BYTES, type RasterMime } from "../shared/raster-image-metadata";

export type DamFingerprint = { sha256: string; perceptualHash?: string };
export type DamRightsState = "valid" | "expiring" | "expired" | "undated";

export function rightsState(expiresAt: string | null, now = new Date()): DamRightsState {
  if (!expiresAt) return "undated";
  const expiry = Date.parse(expiresAt);
  if (!Number.isFinite(expiry) || expiry <= now.getTime()) return "expired";
  return expiry <= now.getTime() + 30 * 24 * 60 * 60 * 1000 ? "expiring" : "valid";
}

export function hammingDistance(left: string, right: string): number {
  if (!/^[0-9a-f]{16}$/i.test(left) || !/^[0-9a-f]{16}$/i.test(right)) {
    throw new Error("Hashes perceptuais inválidos.");
  }
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    let value = Number.parseInt(left[index]!, 16) ^ Number.parseInt(right[index]!, 16);
    while (value) {
      distance += value & 1;
      value >>>= 1;
    }
  }
  return distance;
}

export function cropFitsImage(crop: { x: number; y: number; width: number; height: number }): boolean {
  const values = [crop.x, crop.y, crop.width, crop.height];
  return (
    values.every(Number.isFinite) &&
    crop.x >= 0 &&
    crop.y >= 0 &&
    crop.width > 0 &&
    crop.height > 0 &&
    crop.x + crop.width <= 1 &&
    crop.y + crop.height <= 1
  );
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function perceptualDHash(file: File): Promise<string | undefined> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return undefined;
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
    resizeWidth: 9,
    resizeHeight: 8,
    resizeQuality: "high",
  });
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 9;
    canvas.height = 8;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return undefined;
    context.drawImage(bitmap, 0, 0, 9, 8);
    const pixels = context.getImageData(0, 0, 9, 8).data;
    let bits = "";
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const leftOffset = (y * 9 + x) * 4;
        const rightOffset = leftOffset + 4;
        const left =
          pixels[leftOffset]! * 0.299 + pixels[leftOffset + 1]! * 0.587 + pixels[leftOffset + 2]! * 0.114;
        const right =
          pixels[rightOffset]! * 0.299 + pixels[rightOffset + 1]! * 0.587 + pixels[rightOffset + 2]! * 0.114;
        bits += left > right ? "1" : "0";
      }
    }
    return Array.from({ length: 16 }, (_, index) =>
      Number.parseInt(bits.slice(index * 4, index * 4 + 4), 2).toString(16),
    ).join("");
  } finally {
    bitmap.close();
  }
}

export async function fingerprintMediaFile(file: File): Promise<DamFingerprint> {
  const allowed = new Set<RasterMime>(["image/png", "image/jpeg", "image/webp", "image/avif"]);
  if (file.size < 1 || file.size > MAX_RASTER_BYTES || !allowed.has(file.type as RasterMime))
    throw new Error("INVALID_RASTER_METADATA");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const metadata = inspectRasterImage(bytes);
  if (metadata.mime !== file.type) throw new Error("DECLARED_IMAGE_TYPE_MISMATCH");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const perceptualHash = await perceptualDHash(file).catch(() => undefined);
  return { sha256: bytesToHex(new Uint8Array(digest)), ...(perceptualHash ? { perceptualHash } : {}) };
}
