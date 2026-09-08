import { describe, expect, it } from "vitest";
import { damCropMatchesAspect, isDamResolvedAssetPublishable } from "../../src/shared/dam-media-policy";

const now = Date.parse("2026-09-08T12:00:00.000Z");
const valid = {
  processing_status: "ready",
  scan_status: "clean",
  rights_confirmed: true,
  rights_expires_at: "2026-10-08T12:00:00.000Z",
  archived_at: null,
};

describe("DAM media policy", () => {
  it("allows only a resolved, clean, rights-valid asset to be matched or reused", () => {
    expect(isDamResolvedAssetPublishable(valid, now)).toBe(true);
    expect(isDamResolvedAssetPublishable({ ...valid, processing_status: "awaiting_upload" }, now)).toBe(
      false,
    );
    expect(isDamResolvedAssetPublishable({ ...valid, processing_status: "failed" }, now)).toBe(false);
    expect(isDamResolvedAssetPublishable({ ...valid, processing_status: "rejected" }, now)).toBe(false);
    expect(isDamResolvedAssetPublishable({ ...valid, scan_status: "failed" }, now)).toBe(false);
    expect(isDamResolvedAssetPublishable({ ...valid, scan_status: "rejected" }, now)).toBe(false);
    expect(
      isDamResolvedAssetPublishable({ ...valid, rights_expires_at: "2026-09-08T11:59:59.000Z" }, now),
    ).toBe(false);
    expect(isDamResolvedAssetPublishable({ ...valid, archived_at: "2026-09-01T00:00:00Z" }, now)).toBe(false);
  });

  it("validates crop aspect in visual pixels with a bounded tolerance", () => {
    expect(
      damCropMatchesAspect({ width: 1, height: 1, aspectWidth: 16, aspectHeight: 9 }, 1_920, 1_080),
    ).toBe(true);
    expect(damCropMatchesAspect({ width: 1, height: 1, aspectWidth: 16, aspectHeight: 9 }, 1_200, 800)).toBe(
      false,
    );
    expect(
      damCropMatchesAspect({ width: 0.667, height: 1, aspectWidth: 1, aspectHeight: 1 }, 1_200, 800),
    ).toBe(true);
  });
});
