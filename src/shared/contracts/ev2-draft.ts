import { z } from "zod";
import { CmsContentPayloadSchema } from "./cms-content";
import { Ev2CommandEnvelopeSchema } from "./ev2-foundation";

const DatabaseTimestampSchema = z.iso.datetime({ offset: true });

export const Ev2DraftContentTypeSchema = z.enum([
  "product",
  "service",
  "industry",
  "application",
  "solution",
  "post",
  "page",
  "homepage",
  "navigation",
  "site_settings",
  "placement",
  "campaign",
]);

const DraftFieldKeySchema = z
  .string()
  .regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/)
  .refine((key) => !["__proto__", "constructor", "prototype"].includes(key), "unsafe field key");

export const Ev2DraftFieldsSchema = z.record(DraftFieldKeySchema, z.json());

export const Ev2DraftSchema = z
  .object({
    schemaVersion: z.literal(2),
    contentType: Ev2DraftContentTypeSchema,
    workingTitle: z.string().trim().max(180),
    fields: Ev2DraftFieldsSchema,
  })
  .strict();

export const Ev2ReviewDraftSchema = Ev2DraftSchema.superRefine((draft, context) => {
  if (!draft.workingTitle) {
    context.addIssue({ code: "custom", path: ["workingTitle"], message: "review requires a title" });
  }
  if (Object.keys(draft.fields).length === 0) {
    context.addIssue({ code: "custom", path: ["fields"], message: "review requires editorial content" });
  }
});

// The public contract remains v1 while EV2 drafts are developed in shadow storage.
// Conversion into this schema is required only at the review/publication boundary.
export const Ev2PublishSchema = CmsContentPayloadSchema;

const SetPatchSchema = z
  .object({
    operation: z.literal("set"),
    path: z.tuple([DraftFieldKeySchema]),
    value: z.json(),
  })
  .strict();

const RemovePatchSchema = z
  .object({
    operation: z.literal("remove"),
    path: z.tuple([DraftFieldKeySchema]),
  })
  .strict();

export const Ev2DraftPatchSchema = z.discriminatedUnion("operation", [SetPatchSchema, RemovePatchSchema]);

const DraftCommandBase = {
  envelope: Ev2CommandEnvelopeSchema,
};

export const Ev2DraftCommandSchema = z.discriminatedUnion("action", [
  z
    .object({
      ...DraftCommandBase,
      action: z.literal("capability"),
    })
    .strict(),
  z
    .object({
      ...DraftCommandBase,
      action: z.literal("resume"),
      contentType: Ev2DraftContentTypeSchema,
    })
    .strict(),
  z
    .object({
      ...DraftCommandBase,
      action: z.literal("get"),
      draftId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      ...DraftCommandBase,
      action: z.literal("create"),
      contentType: Ev2DraftContentTypeSchema,
      workingTitle: z.string().trim().max(180).default(""),
    })
    .strict(),
  z
    .object({
      ...DraftCommandBase,
      action: z.literal("patch"),
      draftId: z.string().uuid(),
      workingTitle: z.string().trim().max(180).optional(),
      patches: z.array(Ev2DraftPatchSchema).max(100),
    })
    .strict()
    .superRefine((command, context) => {
      if (!command.envelope.expectedVersion) {
        context.addIssue({
          code: "custom",
          path: ["envelope", "expectedVersion"],
          message: "expectedVersion is required",
        });
      }
      if (!command.patches.length && command.workingTitle === undefined) {
        context.addIssue({ code: "custom", path: ["patches"], message: "patch or workingTitle is required" });
      }
    }),
  z
    .object({
      ...DraftCommandBase,
      action: z.literal("discard"),
      draftId: z.string().uuid(),
      reason: z.string().trim().min(3).max(500),
    })
    .strict()
    .superRefine((command, context) => {
      if (!command.envelope.expectedVersion) {
        context.addIssue({
          code: "custom",
          path: ["envelope", "expectedVersion"],
          message: "expectedVersion is required",
        });
      }
    }),
  z
    .object({
      ...DraftCommandBase,
      action: z.literal("promote"),
      draftId: z.string().uuid(),
      slug: z
        .string()
        .trim()
        .min(1)
        .max(160)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      payload: CmsContentPayloadSchema,
      reason: z.string().trim().min(3).max(500),
    })
    .strict()
    .superRefine((command, context) => {
      if (!command.envelope.expectedVersion) {
        context.addIssue({
          code: "custom",
          path: ["envelope", "expectedVersion"],
          message: "expectedVersion is required",
        });
      }
    }),
]);

export const Ev2DraftRecordSchema = Ev2DraftSchema.extend({
  draftId: z.string().uuid(),
  status: z.enum(["active", "discarded", "promoted"]),
  lockVersion: z.number().int().positive(),
  fieldsHash: z.string().regex(/^[0-9a-f]{64}$/),
  createdAt: DatabaseTimestampSchema,
  updatedAt: DatabaseTimestampSchema,
}).strict();

export const Ev2DraftCommandResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    commandId: z.string().uuid(),
    correlationId: z.string().uuid(),
    draftId: z.string().uuid(),
    status: z.enum(["active", "discarded", "promoted"]),
    lockVersion: z.number().int().positive(),
    savedAt: DatabaseTimestampSchema,
    itemId: z.string().uuid().optional(),
    replayed: z.boolean(),
  })
  .strict();

export type Ev2Draft = z.infer<typeof Ev2DraftSchema>;
export type Ev2DraftContentType = z.infer<typeof Ev2DraftContentTypeSchema>;
export type Ev2DraftCommand = z.infer<typeof Ev2DraftCommandSchema>;
export type Ev2DraftPatch = z.infer<typeof Ev2DraftPatchSchema>;
export type Ev2DraftRecord = z.infer<typeof Ev2DraftRecordSchema>;
export type Ev2DraftCommandResult = z.infer<typeof Ev2DraftCommandResultSchema>;
