import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateStagingFrontendBridgeEvidence } from "./staging-frontend-bridge-lib.mjs";

const candidateSha = "a".repeat(40);
const baselineSha = "b".repeat(40);
const controlSha = "c".repeat(40);
const sourceRunId = "7654000";
const sourceRunAttempt = 3;
const gateRunAttempt = 5;
const sourceArtifactId = "24680";
const sourceArtifactDigest = `sha256:${"d".repeat(64)}`;
const sourceProfileSha256 = "e".repeat(64);
const releaseProfile = "full-release";
const matrixSha256 = "1".repeat(64);
const policySha256 = "2".repeat(64);
const sourceArtifactName = `staging-frontend-${candidateSha}-${sourceRunId}-${sourceRunAttempt}`;

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
    schemaVersion: 5,
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
    promotionMode: "forward",
    baseline: identity(1, baselineSha, "previous-release"),
    preview: identity(2, candidateSha, "g12-staging-bridge-preview-run-7654321-2"),
    canonical: identity(3, candidateSha, "g12-staging-bridge-run-7654321-2"),
    artifact: {
      sourceRunId,
      sourceRunAttempt,
      gateRunAttempt,
      artifactId: sourceArtifactId,
      artifactDigest: sourceArtifactDigest,
      artifactName: sourceArtifactName,
      environment: "staging",
      releaseProfile,
      matrixSha256,
      policySha256,
      profileSha256: sourceProfileSha256,
    },
    dist: {
      archiveSha256: "7".repeat(64),
      treeSha256: "8".repeat(64),
      archiveBytes: 4096,
      fileCount: 12,
      byteCount: 2048,
    },
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
      sourceRunId,
      sourceRunAttempt,
      gateRunAttempt,
      artifactId: sourceArtifactId,
      artifactDigest: sourceArtifactDigest,
      artifactName: sourceArtifactName,
      artifactEnvironment: "staging",
      releaseProfile,
      matrixSha256,
      policySha256,
      profileSha256: sourceProfileSha256,
      archiveSha256: "7".repeat(64),
      treeSha256: "8".repeat(64),
      archiveBytes: 4096,
      fileCount: 12,
      byteCount: 2048,
    }),
    { valid: true, violations: [] },
  );

  const falseMutationClaim = evidence();
  falseMutationClaim.backendMutation = "none";
  assert.ok(
    validateStagingFrontendBridgeEvidence(falseMutationClaim).violations.includes("backend_mutation_invalid"),
  );
  const supersededSchema = { ...evidence(), schemaVersion: 4 };
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

test("staging bridge evidence binds every source artifact and dist field", () => {
  const expected = {
    sourceRunId,
    sourceRunAttempt,
    gateRunAttempt,
    artifactId: sourceArtifactId,
    artifactDigest: sourceArtifactDigest,
    artifactName: sourceArtifactName,
    artifactEnvironment: "staging",
    releaseProfile,
    matrixSha256,
    policySha256,
    profileSha256: sourceProfileSha256,
    archiveSha256: "7".repeat(64),
    treeSha256: "8".repeat(64),
    archiveBytes: 4096,
    fileCount: 12,
    byteCount: 2048,
  };
  const artifactMutations = {
    sourceRunId: "7654001",
    sourceRunAttempt: 4,
    gateRunAttempt: 6,
    artifactId: "24681",
    artifactDigest: `sha256:${"f".repeat(64)}`,
    artifactName: `${sourceArtifactName}-substituted`,
    environment: "production",
    releaseProfile: "frontend-only",
    matrixSha256: "3".repeat(64),
    policySha256: "4".repeat(64),
    profileSha256: "f".repeat(64),
  };
  for (const [field, mutation] of Object.entries(artifactMutations)) {
    const changed = evidence();
    changed.artifact[field] = mutation;
    assert.ok(
      validateStagingFrontendBridgeEvidence(changed, expected).violations.includes("artifact_invalid"),
      `artifact.${field} mutation was accepted`,
    );
  }
  const distMutations = {
    archiveSha256: "6".repeat(64),
    treeSha256: "5".repeat(64),
    archiveBytes: 4097,
    fileCount: 13,
    byteCount: 2049,
  };
  for (const [field, mutation] of Object.entries(distMutations)) {
    const changed = evidence();
    changed.dist[field] = mutation;
    assert.ok(
      validateStagingFrontendBridgeEvidence(changed, expected).violations.includes("dist_invalid"),
      `dist.${field} mutation was accepted`,
    );
  }
  const artifactExtra = evidence();
  artifactExtra.artifact.extra = true;
  assert.ok(validateStagingFrontendBridgeEvidence(artifactExtra).violations.includes("artifact_invalid"));
  const distExtra = evidence();
  distExtra.dist.extra = true;
  assert.ok(validateStagingFrontendBridgeEvidence(distExtra).violations.includes("dist_invalid"));

  const prefixedDistDigests = evidence();
  prefixedDistDigests.dist.archiveSha256 = `sha256:${prefixedDistDigests.dist.archiveSha256}`;
  prefixedDistDigests.dist.treeSha256 = `sha256:${prefixedDistDigests.dist.treeSha256}`;
  assert.deepEqual(validateStagingFrontendBridgeEvidence(prefixedDistDigests), {
    valid: true,
    violations: [],
  });
});

