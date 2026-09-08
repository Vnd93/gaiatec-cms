import { afterEach, describe, expect, it, vi } from "vitest";
import { cropFitsImage, fingerprintMediaFile, hammingDistance, rightsState } from "../../src/admin/dam-model";

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(45);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes.set([8, 6, 0, 0, 0], 24);
  bytes.set([0x49, 0x45, 0x4e, 0x44], 37);
  return bytes;
}

function blobPart(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("DAM model", () => {
  it("classifies rights deterministically around the 30-day review window", () => {
    const now = new Date("2026-09-02T12:00:00.000Z");
    expect(rightsState(null, now)).toBe("undated");
    expect(rightsState("2026-09-01T12:00:00.000Z", now)).toBe("expired");
    expect(rightsState("2026-09-20T12:00:00.000Z", now)).toBe("expiring");
    expect(rightsState("2026-11-02T12:00:00.000Z", now)).toBe("valid");
  });

  it("measures perceptual hash distance without accepting malformed values", () => {
    expect(hammingDistance("0000000000000000", "0000000000000000")).toBe(0);
    expect(hammingDistance("0000000000000000", "ffffffffffffffff")).toBe(64);
    expect(hammingDistance("0000000000000000", "000000000000000f")).toBe(4);
    expect(() => hammingDistance("invalid", "0000000000000000")).toThrow("Hashes perceptuais inválidos");
  });

  it("rejects crops that escape normalized image bounds", () => {
    expect(cropFitsImage({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 })).toBe(true);
    expect(cropFitsImage({ x: 0.5, y: 0, width: 0.6, height: 1 })).toBe(false);
    expect(cropFitsImage({ x: 0, y: 0, width: 0, height: 1 })).toBe(false);
  });

  it("inspects metadata before requesting a bounded perceptual decode", async () => {
    const createBitmap = vi.fn(async () => ({ close: vi.fn(), width: 9, height: 8 }));
    vi.stubGlobal("createImageBitmap", createBitmap);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(9 * 8 * 4) })),
    } as unknown as CanvasRenderingContext2D);
    await fingerprintMediaFile(new File([blobPart(png(640, 360))], "safe.png", { type: "image/png" }));
    expect(createBitmap).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({
        imageOrientation: "from-image",
        resizeWidth: 9,
        resizeHeight: 8,
        resizeQuality: "high",
      }),
    );
  });

  it("rejects a decompression bomb before createImageBitmap", async () => {
    const createBitmap = vi.fn();
    vi.stubGlobal("createImageBitmap", createBitmap);
    await expect(
      fingerprintMediaFile(new File([blobPart(png(8_000, 5_000))], "bomb.png", { type: "image/png" })),
    ).rejects.toThrow("INVALID_RASTER_METADATA");
    expect(createBitmap).not.toHaveBeenCalled();
  });

  it("rejects an oversized fingerprint before reading bytes", async () => {
    const arrayBuffer = vi.fn();
    const oversized = {
      type: "image/png",
      size: 20 * 1024 * 1024 + 1,
      arrayBuffer,
    } as unknown as File;

    await expect(fingerprintMediaFile(oversized)).rejects.toThrow("INVALID_RASTER_METADATA");
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
});
