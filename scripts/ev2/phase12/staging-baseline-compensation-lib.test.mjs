import assert from "node:assert/strict";
import test from "node:test";

import { PRODUCTION_FUNCTIONS } from "./production-backend-lib.mjs";
import {
  parseStagingCompensationMarker,
  selectStagingCompensationArtifacts,
  validateStagingBridgeRerunArtifactLossFallback,
  validateStagingCompensationArtifactList,
  validateStagingCompensationRun,
  validateStagingCompensationState,
} from "./staging-baseline-compensation-lib.mjs";

const controlSha = "a".repeat(40);
const expectedRelease = "b".repeat(40);
const attemptedRelease = "c".repeat(40);
const runId = "40000000001";
const runAttempt = 3;
const now = Date.parse("2026-09-22T12:00:00.000Z");

function run(mode = "deploy-compensation") {
  return {
    id: Number(runId),
    run_attempt: runAttempt,
    name: mode === "deploy-compensation" ? "Deploy staging" : "Promote staging frontend bridge",
    path:
      mode === "deploy-compensation"
        ? ".github/workflows/deploy-staging.yml"
        : ".github/workflows/promote-staging-frontend-bridge.yml",
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: controlSha,
    status: "completed",
    conclusion: "failure",
    actor: { login: "Vnd93" },
    triggering_actor: { login: "Vnd93" },
    repository: { full_name: "Vnd93/gaiatec-cms" },
  };
}

function artifact(name, id) {
  return {
    id,
    name,
    digest: `sha256:${String(id).padStart(64, "0")}`,
    expired: false,
    size_in_bytes: 4096,
    expires_at: "2030-01-01T00:00:00.000Z",
    workflow_run: { id: Number(runId), head_sha: controlSha },
  };
}

const rerunCompensationSteps = [
  "Upload mandatory exact bridge recovery bytes before state or mutation",
  "Upload immutable bridge recovery state after binding exact baseline identity",
  "Download just-uploaded bridge recovery state by immutable artifact ID",
  "Download just-uploaded exact bridge recovery bytes by immutable artifact ID",
  "Reverify remote bridge state and exact recovery bytes before mutation",
  "Persist redundant HMAC bridge state only after remote recovery proof",
  "Promote exact A to canonical staging alias with CAS",
  "Restore the candidate public backend in every outcome",
  "Automatically restore old staging frontend on failure",
  "Reconfirm compensated canonical staging before clearing recovery state",
  "Probe compensated canonical staging before clearing recovery state",
  "Seal non-sensitive automatic bridge compensation evidence",
  "Upload mandatory automatic bridge compensation evidence",
  "Verify automatic bridge compensation artifact identity",
  "Clear redundant recovery state only after success or proven compensation",
  "Upload mandatory legacy backend restore evidence before lease release",
  "Verify mandatory legacy backend restore artifact identity",
  "Release the legacy backend lease only after a proven restore",
];

function completedStep(name, conclusion = "success") {
  return { name, status: "completed", conclusion };
}

