import { describe, expect, it } from "vitest";
import {
  CatalogNominalProductSchema,
  isCatalogFeatureEnabled,
  selectCatalogReleaseProfile,
} from "@/shared/contracts/catalog-release";

describe("catalog release governance", () => {
  it("selects the narrow profile only for unambiguous changes", () => {
    expect(selectCatalogReleaseProfile("frontend")).toBe("frontend-only");
    expect(selectCatalogReleaseProfile("edge")).toBe("edge-only");
    expect(selectCatalogReleaseProfile("database-auth")).toBe("database-auth");
    expect(selectCatalogReleaseProfile("mixed")).toBe("full-release");
    expect(selectCatalogReleaseProfile("unknown")).toBe("full-release");
  });

  it("keeps the catalog closed unless both opt-ins are explicit", () => {
    expect(isCatalogFeatureEnabled({ capabilityEnabled: true, capabilitySource: "override" })).toBe(false);
    expect(
      isCatalogFeatureEnabled({
        buildFlag: "true",
        capabilityEnabled: true,
        capabilitySource: "default",
      }),
    ).toBe(false);
    expect(
      isCatalogFeatureEnabled({
        buildFlag: "true",
        capabilityEnabled: true,
        capabilitySource: "override",
      }),
    ).toBe(true);
  });

  it("rejects legacy/imported or SKU-bearing nominal entries", () => {
    const valid = CatalogNominalProductSchema.safeParse({
      schemaVersion: 1,
      candidateId: "b0000000-0000-4000-8000-000000000001",
      name: "Produto nominal pendente",
      ownerRole: "Comercial GAIATEC Sistemas",
      approverRole: "Comercial GAIATEC Sistemas",
      approval: "pending-approval",
      source: "canonical-nominal-list",
      importMode: "none",
      wave: "foundation",
      decisionIds: ["CAT-D001"],
    });
    expect(valid.success).toBe(true);
    expect(CatalogNominalProductSchema.safeParse({ ...valid.data, sku: "forbidden" }).success).toBe(false);
    expect(CatalogNominalProductSchema.safeParse({ ...valid.data, source: "legacy-import" }).success).toBe(
      false,
    );
  });
});
