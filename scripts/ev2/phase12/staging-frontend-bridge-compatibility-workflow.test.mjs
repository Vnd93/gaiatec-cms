import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateStagingFrontendBridgeEvidence } from "./staging-frontend-bridge-lib.mjs";

const candidateSha = "a".repeat(40);
const baselineSha = "b".repeat(40);
const controlSha = "c".repeat(40);

function nodeHeredocs(workflow) {
  return [...workflow.matchAll(/^\s*node <<'NODE'\r?\n([\s\S]*?)^\s*NODE\s*$/gm)].map((match) => match[1]);
}

function deploymentId(index) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function identity(index, release, commitMessage) {
  return {
    deploymentId: deploymentId(index),
    release,
    createdOn: `2026-09-08T1${index}:00:00.000Z`,
    commitMessage,
  };
}

function headless(origin, deploymentOrigin, expectedDeploymentId, binding) {
  return {
    mode: "headless-fail-closed",
    contract: "legacy-f48",
    origin,
    deploymentOrigin,
    deploymentIdentitySha256: createHash("sha256").update(expectedDeploymentId).digest("hex"),
    fixtureBindingSha256: binding,
    reportSha256: "2".repeat(64),
    cleanupSha256: "3".repeat(64),
    residueSha256: "4".repeat(64),
    pageRendered: true,
    campaignRendered: true,
    formRendered: true,
    turnstileWidgetRequested: true,
    turnstileNetworkFailureObserved: true,
    submitDisabledWithoutToken: true,
    unavailableFeedbackVisible: true,
    backendMutationRequests: 0,
    cleanupStatus: "cleaned",
    residueStatus: "passed",
    auditRetained: true,
  };
}

function compatibilityScope() {
  return {
    mode: "compatibility-only",
    backendContract: "legacy-f48",
    tested: [
      "legacy-content-read",
      "page-campaign-form-render",
      "turnstile-widget-request",
      "fail-closed-without-token",
      "zero-lead-post",
    ],
    notTested: ["positive-form-submission", "lead-persistence", "full-candidate-backend"],
  };
}

function evidence() {
  return {
    schemaVersion: 3,
    event: "g12.staging.frontend_bridge.promoted",
    repository: "Vnd93/gaiatec-cms",
    workflow: {
      name: "Promote staging frontend bridge",
      path: ".github/workflows/promote-staging-frontend-bridge.yml",
      runId: "7654321",
      runAttempt: 2,
      controlSha,
    },
    candidateSha,
    baseline: identity(1, baselineSha, "previous-release"),
    preview: identity(2, candidateSha, "g12-staging-bridge-preview-run-7654321-2"),
    canonical: identity(3, candidateSha, "g12-staging-bridge-run-7654321-2"),
    dist: { archiveSha256: "7".repeat(64), treeSha256: "8".repeat(64) },
    probes: { previewSha256: "9".repeat(64), canonicalSha256: "a".repeat(64) },
    headlessCanaries: {
      preview: headless(
        "https://ev2-g12-canary.gaiatec-cms-staging.pages.dev",
        "https://12345678.gaiatec-cms-staging.pages.dev",
        deploymentId(2),
        "5".repeat(64),
      ),
      canonical: headless(
        "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev",
        "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev",
        deploymentId(3),
        "6".repeat(64),
      ),
    },
    compatibilityScope: compatibilityScope(),
    positiveBrowserRequiredAfterFullCandidateDeploy: true,
    backendMutation: "fixture-only-cleaned",
    rollbackReady: true,
  };
}

test("staging bridge evidence proves compatibility only and preserves the later positive-browser gate", () => {
  assert.deepEqual(
    validateStagingFrontendBridgeEvidence(evidence(), {
      candidateSha,
      runId: "7654321",
      runAttempt: 2,
      controlSha,
    }),
    { valid: true, violations: [] },
  );

  const falseMutationClaim = evidence();
  falseMutationClaim.backendMutation = "none";
  assert.ok(
    validateStagingFrontendBridgeEvidence(falseMutationClaim).violations.includes("backend_mutation_invalid"),
  );
  const supersededSchema = { ...evidence(), schemaVersion: 2 };
  assert.ok(validateStagingFrontendBridgeEvidence(supersededSchema).violations.includes("schema_invalid"));
  const falseApproval = evidence();
  falseApproval.positiveBrowserRequiredAfterFullCandidateDeploy = false;
  assert.ok(
    validateStagingFrontendBridgeEvidence(falseApproval).violations.includes(
      "positive_browser_requirement_invalid",
    ),
  );
  const overstatedScope = evidence();
  overstatedScope.compatibilityScope.notTested = ["full-candidate-backend"];
  assert.ok(
    validateStagingFrontendBridgeEvidence(overstatedScope).violations.includes("compatibility_scope_invalid"),
  );
  const mutatingHeadless = evidence();
  mutatingHeadless.headlessCanaries.canonical.backendMutationRequests = 1;
  assert.ok(validateStagingFrontendBridgeEvidence(mutatingHeadless).violations.includes("headless_invalid"));
});

