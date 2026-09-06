import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";
import worker from "../../../cloudflare/_worker.js";
import {
  evaluateCodeOwners,
  evaluateGithubControls,
  evaluateProbeWindow,
  evaluateRolloutAdvance,
  evaluateRolloutWindow,
  validateApprovalRecord,
  validateCanaryEvidenceBinding,
  validateHealthContract,
  validateProductionConfig,
  validateReleaseManifest,
} from "./release-guard-lib.mjs";

const read = (path) => readFile(path, "utf8");
const sha = "a".repeat(40);

function rolloutWindow(offsetMinutes = 0) {
  const startedAt = new Date(Date.UTC(2026, 8, 4, 10, offsetMinutes));
  const endedAt = new Date(startedAt.getTime() + 5 * 60_000);
  return {
    candidateSha: sha,
    environment: "staging",
    stage: "staging-canary",
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    sampleCount: 20,
    availabilityPercent: 100,
    http5xxRatePercent: 0,
    publicP95Ms: 500,
    releaseHeadersExact: true,
    healthContractValid: true,
    manifestReleaseExact: true,
    routeBudgetsValid: true,
    nonProductionNoindexValid: true,
    p0Count: 0,
    p1Count: 0,
    securityIncidentCount: 0,
    projectionDivergenceCount: 0,
    accessibilityCriticalCount: 0,
    accessibilitySeriousCount: 0,
    securityReviewStatus: "passed",
    privacyReviewStatus: "passed",
    projectionComparisonStatus: "passed",
    restoreStatus: "passed",
    adminReadP95Ms: 400,
    commandP95Ms: 650,
    outboxLagP95Ms: 0,
  };
}

function approvedRecord() {
  return {
    schemaVersion: 2,
    gate: "G12",
    decision: "approved",
    candidateSha: sha,
    environment: "production",
    requestedBy: "Vnd93",
    changeReference: "CHG-EV2-12",
    g11EvidenceRunId: "7466a0d3-021f-4c60-ad82-61e76b93844f",
    g12Evidence: {
      file: `docs/ev2/fase-12/evidencias/G12_CANARY_${sha}.json`,
      canaryRunId: "12345678-1234-4234-9234-123456789abc",
      candidateSha: sha,
      reportSha256: "c".repeat(64),
      healthyWindowIds: [
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
        "33333333-3333-4333-8333-333333333333",
      ],
      syntheticOnly: true,
      realDataUsed: false,
      productionMutations: 0,
    },
    productionAuthorized: true,
    productionAuthorizationText: `AUTORIZO-G12-PRODUCAO:${sha}`,
    productionAuthorizationSha: sha,
    productionAuthorizedBy: "Vnd93",
    productionAuthorizedAt: "2026-09-04T09:05:00.000Z",
    target: {
      cloudflareProject: "gaiatec-website",
      domains: ["gaiatecsistemas.com.br", "www.gaiatecsistemas.com.br"],
    },
    changeWindow: {
      startsAt: "2026-09-04T09:00:00.000Z",
      endsAt: "2026-09-04T12:00:00.000Z",
    },
    rollback: {
      deploymentId: "ff2dbb65-2f8b-4840-a9a1-f2fde29e8ebf",
      release: "b".repeat(40),
    },
    productionReadiness: {
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
        verifiedAt: "2026-09-04T08:30:00.000Z",
      },
      backupRestore: {
        status: "passed",
        projectRef: "chfuhctnhqgyjowkvllv",
        externalTarget: "github-actions-encrypted-artifact",
        encryptedArchiveSha256: "d".repeat(64),
        backupRunId: "backup-run-123",
        restoreDrillRunId: "restore-run-123",
        rpoMinutes: 1440,
        rtoMinutes: 30,
        evidenceReference: "actions/backup-restore-123",
        completedAt: "2026-09-04T08:35:00.000Z",
      },
      dpoLegal: {
        status: "approved",
        approverId: "Vnd93",
        scopeSha256: "e".repeat(64),
        evidenceReference: "legal/DPO-EV2-12",
        approvedAt: "2026-09-04T08:40:00.000Z",
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
        verifiedAt: "2026-09-04T08:45:00.000Z",
      },
      csp: {
        status: "passed",
        mode: "enforce",
        candidateSha: sha,
        policySha256: "f".repeat(64),
        criticalViolations: 0,
        evidenceReference: "actions/csp-123",
        verifiedAt: "2026-09-04T08:50:00.000Z",
      },
    },
    operationalGovernance: {
      mode: "sole-operator",
      responsibleId: "Vnd93",
      riskAccepted: true,
      acceptedAt: "2026-09-04T08:55:00.000Z",
      evidenceReference: "docs/ev2/fase-16/REGISTRO_DECLARACAO_GOVERNANCA_DPO_RISCO_2026-09-05.md",
    },
    owners: {
      changeOwner: {
        id: "Vnd93",
        approvedAt: "2026-09-04T09:01:00.000Z",
        evidenceReference: "approval/Vnd93/change",
      },
      technicalReviewer: {
        id: "Vnd93",
        approvedAt: "2026-09-04T09:02:00.000Z",
        evidenceReference: "approval/Vnd93/technical",
      },
      securityPrivacyOwner: {
        id: "Vnd93",
        approvedAt: "2026-09-04T09:03:00.000Z",
        evidenceReference: "approval/Vnd93/security-privacy",
      },
      businessOwner: {
        id: "Vnd93",
        approvedAt: "2026-09-04T09:04:00.000Z",
        evidenceReference: "approval/Vnd93/business",
      },
    },
  };
}

