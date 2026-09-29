import { z } from "zod";
import {
  CatalogCompositionUnitSchema,
  CatalogEntityKindSchema,
  CatalogRelationKindSchema,
} from "./catalog-release";

const Id = z.uuid();
const Version = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const Slug = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const Reason = z.string().trim().min(3).max(240);
export const CatalogContentSchema = z
  .object({
    summary: z.string().trim().max(600),
    description: z.string().trim().max(20_000),
  })
  .strict();
export const CatalogTermTypeSchema = z.enum(["category", "family", "technology", "industry", "application"]);
export const CatalogWorkspaceProductSchema = z
  .object({
    id: Id,
    revision: Version,
    slug: Slug,
    title: z.string().min(1).max(240),
    content: CatalogContentSchema,
    catalog_entity_kind: CatalogEntityKindSchema,
    catalog_lifecycle_state: z.enum(["active", "archived"]),
    publication_state: z.enum(["draft", "ready", "published"]),
    published_revision: Version.nullable(),
    primary_term_id: Id.nullable(),
    complementary_term_ids: z.array(Id).max(20),
  })
  .strict();
export const CatalogWorkspaceTermSchema = z
  .object({
    id: Id,
    revision: Version,
    slug: Slug,
    title: z.string().min(1).max(160),
    term_type: CatalogTermTypeSchema,
    status: z.enum(["draft", "active", "inactive", "merged"]),
    parent_id: Id.nullable(),
    replacement_id: Id.nullable(),
  })
  .strict();
export const CatalogWorkspaceRelationSchema = z
  .object({
    relation_key: Id,
    revision: Version,
    source_product_id: Id,
    target_product_id: Id,
    relation_kind: CatalogRelationKindSchema,
    quantity: z.number().positive().nullable(),
    unit_code: CatalogCompositionUnitSchema.nullable(),
    status: z.enum(["active", "retracted"]),
  })
  .strict();
export const CatalogWorkspaceHierarchySchema = z
  .object({
    hierarchy_key: Id,
    revision: Version,
    child_product_id: Id,
    parent_product_id: Id,
    hierarchy_kind: z.enum(["variant_model", "model_product"]),
    status: z.enum(["active", "retracted"]),
  })
  .strict();
export const CatalogEffectiveWorkspaceRelationSchema = z
  .object({
    subject_product_id: Id,
    target_product_id: Id,
    relation_kind: CatalogRelationKindSchema,
    quantity: z.number().positive().nullable(),
    unit_code: CatalogCompositionUnitSchema.nullable(),
    relation_origin_product_id: Id,
    relation_origin_level: z.number().int().min(0).max(2),
    is_local_exclusion: z.boolean(),
  })
  .strict();
export const CatalogWorkspaceSchema = z
  .object({
    schemaVersion: z.literal(1),
    enabled: z.boolean(),
    source: z.enum(["default", "override", "kill_switch", "unavailable"]),
    permissions: z.object({ edit: z.boolean(), administer: z.boolean() }).strict(),
    products: z.array(CatalogWorkspaceProductSchema).max(200),
    terms: z.array(CatalogWorkspaceTermSchema).max(200),
    relations: z.array(CatalogWorkspaceRelationSchema).max(500),
    hierarchy: z.array(CatalogWorkspaceHierarchySchema).max(500),
    effectiveRelations: z.array(CatalogEffectiveWorkspaceRelationSchema).max(2000),
  })
  .strict()
  .superRefine((data, context) => {
    if (
      (!data.enabled || data.source !== "override") &&
      (data.enabled ||
        data.products.length ||
        data.terms.length ||
        data.relations.length ||
        data.hierarchy.length ||
        data.effectiveRelations.length ||
        data.permissions.edit ||
        data.permissions.administer)
    ) {
      context.addIssue({
        code: "custom",
        message: "disabled capability cannot expose catalog data or actions",
      });
    }
  });
