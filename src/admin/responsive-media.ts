import {
  mediaVariantSlots,
  validateMediaUploadPackage,
  validateOriginalMediaFile,
  type MediaUploadSlot,
} from "./media-upload-model";
import {
  containedRasterDimensions,
  inspectRasterImage,
  type RasterImageMetadata,
} from "../shared/raster-image-metadata";

export type ResponsiveMediaFiles = Record<MediaUploadSlot, File>;

export type ResponsiveMediaProgress = {
  completed: number;
  total: number;
  message: string;
};

type VariantKey = "thumbnail" | "medium" | "large";

type ResponsiveVariantSpec = {
  key: VariantKey;
  width: number;
};

type ResponsiveMediaGenerator = (
  original: File,
  onProgress?: (progress: ResponsiveMediaProgress) => void,
  signal?: AbortSignal,
) => Promise<Partial<Record<MediaUploadSlot, File>>>;

const responsiveVariantSpecs: readonly ResponsiveVariantSpec[] = [
  { key: "thumbnail", width: 480 },
  { key: "medium", width: 960 },
  { key: "large", width: 1600 },
];

function canvasToBlob(canvas: HTMLCanvasElement, type: "image/webp", quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob || blob.type !== type) {
          reject(new Error("WEBP_ENCODING_UNAVAILABLE"));
          return;
        }
        resolve(blob);
      },
      type,
      quality,
    );
  });
}

function aborted(): Error {
  return new DOMException("Preparação de mídia cancelada.", "AbortError");
}

function ensureActive(signal?: AbortSignal) {
  if (signal?.aborted) throw aborted();
}

type AvifWorkerResponse =
  { type: "result"; requestId: string; result: ArrayBuffer } | { type: "error"; requestId: string };

class DedicatedAvifEncoder {
  private readonly worker: Worker;
  private readonly signal?: AbortSignal;
  private closed = false;
  private pendingReject: ((error: Error) => void) | null = null;

  constructor(signal?: AbortSignal) {
    ensureActive(signal);
    this.signal = signal;
    this.worker = new Worker(new URL("./avif-encoder.worker.ts", import.meta.url), {
      type: "module",
      name: "cms-avif-encoder",
    });
    this.signal?.addEventListener("abort", this.abort, { once: true });
  }

  private readonly abort = () => {
    if (this.closed) return;
    this.closed = true;
    this.worker.terminate();
    this.pendingReject?.(aborted());
    this.pendingReject = null;
  };

  async encode(imageData: ImageData): Promise<ArrayBuffer> {
    ensureActive(this.signal);
    if (this.closed || this.pendingReject) throw aborted();
    const requestId = crypto.randomUUID();
    const pixels = imageData.data.buffer.slice(
      imageData.data.byteOffset,
      imageData.data.byteOffset + imageData.data.byteLength,
    );
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const cleanup = () => {
        this.worker.removeEventListener("message", onMessage);
        this.worker.removeEventListener("error", onError);
        this.pendingReject = null;
      };
      const onMessage = (event: MessageEvent<unknown>) => {
        const response = event.data as Partial<AvifWorkerResponse>;
        if (response.requestId !== requestId) return;
        cleanup();
        if (response.type === "result" && response.result instanceof ArrayBuffer) {
          resolve(response.result);
          return;
        }
        reject(new Error("AVIF_ENCODING_UNAVAILABLE"));
      };
      const onError = () => {
        cleanup();
        reject(new Error("AVIF_ENCODING_UNAVAILABLE"));
      };
      this.pendingReject = (error) => {
        cleanup();
        reject(error);
      };
      this.worker.addEventListener("message", onMessage);
      this.worker.addEventListener("error", onError);
      this.worker.postMessage(
        {
          type: "encode",
          requestId,
          width: imageData.width,
          height: imageData.height,
          pixels,
        },
        [pixels],
      );
    });
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.signal?.removeEventListener("abort", this.abort);
    this.worker.terminate();
  }
}

