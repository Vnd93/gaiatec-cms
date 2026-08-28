import { z } from "zod";

export const CmsSlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(160);
const RequiredText = z.string().trim().min(1);
const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);

export const CmsProvenanceSchema = z
  .object({
    sourceKind: z.enum(["official_manufacturer", "official_company", "owner_authored"]),
    sourceUrl: z.url().optional(),
    documentVersion: z.string().trim().min(1).max(80).optional(),
    documentDate: z.iso.date().optional(),
    sourceSha256: Sha256.optional(),
    rightsConfirmed: z.literal(true),
    commercialOwner: RequiredText.max(120),
    technicalOwner: RequiredText.max(120),
    verifiedAt: z.iso.datetime(),
  })
  .strict()
  .refine(
    (value) => value.sourceKind === "owner_authored" || Boolean(value.sourceUrl && value.sourceSha256),
    "Fontes externas exigem URL e hash do documento oficial.",
  );

export const CmsSeoSchema = z
  .object({
    title: RequiredText.max(70),
    description: RequiredText.max(170),
    canonicalPath: z.string().startsWith("/").max(200),
    indexable: z.boolean().default(false),
    ogImageId: z.uuid().optional(),
  })
  .strict();

export const CmsBlockSchema = z
  .object({
    id: z.uuid(),
    type: z.enum(["rich_text", "image", "gallery", "cta", "specifications", "related_content"]),
    data: z.record(z.string(), z.unknown()),
  })
  .strict();

const BaseContent = {
  schemaVersion: z.literal(1),
  title: RequiredText.max(180),
  summary: z.string().trim().max(500).optional(),
  blocks: z.array(CmsBlockSchema).max(80),
  seo: CmsSeoSchema,
  provenance: z.array(CmsProvenanceSchema).min(1).max(30),
};

export const CmsProductContentSchema = z
  .object({
    ...BaseContent,
    contentType: z.literal("product"),
    manufacturer: RequiredText.max(120),
    family: RequiredText.max(160),
    model: RequiredText.max(160),
    function: RequiredText.max(300),
    technology: RequiredText.max(160),
    specifications: z
      .array(
        z
          .object({
            key: CmsSlugSchema,
            label: RequiredText.max(120),
            value: z.union([z.string().max(500), z.number().finite(), z.boolean()]),
            unit: z.string().trim().max(40).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(200),
    relatedItemIds: z.array(z.uuid()).max(50).default([]),
  })
  .strict();

export const CmsServiceContentSchema = z
  .object({
    ...BaseContent,
    contentType: z.literal("service"),
    serviceKind: RequiredText.max(120),
    deliverables: z.array(RequiredText.max(300)).min(1).max(50),
  })
  .strict();

export const CmsPostContentSchema = z
  .object({
    ...BaseContent,
    contentType: z.literal("post"),
    excerpt: RequiredText.max(500),
    authorName: RequiredText.max(120),
    publishAfter: z.iso.datetime().optional(),
  })
  .strict();

export const CmsPageContentSchema = z
  .object({
    ...BaseContent,
    contentType: z.enum(["page", "homepage"]),
  })
  .strict();

export const CmsContentPayloadSchema = z.discriminatedUnion("contentType", [
  CmsProductContentSchema,
  CmsServiceContentSchema,
  CmsPostContentSchema,
  CmsPageContentSchema,
]);

export type CmsContentPayload = z.infer<typeof CmsContentPayloadSchema>;