test("staging bridge rejects cross-substituted preview and canonical headless summaries", () => {
  assert.ok(
    validateStagingFrontendBridgeEvidence(evidence(), {
      candidateSha,
      runId: "7654321",
      runAttempt: 3,
      controlSha,
    }).violations.includes("workflow_invalid"),
  );

  const substitutedIdentity = evidence();
  substitutedIdentity.headlessCanaries.preview.deploymentIdentitySha256 =
    substitutedIdentity.headlessCanaries.canonical.deploymentIdentitySha256;
  assert.ok(
    validateStagingFrontendBridgeEvidence(substitutedIdentity).violations.includes("headless_invalid"),
  );

  const substitutedSummaries = evidence();
  [substitutedSummaries.headlessCanaries.preview, substitutedSummaries.headlessCanaries.canonical] = [
    substitutedSummaries.headlessCanaries.canonical,
    substitutedSummaries.headlessCanaries.preview,
  ];
  assert.ok(
    validateStagingFrontendBridgeEvidence(substitutedSummaries).violations.includes("headless_invalid"),
  );
});

test("promotion requires headless fail-closed cleanup while full staging owns positive submission", async () => {
  const workflow = await readFile(".github/workflows/promote-staging-frontend-bridge.yml", "utf8");
  const watchdog = await readFile(".github/workflows/promote-staging-frontend-bridge-watchdog.yml", "utf8");
  const deployStaging = await readFile(".github/workflows/deploy-staging.yml", "utf8");
  const promoteProduction = await readFile(
    ".github/workflows/promote-production-frontend-bridge.yml",
    "utf8",
  );
  const stagingWriter = await readFile(
    "scripts/ev2/phase12/write-staging-frontend-bridge-evidence.mjs",
    "utf8",
  );
  const stagingVerifier = await readFile(
    "scripts/ev2/phase12/verify-staging-frontend-bridge-evidence.mjs",
    "utf8",
  );
  const productionWriter = await readFile(
    "scripts/ev2/phase12/write-production-frontend-bridge-evidence.mjs",
    "utf8",
  );
  const setup = workflow.indexOf("Setup isolated public bridge render fixture on old backend");
  const headless = workflow.indexOf("Headless-prove preview render and fail-closed Turnstile boundary");
  const cleanup = workflow.indexOf("Cleanup isolated preview fixture");
  const residue = workflow.indexOf("Prove isolated preview fixture residue is zero");
  const promote = workflow.indexOf("Promote exact A to canonical staging alias with CAS");
  assert.ok(setup >= 0 && setup < headless && headless < cleanup);
  assert.ok(cleanup < residue && residue < promote);
  assert.match(workflow, /steps\.preview_headless\.outcome == 'success'/);
  assert.match(workflow, /steps\.preview_cleanup\.outcome == 'success'/);
  assert.match(workflow, /steps\.preview_residue\.outcome == 'success'/);
  assert.match(
    workflow,
    /staging-pages-state\.mjs compensate[\s\S]*--wrangler-script \.\.\/baseline\/node_modules\/wrangler\/bin\/wrangler\.js/,
  );
  assert.match(workflow, /PREVIEW_DEPLOYMENT_ORIGIN: \$\{\{ steps\.preview\.outputs\.deployment-url \}\}/);
  assert.match(
    workflow,
    /CANONICAL_DEPLOYMENT_ORIGIN: https:\/\/ev2-g17-canary\.gaiatec-cms-staging\.pages\.dev/,
  );
  for (const obsolete of [
    ["preview", "browser", "gate"].join("_"),
    ["preview", "browser", "gate"].join("-"),
    ["cms-public-bridge", "real", "browser", "gate.mjs"].join("-"),
  ]) {
    assert.equal(workflow.includes(obsolete), false);
  }
  assert.doesNotMatch(workflow, /official-staging-widget-token/);
  assert.doesNotMatch(workflow, /QA_CMS_BRIDGE_SUPABASE_ANON_KEY/);

  assert.match(watchdog, /github\.event\.workflow_run\.conclusion != 'success'/);
  assert.doesNotMatch(watchdog, /\["cancelled", "failure", "timed_out"\]/);
  assert.match(watchdog, /recovery-state-store\.mjs get\s+--allow-missing/);
  assert.match(watchdog, /VARIABLE_STATE_PRESENT:.*state_present/);
  assert.match(watchdog, /Prove whether the immutable recovery artifact exists/);
  assert.match(watchdog, /artifact_present=false/);
  assert.match(watchdog, /recovery_required=false/);
  assert.match(watchdog, /variablePresent && artifactAbsent/);
  assert.match(watchdog, /G12_STAGING_BRIDGE_WATCHDOG_ARTIFACT_MISSING_WITH_STATE/);
  assert.doesNotMatch(watchdog, /pre-mutation-state-only/);
  assert.match(watchdog, /"no-state-no-mutation"/);
  assert.match(watchdog, /QA_CMS_BRIDGE_INSTANCE: preview/);
  assert.match(watchdog, /cms-public-bridge-fixture\.mjs recover/);
  const watchdogPrograms = nodeHeredocs(watchdog);
  assert.ok(watchdogPrograms.length >= 3);
  for (const [index, program] of watchdogPrograms.entries()) {
    const parsed = spawnSync(process.execPath, ["--check"], { input: program, encoding: "utf8" });
    assert.equal(parsed.status, 0, `watchdog inline Node ${index + 1}: ${parsed.stderr}`);
  }

  assert.match(stagingWriter, /schemaVersion: 3/);
  assert.match(stagingWriter, /const headlessCanaries = \{\}/);
  assert.match(stagingWriter, /process\.env\.PREVIEW_DEPLOYMENT_ORIGIN/);
  assert.match(stagingWriter, /process\.env\.CANONICAL_DEPLOYMENT_ORIGIN/);
  assert.match(stagingWriter, /process\.env\.PREVIEW_DEPLOYMENT_ID/);
  assert.match(stagingWriter, /process\.env\.CANONICAL_DEPLOYMENT_ID/);
  assert.match(stagingWriter, /runAttempt: process\.env\.GITHUB_RUN_ATTEMPT/);
  assert.match(stagingWriter, /\n {2}headlessCanaries,/);
  assert.match(stagingWriter, /mode: "compatibility-only"/);
  assert.match(stagingWriter, /positiveBrowserRequiredAfterFullCandidateDeploy: true/);
  assert.match(stagingWriter, /backendMutation: "fixture-only-cleaned"/);
  assert.doesNotMatch(stagingWriter, /leadPersisted|consentPersisted|historyPersisted|outboxPersisted/);
  assert.match(stagingVerifier, /compatibility_only=true/);
  assert.match(stagingVerifier, /positive_browser_required_after_full_candidate_deploy=true/);
  assert.match(stagingVerifier, /runAttempt: process\.env\.EXPECTED_RUN_ATTEMPT/);
  assert.match(
    deployStaging,
    /EXPECTED_RUN_ATTEMPT: \$\{\{ steps\.frontend_bridge_run\.outputs\.run_attempt \}\}/,
  );
  assert.match(
    promoteProduction,
    /EXPECTED_RUN_ATTEMPT: \$\{\{ steps\.staging_bridge_run\.outputs\.run_attempt \}\}/,
  );
  assert.match(
    promoteProduction,
    /STAGING_BRIDGE_RUN_ATTEMPT: \$\{\{ steps\.staging_bridge_run\.outputs\.run_attempt \}\}/,
  );
  assert.match(
    promoteProduction,
    /PREVIEW_DEPLOYMENT_ORIGIN: \$\{\{ steps\.preview\.outputs\.deployment-url \}\}/,
  );
  assert.match(promoteProduction, /EXPECTED_RUN_ATTEMPT: \$\{\{ github\.run_attempt \}\}/);

  const compatibilityEvidence = deployStaging.indexOf(
    "Verify compatibility-only staging bridge evidence for this exact SHA",
  );
  const backendDeploy = deployStaging.indexOf(
    "Deploy the complete exact-candidate Edge Function inventory to staging",
  );
  const candidateDeploy = deployStaging.indexOf("Deploy the immutable staging candidate");
  const positiveCycle = deployStaging.indexOf(
    "Run the complete authenticated mutating editorial cycle first",
  );
  assert.ok(
    compatibilityEvidence >= 0 &&
      compatibilityEvidence < backendDeploy &&
      backendDeploy < candidateDeploy &&
      candidateDeploy < positiveCycle,
  );
  const positiveBlock = deployStaging.slice(
    positiveCycle,
    deployStaging.indexOf("Clear the single-use staging browser rendezvous variables"),
  );
  assert.match(positiveBlock, /run-real-browser-attestation-consumer\.mjs/);
  assert.match(
    positiveBlock,
    /PLAYWRIGHT_BASE_URL: https:\/\/ev2-g17-canary\.gaiatec-cms-staging\.pages\.dev/,
  );
  assert.match(positiveBlock, /env -u RELEASE_GUARD_TOKEN -u EVIDENCE_SALT npx playwright/);

  const finalizerNode = deployStaging.indexOf(
    "Use the repository-pinned Node runtime for staging finalization",
  );
  const finalizerCleanup = deployStaging.indexOf(
    "Finalize both single-use staging browser rendezvous variables",
  );
  const finalizerState = deployStaging.indexOf(
    "Download mandatory pre-mutation state by immutable artifact ID",
  );
  const terminalFailure = deployStaging.indexOf(
    "Fail closed when staging did not finish in the required canonical state",
  );
  assert.ok(finalizerNode >= 0 && finalizerNode < finalizerCleanup && finalizerCleanup < finalizerState);
  const cleanupBlock = deployStaging.slice(finalizerCleanup, finalizerState);
  assert.match(cleanupBlock, /id: real_browser_rendezvous_cleanup/);
  assert.match(cleanupBlock, /if: always\(\)/);
  assert.match(cleanupBlock, /continue-on-error: true/);
  assert.equal(cleanupBlock.match(/\|\| cleanup_status=1/g)?.length, 2);
  assert.match(cleanupBlock, /exit "\$cleanup_status"/);
  assert.match(
    deployStaging.slice(terminalFailure),
    /steps\.real_browser_rendezvous_cleanup\.outcome == 'failure'/,
  );

  assert.match(productionWriter, /schemaVersion: 5/);
  assert.match(productionWriter, /runAttempt: process\.env\.STAGING_BRIDGE_RUN_ATTEMPT/);
  assert.match(productionWriter, /process\.env\.PREVIEW_DEPLOYMENT_ORIGIN/);
  assert.match(productionWriter, /"https:\/\/gaiatecsistemas\.com\.br"/);
  assert.match(productionWriter, /origin: expectedOrigin/);
  assert.match(productionWriter, /canonicalHeadless:/);
  assert.match(productionWriter, /positiveBrowserGate: "deferred-to-full-candidate-deploy"/);
  assert.match(productionWriter, /positiveBrowserHomologationClaimed: false/);
});