function rerunFallbackFixture() {
  const markerRun = { ...run("bridge-compensation"), conclusion: "cancelled" };
  const currentRun = {
    ...run("bridge-compensation"),
    run_attempt: runAttempt + 1,
    conclusion: "failure",
  };
  const markerJobs = {
    total_count: 2,
    jobs: [
      {
        name: "promote",
        status: "completed",
        conclusion: "cancelled",
        steps: rerunCompensationSteps.map((name) => completedStep(name)),
      },
      { name: "pipeline-metrics", status: "completed", conclusion: "success", steps: [] },
    ],
  };
  const currentJobs = {
    total_count: 2,
    jobs: [
      {
        name: "promote",
        status: "completed",
        conclusion: "failure",
        steps: [
          completedStep("Resolve the exact failed run and immutable compensation artifacts", "failure"),
          completedStep("Persist redundant HMAC bridge state only after remote recovery proof", "skipped"),
        ],
      },
      { name: "pipeline-metrics", status: "completed", conclusion: "success", steps: [] },
    ],
  };
  return {
    record: {
      schemaVersion: 1,
      event: "g12.staging.baseline.bootstrap",
      repository: "Vnd93/gaiatec-cms",
      candidateSha: expectedRelease,
      canonical: {
        deploymentId: "00000000-0000-4000-8000-000000000010",
        createdOn: "2026-09-22T11:05:24.028Z",
        commitMessage: "g12-staging-bridge-run-30000000001-1",
      },
      bridge: {
        runId: "30000000001",
        runAttempt: 1,
        controlSha: expectedRelease,
        artifactId: "50000000001",
        artifactDigest: `sha256:${"1".repeat(64)}`,
        artifactName: `staging-frontend-bridge-${expectedRelease}`,
        evidenceSha256: "2".repeat(64),
      },
      source: {
        runId: "30000000002",
        runAttempt: 1,
        controlSha: expectedRelease,
        artifactId: "50000000002",
        artifactDigest: `sha256:${"3".repeat(64)}`,
        artifactName: `staging-candidate-${expectedRelease}-30000000002-1`,
        sealFile: "staging-candidate-dist-seal.json",
        archiveFile: "staging-candidate-dist.tar",
        sealSha256: "4".repeat(64),
      },
      dist: {
        archiveSha256: "5".repeat(64),
        treeSha256: "6".repeat(64),
        archiveBytes: 100,
        fileCount: 2,
        byteCount: 50,
      },
    },
    expectedRelease,
    artifacts: [artifact(`pipeline-duration-bridge-${controlSha}-${runId}-${runAttempt + 1}`, 90)],
    markerRun,
    currentRun,
    markerJobs,
    currentJobs,
    mode: "bridge-compensation",
    runId,
    runAttempt,
    repository: "Vnd93/gaiatec-cms",
  };
}

function state(mode = "deploy-compensation") {
  const bridge = mode === "bridge-compensation";
  if (!bridge)
    return {
      schemaVersion: 4,
      event: "g12.staging.deploy.prepared",
      workflow: { runId, attempt: runAttempt, controlSha },
      project: "gaiatec-cms-staging",
      branch: "ev2-g17-canary",
      markers: {
        run: `g12-staging-run-${runId}-${runAttempt}`,
        compensation: `g12-staging-deploy-compensation-${runId}-${runAttempt}`,
      },
      candidateRelease: attemptedRelease,
      browserRecovery: {
        environment: "staging",
        runTag: "QA-CMS-FINAL-20260922-cccccccc",
      },
      original: {
        deploymentId: "00000000-0000-4000-8000-000000000001",
        release: expectedRelease,
        createdOn: "2026-09-22T11:00:00.000Z",
        commitMessage: "g12-staging-bridge-run-39999999999-1",
      },
      source: {
        ciRunId: "39999999998",
        ciRunAttempt: 2,
        gateCiRunAttempt: 2,
        artifactId: "100",
        digest: `sha256:${"d".repeat(64)}`,
        name: `staging-frontend-${expectedRelease}-39999999998-2`,
        profileSha256: "e".repeat(64),
      },
      dist: {
        archiveSha256: "1".repeat(64),
        treeSha256: "2".repeat(64),
        archiveBytes: 100,
        fileCount: 2,
        byteCount: 50,
      },
      recoveryArtifact: {
        id: "101",
        digest: `sha256:${"f".repeat(64)}`,
        name: `staging-recovery-${runId}-${runAttempt}`,
      },
      environmentSnapshot: {
        file: "outputs/staging-remote-environment-snapshot.json",
        sha256: "3".repeat(64),
      },
      edgeBaseline: {
        manifestFile: "edge-baseline/manifest.json",
        manifestSha256: "4".repeat(64),
        inventorySha256: "5".repeat(64),
        functionCount: PRODUCTION_FUNCTIONS.length,
        aggregateBytes: 4096,
        aggregateRawEszipBytes: 8192,
      },
    };
  return {
    schemaVersion: 1,
    event: "g12.staging.deploy.prepared",
    workflow: { runId, runAttempt, controlSha },
    project: "gaiatec-cms-staging",
    branch: "ev2-g17-canary",
    runMarker: bridge
      ? `g12-staging-bridge-run-${runId}-${runAttempt}`
      : `g12-staging-run-${runId}-${runAttempt}`,
    compensationMarker: bridge
      ? `g12-staging-bridge-compensation-${runId}-${runAttempt}`
      : `g12-staging-deploy-compensation-${runId}-${runAttempt}`,
    candidateRelease: bridge ? "c".repeat(40) : expectedRelease,
    original: {
      deploymentId: "00000000-0000-4000-8000-000000000001",
      release: expectedRelease,
      createdOn: "2026-09-22T11:00:00.000Z",
      commitMessage: "g12-staging-bridge-run-39999999999-1",
    },
    recovery: {
      artifact: {
        id: "201",
        digest: `sha256:${"6".repeat(64)}`,
        name: `staging-frontend-bridge-recovery-${runId}-${runAttempt}`,
      },
      seal: {
        schemaVersion: 2,
        candidateSha: expectedRelease,
        fileCount: 2,
        byteCount: 50,
        treeSha256: "2".repeat(64),
        archiveFile: "staging-frontend-dist.tar",
        archiveBytes: 100,
        archiveSha256: "1".repeat(64),
      },
    },
  };
}