function boundCanaryEvidence(record) {
  return {
    schemaVersion: 1,
    outcome: "G12_CANARY_PASS",
    suiteKey: "g12-staging-integrated-reduced-v2",
    environment: "staging",
    canaryRunId: record.g12Evidence.canaryRunId,
    candidateSha: record.candidateSha,
    candidateOrigin: "https://ev2-g12-canary.gaiatec-cms-staging.pages.dev",
    stableOrigin: "https://gaiatec-cms-staging.pages.dev",
    g11AssuranceRunId: record.g11EvidenceRunId,
    inheritedG11Checks: 27,
    inheritedG11Passed: 27,
    p0Count: 0,
    p1Count: 0,
    securityStatus: "passed",
    restoreStatus: "passed",
    stablePromoted: false,
    syntheticOnly: true,
    realDataUsed: false,
    productionMutations: 0,
    syntheticResidue: {
      activeActors: 0,
      activeCredentials: 0,
      activeOverrides: 0,
      personalLeadPayloads: 0,
      retainedSyntheticActors: 2,
      retainedAnonymizedLeads: 1,
    },
    healthyWindows: record.g12Evidence.healthyWindowIds.map((id, index) => {
      const routeMetrics = Object.fromEntries(
        ["/", "/produtos", "/contato", "/admin/login"].map((route) => [
          route,
          { samples: 5, availabilityPercent: 100, p50Ms: 250, p95Ms: 500, maxMs: 500 },
        ]),
      );
      const probe = {
        schemaVersion: 1,
        event: "g12.rollout.probe",
        origin: "https://ev2-g12-canary.gaiatec-cms-staging.pages.dev",
        candidateSha: record.candidateSha,
        environment: "staging",
        measuredResponses: 22,
        sampleCount: 22,
        availabilityPercent: 100,
        http5xxRatePercent: 0,
        publicP95Ms: 500,
        requestTimeoutMs: 10_000,
        routeMetrics,
        routeBudgetsValid: true,
        releaseHeadersExact: true,
        healthContractValid: true,
        manifestReleaseExact: true,
        nonProductionNoindexValid: true,
        outcome: "pass",
        violations: [],
      };
      return {
        id,
        startedAt: new Date(Date.UTC(2026, 8, 4, 10, index * 5)).toISOString(),
        endedAt: new Date(Date.UTC(2026, 8, 4, 10, index * 5 + 5)).toISOString(),
        outcome: probe.outcome,
        measuredResponses: probe.measuredResponses,
        availabilityPercent: probe.availabilityPercent,
        http5xxRatePercent: probe.http5xxRatePercent,
        publicP95Ms: probe.publicP95Ms,
        evidenceHash: createHash("sha256").update(JSON.stringify(probe)).digest("hex"),
        probe,
      };
    }),
  };
}

