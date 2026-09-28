import { describe, expect, it } from "vitest";
import {
  CATALOG_USER_CONFIRMED_PROVISIONAL_ORDERS,
  CatalogNominalProductSchema,
  CatalogProductRelationSchema,
  CatalogEffectiveRelationSchema,
  selectEffectiveCatalogRelations,
  CatalogPublicSnapshotSchema,
  isUserConfirmedProvisionalCatalogOrder,
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

  it("keeps items 17 and 18 explicitly provisional, never approved", () => {
    expect(CATALOG_USER_CONFIRMED_PROVISIONAL_ORDERS).toEqual([17, 18]);
    expect(isUserConfirmedProvisionalCatalogOrder(17)).toBe(true);
    expect(isUserConfirmedProvisionalCatalogOrder(18)).toBe(true);
    expect(isUserConfirmedProvisionalCatalogOrder(16)).toBe(false);
    expect(
      CatalogNominalProductSchema.safeParse({
        schemaVersion: 1,
        candidateId: "b0000000-0000-4000-8000-000000000017",
        name: "Medidor de Nível Ultrassônico Compacto",
        ownerRole: "Comercial GAIATEC Sistemas",
        approverRole: "Comercial GAIATEC Sistemas",
        approval: "user-confirmed-provisional",
        source: "canonical-nominal-list",
        importMode: "none",
        wave: "foundation",
        decisionIds: ["CAT-D001"],
      }).success,
    ).toBe(true);
  });

  it("keeps the public snapshot contract published-only and without commercial fields", () => {
    const base = {
      schemaVersion: 1 as const,
      snapshotId: "b0000000-0000-4000-8000-000000000101",
      productId: "b0000000-0000-4000-8000-000000000102",
      revision: 2,
      slug: "produto-staging",
      title: "Produto de staging",
      content: { summary: "Conteúdo editorial" },
      cta: "Solicitar orçamento" as const,
      publishedAt: "2026-09-28T12:00:00.000Z",
    };
    expect(CatalogPublicSnapshotSchema.safeParse(base).success).toBe(true);
    expect(CatalogPublicSnapshotSchema.safeParse({ ...base, content: { price: 1 } }).success).toBe(false);
    expect(CatalogPublicSnapshotSchema.safeParse({ ...base, cta: "Comprar" }).success).toBe(false);
    expect(CatalogPublicSnapshotSchema.safeParse({ ...base, Offer: {} }).success).toBe(false);
  });

  it("enforces CAT-D006 composition quantities and controlled units", () => {
    const base = {
      schemaVersion: 1 as const,
      relationKey: "b0000000-0000-4000-8000-000000000201",
      revision: 1,
      sourceProductId: "b0000000-0000-4000-8000-000000000202",
      targetProductId: "b0000000-0000-4000-8000-000000000203",
      sourceEntityKind: "kit" as const,
      targetEntityKind: "product" as const,
      relationKind: "required_component" as const,
      quantity: 2,
      unitCode: "un" as const,
      status: "active" as const,
    };
    expect(CatalogProductRelationSchema.safeParse(base).success).toBe(true);
    expect(CatalogProductRelationSchema.safeParse({ ...base, quantity: null }).success).toBe(false);
    expect(CatalogProductRelationSchema.safeParse({ ...base, unitCode: "dozen" }).success).toBe(false);
    expect(
      CatalogProductRelationSchema.safeParse({
        ...base,
        relationKind: "compatible",
        quantity: 1,
        unitCode: "un",
      }).success,
    ).toBe(false);
    expect(CatalogProductRelationSchema.safeParse({ ...base, targetEntityKind: "kit" }).success).toBe(false);
  });

  it("resolves CAT-D006 direct and local-exclusion precedence with origin", () => {
    const common = {
      schemaVersion: 1 as const,
      relationKey: "b0000000-0000-4000-8000-000000000211",
      revision: 1,
      sourceProductId: "b0000000-0000-4000-8000-000000000212",
      targetProductId: "b0000000-0000-4000-8000-000000000213",
      sourceEntityKind: "product" as const,
      targetEntityKind: "product" as const,
      relationKind: "compatible" as const,
      quantity: null,
      unitCode: null,
      status: "active" as const,
      subjectProductId: "b0000000-0000-4000-8000-000000000214",
      relationOriginProductId: "b0000000-0000-4000-8000-000000000215",
      relationOriginLevel: 1,
      isLocalExclusion: false,
    };
    const inherited = CatalogEffectiveRelationSchema.parse(common);
    const direct = CatalogEffectiveRelationSchema.parse({
      ...common,
      relationKey: "b0000000-0000-4000-8000-000000000216",
      relationOriginProductId: common.subjectProductId,
      relationOriginLevel: 0,
      isLocalExclusion: true,
      relationKind: "local_exclusion",
    });
    expect(selectEffectiveCatalogRelations([inherited, direct])).toEqual([direct]);
  });
});
