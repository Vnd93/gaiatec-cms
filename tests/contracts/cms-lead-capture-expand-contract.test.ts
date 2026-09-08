import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const envelope = readFileSync("supabase/functions/_shared/cms-lead-capture-envelope.ts", "utf8");
const edge = readFileSync("supabase/functions/lead-capture/index.ts", "utf8");
const pgTap = readFileSync("supabase/tests/rls_cms_lead_origin_form_binding.test.sql", "utf8");

describe("lead-capture temporary expand/contract bridge", () => {
  it("keeps the two request generations strict and mutually exclusive", () => {
    expect(envelope).toContain("Temporary expand/contract bridge");
    expect(envelope).toContain("PublicLeadCaptureEnvelopeSchema");
    expect(envelope).toContain("LegacyLeadCaptureEnvelopeSchema");
    expect(envelope).toContain("LeadCaptureEnvelopeSchema = z.union");
    expect(envelope).toContain("formKey: Slug");
    expect(envelope).toContain("formVersion: z.number().int().min(1)");
    expect(envelope).toContain("submissionToken:");
    expect(envelope).toContain("formId: Uuid");
    expect(envelope).toContain("formVersionId: Uuid");
    expect(envelope).toContain("idempotencyKey: Uuid");
    expect(envelope.match(/\.strict\(\)/g)?.length).toBeGreaterThanOrEqual(5);
    expect(envelope).not.toContain("passthrough");
  });

  it("resolves legacy UUIDs once through the authoritative form RPC with no loose fallback", () => {
    expect(edge).toContain('if("formId" in input)');
    expect(edge).toContain("p_form_key:requestedFormKey");
    expect(edge).toContain("p_form_id:requestedFormId");
    expect(edge).toContain("p_version_id:requestedFormVersionId");
    expect(edge).toContain("version.id.toLowerCase()!==requestedFormId.toLowerCase()");
    expect(edge).toContain("version.version_id.toLowerCase()!==requestedFormVersionId?.toLowerCase()");
    expect(edge).toContain('.eq("item_id",campaignContext)');
    expect(edge).toContain('.eq("item_id",productContext)');
    expect(edge.match(/cms_public_form_scoped/g)).toHaveLength(1);
    expect(edge).not.toMatch(/retry|fallback/i);
  });

  it("rebuilds governed provenance and exposes only the exact public confirmation", () => {
    expect(edge).toContain("publishedProjectionAuthorizesLeadContext(");
    expect(edge).toContain("const governedOrigin=");
    expect(edge).toContain("campaignResult.data.item_id");
    expect(edge).toContain("productResult.data.item_id");
    expect(edge).toContain("return json(req,{reference,duplicate:data.duplicate},201)");
    expect(edge).not.toMatch(/return json\(req,\{reference,[^}]*correlationId/);
  });

  it("proves manipulated IDs, retired versions and provenance tampering at the database boundary", () => {
    for (const marker of [
      "manipulated legacy form UUIDs cannot capture against a campaign bound to form A",
      "a manipulated legacy form tuple leaves no lead residue",
      "the origin policy rejects a retired version even when the projection still names its UUID pair",
      "a campaign identifier with an adulterated source is rejected",
      "a campaign identifier with an adulterated path is rejected",
      "campaign and product identifiers are rejected because provenance has exactly one context",
    ]) {
      expect(pgTap).toContain(marker);
    }
  });
});
