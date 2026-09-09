import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/deploy-production.yml", "utf8");
const frontendBridgeWorkflow = readFileSync(
  ".github/workflows/promote-production-frontend-bridge.yml",
  "utf8",
);
const policy = readFileSync("scripts/qa/production-authenticated-preflight-policy.mjs", "utf8");
const preparer = readFileSync("scripts/qa/prepare-production-authenticated-preflight.mjs", "utf8");
const browser = readFileSync("tests/e2e/cms-production-readonly-preflight.spec.ts", "utf8");
const releaseEvidence = readFileSync("scripts/ev2/phase12/production-release-evidence-lib.mjs", "utf8");
const workerEnvironment = readFileSync("scripts/prepare-cloudflare-worker-env.mjs", "utf8");
const environmentExample = readFileSync(".env.example", "utf8");

describe("production authenticated read-only sealed-artifact preflight", () => {
  it("runs on the exact preview after the governed backend bootstrap and before promotion", () => {
    const sealedPreview = workflow.indexOf("Deploy the single sealed artifact to an isolated");
    const authenticated = workflow.indexOf("Authenticate the authorized corporate operator");
    const marker = workflow.indexOf("Arm the durable production mutation marker");
    const migration = workflow.indexOf("Apply the exact candidate expand-only migrations");
    const backendProbe = workflow.indexOf(
      "Probe the complete candidate against the prepared production backend",
    );
    const operator = workflow.indexOf("Provision the exact confirmed corporate MFA operator");
    const promotion = workflow.indexOf("Promote the exact same single sealed artifact");
    expect(sealedPreview).toBeGreaterThanOrEqual(0);
    expect(marker).toBeGreaterThan(sealedPreview);
    expect(migration).toBeGreaterThan(marker);
    expect(backendProbe).toBeGreaterThan(migration);
    expect(operator).toBeGreaterThan(backendProbe);
    expect(authenticated).toBeGreaterThan(operator);
    expect(marker).toBeLessThan(promotion);
    expect(authenticated).toBeLessThan(promotion);
    expect(workflow).toContain("steps.preflight.outputs.deployment-url");
    expect(workflow).toContain("cms-production-readonly-preflight.spec.ts");
  });

  it("is mandatory and fails closed before production promotion", () => {
    expect(workflow).toContain('QA_CMS_PRODUCTION_READONLY_PREFLIGHT_REQUIRED: "true"');
    expect(workflow).not.toContain("vars.PRODUCTION_AUTHENTICATED_PREFLIGHT_REQUIRED");
    expect(workflow).not.toContain("if: steps.corporate_authenticated_preflight.outputs.enabled");
    expect(environmentExample).toContain("PRODUCTION_AUTHENTICATED_PREFLIGHT_REQUIRED=true");
    expect(environmentExample).toContain(
      "PRODUCTION_OPERATOR_EMAIL=store-only-as-a-github-environment-secret",
    );
    expect(workflow).toContain("secrets.PRODUCTION_AUTH_CANARY_EMAIL");
    expect(workflow).toContain("secrets.PRODUCTION_AUTH_CANARY_PASSWORD");
    expect(workflow).toContain("secrets.PRODUCTION_AUTH_CANARY_TOTP_SECRET");
    expect(workflow).toContain("secrets.PRODUCTION_OPERATOR_EMAIL");
    expect(workflow).toContain("provision-production-operator.mjs");
    expect(preparer).toContain("authenticatedPreflightPolicy");
    expect(policy).toContain("QA_CMS_PRODUCTION_PREFLIGHT_CREDENTIALS_REQUIRED");
    expect(policy).toContain("QA_CMS_PRODUCTION_PREFLIGHT_TARGET_REFUSED");
    expect(policy).not.toMatch(/evidence:[\s\S]{0,500}(email|password|totpSecret|anonKey)/);
  });

  it("maps every first-party read to the sealed preview while retaining the allowed production origin", () => {
    expect(browser).toContain('await context.route("**/*"');
    expect(browser).toContain("new URL(`${url.pathname}${url.search}`, config.previewOrigin)");
    expect(browser).toContain('baseURL: PRODUCTION_ORIGIN, serviceWorkers: "block"');
    expect(browser).toContain('name: "Confirmar sua identidade"');
    expect(browser).toContain('name: "Perfil e acesso"');
    expect(browser).toContain("cms_user_roles?select=role_key");
    expect(browser).toContain("unexpectedMutations");
    expect(browser).toContain("cmsMutations: 0");
    expect(browser).toContain("credentialsPersisted: false");
    expect(browser).toContain("tokensPersisted: false");
    expect(browser).toContain("canonicalFrontendDuringPreflightSha");
    expect(browser).toContain("preparedBackendCandidateSha");
    expect(workflow).toContain("QA_CMS_CANONICAL_FRONTEND_SHA: ${{ steps.baseline.outputs.release }}");
    expect(workflow).not.toContain("QA_CMS_CANONICAL_BASELINE_SHA");
    expect(browser).toContain("requireCanonicalFrontendCandidate(");
    expect(browser).toContain("process.env.QA_CMS_CANONICAL_FRONTEND_SHA");
    expect(releaseEvidence).toContain("payload?.canonicalFrontendDuringPreflightSha === candidateSha");
    expect(browser).toContain('test.use({ trace: "off", screenshot: "off", video: "off" })');
  });

  it("requires an immutable passed MFA canary record", () => {
    expect(releaseEvidence).toContain('"candidate/outputs/cms-production-readonly-preflight.json"');
    expect(releaseEvidence).toContain('payload?.status === "passed"');
    expect(releaseEvidence).toContain("payload?.policyRequired === true");
    expect(releaseEvidence).not.toContain('payload?.status === "not_required"');
    expect(releaseEvidence).toContain('"authenticated_preflight_scenario_incomplete"');
    expect(workflow).toContain("candidate/outputs/cms-production-readonly-preflight.json");
  });

  it("refuses local env files before Vite and bypasses Vite's local loader for a production Worker", () => {
    const refusal = frontendBridgeWorkflow.indexOf("Refuse local environment inputs before production build");
    const build = frontendBridgeWorkflow.indexOf("Build clean production bridge A");
    expect(refusal).toBeGreaterThanOrEqual(0);
    expect(refusal).toBeLessThan(build);
    expect(frontendBridgeWorkflow).toContain("test ! -e .env.local");
    expect(frontendBridgeWorkflow).toContain("test ! -e .env.production.local");
    expect(workerEnvironment).toContain('runtimeEnvironment?.VITE_CMS_ENVIRONMENT === "production"');
    expect(workerEnvironment).toContain("return { ...runtimeEnvironment }");
    expect(workerEnvironment).toContain("CLOUDFLARE_WORKER_PRODUCTION_TARGET_REFUSED");
  });
});
