import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import worker, { CONTENT_SECURITY_POLICY } from "../../../cloudflare/_worker.js";
import { prepareRoleRestore } from "./prepare-role-restore.mjs";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  validateBackupConfig,
  validateEmailProviderConfig,
  validateProductionReadinessControls,
  validateResendDomainResponse,
} from "./readiness-lib.mjs";

const sha = "a".repeat(40);
const read = (path) => readFile(path, "utf8");

test("role restore omits only platform-managed GUC assignments", () => {
  const source = `ALTER ROLE postgres WITH SUPERUSER;
ALTER ROLE postgres SET
  "log_min_messages" TO 'fatal';
ALTER ROLE authenticator SET "statement_timeout" TO '8s';
ALTER ROLE authenticated RESET statement_timeout;
SET log_min_messages = warning;
SET SESSION "log_min_messages" TO warning;
SELECT pg_catalog.set_config('log_min_messages', 'warning', false);
SET search_path = '';
GRANT anon TO authenticator;
`;
  const result = prepareRoleRestore(source);

  assert.equal(result.removedRoleSettings, 2);
  assert.equal(result.removedSessionSettings, 3);
  assert.doesNotMatch(result.sql, /log_min_messages|ALTER ROLE authenticator SET/);
  assert.match(result.sql, /ALTER ROLE postgres WITH SUPERUSER/);
  assert.match(result.sql, /ALTER ROLE authenticated RESET statement_timeout/);
  assert.match(result.sql, /SET search_path = ''/);
  assert.match(result.sql, /GRANT anon TO authenticator/);
});

function readiness() {
  return {
    githubProtection: {
      status: "verified",
      candidateSha: sha,
      governanceMode: "sole-maintainer",
      maintainerLogin: "Vnd93",
      requiredPullRequestApprovals: 0,
      codeOwnersCount: 1,
      branchProtected: true,
      requiredChecksPassed: true,
      soleMaintainerRiskAccepted: true,
      evidenceReference: "actions/github-controls-123",
      verifiedAt: "2026-09-05T10:00:00.000Z",
    },
    backupRestore: {
      status: "passed",
      projectRef: PRODUCTION_SUPABASE_PROJECT_REF,
      externalTarget: "github-actions-encrypted-artifact",
      encryptedArchiveSha256: "b".repeat(64),
      backupRunId: "backup-run-123",
      restoreDrillRunId: "restore-run-123",
      rpoMinutes: 1440,
      rtoMinutes: 30,
      evidenceReference: "actions/backup-restore-123",
      completedAt: "2026-09-05T10:10:00.000Z",
    },
    dpoLegal: {
      status: "approved",
      approverId: "Vnd93",
      scopeSha256: "c".repeat(64),
      evidenceReference: "legal/DPO-EV2-G12",
      approvedAt: "2026-09-05T10:20:00.000Z",
    },
    emailProvider: {
      status: "verified",
      provider: "resend",
      sendingDomain: "gaiatecsistemas.com",
      from: "GAIATEC SISTEMAS <cms@gaiatecsistemas.com>",
      notificationTo: "comercial@gaiatecsistemas.com.br",
      syntheticDeliveryStatus: "passed",
      syntheticDeliveryId: "email-test-123",
      realDataUsed: false,
      evidenceReference: "actions/email-123",
      verifiedAt: "2026-09-05T10:30:00.000Z",
    },
    csp: {
      status: "passed",
      mode: "enforce",
      candidateSha: sha,
      policySha256: createHash("sha256").update(CONTENT_SECURITY_POLICY).digest("hex"),
      criticalViolations: 0,
      evidenceReference: "actions/csp-123",
      verifiedAt: "2026-09-05T10:40:00.000Z",
    },
  };
}

