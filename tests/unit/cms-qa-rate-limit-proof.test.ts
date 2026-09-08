import { describe, expect, it } from "vitest";
import {
  cmsQaRateLimitProofBindingIsExact,
  cmsQaRateLimitProofPreflightIsExact,
} from "../../supabase/functions/_shared/cms-qa-rate-limit-proof";

const sha = "a".repeat(40);
const origin = "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev";
const exact = {
  environment: "staging",
  configuredReleaseSha: sha,
  configuredAdminOrigin: origin,
  requestOrigin: origin,
  originAllowed: true,
  actorId: "80000000-0000-4000-8000-000000000001",
  aal: "aal2",
  userMetadata: {
    synthetic: true,
    purpose: "qa-cms-browser",
    environment: "staging",
    candidateSha: sha,
    runTag: "QA-CMS-FINAL-20260907-aaaaaaaa",
  },
  requestedCandidateSha: sha,
  requestedRunTag: "QA-CMS-FINAL-20260907-aaaaaaaa",
  proofId: "80000000-0000-4000-8000-000000000002",
  operation: "consume",
};

describe("isolated QA rate-limit proof binding", () => {
  it("accepts only the exact staging release, origin, AAL2 identity and synthetic marker", () => {
    expect(cmsQaRateLimitProofPreflightIsExact(exact)).toBe(true);
    expect(cmsQaRateLimitProofBindingIsExact(exact)).toBe(true);
    expect(cmsQaRateLimitProofBindingIsExact({ ...exact, operation: "cleanup" })).toBe(true);
  });

  it.each([
    { environment: "production" },
    { configuredReleaseSha: undefined },
    { requestOrigin: null },
    { requestOrigin: "https://gaiatecsistemas.com.br" },
    { originAllowed: false },
  ])("fails before authentication for a production or unbound preflight: %j", (override) => {
    expect(cmsQaRateLimitProofPreflightIsExact({ ...exact, ...override })).toBe(false);
    expect(cmsQaRateLimitProofBindingIsExact({ ...exact, ...override })).toBe(false);
  });

  it("rejects a requested SHA that differs from the valid server release configuration", () => {
    expect(cmsQaRateLimitProofPreflightIsExact(exact)).toBe(true);
    expect(
      cmsQaRateLimitProofBindingIsExact({
        ...exact,
        requestedCandidateSha: "b".repeat(40),
      }),
    ).toBe(false);
  });

  it.each([
    { aal: "aal1" },
    { actorId: "not-a-uuid" },
    { requestedCandidateSha: "b".repeat(40) },
    { requestedRunTag: "QA-CMS-FINAL-20260907-bbbbbbbb" },
    { proofId: "not-a-uuid" },
    { operation: "reset" },
    { userMetadata: { ...exact.userMetadata, synthetic: false } },
    { userMetadata: { ...exact.userMetadata, candidateSha: "b".repeat(40) } },
    { userMetadata: { ...exact.userMetadata, environment: "production" } },
  ])("rejects a forged actor, lease marker or proof field: %j", (override) => {
    expect(cmsQaRateLimitProofBindingIsExact({ ...exact, ...override })).toBe(false);
  });
});