test("health endpoint exposes only immutable, non-cacheable release state", async () => {
  const env = {
    CF_PAGES_COMMIT_SHA: sha,
    CF_PAGES_BRANCH: "ev2-g12-canary",
    ASSETS: { fetch: async () => new Response("unexpected", { status: 500 }) },
  };
  const staging = await worker.fetch(
    new Request("https://ev2-g12-canary.gaiatec-cms-staging.pages.dev/healthz"),
    env,
  );
  assert.equal(staging.status, 200);
  assert.equal(staging.headers.get("x-release"), sha);
  assert.match(staging.headers.get("cache-control") ?? "", /no-store/);
  assert.match(staging.headers.get("x-robots-tag") ?? "", /noindex/);
  assert.deepEqual(await staging.json(), {
    schemaVersion: 1,
    status: "ready",
    release: sha,
    environment: "staging",
  });

  const production = await worker.fetch(new Request("https://gaiatecsistemas.com.br/healthz"), {
    ...env,
    CF_PAGES_BRANCH: "main",
  });
  assert.equal(production.status, 200);
  assert.equal((await production.json()).environment, "production");
  assert.equal(production.headers.has("x-robots-tag"), false);

  const unknown = await worker.fetch(new Request("https://untrusted.example/healthz"), env);
  assert.equal(unknown.status, 503);
  assert.equal((await unknown.json()).status, "degraded");
});

test("probe and full rollout budgets fail closed", () => {
  const healthy = rolloutWindow();
  assert.equal(evaluateProbeWindow(healthy).healthy, true);
  assert.equal(evaluateRolloutWindow(healthy).decision, "continue");
  assert.equal(evaluateRolloutWindow({ ...healthy, p0Count: 1 }).decision, "pause");
  assert.equal(evaluateRolloutWindow({ ...healthy, securityReviewStatus: "pending" }).healthy, false);
  assert.equal(evaluateProbeWindow({ ...healthy, candidateSha: "a" }).healthy, false);
  assert.equal(evaluateProbeWindow({ ...healthy, routeBudgetsValid: false }).healthy, false);
});

test("health and release manifests reject HTML, incomplete entries and mismatched releases", () => {
  const manifest = {
    schemaVersion: 1,
    release: sha,
    files: [{ path: "index.html", bytes: 123, sha256: "f".repeat(64) }],
  };
  assert.equal(validateReleaseManifest(manifest, { expectedRelease: sha }).valid, true);
  assert.match(
    validateReleaseManifest({ ...manifest, files: [] }, { expectedRelease: sha }).violations.join(","),
    /manifest_files_invalid/,
  );
  assert.match(
    validateReleaseManifest(
      { ...manifest, release: "b".repeat(40) },
      { expectedRelease: sha },
    ).violations.join(","),
    /manifest_release_mismatch/,
  );
  assert.equal(
    validateHealthContract(
      { schemaVersion: 1, status: "ready", release: sha, environment: "staging" },
      { expectedRelease: sha, expectedEnvironment: "staging" },
    ).valid,
    true,
  );
  assert.match(validateHealthContract("<!doctype html>").violations.join(","), /health_schema_invalid/);
});

