import { describe, expect, it } from "vitest";

import { classifyRdoAuthBan } from "../../supabase/functions/_shared/rdo-auth-ban";

const now = Date.parse("2026-09-07T12:00:00.000Z");
const suspendedAt = "2026-09-01T12:00:00.000Z";
const legacyBannedUntil = new Date(Date.parse(suspendedAt) + 876_000 * 60 * 60 * 1_000).toISOString();

describe("classifyRdoAuthBan", () => {
  it("recognizes only the exact historical RDO ban signature", () => {
    expect(
      classifyRdoAuthBan({
        bannedUntil: legacyBannedUntil,
        rdoActive: false,
        rdoSuspendedAt: suspendedAt,
        rdoSuspendedBy: "59000000-0000-4000-8000-000000000001",
        cmsProfileStatus: null,
        now,
      }),
    ).toBe("legacy_rdo");
  });

  it("does not clear an active CMS suspension even with a legacy duration", () => {
    expect(
      classifyRdoAuthBan({
        bannedUntil: legacyBannedUntil,
        rdoActive: false,
        rdoSuspendedAt: suspendedAt,
        rdoSuspendedBy: "59000000-0000-4000-8000-000000000001",
        cmsProfileStatus: "suspended",
        now,
      }),
    ).toBe("global_restriction");
  });

  it.each([
    { rdoSuspendedAt: null, rdoSuspendedBy: null },
    { rdoSuspendedAt: suspendedAt, rdoSuspendedBy: null },
    {
      rdoSuspendedAt: suspendedAt,
      rdoSuspendedBy: "59000000-0000-4000-8000-000000000001",
      bannedUntil: new Date(Date.parse(suspendedAt) + 720 * 60 * 60 * 1_000).toISOString(),
    },
  ])("keeps unrelated or unproven Auth bans global (%o)", (override) => {
    const base = {
      bannedUntil: legacyBannedUntil,
      rdoActive: false,
      rdoSuspendedAt: suspendedAt,
      rdoSuspendedBy: "59000000-0000-4000-8000-000000000001",
      cmsProfileStatus: "active",
      now,
    };
    expect(
      classifyRdoAuthBan({
        ...base,
        ...override,
      }),
    ).toBe("global_restriction");
  });

  it("does not clear a ban when the RDO identity is already active", () => {
    expect(
      classifyRdoAuthBan({
        bannedUntil: legacyBannedUntil,
        rdoActive: true,
        rdoSuspendedAt: suspendedAt,
        rdoSuspendedBy: "59000000-0000-4000-8000-000000000001",
        cmsProfileStatus: "active",
        now,
      }),
    ).toBe("global_restriction");
  });

  it("ignores absent or expired bans", () => {
    for (const bannedUntil of [null, "2026-09-01T12:00:00.000Z"]) {
      expect(
        classifyRdoAuthBan({
          bannedUntil,
          rdoActive: false,
          rdoSuspendedAt: suspendedAt,
          rdoSuspendedBy: "59000000-0000-4000-8000-000000000001",
          cmsProfileStatus: "active",
          now,
        }),
      ).toBe("none");
    }
  });
});