test("the legacy public backend is swapped in under an exclusive lease and always restored", async () => {
  const workflow = await readFile(".github/workflows/promote-staging-frontend-bridge.yml", "utf8");

  // The legacy contract is pinned to the release production actually serves; it is never an input.
  assert.match(workflow, /LEGACY_PUBLIC_BACKEND_SHA: f48bb4530566456a0090a98cd39caf1cacb51b09/);
  assert.match(workflow, /ref: f48bb4530566456a0090a98cd39caf1cacb51b09, fetch-depth: 0, path: legacy/);
  assert.match(workflow, /git merge-base --is-ancestor "\$LEGACY_PUBLIC_BACKEND_SHA"/);
  assert.match(workflow, /test "\$\(git -C \.\.\/legacy rev-parse HEAD\)" = "\$LEGACY_PUBLIC_BACKEND_SHA"/);

  const prepare = workflow.indexOf("Plan the temporary legacy public backend swap without mutating anything");
  const lease = workflow.indexOf("Take the exclusive legacy backend lease before any swap");
  const engage = workflow.indexOf("Swap staging to the legacy public backend under the held lease");
  const previewFixture = workflow.indexOf("Setup isolated public bridge render fixture on old backend");
  const canonicalHeadless = workflow.indexOf(
    "Headless-prove canonical render and fail-closed Turnstile boundary",
  );
  const restore = workflow.indexOf("Restore the candidate public backend in every outcome");
  const canonicalCleanup = workflow.indexOf("Cleanup canonical fixture");
  const release = workflow.indexOf("Release the legacy backend lease only after a proven restore");

  // Nothing mutates before the lease is held, and no fixture runs before the swap is proven.
  assert.ok(prepare >= 0 && prepare < lease && lease < engage && engage < previewFixture);
  // The restore has to happen while the canonical fixture form still exists, so public-v2 can be proven.
  assert.ok(canonicalHeadless < restore && restore < canonicalCleanup && canonicalCleanup < release);

  assert.match(workflow, /cms-public-legacy-bridge\.mjs prepare/);
  assert.match(workflow, /cms-public-legacy-bridge\.mjs engage/);
  assert.match(workflow, /cms-public-legacy-bridge\.mjs restore/);
  assert.match(workflow, /recovery-state-store\.mjs put --kind staging-cms-public-legacy/);
  assert.match(workflow, /recovery-state-store\.mjs clear --kind staging-cms-public-legacy/);
  assert.match(workflow, /steps\.legacy_prepare\.outcome == 'success'/);
  assert.match(workflow, /steps\.legacy_lease\.outcome == 'success'/);
  assert.match(workflow, /always\(\) && steps\.legacy_engage\.outcome == 'success'/);
  assert.match(
    workflow,
    /REQUIRE_CONTRACT_PROBE: \$\{\{ steps\.canonical_fixture\.outcome == 'success' \}\}/,
  );
  assert.match(workflow, /--probe-state outputs\/staging-bridge-canonical-state\.json/);

  // A run that engaged the legacy backend and did not restore it must fail, and the lease is only
  // released once the restore itself succeeded.
  assert.match(workflow, /The legacy public backend stayed engaged on staging\./);
  assert.match(workflow, /if \[ "\$LEGACY_ENGAGE" = success \] && \[ "\$LEGACY_RESTORE" != success \]; then/);
  assert.match(
    workflow,
    /always\(\) && steps\.legacy_lease\.outcome == 'success' &&\s*\n\s*steps\.legacy_restore\.outcome == 'success'/,
  );

  // The swap is a staging-only operation: the production project must never appear in it.
  const legacySection = workflow.slice(prepare, canonicalCleanup);
  assert.equal(legacySection.includes("chfuhctnhqgyjowkvllv"), false);
  assert.equal(legacySection.includes("gaiatecsistemas.com.br"), false);
  assert.match(legacySection, /QA_CMS_LEGACY_BRIDGE_ENVIRONMENT: staging/);
});