const ProductFields = {
  slug: Slug,
  title: z.string().trim().min(1).max(240),
  content: CatalogContentSchema,
  entityKind: CatalogEntityKindSchema,
  primaryTermId: Id.nullable(),
  complementaryTermIds: z.array(Id).max(20),
};
const Existing = { id: Id, expectedVersion: Version };
const TermFields = {
  slug: Slug,
  title: z.string().trim().min(1).max(160),
  termType: CatalogTermTypeSchema,
  parentId: Id.nullable(),
};
export const CatalogWorkspaceCommandSchema = z
  .discriminatedUnion("action", [
    z.object({ action: z.literal("create_product"), id: Id, ...ProductFields }).strict(),
    z.object({ action: z.literal("update_product"), ...Existing, ...ProductFields }).strict(),
    z
      .object({ action: z.literal("override_product"), ...Existing, ...ProductFields, reason: Reason })
      .strict(),
    z
      .object({
        action: z.enum(["submit_product", "publish_product", "unpublish_product", "archive_product"]),
        ...Existing,
        reason: Reason,
      })
      .strict(),
    z
      .object({ action: z.literal("restore_product"), ...Existing, sourceRevision: Version, reason: Reason })
      .strict(),
    z.object({ action: z.literal("create_term"), id: Id, ...TermFields }).strict(),
    z.object({ action: z.literal("update_term"), ...Existing, ...TermFields, reason: Reason }).strict(),
    z.object({ action: z.literal("activate_term"), ...Existing, reason: Reason }).strict(),
    z
      .object({
        action: z.enum(["deactivate_term", "merge_term"]),
        ...Existing,
        replacementId: Id.nullable(),
        replacementVersion: Version.nullable(),
        reason: Reason,
      })
      .strict(),
    z
      .object({
        action: z.literal("save_relation"),
        id: Id,
        expectedVersion: z.number().int().nonnegative(),
        sourceProductId: Id,
        targetProductId: Id,
        relationKind: CatalogRelationKindSchema,
        quantity: z.number().positive().nullable(),
        unitCode: CatalogCompositionUnitSchema.nullable(),
        status: z.enum(["active", "retracted"]),
        reason: Reason,
      })
      .strict(),
    z
      .object({
        action: z.literal("save_hierarchy"),
        id: Id,
        expectedVersion: z.number().int().nonnegative(),
        childProductId: Id,
        parentProductId: Id,
        hierarchyKind: z.enum(["variant_model", "model_product"]),
        status: z.enum(["active", "retracted"]),
        reason: Reason,
      })
      .strict(),
  ])
  .superRefine((command, context) => {
    if (command.action === "save_relation") {
      const composition = ["contains", "required_component", "optional_component"].includes(
        command.relationKind,
      );
      if (
        command.sourceProductId === command.targetProductId ||
        (composition
          ? command.quantity === null || command.unitCode === null
          : command.quantity !== null || command.unitCode !== null)
      ) {
        context.addIssue({ code: "custom", message: "invalid relation endpoints or composition" });
      }
    }
    if (command.action === "save_hierarchy" && command.childProductId === command.parentProductId) {
      context.addIssue({ code: "custom", message: "a product cannot inherit itself" });
    }
  });

export type CatalogWorkspace = z.infer<typeof CatalogWorkspaceSchema>;
export type CatalogWorkspaceProduct = z.infer<typeof CatalogWorkspaceProductSchema>;
export type CatalogWorkspaceTerm = z.infer<typeof CatalogWorkspaceTermSchema>;
export type CatalogWorkspaceCommand = z.infer<typeof CatalogWorkspaceCommandSchema>;

export function catalogProductDiff(
  base: CatalogWorkspaceProduct,
  attempted: CatalogWorkspaceProduct,
  current: CatalogWorkspaceProduct,
) {
  const fields = [
    "title",
    "slug",
    "content",
    "catalog_entity_kind",
    "primary_term_id",
    "complementary_term_ids",
  ] as const;
  return fields
    .filter(
      (field) =>
        JSON.stringify(base[field]) !== JSON.stringify(attempted[field]) ||
        JSON.stringify(base[field]) !== JSON.stringify(current[field]),
    )
    .map((field) => ({ field, base: base[field], attempted: attempted[field], current: current[field] }));
}