function drawOrientedBitmap(bitmap: ImageBitmap, metadata: RasterImageMetadata): HTMLCanvasElement {
  const swapsAxes = metadata.orientation >= 5;
  const canvas = document.createElement("canvas");
  canvas.width = swapsAxes ? bitmap.height : bitmap.width;
  canvas.height = swapsAxes ? bitmap.width : bitmap.height;
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) throw new Error("CANVAS_CONTEXT_UNAVAILABLE");
  switch (metadata.orientation) {
    case 2:
      context.setTransform(-1, 0, 0, 1, canvas.width, 0);
      break;
    case 3:
      context.setTransform(-1, 0, 0, -1, canvas.width, canvas.height);
      break;
    case 4:
      context.setTransform(1, 0, 0, -1, 0, canvas.height);
      break;
    case 5:
      context.setTransform(0, 1, 1, 0, 0, 0);
      break;
    case 6:
      context.setTransform(0, 1, -1, 0, canvas.width, 0);
      break;
    case 7:
      context.setTransform(0, -1, -1, 0, canvas.width, canvas.height);
      break;
    case 8:
      context.setTransform(0, -1, 1, 0, 0, canvas.height);
      break;
    default:
      break;
  }
  context.drawImage(bitmap, 0, 0);
  return canvas;
}

export type SafeRasterPreview = {
  blob: Blob;
  width: number;
  height: number;
  metadata: RasterImageMetadata;
};

/**
 * Produces a bounded, inert preview only after the same fail-closed metadata
 * inspection used by the upload pipeline. Callers may create an object URL
 * from the returned blob; the untrusted original must never be assigned to an
 * <img> element directly.
 */
export async function createSafeRasterPreview(
  original: File,
  options: { maximumEdge?: number; signal?: AbortSignal } = {},
): Promise<SafeRasterPreview> {
  ensureActive(options.signal);
  const originalIssues = validateOriginalMediaFile(original);
  if (originalIssues.length) throw new Error(originalIssues[0]);
  const bytes = new Uint8Array(await original.arrayBuffer());
  ensureActive(options.signal);
  const metadata = inspectRasterImage(bytes);
  if (metadata.mime !== original.type) throw new Error("DECLARED_IMAGE_TYPE_MISMATCH");
  const maximumEdge = Math.min(480, Math.max(1, Math.round(options.maximumEdge ?? 480)));
  const decodeDimensions = containedRasterDimensions(
    metadata.encodedWidth,
    metadata.encodedHeight,
    maximumEdge,
  );
  const bitmap = await createImageBitmap(original, {
    imageOrientation: "none",
    resizeWidth: decodeDimensions.width,
    resizeHeight: decodeDimensions.height,
    resizeQuality: "high",
  });
  let canvas: HTMLCanvasElement | null = null;
  try {
    ensureActive(options.signal);
    if (bitmap.width !== decodeDimensions.width || bitmap.height !== decodeDimensions.height)
      throw new Error("IMAGE_DECODER_RESIZE_MISMATCH");
    canvas = drawOrientedBitmap(bitmap, metadata);
    const expected = containedRasterDimensions(metadata.width, metadata.height, maximumEdge);
    if (canvas.width !== expected.width || canvas.height !== expected.height)
      throw new Error("IMAGE_ORIENTATION_MISMATCH");
    const blob = await canvasToBlob(canvas, "image/webp", 0.8);
    ensureActive(options.signal);
    return { blob, width: expected.width, height: expected.height, metadata };
  } finally {
    bitmap.close();
    if (canvas) {
      canvas.width = 1;
      canvas.height = 1;
    }
  }
}

export function responsiveVariantDimensions(
  originalWidth: number,
  originalHeight: number,
  maximumWidth: number,
): { width: number; height: number } {
  try {
    return containedRasterDimensions(originalWidth, originalHeight, maximumWidth);
  } catch {
    throw new Error("INVALID_IMAGE_DIMENSIONS");
  }
}