test("bridge probes sample enough to make p95 a percentile instead of the maximum", async () => {
  const workflow = await readFile(".github/workflows/promote-staging-frontend-bridge.yml", "utf8");
  const guard = await readFile("scripts/ev2/phase12/release-guard-lib.mjs", "utf8");

  // percentile() returns sorted[ceil(0.95 * n) - 1], so at n=5 the reported p95 is the slowest of the
  // five samples and a single cold response decides the gate. Production already samples 20.
  const counts = [...workflow.matchAll(/EV2_G12_SAMPLE_COUNT: "(\d+)"/g)].map((match) => Number(match[1]));
  assert.ok(counts.length >= 3);
  for (const count of counts)
    assert.ok(count >= 20, `sample count ${count} is below the 20 used in production`);

  // The latency budget itself must stay where it is; only the sample size was corrected.
  assert.match(guard, /publicP95Ms: 1500/);
  assert.doesNotMatch(workflow, /EV2_G12_(?:PUBLIC_P95|BUDGET)/);
});

test("only the probes aimed at a freshly deployed target wait for it to converge", async () => {
  const workflow = await readFile(".github/workflows/promote-staging-frontend-bridge.yml", "utf8");

  // The preview and canonical probes measure a deployment that is seconds old, so they are allowed to
  // wait for the alias to converge. The baseline probe measures an alias that has been live for a long
  // time and keeps the default window, so a genuinely unavailable baseline still fails fast.
  const readiness = [...workflow.matchAll(/EV2_G12_READINESS_ATTEMPTS: "(\d+)"/g)];
  assert.equal(readiness.length, 2);
  for (const [, attempts] of readiness) assert.ok(Number(attempts) <= 20);
  const baseline = workflow.indexOf("Prove live alias is the expected old-backend baseline");
  const previewDeploy = workflow.indexOf("Deploy sealed A to isolated staging preview branch");
  assert.ok(baseline < previewDeploy);
  assert.ok(workflow.indexOf("EV2_G12_READINESS_ATTEMPTS") > previewDeploy);

  // Waiting longer must not become a way to assert less: budget, sampling and gate stay untouched.
  const guard = await readFile("scripts/ev2/phase12/release-guard-lib.mjs", "utf8");
  assert.match(guard, /publicP95Ms: 1500/);
  assert.match(guard, /availabilityPercent: 99\.9/);
  for (const [, count] of workflow.matchAll(/EV2_G12_SAMPLE_COUNT: "(\d+)"/g)) assert.ok(Number(count) >= 20);
});

