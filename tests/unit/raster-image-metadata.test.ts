import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { containedRasterDimensions, inspectRasterImage } from "../../src/shared/raster-image-metadata";

function jpegWithExifOrientation(width: number, height: number, orientation: number): Uint8Array {
  const bytes = [
    0xff,
    0xd8,
    0xff,
    0xe1,
    0x00,
    0x22,
    0x45,
    0x78,
    0x69,
    0x66,
    0x00,
    0x00,
    0x4d,
    0x4d,
    0x00,
    0x2a,
    0x00,
    0x00,
    0x00,
    0x08,
    0x00,
    0x01,
    0x01,
    0x12,
    0x00,
    0x03,
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    orientation,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    (height >>> 8) & 0xff,
    height & 0xff,
    (width >>> 8) & 0xff,
    width & 0xff,
    0x03,
    0x01,
    0x11,
    0x00,
    0x02,
    0x11,
    0x00,
    0x03,
    0x11,
    0x00,
    0xff,
    0xd9,
  ];
  return Uint8Array.from(bytes);
}

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(45);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes.set([8, 6, 0, 0, 0], 24);
  view.setUint32(33, 0);
  bytes.set([0x49, 0x45, 0x4e, 0x44], 37);
  return bytes;
}

function webpLossless(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(26);
  bytes.set([0x52, 0x49, 0x46, 0x46]);
  const view = new DataView(bytes.buffer);
  view.setUint32(4, 18, true);
  bytes.set([0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c], 8);
  view.setUint32(16, 5, true);
  bytes[20] = 0x2f;
  view.setUint32(21, (width - 1) | ((height - 1) << 14), true);
  return bytes;
}

describe("fail-closed raster metadata", () => {
  it("reports visual dimensions after EXIF orientation 6", () => {
    expect(inspectRasterImage(jpegWithExifOrientation(800, 1_200, 6))).toEqual({
      mime: "image/jpeg",
      encodedWidth: 800,
      encodedHeight: 1_200,
      width: 1_200,
      height: 800,
      orientation: 6,
    });
  });

  it("parses PNG, WebP and a production AVIF container", () => {
    expect(inspectRasterImage(png(640, 360))).toMatchObject({
      mime: "image/png",
      width: 640,
      height: 360,
    });
    expect(inspectRasterImage(webpLossless(320, 200))).toMatchObject({
      mime: "image/webp",
      width: 320,
      height: 200,
    });
    const avif = new Uint8Array(readFileSync("public/images/solutions/3.3-480w.avif"));
    expect(inspectRasterImage(avif)).toMatchObject({ mime: "image/avif", orientation: 1 });
  });

  it("rejects malformed metadata and oversized decoded surfaces before decode", () => {
    expect(() => inspectRasterImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xe1]))).toThrow(
      "INVALID_RASTER_METADATA",
    );
    expect(() => inspectRasterImage(png(8_000, 5_000))).toThrow("INVALID_RASTER_METADATA");
  });

  it("fits both axes without enlarging the source", () => {
    expect(containedRasterDimensions(3_000, 4_000, 1_600)).toEqual({ width: 1_200, height: 1_600 });
    expect(containedRasterDimensions(320, 200, 1_600)).toEqual({ width: 320, height: 200 });
  });
});
