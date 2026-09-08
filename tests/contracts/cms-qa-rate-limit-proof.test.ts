import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0080_cms_qa_rate_limit_proof.sql", "utf8");
const edge = readFileSync("supabase/functions/cms-public/index.ts", "utf8");
const e2e = readFileSync("tests/e2e/cms-security-boundaries.spec.ts", "utf8");
const workflow = readFileSync(".github/workflows/deploy-staging.yml", "utf8");

describe("staging-only isolated rate-limit proof", () => {
  it("binds each bucket to one exact active QA lease and removes it explicitly or terminally", () => {
    expect(migration).toContain("private.cms_qa_rate_limit_proof_buckets");
    expect(migration).toContain("p_environment <> 'staging'");
    expect(migration).toContain("v_lease.status <> 'active'");
    expect(migration).toContain("private.cms_qa_actor_marker_is_exact");
    expect(migration).toContain("cms_public_search_qa_proof");
    expect(migration).toContain("cms_05_qa_rate_limit_proof_cleanup_0080");
    expect(migration).toMatch(/p_operation = 'cleanup'[\s\S]+delete from public\.request_rate_limits/);
    expect(migration).toMatch(/bucket\.actor_id = p_actor_id[\s\S]+bucket\.key_hash = p_key_hash/);
    expect(migration).toContain("'idempotent', true");
    expect(migration).toContain("to service_role");
    expect(migration).toMatch(/from public, anon, authenticated;/);
  });

  it("hides production before authentication and requires exact CORS, AAL2 metadata and release binding", () => {
    const handler = edge.slice(
      edge.indexOf("const handleQaRateLimitProof"),
      edge.indexOf("const handleRequest"),
    );
    expect(handler.indexOf("cmsQaRateLimitProofPreflightIsExact")).toBeGreaterThanOrEqual(0);
    expect(handler.indexOf("cmsQaRateLimitProofPreflightIsExact")).toBeLessThan(
      handler.indexOf("authenticateCms"),
    );
    expect(edge).toContain('Deno.env.get("CMS_RELEASE_SHA")');
    expect(edge).toContain("cmsQaRateLimitProofBindingIsExact");
    expect(edge).toContain("rateLimitKeyHash(");
    expect(edge).toContain("`${identity.user.id}:${candidateSha}:${runTag}:${proofId}`");
    expect(edge).toContain('"Retry-After"');
    const cors = edge.slice(
      edge.indexOf("const qaProofCorsHeaders"),
      edge.indexOf("const PUBLIC_REVALIDATE"),
    );
    expect(cors).not.toContain('"Access-Control-Allow-Origin": "*"');
    expect(cors).toContain("exactStagingOrigin");
    expect(cors).toContain("isAllowedOrigin(req)");
  });

  it("uses four bounded requests, a three-second recovery window and idempotent cleanup", () => {
    expect(e2e).toContain('path: "/functions/v1/cms-public"');
    expect(e2e).toContain("statuses: [429]");
    expect(e2e).toContain("sharedPublicIpBucketConsumed: false");
    expect(e2e).toContain("requestsUntil429: 4");
    expect(e2e).toContain("retryAfter * 1_000 + 300");
    expect(e2e).toContain("productionHiddenStatus: 404");
    expect(e2e).toContain("unboundProofStatus: 404");
    expect(e2e).toContain("unboundCandidateStatus: 404");
    expect(e2e).toContain("opaqueUnknownUuidStatus: 404");
    expect(e2e).toContain("sendMissingItemSave(page, config");
    expect(e2e).toContain("invalidCorsPreflightStatus: 403");
    expect(e2e).toContain("wildcardCorsAccepted: false");
    expect(e2e).toContain('headers()["access-control-allow-origin"]');
    expect(e2e).toContain('headers().vary).toContain("Origin")');
    expect(e2e).toContain('qaRateLimitProof(page, config, proofId, "cleanup")');
    expect(e2e).toContain("proofIdPersisted: false");
    expect(e2e).not.toMatch(/attempt <= 130|61_500|publicSearch\(/);
  });

  it("configures the exact candidate release and makes the browser proof mandatory", () => {
    expect(workflow).toContain('CMS_RELEASE_SHA="${{ steps.candidate.outputs.sha }}"');
    expect(workflow).toContain("tests/e2e/cms-security-boundaries.spec.ts");
    expect(workflow).toContain("candidate/outputs/cms-security-boundaries.json");
  });

  it("defines a separate production security profile without consuming the QA proof bucket", () => {
    const production = e2e.slice(e2e.indexOf('test.describe.serial("CMS production'));
    expect(production).toContain("@security-production");
    expect(production).toContain('configuration(baseURL, "production")');
    expect(production).toContain('securityProfile: "production-without-qa-rate-limit-proof"');
    expect(production).toContain("production-anonymous-rls");
    expect(production).toContain("production-payload-and-uuid-tampering");
    expect(production).toContain("production-public-xss-inert-output");
    expect(production).toContain("activePublicResidue: 0");
    expect(production).toContain("rateLimitProofInvoked: false");
    expect(production).not.toContain("qaRateLimitProof(page");
  });
});