test("the staging deploy and its watchdog measure percentiles, not maxima", async () => {
  const deployStaging = await readFile(".github/workflows/deploy-staging.yml", "utf8");
  const watchdog = await readFile(".github/workflows/deploy-staging-watchdog.yml", "utf8");
  const guard = await readFile("scripts/ev2/phase12/release-guard-lib.mjs", "utf8");

  // Same defect the bridge had: percentile() at n=5 returns the slowest of five samples, so one cold
  // response decides a gate. Every probe in both workflows samples at production size.
  for (const workflow of [deployStaging, watchdog]) {
    const counts = [...workflow.matchAll(/EV2_G12_SAMPLE_COUNT: "(\d+)"/g)].map((m) => Number(m[1]));
    assert.ok(counts.length > 0);
    for (const count of counts) assert.ok(count >= 20, `sample count ${count} still reports a maximum`);
  }

  // The waits are only for targets these workflows just deployed or restored. The baseline and the
  // terminal probes keep the default window so a genuinely broken alias still fails fast.
  assert.equal([...deployStaging.matchAll(/EV2_G12_READINESS_ATTEMPTS/g)].length, 2);
  assert.equal([...watchdog.matchAll(/EV2_G12_READINESS_ATTEMPTS/g)].length, 1);
  const baseline = deployStaging.indexOf("../g12-staging-live-baseline.json");
  const terminal = deployStaging.indexOf("../g12-staging-terminal-probe.json");
  for (const probe of [baseline, terminal]) {
    const block = deployStaging.slice(probe, probe + 400);
    assert.doesNotMatch(block, /EV2_G12_READINESS_ATTEMPTS/);
  }

  // Waiting longer and sampling more must not become a way to assert less.
  assert.match(guard, /publicP95Ms: 1500/);
  assert.match(guard, /availabilityPercent: 99\.9/);
  assert.match(guard, /http5xxRatePercent: 0\.1/);
});

