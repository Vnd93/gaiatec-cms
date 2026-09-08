import { z } from "zod";
import { Ev2CommandEnvelopeSchema, Ev2FeatureFlagEvaluationSchema } from "./ev2-foundation";

const UuidSchema = z.string().uuid();
const TimestampSchema = z.iso.datetime({ offset: true });
const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const PerceptualHashSchema = z.string().regex(/^[0-9a-f]{16}$/);
const ExpectedVersionEnvelopeSchema = Ev2CommandEnvelopeSchema.refine(
  (envelope) => envelope.expectedVersion !== undefined,
  { path: ["expectedVersion"], message: "expectedVersion is required" },
);

export const Ev2DamRightsStateSchema = z.enum(["valid", "expiring", "expired", "undated"]);
export const Ev2DamAssetStatusSchema = z.enum([
  "awaiting_upload",
  "processing",
  "ready",
  "rejected",
  "failed",
  "replaced",
  "archived",
]);

export const Ev2DamMetadataSchema = z
  .object({
    originalFilename: z.string().trim().min(1).max(180),
    declaredMime: z.enum(["image/png", "image/jpeg", "image/webp", "image/avif"]),
    sourceKind: z.enum(["synthetic_test", "owner_authored", "official_manufacturer", "official_company"]),
    sourceReference: z.string().trim().min(3).max(500),
    rightsConfirmed: z.literal(true),
    rightsExpiresAt: TimestampSchema.nullable().default(null),
    licenseName: z.string().trim().min(2).max(120),
    ownerName: z.string().trim().min(2).max(120),
    altText: z.string().trim().min(1).max(300),
    caption: z.string().trim().max(500).nullable().default(null),
    credit: z.string().trim().max(200).nullable().default(null),
    focalX: z.number().min(0).max(1).default(0.5),
    focalY: z.number().min(0).max(1).default(0.5),
    sha256: Sha256Schema.optional(),
    perceptualHash: PerceptualHashSchema.optional(),
  })
  .strict()
  .superRefine((metadata, context) => {
    if (metadata.rightsExpiresAt && Date.parse(metadata.rightsExpiresAt) <= Date.now()) {
      context.addIssue({
        code: "custom",
        path: ["rightsExpiresAt"],
        message: "rights expiry must be in the future when reserving an asset",
      });
    }
  });

