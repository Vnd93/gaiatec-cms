import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const edge = readFileSync("supabase/functions/lead-capture/index.ts", "utf8");
const contactEdge = readFileSync("supabase/functions/submit-contact/index.ts", "utf8");
const envelope = readFileSync("supabase/functions/_shared/cms-lead-capture-envelope.ts", "utf8");
const sharedContract = readFileSync("src/shared/contracts/cms-content.ts", "utf8");
const derivation = readFileSync("supabase/functions/_shared/turnstile-siteverify-idempotency.ts", "utf8");
const verificationPolicy = readFileSync("supabase/functions/_shared/exact-origin-allowlist.ts", "utf8");
const challenge = readFileSync("src/app/components/TurnstileChallenge.tsx", "utf8");
const footer = readFileSync("src/app/components/Footer.tsx", "utf8");
const cmsLeadForm = readFileSync("src/public/components/CmsLeadForm.tsx", "utf8");

describe("lead-capture Turnstile idempotency boundary", () => {
  it("derives a token-bound Siteverify key instead of sending the commercial key", () => {
    expect(edge).toContain("verifyTurnstileSiteverify({");
    expect(edge).toContain('operation:"cms-lead-capture"');
    expect(edge).toContain("commercialKey:commercialIdempotencyKey");
    expect(derivation).toContain("deriveTurnstileSiteverifyIdempotencyKey(");
    expect(derivation).toContain("idempotency_key: idempotencyKey");
    expect(derivation).not.toContain("idempotency_key: input.commercialKey");
  });

  it("preserves the commercial idempotency key at the authoritative RPC", () => {
    expect(edge).toContain("p_idempotency_key:idempotencyKey");
    expect(edge).not.toContain("p_idempotency_key:siteverifyIdempotencyKey");
  });

  it("applies the same separation to the compatible contact endpoint", () => {
    expect(contactEdge).toContain("verifyTurnstileSiteverify({");
    expect(contactEdge).toContain('operation: "submit-contact"');
    expect(contactEdge).toContain("commercialKey: commercialIdempotencyKey");
    expect(contactEdge).toContain("idempotency_key: idempotencyKey,");
    expect(contactEdge).toContain('"Idempotency-Key": idempotencyKey');
  });

  it("binds each widget token to the current commercial UUID through cData", () => {
    expect(challenge).toContain("cData: string");
    expect(challenge).toContain("CANONICAL_UUID_PATTERN.test(cData)");
    expect(challenge).toContain("cData,");
    expect(footer).toContain("key={newsletterIdempotencyKey}");
    expect(footer).toContain("cData={newsletterIdempotencyKey}");
    expect(cmsLeadForm).toContain("key={idempotencyKey}");
    expect(cmsLeadForm).toContain("cData={idempotencyKey}");
    expect(derivation).toContain("cdata?: string");
    expect(edge).toContain("expectedAction, commercialIdempotencyKey");
    expect(edge).toContain("commercialIdempotencyKey=input.idempotencyKey");
    expect(edge).toContain("expandCompactCanonicalUuid(input.submissionToken)");
    expect(derivation).toContain("cdata?: string");
    expect(contactEdge).toContain("expectedAction, commercialIdempotencyKey");
    expect(verificationPolicy).toContain("result.cdata !== policy.expectedCdata");
  });

  it("binds the derivation to a token digest and never logs or persists token/cData", () => {
    expect(derivation).toContain('"turnstile-siteverify:v1"');
    expect(derivation).toContain('["cms-lead-capture", "submit-contact"] as const');
    expect(derivation).toContain("assertTurnstileSiteverifyOperation(operation)");
    expect(derivation).toContain("const tokenDigest = await sha256Hex(token)");
    expect(derivation).toContain("operation}:${commercialKey}:${tokenDigest}");
    expect(derivation).not.toMatch(/console\.|JSON\.stringify|Deno\.write|localStorage|sessionStorage/);
    expect(edge).not.toMatch(/console\.(?:log|info|warn|error)[\s\S]{0,160}(?:captchaToken|cdata|token)/);
    expect(contactEdge).not.toMatch(
      /console\.(?:log|info|warn|error)[\s\S]{0,160}(?:captchaToken|cdata|token)/,
    );
    expect(edge.slice(edge.indexOf("const evidence="))).not.toContain("captchaToken");
    expect(edge.slice(edge.indexOf("const evidence="))).not.toContain("cdata");
    expect(contactEdge.slice(contactEdge.indexOf("const technicalEvidence"))).not.toContain("captchaToken");
    expect(contactEdge.slice(contactEdge.indexOf("const technicalEvidence"))).not.toContain("cdata");
  });

  it("enforces Cloudflare's documented maximum token length", () => {
    expect(envelope).toContain("captchaToken: z.string().max(2048).optional()");
    expect(envelope).not.toContain("captchaToken: z.string().max(4096).optional()");
    expect(sharedContract).toContain("captchaToken: z.string().max(2048).optional()");
    expect(sharedContract).not.toContain("captchaToken: z.string().max(4096).optional()");
    expect(contactEdge).toContain("rawCaptchaToken.length > 2_048");
    expect(contactEdge).toContain("cleanText(rawCaptchaToken, 2_048)");
    expect(contactEdge).not.toContain("cleanText(body.captchaToken, 4_096)");
  });

  it("fails closed before either authoritative mutation when Siteverify is unavailable or rejects", () => {
    for (const source of [edge, contactEdge]) {
      expect(source).toMatch(/verification\s*===\s*"unavailable"/);
      expect(source).toMatch(/verification\s*!==\s*"accepted"/);
      expect(source).toMatch(/verification\s*===\s*"unavailable"[^;\n]*503/);
      expect(source).toMatch(/verification\s*!==\s*"accepted"[^;\n]*403/);
    }
    expect(derivation).toContain("AbortSignal.timeout(TURNSTILE_SITEVERIFY_TIMEOUT_MS)");
    expect(derivation).toContain('return "unavailable"');
    expect(edge.indexOf("const verification=await verifyTurnstile")).toBeLessThan(
      edge.indexOf('admin.rpc("cms_capture_lead_scoped"'),
    );
    expect(contactEdge.indexOf("const verification = await verifyTurnstile")).toBeLessThan(
      contactEdge.indexOf('admin.from("contact_submissions").insert'),
    );
  });
});
