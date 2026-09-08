import assert from "node:assert/strict";
import test from "node:test";

import {
  FRONTEND_BRIDGE_REPOSITORY,
  FRONTEND_BRIDGE_WORKFLOW_NAME,
  FRONTEND_BRIDGE_WORKFLOW_PATH,
  frontendBridgeCompensationMarker,
  frontendBridgeRunMarker,
  selectFrontendBridgeDistArtifact,
  selectFrontendBridgeArtifact,
  sha256Bytes,
  validateFrontendBridgeEvidence,
  validateFrontendBridgeGitHubRun,
  validateFrontendBridgeState,
} from "./production-frontend-bridge-lib.mjs";

const candidateSha = "a".repeat(40);
const baselineSha = "b".repeat(40);
const controlSha = "c".repeat(40);
const deploymentId = "123e4567-e89b-42d3-a456-426614174000";
const baselineDeploymentId = "123e4567-e89b-42d3-a456-426614174001";
const previewDeploymentId = "123e4567-e89b-42d3-a456-426614174002";
const now = new Date("2026-09-08T15:00:00.000Z");

function state() {
  return {
    schemaVersion: 2,
    event: "g12.production.frontend_bridge.prepared",
    repository: FRONTEND_BRIDGE_REPOSITORY,
    workflow: {
      name: FRONTEND_BRIDGE_WORKFLOW_NAME,
      path: FRONTEND_BRIDGE_WORKFLOW_PATH,
      runId: "731",
      runAttempt: 2,
      controlSha,
    },
    candidateSha,
    runMarker: "g12-production-bridge-run-731-2",
    compensationMarker: "g12-production-bridge-compensation-731-2",
    baseline: {
      deploymentId: baselineDeploymentId,
      release: baselineSha,
      createdOn: "2026-09-08T12:00:00.000Z",
      commitMessage: "previous-release",
    },
    approval: {
      record: `.github/release-controls/approvals/G12_${candidateSha}.json`,
      recordSha256: "d".repeat(64),
      changeReference: "G12-expand-contract-A",
    },
    dist: {
      candidateSha,
      archiveFile: "g12-production-frontend-bridge-dist.tar",
      archiveBytes: 2048,
      archiveSha256: "e".repeat(64),
      treeSha256: "f".repeat(64),
      fileCount: 12,
      byteCount: 1024,
    },
    predecessorDist: {
      candidateSha: baselineSha,
      archiveFile: "g12-production-frontend-bridge-predecessor-dist.tar",
      archiveBytes: 1024,
      archiveSha256: "6".repeat(64),
      treeSha256: "7".repeat(64),
      fileCount: 10,
      byteCount: 768,
    },
    backendMutation: "none",
  };
}

function evidence() {
  const summary = (deploymentOrigin, identity, binding) => ({
    contract: "legacy-f48",
    origin: "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev",
    deploymentOrigin,
    deploymentIdentitySha256: sha256Bytes(identity),
    fixtureBindingSha256: binding.repeat(64),
    reportSha256: "3".repeat(64),
    cleanupSha256: "4".repeat(64),
    residueSha256: "5".repeat(64),
    pageRendered: true,
    campaignRendered: true,
    formRendered: true,
    leadAccepted201: true,
    duplicateAccepted201: true,
    cleanupStatus: "cleaned",
    residueStatus: "passed",
    auditRetained: true,
  });
  return {
    ...state(),
    schemaVersion: 2,
    event: "g12.production.frontend_bridge.promoted",
    preview: {
      deploymentId: previewDeploymentId,
      release: candidateSha,
      createdOn: "2026-09-08T13:00:00.000Z",
    },
    production: {
      deploymentId,
      release: candidateSha,
      createdOn: "2026-09-08T14:00:00.000Z",
      commitMessage: "g12-production-bridge-run-731-2",
    },
    prerequisites: { stagingRunId: "700", backupRunId: "701", emailRunId: "702" },
    probes: { previewSha256: "1".repeat(64), productionSha256: "2".repeat(64) },
    stagingBridge: {
      runId: "700",
      runAttempt: 1,
      controlSha: "8".repeat(40),
      artifactId: "81",
      artifactDigest: `sha256:${"8".repeat(64)}`,
      evidenceSha256: "9".repeat(64),
      canonicalDeploymentId: previewDeploymentId,
      functional: summary("https://ev2-g17-canary.gaiatec-cms-staging.pages.dev", previewDeploymentId, "6"),
    },
    productionSafety: {
      mode: "read-only-old-backend",
      renderedRoutesPerDeployment: 4,
      leadSubmissions: 0,
      backendMutations: 0,
      previewProbeSha256: "1".repeat(64),
      productionProbeSha256: "2".repeat(64),
      previewReadOnlySha256: "a".repeat(64),
      productionReadOnlySha256: "b".repeat(64),
    },
    rollbackReady: true,
  };
}

