import assert from "node:assert/strict";
import test from "node:test";

import { PRODUCTION_FUNCTIONS } from "./production-backend-lib.mjs";
import {
  parseStagingCompensationMarker,
  selectStagingCompensationArtifacts,
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