test("backup configuration binds encrypted off-platform copy to the exact production project", () => {
  const base = {
    projectRef: PRODUCTION_SUPABASE_PROJECT_REF,
    databaseUrl: `postgresql://postgres:${"x".repeat(24)}@db.${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co:5432/postgres?sslmode=require`,
    encryptionPassphrase: "correct-horse-battery-staple-archive-key",
    target: "github-actions-encrypted-artifact",
    gitRef: "refs/heads/main",
  };
  assert.equal(validateBackupConfig(base).valid, true);
  assert.match(
    validateBackupConfig({ ...base, projectRef: "glcqsosxwgmlhzgcsnzv" }).violations.join(","),
    /production_project_ref_mismatch/,
  );
  assert.match(
    validateBackupConfig({
      ...base,
      databaseUrl: base.databaseUrl.replace("sslmode=require", ""),
    }).violations.join(","),
    /database_tls_required/,
  );
  assert.match(
    validateBackupConfig({ ...base, encryptionPassphrase: "short" }).violations.join(","),
    /backup_encryption_passphrase_invalid/,
  );
});

test("real email provider is Resend with verified sending and corporate recipient boundaries", () => {
  const config = {
    provider: "resend",
    from: "GAIATEC SISTEMAS <cms@gaiatecsistemas.com>",
    sendingDomain: "gaiatecsistemas.com",
    siteOrigin: "https://gaiatecsistemas.com.br",
    notificationTo: "comercial@gaiatecsistemas.com.br",
    apiKey: `re_${"x".repeat(32)}`,
  };
  assert.equal(validateEmailProviderConfig(config).valid, true);
  assert.equal(
    validateResendDomainResponse({
      data: [{ id: "domain-1", name: "gaiatecsistemas.com", status: "verified" }],
    }).valid,
    true,
  );
  assert.match(
    validateEmailProviderConfig({ ...config, notificationTo: "external@example.net" }).violations.join(","),
    /notification_recipient_invalid/,
  );
  assert.match(
    validateResendDomainResponse({
      data: [{ name: "gaiatecsistemas.com", status: "pending" }],
    }).violations.join(","),
    /resend_domain_not_verified/,
  );
});

test("production readiness requires sole-maintainer, legal and operational controls", () => {
  const controls = readiness();
  assert.equal(validateProductionReadinessControls(controls, { candidateSha: sha }).valid, true);
  const repeatedGap = structuredClone(controls);
  repeatedGap.githubProtection.maintainerLogin = "another-user";
  repeatedGap.githubProtection.soleMaintainerRiskAccepted = false;
  repeatedGap.backupRestore.rtoMinutes = 61;
  repeatedGap.dpoLegal.status = "pending";
  repeatedGap.dpoLegal.approverId = "another-user";
  repeatedGap.emailProvider.syntheticDeliveryStatus = "accepted";
  repeatedGap.csp.criticalViolations = 1;
  const violations = validateProductionReadinessControls(repeatedGap, { candidateSha: sha }).violations.join(
    ",",
  );
  assert.match(violations, /github_sole_maintainer_invalid/);
  assert.match(violations, /github_sole_maintainer_risk_not_accepted/);
  assert.match(violations, /restore_rto_invalid/);
  assert.match(violations, /dpo_legal_not_approved/);
  assert.match(violations, /dpo_legal_approver_must_match_sole_maintainer/);
  assert.match(violations, /email_synthetic_delivery_not_verified/);
  assert.match(violations, /csp_critical_violation_present/);
});

test("legal scope is hash-bound and the public privacy notice covers production email", async () => {
  const [scope, templateText, privacyNotice] = await Promise.all([
    read("docs/ev2/fase-16/ESCOPO_DPO_LEGAL_PADRAO.md"),
    read("docs/ev2/fase-12/G12_APPROVAL.template.json"),
    read("src/app/pages/PoliticaPrivacidadePage.tsx"),
  ]);
  const template = JSON.parse(templateText);
  const canonicalScope = scope.replaceAll("\r\n", "\n");
  const scopeSha256 = createHash("sha256").update(canonicalScope).digest("hex");
  assert.equal(template.productionReadiness.dpoLegal.scopeSha256, scopeSha256);
  assert.equal(template.productionReadiness.dpoLegal.status, "approved");
  assert.equal(template.productionReadiness.dpoLegal.approvedAt, "2026-09-05T19:13:23.900Z");
  assert.match(privacyNotice, /Marcelo Diaz/);
  assert.match(privacyNotice, /<strong>Resend<\/strong>/);
  assert.match(privacyNotice, /até 365 dias/);
  assert.match(privacyNotice, /até 730 dias/);
});

