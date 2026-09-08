import { describe, expect, it } from "vitest";
import { operationalDateFromInstant, rightsExpiryAtOperationalDayEnd } from "../../src/admin/rights-expiry";

describe("media rights expiry", () => {
  it("preserves the complete selected day in the operational timezone", () => {
    expect(rightsExpiryAtOperationalDayEnd("2026-09-08")).toBe("2026-09-09T02:59:59.999Z");
  });

  it("resolves daylight-saving boundaries without a fixed UTC offset", () => {
    expect(rightsExpiryAtOperationalDayEnd("2024-03-10", "America/New_York")).toBe(
      "2024-03-11T03:59:59.999Z",
    );
    expect(rightsExpiryAtOperationalDayEnd("2024-11-03", "America/New_York")).toBe(
      "2024-11-04T04:59:59.999Z",
    );
  });

  it("rejects an invalid calendar date and keeps an empty optional value null", () => {
    expect(rightsExpiryAtOperationalDayEnd("")).toBeNull();
    expect(() => rightsExpiryAtOperationalDayEnd("2026-02-30")).toThrow(
      "A data não possui um fim de dia válido no fuso operacional.",
    );
  });

  it("restores the operator's calendar date instead of slicing the UTC timestamp", () => {
    expect(operationalDateFromInstant("2026-09-09T02:59:59.999Z")).toBe("2026-09-08");
    expect(operationalDateFromInstant("2024-03-11T03:59:59.999Z", "America/New_York")).toBe("2024-03-10");
    expect(operationalDateFromInstant(null)).toBe("");
    expect(() => operationalDateFromInstant("not-a-date")).toThrow("Data de vigência inválida.");
  });
});
