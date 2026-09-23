import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  selectStagingBaselineSource,
  validateStagingBaselineBootstrapRecord,
  validateStagingBaselineBootstrapRemote,
} from "./staging-baseline-bootstrap-lib.mjs";

const record = JSON.parse(await readFile(".github/release-controls/staging-baseline-bootstrap.json", "utf8"));

function run(expected, { bridge, conclusion }) {
  return {
    id: Number(expected.runId),
    run_attempt: expected.runAttempt,
    name: bridge ? "Promote staging frontend bridge" : "Deploy staging",
    path: bridge
      ? ".github/workflows/promote-staging-frontend-bridge.yml"
      : ".github/workflows/deploy-staging.yml",
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: expected.controlSha,
    status: "completed",
    conclusion,
    actor: { login: "Vnd93" },
    triggering_actor: { login: "Vnd93" },
    repository: { full_name: "Vnd93/gaiatec-cms" },
  };
}

function artifact(expected) {
  return {
    id: Number(expected.artifactId),
    name: expected.artifactName,
    digest: expected.artifactDigest,
    expired: false,
    size_in_bytes: 4096,
    expires_at: "2030-01-01T00:00:00.000Z",
    workflow_run: { id: Number(expected.runId), head_sha: expected.controlSha },
  };
}

function remoteFixture() {
  return {
    record: structuredClone(record),
    bridgeRun: run(record.bridge, { bridge: true, conclusion: "success" }),
    bridgeArtifacts: [artifact(record.bridge)],
    sourceRun: run(record.source, { bridge: false, conclusion: "failure" }),
    sourceArtifacts: [artifact(record.source)],
    now: Date.parse("2026-09-22T12:00:00.000Z"),
  };
}

test("versioned staging baseline bootstrap record is exact and valid", () => {
  assert.deepEqual(validateStagingBaselineBootstrapRecord(record), { valid: true, violations: [] });
  for (const mutate of [
    (value) => (value.repository = "fork/repo"),
    (value) => (value.candidateSha = "f".repeat(40)),
    (value) => (value.canonical.deploymentId = "not-a-uuid"),
    (value) => (value.bridge.artifactDigest = "sha256:invalid"),
    (value) => (value.source.archiveFile = "other.tar"),
    (value) => (value.dist.archiveBytes = 0),
  ]) {
    const changed = structuredClone(record);
    mutate(changed);
    assert.equal(validateStagingBaselineBootstrapRecord(changed).valid, false);
  }
});