test("CSP is enforced only on production targets and contains the audited browser origins", async () => {
  const env = {
    CF_PAGES_COMMIT_SHA: sha,
    CF_PAGES_BRANCH: "main",
    ASSETS: { fetch: async () => new Response("unexpected", { status: 500 }) },
  };
  const preview = await worker.fetch(
    new Request("https://ev2-g12-preflight.gaiatec-website.pages.dev/healthz"),
    env,
  );
  const staging = await worker.fetch(
    new Request("https://ev2-g16-csp.gaiatec-cms-staging.pages.dev/healthz"),
    env,
  );
  const stagingEnforcementCanary = await worker.fetch(
    new Request("https://ev2-g16-csp-canary.gaiatec-cms-staging.pages.dev/healthz"),
    { ...env, CF_PAGES_BRANCH: "ev2-g16-csp-canary" },
  );
  const enforced = preview.headers.get("content-security-policy") ?? "";
  const reportOnly = staging.headers.get("content-security-policy-report-only") ?? "";
  assert.equal(enforced, CONTENT_SECURITY_POLICY);
  assert.equal(preview.headers.has("content-security-policy-report-only"), false);
  assert.equal(reportOnly, CONTENT_SECURITY_POLICY);
  assert.equal(staging.headers.has("content-security-policy"), false);
  assert.equal(stagingEnforcementCanary.headers.get("content-security-policy"), CONTENT_SECURITY_POLICY);
  assert.equal(stagingEnforcementCanary.headers.has("content-security-policy-report-only"), false);
  for (const origin of ["https://brasilapi.com.br", "https://nominatim.openstreetmap.org"])
    assert.match(enforced, new RegExp(origin.replaceAll(".", "\\.")));
  assert.doesNotMatch(enforced, /api\.resend\.com/);
});

test("production and canary workflows retain evidence and stay behind their boundaries", async () => {
  const [backup, email, deploy, cspCanary] = await Promise.all([
    read(".github/workflows/backup-supabase-production.yml"),
    read(".github/workflows/verify-production-email.yml"),
    read(".github/workflows/deploy-production.yml"),
    read(".github/workflows/preview-ev2-phase16.yml"),
  ]);
  assert.match(backup, /environment: production-backup/);
  assert.match(backup, /--symmetric --cipher-algo AES256/);
  assert.match(backup, /supabase start/);
  assert.match(backup, /prepare-role-restore\.mjs/);
  assert.match(backup, /roles\.restore\.sql/);
  assert.doesNotMatch(backup, /ON_ERROR_STOP=0/);
  assert.match(backup, /diff -u/);
  assert.match(backup, /path: \$\{\{ steps\.backup\.outputs\.artifact_dir \}\}/);
  assert.doesNotMatch(backup, /path:.*plain_dir/);
  assert.match(email, /VERIFY-RESEND-PRODUCTION:\{0\}/);
  assert.match(email, /environment: production/);
  assert.match(deploy, /AUTORIZO-G12-PRODUCAO:\{0\}/);
  assert.match(deploy, /CANDIDATE_SHA: \$\{\{ inputs\.candidate_sha \}\}/);
  assert.match(cspCanary, /for attempt in 1 2/);
  assert.match(cspCanary, /EV2_G12_CSP_MODE: enforce/);
  assert.match(cspCanary, /--project-name gaiatec-cms-staging/);
  assert.doesNotMatch(cspCanary, /--project-name gaiatec-website/);
});
