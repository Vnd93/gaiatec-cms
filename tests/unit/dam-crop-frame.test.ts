import { describe, expect, it } from "vitest";
import { maximumDamCropFrame } from "../../src/admin/dam-crop-frame";
import { damCropMatchesAspect } from "../../src/shared/dam-media-policy";

describe("DAM crop frame", () => {
  it("uses the whole normalized frame when image and crop have the same physical aspect", () => {
    const frame = maximumDamCropFrame(16, 9, 1920, 1080);
    expect(frame).toEqual({ width: 1, height: 1 });
    expect(damCropMatchesAspect({ ...frame, aspectWidth: 16, aspectHeight: 9 }, 1920, 1080)).toBe(true);
  });

  it("accounts for source dimensions when producing a square physical crop", () => {
    const frame = maximumDamCropFrame(1, 1, 1200, 800);
    expect(frame.width).toBeCloseTo(2 / 3, 10);
    expect(frame.height).toBe(1);
    expect(damCropMatchesAspect({ ...frame, aspectWidth: 1, aspectHeight: 1 }, 1200, 800)).toBe(true);
  });
});