const MetadataPatchSchema = z
  .object({
    originalFilename: z.string().trim().min(1).max(180).optional(),
    sourceReference: z.string().trim().min(3).max(500).optional(),
    rightsExpiresAt: TimestampSchema.nullable().optional(),
    licenseName: z.string().trim().min(2).max(120).optional(),
    ownerName: z.string().trim().min(2).max(120).optional(),
    altText: z.string().trim().min(1).max(300).optional(),
    caption: z.string().trim().max(500).nullable().optional(),
    credit: z.string().trim().max(200).nullable().optional(),
    focalX: z.number().min(0).max(1).optional(),
    focalY: z.number().min(0).max(1).optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, "metadata patch must not be empty");

const CropSchema = z
  .object({
    cropKey: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    label: z.string().trim().min(1).max(120),
    aspectWidth: z.number().int().min(1).max(10000),
    aspectHeight: z.number().int().min(1).max(10000),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().gt(0).max(1),
    height: z.number().gt(0).max(1),
    focalX: z.number().min(0).max(1),
    focalY: z.number().min(0).max(1),
  })
  .strict()
  .superRefine((crop, context) => {
    if (crop.x + crop.width > 1 || crop.y + crop.height > 1) {
      context.addIssue({ code: "custom", path: ["width"], message: "crop must fit inside the image" });
    }
  });

export const Ev2DamCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("capability"), envelope: Ev2CommandEnvelopeSchema }).strict(),
  z
    .object({
      action: z.literal("list_assets"),
      envelope: Ev2CommandEnvelopeSchema,
      query: z.string().trim().max(120).default(""),
      collectionId: UuidSchema.optional(),
      tagIds: z.array(UuidSchema).max(20).default([]),
      rightsState: Ev2DamRightsStateSchema.optional(),
      includeArchived: z.boolean().default(false),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(50).default(20),
    })
    .strict(),
  z
    .object({ action: z.literal("get_asset"), envelope: Ev2CommandEnvelopeSchema, assetId: UuidSchema })
    .strict(),
  z
    .object({
      action: z.literal("match_asset"),
      envelope: Ev2CommandEnvelopeSchema,
      sha256: Sha256Schema,
      perceptualHash: PerceptualHashSchema.optional(),
      maximumDistance: z.number().int().min(0).max(16).default(8),
    })
    .strict(),
  z
    .object({
      action: z.literal("reserve_upload"),
      envelope: Ev2CommandEnvelopeSchema,
      metadata: Ev2DamMetadataSchema,
    })
    .strict(),
  z
    .object({ action: z.literal("finalize_upload"), envelope: Ev2CommandEnvelopeSchema, assetId: UuidSchema })
    .strict(),
  z
    .object({
      action: z.literal("abort_upload"),
      envelope: Ev2CommandEnvelopeSchema,
      assetId: UuidSchema,
      reasonCode: z
        .enum(["client_upload_failed", "client_cancelled", "client_processing_failed"])
        .default("client_upload_failed"),
    })
    .strict(),
  z
    .object({
      action: z.literal("update_metadata"),
      envelope: ExpectedVersionEnvelopeSchema,
      assetId: UuidSchema,
      patch: MetadataPatchSchema,
      reason: z.string().trim().min(3).max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal("upsert_collection"),
      envelope: Ev2CommandEnvelopeSchema,
      collectionId: UuidSchema.optional(),
      name: z.string().trim().min(1).max(120),
      description: z.string().trim().max(500).default(""),
      reason: z.string().trim().min(3).max(500),
    })
    .strict()
    .superRefine((command, context) => {
      if (command.collectionId && command.envelope.expectedVersion === undefined) {
        context.addIssue({
          code: "custom",
          path: ["envelope", "expectedVersion"],
          message: "expectedVersion is required",
        });
      }
    }),
  z
    .object({
      action: z.literal("archive_collection"),
      envelope: ExpectedVersionEnvelopeSchema,
      collectionId: UuidSchema,
      reason: z.string().trim().min(3).max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal("set_organization"),
      envelope: ExpectedVersionEnvelopeSchema,
      assetId: UuidSchema,
      collectionIds: z.array(UuidSchema).max(30),
      tags: z.array(z.string().trim().min(1).max(80)).max(50),
      reason: z.string().trim().min(3).max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal("save_crop"),
      envelope: ExpectedVersionEnvelopeSchema,
      assetId: UuidSchema,
      crop: CropSchema,
      reason: z.string().trim().min(3).max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal("archive_asset"),
      envelope: ExpectedVersionEnvelopeSchema,
      assetId: UuidSchema,
      reason: z.string().trim().min(3).max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal("restore_asset"),
      envelope: ExpectedVersionEnvelopeSchema,
      assetId: UuidSchema,
      reason: z.string().trim().min(3).max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal("preview_replacement"),
      envelope: Ev2CommandEnvelopeSchema,
      sourceAssetId: UuidSchema,
      targetAssetId: UuidSchema,
    })
    .strict()
    .refine((command) => command.sourceAssetId !== command.targetAssetId, {
      path: ["targetAssetId"],
      message: "replacement target must differ from source",
    }),
  z
    .object({
      action: z.literal("activate_replacement"),
      envelope: ExpectedVersionEnvelopeSchema,
      sourceAssetId: UuidSchema,
      targetAssetId: UuidSchema,
      reason: z.string().trim().min(3).max(500),
    })
    .strict()
    .refine((command) => command.sourceAssetId !== command.targetAssetId, {
      path: ["targetAssetId"],
      message: "replacement target must differ from source",
    }),
  z
    .object({
      action: z.literal("rollback_replacement"),
      envelope: ExpectedVersionEnvelopeSchema,
      replacementId: UuidSchema,
      reason: z.string().trim().min(3).max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal("run_gc"),
      envelope: Ev2CommandEnvelopeSchema,
      jobId: UuidSchema.optional(),
      limit: z.number().int().min(1).max(50).default(10),
      dryRun: z.boolean().default(true),
    })
    .strict(),
]);

export const Ev2DamCollectionSchema = z
  .object({
    id: UuidSchema,
    name: z.string(),
    description: z.string(),
    assetCount: z.number().int().nonnegative(),
  })
  .strict();
export const Ev2DamTagSchema = z
  .object({ id: UuidSchema, name: z.string(), assetCount: z.number().int().nonnegative() })
  .strict();
export const Ev2DamCropSchema = CropSchema.extend({ id: UuidSchema, updatedAt: TimestampSchema }).strict();
export const Ev2DamActiveReplacementSchema = z
  .object({
    id: UuidSchema,
    targetAssetId: UuidSchema,
    lockVersion: z.number().int().positive(),
  })
  .strict();