test("rollout needs three consecutive healthy windows and cannot skip a stage", () => {
  const windows = [rolloutWindow(0), rolloutWindow(10), rolloutWindow(20)];
  assert.equal(
    evaluateRolloutAdvance({
      candidateSha: sha,
      currentStage: "staging-canary",
      nextStage: "production-shell",
      windows,
    }).allowed,
    true,
  );
  assert.equal(
    evaluateRolloutAdvance({
      candidateSha: sha,
      currentStage: "staging-canary",
      nextStage: "production-5",
      windows,
    }).decision,
    "pause",
  );
  assert.equal(
    evaluateRolloutAdvance({
      candidateSha: sha,
      currentStage: "staging-canary",
      nextStage: "production-shell",
      windows: windows.slice(0, 2),
    }).allowed,
    false,
  );
});

test("G12 approval requires an exact candidate, live window and the declared sole operator", () => {
  const record = approvedRecord();
  assert.equal(
    validateApprovalRecord(record, {
      expectedSha: sha,
      expectedEnvironment: "production",
      expectedChangeReference: "CHG-EV2-12",
      now: "2026-09-04T10:00:00.000Z",
    }).valid,
    true,
  );
  const foreignOwner = structuredClone(record);
  foreignOwner.owners.technicalReviewer.id = "another-user";
  assert.match(
    validateApprovalRecord(foreignOwner).violations.join(","),
    /technicalReviewer_must_match_sole_operator/,
  );
  const unacceptedRisk = structuredClone(record);
  unacceptedRisk.operationalGovernance.riskAccepted = false;
  assert.match(
    validateApprovalRecord(unacceptedRisk).violations.join(","),
    /sole_operator_risk_not_accepted/,
  );
  assert.match(
    validateApprovalRecord({ ...record, productionAuthorized: false }).violations.join(","),
    /production_not_authorized/,
  );
  assert.match(
    validateApprovalRecord({ ...record, productionAuthorizationSha: "b".repeat(40) }).violations.join(","),
    /production_authorization_sha_mismatch/,
  );
  assert.match(
    validateApprovalRecord({
      ...record,
      productionAuthorizationText: `AUTORIZO-G12-PRODUCAO:${"b".repeat(40)}`,
    }).violations.join(","),
    /production_authorization_text_invalid/,
  );
});

test("G12 approval is cryptographically and semantically bound to its canary report", () => {
  const record = approvedRecord();
  const evidence = boundCanaryEvidence(record);
  assert.equal(
    validateCanaryEvidenceBinding(record, evidence, { reportSha256: record.g12Evidence.reportSha256 }).valid,
    true,
  );
  assert.match(
    validateCanaryEvidenceBinding(
      record,
      { ...evidence, candidateSha: "b".repeat(40) },
      {
        reportSha256: record.g12Evidence.reportSha256,
      },
    ).violations.join(","),
    /g12_report_candidate_mismatch/,
  );
  assert.match(
    validateCanaryEvidenceBinding(record, evidence, { reportSha256: "e".repeat(64) }).violations.join(","),
    /g12_evidence_digest_mismatch/,
  );
  const forgedWindow = structuredClone(evidence);
  forgedWindow.healthyWindows[1].outcome = "pause";
  assert.match(
    validateCanaryEvidenceBinding(record, forgedWindow, {
      reportSha256: record.g12Evidence.reportSha256,
    }).violations.join(","),
    /g12_window_invalid/,
  );
  const tamperedProbe = structuredClone(evidence);
  tamperedProbe.healthyWindows[0].probe.publicP95Ms = 501;
  assert.match(
    validateCanaryEvidenceBinding(record, tamperedProbe, {
      reportSha256: record.g12Evidence.reportSha256,
    }).violations.join(","),
    /g12_window_probe_hash_mismatch|g12_window_summary_mismatch/,
  );
  const forgedProbe = structuredClone(evidence);
  forgedProbe.healthyWindows[0].probe.healthContractValid = false;
  forgedProbe.healthyWindows[0].evidenceHash = createHash("sha256")
    .update(JSON.stringify(forgedProbe.healthyWindows[0].probe))
    .digest("hex");
  assert.match(
    validateCanaryEvidenceBinding(record, forgedProbe, {
      reportSha256: record.g12Evidence.reportSha256,
    }).violations.join(","),
    /g12_window_probe_invalid/,
  );
  const reboundProbe = structuredClone(evidence);
  reboundProbe.healthyWindows[0].probe.candidateSha = "b".repeat(40);
  reboundProbe.healthyWindows[0].evidenceHash = createHash("sha256")
    .update(JSON.stringify(reboundProbe.healthyWindows[0].probe))
    .digest("hex");
  assert.match(
    validateCanaryEvidenceBinding(record, reboundProbe, {
      reportSha256: record.g12Evidence.reportSha256,
    }).violations.join(","),
    /g12_window_probe_binding_mismatch/,
  );
});

