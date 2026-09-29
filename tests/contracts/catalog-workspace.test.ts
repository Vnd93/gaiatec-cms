import { describe, expect, it } from "vitest";
import {
  CatalogWorkspaceCommandSchema,
  CatalogWorkspaceSchema,
  catalogProductDiff,
} from "@/shared/contracts/catalog-workspace";
import { CatalogEditorialCommandSchema } from "@/shared/contracts/catalog-editorial-workspace";
import {
  CatalogEffectiveRelationSchema,
  selectEffectiveCatalogRelations,
  CatalogPublicProductSchema,
} from "@/shared/contracts/catalog-release";

const id = "c0110000-0000-4000-8000-000000000020";
const product = {
  id,
  revision: 1,
  slug: "product",
  title: "Product",
  content: { summary: "Summary", description: "Description" },
  catalog_entity_kind: "product" as const,
  catalog_lifecycle_state: "active" as const,
  publication_state: "draft" as const,
  published_revision: null,
  primary_term_id: null,
  complementary_term_ids: [] as string[],
};
const closed = {
  schemaVersion: 1,
  enabled: false,
  source: "default",
  permissions: { edit: false, administer: false },
  products: [],
  terms: [],
  relations: [],
  hierarchy: [],
  effectiveRelations: [],
};
const command = {
  action: "create_product",
  id,
  slug: "product",
  title: "Product",
  content: product.content,
  entityKind: "product",
  primaryTermId: null,
  complementaryTermIds: [],
};
describe("functional catalog contracts", () => {
  it("fails closed for disabled/default/unknown capability responses", () => {
    expect(CatalogWorkspaceSchema.safeParse(closed).success).toBe(true);
    for (const changed of [
      { enabled: true },
      { permissions: { edit: true, administer: true } },
      { products: [product] },
      { source: "new-source" },
    ])
      expect(CatalogWorkspaceSchema.safeParse({ ...closed, ...changed }).success).toBe(false);
  });
  it("requires explicit expectedVersion on edits and rejects commerce/internal fields", () => {
    expect(CatalogWorkspaceCommandSchema.safeParse(command).success).toBe(true);
    expect(CatalogWorkspaceCommandSchema.safeParse({ ...command, action: "update_product" }).success).toBe(
      false,
    );
    expect(
      CatalogWorkspaceCommandSchema.safeParse({ ...command, expectedVersion: 0, action: "update_product" })
        .success,
    ).toBe(false);
    for (const key of ["sku", "price", "stock", "availability", "actorId", "aal"]) {
      expect(CatalogWorkspaceCommandSchema.safeParse({ ...command, [key]: "forbidden" }).success).toBe(false);
      expect(
        CatalogWorkspaceCommandSchema.safeParse({ ...command, content: { ...command.content, [key]: 1 } })
          .success,
      ).toBe(false);
    }
  });
  it("compares principal and complementary classification without losing attempted text", () => {
    const attempt = { ...product, title: "Attempt", complementary_term_ids: [id] };
    const current = { ...product, revision: 2, title: "Current" };
    expect(catalogProductDiff(product, attempt, current)).toEqual([
      { field: "title", base: "Product", attempted: "Attempt", current: "Current" },
      { field: "complementary_term_ids", base: [], attempted: [id], current: [] },
    ]);
  });
  it("requires controlled quantity/unit and rejects self-relations", () => {
    const relation = {
      action: "save_relation",
      id,
      expectedVersion: 0,
      sourceProductId: id,
      targetProductId: "c0110000-0000-4000-8000-000000000021",
      relationKind: "contains",
      quantity: 1,
      unitCode: "un",
      status: "active",
      reason: "Manual relation",
    };
    expect(CatalogWorkspaceCommandSchema.safeParse(relation).success).toBe(true);
    for (const override of [
      { quantity: 0 },
      { unitCode: null },
      { unitCode: "custom" },
      { targetProductId: id },
    ])
      expect(CatalogWorkspaceCommandSchema.safeParse({ ...relation, ...override }).success).toBe(false);
  });
  it("preserves distinct direct relation kinds and cannot hide mandatory dependencies", () => {
    const relation = {
      schemaVersion: 1,
      relationKey: id,
      revision: 1,
      sourceProductId: id,
      targetProductId: "c0110000-0000-4000-8000-000000000023",
      sourceEntityKind: "product",
      targetEntityKind: "product",
      relationKind: "accessory",
      quantity: null,
      unitCode: null,
      status: "active",
      subjectProductId: id,
      relationOriginProductId: id,
      relationOriginLevel: 0,
      isLocalExclusion: false,
    };
    const optional = CatalogEffectiveRelationSchema.parse(relation);
    const required = CatalogEffectiveRelationSchema.parse({
      ...relation,
      relationKind: "required_component",
      quantity: 1,
      unitCode: "un",
    });
    expect(selectEffectiveCatalogRelations([optional, required])).toHaveLength(2);
    const exclusion = CatalogEffectiveRelationSchema.parse({
      ...relation,
      relationKind: "local_exclusion",
      isLocalExclusion: true,
    });
    expect(selectEffectiveCatalogRelations([required, exclusion, optional])).toEqual([exclusion]);
  });
  it("editorial authors cannot submit approval evidence through a content command", () => {
    const publish = {
      action: "publish",
      termId: id,
      expectedVersion: 1,
      reason: "Editorial review",
      indexRequested: true,
    };
    expect(CatalogEditorialCommandSchema.safeParse(publish).success).toBe(true);
    expect(
      CatalogEditorialCommandSchema.safeParse({
        ...publish,
        approval: "approved",
        evidenceId: "CAT-UAT-FAKE",
      }).success,
    ).toBe(false);
  });
  it("snapshot product previews are noindex and contain no internal identifiers", () => {
    const wire = {
      title: "Product",
      slug: "product",
      summary: "Summary",
      description: "Description",
      path: "/catalogo/itens/product",
      indexable: false,
    };
    expect(CatalogPublicProductSchema.safeParse(wire).success).toBe(true);
    for (const override of [
      { indexable: true },
      { productId: id },
      { path: "/produtos/product" },
      { sku: "not-allowed" },
    ])
      expect(CatalogPublicProductSchema.safeParse({ ...wire, ...override }).success).toBe(false);
  });
});