export const Ev2DamIncomingReplacementSchema = z
  .object({
    id: UuidSchema,
    sourceAssetId: UuidSchema,
    lockVersion: z.number().int().positive(),
  })
  .strict();
export const Ev2DamUsageSchema = z
  .object({
    itemId: UuidSchema,
    revisionId: UuidSchema.nullable(),
    blockId: UuidSchema.nullable(),
    usageKind: z.string(),
    createdAt: TimestampSchema,
    contentType: z.string(),
    displayTitle: z.string().trim().min(1).max(180),
    adminPath: z.string().startsWith("/admin/"),
    blockLabel: z.string().trim().min(1).max(180).nullable(),
  })
  .strict();

export const Ev2DamAssetSchema = z
  .object({
    id: UuidSchema,
    originalFilename: z.string(),
    processingStatus: Ev2DamAssetStatusSchema,
    scanStatus: z.enum(["pending", "clean", "rejected", "failed"]),
    sourceKind: z.string(),
    sourceReference: z.string(),
    licenseName: z.string(),
    ownerName: z.string(),
    rightsExpiresAt: TimestampSchema.nullable(),
    rightsState: Ev2DamRightsStateSchema,
    altText: z.string(),
    caption: z.string().nullable(),
    credit: z.string().nullable(),
    focalX: z.number(),
    focalY: z.number(),
    width: z.number().int().nullable(),
    height: z.number().int().nullable(),
    sha256: Sha256Schema.nullable(),
    perceptualHash: PerceptualHashSchema.nullable(),
    previewUrl: z.string().url().nullable(),
    lockVersion: z.number().int().positive(),
    archivedAt: TimestampSchema.nullable(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
    activeReplacement: Ev2DamActiveReplacementSchema.nullable().default(null),
    incomingReplacement: Ev2DamIncomingReplacementSchema.nullable().default(null),
    collections: z.array(Ev2DamCollectionSchema).default([]),
    tags: z.array(Ev2DamTagSchema).default([]),
    crops: z.array(Ev2DamCropSchema).default([]),
    totalUsageCount: z.number().int().nonnegative().default(0),
    hiddenUsageCount: z.number().int().nonnegative().default(0),
    usages: z.array(Ev2DamUsageSchema).default([]),
  })
  .strict();

const ResultBase = z
  .object({ schemaVersion: z.literal(1), commandId: UuidSchema, correlationId: UuidSchema })
  .strict();

export const Ev2DamCapabilityResultSchema = Ev2FeatureFlagEvaluationSchema.extend({
  commandId: UuidSchema,
  correlationId: UuidSchema,
}).strict();
export const Ev2DamAssetListResultSchema = ResultBase.extend({
  items: z.array(Ev2DamAssetSchema),
  collections: z.array(Ev2DamCollectionSchema),
  tags: z.array(Ev2DamTagSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
}).strict();
export const Ev2DamAssetResultSchema = ResultBase.extend({ asset: Ev2DamAssetSchema }).strict();
export const Ev2DamMatchResultSchema = ResultBase.extend({
  exact: Ev2DamAssetSchema.nullable(),
  similar: z.array(Ev2DamAssetSchema),
}).strict();
export const Ev2DamAbortUploadResultSchema = ResultBase.extend({
  assetId: UuidSchema,
  status: z.enum(["failed", "rejected"]),
  archived: z.literal(true),
  gcScheduled: z.literal(true),
  gcAfter: TimestampSchema,
}).strict();
export const Ev2DamReplacementPreviewResultSchema = ResultBase.extend({
  sourceAssetId: UuidSchema,
  targetAssetId: UuidSchema,
  usageCount: z.number().int().nonnegative(),
  visibleUsageCount: z.number().int().nonnegative(),
  hiddenUsageCount: z.number().int().nonnegative(),
  hasHiddenUsages: z.boolean(),
  usages: z.array(Ev2DamUsageSchema),
  targetPublishable: z.boolean(),
}).strict();

export type Ev2DamCommand = z.infer<typeof Ev2DamCommandSchema>;
export type Ev2DamAsset = z.infer<typeof Ev2DamAssetSchema>;
export type Ev2DamCollection = z.infer<typeof Ev2DamCollectionSchema>;
export type Ev2DamTag = z.infer<typeof Ev2DamTagSchema>;
