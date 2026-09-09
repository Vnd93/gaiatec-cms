import { describe, expect, it } from "vitest";

import {
  LeadCaptureEnvelopeSchema,
  LegacyLeadCaptureEnvelopeSchema,
  PublicLeadCaptureEnvelopeSchema,
} from "../../supabase/functions/_shared/cms-lead-capture-envelope";

const shared = {
  fields: { email: "lead@example.test" },
  consent: { accepted: true as const, text: "Autorizo o contato.", version: "2026-v1" },
  honeypot: "",
};

const publicEnvelope = {
  formKey: "contato-principal",
  formVersion: 2,
  submissionToken: "65ce5231ee7141baaaf8b8c77f4cd42d",
  origin: { path: "/contato", source: "contact", utm: {} },
  ...shared,
};

const legacyEnvelope = {
  formId: "84000000-0000-4000-8000-000000000101",
  formVersionId: "84000000-0000-4000-8000-000000000112",
  idempotencyKey: "84000000-0000-4000-8000-000000000401",
  origin: { path: "/contato", source: "contact", utm: {} },
  ...shared,
};

describe("temporary lead-capture expand/contract envelope", () => {
  it("accepts either the UUID-free public envelope or the complete legacy UUID envelope", () => {
    expect(PublicLeadCaptureEnvelopeSchema.safeParse(publicEnvelope).success).toBe(true);
    expect(LegacyLeadCaptureEnvelopeSchema.safeParse(legacyEnvelope).success).toBe(true);
    expect(LeadCaptureEnvelopeSchema.safeParse(publicEnvelope).success).toBe(true);
    expect(LeadCaptureEnvelopeSchema.safeParse(legacyEnvelope).success).toBe(true);
  });

  it("rejects hybrid root identities instead of selecting a permissive fallback", () => {
    expect(
      LeadCaptureEnvelopeSchema.safeParse({ ...publicEnvelope, formId: legacyEnvelope.formId }),
    ).toMatchObject({ success: false });
    expect(
      LeadCaptureEnvelopeSchema.safeParse({
        ...legacyEnvelope,
        submissionToken: publicEnvelope.submissionToken,
      }),
    ).toMatchObject({ success: false });
  });

  it("rejects mixed-generation context identifiers and partial legacy identity", () => {
    expect(
      LeadCaptureEnvelopeSchema.safeParse({
        ...publicEnvelope,
        origin: { ...publicEnvelope.origin, campaignId: legacyEnvelope.formId },
      }),
    ).toMatchObject({ success: false });
    expect(
      LeadCaptureEnvelopeSchema.safeParse({
        ...legacyEnvelope,
        origin: { ...legacyEnvelope.origin, campaignPath: "/campanhas/campanha-a" },
      }),
    ).toMatchObject({ success: false });
    const { formVersionId: _omitted, ...partialLegacy } = legacyEnvelope;
    expect(LeadCaptureEnvelopeSchema.safeParse(partialLegacy)).toMatchObject({ success: false });
  });

  it("accepts the documented Turnstile limit and rejects oversized tokens", () => {
    expect(
      LeadCaptureEnvelopeSchema.safeParse({ ...publicEnvelope, captchaToken: "t".repeat(2048) }).success,
    ).toBe(true);
    expect(
      LeadCaptureEnvelopeSchema.safeParse({ ...publicEnvelope, captchaToken: "t".repeat(2049) }),
    ).toMatchObject({ success: false });
  });

  it("requires the public submission token to encode a canonical commercial UUID", () => {
    expect(
      LeadCaptureEnvelopeSchema.safeParse({
        ...publicEnvelope,
        submissionToken: "65ce5231ee7101baaaf8b8c77f4cd42d",
      }),
    ).toMatchObject({ success: false });
    expect(
      LeadCaptureEnvelopeSchema.safeParse({
        ...publicEnvelope,
        submissionToken: "65ce5231ee7141ba0af8b8c77f4cd42d",
      }),
    ).toMatchObject({ success: false });
  });
});