test("production configuration refuses staging and solo GitHub controls remain strict", () => {
  assert.equal(
    validateProductionConfig({
      supabaseProjectRef: "chfuhctnhqgyjowkvllv",
      supabaseUrl: "https://chfuhctnhqgyjowkvllv.supabase.co/",
      supabaseAnonKey: "sb_publishable_example_key_with_safe_length",
      siteOrigin: "https://gaiatecsistemas.com.br",
      cloudflareProject: "gaiatec-website",
    }).valid,
    true,
  );
  assert.match(
    validateProductionConfig({
      supabaseProjectRef: "glcqsosxwgmlhzgcsnzv",
      supabaseUrl: "https://glcqsosxwgmlhzgcsnzv.supabase.co/",
      supabaseAnonKey: "sb_publishable_example_key_with_safe_length",
      siteOrigin: "https://gaiatecsistemas.com.br",
      cloudflareProject: "gaiatec-website",
    }).violations.join(","),
    /staging_project_ref_forbidden/,
  );
  const controlInput = {
    environment: {
      protection_rules: [],
      deployment_branch_policy: { protected_branches: true, custom_branch_policies: false },
    },
    branchProtection: {
      required_pull_request_reviews: {
        required_approving_review_count: 0,
        require_code_owner_reviews: false,
        require_last_push_approval: false,
        bypass_pull_request_allowances: { users: [], teams: [], apps: [] },
      },
      enforce_admins: { enabled: true },
      required_status_checks: { strict: true, contexts: ["quality", "database", "browser"] },
      allow_force_pushes: { enabled: false },
      allow_deletions: { enabled: false },
      required_conversation_resolution: { enabled: true },
      required_linear_history: { enabled: true },
    },
    codeOwners: ["* @Vnd93", "/.github/workflows/** @Vnd93", "/docs/ev2/fase-12/approvals/** @Vnd93"].join(
      "\n",
    ),
    pullRequest: {
      merged_at: "2026-09-04T08:00:00.000Z",
      base: { ref: "main" },
      user: { login: "Vnd93" },
    },
    checkRuns: [
      { id: 1, name: "quality", status: "completed", conclusion: "success" },
      { id: 2, name: "database", status: "completed", conclusion: "success" },
      { id: 3, name: "browser", status: "completed", conclusion: "success" },
    ],
  };
  const controls = evaluateGithubControls(controlInput);
  assert.equal(controls.valid, true);
  assert.equal(evaluateGithubControls({ environment: {}, branchProtection: {} }).valid, false);
  const failedCheck = structuredClone(controlInput);
  failedCheck.checkRuns[0].conclusion = "failure";
  assert.match(evaluateGithubControls(failedCheck).violations.join(","), /actual_check_quality/);
  const wrongMaintainer = structuredClone(controlInput);
  wrongMaintainer.pullRequest.user.login = "another-user";
  assert.match(evaluateGithubControls(wrongMaintainer).violations.join(","), /candidate_pull_request/);
  assert.deepEqual(
    evaluateCodeOwners(
      [
        "* @Vnd93 @another-user",
        "/.github/workflows-backup/** @Vnd93",
        "/docs/ev2/fase-12/approvals-old/** @Vnd93",
      ].join("\n"),
    ).violations,
    [
      "global_vnd93_codeowner_required",
      "workflow_vnd93_codeowner_required",
      "approval_record_vnd93_codeowner_required",
    ],
  );
});