test("bridge state and evidence bind exact frontend-only identities", () => {
  assert.equal(frontendBridgeRunMarker("731", 2), "g12-production-bridge-run-731-2");
  assert.equal(frontendBridgeCompensationMarker("731", 2), "g12-production-bridge-compensation-731-2");
  assert.deepEqual(
    validateFrontendBridgeState(state(), { runId: "731", runAttempt: 2, controlSha, candidateSha }),
    { valid: true, violations: [] },
  );
  assert.deepEqual(
    validateFrontendBridgeEvidence(evidence(), {
      runId: "731",
      runAttempt: 2,
      controlSha,
      candidateSha,
      deploymentId,
    }),
    { valid: true, violations: [] },
  );
});

test("bridge evidence fails closed on backend mutation, deployment drift or extra fields", () => {
  const backendMutation = { ...evidence(), backendMutation: "edge-functions" };
  assert.ok(
    validateFrontendBridgeEvidence(backendMutation).violations.includes("evidence_backend_mutation_invalid"),
  );
  const deploymentDrift = evidence();
  deploymentDrift.production = { ...deploymentDrift.production, deploymentId: baselineDeploymentId };
  assert.ok(
    validateFrontendBridgeEvidence(deploymentDrift, { deploymentId }).violations.includes(
      "evidence_production_invalid",
    ),
  );
  const extra = { ...evidence(), secret: "must-not-be-accepted" };
  assert.ok(validateFrontendBridgeEvidence(extra).violations.includes("evidence_schema_invalid"));

  const candidateBytes = state();
  candidateBytes.dist.archiveBytes += 1;
  candidateBytes.dist.archiveSha256 = "invalid";
  assert.ok(validateFrontendBridgeState(candidateBytes).violations.includes("state_dist_invalid"));

  const predecessorBytes = state();
  predecessorBytes.predecessorDist.candidateSha = candidateSha;
  assert.ok(
    validateFrontendBridgeState(predecessorBytes).violations.includes("state_predecessor_dist_invalid"),
  );

  const compensationMarker = state();
  compensationMarker.compensationMarker = "external-marker";
  assert.ok(
    validateFrontendBridgeState(compensationMarker).violations.includes("state_compensation_marker_invalid"),
  );
});

test("bridge GitHub run and artifact are exact, successful and immutable", () => {
  const run = {
    id: 731,
    run_attempt: 2,
    name: FRONTEND_BRIDGE_WORKFLOW_NAME,
    path: FRONTEND_BRIDGE_WORKFLOW_PATH,
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: controlSha,
    status: "completed",
    conclusion: "success",
    updated_at: "2026-09-08T14:30:00.000Z",
    actor: { login: "Vnd93" },
    repository: { full_name: FRONTEND_BRIDGE_REPOSITORY },
  };
  assert.deepEqual(
    validateFrontendBridgeGitHubRun({
      repository: FRONTEND_BRIDGE_REPOSITORY,
      run,
      runId: "731",
      expectedRelease: candidateSha,
      now,
    }),
    { valid: true, violations: [] },
  );
  const artifact = {
    id: 88,
    name: `production-frontend-bridge-${candidateSha}`,
    digest: `sha256:${"9".repeat(64)}`,
    size_in_bytes: 4096,
    expired: false,
    expires_at: "2026-12-01T00:00:00.000Z",
    archive_download_url: `https://api.github.com/repos/${FRONTEND_BRIDGE_REPOSITORY}/actions/artifacts/88/zip`,
    workflow_run: { id: 731, head_branch: "main", head_sha: controlSha },
  };
  assert.equal(
    selectFrontendBridgeArtifact({ artifacts: [artifact], run, expectedRelease: candidateSha, now }).valid,
    true,
  );
  const distArtifact = {
    ...artifact,
    id: 89,
    name: `production-frontend-bridge-dist-${candidateSha}`,
    archive_download_url: `https://api.github.com/repos/${FRONTEND_BRIDGE_REPOSITORY}/actions/artifacts/89/zip`,
  };
  assert.equal(
    selectFrontendBridgeDistArtifact({ artifacts: [distArtifact], run, expectedRelease: candidateSha, now })
      .valid,
    true,
  );
  assert.ok(
    validateFrontendBridgeGitHubRun({
      repository: FRONTEND_BRIDGE_REPOSITORY,
      run: { ...run, conclusion: "failure" },
      runId: "731",
      expectedRelease: candidateSha,
      now,
    }).violations.includes("run_not_successful"),
  );
  assert.ok(
    selectFrontendBridgeArtifact({
      artifacts: [artifact, { ...artifact, id: 89 }],
      run,
      expectedRelease: candidateSha,
      now,
    }).violations.includes("artifact_not_unique"),
  );
});
