import { z } from "zod";
import { CatalogEditorialBodyBlockSchema, CatalogEditorialTermKindSchema } from "./catalog-release";

const Content = {
  title: z.string().trim().min(1).max(180),
  summary: z.string().trim().min(1).max(600),
  blocks: z.array(CatalogEditorialBodyBlockSchema).min(1).max(50),
};
export const CatalogEditorialRevisionSchema = z
  .object({
    term_id: z.uuid(),
    revision: z.number().int().positive(),
    status: z.enum(["draft", "published", "unpublished", "redirect"]),
    ...Content,
    term_kind: CatalogEditorialTermKindSchema,
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    index_requested: z.boolean(),
    redirect_term_id: z.uuid().nullable(),
    changed_at: z.string().datetime({ offset: true }),
  })
  .strict();
const Base = {
  termId: z.uuid(),
  expectedVersion: z.number().int().nonnegative(),
  reason: z.string().trim().min(3).max(240),
};
export const CatalogEditorialCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), ...Base, ...Content }).strict(),
  z.object({ action: z.literal("publish"), ...Base, indexRequested: z.boolean() }).strict(),
  z.object({ action: z.literal("unpublish"), ...Base }).strict(),
  z.object({ action: z.literal("redirect"), ...Base, targetTermId: z.uuid() }).strict(),
]);
export type CatalogEditorialRevision = z.infer<typeof CatalogEditorialRevisionSchema>;
export type CatalogEditorialCommand = z.infer<typeof CatalogEditorialCommandSchema>;