test("staging bridge verifier optionally binds and exports every v5 artifact identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "g12-staging-bridge-v5-"));
  try {
    const evidenceFile = join(root, "evidence.json");
    const githubOutput = join(root, "github-output.txt");
    await writeFile(evidenceFile, `${JSON.stringify(evidence())}\n`, "utf8");
    const expectedEnvironment = {
      ...process.env,
      GITHUB_OUTPUT: githubOutput,
      EXPECTED_RELEASE: candidateSha,
      EXPECTED_RUN_ID: "7654321",
      EXPECTED_RUN_ATTEMPT: "2",
      EXPECTED_CONTROL_SHA: controlSha,
      EXPECTED_SOURCE_RUN_ID: sourceRunId,
      EXPECTED_SOURCE_RUN_ATTEMPT: String(sourceRunAttempt),
      EXPECTED_GATE_RUN_ATTEMPT: String(gateRunAttempt),
      EXPECTED_ARTIFACT_ID: sourceArtifactId,
      EXPECTED_ARTIFACT_DIGEST: sourceArtifactDigest,
      EXPECTED_ARTIFACT_NAME: sourceArtifactName,
      EXPECTED_ARTIFACT_ENVIRONMENT: "staging",
      EXPECTED_RELEASE_PROFILE: releaseProfile,
      EXPECTED_MATRIX_SHA256: matrixSha256,
      EXPECTED_POLICY_SHA256: policySha256,
      EXPECTED_PROFILE_SHA256: sourceProfileSha256,
      EXPECTED_ARCHIVE_SHA256: "7".repeat(64),
      EXPECTED_TREE_SHA256: "8".repeat(64),
      EXPECTED_ARCHIVE_BYTES: "4096",
      EXPECTED_FILE_COUNT: "12",
      EXPECTED_BYTE_COUNT: "2048",
    };
    const verified = spawnSync(
      process.execPath,
      ["scripts/ev2/phase12/verify-staging-frontend-bridge-evidence.mjs", "--file", evidenceFile],
      { cwd: process.cwd(), env: expectedEnvironment, encoding: "utf8" },
    );
    assert.equal(verified.status, 0, verified.stderr);
    const outputs = await readFile(githubOutput, "utf8");
    const expectedOutputs = {
      source_run_id: sourceRunId,
      source_run_attempt: String(sourceRunAttempt),
      gate_run_attempt: String(gateRunAttempt),
      artifact_id: sourceArtifactId,
      artifact_digest: sourceArtifactDigest,
      artifact_name: sourceArtifactName,
      artifact_environment: "staging",
      release_profile: releaseProfile,
      matrix_sha256: matrixSha256,
      policy_sha256: policySha256,
      profile_sha256: sourceProfileSha256,
      archive_sha256: "7".repeat(64),
      tree_sha256: "8".repeat(64),
      archive_bytes: "4096",
      file_count: "12",
      byte_count: "2048",
    };
    for (const [name, value] of Object.entries(expectedOutputs))
      assert.match(outputs, new RegExp(`^${name}=${value}$`, "m"));

    const optionalExpected = spawnSync(
      process.execPath,
      ["scripts/ev2/phase12/verify-staging-frontend-bridge-evidence.mjs", "--file", evidenceFile],
      { cwd: process.cwd(), env: { ...process.env }, encoding: "utf8" },
    );
    assert.equal(optionalExpected.status, 0, optionalExpected.stderr);

    const mismatched = spawnSync(
      process.execPath,
      ["scripts/ev2/phase12/verify-staging-frontend-bridge-evidence.mjs", "--file", evidenceFile],
      {
        cwd: process.cwd(),
        env: { ...expectedEnvironment, GITHUB_OUTPUT: "", EXPECTED_ARTIFACT_ID: "24681" },
        encoding: "utf8",
      },
    );
    assert.notEqual(mismatched.status, 0);
    assert.match(mismatched.stderr, /G12_STAGING_FRONTEND_BRIDGE_EVIDENCE_REFUSED:artifact_invalid/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("same-release bridge rebind is explicit and cannot be confused with a forward promotion", () => {
  const rebound = evidence();
  rebound.promotionMode = "same-release-rebind";
  rebound.baseline = identity(1, candidateSha, "g12-staging-deploy-compensation-7000000-1");
  assert.deepEqual(validateStagingFrontendBridgeEvidence(rebound), { valid: true, violations: [] });

  const hiddenRebind = { ...rebound, promotionMode: "forward" };
  assert.ok(
    validateStagingFrontendBridgeEvidence(hiddenRebind).violations.includes("promotion_mode_invalid"),
  );
  const falseRebind = evidence();
  falseRebind.promotionMode = "same-release-rebind";
  assert.ok(validateStagingFrontendBridgeEvidence(falseRebind).violations.includes("promotion_mode_invalid"));
  const externalSameRelease = {
    ...rebound,
    baseline: { ...rebound.baseline, commitMessage: "external" },
  };
  assert.ok(
    validateStagingFrontendBridgeEvidence(externalSameRelease).violations.includes(
      "baseline_provenance_invalid",
    ),
  );
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
    /staging-pages-state\.mjs compensate[\s\S]*--dist "\$RUNNER_TEMP\/g12-staging-bridge-recovery-pre-mutation\/dist"[\s\S]*--seal "\$RUNNER_TEMP\/g12-staging-bridge-recovery-pre-mutation\/outputs\/staging-baseline-dist-seal\.json"[\s\S]*--wrangler-script \.\.\/candidate\/node_modules\/wrangler\/bin\/wrangler\.js/,
  );
  const recoveryUpload = workflow.indexOf(
    "Upload mandatory exact bridge recovery bytes before state or mutation",
  );
  const recoveryState = workflow.indexOf(
    "Bind durable staging bridge recovery state to immutable baseline bytes",
  );
  const recoveryStateUpload = workflow.indexOf(
    "Upload immutable bridge recovery state after binding exact baseline identity",
  );
  const recoveryStateDownload = workflow.indexOf(
    "Download just-uploaded bridge recovery state by immutable artifact ID",
  );
  const recoveryDownload = workflow.indexOf(
    "Download just-uploaded exact bridge recovery bytes by immutable artifact ID",
  );
  const recoveryVerification = workflow.indexOf(
    "Reverify remote bridge state and exact recovery bytes before mutation",
  );
  const hmacState = workflow.indexOf("Persist redundant HMAC bridge state only after remote recovery proof");
  assert.ok(
    recoveryUpload >= 0 &&
      recoveryUpload < recoveryState &&
      recoveryState < recoveryStateUpload &&
      recoveryStateUpload < recoveryStateDownload &&
      recoveryStateDownload < recoveryDownload &&
      recoveryDownload < recoveryVerification &&
      recoveryVerification < hmacState &&
      hmacState < workflow.indexOf("Deploy sealed A to isolated staging preview branch"),
  );
  assert.match(workflow, /RECOVERY_ARTIFACT_ID: \$\{\{ steps\.recovery_upload\.outputs\.artifact-id \}\}/);
  assert.match(
    workflow,
    /RECOVERY_ARTIFACT_DIGEST: \$\{\{ steps\.recovery_upload\.outputs\.artifact-digest \}\}/,
  );
  assert.match(workflow, /artifact-ids: \$\{\{ steps\.recovery_state_upload\.outputs\.artifact-id \}\}/);
  assert.match(workflow, /artifact-ids: \$\{\{ steps\.recovery_upload\.outputs\.artifact-id \}\}/);
  assert.match(workflow, /steps\.durable_recovery_remote\.outcome == 'success'/);
  assert.match(workflow, /steps\.hmac_state\.outcome == 'success'/);
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
  assert.match(watchdog, /Inventory exact immutable recovery state and baseline artifacts/);
  assert.match(watchdog, /artifact_present=\$\{stateArtifactPresent\}/);
  assert.match(watchdog, /recovery_required=false/);
  assert.match(watchdog, /if \(variableAbsent\) \{[\s\S]*recovery_required=false[\s\S]*process\.exit\(0\)/);
  assert.match(watchdog, /variablePresent && \(!stateArtifactPresent \|\| !recoveryArtifactPresent\)/);
  assert.match(watchdog, /G12_STAGING_BRIDGE_WATCHDOG_ARTIFACT_MISSING_WITH_STATE/);
  assert.match(watchdog, /G12_STAGING_BRIDGE_WATCHDOG_ARTIFACT_DOWNLOAD_REFUSED/);
  assert.match(watchdog, /Reverify exact immutable recovery bytes before any watchdog mutation/);
  assert.match(watchdog, /steps\.watchdog_recovery_bytes\.outcome == 'success'/);
  assert.match(watchdog, /artifact-ids: \$\{\{ steps\.recovery_inventory\.outputs\.state_id \}\}/);
  assert.match(watchdog, /artifact-ids: \$\{\{ steps\.recovery_inventory\.outputs\.recovery_id \}\}/);
  assert.doesNotMatch(watchdog, /name: staging-frontend-bridge-recovery-/);
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
  const bridgePrograms = nodeHeredocs(workflow);
  assert.ok(bridgePrograms.length >= 2);
  for (const [index, program] of bridgePrograms.entries()) {
    const parsed = spawnSync(process.execPath, ["--check"], { input: program, encoding: "utf8" });
    assert.equal(parsed.status, 0, `bridge inline Node ${index + 1}: ${parsed.stderr}`);
  }

  assert.match(stagingWriter, /schemaVersion: 5/);
  assert.match(stagingWriter, /promotionMode,/);
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
  assert.match(stagingWriter, /sourceRunId: process\.env\.SOURCE_RUN_ID \?\? ""/);
  assert.match(stagingWriter, /sourceRunAttempt: Number\(process\.env\.SOURCE_RUN_ATTEMPT\)/);
  assert.match(stagingWriter, /artifactId: process\.env\.SOURCE_ARTIFACT_ID \?\? ""/);
  assert.match(stagingWriter, /artifactDigest: process\.env\.SOURCE_ARTIFACT_DIGEST \?\? ""/);
  assert.match(stagingWriter, /artifactName: process\.env\.SOURCE_ARTIFACT_NAME \?\? ""/);
  assert.match(stagingWriter, /profileSha256: process\.env\.SOURCE_PROFILE_SHA256 \?\? ""/);
  for (const field of ["archiveBytes", "fileCount", "byteCount"])
    assert.match(stagingWriter, new RegExp(`${field}: seal\\.${field}`));
  assert.doesNotMatch(stagingWriter, /leadPersisted|consentPersisted|historyPersisted|outboxPersisted/);
  assert.match(stagingVerifier, /compatibility_only=true/);
  assert.match(stagingVerifier, /promotion_mode=\$\{evidence\.promotionMode\}/);
  assert.match(stagingVerifier, /positive_browser_required_after_full_candidate_deploy=true/);
  assert.match(stagingVerifier, /runAttempt: process\.env\.EXPECTED_RUN_ATTEMPT/);
  for (const output of [
    "source_run_id",
    "source_run_attempt",
    "artifact_id",
    "artifact_digest",
    "artifact_name",
    "artifact_environment",
    "profile_sha256",
    "archive_sha256",
    "tree_sha256",
    "archive_bytes",
    "file_count",
    "byte_count",
  ])
    assert.match(stagingVerifier, new RegExp("`" + output + "=\\$\\{"));
  assert.match(
    deployStaging,
    /EXPECTED_RUN_ATTEMPT: \$\{\{ steps\.frontend_bridge_run\.outputs\.run_attempt \}\}/,
  );
  assert.match(workflow, /same_release_rebind:/);
  assert.match(workflow, /true\) test "\$CANDIDATE_SHA" = "\$BASELINE_SHA"/);
  assert.match(workflow, /false\) test "\$CANDIDATE_SHA" != "\$BASELINE_SHA"/);
  assert.match(workflow, /PROMOTION_MODE: \$\{\{ inputs\.same_release_rebind/);
  assert.match(workflow, /G12_STAGING_BRIDGE_REBIND_PROVENANCE_REFUSED/);
  assert.match(
    workflow,
    /CANDIDATE_SHA="\$CONTROL_SHA" node scripts\/ev2\/phase12\/check-github-controls\.mjs/,
  );
  assert.match(
    watchdog,
    /state\.candidateRelease === state\.original\.release &&[\s\S]*!compensationMarker\.test/,
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
  const retainedBridge = deployStaging.indexOf(
    "Prove the exact bridge deployment remains canonical after backend mutation",
  );
  const positiveCycle = deployStaging.indexOf(
    "Run the complete authenticated mutating editorial cycle first",
  );
  assert.ok(
    compatibilityEvidence >= 0 &&
      compatibilityEvidence < backendDeploy &&
      backendDeploy < retainedBridge &&
      retainedBridge < positiveCycle,
  );
  assert.equal(deployStaging.includes("Deploy the immutable staging candidate"), false);
  assert.doesNotMatch(deployStaging, /pages deploy dist[^\n]*--branch ev2-g17-canary/);
  assert.match(
    deployStaging.slice(retainedBridge, positiveCycle),
    /staging-pages-state\.mjs assert-original/,
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
    /steps\.real_browser_rendezvous_cleanup\.outcome != 'success'/,
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

test("bridge and full staging bind one CI package and retain the bridge deployment", async () => {
  const bridge = await readFile(".github/workflows/promote-staging-frontend-bridge.yml", "utf8");
  const deploy = await readFile(".github/workflows/deploy-staging.yml", "utf8");

  assert.match(bridge, /source_ci_run_id:[\s\S]{0,180}required: true/);
  assert.match(bridge, /gate_ci_run_attempt:[\s\S]{0,180}required: true/);
  assert.match(bridge, /source_ci_run_attempt:[\s\S]{0,180}required: true/);
  assert.match(bridge, /test "\$SOURCE_CI_RUN_ATTEMPT" -le "\$GATE_CI_RUN_ATTEMPT"/);
  const selectionResolve = bridge.slice(
    bridge.indexOf("Resolve the current green CI attempt selection by immutable artifact ID"),
    bridge.indexOf("Resolve the only deployable staging package from exact CI producer"),
  );
  assert.match(selectionResolve, /resolve-ci-staging-frontend-selection\.mjs/);
  assert.match(selectionResolve, /GATE_CI_RUN_ATTEMPT: \$\{\{ inputs\.gate_ci_run_attempt \}\}/);
  assert.match(selectionResolve, /--gate-run-attempt "\$GATE_CI_RUN_ATTEMPT"/);
  assert.match(
    selectionResolve,
    /artifact-ids: \$\{\{ steps\.candidate_selection_artifact\.outputs\.selection_artifact_id \}\}/,
  );
  assert.match(selectionResolve, /verify-ci-staging-frontend-selection\.mjs/);
  assert.match(
    selectionResolve,
    /artifact-ids: \$\{\{ steps\.candidate_selection_artifact\.outputs\.release_plan_artifact_id \}\}/,
  );
  assert.match(
    selectionResolve,
    /--control-selector "\$RUNNER_TEMP\/g12-ci-release-plan\/release-control-selector\.mjs"/,
  );
  assert.match(
    selectionResolve,
    /--control-library "\$RUNNER_TEMP\/g12-ci-release-plan\/release-control-library\.mjs"/,
  );
  assert.match(
    selectionResolve,
    /--control-matrix "\$RUNNER_TEMP\/g12-ci-release-plan\/release-gate-matrix\.json"/,
  );
  assert.match(
    selectionResolve,
    /--candidate-matrix \.\.\/candidate\/\.github\/release-controls\/release-gate-matrix\.json/,
  );
  assert.match(
    selectionResolve,
    /--control-checkpoint-policy "\$RUNNER_TEMP\/g12-ci-release-plan\/release-checkpoint-policy\.json"/,
  );
  assert.match(selectionResolve, /--release-plan "\$RUNNER_TEMP\/g12-ci-release-plan\/release-plan\.json"/);
  assert.match(selectionResolve, /SOURCE_CI_RUN_ATTEMPT: \$\{\{ inputs\.source_ci_run_attempt \}\}/);
  assert.match(selectionResolve, /--source-run-attempt "\$SOURCE_CI_RUN_ATTEMPT"/);
  const bridgeResolve = bridge.slice(
    bridge.indexOf("Resolve the only deployable staging package from exact CI producer"),
    bridge.indexOf("Download the exact CI-sealed staging package"),
  );
  assert.match(bridgeResolve, /resolve-ci-staging-frontend-artifact\.mjs/);
  assert.match(
    bridgeResolve,
    /SOURCE_CI_RUN_ID: \$\{\{ steps\.candidate_selection\.outputs\.source_run_id \}\}/,
  );
  assert.match(
    bridgeResolve,
    /SOURCE_CI_RUN_ATTEMPT: \$\{\{ steps\.candidate_selection\.outputs\.source_run_attempt \}\}/,
  );
  assert.match(
    bridgeResolve,
    /GATE_CI_RUN_ATTEMPT: \$\{\{ steps\.candidate_selection\.outputs\.gate_run_attempt \}\}/,
  );
  assert.match(bridgeResolve, /CANDIDATE_SHA: \$\{\{ inputs\.candidate_sha \}\}/);
  assert.match(bridgeResolve, /--run-id "\$SOURCE_CI_RUN_ID"/);
  assert.match(bridgeResolve, /--run-attempt "\$SOURCE_CI_RUN_ATTEMPT"/);
  assert.match(bridgeResolve, /--gate-run-attempt "\$GATE_CI_RUN_ATTEMPT"/);
  assert.match(bridgeResolve, /--sha "\$CANDIDATE_SHA"/);
  const bridgeDownload = bridge.slice(
    bridge.indexOf("Download the exact CI-sealed staging package"),
    bridge.indexOf("Materialize and verify the exact CI-sealed staging frontend bytes"),
  );
  assert.match(bridgeDownload, /artifact-ids: \$\{\{ steps\.candidate_source\.outputs\.artifact_id \}\}/);
  assert.match(bridgeDownload, /run-id: \$\{\{ steps\.candidate_source\.outputs\.source_run_id \}\}/);
  assert.match(bridgeDownload, /digest-mismatch: error/);
  assert.match(bridgeDownload, /verify-staging-release-package\.mjs/);
  assert.match(bridgeDownload, /--package "\$RUNNER_TEMP\/g12-staging-release-package"/);
  assert.match(
    bridgeDownload,
    /--profile "\$\{\{ steps\.candidate_selection\.outputs\.release_profile \}\}"/,
  );
  const currentAttemptBinding = bridge.slice(
    bridge.indexOf("Bind the materialized bytes to the current-attempt selection"),
    bridge.indexOf("Prove live alias is the expected old-backend baseline"),
  );
  for (const field of [
    "ID",
    "DIGEST",
    "NAME",
    "PROFILE",
    "ARCHIVE",
    "TREE",
    "ARCHIVE_BYTES",
    "FILE_COUNT",
    "BYTE_COUNT",
    "SEAL",
    "PROVENANCE",
  ]) {
    const actual = ["ID", "DIGEST", "NAME"].includes(field) ? "RESOLVED" : "ACTUAL";
    assert.match(currentAttemptBinding, new RegExp(`test "\\$${actual}_${field}" = "\\$SELECTED_${field}"`));
  }
  const bridgeEvidence = bridge.slice(
    bridge.indexOf("Write immutable staging bridge evidence"),
    bridge.indexOf("Upload immutable staging bridge evidence"),
  );
  for (const binding of [
    /SOURCE_RUN_ID: \$\{\{ steps\.candidate_source\.outputs\.source_run_id \}\}/,
    /SOURCE_RUN_ATTEMPT: \$\{\{ steps\.candidate_source\.outputs\.source_run_attempt \}\}/,
    /SOURCE_ARTIFACT_ID: \$\{\{ steps\.candidate_source\.outputs\.artifact_id \}\}/,
    /SOURCE_ARTIFACT_DIGEST: \$\{\{ steps\.candidate_source\.outputs\.artifact_digest \}\}/,
    /SOURCE_ARTIFACT_NAME: \$\{\{ steps\.candidate_source\.outputs\.artifact_name \}\}/,
    /SOURCE_PROFILE_SHA256: \$\{\{ steps\.candidate_package\.outputs\.profile_sha256 \}\}/,
  ])
    assert.match(bridgeEvidence, binding);

  const deployResolve = deploy.slice(
    deploy.indexOf("Resolve the exact CI package attested by the staging bridge"),
    deploy.indexOf("Download the exact CI-sealed staging package"),
  );
  assert.match(deployResolve, /--run-id "\$\{\{ steps\.frontend_bridge\.outputs\.source_run_id \}\}"/);
  assert.match(
    deployResolve,
    /--run-attempt "\$\{\{ steps\.frontend_bridge\.outputs\.source_run_attempt \}\}"/,
  );
  assert.match(
    deployResolve,
    /RESOLVED_DIGEST: \$\{\{ steps\.frontend_source\.outputs\.artifact_digest \}\}/,
  );
  assert.match(
    deployResolve,
    /ATTESTED_DIGEST: \$\{\{ steps\.frontend_bridge\.outputs\.artifact_digest \}\}/,
  );
  assert.match(deployResolve, /test "\$RESOLVED_DIGEST" = "\$ATTESTED_DIGEST"/);
  const deployDownload = deploy.slice(
    deploy.indexOf("Download the exact CI-sealed staging package"),
    deploy.indexOf("Materialize and independently verify the exact candidate package"),
  );
  assert.match(deployDownload, /artifact-ids: \$\{\{ steps\.frontend_source\.outputs\.artifact_id \}\}/);
  assert.match(deployDownload, /run-id: \$\{\{ steps\.frontend_source\.outputs\.source_run_id \}\}/);
  assert.match(deployDownload, /digest-mismatch: error/);
  assert.match(deployDownload, /verify-staging-release-package\.mjs/);
  assert.match(deployDownload, /--package "\$RUNNER_TEMP\/g12-staging-release-package"/);
  assert.match(deployDownload, /--profile "\$\{\{ steps\.frontend_bridge\.outputs\.release_profile \}\}"/);
  const materialize = deploy.slice(
    deploy.indexOf("Materialize and independently verify the exact candidate package"),
    deploy.indexOf("Bind materialized bytes to bridge-v5 evidence"),
  );
  assert.equal((materialize.match(/verify-staging-frontend-package\.mjs/g) ?? []).length, 2);
  assert.equal(
    (materialize.match(/--package "\$RUNNER_TEMP\/g12-staging-release-package\/frontend"/g) ?? []).length,
    2,
  );
  assert.match(materialize, /--output \.\.\/candidate\/dist/);
  assert.match(materialize, /--output \.\.\/baseline\/dist/);
  assert.match(
    materialize,
    /cp .*staging-frontend-dist\.tar[\s\S]*\.\.\/baseline\/outputs\/staging-frontend-dist\.tar/,
  );
  assert.match(
    materialize,
    /cp .*staging-frontend-dist-seal\.json[\s\S]*\.\.\/baseline\/outputs\/staging-baseline-dist-seal\.json/,
  );
  const byteBinding = deploy.slice(
    deploy.indexOf("Bind materialized bytes to bridge-v5 evidence"),
    deploy.indexOf("Generate the exhaustive source-backed CMS coverage matrix"),
  );
  for (const field of ["ARCHIVE", "TREE", "PROFILE", "ARCHIVE_BYTES", "FILE_COUNT", "BYTE_COUNT"])
    assert.match(byteBinding, new RegExp(`test "\\$ACTUAL_${field}" = "\\$ATTESTED_${field}"`));

  for (const workflow of [bridge, deploy]) {
    assert.doesNotMatch(workflow, /npm run build:staging/);
    assert.doesNotMatch(workflow, /node scripts\/ev2\/phase12\/seal-production-dist\.mjs/);
  }
  assert.doesNotMatch(deploy, /--branch ev2-g17-canary/);
  assert.doesNotMatch(deploy, /deploy-sealed-staging-dist\.mjs/);
  assert.match(deploy, /Bind live staging identity to the frontend-only bridge deployment A/);
  assert.match(deploy, /test "\$LIVE_MARKER_B64" = "\$BRIDGE_MARKER_B64"/);
  assert.match(deploy, /Prove the exact bridge deployment remains canonical after backend mutation/);
  assert.match(deploy, /staging-pages-state\.mjs assert-original/);

  const recoveryUpload = deploy.slice(
    deploy.indexOf("Upload mandatory sealed staging recovery artifact"),
    deploy.indexOf("Revalidate the sealed recovery artifact before compatibility publication"),
  );
  assert.match(recoveryUpload, /baseline\/dist/);
  assert.match(recoveryUpload, /baseline\/outputs\/staging-frontend-dist\.tar/);
  assert.match(recoveryUpload, /baseline\/outputs\/staging-baseline-dist-seal\.json/);
  assert.match(recoveryUpload, /baseline\/outputs\/staging-frontend-provenance\.json/);
  assert.match(deploy, /--dist \.\.\/recovery\/dist/);
  assert.match(deploy, /--seal \.\.\/recovery\/outputs\/staging-baseline-dist-seal\.json/);

  assert.match(deploy, /EV2_DRAFT_V2_CANDIDATE: \$\{\{ inputs\.ev2_draft_v2_candidate \}\}/);
  assert.ok(deploy.includes('test "$EV2_DRAFT_V2_CANDIDATE" = false'));
  assert.match(deploy, /VITE_EV2_DRAFT_V2_CANDIDATE: "false"/);
  assert.doesNotMatch(deploy, /VITE_EV2_DRAFT_V2_CANDIDATE: \$\{\{ inputs\.ev2_draft_v2_candidate \}\}/);
});

test("the legacy public backend is swapped in under an exclusive lease and always restored", async () => {
  const workflow = await readFile(".github/workflows/promote-staging-frontend-bridge.yml", "utf8");

  // The legacy contract is pinned to the release production actually serves; it is never an input.
  assert.match(workflow, /LEGACY_PUBLIC_BACKEND_SHA: f48bb4530566456a0090a98cd39caf1cacb51b09/);
  assert.match(
    workflow,
    /ref: f48bb4530566456a0090a98cd39caf1cacb51b09,[\s\S]*fetch-depth: 0,[\s\S]*path: legacy,[\s\S]*persist-credentials: false/,
  );
  assert.match(workflow, /git merge-base --is-ancestor "\$LEGACY_PUBLIC_BACKEND_SHA"/);
  assert.match(workflow, /test "\$\(git -C \.\.\/legacy rev-parse HEAD\)" = "\$LEGACY_PUBLIC_BACKEND_SHA"/);

  const previewDeploy = workflow.indexOf("Deploy sealed A to isolated staging preview branch");
  const currentBackendProbe = workflow.indexOf(
    "Prove isolated A on the current staging backend before the legacy swap",
  );
  const prepare = workflow.indexOf("Plan the temporary legacy public backend swap without mutating anything");
  const lease = workflow.indexOf("Take the exclusive legacy backend lease before any swap");
  const engage = workflow.indexOf("Swap staging to the legacy public backend under the held lease");
  const previewConvergence = workflow.indexOf(
    "Bound convergence of the engaged legacy backend on isolated A",
  );
  const previewProbe = workflow.indexOf("Probe isolated A against the engaged legacy public backend");
  const previewFixture = workflow.indexOf("Setup isolated public bridge render fixture on old backend");
  const promote = workflow.indexOf("Promote exact A to canonical staging alias with CAS");
  const canonicalConvergence = workflow.indexOf("Bound convergence of canonical staging A on old backend");
  const canonicalProbe = workflow.indexOf("Probe canonical staging A on old backend");
  const canonicalFixture = workflow.indexOf("Setup canonical public bridge fixture");
  const canonicalHeadless = workflow.indexOf(
    "Headless-prove canonical render and fail-closed Turnstile boundary",
  );
  const baselineProbe = workflow.indexOf("Prove live alias is the expected old-backend baseline");
  const baselineCapture = workflow.indexOf(
    "Capture canonical staging state before any deployment or fixture",
  );
  const rebindProvenance = workflow.indexOf(
    "Authorize same-release rebind only from a compensation deployment",
  );
  const recoveryArm = workflow.indexOf(
    "Upload mandatory exact bridge recovery bytes before state or mutation",
  );
  const restore = workflow.indexOf("Restore the candidate public backend in every outcome");
  const canonicalCleanup = workflow.indexOf("Cleanup canonical fixture");
  const restoreEvidence = workflow.indexOf(
    "Upload mandatory legacy backend restore evidence before lease release",
  );
  const restoreEvidenceIdentity = workflow.indexOf(
    "Verify mandatory legacy backend restore artifact identity",
  );
  const release = workflow.indexOf("Release the legacy backend lease only after a proven restore");

  const baselineProbeBlock = workflow.slice(baselineProbe, baselineCapture);
  assert.match(baselineProbeBlock, /EV2_G12_SAMPLE_COUNT: "20"/);
  assert.match(baselineProbeBlock, /EV2_G12_WARMUP_SAMPLES_PER_ROUTE: "20"/);
  assert.match(baselineProbeBlock, /EV2_G12_REPORT_PATH: \.\.\/staging-bridge-baseline-probe\.json/);
  assert.match(
    baselineProbeBlock,
    /EV2_G12_DIAGNOSTICS_PATH: \.\.\/staging-bridge-baseline-diagnostics\.json/,
  );

  // Nothing mutates before the lease is held. The first full window against the newly deployed
  // legacy backend must pass on the isolated alias before a fixture or canonical publish can run.
  assert.ok(
    prepare >= 0 &&
      previewDeploy < currentBackendProbe &&
      currentBackendProbe < prepare &&
      prepare < lease &&
      lease < engage &&
      engage < previewConvergence &&
      previewConvergence < previewProbe &&
      previewProbe < previewFixture &&
      previewFixture < promote &&
      promote < canonicalConvergence &&
      canonicalConvergence < canonicalProbe &&
      canonicalProbe < canonicalFixture,
  );
  const currentBackendProbeBlock = workflow.slice(currentBackendProbe, prepare);
  assert.doesNotMatch(currentBackendProbeBlock, /continue-on-error/);
  assert.match(
    currentBackendProbeBlock,
    /EV2_G12_REPORT_PATH: \.\.\/staging-bridge-preview-current-backend-probe\.json/,
  );
  const previewConvergenceBlock = workflow.slice(previewConvergence, previewProbe);
  assert.match(previewConvergenceBlock, /id: preview_convergence/);
  assert.match(previewConvergenceBlock, /if: steps\.legacy_engage\.outcome == 'success'/);
  assert.match(previewConvergenceBlock, /continue-on-error: true/);
  assert.match(previewConvergenceBlock, /timeout-minutes: 20/);
  assert.match(previewConvergenceBlock, /maximum_attempts=3/);
  assert.match(previewConvergenceBlock, /for attempt in \$\(seq 1 "\$maximum_attempts"\); do/);
  assert.match(previewConvergenceBlock, /backoff_seconds=\$\(\(5 \* 2 \*\* \(attempt - 1\)\)\)/);
  assert.match(previewConvergenceBlock, /sleep "\$backoff_seconds" &\s+wait \$!/);
  assert.doesNotMatch(previewConvergenceBlock, /sleep 10/);
  assert.match(previewConvergenceBlock, /staging-bridge-preview-convergence-\$\{attempt\}\.json/);
  const previewProbeBlock = workflow.slice(previewProbe, previewFixture);
  assert.match(previewProbeBlock, /id: preview_probe/);
  assert.match(previewProbeBlock, /if: steps\.preview_convergence\.outcome == 'success'/);
  assert.match(previewProbeBlock, /continue-on-error: true/);
  assert.match(previewProbeBlock, /EV2_G12_SAMPLE_COUNT: "20"/);
  assert.match(previewProbeBlock, /EV2_G12_WARMUP_SAMPLES_PER_ROUTE: "20"/);
  assert.match(previewProbeBlock, /EV2_G12_REPORT_PATH: \.\.\/staging-bridge-preview-probe\.json/);
  assert.doesNotMatch(previewProbeBlock, /for attempt/);
  assert.match(workflow.slice(previewFixture, promote), /if: steps\.preview_probe\.outcome == 'success'/);
  const canonicalConvergenceBlock = workflow.slice(canonicalConvergence, canonicalProbe);
  assert.match(canonicalConvergenceBlock, /id: canonical_convergence/);
  assert.match(canonicalConvergenceBlock, /if: steps\.promote\.outcome == 'success'/);
  assert.match(canonicalConvergenceBlock, /continue-on-error: true/);
  assert.match(canonicalConvergenceBlock, /timeout-minutes: 20/);
  assert.match(canonicalConvergenceBlock, /maximum_attempts=3/);
  assert.match(canonicalConvergenceBlock, /for attempt in \$\(seq 1 "\$maximum_attempts"\); do/);
  assert.match(canonicalConvergenceBlock, /backoff_seconds=\$\(\(5 \* 2 \*\* \(attempt - 1\)\)\)/);
  assert.match(canonicalConvergenceBlock, /sleep "\$backoff_seconds" &\s+wait \$!/);
  assert.doesNotMatch(canonicalConvergenceBlock, /sleep 10/);
  assert.match(canonicalConvergenceBlock, /staging-bridge-canonical-convergence-\$\{attempt\}\.json/);
  const canonicalProbeBlock = workflow.slice(canonicalProbe, canonicalFixture);
  assert.match(canonicalProbeBlock, /id: canonical_probe/);
  assert.match(canonicalProbeBlock, /if: steps\.canonical_convergence\.outcome == 'success'/);
  assert.match(canonicalProbeBlock, /continue-on-error: true/);
  assert.match(canonicalProbeBlock, /EV2_G12_SAMPLE_COUNT: "20"/);
  assert.match(canonicalProbeBlock, /EV2_G12_WARMUP_SAMPLES_PER_ROUTE: "20"/);
  assert.match(canonicalProbeBlock, /EV2_G12_REPORT_PATH: \.\.\/staging-bridge-canonical-probe\.json/);
  assert.doesNotMatch(canonicalProbeBlock, /for attempt/);
  assert.ok(baselineCapture >= 0 && baselineCapture < rebindProvenance && rebindProvenance < recoveryArm);
  // The restore has to happen while the canonical fixture form still exists, so public-v2 can be proven.
  assert.ok(
    canonicalHeadless < restore &&
      restore < canonicalCleanup &&
      canonicalCleanup < restoreEvidence &&
      restoreEvidence < restoreEvidenceIdentity &&
      restoreEvidenceIdentity < release,
  );

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
  assert.match(workflow, /--preview-probe \.\.\/staging-bridge-preview-probe\.json --canonical-probe/);
  assert.match(workflow, /- name: Upload legacy public backend bridge reports\s+if: always\(\)/);
  assert.match(workflow, /^\s+staging-bridge-baseline-probe\.json$/m);
  assert.match(workflow, /^\s+staging-bridge-baseline-diagnostics\.json$/m);
  assert.match(workflow, /^\s+staging-bridge-preview-current-backend-probe\.json$/m);
  assert.match(workflow, /^\s+staging-bridge-preview-convergence-\*\.json$/m);
  assert.match(workflow, /^\s+staging-bridge-preview-probe\.json$/m);
  assert.match(workflow, /^\s+staging-bridge-canonical-convergence-\*\.json$/m);
  assert.match(workflow, /^\s+staging-bridge-canonical-probe\.json$/m);

  // A run that engaged the legacy backend without proving the candidate restore must fail without
  // overstating the remote state, and the lease is only released once the restore itself succeeded.
  assert.match(
    workflow,
    /The candidate public backend restore was not proven; the recovery lease remains armed\./,
  );
  assert.match(workflow, /if \[ "\$LEGACY_ENGAGE" = success \] && \[ "\$LEGACY_RESTORE" != success \]; then/);
  assert.match(
    workflow,
    /always\(\) && steps\.legacy_lease\.outcome == 'success' &&\s*\n\s*steps\.legacy_restore\.outcome == 'success'/,
  );
  assert.match(
    workflow,
    /id: legacy_restore_evidence_upload[\s\S]*candidate\/outputs\/staging-cms-public-legacy-restore\.json[\s\S]*if-no-files-found: error/,
  );
  assert.match(
    workflow,
    /steps\.legacy_restore_evidence_upload\.outcome == 'success' &&\s*steps\.legacy_restore_evidence_identity\.outcome == 'success'/,
  );
  assert.match(workflow, /test "\$LEGACY_RESTORE_EVIDENCE" = success/);
  assert.match(workflow, /test "\$LEGACY_RESTORE_EVIDENCE_IDENTITY" = success/);
  assert.match(workflow, /test "\$LEGACY_CLEAR" = success/);

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

test("only probes aimed at a freshly deployed frontend or backend wait for convergence", async () => {
  const workflow = await readFile(".github/workflows/promote-staging-frontend-bridge.yml", "utf8");

  // Both frontend aliases and the post-engage legacy backend probe measure bytes deployed seconds
  // earlier, so they may wait for convergence. The long-lived baseline keeps the default window and
  // still fails fast when it is genuinely unavailable.
  const readiness = [...workflow.matchAll(/EV2_G12_READINESS_ATTEMPTS: "(\d+)"/g)];
  assert.equal(readiness.length, 5);
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

  // The deploy job no longer republishes the canonical alias: only the isolated rollback canary is
  // freshly deployed here. The baseline, retained bridge and terminal probes must fail fast.
  assert.equal([...deployStaging.matchAll(/EV2_G12_READINESS_ATTEMPTS/g)].length, 1);
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

test("every staging probe warms the routes before it measures them", async () => {
  const files = [
    ".github/workflows/promote-staging-frontend-bridge.yml",
    ".github/workflows/deploy-staging.yml",
    ".github/workflows/deploy-staging-watchdog.yml",
  ];
  const guard = await readFile("scripts/ev2/phase12/release-guard-lib.mjs", "utf8");

  for (const file of files) {
    const workflow = await readFile(file, "utf8");
    const samples = [...workflow.matchAll(/EV2_G12_SAMPLE_COUNT: "(\d+)"/g)];
    const warmups = [...workflow.matchAll(/EV2_G12_WARMUP_SAMPLES_PER_ROUTE: "(\d+)"/g)];
    // Redeploying the function inventory leaves every public route cold, so a probe that measures
    // before warming reports a tail that says nothing about the release.
    assert.equal(warmups.length, samples.length, `${file} has an unwarmed probe`);
    // A faixa anterior, de 8 a 10, permitia medir mais do que se aquece, e foi assim que /produtos
    // reprovou com p50 de 417 ms e p95 de 1934 ms: parte da janela medida caiu em isolate frio.
    // A regra agora e aquecer pelo menos tanto quanto se mede, com um teto que continua fechado.
    for (const [index, [, warmup]] of warmups.entries()) {
      assert.ok(Number(warmup) >= Number(samples[index][1]), `${file} measures more than it warms`);
      assert.ok(Number(warmup) <= 40, `${file} warms beyond the bounded ceiling`);
    }
  }

  // Warming more must not become a way to assert less.
  assert.match(guard, /publicP95Ms: 1500/);
  assert.match(guard, /availabilityPercent: 99\.9/);
  assert.match(guard, /http5xxRatePercent: 0\.1/);
});

test("a lost bridge runner cannot leave the legacy public backend live on staging", async () => {
  const watchdog = await readFile(".github/workflows/promote-staging-frontend-bridge-watchdog.yml", "utf8");
  const restore = await readFile("scripts/qa/cms-public-legacy-bridge.mjs", "utf8");

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
  assert.match(
    job,
    /if \[ "\$STATE_PRESENT" = true \]; then[\s\S]*test "\$RESTORE" = success[\s\S]*test "\$RESTORE_EVIDENCE" = success[\s\S]*test "\$RESTORE_EVIDENCE_IDENTITY" = success[\s\S]*test "\$CLEAR" = success/,
  );
  assert.match(job, /test "\$RESTORE" = skipped/);
  assert.match(
    job,
    /id: legacy_restore_evidence_upload[\s\S]*if-no-files-found: error[\s\S]*id: legacy_restore_evidence_identity/,
  );
  assert.match(
    job,
    /steps\.legacy_restore\.outcome == 'success' &&\s*steps\.legacy_restore_evidence_upload\.outcome == 'success' &&\s*steps\.legacy_restore_evidence_identity\.outcome == 'success'/,
  );
  assert.equal(job.includes("chfuhctnhqgyjowkvllv"), false);
  // With no fixture artifact, the watchdog still proves the candidate contract from the public dataplane;
  // inventory/version advancement alone can never make restore exit successfully.
  assert.match(restore, /probePublicV2RestoreSentinelConvergence/);
  assert.match(restore, /endpoint\.searchParams\.set\("restoreProbe", String\(probeOrdinal\)\)/);
  assert.match(restore, /const restoreProven =\s*contractProbe === "public-v2"/);
  assert.match(restore, /if \(!restoreProven\) refuse\("PUBLIC_V2_CONTRACT_UNPROVEN"\)/);

  const programs = nodeHeredocs(watchdog);
  for (const [index, program] of programs.entries()) {
    const parsed = spawnSync(process.execPath, ["--check"], { input: program, encoding: "utf8" });
    assert.equal(parsed.status, 0, `watchdog inline Node ${index + 1}: ${parsed.stderr}`);
  }
});

test("bridge compensation publishes terminal evidence before clearing its durable recovery fence", async () => {
  const workflow = await readFile(".github/workflows/promote-staging-frontend-bridge.yml", "utf8");
  const recover = workflow.indexOf("Automatically restore old staging frontend on failure");
  const recheck = workflow.indexOf("Reconfirm compensated canonical staging before clearing recovery state");
  const probe = workflow.indexOf("Probe compensated canonical staging before clearing recovery state");
  const seal = workflow.indexOf("Seal non-sensitive automatic bridge compensation evidence");
  const upload = workflow.indexOf("Upload mandatory automatic bridge compensation evidence");
  const identity = workflow.indexOf("Verify automatic bridge compensation artifact identity");
  const clear = workflow.indexOf("Clear redundant recovery state only after success or proven compensation");
  assert.ok(recover < recheck && recheck < probe && probe < seal && seal < upload && upload < identity);
  assert.ok(identity < clear);
  const recoveryRegion = workflow.slice(recover, clear);
  assert.match(recoveryRegion, /staging-pages-state\.mjs assert-original/);
  assert.match(recoveryRegion, /rollout-probe\.mjs/);
  assert.match(recoveryRegion, /g12\.staging\.frontend_bridge\.compensation\.terminal/);
  assert.match(recoveryRegion, /stateSha256: sha256\(stateBytes\)/);
  assert.match(recoveryRegion, /probeSha256: sha256\(probeBytes\)/);
  assert.match(recoveryRegion, /if-no-files-found: error/);
  const clearBlock = workflow.slice(clear, workflow.indexOf("- name:", clear + 8));
  for (const required of [
    "recover_canonical_recheck",
    "recover_probe",
    "recover_evidence",
    "recover_evidence_upload",
    "recover_evidence_identity",
  ]) {
    assert.match(clearBlock, new RegExp(`steps\\.${required}\\.outcome == 'success'`));
  }
  for (const required of [
    "RECOVER_RECHECK",
    "RECOVER_PROBE",
    "RECOVER_EVIDENCE",
    "RECOVER_EVIDENCE_UPLOAD",
    "RECOVER_EVIDENCE_IDENTITY",
    "CLEAR_RECOVERY",
  ]) {
    assert.match(workflow, new RegExp(`test "\\$${required}" = success`));
  }
});