test("compensation markers are classified without treating the marker as trust", () => {
  assert.deepEqual(parseStagingCompensationMarker(`g12-staging-deploy-compensation-${runId}-3`), {
    valid: true,
    violations: [],
    mode: "deploy-compensation",
    runId,
    runAttempt,
  });
  assert.deepEqual(parseStagingCompensationMarker(`g12-staging-bridge-compensation-${runId}-3`), {
    valid: true,
    violations: [],
    mode: "bridge-compensation",
    runId,
    runAttempt,
  });
  for (const marker of [
    `g12-staging-rollback-compensation-${runId}-3`,
    `g12-staging-deploy-compensation-${runId}-0`,
    `g12-staging-deploy-compensation-${runId}-3-extra`,
  ])
    assert.equal(parseStagingCompensationMarker(marker).valid, false, marker);
});

test("compensation run validation binds repository workflow attempt actors and terminal failure", () => {
  for (const mode of ["deploy-compensation", "bridge-compensation"])
    assert.deepEqual(
      validateStagingCompensationRun({
        run: run(mode),
        mode,
        runId,
        runAttempt,
        repository: "Vnd93/gaiatec-cms",
      }),
      { valid: true, violations: [] },
    );
  const cases = [
    ["run id", (value) => (value.id = Number(runId) + 1)],
    ["attempt", (value) => (value.run_attempt = 4)],
    ["workflow", (value) => (value.path = ".github/workflows/ci.yml")],
    ["workflow name", (value) => (value.name = "CI")],
    ["event", (value) => (value.event = "push")],
    ["status", (value) => (value.status = "in_progress")],
    ["success", (value) => (value.conclusion = "success")],
    ["actor", (value) => (value.actor.login = "attacker")],
    ["triggering actor", (value) => (value.triggering_actor.login = "attacker")],
    ["head branch", (value) => (value.head_branch = "feature")],
    ["head sha", (value) => (value.head_sha = "invalid")],
    ["repository", (value) => (value.repository.full_name = "attacker/gaiatec-cms")],
  ];
  for (const [label, mutate] of cases) {
    const changed = run();
    mutate(changed);
    assert.equal(
      validateStagingCompensationRun({
        run: changed,
        mode: "deploy-compensation",
        runId,
        runAttempt,
        repository: "Vnd93/gaiatec-cms",
      }).valid,
      false,
      label,
    );
  }
});

