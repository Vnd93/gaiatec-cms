import { describe, expect, it } from "vitest";
import { campaignWindowLabel } from "../../src/admin/campaign-window";

describe("campaign window label", () => {
  it("does not render an invalid date when the campaign has no end", () => {
    expect(campaignWindowLabel({ startsAt: "2026-09-01T12:00:00.000Z" })).toMatch(/^A partir de /);
    expect(campaignWindowLabel({ startsAt: "2026-09-01T12:00:00.000Z" })).not.toContain("Invalid");
  });

  it("falls back safely for absent or malformed dates", () => {
    expect(campaignWindowLabel()).toBe("—");
    expect(campaignWindowLabel({ startsAt: "data-inválida" })).toBe("—");
  });
});
