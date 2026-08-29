import { z } from "zod";

export const CmsSlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(160);
const RequiredText = z.string().trim().min(1);
const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
export const CmsConsumerIdSchema = z.string().regex(/^cms\.[a-z][a-z0-9_.-]+\.v[0-9]+$/);

export const CmsProvenanceSchema = z
  .object({
    sourceKind: z.enum(["official_manufacturer", "official_company", "owner_authored"]),
    sourceUrl: z.url().optional(),
    sourcePath: RequiredText.max(500).optional(),
    fileModifiedAt: z.iso.datetime().optional(),
    documentVersion: z.string().trim().min(1).max(80).optional(),
    documentDate: z.iso.date().optional(),
    sourceSha256: Sha256.optional(),
    authorizationReference: RequiredText.max(300).optional(),
    authorizationDate: z.iso.date().optional(),
    rightsScope: RequiredText.max(300).optional(),
    rightsConfirmed: z.literal(true),
    commercialOwner: RequiredText.max(120),
    technicalOwner: RequiredText.max(120),
    verifiedAt: z.iso.datetime(),
  })
  .strict()
  .refine(
    (value) =>
      value.sourceKind === "owner_authored" ||
      Boolean((value.sourceUrl || value.sourcePath) && value.sourceSha256),
    "Fontes externas exigem localização e hash do documento oficial.",
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
  consumerId: CmsConsumerIdSchema,
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
    pilotState: z.enum(["synthetic_test", "awaiting_owner", "homologated"]),
    manufacturer: z
      .object({
        name: RequiredText.max(120),
        slug: CmsSlugSchema,
        officialUrl: z.url().optional(),
      })
      .strict(),
    productLine: z.object({ name: RequiredText.max(120), slug: CmsSlugSchema }).strict(),
    classification: z
      .object({
        segment: RequiredText.max(160),
        category: RequiredText.max(160),
        subcategory: z.string().trim().max(160).optional(),
        family: RequiredText.max(160),
      })
      .strict(),
    commercial: z
      .object({
        shortDescription: RequiredText.max(500),
        valueProposition: RequiredText.max(500),
        benefits: z.array(RequiredText.max(300)).min(1).max(20),
        differentiators: z.array(RequiredText.max(300)).max(20).default([]),
      })
      .strict(),
    function: RequiredText.max(300),
    technology: RequiredText.max(160),
    models: z
      .array(
        z
          .object({
            id: z.uuid(),
            model: RequiredText.max(160),
            sku: RequiredText.max(120),
            status: z.enum(["active", "discontinued"]),
            variants: z
              .array(
                z
                  .object({
                    id: z.uuid(),
                    name: RequiredText.max(160),
                    code: RequiredText.max(120),
                    order: z.number().int().min(0).max(999),
                  })
                  .strict(),
              )
              .min(1)
              .max(100),
          })
          .strict(),
      )
      .min(1)
      .max(50),
    specifications: z
      .array(
        z
          .object({
            id: z.uuid(),
            key: CmsSlugSchema,
            label: RequiredText.max(120),
            type: z.enum(["text", "number", "boolean", "enum", "range"]),
            value: z.union([
              z.string().max(500),
              z.number().finite(),
              z.boolean(),
              z.array(z.string().trim().min(1).max(120)).max(30),
              z.object({ min: z.number().finite(), max: z.number().finite() }).strict(),
            ]),
            unit: z.string().trim().max(40).optional(),
            required: z.boolean(),
            filterable: z.boolean(),
            comparable: z.boolean(),
            searchable: z.boolean(),
          })
          .strict(),
      )
      .min(1)
      .max(200),
    media: z
      .array(
        z
          .object({
            assetId: z.uuid(),
            role: z.enum(["primary", "gallery", "diagram"]),
            alt: RequiredText.max(300),
            caption: z.string().trim().max(500).optional(),
            order: z.number().int().min(0).max(999),
          })
          .strict(),
      )
      .max(30),
    documents: z
      .array(
        z
          .object({
            id: z.uuid(),
            kind: z.enum(["datasheet", "manual", "certificate", "drawing", "software", "other"]),
            title: RequiredText.max(180),
            officialUrl: z.url().optional(),
            storagePath: z
              .string()
              .regex(/^cms-documents\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/)
              .optional(),
            sha256: Sha256,
            revision: RequiredText.max(80),
            language: RequiredText.max(20),
            visibility: z.enum(["public", "private"]),
            rightsConfirmed: z.literal(true),
          })
          .strict()
          .refine((value) => Boolean(value.officialUrl || value.storagePath), {
            message: "Documento exige URL oficial ou arquivo privado.",
          }),
      )
      .max(30),
    relations: z
      .object({
        productIds: z.array(z.uuid()).max(50),
        applicationIds: z.array(z.uuid()).max(50),
        sectorIds: z.array(z.uuid()).max(50),
        serviceIds: z.array(z.uuid()).max(50),
      })
      .strict(),
    search: z
      .object({
        synonyms: z.array(RequiredText.max(120)).max(50),
        keywords: z.array(RequiredText.max(120)).max(50),
      })
      .strict(),
    redirects: z
      .array(
        z
          .object({
            sourcePath: z.string().startsWith("/").max(200),
            statusCode: z.enum(["301", "302"]),
          })
          .strict(),
      )
      .max(30),
    approval: z
      .object({
        portfolioOwner: RequiredText.max(120),
        technicalReviewer: RequiredText.max(120),
        commercialReviewer: RequiredText.max(120),
        editorialReviewer: RequiredText.max(120),
        homologatedAt: z.iso.datetime().optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.pilotState === "homologated" && !value.approval.homologatedAt) {
      context.addIssue({
        code: "custom",
        path: ["approval", "homologatedAt"],
        message: "Homologação exige data.",
      });
    }
    if (value.seo.indexable && value.pilotState !== "homologated") {
      context.addIssue({
        code: "custom",
        path: ["seo", "indexable"],
        message: "Somente produto homologado pode ser indexável.",
      });
    }
  });

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
export type CmsProductContent = z.infer<typeof CmsProductContentSchema>;