test("compensation artifacts are unique, digest-bound, unexpired, and retained", () => {
  const deployRun = run();
  const stateName = `staging-deploy-state-${runId}-${runAttempt}`;
  const recoveryName = `staging-recovery-${runId}-${runAttempt}`;
  const artifacts = [artifact(stateName, 1), artifact(recoveryName, 2)];
  assert.equal(
    selectStagingCompensationArtifacts({
      artifacts,
      run: deployRun,
      mode: "deploy-compensation",
      runId,
      runAttempt,
      now,
    }).valid,
    true,
  );
  const cases = [
    ["duplicate", [...artifacts, artifact(recoveryName, 3)]],
    ["missing state", [artifacts[1]]],
    ["digest", [{ ...artifacts[0], digest: "bad" }, artifacts[1]]],
    ["wrong run", [artifacts[0], { ...artifacts[1], workflow_run: { id: 9, head_sha: controlSha } }]],
    [
      "wrong head",
      [artifacts[0], { ...artifacts[1], workflow_run: { id: Number(runId), head_sha: "b".repeat(40) } }],
    ],
    ["expired", [artifacts[0], { ...artifacts[1], expired: true }]],
    ["empty", [artifacts[0], { ...artifacts[1], size_in_bytes: 0 }]],
    ["invalid expiry", [artifacts[0], { ...artifacts[1], expires_at: "not-a-date" }]],
    ["insufficient retention", [artifacts[0], { ...artifacts[1], expires_at: "2026-09-23T12:00:00.000Z" }]],
  ];
  for (const [label, changed] of cases)
    assert.equal(
      selectStagingCompensationArtifacts({
        artifacts: changed,
        run: deployRun,
        mode: "deploy-compensation",
        runId,
        runAttempt,
        now,
      }).valid,
      false,
      label,
    );
});

test("compensation artifact absence is trusted only from a complete bounded listing", () => {
  const artifacts = [artifact("pipeline-duration", 1)];
  assert.deepEqual(validateStagingCompensationArtifactList({ total_count: 1, artifacts }), {
    valid: true,
    violations: [],
    artifacts,
  });
  for (const payload of [
    undefined,
    {},
    { total_count: "1", artifacts },
    { total_count: 2, artifacts },
    { total_count: 0, artifacts },
    { total_count: 101, artifacts: Array.from({ length: 101 }, (_, index) => ({ id: index + 1 })) },
  ])
    assert.equal(validateStagingCompensationArtifactList(payload).valid, false);
});

test("bridge compensation requires a unique separate state and recovery artifact pair", () => {
  const bridgeRun = run("bridge-compensation");
  const stateName = `staging-frontend-bridge-state-${runId}-${runAttempt}`;
  const recoveryName = `staging-frontend-bridge-recovery-${runId}-${runAttempt}`;
  const artifacts = [artifact(stateName, 11), artifact(recoveryName, 12)];
  const selected = selectStagingCompensationArtifacts({
    artifacts,
    run: bridgeRun,
    mode: "bridge-compensation",
    runId,
    runAttempt,
    now,
  });
  assert.equal(selected.valid, true);
  assert.equal(selected.stateArtifact.name, stateName);
  assert.equal(selected.recoveryArtifact.name, recoveryName);
  for (const changed of [[artifacts[1]], [artifacts[0]], [...artifacts, artifact(stateName, 13)]])
    assert.equal(
      selectStagingCompensationArtifacts({
        artifacts: changed,
        run: bridgeRun,
        mode: "bridge-compensation",
        runId,
        runAttempt,
        now,
      }).valid,
      false,
    );
});

test("bridge rerun artifact loss falls back only after exact compensation and pre-mutation failure proof", () => {
  const fixture = rerunFallbackFixture();
  assert.deepEqual(validateStagingBridgeRerunArtifactLossFallback(fixture), {
    valid: true,
    violations: [],
  });

  const cases = [
    ["release", (value) => (value.expectedRelease = attemptedRelease)],
    ["attempt chain", (value) => (value.currentRun.run_attempt += 1)],
    [
      "artifact still exists",
      (value) =>
        value.artifacts.push(artifact(`staging-frontend-bridge-recovery-${runId}-${runAttempt}`, 91)),
    ],
    [
      "compensation incomplete",
      (value) =>
        (value.markerJobs.jobs[0].steps.find(
          (entry) => entry.name === "Automatically restore old staging frontend on failure",
        ).conclusion = "failure"),
    ],
    [
      "rerun did not fail at resolver",
      (value) =>
        (value.currentJobs.jobs[0].steps.find(
          (entry) => entry.name === "Resolve the exact failed run and immutable compensation artifacts",
        ).conclusion = "success"),
    ],
    [
      "rerun crossed mutation boundary",
      (value) =>
        (value.currentJobs.jobs[0].steps.find(
          (entry) => entry.name === "Persist redundant HMAC bridge state only after remote recovery proof",
        ).conclusion = "success"),
    ],
  ];
  for (const [label, mutate] of cases) {
    const changed = structuredClone(rerunFallbackFixture());
    mutate(changed);
    assert.equal(validateStagingBridgeRerunArtifactLossFallback(changed).valid, false, label);
  }
});

