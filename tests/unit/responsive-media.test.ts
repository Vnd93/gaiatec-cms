import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createResponsiveMediaPackage,
  createSafeRasterPreview,
  responsiveVariantDimensions,
} from "../../src/admin/responsive-media";
import { mediaVariantSlots, type MediaUploadSlot } from "../../src/admin/media-upload-model";

function image(name: string, type: string, content = "safe-image") {
  return new File([content], name, { type });
}

function png(width: number, height: number): ArrayBuffer {
  const bytes = new Uint8Array(45);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes.set([8, 6, 0, 0, 0], 24);
  bytes.set([0x49, 0x45, 0x4e, 0x44], 37);
  return bytes.buffer;
}

afterEach(() => vi.unstubAllGlobals());

describe("responsive media generation", () => {
  it("preserves aspect ratio and never enlarges the original", () => {
    expect(responsiveVariantDimensions(2400, 1200, 480)).toEqual({ width: 480, height: 240 });
    expect(responsiveVariantDimensions(1200, 2400, 1600)).toEqual({ width: 800, height: 1600 });
    expect(responsiveVariantDimensions(320, 200, 1600)).toEqual({ width: 320, height: 200 });
    expect(() => responsiveVariantDimensions(20_001, 100, 480)).toThrow("INVALID_IMAGE_DIMENSIONS");
  });

  it("creates the governed package from one operator-selected original", async () => {
    const progress = vi.fn();
    const generator = vi.fn(async (_original: File, report?: (value: never) => void) => {
      const variants: Partial<Record<MediaUploadSlot, File>> = {};
      mediaVariantSlots.forEach((slot, index) => {
        const type = slot.endsWith(".webp") ? "image/webp" : "image/avif";
        variants[slot] = image(slot, type);
        report?.({
          completed: index + 1,
          total: mediaVariantSlots.length,
          message: `Preparando imagem ${index + 1} de ${mediaVariantSlots.length}`,
        } as never);
      });
      return variants;
    });
    const original = image("produto.png", "image/png");

    const files = await createResponsiveMediaPackage(original, { generator, onProgress: progress });

    expect(generator).toHaveBeenCalledOnce();
    expect(files.original).toBe(original);
    expect(Object.keys(files)).toHaveLength(7);
    expect(progress).toHaveBeenCalledTimes(6);
  });

  it("returns a human-safe error when browser encoding is unavailable", async () => {
    const generator = vi.fn(async () => {
      throw new Error("RuntimeError: unreachable at avif_enc.wasm:0x1234");
    });

    await expect(
      createResponsiveMediaPackage(image("produto.png", "image/png"), { generator }),
    ).rejects.toThrow(
      "Não foi possível preparar as versões responsivas. Selecione uma imagem válida e tente novamente.",
    );
  });

  it("propagates cancellation into the generator without masking AbortError", async () => {
    const controller = new AbortController();
    const generator = vi.fn(async (_file: File, _progress: unknown, signal?: AbortSignal) => {
      expect(signal).toBe(controller.signal);
      controller.abort();
      return {};
    });

    await expect(
      createResponsiveMediaPackage(image("produto.png", "image/png"), {
        generator,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects an unsafe preview before any browser decode", async () => {
    const createBitmap = vi.fn();
    vi.stubGlobal("createImageBitmap", createBitmap);

    await expect(
      createSafeRasterPreview(new File([png(8_000, 5_000)], "preview-bomb.png", { type: "image/png" })),
    ).rejects.toThrow("INVALID_RASTER_METADATA");
    expect(createBitmap).not.toHaveBeenCalled();
  });

  it("rejects an oversized preview before reading its bytes", async () => {
    const arrayBuffer = vi.fn();
    const oversized = {
      name: "oversized.png",
      type: "image/png",
      size: 20 * 1024 * 1024 + 1,
      arrayBuffer,
    } as unknown as File;

    await expect(createSafeRasterPreview(oversized)).rejects.toThrow("20 MB");
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
});