test("baseline source accepts only exact remotely verifiable producer identities", () => {
  assert.deepEqual(
    selectStagingBaselineSource({
      record,
      candidateSha: record.candidateSha,
      deployment: record.canonical,
    }),
    {
      valid: true,
      violations: [],
      mode: "bootstrap",
      trusted: false,
      requiresRemoteVerification: true,
      bridgeRunId: record.bridge.runId,
      bridgeRunAttempt: record.bridge.runAttempt,
    },
  );
  assert.deepEqual(
    selectStagingBaselineSource({
      record,
      candidateSha: record.candidateSha,
      deployment: {
        deploymentId: "00000000-0000-4000-8000-000000000002",
        createdOn: "2026-09-22T12:30:00.000Z",
        commitMessage: `g12-staging-deploy-compensation-${record.source.runId}-${record.source.runAttempt}`,
      },
    }),
    {
      valid: true,
      violations: [],
      mode: "legacy-bootstrap-compensation",
      trusted: false,
      requiresRemoteVerification: true,
      bridgeRunId: "",
      bridgeRunAttempt: 0,
      compensationRunId: record.source.runId,
      compensationRunAttempt: record.source.runAttempt,
    },
  );
  assert.deepEqual(
    selectStagingBaselineSource({
      record,
      candidateSha: "a".repeat(40),
      deployment: {
        deploymentId: "00000000-0000-4000-8000-000000000001",
        createdOn: "2026-09-22T12:00:00.000Z",
        commitMessage: "g12-staging-bridge-run-40000000000-2",
      },
    }),
    {
      valid: true,
      violations: [],
      mode: "bridge-v5",
      trusted: false,
      requiresRemoteVerification: true,
      bridgeRunId: "40000000000",
      bridgeRunAttempt: 2,
      compensationRunId: "",
      compensationRunAttempt: 0,
    },
  );
  for (const [marker, mode, runId, runAttempt] of [
    ["g12-staging-deploy-compensation-40000000001-3", "deploy-compensation", "40000000001", 3],
    ["g12-staging-bridge-compensation-40000000002-4", "bridge-compensation", "40000000002", 4],
  ]) {
    assert.deepEqual(
      selectStagingBaselineSource({
        record,
        candidateSha: "a".repeat(40),
        deployment: {
          deploymentId: "00000000-0000-4000-8000-000000000001",
          createdOn: "2026-09-22T12:00:00.000Z",
          commitMessage: marker,
        },
      }),
      {
        valid: true,
        violations: [],
        mode,
        trusted: false,
        requiresRemoteVerification: true,
        bridgeRunId: "",
        bridgeRunAttempt: 0,
        compensationRunId: runId,
        compensationRunAttempt: runAttempt,
      },
    );
  }
  assert.equal(
    selectStagingBaselineSource({
      record,
      candidateSha: record.candidateSha,
      deployment: { ...record.canonical, deploymentId: "00000000-0000-4000-8000-000000000001" },
    }).valid,
    true,
    "the exact SHA may later be re-bound only through a parseable bridge marker",
  );
  assert.equal(
    selectStagingBaselineSource({
      record,
      candidateSha: "a".repeat(40),
      deployment: { ...record.canonical, commitMessage: "external" },
    }).valid,
    false,
  );
  for (const changed of [
    {
      candidateSha: "a".repeat(40),
      marker: `g12-staging-deploy-compensation-${record.source.runId}-${record.source.runAttempt}`,
    },
    {
      candidateSha: record.candidateSha,
      marker: `g12-staging-deploy-compensation-${Number(record.source.runId) + 1}-${record.source.runAttempt}`,
    },
    {
      candidateSha: record.candidateSha,
      marker: `g12-staging-deploy-compensation-${record.source.runId}-${record.source.runAttempt + 1}`,
    },
    {
      candidateSha: record.candidateSha,
      marker: `g12-staging-bridge-compensation-${record.source.runId}-${record.source.runAttempt}`,
    },
  ]) {
    assert.notEqual(
      selectStagingBaselineSource({
        record,
        candidateSha: changed.candidateSha,
        deployment: {
          deploymentId: "00000000-0000-4000-8000-000000000003",
          createdOn: "2026-09-22T13:00:00.000Z",
          commitMessage: changed.marker,
        },
      }).mode,
      "legacy-bootstrap-compensation",
    );
  }
});

test("bootstrap remote tuple is fail-closed across both runs and artifacts", () => {
  assert.deepEqual(validateStagingBaselineBootstrapRemote(remoteFixture()), {
    valid: true,
    violations: [],
  });
  const cases = [
    ["bridge run conclusion", (value) => (value.bridgeRun.conclusion = "failure"), "bridge_run_invalid"],
    ["source run success", (value) => (value.sourceRun.conclusion = "success"), "source_run_invalid"],
    ["source workflow", (value) => (value.sourceRun.path = ".github/workflows/ci.yml"), "source_run_invalid"],
    ["actor", (value) => (value.bridgeRun.actor.login = "attacker"), "bridge_run_invalid"],
    [
      "duplicate bridge name",
      (value) => value.bridgeArtifacts.push(artifact(record.bridge)),
      "bridge_artifact_invalid",
    ],
    [
      "source digest",
      (value) => (value.sourceArtifacts[0].digest = "sha256:" + "0".repeat(64)),
      "source_artifact_invalid",
    ],
    ["expired source", (value) => (value.sourceArtifacts[0].expired = true), "source_artifact_invalid"],
    [
      "wrong head",
      (value) => (value.bridgeArtifacts[0].workflow_run.head_sha = "0".repeat(40)),
      "bridge_artifact_invalid",
    ],
  ];
  for (const [label, mutate, violation] of cases) {
    const fixture = remoteFixture();
    mutate(fixture);
    assert.ok(validateStagingBaselineBootstrapRemote(fixture).violations.includes(violation), label);
  }
});