test("rerun artifact-loss fallback is unavailable to deploy compensation", () => {
  const fixture = rerunFallbackFixture();
  fixture.mode = "deploy-compensation";
  assert.deepEqual(validateStagingBridgeRerunArtifactLossFallback(fixture), {
    valid: false,
    violations: ["fallback_mode_invalid"],
  });
});

test("compensation state is bound to exact run, marker, control SHA, and original release", () => {
  for (const mode of ["deploy-compensation", "bridge-compensation"])
    assert.deepEqual(
      validateStagingCompensationState({
        state: state(mode),
        mode,
        runId,
        runAttempt,
        controlSha,
        expectedRelease,
      }),
      { valid: true, violations: [] },
    );
  const cases = [
    ["extra key", (value) => (value.untrusted = true)],
    ["run", (value) => (value.workflow.runId = "9")],
    ["control", (value) => (value.workflow.controlSha = "c".repeat(40))],
    ["marker", (value) => (value.markers.compensation = "g12-staging-deploy-compensation-9-1")],
    ["release", (value) => (value.original.release = "c".repeat(40))],
    ["candidate", (value) => (value.candidateRelease = "invalid")],
  ];
  for (const [label, mutate] of cases) {
    const changed = state();
    mutate(changed);
    assert.equal(
      validateStagingCompensationState({
        state: changed,
        mode: "deploy-compensation",
        runId,
        runAttempt,
        controlSha,
        expectedRelease,
      }).valid,
      false,
      label,
    );
  }
});

test("bridge compensation state rejects malformed or ambiguous recovery bindings", () => {
  const cases = [
    ["missing recovery", (value) => delete value.recovery],
    ["extra recovery key", (value) => (value.recovery.untrusted = true)],
    ["missing artifact", (value) => delete value.recovery.artifact],
    ["extra artifact key", (value) => (value.recovery.artifact.untrusted = true)],
    ["invalid artifact id", (value) => (value.recovery.artifact.id = "0")],
    ["invalid artifact digest", (value) => (value.recovery.artifact.digest = "sha256:bad")],
    ["wrong artifact name", (value) => (value.recovery.artifact.name = "other")],
    ["missing seal", (value) => delete value.recovery.seal],
    ["extra seal key", (value) => (value.recovery.seal.untrusted = true)],
    ["invalid seal archive", (value) => (value.recovery.seal.archiveFile = "other.tar")],
    ["invalid seal digest", (value) => (value.recovery.seal.archiveSha256 = "bad")],
  ];
  for (const [label, mutate] of cases) {
    const changed = state("bridge-compensation");
    mutate(changed);
    const result = validateStagingCompensationState({
      state: changed,
      mode: "bridge-compensation",
      runId,
      runAttempt,
      controlSha,
      expectedRelease,
    });
    assert.equal(result.valid, false, label);
    assert.ok(result.violations.includes("state_recovery_invalid"), label);
  }
});

test("modern deploy compensation keeps rejecting the legacy v1 deploy state", () => {
  const legacy = state("bridge-compensation");
  legacy.runMarker = `g12-staging-run-${runId}-${runAttempt}`;
  legacy.compensationMarker = `g12-staging-deploy-compensation-${runId}-${runAttempt}`;
  legacy.candidateRelease = expectedRelease;
  assert.equal(
    validateStagingCompensationState({
      state: legacy,
      mode: "deploy-compensation",
      runId,
      runAttempt,
      controlSha,
      expectedRelease,
    }).valid,
    false,
  );
});