test("G12 boundary evals contain no false acceptance or remote mutation", () => {
  const result = spawnSync(process.execPath, ["scripts/ev2/phase12/run-evals.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.outcome, "G12_RULES_PASS");
  assert.equal(report.scenarios, 18);
  assert.equal(report.falseAcceptances, 0);
  assert.equal(report.productionMutations, 0);
  assert.equal(report.realDataUsed, false);
});

test("release workflows and reduced canary are immutable, staged and production fail-closed", async () => {
  const [
    ci,
    preview,
    production,
    rollback,
    githubGuard,
    cloudflare,
    canary,
    g11Canary,
    stableBaseline,
    verifier,
    template,
  ] = await Promise.all([
    read(".github/workflows/ci.yml"),
    read(".github/workflows/preview-ev2-phase12.yml"),
    read(".github/workflows/deploy-production.yml"),
    read(".github/workflows/rollback-production.yml"),
    read("scripts/ev2/phase12/check-github-controls.mjs"),
    read("scripts/ev2/phase12/cloudflare-pages.mjs"),
    read("scripts/ev2/phase12/staging-canary.mjs"),
    read("scripts/ev2/phase11/staging-canary.mjs"),
    read("scripts/ev2/phase11/stable-baseline-lib.mjs"),
    read("scripts/ev2/phase12/verify-approval.mjs"),
    read("docs/ev2/fase-12/G12_APPROVAL.template.json"),
  ]);
  assert.match(ci, /branches: \[main, Remodelagem, "ev2\/\*\*"\]/);
  assert.match(ci, /version: 2\.116\.0/);
  assert.match(preview, /CANARY-G12-STAGING/);
  assert.match(preview, /gaiatec-cms-staging --branch ev2-g12-canary/);
  assert.doesNotMatch(preview, /project-name gaiatec-website/);
  assert.match(production, /AUTORIZO-G12-PRODUCAO/);
  assert.match(production, /git -C control merge-base --is-ancestor/);
  assert.match(production, /check-github-controls\.mjs/);
  assert.match(production, /secrets\.RELEASE_GUARD_TOKEN/);
  assert.doesNotMatch(production, /secrets\.GITHUB_RELEASE_GUARD_TOKEN/);
  assert.match(production, /validate-production-config\.mjs/);
  assert.match(production, /ev2-g12-preflight/);
  assert.match(production, /Confirm live baseline equals the approved rollback target/);
  assert.match(production, /Automatically restore the approved prior production deployment/);
  assert.ok(production.indexOf("ev2-g12-preflight") < production.indexOf("--branch main"));
  assert.doesNotMatch(production, /VITE_EV2_[A-Z0-9_]+: ["']true["']/);
  const deployJobPreamble = production.slice(
    production.indexOf("  deploy:"),
    production.indexOf("    steps:"),
  );
  assert.doesNotMatch(deployJobPreamble, /secrets\.|CLOUDFLARE_|PRODUCTION_SUPABASE_/);
  const candidateValidation = production.slice(
    production.indexOf("Install and validate exact candidate"),
    production.indexOf("Build production shell"),
  );
  assert.doesNotMatch(candidateValidation, /secrets\.|CLOUDFLARE_|PRODUCTION_SUPABASE_/);
  assert.doesNotMatch(production, /workingDirectory: candidate/);
  assert.match(
    production,
    /working-directory: control\r?\n\s+run: node scripts\/ev2\/phase12\/rollout-probe\.mjs/,
  );
  assert.match(rollback, /ROLLBACK-G12-PRODUCTION/);
  assert.match(rollback, /CANDIDATE_SHA: \$\{\{ inputs\.expected_release \}\}/);
  assert.match(githubGuard, /\/actions\/runs\?head_sha=/);
  assert.match(githubGuard, /\/actions\/runs\/\$\{run\.id\}\/jobs/);
  assert.doesNotMatch(githubGuard, /\/check-runs/);
  const rollbackJobPreamble = rollback.slice(rollback.indexOf("  rollback:"), rollback.indexOf("    steps:"));
  assert.doesNotMatch(rollbackJobPreamble, /secrets\.|CLOUDFLARE_/);
  assert.doesNotMatch(rollback, /npm ci|actions\/setup-node/);
  assert.match(cloudflare, /target\?\.environment !== "production"/);
  assert.match(cloudflare, /deployments\/\$\{deploymentId\}\/rollback/);
  assert.match(canary, /g12-staging-integrated-reduced-v2/);
  assert.match(canary, /probe,/);
  assert.match(canary, /scripts\/ev2\/phase11\/staging-canary\.mjs/);
  assert.match(canary, /for \(let index = 0; index < 3; index \+= 1\)/);
  assert.match(canary, /syntheticOnly: true/);
  assert.match(canary, /productionMutations: 0/);
  assert.match(g11Canary, /EV2_G11_CANDIDATE_ORIGIN/);
  assert.match(g11Canary, /validateReleaseManifest/);
  assert.match(g11Canary, /resolveStableBaseline/);
  assert.match(stableBaseline, /stable_release_contract_mismatch/);
  assert.match(stableBaseline, /legacy-root-fingerprint/);
  assert.match(verifier, /createHash\("sha256"\)/);
  assert.match(verifier, /validateCanaryEvidenceBinding/);
  const approvalTemplate = JSON.parse(template);
  assert.equal(approvalTemplate.decision, "pending");
  assert.equal(approvalTemplate.productionAuthorized, false);
  assert.equal(approvalTemplate.schemaVersion, 2);
  assert.equal(approvalTemplate.productionAuthorizationSha, null);
  assert.equal(approvalTemplate.productionReadiness.dpoLegal.status, "approved");
  assert.equal(approvalTemplate.productionReadiness.dpoLegal.approverId, "Vnd93");
  assert.match(approvalTemplate.productionReadiness.dpoLegal.scopeSha256, /^[a-f0-9]{64}$/);
  assert.equal(approvalTemplate.productionReadiness.githubProtection.governanceMode, "sole-maintainer");
  assert.equal(approvalTemplate.productionReadiness.githubProtection.maintainerLogin, "Vnd93");
  assert.equal(approvalTemplate.productionReadiness.githubProtection.requiredPullRequestApprovals, 0);
  assert.equal(approvalTemplate.operationalGovernance.mode, "sole-operator");
  assert.equal(approvalTemplate.operationalGovernance.responsibleId, "Vnd93");
  assert.equal(approvalTemplate.operationalGovernance.riskAccepted, true);
  assert.equal(approvalTemplate.candidateSha, null);
  assert.equal(approvalTemplate.g12Evidence.file, null);
});

test("phase documentation preserves blockers and does not claim G12", async () => {
  const [readme, gate, infrastructure, rollout, runbook, training] = await Promise.all([
    read("docs/ev2/fase-12/README.md"),
    read("docs/ev2/fase-12/GATE_G12.md"),
    read("docs/ev2/fase-12/PRE_REQUISITOS_INFRAESTRUTURA.md"),
    read("docs/ev2/fase-12/MATRIZ_ROLLOUT.md"),
    read("docs/ev2/fase-12/RUNBOOK_GO_LIVE_E_ROLLBACK.md"),
    read("docs/ev2/fase-12/TREINAMENTO_E_HANDOVER.md"),
  ]);
  assert.match(readme, /G12 não aprovado/);
  assert.match(readme, /produção.*bloqueada/i);
  assert.match(gate, /NÃO APROVADO/);
  assert.match(infrastructure, /ambiente (GitHub )?`production`/i);
  assert.match(infrastructure, /Supabase de produção/);
  assert.match(rollout, /três janelas consecutivas/i);
  assert.match(runbook, /automaticamente a API de rollback/i);
  assert.match(training, /único responsável humano/i);
});
