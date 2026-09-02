import { describe, expect, it } from "vitest";
import { cropFitsImage, hammingDistance, rightsState } from "../../src/admin/dam-model";

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
});