async function generateBrowserResponsiveVariants(
  original: File,
  onProgress?: (progress: ResponsiveMediaProgress) => void,
  signal?: AbortSignal,
): Promise<Partial<Record<MediaUploadSlot, File>>> {
  ensureActive(signal);
  const bytes = new Uint8Array(await original.arrayBuffer());
  ensureActive(signal);
  const metadata = inspectRasterImage(bytes);
  if (metadata.mime !== original.type) throw new Error("DECLARED_IMAGE_TYPE_MISMATCH");
  const decodeDimensions = containedRasterDimensions(metadata.encodedWidth, metadata.encodedHeight, 1_600);
  const bitmap = await createImageBitmap(original, {
    imageOrientation: "none",
    resizeWidth: decodeDimensions.width,
    resizeHeight: decodeDimensions.height,
    resizeQuality: "high",
  });
  const generated: Partial<Record<MediaUploadSlot, File>> = {};
  let completed = 0;
  let sourceCanvas: HTMLCanvasElement | null = null;
  let avifEncoder: DedicatedAvifEncoder | null = null;
  try {
    ensureActive(signal);
    if (bitmap.width !== decodeDimensions.width || bitmap.height !== decodeDimensions.height)
      throw new Error("IMAGE_DECODER_RESIZE_MISMATCH");
    sourceCanvas = drawOrientedBitmap(bitmap, metadata);
    const expectedSourceDimensions = containedRasterDimensions(metadata.width, metadata.height, 1_600);
    if (
      sourceCanvas.width !== expectedSourceDimensions.width ||
      sourceCanvas.height !== expectedSourceDimensions.height
    )
      throw new Error("IMAGE_ORIENTATION_MISMATCH");
    avifEncoder = new DedicatedAvifEncoder(signal);
    for (const spec of responsiveVariantSpecs) {
      ensureActive(signal);
      const dimensions = responsiveVariantDimensions(metadata.width, metadata.height, spec.width);
      const canvas = document.createElement("canvas");
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      const context = canvas.getContext("2d", { alpha: true, willReadFrequently: true });
      if (!context) throw new Error("CANVAS_CONTEXT_UNAVAILABLE");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(sourceCanvas, 0, 0, dimensions.width, dimensions.height);

      const webpBlob = await canvasToBlob(canvas, "image/webp", 0.82);
      ensureActive(signal);
      generated[`${spec.key}.webp`] = new File([webpBlob], `${spec.key}.webp`, {
        type: "image/webp",
      });
      completed += 1;
      onProgress?.({
        completed,
        total: mediaVariantSlots.length,
        message: `Preparando imagem ${completed} de ${mediaVariantSlots.length}`,
      });

      const imageData = context.getImageData(0, 0, dimensions.width, dimensions.height);
      const avifBuffer = await avifEncoder.encode(imageData);
      ensureActive(signal);
      const avifBlob = new Blob([avifBuffer], { type: "image/avif" });
      generated[`${spec.key}.avif`] = new File([avifBlob], `${spec.key}.avif`, {
        type: "image/avif",
      });
      completed += 1;
      onProgress?.({
        completed,
        total: mediaVariantSlots.length,
        message: `Preparando imagem ${completed} de ${mediaVariantSlots.length}`,
      });
    }
  } finally {
    avifEncoder?.close();
    bitmap.close();
    if (sourceCanvas) {
      sourceCanvas.width = 1;
      sourceCanvas.height = 1;
    }
  }
  return generated;
}

export async function createResponsiveMediaPackage(
  original: File,
  options: {
    onProgress?: (progress: ResponsiveMediaProgress) => void;
    generator?: ResponsiveMediaGenerator;
    signal?: AbortSignal;
  } = {},
): Promise<ResponsiveMediaFiles> {
  const originalIssues = validateOriginalMediaFile(original);
  if (originalIssues.length) throw new Error(originalIssues[0]);

  try {
    ensureActive(options.signal);
    const variants = await (options.generator ?? generateBrowserResponsiveVariants)(
      original,
      options.onProgress,
      options.signal,
    );
    ensureActive(options.signal);
    const files = { original, ...variants };
    const issues = validateMediaUploadPackage(files);
    if (issues.length) throw new Error("INCOMPLETE_GENERATED_PACKAGE");
    return files as ResponsiveMediaFiles;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      (error as { name?: unknown }).name === "AbortError"
    )
      throw error;
    throw new Error(
      "Não foi possível preparar as versões responsivas. Selecione uma imagem válida e tente novamente.",
      { cause: error },
    );
  }
}
