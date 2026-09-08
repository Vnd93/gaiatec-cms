import { z } from "zod";

const Path = z.string().regex(/^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/?)*$/).max(300);
const Slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160);
const Uuid = z.uuid();
const Utm = z
  .object({
    source: z.string().max(120).optional(),
    medium: z.string().max(120).optional(),
    campaign: z.string().max(160).optional(),
    term: z.string().max(160).optional(),
    content: z.string().max(160).optional(),
  })
  .strict();
const SharedCapture = {
  fields: z.record(
    z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    z.union([z.string().max(5000), z.boolean(), z.array(z.string().max(500)).max(50)]),
  ),
  consent: z
    .object({
      accepted: z.literal(true),
      text: z.string().trim().min(3).max(2000),
      version: z.string().trim().min(1).max(80),
    })
    .strict(),
  honeypot: z.string().max(0).default(""),
  captchaToken: z.string().max(4096).optional(),
};

export const PublicLeadCaptureEnvelopeSchema = z
  .object({
    formKey: Slug,
    formVersion: z.number().int().min(1),
    submissionToken: z.string().regex(/^[0-9a-f]{32}$/),
    origin: z
      .object({
        path: Path,
        source: z.string().trim().min(1).max(120),
        campaignPath: Path.optional(),
        productSlug: Slug.optional(),
        utm: Utm,
      })
      .strict(),
    ...SharedCapture,
  })
  .strict();

// Temporary expand/contract bridge for tabs loaded before the UUID-free f48
// public wire. The strict union accepts one complete envelope or the other,
// never a hybrid; both converge on the same authoritative scoped RPC.
export const LegacyLeadCaptureEnvelopeSchema = z
  .object({
    formId: Uuid,
    formVersionId: Uuid,
    idempotencyKey: Uuid,
    origin: z
      .object({
        path: Path,
        source: z.string().trim().min(1).max(120),
        campaignId: Uuid.optional(),
        productId: Uuid.optional(),
        utm: Utm,
      })
      .strict(),
    ...SharedCapture,
  })
  .strict();

export const LeadCaptureEnvelopeSchema = z.union([
  PublicLeadCaptureEnvelopeSchema,
  LegacyLeadCaptureEnvelopeSchema,
]);

export type LeadCaptureEnvelope = z.infer<typeof LeadCaptureEnvelopeSchema>;