test("a lost bridge runner cannot leave the legacy public backend live on staging", async () => {
  const watchdog = await readFile(".github/workflows/promote-staging-frontend-bridge-watchdog.yml", "utf8");

  // The legacy restore owns its own job so it cannot be skipped by the frontend compensation path.
  assert.match(watchdog, /^ {2}restore-legacy-public-backend:$/m);
  assert.match(
    watchdog,
    /recovery-state-store\.mjs get\s+--allow-missing\s+--kind staging-cms-public-legacy/,
  );
  assert.match(watchdog, /cms-public-legacy-bridge\.mjs restore/);
  assert.match(watchdog, /recovery-state-store\.mjs clear\s+--kind staging-cms-public-legacy/);

  const job = watchdog.slice(watchdog.indexOf("  restore-legacy-public-backend:"));
  // The candidate release is taken from the sealed lease, never from the event payload.
  assert.match(job, /ref: \$\{\{ steps\.legacy_plan\.outputs\.candidate_sha \}\}/);
  assert.match(job, /G12_STAGING_LEGACY_WATCHDOG_TARGET_REFUSED/);
  assert.match(job, /G12_STAGING_LEGACY_WATCHDOG_RELEASE_REFUSED/);
  assert.match(job, /steps\.legacy_state\.outputs\.state_present == 'true'/);
  // A held lease must end restored, and the lease is only released after that restore succeeded.
  assert.match(job, /if \[ "\$STATE_PRESENT" = true \]; then test "\$RESTORE" = success; exit 0; fi/);
  assert.match(job, /test "\$RESTORE" = skipped/);
  assert.match(job, /if: steps\.legacy_restore\.outcome == 'success'/);
  assert.equal(job.includes("chfuhctnhqgyjowkvllv"), false);

  const programs = nodeHeredocs(watchdog);
  for (const [index, program] of programs.entries()) {
    const parsed = spawnSync(process.execPath, ["--check"], { input: program, encoding: "utf8" });
    assert.equal(parsed.status, 0, `watchdog inline Node ${index + 1}: ${parsed.stderr}`);
  }
});
